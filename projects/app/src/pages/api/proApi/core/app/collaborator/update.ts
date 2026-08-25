import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UpdateAppCollaboratorBodySchema } from '@fastgpt/global/openapi/support/permission/api';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateAppCollaboratorBodySchema });
  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId: body.appId,
    per: OwnerRoleVal
  });

  await updateResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.app,
    resourceModel: MongoApp,
    folderTypeList: AppFolderTypeList,
    collaborators: body.collaborators,
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

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.UPDATE_APP_COLLABORATOR,
    params: {
      appName: app.name,
      appType: getI18nAppType(app.type),
      tmbList: body.collaborators.filter((item) => item.tmbId).map((item) => String(item.tmbId)),
      groupList: body.collaborators
        .filter((item) => item.groupId)
        .map((item) => String(item.groupId)),
      orgList: body.collaborators.filter((item) => item.orgId).map((item) => String(item.orgId)),
      permission: String(body.collaborators[0]?.permission ?? 0)
    }
  });
}

export default NextAPI(handler);
