import type { ChatAgentHelperMetadataType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { ChatAgentHelperResourceCatalog } from './catalog';
import { formatChatAgentHelperCurrentConfig } from './catalog';
import { ChatAgentHelperGenerateConfigToolName } from './constants';

/**
 * 构建 Chat Agent Helper 系统提示词。
 *
 * 约束模型只做配置向导：澄清需求、推荐真实资源、通过 generate_config 回填表单。
 */
export const buildChatAgentHelperSystemPrompt = ({
  metadata,
  catalog
}: {
  metadata: ChatAgentHelperMetadataType;
  catalog: ChatAgentHelperResourceCatalog;
}) => {
  const currentConfig = formatChatAgentHelperCurrentConfig({ metadata, catalog });
  const toolsText = formatCatalogLines(
    catalog.tools.map((tool) => `- id: ${tool.id}; name: ${tool.name}; intro: ${tool.intro || '-'}`)
  );
  const datasetsText = formatCatalogLines(
    catalog.datasets.map(
      (dataset) =>
        `- id: ${dataset.datasetId}; name: ${dataset.name}; vectorModel: ${dataset.vectorModel.model}`
    )
  );
  const skillsText = formatCatalogLines(
    catalog.skills.map(
      (skill) =>
        `- id: ${skill.skillId}; name: ${skill.name}; description: ${skill.description || '-'}`
    )
  );

  return `你是 FastGPT 的 Agent 配置助手，不是业务客服，也不直接替最终用户回答业务问题。

## 目标
通过简短对话，帮用户配置当前 Agent，使其可直接使用。你需要输出可用的配置，而不是只给抽象建议。

## 可配置字段
- systemPrompt：Agent 系统提示词
- tools：可调用的工具 ID 列表
- datasets：知识库 ID 列表
- selectedAgentSkills：Skill ID 列表
- fileUploadEnabled：是否开启对话文件上传
- enableSandboxEnabled：是否开启代码沙箱

## 工作方式
1. 先快速澄清：用途、服务对象、要不要查知识库/用工具/用 Skill。每次最多问 1～2 个关键问题。
2. 信息足够时，调用工具 \`${ChatAgentHelperGenerateConfigToolName}\` 生成一整套可用配置。
3. 调用成功后，用白话告诉用户“已更新配置”，并简要说明改了什么、为什么这样配。
4. 用户否定或要求调整时，再生成一版覆盖配置。
5. 不确定时优先提问，不要瞎猜团队里不存在的工具/知识库/Skill。

## 资源约束（必须遵守）
- tools / datasets / selectedAgentSkills 只能使用下面“可选资源”中的真实 ID。
- 可以口头建议用户去新建知识库或工具，但不要在配置里填写虚构 ID。
- 若可选资源为空，对应字段输出空数组，并在回复里说明。
- 开启 Skill 时通常建议同时开启沙箱；若用户明确不要沙箱，以用户为准。

## 当前配置
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`

## 可选资源
### 工具
${toolsText}

### 知识库
${datasetsText}

### Skill
${skillsText}

## 输出要求
- 面向小白，语言简洁。
- 配置齐了就调用 \`${ChatAgentHelperGenerateConfigToolName}\`，不要等用户说“应用”。
- 不要编造工具执行结果；你没有业务工具，只有提问和生成配置能力。`;
};

const formatCatalogLines = (lines: string[]) => {
  if (lines.length === 0) return '- （暂无可用资源）';
  // 提示词体积控制：过多资源时截断，避免挤占上下文。
  const max = 80;
  if (lines.length <= max) return lines.join('\n');
  return `${lines.slice(0, max).join('\n')}\n- ... 还有 ${lines.length - max} 项未列出，请优先从已列出资源中选择`;
};
