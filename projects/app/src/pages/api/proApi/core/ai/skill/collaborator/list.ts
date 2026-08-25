import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { GetSkillCollaboratorListQuerySchema } from '@fastgpt/global/openapi/support/permission/api';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';
import { listResourceCollaborators } from '@fastgpt/service/support/permission/resourceCollaborator';

async function handler(req: ApiRequestProps): Promise<CollaboratorListType> {
  const { query } = parseApiInput({
    req,
    querySchema: GetSkillCollaboratorListQuerySchema
  });
  const { teamId, skill } = await authSkill({
    req,
    authToken: true,
    skillId: query.skillId,
    per: ManagePermissionVal
  });

  return listResourceCollaborators({
    teamId,
    resourceType: PerResourceTypeEnum.agentSkill,
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
}

export default NextAPI(handler);
