import { describe, expect, it } from 'vitest';
import {
  buildChatAgentConfigFormData,
  executeChatAgentHelperGenerateConfig
} from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/tools';
import type { ChatAgentHelperResourceCatalog } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/catalog';
import { ChatAgentHelperGenerateConfigSuccessResponse } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/constants';

const createCatalog = (): ChatAgentHelperResourceCatalog => {
  const datasets = [
    {
      datasetId: 'ds_1',
      avatar: '/avatar.png',
      name: '产品手册',
      vectorModel: { model: 'text-embedding' },
      isDeleted: false
    }
  ];
  const skills = [
    {
      skillId: 'skill_1',
      name: '检索助手',
      description: '帮助检索',
      avatar: '/skill.png',
      isDeleted: false
    }
  ];
  const tools = [{ id: 'tool_1', name: '网页搜索', intro: '搜索网页' }];

  return {
    tools,
    datasets,
    skills,
    toolIdSet: new Set(tools.map((tool) => tool.id)),
    datasetMap: new Map(datasets.map((dataset) => [dataset.datasetId, dataset])),
    skillMap: new Map(skills.map((skill) => [skill.skillId, skill]))
  };
};

describe('buildChatAgentConfigFormData', () => {
  it('resolves resource ids into form data', () => {
    const result = buildChatAgentConfigFormData({
      catalog: createCatalog(),
      input: {
        systemPrompt: '你是客服助手',
        tools: ['tool_1'],
        datasets: ['ds_1'],
        selectedAgentSkills: ['skill_1'],
        fileUploadEnabled: true,
        enableSandboxEnabled: false
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formData).toEqual({
      systemPrompt: '你是客服助手',
      tools: ['tool_1'],
      datasets: [
        {
          datasetId: 'ds_1',
          avatar: '/avatar.png',
          name: '产品手册',
          vectorModel: { model: 'text-embedding' },
          isDeleted: false
        }
      ],
      selectedAgentSkills: [
        {
          skillId: 'skill_1',
          name: '检索助手',
          description: '帮助检索',
          avatar: '/skill.png',
          isDeleted: false
        }
      ],
      fileUploadEnabled: true,
      enableSandboxEnabled: false
    });
  });

  it('rejects unknown resource ids', () => {
    const result = buildChatAgentConfigFormData({
      catalog: createCatalog(),
      input: {
        systemPrompt: 'x',
        tools: ['missing_tool'],
        datasets: ['ds_1'],
        selectedAgentSkills: [],
        fileUploadEnabled: false,
        enableSandboxEnabled: false
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toContain('missing_tool');
  });
});

describe('executeChatAgentHelperGenerateConfig', () => {
  it('returns success response and formData for valid json', () => {
    const result = executeChatAgentHelperGenerateConfig({
      catalog: createCatalog(),
      rawArguments: JSON.stringify({
        systemPrompt: 'hello',
        tools: ['tool_1'],
        datasets: [],
        selectedAgentSkills: [],
        fileUploadEnabled: false,
        enableSandboxEnabled: false
      })
    });

    expect(result.response).toBe(ChatAgentHelperGenerateConfigSuccessResponse);
    expect(result.errorMessage).toBeUndefined();
    expect(result.formData?.systemPrompt).toBe('hello');
    expect(result.formData?.tools).toEqual(['tool_1']);
  });

  it('returns tool error for invalid json', () => {
    const result = executeChatAgentHelperGenerateConfig({
      catalog: createCatalog(),
      rawArguments: '{bad json'
    });

    expect(result.errorMessage).toContain('valid JSON');
    expect(result.formData).toBeUndefined();
  });
});
