import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UpdateDatasetCollaboratorBodySchema } from '@fastgpt/global/openapi/support/permission/api';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateDatasetCollaboratorBodySchema });
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId: body.datasetId,
    per: OwnerRoleVal
  });

  await updateResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.dataset,
    resourceModel: MongoDataset,
    folderTypeList: [DatasetTypeEnum.folder],
    collaborators: body.collaborators,
    resource: {
      _id: String(dataset._id),
      type: dataset.type,
      teamId: String(dataset.teamId),
      parentId: dataset.parentId,
      inheritPermission: dataset.inheritPermission,
      tmbId: String(dataset.tmbId),
      name: dataset.name
    }
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.UPDATE_DATASET_COLLABORATOR,
    params: {
      datasetName: dataset.name,
      datasetType: getI18nDatasetType(dataset.type),
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
