import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { postCreateOrgData } from '@fastgpt/global/support/user/team/org/api';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  avatar: z.string().optional(),
  orgId: z.string().optional()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  // 确定父级 org：无 orgId 时为 ROOT
  let parentOrg;
  if (body.orgId) {
    parentOrg = await MongoOrgModel.findOne({
      _id: new Types.ObjectId(body.orgId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!parentOrg) return Promise.reject(TeamErrEnum.orgParentNotExist);
  } else {
    parentOrg = await MongoOrgModel.findOne({
      teamId: new Types.ObjectId(teamId),
      path: ''
    }).lean();
    if (!parentOrg) return Promise.reject(TeamErrEnum.orgParentNotExist);
  }

  // 新部门的 path = 父级的 childrenPath
  const newPath = getOrgChildrenPath(parentOrg);

  await MongoOrgModel.create([
    {
      teamId: new Types.ObjectId(teamId),
      name: body.name,
      path: newPath,
      description: body.description,
      avatar: body.avatar
    }
  ]);

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.CREATE_DEPARTMENT,
    params: { departmentName: body.name } as any
  });
}

export default NextAPI(handler);
