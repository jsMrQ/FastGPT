import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import type { SearchResult } from '@fastgpt/global/support/user/api';

/**
 * 将查询参数字符串 "false" 转为布尔 false，其余均视为 true
 */
const boolOrUndefined = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === 'false' || v === false) return false;
    return true;
  });

const QuerySchema = z.object({
  searchKey: z.string().optional(),
  members: boolOrUndefined,
  orgs: boolOrUndefined,
  groups: boolOrUndefined
});

/**
 * GET /proApi/support/user/search
 * 跨维度搜索：团队成员 / 部门 / 成员组。
 * 由权限管理弹窗调用，鉴权降为 ReadPermissionVal 以支持所有协作者查看。
 * searchKey 为空时直接返回空数组，避免大量数据传输。
 */
async function handler(req: ApiRequestProps): Promise<SearchResult> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  const searchKey = query.searchKey?.trim() ?? '';
  const searchMembers = query.members !== false;
  const searchOrgs = query.orgs !== false;
  const searchGroups = query.groups !== false;

  // searchKey 为空时返回空结果，避免全量数据拉取
  if (!searchKey) {
    return { members: [], orgs: [], groups: [] };
  }

  const regex = { $regex: searchKey, $options: 'i' };

  const [members, orgs, groups] = await Promise.all([
    searchMembers
      ? MongoTeamMember.find(
          {
            teamId: new Types.ObjectId(teamId),
            name: regex,
            status: TeamMemberStatusEnum.active
          },
          'userId name avatar role status createTime updateTime'
        )
          .limit(20)
          .lean()
      : Promise.resolve([]),
    searchOrgs
      ? MongoOrgModel.find(
          {
            teamId: new Types.ObjectId(teamId),
            name: regex,
            // 排除 path='' 的 ROOT 部门（其为虚拟根节点）
            path: { $ne: '' }
          },
          '_id teamId pathId path name avatar description updateTime'
        )
          .limit(20)
          .lean()
      : Promise.resolve([]),
    searchGroups
      ? MongoMemberGroupModel.find(
          {
            teamId: new Types.ObjectId(teamId),
            name: regex
          },
          '_id teamId name avatar updateTime'
        )
          .limit(20)
          .lean()
      : Promise.resolve([])
  ]);

  return {
    members: members.map((m) => ({
      userId: String(m.userId),
      tmbId: String(m._id),
      memberName: m.name,
      avatar: m.avatar,
      role: m.role as any,
      status: m.status as any,
      createTime: m.createTime,
      updateTime: m.updateTime
    })),
    orgs: orgs.map((o) => ({
      _id: String(o._id),
      teamId: String(o.teamId),
      pathId: o.pathId,
      path: o.path,
      name: o.name,
      avatar: o.avatar ?? '',
      description: o.description,
      updateTime: o.updateTime,
      total: 0
    })),
    groups: groups.map((g) => ({
      _id: String(g._id),
      teamId: String(g.teamId),
      name: g.name,
      avatar: g.avatar ?? '',
      updateTime: g.updateTime
    }))
  };
}

export default NextAPI(handler);
