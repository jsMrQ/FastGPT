import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/system/utils')>();
  return {
    ...actual,
    delay: vi.fn(async () => undefined)
  };
});

import { generateAutoIndex } from '@/service/core/dataset/queues/generateAutoIndex';

const createContext = async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'auto index dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModel: 'text-embedding-ada-002',
    agentModel: 'gpt-5'
  });
  const collection = await MongoDatasetCollection.create({
    name: 'auto index collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id
  });
  return { root, dataset, collection };
};

describe('generateAutoIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.autoIndexQueueLen = 0;
    global.systemEnv = {
      ...global.systemEnv,
      qaMaxProcess: 10
    };
    global.embeddingModelMap.set('text-embedding-ada-002', {
      ...global.systemDefaultModel.embedding,
      model: 'text-embedding-ada-002',
      name: 'text-embedding-ada-002'
    });
  });

  it('should return immediately when the queue is full', async () => {
    global.autoIndexQueueLen = 10;
    global.systemEnv.qaMaxProcess = 10;
    await generateAutoIndex();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(global.autoIndexQueueLen).toBe(10);
  });

  it('should skip llm for empty text and still enqueue chunk training', async () => {
    const { root, dataset, collection } = await createContext();
    const autoRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.auto,
      q: '   ',
      retryCount: 5
    });

    await generateAutoIndex();

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(await MongoDatasetTraining.findById(autoRow._id)).toBeNull();
    const chunkRow = await MongoDatasetTraining.findOne({
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(chunkRow).toBeTruthy();
  });

  it('should generate extra indexes from mocked llm and move the row to chunk', async () => {
    const { root, dataset, collection } = await createContext();
    createLLMResponseMock.mockResolvedValue({
      answerText: '["补充问句","知识库检索"]',
      usage: { inputTokens: 8, outputTokens: 4 }
    });
    const autoRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.auto,
      q: '原文内容',
      a: '补充',
      retryCount: 5
    });

    await generateAutoIndex();

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(await MongoDatasetTraining.findById(autoRow._id)).toBeNull();
    const chunkRow = await MongoDatasetTraining.findOne({
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(chunkRow?.q).toBe('原文内容');
    expect(chunkRow?.indexes?.map((item) => item.text)).toEqual(['补充问句', '知识库检索']);
    expect(chunkRow?.indexes?.[0]?.type).toBe(DatasetDataIndexTypeEnum.question);
    expect(global.autoIndexQueueLen).toBe(0);
  });

  it('should keep the auto row and write errorMsg when llm fails', async () => {
    const { root, dataset, collection } = await createContext();
    createLLMResponseMock.mockRejectedValue(new Error('llm timeout'));
    const autoRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.auto,
      q: '原文内容',
      retryCount: 5
    });

    await generateAutoIndex();

    const remain = await MongoDatasetTraining.findById(autoRow._id).lean();
    expect(remain?.errorMsg).toContain('llm timeout');
    expect(remain?.mode).toBe(TrainingModeEnum.auto);
  });

  it('should delete the task when dataset is missing', async () => {
    const { root, collection } = await createContext();
    const autoRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: '507f1f77bcf86cd799439011',
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.auto,
      q: '原文',
      retryCount: 5
    });

    await generateAutoIndex();

    expect(await MongoDatasetTraining.findById(autoRow._id)).toBeNull();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });
});
