import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getClbsInfo } from '@fastgpt/service/support/permission/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';
import { Types } from '@fastgpt/service/common/mongo';

async function handler(req: ApiRequestProps): Promise<CollaboratorListType> {
  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  // 明确查询 resourceId 不存在的记录，以精确匹配团队级别协作者
  const clbs = await MongoResourcePermission.find({
    teamId: new Types.ObjectId(teamId),
    resourceType: PerResourceTypeEnum.team,
    resourceId: { $exists: false }
  }).lean();

  const clbsWithInfo = await getClbsInfo({ clbs, teamId });

  return {
    clbs: clbsWithInfo,
    parentClbs: []
  };
}

export default NextAPI(handler);
