import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  CreateExternalFileCollectionBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getNanoid, parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';

/**
 * POST /proApi/core/dataset/collection/create/externalFileUrl
 * 按外链 URL 创建集合并入解析队列。无 filename 时用 URL 路径名兜底。
 */
async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { body } = parseApiInput({ req, bodySchema: CreateExternalFileCollectionBodySchema });

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  const externalFileId = body.externalFileId?.trim() || getNanoid();
  const filename =
    body.filename?.trim() ||
    decodeURIComponent(body.externalFileUrl.split('/').pop() || '') ||
    `file.${parseFileExtensionFromUrl(body.externalFileUrl) || 'txt'}`;

  return createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      name: filename,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.externalFile,
      externalFileId,
      externalFileUrl: body.externalFileUrl
    }
  });
}

export default NextAPI(handler);
