import { Types } from '../../../common/mongo';
import { MongoAppChatLog } from './chatLogsSchema';
import { AppLogTimespanEnum } from '@fastgpt/global/core/app/logs/constants';
import { calculateOffsetDates } from '@fastgpt/global/core/app/logs/utils';
import type {
  getChartDataBody,
  getChartDataResponse,
  getTotalDataResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

const timespanToMongoUnit = (
  timespan: AppLogTimespanEnum
): 'day' | 'week' | 'month' | 'quarter' => {
  if (timespan === AppLogTimespanEnum.week) return 'week';
  if (timespan === AppLogTimespanEnum.month) return 'month';
  if (timespan === AppLogTimespanEnum.quarter) return 'quarter';
  return 'day';
};

type ChartParams = {
  teamId: string;
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  source?: ChatSourceEnum[];
  offset: number;
  userTimespan: AppLogTimespanEnum;
  chatTimespan: AppLogTimespanEnum;
  appTimespan: AppLogTimespanEnum;
};

/**
 * 汇总应用维度总量：用户数 / 会话数 / 积分。
 * 数据源为 app_chat_logs（saveChat 写入），与商业版图表契约对齐。
 */
export const getAppChatLogTotalData = async ({
  teamId,
  appId
}: {
  teamId: string;
  appId: string;
}): Promise<getTotalDataResponse> => {
  const match = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId)
  };

  const [totalChats, pointsAgg, users] = await Promise.all([
    MongoAppChatLog.countDocuments(match),
    MongoAppChatLog.aggregate<{ totalPoints: number }>([
      { $match: match },
      { $group: { _id: null, totalPoints: { $sum: '$totalPoints' } } }
    ]),
    MongoAppChatLog.distinct('userId', match)
  ]);

  return {
    totalUsers: users.length,
    totalChats,
    totalPoints: pointsAgg[0]?.totalPoints ?? 0
  };
};

/**
 * 按时间桶聚合用户 / 对话 / 应用效果三类图表序列。
 * retention：当前桶活跃且在 T+offset 桶仍出现的用户数（简化对齐商业版 T+N）。
 */
export const getAppChatLogChartData = async (
  params: ChartParams
): Promise<getChartDataResponse> => {
  const {
    teamId,
    appId,
    dateStart,
    dateEnd,
    source,
    offset,
    userTimespan,
    chatTimespan,
    appTimespan
  } = params;

  const baseMatch: Record<string, unknown> = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId)
  };
  if (source?.length) {
    baseMatch.source = { $in: source };
  }

  const [userData, chatData, appData] = await Promise.all([
    aggregateUserSeries({
      baseMatch,
      dateStart,
      dateEnd,
      timespan: userTimespan,
      offset
    }),
    aggregateChatSeries({ baseMatch, dateStart, dateEnd, timespan: chatTimespan }),
    aggregateAppSeries({ baseMatch, dateStart, dateEnd, timespan: appTimespan })
  ]);

  return { userData, chatData, appData };
};

async function aggregateChatSeries({
  baseMatch,
  dateStart,
  dateEnd,
  timespan
}: {
  baseMatch: Record<string, unknown>;
  dateStart: Date;
  dateEnd: Date;
  timespan: AppLogTimespanEnum;
}) {
  const unit = timespanToMongoUnit(timespan);
  const rows = await MongoAppChatLog.aggregate([
    {
      $match: {
        ...baseMatch,
        updateTime: { $gte: dateStart, $lte: dateEnd }
      }
    },
    {
      $group: {
        _id: { $dateTrunc: { date: '$updateTime', unit, startOfWeek: 'monday' } },
        chatCount: { $sum: 1 },
        chatItemCount: { $sum: '$chatItemCount' },
        errorCount: { $sum: '$errorCount' },
        points: { $sum: '$totalPoints' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return rows.map((row) => ({
    timestamp: new Date(row._id).getTime(),
    summary: {
      chatCount: row.chatCount ?? 0,
      chatItemCount: row.chatItemCount ?? 0,
      errorCount: row.errorCount ?? 0,
      points: row.points ?? 0
    }
  }));
}

async function aggregateAppSeries({
  baseMatch,
  dateStart,
  dateEnd,
  timespan
}: {
  baseMatch: Record<string, unknown>;
  dateStart: Date;
  dateEnd: Date;
  timespan: AppLogTimespanEnum;
}) {
  const unit = timespanToMongoUnit(timespan);
  const rows = await MongoAppChatLog.aggregate([
    {
      $match: {
        ...baseMatch,
        updateTime: { $gte: dateStart, $lte: dateEnd }
      }
    },
    {
      $group: {
        _id: { $dateTrunc: { date: '$updateTime', unit, startOfWeek: 'monday' } },
        goodFeedBackCount: { $sum: '$goodFeedbackCount' },
        badFeedBackCount: { $sum: '$badFeedbackCount' },
        chatCount: { $sum: 1 },
        totalResponseTime: { $sum: '$totalResponseTime' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return rows.map((row) => ({
    timestamp: new Date(row._id).getTime(),
    summary: {
      goodFeedBackCount: row.goodFeedBackCount ?? 0,
      badFeedBackCount: row.badFeedBackCount ?? 0,
      chatCount: row.chatCount ?? 0,
      totalResponseTime: row.totalResponseTime ?? 0
    }
  }));
}

async function aggregateUserSeries({
  baseMatch,
  dateStart,
  dateEnd,
  timespan,
  offset
}: {
  baseMatch: Record<string, unknown>;
  dateStart: Date;
  dateEnd: Date;
  timespan: AppLogTimespanEnum;
  offset: number;
}) {
  const unit = timespanToMongoUnit(timespan);

  const [activityRows, newUserRows, sourceRows] = await Promise.all([
    MongoAppChatLog.aggregate([
      {
        $match: {
          ...baseMatch,
          updateTime: { $gte: dateStart, $lte: dateEnd }
        }
      },
      {
        $group: {
          _id: {
            bucket: { $dateTrunc: { date: '$updateTime', unit, startOfWeek: 'monday' } },
            userId: '$userId'
          },
          points: { $sum: '$totalPoints' }
        }
      },
      {
        $group: {
          _id: '$_id.bucket',
          userIds: { $addToSet: '$_id.userId' },
          points: { $sum: '$points' }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    MongoAppChatLog.aggregate([
      {
        $match: {
          ...baseMatch,
          isFirstChat: true,
          createTime: { $gte: dateStart, $lte: dateEnd }
        }
      },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createTime', unit, startOfWeek: 'monday' } },
          userIds: { $addToSet: '$userId' }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    MongoAppChatLog.aggregate([
      {
        $match: {
          ...baseMatch,
          updateTime: { $gte: dateStart, $lte: dateEnd }
        }
      },
      {
        $group: {
          _id: {
            bucket: { $dateTrunc: { date: '$updateTime', unit, startOfWeek: 'monday' } },
            source: '$source',
            userId: '$userId'
          }
        }
      },
      {
        $group: {
          _id: { bucket: '$_id.bucket', source: '$_id.source' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const newUserMap = new Map<number, number>(
    newUserRows.map((row) => [new Date(row._id).getTime(), (row.userIds as string[]).length])
  );

  const sourceMapByBucket = new Map<number, Record<string, number>>();
  for (const row of sourceRows) {
    const ts = new Date(row._id.bucket).getTime();
    const current = sourceMapByBucket.get(ts) || {};
    current[String(row._id.source)] = row.count;
    sourceMapByBucket.set(ts, current);
  }

  // 留存：当前桶用户在 T+offset 时间窗内仍有会话
  const { offsetStart, offsetEnd } = calculateOffsetDates(dateStart, dateEnd, offset, timespan);
  const futureLogs = await MongoAppChatLog.find(
    {
      ...baseMatch,
      updateTime: { $gte: offsetStart, $lte: offsetEnd }
    },
    { userId: 1, updateTime: 1 }
  ).lean();

  const futureUsersByBucket = new Map<number, Set<string>>();
  for (const log of futureLogs) {
    const bucketTs = truncateDate(log.updateTime, timespan).getTime();
    // 映射回「相对原桶」：未来桶减去 offset
    const originTs = shiftBucketTimestamp(bucketTs, -offset, timespan);
    if (!futureUsersByBucket.has(originTs)) {
      futureUsersByBucket.set(originTs, new Set());
    }
    futureUsersByBucket.get(originTs)!.add(log.userId);
  }

  return activityRows.map((row) => {
    const ts = new Date(row._id).getTime();
    const userIds = (row.userIds as string[]) || [];
    const futureSet = futureUsersByBucket.get(ts);
    const retentionUserCount = futureSet ? userIds.filter((id) => futureSet.has(id)).length : 0;

    return {
      timestamp: ts,
      summary: {
        userCount: userIds.length,
        newUserCount: newUserMap.get(ts) ?? 0,
        retentionUserCount,
        points: row.points ?? 0,
        sourceCountMap: sourceMapByBucket.get(ts) ?? {}
      }
    };
  });
}

function truncateDate(date: Date, timespan: AppLogTimespanEnum): Date {
  const d = new Date(date);
  if (timespan === AppLogTimespanEnum.week) {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // monday start
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (timespan === AppLogTimespanEnum.month) {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (timespan === AppLogTimespanEnum.quarter) {
    const q = Math.floor(d.getMonth() / 3) * 3;
    d.setMonth(q, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftBucketTimestamp(ts: number, offset: number, timespan: AppLogTimespanEnum): number {
  const d = new Date(ts);
  if (timespan === AppLogTimespanEnum.quarter) {
    d.setMonth(d.getMonth() + offset * 3);
  } else if (timespan === AppLogTimespanEnum.month) {
    d.setMonth(d.getMonth() + offset);
  } else if (timespan === AppLogTimespanEnum.week) {
    d.setDate(d.getDate() + offset * 7);
  } else {
    d.setDate(d.getDate() + offset);
  }
  return truncateDate(d, timespan).getTime();
}

// re-export type for callers that want body-shaped input
export type { getChartDataBody };
