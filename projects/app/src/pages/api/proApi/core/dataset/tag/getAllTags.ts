import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetAllDatasetTagsQuerySchema,
  GetAllDatasetTagsResponseSchema,
  type GetAllDatasetTagsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { listAllDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<GetAllDatasetTagsResponseType> {
  const { query } = parseApiInput({ req, querySchema: GetAllDatasetTagsQuerySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: query.datasetId,
    per: ReadPermissionVal
  });

  const list = await listAllDatasetCollectionTags({
    teamId,
    datasetId: query.datasetId
  });

  return GetAllDatasetTagsResponseSchema.parse({ list });
}

export default NextAPI(handler);
