import { afterEach, describe, expect, it } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';

describe('getTrainingModeByCollection', () => {
  const originalFeConfigs = global.feConfigs;

  afterEach(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('should use imageParse only when plus is enabled', () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.imageParse
      })
    ).toBe(TrainingModeEnum.imageParse);

    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.imageParse
      })
    ).toBe(TrainingModeEnum.chunk);
  });

  it('should keep qa mode', () => {
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.qa
      })
    ).toBe(TrainingModeEnum.qa);
  });

  it('should enable image index without plus when capability exists', () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        imageIndex: true,
        supportImageIndex: true
      })
    ).toBe(TrainingModeEnum.image);
  });

  it('should enable auto indexes without plus', () => {
    global.feConfigs = { ...global.feConfigs, isPlus: false } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        autoIndexes: true
      })
    ).toBe(TrainingModeEnum.auto);
  });

  it('should fall back to chunk when enhanced options are off', () => {
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      })
    ).toBe(TrainingModeEnum.chunk);
  });

  it('should not use image index without support even if plus is on', () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        imageIndex: true,
        supportImageIndex: false,
        autoIndexes: false
      })
    ).toBe(TrainingModeEnum.chunk);
  });

  it('should prefer image index over auto indexes', () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true } as any;
    expect(
      getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        autoIndexes: true,
        imageIndex: true,
        supportImageIndex: true
      })
    ).toBe(TrainingModeEnum.image);
  });
});
