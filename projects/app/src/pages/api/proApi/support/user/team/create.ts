import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

/**
 * 企业自部署场景禁止普通成员自建团队。
 * 保留该路由以避免 catch-all 噪音，所有请求均返回 unAuthTeam 错误。
 */
async function handler(_req: ApiRequestProps): Promise<never> {
  return Promise.reject(TeamErrEnum.unAuthTeam);
}

export default NextAPI(handler);
