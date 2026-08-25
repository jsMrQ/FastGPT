import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { GetAppCollaboratorListQuerySchema } from '@fastgpt/global/openapi/support/permission/api';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';
import { listResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';

async function handler(req: ApiRequestProps): Promise<CollaboratorListType> {
  const { query } = parseApiInput({ req, querySchema: GetAppCollaboratorListQuerySchema });
  const { teamId, app } = await authApp({
    req,
    authToken: true,
    appId: query.appId,
    per: ManagePermissionVal
  });

  return listResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.app,
    resource: {
      _id: String(app._id),
      type: app.type,
      teamId: String(app.teamId),
      parentId: app.parentId,
      inheritPermission: app.inheritPermission,
      tmbId: String(app.tmbId),
      name: app.name
    }
  });
}

export default NextAPI(handler);
