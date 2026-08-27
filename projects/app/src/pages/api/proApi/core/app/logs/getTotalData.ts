import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import {
  GetTotalDataQuerySchema,
  GetTotalDataResponseSchema,
  type getTotalDataResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { getAppChatLogTotalData } from '@fastgpt/service/core/app/logs/chartAggregation';

/**
 * OSS 阴影商业版：应用日志总量统计。
 * 数据来自 app_chat_logs，供运行日志看板顶部卡片使用。
 */
async function handler(req: ApiRequestProps): Promise<getTotalDataResponse> {
  const { query } = parseApiInput({ req, querySchema: GetTotalDataQuerySchema });
  const { teamId } = await authApp({
    req,
    authToken: true,
    appId: query.appId,
    per: AppReadChatLogPerVal
  });

  const data = await getAppChatLogTotalData({
    teamId,
    appId: query.appId
  });

  return GetTotalDataResponseSchema.parse(data);
}

export default NextAPI(handler);
