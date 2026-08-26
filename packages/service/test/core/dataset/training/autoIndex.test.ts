import { describe, expect, it } from 'vitest';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  buildAutoIndexes,
  parseAutoIndexTexts
} from '@fastgpt/service/core/dataset/training/autoIndex';

describe('parseAutoIndexTexts', () => {
  it('should parse a json array and drop short or duplicate items', () => {
    expect(
      parseAutoIndexTexts('```json\n["FastGPT 是什么","FastGPT 是什么","a","知识库"]\n```')
    ).toEqual(['FastGPT 是什么', '知识库']);
  });

  it('should ignore non-array json and return empty', () => {
    expect(parseAutoIndexTexts('{"indexes":["a"]}')).toEqual([]);
  });

  it('should split numbered lines when json parse fails', () => {
    expect(parseAutoIndexTexts('1. 什么是向量检索\n2) 知识库分块\n- 知识库分块')).toEqual([
      '什么是向量检索',
      '知识库分块'
    ]);
  });

  it('should cap results at eight items', () => {
    const answer = JSON.stringify(Array.from({ length: 12 }, (_, i) => `索引条目${i}`));
    expect(parseAutoIndexTexts(answer)).toHaveLength(8);
  });

  it('should return empty for blank answer', () => {
    expect(parseAutoIndexTexts('   ')).toEqual([]);
  });
});

describe('buildAutoIndexes', () => {
  it('should keep existing indexes and append generated questions', () => {
    expect(
      buildAutoIndexes({
        q: '原文内容',
        existing: [{ type: DatasetDataIndexTypeEnum.custom, text: '手工索引' }],
        generated: ['原文内容', '补充问句', '手工索引']
      })
    ).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: '手工索引' },
      { type: DatasetDataIndexTypeEnum.question, text: '补充问句' }
    ]);
  });

  it('should skip empty existing text and default missing type to custom', () => {
    expect(
      buildAutoIndexes({
        q: '',
        existing: [{ text: '  ' } as any, { text: '保留' }],
        generated: ['保留', '新索引']
      })
    ).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: '保留' },
      { type: DatasetDataIndexTypeEnum.question, text: '新索引' }
    ]);
  });
});
