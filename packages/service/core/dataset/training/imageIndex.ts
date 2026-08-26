import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import { uniqueDatasetDataMarkdownImageUrls } from '../data/utils';
import { getLLMModel } from '../../ai/model';
import { createLLMResponse } from '../../ai/llm/request';
import { normalizeImageToBase64 } from '../search/utils';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.IMAGE_INDEX);

export const IMAGE_INDEX_CAPTION_PROMPT =
  '请用一句话描述这张图片的主体、场景、颜色、文字和关键视觉特征。只输出描述，不要解释。';

/**
 * 为 markdown 里的图片生成 VLM 文本描述索引。
 * 单张失败会跳过，不中断整条训练；没有可用 VLM 时返回空结果，由上游改走向量队列。
 */
export const generateMarkdownImageCaptions = async ({
  q,
  a,
  vlmModel,
  teamId
}: {
  q?: string;
  a?: string;
  vlmModel?: string;
  teamId: string;
}): Promise<{
  imageDescMap: Record<string, string>;
  indexes: Pick<DatasetDataIndexItemType, 'type' | 'text'>[];
  inputTokens: number;
  outputTokens: number;
}> => {
  const urls = uniqueDatasetDataMarkdownImageUrls([q, a]);
  const empty = {
    imageDescMap: {} as Record<string, string>,
    indexes: [] as Pick<DatasetDataIndexItemType, 'type' | 'text'>[],
    inputTokens: 0,
    outputTokens: 0
  };
  if (urls.length === 0 || !vlmModel) return empty;

  const vlmModelData = getLLMModel(vlmModel);
  if (!vlmModelData?.vision) return empty;

  const imageDescMap: Record<string, string> = {};
  const indexes: Pick<DatasetDataIndexItemType, 'type' | 'text'>[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const url of urls) {
    try {
      const { answerText, usage } = await createLLMResponse({
        teamId,
        saveLLMResponseRecord: false,
        body: {
          model: vlmModelData.model,
          stream: true,
          useVision: true,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: await normalizeImageToBase64(url)
                  }
                },
                {
                  type: 'text',
                  text: IMAGE_INDEX_CAPTION_PROMPT
                }
              ]
            }
          ]
        }
      });
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      const text = answerText.trim();
      if (!text) continue;
      imageDescMap[url] = text;
      indexes.push({
        type: DatasetDataIndexTypeEnum.image,
        text
      });
    } catch (error) {
      logger.warn('Markdown image caption failed during training', {
        model: vlmModelData.model,
        url,
        error
      });
    }
  }

  return { imageDescMap, indexes, inputTokens, outputTokens };
};
