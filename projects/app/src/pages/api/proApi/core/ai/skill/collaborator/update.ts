import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { UpdateSkillCollaboratorBodySchema } from '@fastgpt/global/openapi/support/permission/api';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateSkillCollaboratorBodySchema });
  const { teamId, tmbId, skill } = await authSkill({
    req,
    authToken: true,
    skillId: body.skillId,
    per: OwnerRoleVal
  });

  await updateResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.agentSkill,
    resourceModel: MongoAgentSkills,
    folderTypeList: [AgentSkillTypeEnum.folder],
    collaborators: body.collaborators,
    resource: {
      _id: String(skill._id),
      type: skill.type,
      teamId: String(skill.teamId),
      parentId: skill.parentId,
      inheritPermission: skill.inheritPermission,
      tmbId: String(skill.tmbId),
      name: skill.name
    }
  });

  void addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.UPDATE_SKILL_COLLABORATOR,
    params: {
      skillName: skill.name,
      skillType: getI18nSkillType(skill.type),
      tmbList: body.collaborators.filter((item) => item.tmbId).map((item) => String(item.tmbId)),
      groupList: body.collaborators
        .filter((item) => item.groupId)
        .map((item) => String(item.groupId)),
      orgList: body.collaborators.filter((item) => item.orgId).map((item) => String(item.orgId)),
      permission: String(body.collaborators[0]?.permission ?? 0)
    }
  });
}

export default NextAPI(handler);
