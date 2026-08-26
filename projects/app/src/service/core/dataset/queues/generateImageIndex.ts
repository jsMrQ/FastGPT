import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { generateMarkdownImageCaptions } from '@fastgpt/service/core/dataset/training/imageIndex';
import { getVlmModel } from '@fastgpt/service/core/ai/model';

const logger = getLogger(LogCategories.MODULE.DATASET.IMAGE_INDEX);

const reduceQueue = () => {
  global.imageIndexQueueLen = global.imageIndexQueueLen > 0 ? global.imageIndexQueueLen - 1 : 0;

  return global.imageIndexQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel?: string };
  collection: { autoIndexes?: boolean };
};

/**
 * 消费 TrainingModeEnum.image：用 VLM 给 markdown 图片生成描述索引，
 * 再转入 auto 或 chunk。没有 VLM 或没有图片时仍入队，避免训练卡住。
 */
export async function generateImageIndex(): Promise<void> {
  const max = global.systemEnv?.vlmMaxProcess || 10;
  logger.debug('Image index queue size check', { queueSize: global.imageIndexQueueLen, max });

  if (global.imageIndexQueueLen >= max) return;
  global.imageIndexQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.image,
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
              },
              {
                path: 'collection',
                select: 'autoIndexes'
              }
            ])
            .lean();

          if (!data) {
            return {
              done: true
            };
          }
          return { data };
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
        logger.error('Image index queue fetch task failed');
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.info('Image index queue task skipped: dataset or collection missing', {
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

      try {
        const { imageDescMap, indexes, inputTokens, outputTokens } =
          await generateMarkdownImageCaptions({
            q: data.q,
            a: data.a,
            vlmModel: data.dataset.vlmModel,
            teamId: data.teamId
          });

        const nextMode = data.collection.autoIndexes
          ? TrainingModeEnum.auto
          : TrainingModeEnum.chunk;

        await pushDataListToTrainingQueue({
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          mode: nextMode,
          data: [
            {
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              chunkIndex: data.chunkIndex,
              indexes: [...(data.indexes || []), ...indexes],
              metadata: data.dataMetadata,
              imageDescMap
            }
          ],
          billId: data.billId,
          vectorModel: data.dataset.vectorModel,
          agentModel: data.dataset.agentModel,
          vlmModel: data.dataset.vlmModel
        });

        await MongoDatasetTraining.findByIdAndDelete(data._id);

        if (inputTokens || outputTokens) {
          const vlmModelData = getVlmModel(data.dataset.vlmModel);
          pushLLMTrainingUsage({
            teamId: data.teamId,
            inputTokens,
            outputTokens,
            usageId: data.billId,
            model: vlmModelData?.model || data.dataset.vlmModel || '',
            type: UsageItemTypeEnum.training_imageIndex
          });
        }

        logger.info('Image index queue task finished', {
          durationMs: Date.now() - startTime,
          imageIndexCount: indexes.length,
          nextMode,
          trainingId: data._id
        });
      } catch (err: any) {
        logger.error('Image index queue task failed', {
          error: err,
          trainingId: data._id
        });
        await MongoDatasetTraining.updateOne(
          { _id: data._id },
          {
            errorMsg: getErrText(err, 'unknown error')
          }
        );
        await delay(100);
      }
    }
  } catch (error) {
    logger.error('Image index queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Image index queue drained', { queueSize: global.imageIndexQueueLen });
  }
  logger.debug('Image index queue loop exit', { queueSize: global.imageIndexQueueLen });
}
