import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UpdateDatasetCollectionTagBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { updateDatasetCollectionTag } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateDatasetCollectionTagBodySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  await updateDatasetCollectionTag({
    teamId,
    datasetId: body.datasetId,
    tagId: body.tagId,
    tag: body.tag
  });
}

export default NextAPI(handler);
