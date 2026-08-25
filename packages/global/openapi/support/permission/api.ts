import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import {
  CollaboratorItemSchema,
  CollaboratorListSchema
} from '../../../support/permission/collaborator.schema';

const AppIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '应用 ID'
});

export const CollaboratorListResponseSchema = CollaboratorListSchema;
export type CollaboratorListResponseType = z.infer<typeof CollaboratorListResponseSchema>;

export const EmptyPermissionResponseSchema = z.undefined().meta({
  description: '操作成功'
});

/* ============================================================================
 * API: 获取应用协作者列表
 * Route: GET /api/proApi/core/app/collaborator/list
 * Method: GET
 * Description: 获取应用或应用文件夹的协作者列表，包含继承权限场景下的父级协作者信息。
 * Tags: ['协作者管理', '权限管理']
 * ============================================================================ */

export const GetAppCollaboratorListQuerySchema = z.object({
  appId: AppIdSchema
});
export type GetAppCollaboratorListQueryType = z.infer<typeof GetAppCollaboratorListQuerySchema>;

export const GetAppCollaboratorListResponseSchema = CollaboratorListResponseSchema;
export type GetAppCollaboratorListResponseType = z.infer<
  typeof GetAppCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新应用协作者
 * Route: POST /api/proApi/core/app/collaborator/update
 * Method: POST
 * Description: 覆盖更新应用或应用文件夹的协作者权限；继承权限场景会按资源类型处理继承关系。
 * Tags: ['协作者管理', '权限管理']
 * ============================================================================ */

export const UpdateAppCollaboratorBodySchema = z
  .object({
    appId: AppIdSchema,
    collaborators: z.array(CollaboratorItemSchema).meta({ description: '更新后的协作者权限列表' })
  })
  .meta({
    example: {
      appId: '68ad85a7463006c963799a05',
      collaborators: [
        {
          tmbId: '68ad85a7463006c963799a06',
          permission: 4
        }
      ]
    }
  });
export type UpdateAppCollaboratorBodyType = z.infer<typeof UpdateAppCollaboratorBodySchema>;

export const UpdateAppCollaboratorResponseSchema = EmptyPermissionResponseSchema;
export type UpdateAppCollaboratorResponseType = z.infer<typeof UpdateAppCollaboratorResponseSchema>;

/* ============================================================================
 * API: 获取知识库协作者列表
 * Route: GET /api/proApi/core/dataset/collaborator/list
 * ============================================================================ */

const DatasetIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a09',
  description: '知识库 ID'
});

export const GetDatasetCollaboratorListQuerySchema = z.object({
  datasetId: DatasetIdSchema
});
export type GetDatasetCollaboratorListQueryType = z.infer<
  typeof GetDatasetCollaboratorListQuerySchema
>;

export const GetDatasetCollaboratorListResponseSchema = CollaboratorListResponseSchema;
export type GetDatasetCollaboratorListResponseType = z.infer<
  typeof GetDatasetCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新知识库协作者
 * Route: POST /api/proApi/core/dataset/collaborator/update
 * ============================================================================ */

export const UpdateDatasetCollaboratorBodySchema = z.object({
  datasetId: DatasetIdSchema,
  collaborators: z.array(CollaboratorItemSchema).meta({ description: '更新后的协作者权限列表' })
});
export type UpdateDatasetCollaboratorBodyType = z.infer<typeof UpdateDatasetCollaboratorBodySchema>;

export const UpdateDatasetCollaboratorResponseSchema = EmptyPermissionResponseSchema;
export type UpdateDatasetCollaboratorResponseType = z.infer<
  typeof UpdateDatasetCollaboratorResponseSchema
>;

/* ============================================================================
 * API: 获取技能协作者列表
 * Route: GET /api/proApi/core/ai/skill/collaborator/list
 * ============================================================================ */

const SkillIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a0a',
  description: '技能 ID'
});

export const GetSkillCollaboratorListQuerySchema = z.object({
  skillId: SkillIdSchema
});
export type GetSkillCollaboratorListQueryType = z.infer<typeof GetSkillCollaboratorListQuerySchema>;

export const GetSkillCollaboratorListResponseSchema = CollaboratorListResponseSchema;
export type GetSkillCollaboratorListResponseType = z.infer<
  typeof GetSkillCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新技能协作者
 * Route: POST /api/proApi/core/ai/skill/collaborator/update
 * ============================================================================ */

export const UpdateSkillCollaboratorBodySchema = z.object({
  skillId: SkillIdSchema,
  collaborators: z.array(CollaboratorItemSchema).meta({ description: '更新后的协作者权限列表' })
});
export type UpdateSkillCollaboratorBodyType = z.infer<typeof UpdateSkillCollaboratorBodySchema>;

export const UpdateSkillCollaboratorResponseSchema = EmptyPermissionResponseSchema;
export type UpdateSkillCollaboratorResponseType = z.infer<
  typeof UpdateSkillCollaboratorResponseSchema
>;
