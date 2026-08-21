import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { validateActiveTmbIds } from '@fastgpt/service/support/user/team/enterpriseMember';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const BodySchema = z.object({
  groupId: z.string().min(1),
  tmbId: z.string().min(1)
});

/**
 * PUT /proApi/support/user/team/group/changeOwner
 * 转让成员组 owner 角色给指定成员。
 * 原 owner 降级为 admin，新 owner 升级为 owner。
 * 若新 owner 不在组内，则先加入再升级。
 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const group = await MongoMemberGroupModel.findOne({
    _id: new Types.ObjectId(body.groupId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!group) return Promise.reject(TeamErrEnum.groupNotExist);

  await validateActiveTmbIds({ teamId, tmbIds: [body.tmbId] });

  await mongoSessionRun(async (session) => {
    // 将原 owner 全部降为 admin
    await MongoGroupMemberModel.updateMany(
      { groupId: group._id, role: GroupMemberRole.owner },
      { $set: { role: GroupMemberRole.admin } },
      { session }
    );

    const newOwnerTmbId = new Types.ObjectId(body.tmbId);

    // 若新 owner 已在组内，直接更新角色；否则新增记录
    const existing = await MongoGroupMemberModel.findOne(
      { groupId: group._id, tmbId: newOwnerTmbId },
      undefined,
      { session }
    );

    if (existing) {
      await MongoGroupMemberModel.updateOne(
        { _id: existing._id },
        { $set: { role: GroupMemberRole.owner } },
        { session }
      );
    } else {
      await MongoGroupMemberModel.create(
        [{ groupId: group._id, tmbId: newOwnerTmbId, role: GroupMemberRole.owner }],
        { session }
      );
    }
  });
}

export default NextAPI(handler);
