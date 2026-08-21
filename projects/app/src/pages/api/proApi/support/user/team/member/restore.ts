import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
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

  const targetTmb = await MongoTeamMember.findOneAndUpdate(
    {
      _id: new Types.ObjectId(body.tmbId),
      teamId: new Types.ObjectId(teamId)
    },
    { $set: { status: TeamMemberStatusEnum.active } },
    { new: true }
  ).lean();

  if (!targetTmb) return Promise.reject(TeamErrEnum.notUser);

  // 注意：恢复成员时权限不自动恢复，需管理员重新手动授权
  void addAuditLog({
    teamId,
    tmbId: operatorTmbId,
    event: AuditEventEnum.RECOVER_TEAM_MEMBER,
    params: { memberName: targetTmb.name } as any
  });
}

export default NextAPI(handler);
