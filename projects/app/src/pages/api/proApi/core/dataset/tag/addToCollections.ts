import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AddTagsToCollectionsBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { addTagToCollections } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: AddTagsToCollectionsBodySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  await addTagToCollections({
    teamId,
    datasetId: body.datasetId,
    tag: body.tag,
    originCollectionIds: body.originCollectionIds,
    collectionIds: body.collectionIds
  });
}

export default NextAPI(handler);
