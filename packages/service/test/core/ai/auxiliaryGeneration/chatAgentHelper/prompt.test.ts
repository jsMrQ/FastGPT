import { describe, expect, it } from 'vitest';
import { buildChatAgentHelperSystemPrompt } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/prompt';
import type { ChatAgentHelperResourceCatalog } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/catalog';
import { ChatAgentHelperGenerateConfigToolName } from '@fastgpt/service/core/ai/auxiliaryGeneration/chatAgentHelper/constants';

describe('buildChatAgentHelperSystemPrompt', () => {
  it('includes catalog resources and generate_config guidance', () => {
    const catalog: ChatAgentHelperResourceCatalog = {
      tools: [{ id: 'tool_1', name: '搜索', intro: '搜网页' }],
      datasets: [
        {
          datasetId: 'ds_1',
          avatar: '',
          name: '手册',
          vectorModel: { model: 'emb' },
          isDeleted: false
        }
      ],
      skills: [
        {
          skillId: 'skill_1',
          name: '编码',
          description: '写代码',
          isDeleted: false
        }
      ],
      toolIdSet: new Set(['tool_1']),
      datasetMap: new Map(),
      skillMap: new Map()
    };
    catalog.datasetMap.set('ds_1', catalog.datasets[0]!);
    catalog.skillMap.set('skill_1', catalog.skills[0]!);

    const prompt = buildChatAgentHelperSystemPrompt({
      metadata: {
        systemPrompt: '旧提示词',
        selectedTools: ['tool_1'],
        selectedDatasets: ['ds_1'],
        selectedAgentSkills: catalog.skills,
        fileUpload: true,
        enableSandbox: false,
        modelConfig: { model: 'gpt-test' }
      },
      catalog
    });

    expect(prompt).toContain(ChatAgentHelperGenerateConfigToolName);
    expect(prompt).toContain('tool_1');
    expect(prompt).toContain('手册');
    expect(prompt).toContain('编码');
    expect(prompt).toContain('旧提示词');
    expect(prompt).toContain('Agent 配置助手');
  });
});
