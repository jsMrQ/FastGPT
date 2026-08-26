import z from 'zod';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { ChatAgentConfigFormDataType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import { ChatAgentConfigFormDataSchema } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { AgentLoopToolExecutionResult } from '../../llm/agentLoop/domain/tool';
import type { ChatAgentHelperResourceCatalog } from './catalog';
import {
  ChatAgentHelperGenerateConfigSuccessResponse,
  ChatAgentHelperGenerateConfigToolName
} from './constants';

/** generate_config 入参：资源字段只收 ID，由 executor 解析成表单结构。 */
export const ChatAgentHelperGenerateConfigInputSchema = z.object({
  systemPrompt: z.string().optional().default(''),
  tools: z.array(z.string()).optional().default([]),
  datasets: z.array(z.string()).optional().default([]),
  selectedAgentSkills: z.array(z.string()).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false),
  enableSandboxEnabled: z.boolean().optional().default(false)
});
export type ChatAgentHelperGenerateConfigInputType = z.infer<
  typeof ChatAgentHelperGenerateConfigInputSchema
>;

export const chatAgentHelperGenerateConfigTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: ChatAgentHelperGenerateConfigToolName,
    description:
      'Generate a complete Agent configuration and push it to the editor form. Only use real resource IDs from the catalog.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        systemPrompt: {
          type: 'string',
          description: 'Agent system prompt'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tool IDs from the available tools catalog'
        },
        datasets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dataset IDs from the available datasets catalog'
        },
        selectedAgentSkills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skill IDs from the available skills catalog'
        },
        fileUploadEnabled: {
          type: 'boolean',
          description: 'Whether to enable chat file upload'
        },
        enableSandboxEnabled: {
          type: 'boolean',
          description: 'Whether to enable code sandbox'
        }
      },
      required: [
        'systemPrompt',
        'tools',
        'datasets',
        'selectedAgentSkills',
        'fileUploadEnabled',
        'enableSandboxEnabled'
      ]
    }
  }
};

/**
 * 校验 generate_config 参数，并把资源 ID 解析成前端 onApply 需要的表单结构。
 *
 * 非法 ID 以 tool error 返回给模型修正，不在这里直接中断整轮对话。
 */
export const buildChatAgentConfigFormData = ({
  input,
  catalog
}: {
  input: unknown;
  catalog: ChatAgentHelperResourceCatalog;
}): { ok: true; formData: ChatAgentConfigFormDataType } | { ok: false; errorMessage: string } => {
  const parsed = ChatAgentHelperGenerateConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorMessage: `Invalid generate_config arguments: ${parsed.error.message}`
    };
  }

  const invalidTools = parsed.data.tools.filter((toolId) => !catalog.toolIdSet.has(toolId));
  const invalidDatasets = parsed.data.datasets.filter(
    (datasetId) => !catalog.datasetMap.has(datasetId)
  );
  const invalidSkills = parsed.data.selectedAgentSkills.filter(
    (skillId) => !catalog.skillMap.has(skillId)
  );

  if (invalidTools.length || invalidDatasets.length || invalidSkills.length) {
    return {
      ok: false,
      errorMessage: [
        'Some resource IDs are not in the available catalog.',
        invalidTools.length ? `invalid tools: ${invalidTools.join(', ')}` : '',
        invalidDatasets.length ? `invalid datasets: ${invalidDatasets.join(', ')}` : '',
        invalidSkills.length ? `invalid skills: ${invalidSkills.join(', ')}` : ''
      ]
        .filter(Boolean)
        .join(' ')
    };
  }

  const formData = ChatAgentConfigFormDataSchema.parse({
    systemPrompt: parsed.data.systemPrompt,
    tools: parsed.data.tools,
    datasets: parsed.data.datasets.map((datasetId) => catalog.datasetMap.get(datasetId)!),
    selectedAgentSkills: parsed.data.selectedAgentSkills.map(
      (skillId) => catalog.skillMap.get(skillId)!
    ),
    fileUploadEnabled: parsed.data.fileUploadEnabled,
    enableSandboxEnabled: parsed.data.enableSandboxEnabled
  });

  return { ok: true, formData };
};

/**
 * 执行 generate_config：成功时返回表单数据供 processor 推送 SSE。
 */
export const executeChatAgentHelperGenerateConfig = ({
  rawArguments,
  catalog
}: {
  rawArguments: string;
  catalog: ChatAgentHelperResourceCatalog;
}): AgentLoopToolExecutionResult & {
  formData?: ChatAgentConfigFormDataType;
} => {
  let args: unknown;
  try {
    args = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return {
      response: 'generate_config arguments must be valid JSON',
      assistantMessages: [],
      usages: [],
      errorMessage: 'generate_config arguments must be valid JSON'
    };
  }

  const built = buildChatAgentConfigFormData({ input: args, catalog });
  if (!built.ok) {
    return {
      response: built.errorMessage,
      assistantMessages: [],
      usages: [],
      errorMessage: built.errorMessage
    };
  }

  return {
    response: ChatAgentHelperGenerateConfigSuccessResponse,
    assistantMessages: [],
    usages: [],
    formData: built.formData
  };
};
