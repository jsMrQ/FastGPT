import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  tmbId: z.string(),
  name: z.string().min(1)
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId: operatorTmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const result = await MongoTeamMember.findOneAndUpdate(
    {
      _id: new Types.ObjectId(body.tmbId),
      teamId: new Types.ObjectId(teamId)
    },
    { $set: { name: body.name } }
  ).lean();

  if (!result) return Promise.reject(TeamErrEnum.notUser);

  void addAuditLog({
    teamId,
    tmbId: operatorTmbId,
    event: AuditEventEnum.CHANGE_MEMBER_NAME,
    params: { memberName: body.name } as any
  });
}

export default NextAPI(handler);
