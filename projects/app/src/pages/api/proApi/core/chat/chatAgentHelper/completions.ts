import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatAgentHelperCompletionsParamsSchema } from '@fastgpt/global/openapi/core/chat/chatAgentHelper/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserError } from '@fastgpt/global/common/error/utils';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { concatHistories } from '@fastgpt/global/core/chat/utils';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import {
  chatAgentHelperFileSelectConfig,
  ChatAgentHelperAppName
} from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps,
  updateInteractiveChat
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration';
import {
  loadChatAgentHelperResourceCatalog,
  runChatAgentHelperProcessor
} from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { sseErrRes } from '@fastgpt/service/common/response';
import type { AuxiliaryGenerationStreamContext } from '@fastgpt/service/core/ai/auxiliaryGeneration/stream';

/**
 * OSS 版 Chat Agent Helper completions。
 *
 * 阴影商业版 /proApi 路径：鉴权、资源目录、辅助生成 loop、配置回填与会话落库。
 */
async function handler(req: ApiRequestProps, res: ApiResponseType) {
  let streamContext: AuxiliaryGenerationStreamContext | undefined;
  const roundState = {
    preparedRound: undefined as Awaited<ReturnType<typeof preChatRound>> | undefined,
    sourceType: ChatSourceTypeEnum.chatAgentHelper as const,
    sourceId: '',
    chatId: '',
    responseChatItemId: '',
    finalized: false
  };

  try {
    const {
      chatId,
      responseChatItemId: responseChatItemIdFromBody = getNanoid(),
      appId,
      messages = [],
      interactive: requestInteractive,
      metadata
    } = parseApiInput({
      req,
      bodySchema: ChatAgentHelperCompletionsParamsSchema
    }).body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new UserError('messages is required');
    }

    const { teamId, tmbId, userId, isRoot, app } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    await assertMemberRateLimit({
      policy: MemberRateLimitPolicy.ChatAgentHelperCompletions,
      memberId: tmbId
    });

    const chatSource = {
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: String(appId)
    };
    roundState.sourceId = chatSource.sourceId;

    const chatMessages = GPTMessages2Chats({ messages });
    const userQuestion = chatMessages.pop() as UserChatItemType | undefined;
    if (!userQuestion) {
      throw new UserError('User question is empty');
    }

    const { histories } = await getChatItems({
      ...chatSource,
      chatId,
      offset: 0,
      limit: 30,
      field: 'obj value memories'
    });
    const newHistories = concatHistories(histories, chatMessages);
    const interactive = requestInteractive || getLastInteractiveValue(newHistories);
    const { text: query } = chatValue2RuntimePrompt(userQuestion.value);

    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId,
      tmbId,
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      responseChatItemId: responseChatItemIdFromBody,
      interactive
    });
    roundState.preparedRound = preparedRound;
    roundState.chatId = preparedRound.chatId;
    roundState.responseChatItemId = preparedRound.responseChatItemId;

    const teamMember = await getTmbInfoByTmbId({ tmbId });
    const catalog = await loadChatAgentHelperResourceCatalog({
      teamId,
      tmbId,
      isOwner: teamMember.permission.isOwner || isRoot,
      lang: getLocale(req)
    });

    const files = (userQuestion.value || [])
      .map((item) => item.file)
      .filter((file): file is NonNullable<typeof file> & { key: string } => !!file?.key)
      .map((file) => ({
        type: file.type,
        key: file.key,
        url: file.url,
        name: file.name || ''
      }));

    const result = await runAuxiliaryGeneration({
      req,
      res,
      teamId,
      tmbId,
      userId,
      isRoot,
      lang: getLocale(req),
      appName: app.name || ChatAgentHelperAppName,
      sourceType: chatSource.sourceType,
      sourceId: chatSource.sourceId,
      chatId: preparedRound.chatId,
      query,
      userAnswer: interactive ? query : undefined,
      files,
      data: {
        metadata: metadata.data,
        catalog
      },
      histories: newHistories,
      usageSource: UsageSourceEnum.assist_generate_agent,
      maxFiles: chatAgentHelperFileSelectConfig.maxFiles,
      customPdfParse: chatAgentHelperFileSelectConfig.customPdfParse,
      processor: runChatAgentHelperProcessor,
      onStreamContextReady: (ctx) => {
        streamContext = ctx;
      }
    });

    const aiContent: AIChatItemType & { dataId?: string } = {
      dataId: preparedRound.responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: result.aiResponse,
      memories: result.memories
    };

    const saveParams: SaveChatProps = {
      ...chatSource,
      chatId: preparedRound.chatId,
      teamId,
      tmbId,
      nodes: [],
      appChatConfig: {},
      variables: {},
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      aiContent,
      durationSeconds: result.durationSeconds,
      metadata: { originIp: getIpFromRequest(req) }
    };

    if (interactive) {
      await updateInteractiveChat({
        interactive,
        shouldFinalizePreparedRound: preparedRound.shouldFinalizePreparedRound,
        ...saveParams
      });
    } else if (preparedRound.shouldFinalizePreparedRound) {
      await finalizeChatRound(saveParams);
    }
    roundState.finalized = true;

    if (!preparedRound.shouldFinalizePreparedRound && preparedRound.shouldPersistChatRound) {
      await updateChatGenerateStatus({
        ...chatSource,
        chatId: preparedRound.chatId,
        status: ChatGenerateStatusEnum.done
      });
    }

    await streamContext?.flushResume();
  } catch (err) {
    const { preparedRound } = roundState;
    if (
      !roundState.finalized &&
      preparedRound?.shouldPersistChatRound &&
      roundState.sourceId &&
      roundState.chatId
    ) {
      if (preparedRound.shouldFinalizePreparedRound) {
        await failChatRound({
          sourceType: roundState.sourceType,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          responseChatItemId: roundState.responseChatItemId,
          error: err
        });
      } else {
        await updateChatGenerateStatus({
          sourceType: roundState.sourceType,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          status: ChatGenerateStatusEnum.error
        });
      }
    }

    if (streamContext) {
      streamContext.writeError(err);
    } else {
      sseErrRes(res, err);
    }
    await streamContext?.flushResume();
  }

  res.end();
}

export default NextAPI(handler);
