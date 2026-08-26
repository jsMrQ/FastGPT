import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';

const MAX_AUTO_INDEXES = 8;
const MIN_INDEX_TEXT_LENGTH = 2;

/**
 * 从 LLM 原始输出中解析补充索引文本。
 * 优先按 JSON 数组解析；失败时按换行列表兼容编号/列表符号。
 * 会去重、丢掉过短文本，并截断到最多 8 条。
 */
export const parseAutoIndexTexts = (answer: string): string[] => {
  const trimmed = answer
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!trimmed) return [];

  let raw: string[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      raw = parsed.map((item) => String(item).trim());
    }
  } catch {
    // 模型未按 JSON 输出时，按行拆分并去掉常见编号前缀
    raw = trimmed.split(/\r?\n/).map((line) => line.replace(/^[\s*\d.、\-)\]]+/, '').trim());
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of raw) {
    if (text.length < MIN_INDEX_TEXT_LENGTH) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= MAX_AUTO_INDEXES) break;
  }
  return result;
};

/**
 * 把 LLM 生成的问句合并进训练行已有索引。
 * 与原文 q 相同的条目会被丢掉，避免重复向量。
 */
export const buildAutoIndexes = ({
  q,
  existing,
  generated
}: {
  q: string;
  existing?: Pick<DatasetDataIndexItemType, 'type' | 'text'>[];
  generated: string[];
}): Pick<DatasetDataIndexItemType, 'type' | 'text'>[] => {
  const result: Pick<DatasetDataIndexItemType, 'type' | 'text'>[] = [];
  const seen = new Set<string>();

  const remember = (text: string) => {
    const key = text.trim().toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  };

  remember(q);
  for (const item of existing || []) {
    const text = item.text?.trim();
    if (!text || remember(text)) continue;
    result.push({
      type: item.type || DatasetDataIndexTypeEnum.custom,
      text
    });
  }
  for (const text of generated) {
    const trimmed = text.trim();
    if (!trimmed || remember(trimmed)) continue;
    result.push({
      type: DatasetDataIndexTypeEnum.question,
      text: trimmed
    });
  }
  return result;
};
