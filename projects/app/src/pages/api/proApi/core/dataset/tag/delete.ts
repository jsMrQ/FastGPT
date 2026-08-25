import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { DeleteDatasetCollectionTagQuerySchema } from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { deleteDatasetCollectionTag } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<void> {
  const { query } = parseApiInput({ req, querySchema: DeleteDatasetCollectionTagQuerySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: query.datasetId,
    per: WritePermissionVal
  });

  await deleteDatasetCollectionTag({
    teamId,
    datasetId: query.datasetId,
    tagId: query.id
  });
}

export default NextAPI(handler);
