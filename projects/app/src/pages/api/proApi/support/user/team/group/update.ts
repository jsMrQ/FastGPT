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
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const BodySchema = z.object({
  groupId: z.string().min(1),
  name: z.string().optional(),
  avatar: z.string().optional(),
  memberList: z
    .array(
      z.object({
        tmbId: z.string(),
        role: z.enum([GroupMemberRole.owner, GroupMemberRole.admin, GroupMemberRole.member])
      })
    )
    .optional()
});

/**
 * PUT /proApi/support/user/team/group/update
 * 更新成员组信息（名称、头像）或完整替换成员列表。
 * 若传入 memberList，则以该列表完整替换现有成员记录（保证 owner 存在）。
 */
async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const group = await MongoMemberGroupModel.findOne({
    _id: new Types.ObjectId(body.groupId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!group) return Promise.reject(TeamErrEnum.groupNotExist);

  if (body.memberList) {
    const tmbIds = body.memberList.map((m) => m.tmbId);
    if (tmbIds.length > 0) {
      await validateActiveTmbIds({ teamId, tmbIds });
    }
  }

  await mongoSessionRun(async (session) => {
    const updateFields: Record<string, any> = {};
    // 允许修改名称，但不允许改为 DefaultGroupName
    if (body.name !== undefined) {
      if (body.name === DefaultGroupName) {
        return Promise.reject(TeamErrEnum.cannotDeleteDefaultGroup);
      }
      updateFields.name = body.name;
    }
    if (body.avatar !== undefined) {
      updateFields.avatar = body.avatar;
    }

    if (Object.keys(updateFields).length > 0) {
      await MongoMemberGroupModel.updateOne(
        { _id: group._id },
        { $set: updateFields },
        { session }
      );
    }

    if (body.memberList) {
      // 完整替换成员列表
      await MongoGroupMemberModel.deleteMany({ groupId: group._id }, { session });
      if (body.memberList.length > 0) {
        await MongoGroupMemberModel.insertMany(
          body.memberList.map((m) => ({
            groupId: group._id,
            tmbId: new Types.ObjectId(m.tmbId),
            role: m.role
          })),
          { session }
        );
      }
    }
  });
}

export default NextAPI(handler);
