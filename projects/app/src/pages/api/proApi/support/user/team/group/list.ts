import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import type { MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';

const BodySchema = z.object({
  searchKey: z.string().optional(),
  withMembers: z.boolean().optional()
});

/**
 * POST /proApi/support/user/team/group/list
 * 查询当前团队的所有成员组列表，可选携带成员详情。
 * ReadPermissionVal 鉴权，以便权限选择器等低权限场景也可调用。
 */
async function handler(req: ApiRequestProps): Promise<MemberGroupListItemType<any>[]> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  const query: Record<string, any> = { teamId: new Types.ObjectId(teamId) };
  if (body.searchKey?.trim()) {
    query.name = { $regex: body.searchKey.trim(), $options: 'i' };
  }

  const groups = await MongoMemberGroupModel.find(query).sort({ updateTime: -1 }).lean();

  if (!body.withMembers) {
    return groups.map((g) => ({
      _id: String(g._id),
      teamId: String(g.teamId),
      name: g.name,
      avatar: g.avatar ?? '',
      updateTime: g.updateTime,
      members: undefined,
      count: undefined,
      owner: undefined,
      permission: undefined
    }));
  }

  const groupIds = groups.map((g) => g._id);

  // 批量查询所有 group 的成员记录
  const allGroupMembers = await MongoGroupMemberModel.find({
    groupId: { $in: groupIds }
  }).lean();

  // 收集所有 tmbId，一次性查询 member 信息
  const allTmbIds = [...new Set(allGroupMembers.map((gm) => String(gm.tmbId)))];
  const memberInfoList =
    allTmbIds.length > 0
      ? await MongoTeamMember.find(
          { _id: { $in: allTmbIds.map((id) => new Types.ObjectId(id)) } },
          'name avatar'
        ).lean()
      : [];
  const tmbInfoMap = new Map(memberInfoList.map((m) => [String(m._id), m]));

  // 按 groupId 分组
  const groupMembersMap = new Map<string, typeof allGroupMembers>();
  for (const gm of allGroupMembers) {
    const key = String(gm.groupId);
    const existing = groupMembersMap.get(key) ?? [];
    existing.push(gm);
    groupMembersMap.set(key, existing);
  }

  return groups.map((g) => {
    const groupIdStr = String(g._id);
    const members = groupMembersMap.get(groupIdStr) ?? [];

    const memberItems = members.map((gm) => {
      const info = tmbInfoMap.get(String(gm.tmbId));
      return {
        tmbId: String(gm.tmbId),
        name: info?.name ?? '',
        avatar: info?.avatar ?? ''
      };
    });

    const ownerEntry = members.find((gm) => gm.role === GroupMemberRole.owner);
    const ownerInfo = ownerEntry ? tmbInfoMap.get(String(ownerEntry.tmbId)) : undefined;
    const owner = ownerInfo
      ? {
          tmbId: String(ownerEntry!.tmbId),
          name: ownerInfo.name,
          avatar: ownerInfo.avatar ?? ''
        }
      : undefined;

    // 当前用户在该组的角色：owner → hasManagePer；其余 → 默认读权限
    const currentUserEntry = members.find((gm) => String(gm.tmbId) === tmbId);
    const isGroupOwner = currentUserEntry?.role === GroupMemberRole.owner;
    const permission = new TeamPermission({ isOwner: isGroupOwner });

    return {
      _id: groupIdStr,
      teamId: String(g.teamId),
      name: g.name,
      avatar: g.avatar ?? '',
      updateTime: g.updateTime,
      members: memberItems,
      count: memberItems.length,
      owner,
      permission
    };
  });
}

export default NextAPI(handler);
