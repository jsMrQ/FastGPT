import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { replaceVariable } from '@fastgpt/service/common/string/replaceVariable';
import { Prompt_AutoIndex } from '@fastgpt/global/core/ai/prompt/agent';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  buildAutoIndexes,
  parseAutoIndexTexts
} from '@fastgpt/service/core/dataset/training/autoIndex';

const logger = getLogger(LogCategories.MODULE.DATASET.INDEX_EXTEND);

const reduceQueue = () => {
  global.autoIndexQueueLen = global.autoIndexQueueLen > 0 ? global.autoIndexQueueLen - 1 : 0;

  return global.autoIndexQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
};

/**
 * 消费 TrainingModeEnum.auto 队列：调用 LLM 生成补充检索索引后，
 * 以 chunk 模式重新入队做向量化。LLM 失败时保留任务并写入 errorMsg；
 * 解析不到补充索引时仍入队原文，避免训练卡住。
 */
export async function generateAutoIndex(): Promise<void> {
  const max = global.systemEnv?.qaMaxProcess || 10;
  logger.debug('Auto index queue size check', { queueSize: global.autoIndexQueueLen, max });

  if (global.autoIndexQueueLen >= max) return;
  global.autoIndexQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();
      const {
        data,
        text,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.auto,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -10) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'agentModel vectorModel vlmModel'
              }
            ])
            .lean();

          if (!data) {
            return {
              done: true
            };
          }
          return {
            data,
            text: data.q
          };
        } catch {
          return {
            error: true
          };
        }
      })();

      if (done || !data) {
        break;
      }
      if (error) {
        logger.error('Auto index queue fetch task failed');
        await delay(500);
        continue;
      }

      if (!data.dataset) {
        logger.info('Auto index queue task skipped: dataset missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }
      if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
        continue;
      }

      logger.info('Auto index queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId
      });

      try {
        const modelData = getLLMModel(data.dataset.agentModel);
        let generated: string[] = [];
        let inputTokens = 0;
        let outputTokens = 0;

        // 空文本无法增强，直接按原文入向量队列
        if (text?.trim()) {
          const prompt = `${Prompt_AutoIndex.description}
  ${replaceVariable(Prompt_AutoIndex.fixedText, { text })}`;

          const messages: ChatCompletionMessageParam[] = [
            {
              role: 'user',
              content: prompt
            }
          ];

          const { answerText: answer, usage } = await createLLMResponse({
            teamId: data.teamId,
            saveLLMResponseRecord: false,
            body: {
              model: modelData.model,
              messages,
              stream: true
            }
          });
          inputTokens = usage.inputTokens;
          outputTokens = usage.outputTokens;
          generated = parseAutoIndexTexts(answer);
        }

        const indexes = buildAutoIndexes({
          q: text || '',
          existing: data.indexes,
          generated
        });

        await pushDataListToTrainingQueue({
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          mode: TrainingModeEnum.chunk,
          data: [
            {
              q: text,
              a: data.a,
              imageId: data.imageId,
              chunkIndex: data.chunkIndex,
              indexes,
              metadata: data.dataMetadata,
              imageDescMap: data.imageDescMap
            }
          ],
          billId: data.billId,
          vectorModel: data.dataset.vectorModel,
          agentModel: data.dataset.agentModel,
          vlmModel: data.dataset.vlmModel
        });

        await MongoDatasetTraining.findByIdAndDelete(data._id);

        if (inputTokens || outputTokens) {
          pushLLMTrainingUsage({
            teamId: data.teamId,
            inputTokens,
            outputTokens,
            usageId: data.billId,
            model: modelData.model,
            type: UsageItemTypeEnum.training_autoIndex
          });
        }

        logger.info('Auto index queue task finished', {
          durationMs: Date.now() - startTime,
          indexCount: indexes.length,
          usage: { inputTokens, outputTokens },
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
      } catch (err: any) {
        logger.error('Auto index queue task failed', {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'unknown error')
          }
        );

        await delay(100);
      }
    }
  } catch (error) {
    logger.error('Auto index queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Auto index queue drained', { queueSize: global.autoIndexQueueLen });
  }
  logger.debug('Auto index queue loop exit', { queueSize: global.autoIndexQueueLen });
}
