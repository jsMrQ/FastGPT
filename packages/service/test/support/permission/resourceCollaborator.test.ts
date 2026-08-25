import { describe, it, expect } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import {
  listResourceCollaborators,
  updateResourceCollaborators
} from '@fastgpt/service/support/permission/resourceCollaborator';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getFakeUsers } from '@test/datas/users';

describe('updateResourceCollaborators', () => {
  it('breaks inheritPermission when child grant conflicts with parent', async () => {
    const users = await getFakeUsers(2);

    const folder = await mongoSessionRun(async (session) => {
      const created = await MongoApp.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'folder',
        type: AppTypeEnum.folder,
        inheritPermission: true
      });
      await createResourceDefaultCollaborators({
        resource: created,
        resourceType: PerResourceTypeEnum.app,
        session,
        tmbId: String(users.owner.tmbId)
      });
      return created;
    });

    await MongoResourcePermission.create({
      teamId: users.owner.teamId,
      tmbId: users.members[0].tmbId,
      resourceType: PerResourceTypeEnum.app,
      resourceId: folder._id,
      permission: ReadRoleVal
    });

    const child = await MongoApp.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: folder._id,
      name: 'child',
      type: AppTypeEnum.simple,
      inheritPermission: true
    });
    await mongoSessionRun(async (session) => {
      await createResourceDefaultCollaborators({
        resource: child,
        resourceType: PerResourceTypeEnum.app,
        session,
        tmbId: String(users.owner.tmbId)
      });
    });

    await updateResourceCollaborators({
      teamId: String(users.owner.teamId),
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp,
      folderTypeList: AppFolderTypeList,
      collaborators: [],
      resource: {
        _id: String(child._id),
        type: child.type,
        teamId: String(child.teamId),
        parentId: String(child.parentId),
        inheritPermission: true,
        tmbId: String(child.tmbId),
        name: child.name
      }
    });

    const refreshed = await MongoApp.findById(child._id).lean();
    expect(refreshed?.inheritPermission).toBe(false);

    const listed = await listResourceCollaborators({
      teamId: String(users.owner.teamId),
      resourceType: PerResourceTypeEnum.app,
      resource: {
        _id: String(child._id),
        type: child.type,
        teamId: String(child.teamId),
        parentId: String(child.parentId),
        inheritPermission: refreshed?.inheritPermission,
        tmbId: String(child.tmbId),
        name: child.name
      }
    });
    expect(listed.clbs.some((clb) => clb.permission.role === OwnerRoleVal)).toBe(true);
  });
});
