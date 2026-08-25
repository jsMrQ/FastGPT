import { describe, it, expect } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getFakeUsers, getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/proApi/core/app/collaborator/list';
import updateHandler from '@/pages/api/proApi/core/app/collaborator/update';
import type {
  GetAppCollaboratorListQueryType,
  GetAppCollaboratorListResponseType,
  UpdateAppCollaboratorBodyType
} from '@fastgpt/global/openapi/support/permission/api';

async function createAppWithOwnerClb(user: { teamId: string; tmbId: string }, name: string) {
  return mongoSessionRun(async (session) => {
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name,
      type: AppTypeEnum.simple,
      inheritPermission: true
    });
    await createResourceDefaultCollaborators({
      resource: app,
      resourceType: PerResourceTypeEnum.app,
      session,
      tmbId: String(user.tmbId)
    });
    return app;
  });
}

describe('app collaborator APIs', () => {
  it('lists owner collaborator and grants read to another member', async () => {
    const users = await getFakeUsers(2);
    const app = await createAppWithOwnerClb(users.owner, 'dock-kb-agent');

    const listRes = await Call<
      Record<string, never>,
      GetAppCollaboratorListQueryType,
      GetAppCollaboratorListResponseType
    >(listHandler, {
      auth: users.owner,
      query: { appId: String(app._id) }
    });

    expect(listRes.code).toBe(200);
    expect(listRes.data.clbs.some((clb) => clb.permission.isOwner)).toBe(true);

    const updateRes = await Call<UpdateAppCollaboratorBodyType, Record<string, never>, void>(
      updateHandler,
      {
        auth: users.owner,
        body: {
          appId: String(app._id),
          collaborators: [{ tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }]
        }
      }
    );

    expect(updateRes.code).toBe(200);

    const ownerClb = await MongoResourcePermission.findOne({
      resourceType: PerResourceTypeEnum.app,
      resourceId: app._id,
      tmbId: users.owner.tmbId
    }).lean();
    expect(ownerClb?.permission).toBe(OwnerRoleVal);

    const memberClb = await MongoResourcePermission.findOne({
      resourceType: PerResourceTypeEnum.app,
      resourceId: app._id,
      tmbId: users.members[0].tmbId
    }).lean();
    expect(memberClb?.permission).toBe(ReadRoleVal);
  });

  it('rejects granting a member from another team', async () => {
    const users = await getFakeUsers(1);
    const outsider = await getUser(`outsider_${getNanoid(6)}`);
    const app = await createAppWithOwnerClb(users.owner, 'private-app');

    const updateRes = await Call<UpdateAppCollaboratorBodyType, Record<string, never>, void>(
      updateHandler,
      {
        auth: users.owner,
        body: {
          appId: String(app._id),
          collaborators: [{ tmbId: String(outsider.tmbId), permission: ReadRoleVal }]
        }
      }
    );

    expect(updateRes.code).not.toBe(200);
  });
});
