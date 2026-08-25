import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { GetDatasetCollaboratorListQuerySchema } from '@fastgpt/global/openapi/support/permission/api';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';
import { listResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';

async function handler(req: ApiRequestProps): Promise<CollaboratorListType> {
  const { query } = parseApiInput({
    req,
    querySchema: GetDatasetCollaboratorListQuerySchema
  });
  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId: query.datasetId,
    per: ManagePermissionVal
  });

  return listResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.dataset,
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
}

export default NextAPI(handler);
