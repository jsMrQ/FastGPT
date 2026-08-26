import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { ChatAgentHelperMetadataType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import type { AuxiliaryGenerationProcessorParams } from '../type';
import { runAuxiliaryGenerationAgentLoop } from '../agentLoop';
import { buildAgentLoopCoreRequestMessages } from '../../../workflow/dispatch/ai/agentLoopCore/application/context/messages';
import { buildAgentLoopCoreAssistantResponsesFromMessages } from '../../../workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/fromMessages';
import { createAgentLoopCoreAskInteractive } from '../../../workflow/dispatch/ai/agentLoopCore/adapter/interactive';
import {
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCorePausedMemories,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory
} from '../../../workflow/dispatch/ai/agentLoopCore/adapter/memory/providerState';
import { getDefaultLLMModel } from '../../model';
import type { ChatAgentHelperResourceCatalog } from './catalog';
import { buildChatAgentHelperSystemPrompt } from './prompt';
import { chatAgentHelperGenerateConfigTool, executeChatAgentHelperGenerateConfig } from './tools';
import { ChatAgentHelperMemoryNodeId } from './constants';

export type ChatAgentHelperProcessorData = {
  metadata: ChatAgentHelperMetadataType;
  catalog: ChatAgentHelperResourceCatalog;
};

/**
 * Chat Agent Helper 业务 processor。
 *
 * 负责：拼提示词、注入 generate_config、运行辅助生成 Agent Loop、
 * 推送 chatAgentConfig / interactive，并返回可落库的 aiResponse + memories。
 */
export const runChatAgentHelperProcessor = async ({
  query,
  userAnswer,
  files,
  data,
  histories,
  streamWriter,
  checkIsStopping,
  usageSink,
  user
}: AuxiliaryGenerationProcessorParams<ChatAgentHelperProcessorData>) => {
  const { metadata, catalog } = data;
  const model = metadata.modelConfig?.model || getDefaultLLMModel().model;
  const systemPrompt = buildChatAgentHelperSystemPrompt({ metadata, catalog });

  const lastInteractive = getLastInteractiveValue(histories);
  const restoredMemory = readAgentLoopCoreProviderStateMemory({
    histories,
    nodeId: ChatAgentHelperMemoryNodeId
  });
  const { providerState, isAskResume } = prepareAgentLoopCoreProviderRunState({
    restoredProviderState: restoredMemory.providerState,
    hasLastInteractive: !!lastInteractive
  });

  const historyMessages = buildAgentLoopCoreRequestMessages({ messages: histories });
  const messages = isAskResume
    ? historyMessages
    : [
        ...historyMessages,
        {
          role: 'user' as const,
          content: buildUserQueryText({ query, files })
        }
      ];

  const result = await runAuxiliaryGenerationAgentLoop({
    teamId: user.teamId,
    model,
    systemPrompt,
    messages,
    useVision: false,
    streamWriter,
    checkIsStopping,
    usageSink,
    providerState,
    userAnswer: isAskResume ? userAnswer || query : undefined,
    runtimeTools: [chatAgentHelperGenerateConfigTool],
    executeTool: async ({ call }) => {
      if (call.function.name !== chatAgentHelperGenerateConfigTool.function.name) {
        return {
          response: `Unknown tool: ${call.function.name}`,
          assistantMessages: [],
          usages: [],
          errorMessage: `Unknown tool: ${call.function.name}`
        };
      }

      const toolResult = executeChatAgentHelperGenerateConfig({
        rawArguments: call.function.arguments || '',
        catalog
      });

      if (toolResult.formData) {
        streamWriter?.({
          event: AuxiliaryGenerationEventEnum.chatAgentConfig,
          data: toolResult.formData
        });
      }

      return toolResult;
    }
  });

  const aiResponse = buildAgentLoopCoreAssistantResponsesFromMessages({
    messages: result.assistantMessages,
    reserveTool: true,
    reserveReason: true,
    getToolInfo: (name) => ({
      name,
      avatar: ''
    })
  });

  const memories =
    result.status === 'paused' && result.pause?.type === 'ask' && result.providerState
      ? buildAgentLoopCorePausedMemories({
          nodeId: ChatAgentHelperMemoryNodeId,
          providerState: result.providerState
        })
      : buildAgentLoopCoreDoneMemories({ nodeId: ChatAgentHelperMemoryNodeId });

  if (result.status === 'paused' && result.pause?.type === 'ask' && result.pause.askId) {
    const interactive = createAgentLoopCoreAskInteractive({
      askId: result.pause.askId,
      ask: result.pause.ask
    });
    aiResponse.push({ interactive } as AIChatItemValueItemType);
    streamWriter?.({
      event: AuxiliaryGenerationEventEnum.interactive,
      data: { interactive }
    });
  }

  const usage = result.usages.reduce(
    (acc, item) => ({
      model: item.model || acc.model || model,
      inputTokens: acc.inputTokens + (item.inputTokens || 0),
      outputTokens: acc.outputTokens + (item.outputTokens || 0)
    }),
    { model, inputTokens: 0, outputTokens: 0 }
  );

  return {
    aiResponse,
    memories,
    usage
  };
};

const buildUserQueryText = ({
  query,
  files
}: {
  query: string;
  files: AuxiliaryGenerationProcessorParams['files'];
}) => {
  if (!files?.length) return query;
  const fileNames = files.map((file) => file.name).filter(Boolean);
  if (!fileNames.length) return query;
  return `${query}\n\n[Attachments: ${fileNames.join(', ')}]`;
};
