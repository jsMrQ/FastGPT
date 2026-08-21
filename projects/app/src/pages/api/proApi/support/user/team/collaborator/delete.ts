import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { pickCollaboratorIdFields } from '@fastgpt/service/support/permission/utils';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const QuerySchema = z
  .object({
    tmbId: z.string().optional(),
    orgId: z.string().optional(),
    groupId: z.string().optional()
  })
  .refine((d) => d.tmbId || d.orgId || d.groupId, {
    message: 'At least one of tmbId, orgId, groupId is required'
  });

async function handler(req: ApiRequestProps): Promise<void> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const clb = query as CollaboratorItemType;

  // 检查是否为 owner 记录，禁止删除
  const existing = await MongoResourcePermission.findOne({
    ...pickCollaboratorIdFields(clb),
    teamId: new Types.ObjectId(teamId),
    resourceType: PerResourceTypeEnum.team
  }).lean();

  if (existing && existing.permission === OwnerRoleVal) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  await MongoResourcePermission.deleteOne({
    ...pickCollaboratorIdFields(clb),
    teamId: new Types.ObjectId(teamId),
    resourceType: PerResourceTypeEnum.team
  });
}

export default NextAPI(handler);
