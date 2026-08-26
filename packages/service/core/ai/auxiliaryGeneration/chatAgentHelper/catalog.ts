import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type {
  AuxiliaryGenerationSelectedDatasetType,
  ChatAgentHelperMetadataType
} from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { SystemToolRepo } from '../../../app/tool/systemTool/systemTool.repo';
import { MongoDataset } from '../../../dataset/schema';
import { getEmbeddingModel } from '../../model';
import { listReadableAgentSkills } from '../../skill/manage';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../../../../support/permission/schema';
import { getGroupsByTmbId } from '../../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../../support/permission/org/controllers';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type ChatAgentHelperCatalogTool = {
  id: string;
  name: string;
  intro: string;
};

export type ChatAgentHelperCatalogDataset = AuxiliaryGenerationSelectedDatasetType;

export type ChatAgentHelperCatalogSkill = SelectedAgentSkillItemType;

export type ChatAgentHelperResourceCatalog = {
  tools: ChatAgentHelperCatalogTool[];
  datasets: ChatAgentHelperCatalogDataset[];
  skills: ChatAgentHelperCatalogSkill[];
  toolIdSet: Set<string>;
  datasetMap: Map<string, ChatAgentHelperCatalogDataset>;
  skillMap: Map<string, ChatAgentHelperCatalogSkill>;
};

type LoadChatAgentHelperResourceCatalogParams = {
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  lang?: localeType;
};

/**
 * 加载当前成员在 Chat Agent Helper 中可引用的工具、知识库和 Skill。
 *
 * 只返回可读、未下线、非目录资源；generate_config 只能绑定这里出现的 ID。
 */
export const loadChatAgentHelperResourceCatalog = async ({
  teamId,
  tmbId,
  isOwner,
  lang
}: LoadChatAgentHelperResourceCatalogParams): Promise<ChatAgentHelperResourceCatalog> => {
  const [tools, datasets, skillsResult] = await Promise.all([
    loadCatalogTools({ teamId, lang }),
    loadCatalogDatasets({ teamId, tmbId, isOwner }),
    listReadableAgentSkills({
      teamId,
      tmbId,
      teamPer: { isOwner },
      type: AgentSkillTypeEnum.skill,
      withSourceMember: false,
      withAppCount: false
    })
  ]);

  const skills: ChatAgentHelperCatalogSkill[] = skillsResult.list
    .filter((skill) => skill.type !== AgentSkillTypeEnum.folder)
    .map((skill) => ({
      skillId: String(skill._id),
      name: skill.name,
      description: skill.description || '',
      avatar: skill.avatar,
      isDeleted: false
    }));

  return {
    tools,
    datasets,
    skills,
    toolIdSet: new Set(tools.map((tool) => tool.id)),
    datasetMap: new Map(datasets.map((dataset) => [dataset.datasetId, dataset])),
    skillMap: new Map(skills.map((skill) => [skill.skillId, skill]))
  };
};

/**
 * 将当前表单元数据格式化成提示词可读的“已有配置”摘要。
 */
export const formatChatAgentHelperCurrentConfig = ({
  metadata,
  catalog
}: {
  metadata: ChatAgentHelperMetadataType;
  catalog: ChatAgentHelperResourceCatalog;
}) => {
  const toolNames = (metadata.selectedTools || [])
    .map((toolId) => catalog.tools.find((tool) => tool.id === toolId)?.name || toolId)
    .filter(Boolean);
  const datasetNames = (metadata.selectedDatasets || [])
    .map((datasetId) => catalog.datasetMap.get(datasetId)?.name || datasetId)
    .filter(Boolean);
  const skillNames = (metadata.selectedAgentSkills || []).map(
    (skill) => skill.name || skill.skillId
  );

  return {
    systemPrompt: metadata.systemPrompt || '',
    tools: toolNames,
    datasets: datasetNames,
    skills: skillNames,
    fileUpload: !!metadata.fileUpload,
    enableSandbox: !!metadata.enableSandbox
  };
};

const loadCatalogTools = async ({
  teamId,
  lang
}: {
  teamId: string;
  lang?: localeType;
}): Promise<ChatAgentHelperCatalogTool[]> => {
  const systemToolRepo = SystemToolRepo.getInstance();
  const tools = await systemToolRepo.getSystemToolList({
    op: 'or',
    sources: ['system', teamId],
    lang
  });

  return tools
    .filter((tool) => tool.status !== PluginStatusEnum.Offline && !tool.isToolSet)
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      intro: tool.intro || tool.toolDescription || ''
    }));
};

/**
 * 列出当前成员可读的非目录知识库，供助手推荐与 ID 校验。
 *
 * 权限规则对齐知识库列表 API：owner 可读团队内资源；普通成员按授权与目录继承计算。
 */
const loadCatalogDatasets = async ({
  teamId,
  tmbId,
  isOwner
}: {
  teamId: string;
  tmbId: string;
  isOwner: boolean;
}): Promise<ChatAgentHelperCatalogDataset[]> => {
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((items) => {
      const map = new Map<string, 1>();
      items.forEach((item) => map.set(String(item._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  const roleListMap = new Map<string, (typeof roleList)[number][]>();
  roleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });

  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const idList = { _id: { $in: myRoles.map((item) => item.resourceId) } };
  const datasetPerQuery = isOwner ? {} : { $or: [idList, { parentId: null }] };

  const myDatasets = await MongoDataset.find({
    ...datasetPerQuery,
    teamId,
    deleteTime: null,
    type: { $ne: DatasetTypeEnum.folder }
  })
    .sort({ updateTime: -1 })
    .lean();

  return myDatasets
    .map((dataset) => {
      const getPer = (datasetId: string) => {
        const tmbRole = myRoles.find(
          (item) => String(item.resourceId) === datasetId && !!item.tmbId
        )?.permission;
        const groupAndOrgRole = sumPer(
          ...myRoles
            .filter(
              (item) => String(item.resourceId) === datasetId && (!!item.groupId || !!item.orgId)
            )
            .map((item) => item.permission)
        );
        return new DatasetPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(dataset.tmbId) === String(tmbId) || isOwner
        });
      };

      const permission =
        dataset.inheritPermission && dataset.parentId
          ? getPer(String(dataset.parentId)).addRole(getPer(String(dataset._id)).role)
          : getPer(String(dataset._id));

      if (!permission.hasReadPer) return;

      const vectorModel = getEmbeddingModel(dataset.vectorModel);
      return {
        datasetId: String(dataset._id),
        avatar: dataset.avatar || '',
        name: dataset.name,
        vectorModel: {
          model: vectorModel?.model || String(dataset.vectorModel || '')
        },
        isDeleted: false
      } satisfies ChatAgentHelperCatalogDataset;
    })
    .filter(Boolean) as ChatAgentHelperCatalogDataset[];
};
