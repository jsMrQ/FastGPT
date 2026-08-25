import { Types } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../collection/schema';
import { MongoDatasetCollectionTags } from './schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DatasetTagType, TagUsageType } from '@fastgpt/global/core/dataset/type';

const toTagItem = (tag: { _id: unknown; tag: string }): DatasetTagType => ({
  _id: String(tag._id),
  tag: tag.tag
});

/**
 * 创建知识库集合标签。同名标签视为非法参数，避免筛选器出现重复项。
 */
export const createDatasetCollectionTag = async ({
  teamId,
  datasetId,
  tag
}: {
  teamId: string;
  datasetId: string;
  tag: string;
}): Promise<DatasetTagType> => {
  const name = tag.trim();
  if (!name) return Promise.reject(CommonErrEnum.invalidParams);

  const exists = await MongoDatasetCollectionTags.findOne({
    teamId,
    datasetId,
    tag: name
  }).lean();
  if (exists) return Promise.reject(CommonErrEnum.invalidParams);

  const [created] = await MongoDatasetCollectionTags.create([
    {
      teamId,
      datasetId,
      tag: name
    }
  ]);
  return toTagItem(created);
};

/**
 * 分页列出标签，searchText 对标签名做不区分大小写模糊匹配。
 */
export const listDatasetCollectionTags = async ({
  teamId,
  datasetId,
  searchText,
  offset,
  pageSize
}: {
  teamId: string;
  datasetId: string;
  searchText?: string;
  offset: number;
  pageSize: number;
}): Promise<{ total: number; list: DatasetTagType[] }> => {
  const query: Record<string, unknown> = { teamId, datasetId };
  const keyword = searchText?.trim();
  if (keyword) {
    query.tag = { $regex: keyword, $options: 'i' };
  }

  const [total, list] = await Promise.all([
    MongoDatasetCollectionTags.countDocuments(query),
    MongoDatasetCollectionTags.find(query).sort({ _id: -1 }).skip(offset).limit(pageSize).lean()
  ]);

  return {
    total,
    list: list.map(toTagItem)
  };
};

export const listAllDatasetCollectionTags = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DatasetTagType[]> => {
  const list = await MongoDatasetCollectionTags.find({ teamId, datasetId })
    .sort({ _id: -1 })
    .lean();
  return list.map(toTagItem);
};

/**
 * 重命名标签。集合上存的是标签 ID，因此只改标签文档即可。
 */
export const updateDatasetCollectionTag = async ({
  teamId,
  datasetId,
  tagId,
  tag
}: {
  teamId: string;
  datasetId: string;
  tagId: string;
  tag: string;
}) => {
  const name = tag.trim();
  if (!name) return Promise.reject(CommonErrEnum.invalidParams);

  const current = await MongoDatasetCollectionTags.findOne({
    _id: new Types.ObjectId(tagId),
    teamId,
    datasetId
  }).lean();
  if (!current) return Promise.reject(CommonErrEnum.invalidResource);

  const duplicated = await MongoDatasetCollectionTags.findOne({
    teamId,
    datasetId,
    tag: name,
    _id: { $ne: current._id }
  }).lean();
  if (duplicated) return Promise.reject(CommonErrEnum.invalidParams);

  await MongoDatasetCollectionTags.updateOne({ _id: current._id }, { $set: { tag: name } });
};

/**
 * 删除标签文档，并从本知识库所有集合的 tags 数组中 pull 该 ID。
 */
export const deleteDatasetCollectionTag = async ({
  teamId,
  datasetId,
  tagId
}: {
  teamId: string;
  datasetId: string;
  tagId: string;
}) => {
  const current = await MongoDatasetCollectionTags.findOne({
    _id: new Types.ObjectId(tagId),
    teamId,
    datasetId
  }).lean();
  if (!current) return Promise.reject(CommonErrEnum.invalidResource);

  const tagIdStr = String(current._id);
  await mongoSessionRun(async (session) => {
    await MongoDatasetCollectionTags.deleteOne({ _id: current._id }, { session });
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId, tags: tagIdStr },
      { $pull: { tags: tagIdStr } },
      { session }
    );
  });
};

/**
 * 覆盖式把某个标签绑定到 collectionIds：相对 originCollectionIds 做 diff。
 * 标签文档不存在时先创建，与前端「管理标签」里勾选集合保存的语义一致。
 */
export const addTagToCollections = async ({
  teamId,
  datasetId,
  tag,
  originCollectionIds,
  collectionIds
}: {
  teamId: string;
  datasetId: string;
  tag: string;
  originCollectionIds: string[];
  collectionIds: string[];
}) => {
  const name = tag.trim();
  if (!name) return Promise.reject(CommonErrEnum.invalidParams);

  await mongoSessionRun(async (session) => {
    let tagDoc = await MongoDatasetCollectionTags.findOne({
      teamId,
      datasetId,
      tag: name
    }).session(session);

    if (!tagDoc) {
      const [created] = await MongoDatasetCollectionTags.create(
        [{ teamId, datasetId, tag: name }],
        { session }
      );
      tagDoc = created;
    }

    const tagIdStr = String(tagDoc._id);
    const originSet = new Set(originCollectionIds);
    const nextSet = new Set(collectionIds);
    const toAdd = collectionIds.filter((id) => !originSet.has(id));
    const toRemove = originCollectionIds.filter((id) => !nextSet.has(id));

    if (toAdd.length > 0) {
      await MongoDatasetCollection.updateMany(
        {
          _id: { $in: toAdd.map((id) => new Types.ObjectId(id)) },
          teamId,
          datasetId
        },
        { $addToSet: { tags: tagIdStr } },
        { session }
      );
    }
    if (toRemove.length > 0) {
      await MongoDatasetCollection.updateMany(
        {
          _id: { $in: toRemove.map((id) => new Types.ObjectId(id)) },
          teamId,
          datasetId
        },
        { $pull: { tags: tagIdStr } },
        { session }
      );
    }
  });
};

export const getDatasetTagUsage = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<TagUsageType[]> => {
  const tags = await MongoDatasetCollectionTags.find({ teamId, datasetId }, '_id').lean();
  if (tags.length === 0) return [];

  const tagIds = tags.map((item) => String(item._id));
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId, tags: { $in: tagIds } },
    '_id tags'
  ).lean();

  return tagIds.map((tagId) => ({
    tagId,
    collections: collections
      .filter((collection) => (collection.tags || []).includes(tagId))
      .map((collection) => String(collection._id))
  }));
};
