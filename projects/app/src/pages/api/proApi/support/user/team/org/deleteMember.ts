import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const QuerySchema = z.object({
  orgId: z.string(),
  tmbId: z.string()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const result = await MongoOrgMemberModel.deleteOne({
    teamId: new Types.ObjectId(teamId),
    orgId: new Types.ObjectId(query.orgId),
    tmbId: new Types.ObjectId(query.tmbId)
  });

  if (result.deletedCount === 0) {
    return Promise.reject(TeamErrEnum.orgMemberNotExist);
  }
}

export default NextAPI(handler);
