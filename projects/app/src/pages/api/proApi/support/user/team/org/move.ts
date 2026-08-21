import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { getOrgAndChildren } from '@fastgpt/service/support/permission/org/controllers';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  orgId: z.string(),
  targetOrgId: z.string().optional()
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const { org: movingOrg, children } = await getOrgAndChildren({
    orgId: body.orgId,
    teamId
  });

  // 禁止移动 ROOT
  if (movingOrg.path === '') {
    return Promise.reject(TeamErrEnum.cannotModifyRootOrg);
  }

  // 找目标父级 org
  let targetParent: OrgSchemaType;
  if (body.targetOrgId) {
    const found = await MongoOrgModel.findOne({
      _id: new Types.ObjectId(body.targetOrgId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!found) return Promise.reject(TeamErrEnum.orgParentNotExist);
    targetParent = found;
  } else {
    const root = await MongoOrgModel.findOne({
      teamId: new Types.ObjectId(teamId),
      path: ''
    }).lean();
    if (!root) return Promise.reject(TeamErrEnum.orgParentNotExist);
    targetParent = root;
  }

  // 防止成环：目标父级不能是 movingOrg 本身或其后代
  const movingChildrenPath = getOrgChildrenPath(movingOrg);
  const isMovingIntoSelf = String(targetParent._id) === String(movingOrg._id);
  const isMovingIntoDescendant =
    targetParent.path.startsWith(movingChildrenPath) || targetParent.path === movingChildrenPath;

  if (isMovingIntoSelf || isMovingIntoDescendant) {
    return Promise.reject(TeamErrEnum.cannotMoveToSubPath);
  }

  // 计算新旧 path
  const oldPath = getOrgChildrenPath(movingOrg); // movingOrg 的子部门旧 path 前缀（含 pathId）
  const newParentChildrenPath = getOrgChildrenPath(targetParent);
  const newOrgPath = newParentChildrenPath; // movingOrg 自己的新 path

  // 旧的 childrenPath（后代的 path 前缀）vs 新的
  const oldChildrenPrefix = movingChildrenPath; // e.g. /root/movingPathId
  const newChildrenPrefix = `${newParentChildrenPath}/${movingOrg.pathId}`;

  await mongoSessionRun(async (session) => {
    // 1. 更新 movingOrg 自身的 path
    await MongoOrgModel.updateOne(
      { _id: movingOrg._id },
      { $set: { path: newOrgPath } },
      { session }
    );

    // 2. 批量更新所有后代的 path（替换旧前缀为新前缀）
    if (children.length > 0) {
      const bulkOps = children.map((child) => ({
        updateOne: {
          filter: { _id: child._id },
          update: {
            $set: {
              path: child.path.replace(oldChildrenPrefix, newChildrenPrefix)
            }
          }
        }
      }));
      await MongoOrgModel.bulkWrite(bulkOps, { session });
    }
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.RELOCATE_DEPARTMENT,
    params: { departmentName: movingOrg.name } as any
  });
}

export default NextAPI(handler);
