import { describe, it, expect } from 'vitest';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import listHandler from '@/pages/api/proApi/core/ai/skill/collaborator/list';
import updateHandler from '@/pages/api/proApi/core/ai/skill/collaborator/update';
import type {
  GetSkillCollaboratorListQueryType,
  GetSkillCollaboratorListResponseType,
  UpdateSkillCollaboratorBodyType
} from '@fastgpt/global/openapi/support/permission/api';

describe('skill collaborator APIs', () => {
  it('grants read on a personal skill', async () => {
    const users = await getFakeUsers(2);
    const skill = await mongoSessionRun(async (session) => {
      const created = await MongoAgentSkills.create({
        teamId: users.owner.teamId,
        tmbId: users.owner.tmbId,
        name: 'risk-skill',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        inheritPermission: true
      });
      await createResourceDefaultCollaborators({
        resource: created,
        resourceType: PerResourceTypeEnum.agentSkill,
        session,
        tmbId: String(users.owner.tmbId)
      });
      return created;
    });

    const listRes = await Call<
      Record<string, never>,
      GetSkillCollaboratorListQueryType,
      GetSkillCollaboratorListResponseType
    >(listHandler, {
      auth: users.owner,
      query: { skillId: String(skill._id) }
    });
    expect(listRes.code).toBe(200);

    const updateRes = await Call<UpdateSkillCollaboratorBodyType, Record<string, never>, void>(
      updateHandler,
      {
        auth: users.owner,
        body: {
          skillId: String(skill._id),
          collaborators: [{ tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }]
        }
      }
    );
    expect(updateRes.code).toBe(200);

    const memberClb = await MongoResourcePermission.findOne({
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceId: skill._id,
      tmbId: users.members[0].tmbId
    }).lean();
    expect(memberClb?.permission).toBe(ReadRoleVal);
  });
});
