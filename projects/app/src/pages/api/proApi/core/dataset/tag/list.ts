import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetDatasetCollectionTagsBodySchema,
  GetDatasetCollectionTagsResponseSchema,
  type GetDatasetCollectionTagsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import { listDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/service';

async function handler(req: ApiRequestProps): Promise<GetDatasetCollectionTagsResponseType> {
  const { body } = parseApiInput({ req, bodySchema: GetDatasetCollectionTagsBodySchema });
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: body.datasetId,
    per: ReadPermissionVal
  });

  const pageSize = Number(body.pageSize) || 10;
  const offset =
    body.offset !== undefined ? Number(body.offset) : (Number(body.pageNum ?? 1) - 1) * pageSize;

  const result = await listDatasetCollectionTags({
    teamId,
    datasetId: body.datasetId,
    searchText: body.searchText,
    offset,
    pageSize
  });

  return GetDatasetCollectionTagsResponseSchema.parse(result);
}

export default NextAPI(handler);
