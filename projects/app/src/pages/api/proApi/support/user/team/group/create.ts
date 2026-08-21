import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { validateActiveTmbIds } from '@fastgpt/service/support/user/team/enterpriseMember';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const BodySchema = z.object({
  name: z.string().min(1),
  avatar: z.string().optional(),
  memberIdList: z.array(z.string()).optional()
});

/**
 * POST /proApi/support/user/team/group/create
 * 创建成员组，创建者自动成为 owner。
 * 禁止使用保留名 DefaultGroupName。
 */
async function handler(req: ApiRequestProps): Promise<{ groupId: string }> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  if (body.name === DefaultGroupName) {
    return Promise.reject(TeamErrEnum.cannotDeleteDefaultGroup);
  }

  const memberIdList = body.memberIdList ?? [];
  if (memberIdList.length > 0) {
    await validateActiveTmbIds({ teamId, tmbIds: memberIdList });
  }

  let groupId: string = '';

  await mongoSessionRun(async (session) => {
    const [group] = await MongoMemberGroupModel.create(
      [
        {
          teamId: new Types.ObjectId(teamId),
          name: body.name,
          avatar: body.avatar
        }
      ],
      { session }
    );
    groupId = String(group._id);

    // 构建成员列表：创建者为 owner，其余为 member
    const otherMemberIds = memberIdList.filter((id) => id !== tmbId);
    const groupMembers = [
      { groupId: group._id, tmbId: new Types.ObjectId(tmbId), role: GroupMemberRole.owner },
      ...otherMemberIds.map((id) => ({
        groupId: group._id,
        tmbId: new Types.ObjectId(id),
        role: GroupMemberRole.member
      }))
    ];

    await MongoGroupMemberModel.insertMany(groupMembers, { session });
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.CREATE_GROUP,
    params: { groupName: body.name }
  });

  return { groupId };
}

export default NextAPI(handler);
