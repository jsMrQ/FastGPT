import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import type { TeamAuditListItemType } from '@fastgpt/global/support/user/audit/type';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';

const BodySchema = z.object({
  pageSize: z.union([z.number(), z.string()]).transform(Number).optional(),
  pageNum: z.union([z.number(), z.string()]).transform(Number).optional(),
  offset: z.union([z.number(), z.string()]).transform(Number).optional(),
  tmbIds: z.array(z.string()).optional(),
  events: z.array(z.nativeEnum(AuditEventEnum)).optional()
});

/**
 * POST /proApi/support/user/audit/list
 * 分页查询团队操作日志，支持按成员和事件类型过滤。
 * 联查 MongoTeamMember 获取操作者姓名和头像。
 * ManagePermissionVal 鉴权，仅管理员可查看。
 */
async function handler(req: ApiRequestProps): Promise<PaginationResponse<TeamAuditListItemType>> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const pageSize = Number(body.pageSize ?? 20);
  let offset: number;
  if (body.offset !== undefined) {
    offset = Number(body.offset);
  } else {
    offset = (Number(body.pageNum ?? 1) - 1) * pageSize;
  }

  const match: Record<string, any> = { teamId: new Types.ObjectId(teamId) };

  if (body.tmbIds && body.tmbIds.length > 0) {
    match.tmbId = { $in: body.tmbIds.map((id) => new Types.ObjectId(id)) };
  }
  if (body.events && body.events.length > 0) {
    match.event = { $in: body.events };
  }

  const [total, logs] = await Promise.all([
    MongoTeamAudit.countDocuments(match),
    MongoTeamAudit.find(match).sort({ timestamp: -1 }).skip(offset).limit(pageSize).lean()
  ]);

  if (logs.length === 0) return { total, list: [] };

  // 收集所有操作者 tmbId，一次批量查询 member 信息
  const tmbIds = [...new Set(logs.map((l) => String(l.tmbId)))];
  const members = await MongoTeamMember.find(
    { _id: { $in: tmbIds.map((id) => new Types.ObjectId(id)) } },
    'name avatar status'
  ).lean();
  const memberMap = new Map(members.map((m) => [String(m._id), m]));

  const list: TeamAuditListItemType[] = logs.map((log) => {
    const member = memberMap.get(String(log.tmbId));
    const sourceMember: SourceMemberType = {
      name: member?.name ?? '',
      avatar: member?.avatar ?? null,
      status: (member?.status ?? 'active') as any
    };

    return {
      _id: String(log._id),
      sourceMember,
      event: log.event as any,
      timestamp: log.timestamp,
      metadata: (log.metadata ?? {}) as Record<string, string>
    };
  });

  return { total, list };
}

export default NextAPI(handler);
