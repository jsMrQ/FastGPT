import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { getTmbPermission } from '@fastgpt/service/support/permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import type { TeamTmbItemType, TeamSchema } from '@fastgpt/global/support/user/team/type';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const QuerySchema = z.object({
  status: z.string().optional()
});

async function handler(req: ApiRequestProps): Promise<TeamTmbItemType[]> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { userId } = await authCert({ req, authToken: true });

  const matchQuery: Record<string, any> = { userId: new Types.ObjectId(userId) };
  if (query.status) {
    matchQuery.status = query.status;
  }

  const members = await MongoTeamMember.find(matchQuery)
    .populate<{ team: TeamSchema }>('team')
    .lean();

  const result: TeamTmbItemType[] = await Promise.all(
    members.map(async (tmb) => {
      const per =
        (await getTmbPermission({
          resourceType: PerResourceTypeEnum.team,
          teamId: String(tmb.teamId),
          tmbId: String(tmb._id)
        })) ?? TeamDefaultRoleVal;

      return {
        userId: String(tmb.userId),
        teamId: String(tmb.teamId),
        teamAvatar: tmb.team.avatar,
        teamName: tmb.team.name,
        memberName: tmb.name,
        avatar: tmb.avatar,
        balance: tmb.team.balance,
        tmbId: String(tmb._id),
        role: tmb.role as any,
        status: tmb.status as any,
        notificationAccount: tmb.team.notificationAccount,
        permission: new TeamPermission({
          role: per,
          isOwner: tmb.role === TeamMemberRoleEnum.owner
        }),
        openaiAccount: tmb.team.openaiAccount,
        externalWorkflowVariables: tmb.team.externalWorkflowVariables,
        isWecomTeam: !!(tmb.team as any).meta?.wecom
      };
    })
  );

  return result;
}

export default NextAPI(handler);
