import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const QuerySchema = z.object({
  orgId: z.string()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { query } = parseApiInput({ req, querySchema: QuerySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const org = await MongoOrgModel.findOne({
    _id: new Types.ObjectId(query.orgId),
    teamId: new Types.ObjectId(teamId)
  }).lean();

  if (!org) return Promise.reject(TeamErrEnum.orgNotExist);

  // 禁止删除 ROOT
  if (org.path === '') {
    return Promise.reject(TeamErrEnum.cannotModifyRootOrg);
  }

  // 校验非空（有成员或有子部门时拒绝删除）
  const [memberCount, childCount] = await Promise.all([
    MongoOrgMemberModel.countDocuments({
      teamId: new Types.ObjectId(teamId),
      orgId: new Types.ObjectId(query.orgId)
    }),
    MongoOrgModel.countDocuments({
      teamId: new Types.ObjectId(teamId),
      path: getOrgChildrenPath(org)
    })
  ]);

  if (memberCount > 0 || childCount > 0) {
    return Promise.reject(TeamErrEnum.cannotDeleteNonEmptyOrg);
  }

  await MongoOrgModel.deleteOne({ _id: new Types.ObjectId(query.orgId) });

  // 清理残留的 org 成员记录（理论上已为 0，防御性清理）
  await MongoOrgMemberModel.deleteMany({
    teamId: new Types.ObjectId(teamId),
    orgId: new Types.ObjectId(query.orgId)
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.DELETE_DEPARTMENT,
    params: { departmentName: org.name } as any
  });
}

export default NextAPI(handler);
