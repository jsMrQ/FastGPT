import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const QuerySchema = z.object({
  groupId: z.string().min(1)
});

/**
 * DELETE /proApi/support/user/team/group/delete
 * 删除成员组及其成员关联记录。
 * 禁止删除默认组（DefaultGroupName）。
 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const group = await MongoMemberGroupModel.findOne({
    _id: new Types.ObjectId(query.groupId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!group) return Promise.reject(TeamErrEnum.groupNotExist);
  if (group.name === DefaultGroupName) return Promise.reject(TeamErrEnum.cannotDeleteDefaultGroup);

  await mongoSessionRun(async (session) => {
    await MongoMemberGroupModel.deleteOne({ _id: group._id }, { session });
    await MongoGroupMemberModel.deleteMany({ groupId: group._id }, { session });
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.DELETE_GROUP,
    params: { groupName: group.name }
  });
}

export default NextAPI(handler);
