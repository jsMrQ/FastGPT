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

import { generateImageIndex } from '@/service/core/dataset/queues/generateImageIndex';

const createContext = async ({
  autoIndexes = false,
  vlmModel
}: { autoIndexes?: boolean; vlmModel?: string } = {}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'image index dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModel: 'text-embedding-ada-002',
    agentModel: 'gpt-5',
    vlmModel
  });
  const collection = await MongoDatasetCollection.create({
    name: 'image index collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    imageIndex: true,
    autoIndexes
  });
  return { root, dataset, collection };
};

describe('generateImageIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.imageIndexQueueLen = 0;
    global.systemEnv = {
      ...global.systemEnv,
      vlmMaxProcess: 10
    };
    global.embeddingModelMap.set('text-embedding-ada-002', {
      ...global.systemDefaultModel.embedding,
      model: 'text-embedding-ada-002',
      name: 'text-embedding-ada-002'
    });
    global.llmModelMap.set('vlm-model', {
      ...global.systemDefaultModel.llm,
      model: 'vlm-model',
      name: 'vlm-model',
      vision: true
    });
  });

  it('should return immediately when the queue is full', async () => {
    global.imageIndexQueueLen = 10;
    global.systemEnv.vlmMaxProcess = 10;
    await generateImageIndex();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should enqueue chunk without llm when there is no vlm', async () => {
    const { root, dataset, collection } = await createContext();
    const imageRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.image,
      q: 'text ![img](https://example.com/a.png)',
      retryCount: 5
    });

    await generateImageIndex();

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(await MongoDatasetTraining.findById(imageRow._id)).toBeNull();
    const next = await MongoDatasetTraining.findOne({
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(next?.q).toContain('https://example.com/a.png');
  });

  it('should caption markdown images and move to auto when autoIndexes is on', async () => {
    const { root, dataset, collection } = await createContext({
      autoIndexes: true,
      vlmModel: 'vlm-model'
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: '红色按钮截图',
      usage: { inputTokens: 5, outputTokens: 3 }
    });
    const imageRow = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.image,
      q: 'see ![ui](https://example.com/ui.png)',
      retryCount: 5
    });

    await generateImageIndex();

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(await MongoDatasetTraining.findById(imageRow._id)).toBeNull();
    const next = await MongoDatasetTraining.findOne({
      collectionId: collection._id,
      mode: TrainingModeEnum.auto
    }).lean();
    expect(next?.imageDescMap).toEqual({ 'https://example.com/ui.png': '红色按钮截图' });
    expect(next?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.image,
          text: '红色按钮截图'
        })
      ])
    );
  });
});
