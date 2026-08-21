import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { softRemoveTeamMember } from '@fastgpt/service/support/user/team/enterpriseMember';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  tmbId: z.string()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId: operatorTmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const targetTmb = await MongoTeamMember.findOne({
    _id: new Types.ObjectId(body.tmbId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!targetTmb) return Promise.reject(TeamErrEnum.notUser);

  // 禁止删除 owner
  if (targetTmb.role === TeamMemberRoleEnum.owner) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  await softRemoveTeamMember({
    teamId,
    tmbId: body.tmbId,
    userId: String(targetTmb.userId)
  });

  // 审计日志：fire-and-forget
  void addAuditLog({
    teamId,
    tmbId: operatorTmbId,
    event: AuditEventEnum.KICK_OUT_TEAM,
    params: { memberName: targetTmb.name } as any
  });
}

export default NextAPI(handler);
