import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { validateActiveTmbIds } from '@fastgpt/service/support/user/team/enterpriseMember';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  orgId: z.string().optional(),
  members: z.array(z.object({ tmbId: z.string() }))
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  // 找目标 org
  let orgId: string;
  if (body.orgId) {
    const org = await MongoOrgModel.findOne({
      _id: new Types.ObjectId(body.orgId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!org) return Promise.reject(TeamErrEnum.orgNotExist);
    orgId = body.orgId;
  } else {
    // 未指定 orgId 时操作 ROOT 部门
    const root = await MongoOrgModel.findOne({
      teamId: new Types.ObjectId(teamId),
      path: ''
    }).lean();
    if (!root) return Promise.reject(TeamErrEnum.orgNotExist);
    orgId = String(root._id);
  }

  const newTmbIds = body.members.map((m) => m.tmbId);

  // 校验所有 tmbId 属于团队且 active
  await validateActiveTmbIds({ teamId, tmbIds: newTmbIds });

  await mongoSessionRun(async (session) => {
    // 获取当前成员列表
    const currentMembers = await MongoOrgMemberModel.find(
      { teamId: new Types.ObjectId(teamId), orgId: new Types.ObjectId(orgId) },
      'tmbId',
      { session }
    ).lean();

    const currentTmbIdSet = new Set(currentMembers.map((m) => String(m.tmbId)));
    const newTmbIdSet = new Set(newTmbIds);

    // 需要删除的成员
    const toDelete = currentMembers
      .filter((m) => !newTmbIdSet.has(String(m.tmbId)))
      .map((m) => m.tmbId);

    // 需要新增的成员
    const toAdd = newTmbIds.filter((id) => !currentTmbIdSet.has(id));

    if (toDelete.length > 0) {
      await MongoOrgMemberModel.deleteMany(
        {
          teamId: new Types.ObjectId(teamId),
          orgId: new Types.ObjectId(orgId),
          tmbId: { $in: toDelete.map((id) => new Types.ObjectId(String(id))) }
        },
        { session }
      );
    }

    if (toAdd.length > 0) {
      await MongoOrgMemberModel.insertMany(
        toAdd.map((tmbId) => ({
          teamId: new Types.ObjectId(teamId),
          orgId: new Types.ObjectId(orgId),
          tmbId: new Types.ObjectId(tmbId)
        })),
        { session }
      );
    }
  });
}

export default NextAPI(handler);
