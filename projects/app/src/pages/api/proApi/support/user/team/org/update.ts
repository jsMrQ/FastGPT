import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  orgId: z.string(),
  name: z.string().min(1).optional(),
  avatar: z.string().optional(),
  description: z.string().optional()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const org = await MongoOrgModel.findOne({
    _id: new Types.ObjectId(body.orgId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!org) return Promise.reject(TeamErrEnum.orgNotExist);

  // 禁止修改根部门（path='' 的 org）
  if (org.path === '') {
    return Promise.reject(TeamErrEnum.cannotModifyRootOrg);
  }

  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.avatar !== undefined) updateData.avatar = body.avatar;
  if (body.description !== undefined) updateData.description = body.description;

  await MongoOrgModel.updateOne({ _id: new Types.ObjectId(body.orgId) }, { $set: updateData });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.CHANGE_DEPARTMENT,
    params: { departmentName: body.name ?? org.name } as any
  });
}

export default NextAPI(handler);
