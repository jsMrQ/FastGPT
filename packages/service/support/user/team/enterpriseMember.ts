import { type ClientSession, Types } from '../../../common/mongo';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoResourcePermission } from '../../permission/schema';
import { MongoOrgMemberModel } from '../../permission/org/orgMemberSchema';
import { MongoGroupMemberModel } from '../../permission/memberGroup/groupMemberSchema';
import { MongoOrgModel } from '../../permission/org/orgSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { delUserAllSession } from '../session';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbPermission } from '../../permission/controller';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

/**
 * 软删除团队成员：将状态置为 leave，并在同一事务中清理其所有资源权限、
 * 组织成员、成员组关联，最后删除其所有 session（事务外执行，失败不影响主流程）。
 *
 * @param teamId  当前团队 ID
 * @param tmbId   要删除的成员 ID
 * @param userId  成员对应的 userId（用于清理 session）
 * @param session 可选外部事务 session；未传入时自动开启事务
 */
export async function softRemoveTeamMember({
  teamId,
  tmbId,
  userId,
  session
}: {
  teamId: string;
  tmbId: string;
  userId: string;
  session?: ClientSession;
}) {
  const run = async (sess: ClientSession) => {
    // 1. 软删除：状态置为 leave
    await MongoTeamMember.updateOne(
      { _id: new Types.ObjectId(tmbId), teamId: new Types.ObjectId(teamId) },
      { $set: { status: TeamMemberStatusEnum.leave } },
      { session: sess }
    );

    // 2. 清理该成员的所有资源权限记录
    await MongoResourcePermission.deleteMany(
      { teamId: new Types.ObjectId(teamId), tmbId: new Types.ObjectId(tmbId) },
      { session: sess }
    );

    // 3. 清理该成员在所有部门中的记录
    await MongoOrgMemberModel.deleteMany(
      { teamId: new Types.ObjectId(teamId), tmbId: new Types.ObjectId(tmbId) },
      { session: sess }
    );

    // 4. 清理该成员在所有成员组中的记录
    await MongoGroupMemberModel.deleteMany({ tmbId: new Types.ObjectId(tmbId) }, { session: sess });
  };

  if (session) {
    await run(session);
  } else {
    await mongoSessionRun(run);
  }

  // 5. 删除 session（事务外，失败不影响主流程）
  void delUserAllSession(userId);
}

/**
 * 查询指定团队成员列表，支持分页与多维度过滤。
 * 可选携带权限信息（withPermission）和所属部门路径（withOrgs）。
 *
 * @param teamId        团队 ID
 * @param teamName      团队名称（用于构造部门路径字符串）
 * @param offset        分页偏移量
 * @param pageSize      每页条数
 * @param status        过滤状态（active/leave/forbidden）
 * @param searchKey     按成员显示名模糊搜索
 * @param orgId         按部门过滤（直接成员）
 * @param groupId       按成员组过滤
 * @param withPermission 是否携带团队权限对象
 * @param withOrgs      是否携带所属部门路径
 */
export async function listTeamMembers({
  teamId,
  teamName,
  offset,
  pageSize,
  status,
  searchKey,
  orgId,
  groupId,
  withPermission,
  withOrgs
}: {
  teamId: string;
  teamName: string;
  offset: number;
  pageSize: number;
  status?: string;
  searchKey?: string;
  orgId?: string;
  groupId?: string;
  withPermission?: boolean;
  withOrgs?: boolean;
}): Promise<{ total: number; list: TeamMemberItemType[] }> {
  // 先收集过滤条件中的 tmbId 集合（orgId/groupId 过滤）
  let filterTmbIds: string[] | undefined;

  if (orgId) {
    const orgMembers = await MongoOrgMemberModel.find(
      { teamId: new Types.ObjectId(teamId), orgId: new Types.ObjectId(orgId) },
      'tmbId'
    ).lean();
    filterTmbIds = orgMembers.map((m) => String(m.tmbId));
    if (filterTmbIds.length === 0) return { total: 0, list: [] };
  } else if (groupId) {
    const groupMembers = await MongoGroupMemberModel.find(
      { groupId: new Types.ObjectId(groupId) },
      'tmbId'
    ).lean();
    filterTmbIds = groupMembers.map((m) => String(m.tmbId));
    if (filterTmbIds.length === 0) return { total: 0, list: [] };
  }

  // 构造 MongoTeamMember 查询条件
  const match: Record<string, any> = { teamId: new Types.ObjectId(teamId) };

  if (status) {
    match.status = status;
  }
  if (searchKey) {
    match.name = { $regex: searchKey, $options: 'i' };
  }
  if (filterTmbIds !== undefined) {
    match._id = { $in: filterTmbIds.map((id) => new Types.ObjectId(id)) };
  }

  const [total, members] = await Promise.all([
    MongoTeamMember.countDocuments(match),
    MongoTeamMember.find(match).sort({ createTime: -1 }).skip(offset).limit(pageSize).lean()
  ]);

  if (total === 0 || members.length === 0) return { total, list: [] };

  const tmbIds = members.map((m) => String(m._id));

  // 并行获取权限和部门路径
  const [permissionMap, orgPathsMap] = await Promise.all([
    withPermission
      ? buildPermissionMap({ teamId, tmbIds })
      : Promise.resolve(new Map<string, TeamPermission>()),
    withOrgs
      ? buildOrgPathsMap({ teamId, teamName, tmbIds })
      : Promise.resolve(new Map<string, string[]>())
  ]);

  const list: TeamMemberItemType[] = members.map((m) => {
    const tmbIdStr = String(m._id);
    const item: TeamMemberItemType = {
      userId: String(m.userId),
      tmbId: tmbIdStr,
      teamId: String(m.teamId),
      memberName: m.name,
      avatar: m.avatar,
      role: m.role as any,
      status: m.status as any,
      createTime: m.createTime,
      updateTime: m.updateTime,
      // 始终包含 permission（前端类型要求 permission 为必填）；withPermission=false 时返回默认值
      permission: withPermission
        ? (permissionMap.get(tmbIdStr) ?? new TeamPermission())
        : new TeamPermission(),
      ...(withOrgs ? { orgs: orgPathsMap.get(tmbIdStr) ?? [] } : {})
    };
    return item;
  });

  return { total, list };
}

/**
 * 批量获取成员的团队级权限对象。
 * 对每个 tmbId 调用 getTmbPermission，返回 tmbId → TeamPermission 映射。
 */
async function buildPermissionMap({
  teamId,
  tmbIds
}: {
  teamId: string;
  tmbIds: string[];
}): Promise<Map<string, TeamPermission>> {
  const entries = await Promise.all(
    tmbIds.map(async (tmbId) => {
      const per = await getTmbPermission({
        resourceType: PerResourceTypeEnum.team,
        teamId,
        tmbId
      });
      return [tmbId, new TeamPermission({ role: per ?? 0 })] as const;
    })
  );
  return new Map(entries);
}

/**
 * 批量构建成员的部门全路径字符串数组。
 * 路径格式：/teamName/dept1Name/dept2Name
 *
 * 算法：
 * 1. 查询所有 tmbId 的 org 成员记录
 * 2. 查询涉及的所有 org（含祖先，用于解析 path 中的 pathId）
 * 3. 构造 pathId → orgName 映射，过滤掉 path='' 的 ROOT 层
 * 4. 拼接完整路径字符串
 */
async function buildOrgPathsMap({
  teamId,
  teamName,
  tmbIds
}: {
  teamId: string;
  teamName: string;
  tmbIds: string[];
}): Promise<Map<string, string[]>> {
  const orgMemberships = await MongoOrgMemberModel.find(
    {
      teamId: new Types.ObjectId(teamId),
      tmbId: { $in: tmbIds.map((id) => new Types.ObjectId(id)) }
    },
    'tmbId orgId'
  ).lean();

  if (orgMemberships.length === 0) return new Map();

  const orgIds = [...new Set(orgMemberships.map((m) => String(m.orgId)))];
  const orgs = await MongoOrgModel.find({ _id: { $in: orgIds } }, 'name path pathId').lean();

  if (orgs.length === 0) return new Map();

  // 收集所有需要解析的祖先 pathId
  const allPathIds = new Set<string>();
  for (const org of orgs) {
    org.path
      .split('/')
      .filter(Boolean)
      .forEach((p) => allPathIds.add(p));
    allPathIds.add(org.pathId);
  }

  const ancestorOrgs = await MongoOrgModel.find(
    { teamId: new Types.ObjectId(teamId), pathId: { $in: Array.from(allPathIds) } },
    'name pathId path'
  ).lean();

  // pathId → { name, path }；path='' 的是 ROOT，构建路径时跳过
  const pathIdToOrg = new Map(ancestorOrgs.map((o) => [o.pathId, { name: o.name, path: o.path }]));

  // orgId → 完整路径字符串
  const orgIdToPath = new Map(
    orgs.map((org) => {
      const ancestorPathIds = org.path.split('/').filter(Boolean);
      // 跳过 ROOT 层（path==='' 的 org）
      const ancestorNames = ancestorPathIds
        .map((pid) => pathIdToOrg.get(pid))
        .filter((a): a is { name: string; path: string } => !!a && a.path !== '')
        .map((a) => a.name);
      const fullPath = `/${teamName}/${[...ancestorNames, org.name].join('/')}`;
      return [String(org._id), fullPath];
    })
  );

  // tmbId → 路径字符串数组
  const result = new Map<string, string[]>();
  for (const membership of orgMemberships) {
    const tmbId = String(membership.tmbId);
    const path = orgIdToPath.get(String(membership.orgId));
    if (path) {
      const existing = result.get(tmbId) ?? [];
      existing.push(path);
      result.set(tmbId, existing);
    }
  }

  return result;
}

/**
 * 校验 tmbId 数组中的所有成员均属于指定团队且处于 active 状态。
 * 校验失败时 reject TeamErrEnum.userNotActive 或 TeamErrEnum.notUser。
 */
export async function validateActiveTmbIds({
  teamId,
  tmbIds
}: {
  teamId: string;
  tmbIds: string[];
}): Promise<void> {
  if (tmbIds.length === 0) return;

  const members = await MongoTeamMember.find(
    {
      _id: { $in: tmbIds.map((id) => new Types.ObjectId(id)) },
      teamId: new Types.ObjectId(teamId),
      status: TeamMemberStatusEnum.active
    },
    '_id'
  ).lean();

  if (members.length !== tmbIds.length) {
    return Promise.reject(TeamErrEnum.userNotActive);
  }
}
