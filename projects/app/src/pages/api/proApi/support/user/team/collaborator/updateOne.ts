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

const BodySchema = z
  .object({
    tmbId: z.string().optional(),
    orgId: z.string().optional(),
    groupId: z.string().optional(),
    permission: z.number()
  })
  .refine((d) => d.tmbId || d.orgId || d.groupId, {
    message: 'At least one of tmbId, orgId, groupId is required'
  });

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const clb = body as CollaboratorItemType;

  // 禁止将 owner 权限通过此接口授予（owner 只能通过 changeOwner 转移）
  if (body.permission === OwnerRoleVal) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  await MongoResourcePermission.updateOne(
    {
      ...pickCollaboratorIdFields(clb),
      teamId: new Types.ObjectId(teamId),
      resourceType: PerResourceTypeEnum.team
    },
    { $set: { permission: body.permission } },
    { upsert: true }
  );
}

export default NextAPI(handler);
