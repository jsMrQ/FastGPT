import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  name: z.string().min(1)
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  // 成员自己改名，只需 authCert 验证身份
  const { tmbId, teamId } = await authCert({ req, authToken: true });

  await MongoTeamMember.updateOne(
    { _id: new Types.ObjectId(tmbId), teamId: new Types.ObjectId(teamId) },
    { $set: { name: body.name } }
  );

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.CHANGE_MEMBER_NAME_ACCOUNT,
    params: { memberName: body.name } as any
  });
}

export default NextAPI(handler);
