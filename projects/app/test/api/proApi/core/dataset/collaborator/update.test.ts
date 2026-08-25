import { describe, it, expect } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/proApi/core/dataset/collaborator/list';
import updateHandler from '@/pages/api/proApi/core/dataset/collaborator/update';
import type {
  GetDatasetCollaboratorListQueryType,
  GetDatasetCollaboratorListResponseType,
  UpdateDatasetCollaboratorBodyType
} from '@fastgpt/global/openapi/support/permission/api';

describe('dataset collaborator APIs', () => {
  it('grants read on a dataset and keeps owner record', async () => {
    const users = await getFakeUsers(2);
    const dataset = await mongoSessionRun(async (session) => {
      const created = await MongoDataset.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'risk-kb',
        type: DatasetTypeEnum.dataset,
        inheritPermission: true,
        vectorModel: 'text-embedding',
        agentModel: 'gpt-4o-mini'
      });
      await createResourceDefaultCollaborators({
        resource: created,
        resourceType: PerResourceTypeEnum.dataset,
        session,
        tmbId: String(users.owner.tmbId)
      });
      return created;
    });

    const listRes = await Call<
      Record<string, never>,
      GetDatasetCollaboratorListQueryType,
      GetDatasetCollaboratorListResponseType
    >(listHandler, {
      auth: users.owner,
      query: { datasetId: String(dataset._id) }
    });
    expect(listRes.code).toBe(200);

    const updateRes = await Call<UpdateDatasetCollaboratorBodyType, Record<string, never>, void>(
      updateHandler,
      {
        auth: users.owner,
        body: {
          datasetId: String(dataset._id),
          collaborators: [{ tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }]
        }
      }
    );
    expect(updateRes.code).toBe(200);

    const memberClb = await MongoResourcePermission.findOne({
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: dataset._id,
      tmbId: users.members[0].tmbId
    }).lean();
    expect(memberClb?.permission).toBe(ReadRoleVal);
  });
});
