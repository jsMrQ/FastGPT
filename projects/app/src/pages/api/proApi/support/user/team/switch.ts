import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert, setCookie } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  teamId: z.string()
});

async function handler(req: ApiRequestProps, res: ApiResponseType): Promise<string> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { userId } = await authCert({ req, authToken: true });

  // 找到该用户在目标团队中的 active 成员记录
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId),
    teamId: new Types.ObjectId(body.teamId),
    status: TeamMemberStatusEnum.active
  }).lean();

  if (!tmb) return Promise.reject(TeamErrEnum.unAuthTeam);

  // 更新 user.lastLoginTmbId，记录最后登录的团队
  await MongoUser.updateOne(
    { _id: new Types.ObjectId(userId) },
    { $set: { lastLoginTmbId: tmb._id } }
  );

  const token = await createUserSession({
    userId,
    teamId: String(tmb.teamId),
    tmbId: String(tmb._id),
    ip: getClientIpFromRequest(req)
  });

  // 写入新 cookie，使浏览器后续请求携带新 session
  setCookie(res, token);

  return token;
}

export default NextAPI(handler);
