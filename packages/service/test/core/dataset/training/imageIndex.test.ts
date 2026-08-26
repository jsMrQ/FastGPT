import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  generateMarkdownImageCaptions,
  IMAGE_INDEX_CAPTION_PROMPT
} from '@fastgpt/service/core/dataset/training/imageIndex';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

describe('generateMarkdownImageCaptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty when there is no markdown image', async () => {
    await expect(
      generateMarkdownImageCaptions({
        q: 'plain text',
        vlmModel: 'vlm',
        teamId: 'team'
      })
    ).resolves.toEqual({
      imageDescMap: {},
      indexes: [],
      inputTokens: 0,
      outputTokens: 0
    });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should return empty when vlm is missing or not vision', async () => {
    await expect(
      generateMarkdownImageCaptions({
        q: '![a](https://example.com/a.png)',
        teamId: 'team'
      })
    ).resolves.toEqual({
      imageDescMap: {},
      indexes: [],
      inputTokens: 0,
      outputTokens: 0
    });

    global.llmModelMap.set('text-llm', {
      ...global.systemDefaultModel.llm,
      model: 'text-llm',
      name: 'text-llm',
      vision: false
    });

    await expect(
      generateMarkdownImageCaptions({
        q: '![a](https://example.com/a.png)',
        vlmModel: 'text-llm',
        teamId: 'team'
      })
    ).resolves.toEqual({
      imageDescMap: {},
      indexes: [],
      inputTokens: 0,
      outputTokens: 0
    });
  });

  it('should caption images and skip a failed image', async () => {
    global.llmModelMap.set('vlm-model', {
      ...global.systemDefaultModel.llm,
      model: 'vlm-model',
      name: 'vlm-model',
      vision: true
    });
    createLLMResponseMock
      .mockResolvedValueOnce({
        answerText: '  一只猫  ',
        usage: { inputTokens: 3, outputTokens: 2 }
      })
      .mockRejectedValueOnce(new Error('vlm down'))
      .mockResolvedValueOnce({
        answerText: '   ',
        usage: { inputTokens: 1, outputTokens: 0 }
      });

    const result = await generateMarkdownImageCaptions({
      q: '![a](https://example.com/a.png) ![b](https://example.com/b.png) ![c](https://example.com/c.png)',
      vlmModel: 'vlm-model',
      teamId: 'team'
    });

    expect(result).toEqual({
      imageDescMap: { 'https://example.com/a.png': '一只猫' },
      indexes: [{ type: DatasetDataIndexTypeEnum.image, text: '一只猫' }],
      inputTokens: 4,
      outputTokens: 2
    });
    expect(createLLMResponseMock.mock.calls[0][0].body.messages[0].content[1].text).toBe(
      IMAGE_INDEX_CAPTION_PROMPT
    );
  });
});
