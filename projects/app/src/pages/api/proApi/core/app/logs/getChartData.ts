import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import {
  GetChartDataBodySchema,
  GetChartDataResponseSchema,
  type getChartDataResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { getAppChatLogChartData } from '@fastgpt/service/core/app/logs/chartAggregation';

/**
 * OSS 阴影商业版：应用运行日志图表序列。
 * 聚合 app_chat_logs，返回用户 / 对话 / 应用效果三类时间桶数据。
 */
async function handler(req: ApiRequestProps): Promise<getChartDataResponse> {
  const { body } = parseApiInput({ req, bodySchema: GetChartDataBodySchema });
  const { teamId } = await authApp({
    req,
    authToken: true,
    appId: body.appId,
    per: AppReadChatLogPerVal
  });

  const data = await getAppChatLogChartData({
    teamId,
    appId: body.appId,
    dateStart: body.dateStart,
    dateEnd: body.dateEnd,
    source: body.source,
    offset: body.offset ?? 1,
    userTimespan: body.userTimespan,
    chatTimespan: body.chatTimespan,
    appTimespan: body.appTimespan
  });

  return GetChartDataResponseSchema.parse(data);
}

export default NextAPI(handler);
