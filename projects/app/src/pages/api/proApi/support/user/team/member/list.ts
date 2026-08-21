import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { listTeamMembers } from '@fastgpt/service/support/user/team/enterpriseMember';
import { z } from 'zod';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

const BodySchema = z.object({
  pageSize: z.union([z.number(), z.string()]).transform(Number),
  pageNum: z.union([z.number(), z.string()]).transform(Number).optional(),
  offset: z.union([z.number(), z.string()]).transform(Number).optional(),
  status: z.string().optional(),
  searchKey: z.string().optional(),
  orgId: z.string().optional(),
  groupId: z.string().optional(),
  withPermission: z.boolean().optional(),
  withOrgs: z.boolean().optional()
});

async function handler(req: ApiRequestProps): Promise<PaginationResponse<TeamMemberItemType>> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  // 成员列表被团队页全员使用，鉴权降为读权限；写操作仍要求 manage
  const { teamId, tmb } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  const pageSize = Number(body.pageSize) || 20;
  let offset: number;
  if (body.offset !== undefined) {
    offset = Number(body.offset);
  } else {
    offset = (Number(body.pageNum ?? 1) - 1) * pageSize;
  }

  const { total, list } = await listTeamMembers({
    teamId,
    teamName: tmb.teamName,
    offset,
    pageSize,
    status: body.status,
    searchKey: body.searchKey,
    orgId: body.orgId,
    groupId: body.groupId,
    withPermission: body.withPermission,
    withOrgs: body.withOrgs
  });

  return { total, list };
}

export default NextAPI(handler);
