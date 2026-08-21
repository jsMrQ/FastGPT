import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { softRemoveTeamMember } from '@fastgpt/service/support/user/team/enterpriseMember';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types } from '@fastgpt/service/common/mongo';

async function handler(req: ApiRequestProps): Promise<void> {
  const { tmbId, teamId, userId } = await authCert({ req, authToken: true });

  const tmb = await MongoTeamMember.findOne({
    _id: new Types.ObjectId(tmbId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!tmb) return Promise.reject(TeamErrEnum.notUser);

  // owner 不可自行离职
  if (tmb.role === TeamMemberRoleEnum.owner) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  await softRemoveTeamMember({ teamId, tmbId, userId });
}

export default NextAPI(handler);
