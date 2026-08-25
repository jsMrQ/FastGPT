import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateDatasetCollectionTagBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { createDatasetCollectionTag } from '@fastgpt/service/core/dataset/tag/service';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';

async function handler(req: ApiRequestProps): Promise<DatasetTagType> {
  const { body } = parseApiInput({ req, bodySchema: CreateDatasetCollectionTagBodySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  return createDatasetCollectionTag({
    teamId,
    datasetId: body.datasetId,
    tag: body.tag
  });
}

export default NextAPI(handler);
