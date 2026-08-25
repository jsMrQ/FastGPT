import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetDatasetTagUsageQuerySchema,
  GetDatasetTagUsageResponseSchema,
  type GetDatasetTagUsageResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { getDatasetTagUsage } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<GetDatasetTagUsageResponseType> {
  const { query } = parseApiInput({ req, querySchema: GetDatasetTagUsageQuerySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: query.datasetId,
    per: ReadPermissionVal
  });

  const usage = await getDatasetTagUsage({
    teamId,
    datasetId: query.datasetId
  });

  return GetDatasetTagUsageResponseSchema.parse(usage);
}

export default NextAPI(handler);
