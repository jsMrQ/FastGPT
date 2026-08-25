import type { ClientSession, Model } from '../../common/mongo';
import { Types } from '../../common/mongo';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoResourcePermission } from './schema';
import { getClbsInfo, getResourceOwnedClbs } from './controller';
import { pickCollaboratorIdFields } from './utils';
import {
  syncChildrenPermission,
  type SyncChildrenPermissionResourceType
} from './inheritPermission';
import {
  OwnerRoleVal,
  type PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import {
  checkRoleUpdateConflict,
  getCollaboratorId
} from '@fastgpt/global/support/permission/utils';
import type {
  CollaboratorItemType,
  CollaboratorListType
} from '@fastgpt/global/support/permission/collaborator';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoOrgModel } from './org/orgSchema';
import { MongoMemberGroupModel } from './memberGroup/memberGroupSchema';

export type ResourceCollaboratorTarget = SyncChildrenPermissionResourceType & {
  inheritPermission?: boolean;
  tmbId: string;
  name: string;
};

/**
 * 列出资源自身协作者；继承开启且存在父级时附带 parentClbs。
 * 列表接口简化为 manage 可见完整名单，由调用方鉴权保证。
 */
export async function listResourceCollaborators({
  teamId,
  resource,
  resourceType
}: {
  teamId: string;
  resource: ResourceCollaboratorTarget;
  resourceType: PerResourceTypeEnum;
}): Promise<CollaboratorListType> {
  const resourceId = String(resource._id);
  const clbs = await getResourceOwnedClbs({
    teamId,
    resourceId,
    resourceType
  });

  const clbsWithInfo = await getClbsInfo({
    clbs,
    teamId,
    ownerTmbId: String(resource.tmbId)
  });

  const parentId = resource.parentId ? String(resource.parentId) : '';
  if (!resource.inheritPermission || !parentId) {
    return { clbs: clbsWithInfo, parentClbs: [] };
  }

  const parentClbs = await getResourceOwnedClbs({
    teamId,
    resourceId: parentId,
    resourceType
  });
  const parentClbsWithInfo = await getClbsInfo({
    clbs: parentClbs,
    teamId
  });

  return { clbs: clbsWithInfo, parentClbs: parentClbsWithInfo };
}

/**
 * 覆盖式更新资源协作者。
 * owner 记录不可删除；与父级授权冲突时断开 inheritPermission；文件夹同步后代。
 */
export async function updateResourceCollaborators({
  teamId,
  resource,
  resourceType,
  resourceModel,
  folderTypeList,
  collaborators
}: {
  teamId: string;
  resource: ResourceCollaboratorTarget;
  resourceType: PerResourceTypeEnum;
  resourceModel: typeof Model;
  folderTypeList: string[];
  collaborators: CollaboratorItemType[];
}): Promise<void> {
  await assertCollaboratorsBelongToTeam({ teamId, collaborators });

  const resourceId = String(resource._id);

  await mongoSessionRun(async (session) => {
    const oldClbs = await getResourceOwnedClbs({
      teamId,
      resourceId,
      resourceType,
      session
    });

    const parentId = resource.parentId ? String(resource.parentId) : '';
    const isFolder = folderTypeList.includes(resource.type);
    const shouldCheckInherit =
      Boolean(parentId) && (isFolder || Boolean(resource.inheritPermission));

    if (shouldCheckInherit) {
      const parentClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: parentId,
        resourceType,
        session
      });
      const conflict = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs: collaborators
      });
      if (conflict) {
        await resourceModel.updateOne(
          { _id: resource._id },
          { inheritPermission: false },
          { session }
        );
      }
    }

    await overwriteCollaborators({
      teamId,
      resourceId,
      resourceType,
      collaborators,
      oldClbs,
      session
    });

    if (isFolder) {
      await syncChildrenPermission({
        resource: {
          _id: resourceId,
          type: resource.type,
          teamId: String(resource.teamId),
          parentId: resource.parentId
        },
        folderTypeList,
        resourceType,
        resourceModel,
        session,
        collaborators
      });
    }
  });
}

/**
 * 校验授权主体都属于当前团队，避免跨团队 ObjectId 注入。
 */
async function assertCollaboratorsBelongToTeam({
  teamId,
  collaborators
}: {
  teamId: string;
  collaborators: CollaboratorItemType[];
}) {
  const tmbIds = collaborators.map((item) => item.tmbId).filter(Boolean) as string[];
  const orgIds = collaborators.map((item) => item.orgId).filter(Boolean) as string[];
  const groupIds = collaborators.map((item) => item.groupId).filter(Boolean) as string[];

  const [tmbCount, orgCount, groupCount] = await Promise.all([
    tmbIds.length
      ? MongoTeamMember.countDocuments({
          _id: { $in: tmbIds },
          teamId,
          status: TeamMemberStatusEnum.active
        })
      : 0,
    orgIds.length
      ? MongoOrgModel.countDocuments({
          _id: { $in: orgIds },
          teamId
        })
      : 0,
    groupIds.length
      ? MongoMemberGroupModel.countDocuments({
          _id: { $in: groupIds },
          teamId
        })
      : 0
  ]);

  if (tmbCount !== tmbIds.length || orgCount !== orgIds.length || groupCount !== groupIds.length) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }
}

/**
 * 删除非 owner 旧记录后 upsert 新协作者；owner 行始终保留。
 */
async function overwriteCollaborators({
  teamId,
  resourceId,
  resourceType,
  collaborators,
  oldClbs,
  session
}: {
  teamId: string;
  resourceId: string;
  resourceType: PerResourceTypeEnum;
  collaborators: CollaboratorItemType[];
  oldClbs: CollaboratorItemType[];
  session: ClientSession;
}) {
  const ownerClbs = oldClbs.filter((clb) => clb.permission === OwnerRoleVal);
  const ownerIds = new Set(ownerClbs.map((clb) => String(getCollaboratorId(clb))));

  const incoming = collaborators.filter((clb) => {
    if (clb.permission === OwnerRoleVal) return false;
    return !ownerIds.has(String(getCollaboratorId(clb)));
  });

  await MongoResourcePermission.deleteMany(
    {
      teamId: new Types.ObjectId(teamId),
      resourceId: new Types.ObjectId(resourceId),
      resourceType,
      permission: { $ne: OwnerRoleVal }
    },
    { session }
  );

  if (incoming.length === 0) return;

  await MongoResourcePermission.bulkWrite(
    incoming.map((clb) => ({
      updateOne: {
        filter: {
          ...pickCollaboratorIdFields(clb),
          teamId: new Types.ObjectId(teamId),
          resourceId: new Types.ObjectId(resourceId),
          resourceType
        },
        update: { $set: { permission: clb.permission } },
        upsert: true
      }
    })),
    { session }
  );
}
