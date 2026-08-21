import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  userId: z.string()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId: operatorTmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  // 校验操作者必须是当前 owner（role 字段虽 deprecated 但仍用于判断 owner 身份）
  const currentOwnerTmb = await MongoTeamMember.findOne({
    _id: new Types.ObjectId(operatorTmbId),
    teamId: new Types.ObjectId(teamId),
    role: TeamMemberRoleEnum.owner
  }).lean();

  if (!currentOwnerTmb) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  // 找到新 owner 的 tmbId（active 状态才可接任）
  const newOwnerTmb = await MongoTeamMember.findOne({
    teamId: new Types.ObjectId(teamId),
    userId: new Types.ObjectId(body.userId),
    status: TeamMemberStatusEnum.active
  }).lean();

  if (!newOwnerTmb) return Promise.reject(TeamErrEnum.notUser);

  const newOwnerTmbId = String(newOwnerTmb._id);

  await mongoSessionRun(async (session) => {
    // 1. 旧 owner 去掉 role（unset，不再是 owner）
    await MongoTeamMember.updateOne(
      { _id: new Types.ObjectId(operatorTmbId) },
      { $unset: { role: 1 } },
      { session }
    );

    // 2. 新 owner 设置 role = owner
    await MongoTeamMember.updateOne(
      { _id: new Types.ObjectId(newOwnerTmbId) },
      { $set: { role: TeamMemberRoleEnum.owner } },
      { session }
    );

    // 3. 更新 MongoTeam.ownerId
    await MongoTeam.updateOne(
      { _id: new Types.ObjectId(teamId) },
      { $set: { ownerId: new Types.ObjectId(body.userId) } },
      { session }
    );

    // 4. 迁移 OwnerRoleVal 的团队级资源权限记录：从旧 tmbId → 新 tmbId
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.team,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(newOwnerTmbId)
      },
      { session }
    );

    await MongoResourcePermission.updateMany(
      {
        resourceType: PerResourceTypeEnum.team,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(operatorTmbId),
        permission: OwnerRoleVal
      },
      { $set: { tmbId: new Types.ObjectId(newOwnerTmbId) } },
      { session }
    );
  });
}

export default NextAPI(handler);
