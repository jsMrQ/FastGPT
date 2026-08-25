import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

const { mockCreateCollectionAndInsertData, mockAuthDataset, mockCheckDatasetIndexLimit } =
  vi.hoisted(() => ({
    mockCreateCollectionAndInsertData: vi.fn(),
    mockAuthDataset: vi.fn(),
    mockCheckDatasetIndexLimit: vi.fn()
  }));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mockCheckDatasetIndexLimit
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData
}));

vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: ({ req }: { req: { body?: unknown; query?: unknown } }) => ({
    body: req.body,
    query: req.query
  })
}));

import handler from '@/pages/api/proApi/core/dataset/collection/create/externalFileUrl';

describe('create collection by external file url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDataset.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset: { _id: 'dataset-id' }
    });
    mockCheckDatasetIndexLimit.mockResolvedValue(undefined);
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId: 'col-id',
      results: { insertLen: 0 }
    });
  });

  it('creates an externalFile collection and fills missing filename/fileId', async () => {
    const result = await handler({
      body: {
        datasetId: '68ad85a7463006c963799a05',
        externalFileUrl: 'https://example.com/files/demo.pdf'
      }
    } as any);

    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledTimes(1);
    const params = mockCreateCollectionAndInsertData.mock.calls[0][0].createCollectionParams;
    expect(params.type).toBe(DatasetCollectionTypeEnum.externalFile);
    expect(params.externalFileUrl).toBe('https://example.com/files/demo.pdf');
    expect(params.name).toBe('demo.pdf');
    expect(params.externalFileId).toBeTruthy();
    expect(result.collectionId).toBe('col-id');
  });
});
