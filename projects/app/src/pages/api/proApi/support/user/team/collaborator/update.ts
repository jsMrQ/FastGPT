import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { pickCollaboratorIdFields } from '@fastgpt/service/support/permission/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const CollaboratorItemSchema = z.object({
  tmbId: z.string().optional(),
  orgId: z.string().optional(),
  groupId: z.string().optional(),
  permission: z.number()
});

const BodySchema = z.object({
  collaborators: z.array(CollaboratorItemSchema)
});

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  const { teamId, tmbId: operatorTmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  await mongoSessionRun(async (session) => {
    // 删除所有非 owner 的旧协作者记录（owner 不可被覆盖删除）
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.team,
        teamId: new Types.ObjectId(teamId),
        permission: { $ne: OwnerRoleVal }
      },
      { session }
    );

    // 写入新协作者记录（保留 owner 不变）
    const collaboratorsToWrite = (body.collaborators as CollaboratorItemType[]).filter(
      (clb) => clb.permission !== OwnerRoleVal
    );

    if (collaboratorsToWrite.length > 0) {
      const ops = collaboratorsToWrite.map((clb) => ({
        updateOne: {
          filter: {
            ...pickCollaboratorIdFields(clb as CollaboratorItemType),
            teamId: new Types.ObjectId(teamId),
            resourceType: PerResourceTypeEnum.team
          },
          update: { $set: { permission: clb.permission } },
          upsert: true
        }
      }));
      await MongoResourcePermission.bulkWrite(ops, { session });
    }
  });

  void addAuditLog({
    teamId,
    tmbId: operatorTmbId,
    event: AuditEventEnum.ASSIGN_PERMISSION,
    params: {} as any
  });
}

export default NextAPI(handler);
