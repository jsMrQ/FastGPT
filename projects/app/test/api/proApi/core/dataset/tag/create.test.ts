import { describe, it, expect } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetTypeEnum, DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import createHandler from '@/pages/api/proApi/core/dataset/tag/create';
import listHandler from '@/pages/api/proApi/core/dataset/tag/list';
import updateHandler from '@/pages/api/proApi/core/dataset/tag/update';
import deleteHandler from '@/pages/api/proApi/core/dataset/tag/delete';
import addHandler from '@/pages/api/proApi/core/dataset/tag/addToCollections';
import getAllHandler from '@/pages/api/proApi/core/dataset/tag/getAllTags';
import usageHandler from '@/pages/api/proApi/core/dataset/tag/tagUsage';

const createDataset = async (users: Awaited<ReturnType<typeof getFakeUsers>>) => {
  return mongoSessionRun(async (session) => {
    const created = await MongoDataset.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      name: 'tag-kb',
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
};

describe('dataset collection tag APIs', () => {
  it('creates, lists, binds, updates and deletes a tag', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset(users);
    const collection = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      name: 'doc-a',
      type: DatasetCollectionTypeEnum.virtual
    });

    const createRes = await Call(createHandler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id), tag: '合同' }
    });
    expect(createRes.code).toBe(200);
    const tagId = (createRes.data as { _id: string })._id;

    const listRes = await Call(listHandler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id), pageSize: 10, offset: 0 }
    });
    expect(listRes.code).toBe(200);
    expect((listRes.data as { list: { tag: string }[] }).list.map((item) => item.tag)).toContain(
      '合同'
    );

    const addRes = await Call(addHandler, {
      auth: users.owner,
      body: {
        datasetId: String(dataset._id),
        tag: '合同',
        originCollectionIds: [],
        collectionIds: [String(collection._id)]
      }
    });
    expect(addRes.code).toBe(200);

    const usageRes = await Call(usageHandler, {
      auth: users.owner,
      query: { datasetId: String(dataset._id) }
    });
    expect(usageRes.code).toBe(200);
    const usage = usageRes.data as { tagId: string; collections: string[] }[];
    expect(usage.find((item) => item.tagId === tagId)?.collections).toContain(
      String(collection._id)
    );

    const updateRes = await Call(updateHandler, {
      auth: users.owner,
      body: { datasetId: String(dataset._id), tagId, tag: '协议' }
    });
    expect(updateRes.code).toBe(200);

    const allRes = await Call(getAllHandler, {
      auth: users.owner,
      query: { datasetId: String(dataset._id) }
    });
    expect((allRes.data as { list: { tag: string }[] }).list.map((item) => item.tag)).toContain(
      '协议'
    );

    const deleteRes = await Call(deleteHandler, {
      auth: users.owner,
      query: { datasetId: String(dataset._id), id: tagId }
    });
    expect(deleteRes.code).toBe(200);
    expect(await MongoDatasetCollectionTags.countDocuments({ _id: tagId })).toBe(0);

    const refreshed = await MongoDatasetCollection.findById(collection._id).lean();
    expect(refreshed?.tags || []).not.toContain(tagId);
  });
});
