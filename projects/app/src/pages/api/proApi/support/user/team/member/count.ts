import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from '@fastgpt/service/common/mongo';

async function handler(req: ApiRequestProps): Promise<{ count: number }> {
  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  const count = await MongoTeamMember.countDocuments({
    teamId: new Types.ObjectId(teamId),
    status: TeamMemberStatusEnum.active
  });

  return { count };
}

export default NextAPI(handler);
