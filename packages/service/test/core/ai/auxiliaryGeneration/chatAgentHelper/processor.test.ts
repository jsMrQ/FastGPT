import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

const { runAuxiliaryGenerationAgentLoopMock, getDefaultLLMModelMock } = vi.hoisted(() => ({
  runAuxiliaryGenerationAgentLoopMock: vi.fn(),
  getDefaultLLMModelMock: vi.fn(() => ({ model: 'default-llm' }))
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/agentLoop', () => ({
  runAuxiliaryGenerationAgentLoop: runAuxiliaryGenerationAgentLoopMock
}));

vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model')>()),
  getDefaultLLMModel: getDefaultLLMModelMock
}));

import { runChatAgentHelperProcessor } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/processor';
import type { ChatAgentHelperResourceCatalog } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/catalog';
import { ChatAgentHelperGenerateConfigToolName } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/constants';

const catalog: ChatAgentHelperResourceCatalog = {
  tools: [{ id: 'tool_1', name: '搜索', intro: '' }],
  datasets: [],
  skills: [],
  toolIdSet: new Set(['tool_1']),
  datasetMap: new Map(),
  skillMap: new Map()
};

describe('runChatAgentHelperProcessor', () => {
  beforeEach(() => {
    runAuxiliaryGenerationAgentLoopMock.mockReset();
  });

  it('pushes chatAgentConfig when generate_config succeeds', async () => {
    const streamWriter = vi.fn();
    runAuxiliaryGenerationAgentLoopMock.mockImplementation(async ({ executeTool }) => {
      await executeTool({
        call: {
          id: 'call_1',
          type: 'function',
          function: {
            name: ChatAgentHelperGenerateConfigToolName,
            arguments: JSON.stringify({
              systemPrompt: '新提示词',
              tools: ['tool_1'],
              datasets: [],
              selectedAgentSkills: [],
              fileUploadEnabled: false,
              enableSandboxEnabled: false
            })
          }
        },
        messages: []
      });

      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [{ role: 'assistant', content: '已更新配置' }],
        requestIds: [],
        finishReason: 'stop',
        usages: [
          {
            model: 'gpt-test',
            inputTokens: 10,
            outputTokens: 5,
            totalPoints: 1,
            moduleName: 'agent'
          }
        ],
        answerText: '已更新配置',
        reasoningText: ''
      };
    });

    const result = await runChatAgentHelperProcessor({
      query: '帮我做一个客服 Agent',
      files: [],
      data: {
        metadata: { modelConfig: { model: 'gpt-test' } },
        catalog
      },
      histories: [],
      streamWriter,
      user: {
        teamId: 'team_1',
        tmbId: 'tmb_1',
        userId: 'user_1',
        isRoot: false,
        lang: 'zh-CN'
      }
    });

    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuxiliaryGenerationEventEnum.chatAgentConfig,
        data: expect.objectContaining({
          systemPrompt: '新提示词',
          tools: ['tool_1']
        })
      })
    );
    expect(result.usage).toEqual({
      model: 'gpt-test',
      inputTokens: 10,
      outputTokens: 5
    });
    expect(result.aiResponse.some((item) => item.text?.content === '已更新配置')).toBe(true);
  });

  it('streams interactive and keeps providerState memory when paused', async () => {
    const streamWriter = vi.fn();
    const providerState = { pendingMainContext: { askToolCallId: 'ask_1' } };
    runAuxiliaryGenerationAgentLoopMock.mockResolvedValue({
      status: 'paused',
      pause: {
        type: 'ask',
        askId: 'ask_1',
        ask: {
          reason: '需要确认',
          blockerType: 'user_choice',
          questions: [
            {
              question: '要不要挂知识库？',
              options: [
                { summary: '要', value: '要' },
                { summary: '不要', value: '不要' }
              ]
            }
          ]
        }
      },
      providerState,
      completeMessages: [],
      assistantMessages: [{ role: 'assistant', content: '请选择' }],
      requestIds: [],
      finishReason: 'tool_calls',
      usages: [],
      answerText: '请选择',
      reasoningText: ''
    });

    const result = await runChatAgentHelperProcessor({
      query: '做一个助手',
      files: [],
      data: {
        metadata: {},
        catalog
      },
      histories: [
        {
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: '上一轮' } }],
          memories: {}
        }
      ],
      streamWriter,
      user: {
        teamId: 'team_1',
        tmbId: 'tmb_1',
        userId: 'user_1',
        isRoot: false,
        lang: 'zh-CN'
      }
    });

    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuxiliaryGenerationEventEnum.interactive,
        data: expect.objectContaining({
          interactive: expect.objectContaining({
            type: 'agentAsk',
            askId: 'ask_1'
          })
        })
      })
    );
    expect(result.memories).toEqual({
      'agentLoopMemory-chatAgentHelper': {
        providerState
      }
    });
  });
});
