import z from 'zod';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

/* ============================================================================
 * API: 创建集合标签
 * Route: POST /proApi/core/dataset/tag/create
 * ============================================================================ */
export const CreateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签名称' })
});
export type CreateDatasetCollectionTagParams = z.infer<typeof CreateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 批量为集合添加标签
 * Route: POST /proApi/core/dataset/tag/addToCollections
 * ============================================================================ */
export const AddTagsToCollectionsBodySchema = z.object({
  originCollectionIds: z
    .array(z.string())
    .meta({ description: '来源集合 ID 列表（用于复制标签）' }),
  collectionIds: z.array(z.string()).meta({ description: '目标集合 ID 列表' }),
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签名称' })
});
export type AddTagsToCollectionsParams = z.infer<typeof AddTagsToCollectionsBodySchema>;

/* ============================================================================
 * API: 更新集合标签
 * Route: POST /proApi/core/dataset/tag/update
 * ============================================================================ */
export const UpdateDatasetCollectionTagBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tagId: z.string().meta({ description: '标签 ID' }),
  tag: z.string().meta({ description: '新标签名称' })
});
export type UpdateDatasetCollectionTagParams = z.infer<typeof UpdateDatasetCollectionTagBodySchema>;

/* ============================================================================
 * API: 分页获取集合标签
 * Route: POST /proApi/core/dataset/tag/list
 * Method: POST
 * Description: 按知识库分页查询集合标签，支持名称模糊搜索
 * Tags: ['Dataset', 'Collection', 'Read']
 * ============================================================================ */
export const GetDatasetCollectionTagsBodySchema = PaginationSchema.extend({
  datasetId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '数据集 ID' }),
  searchText: z.string().optional().meta({ example: '合同', description: '标签名称关键词' })
});
export type GetDatasetCollectionTagsBodyType = z.infer<typeof GetDatasetCollectionTagsBodySchema>;

export const GetDatasetCollectionTagsResponseSchema = PaginationResponseSchema(
  z.object({
    _id: z.string().meta({ description: '标签 ID' }),
    tag: z.string().meta({ description: '标签名称' })
  })
);
export type GetDatasetCollectionTagsResponseType = z.infer<
  typeof GetDatasetCollectionTagsResponseSchema
>;

/* ============================================================================
 * API: 删除集合标签
 * Route: DELETE /proApi/core/dataset/tag/delete
 * Method: DELETE
 * Description: 删除标签并从所有集合上移除该标签
 * Tags: ['Dataset', 'Collection', 'Delete']
 * ============================================================================ */
export const DeleteDatasetCollectionTagQuerySchema = z.object({
  datasetId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '数据集 ID' }),
  id: z.string().meta({ example: '68ad85a7463006c963799a06', description: '标签 ID' })
});
export type DeleteDatasetCollectionTagQueryType = z.infer<
  typeof DeleteDatasetCollectionTagQuerySchema
>;

/* ============================================================================
 * API: 获取知识库全部标签
 * Route: GET /proApi/core/dataset/tag/getAllTags
 * Method: GET
 * Description: 返回知识库下全部标签，供筛选器使用
 * Tags: ['Dataset', 'Collection', 'Read']
 * ============================================================================ */
export const GetAllDatasetTagsQuerySchema = z.object({
  datasetId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '数据集 ID' })
});
export const GetAllDatasetTagsResponseSchema = z.object({
  list: z
    .array(
      z.object({
        _id: z.string().meta({ description: '标签 ID' }),
        tag: z.string().meta({ description: '标签名称' })
      })
    )
    .meta({ description: '标签列表' })
});
export type GetAllDatasetTagsResponseType = z.infer<typeof GetAllDatasetTagsResponseSchema>;

/* ============================================================================
 * API: 获取标签使用情况
 * Route: GET /proApi/core/dataset/tag/tagUsage
 * Method: GET
 * Description: 查询每个标签绑定了哪些集合
 * Tags: ['Dataset', 'Collection', 'Read']
 * ============================================================================ */
export const GetDatasetTagUsageQuerySchema = z.object({
  datasetId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '数据集 ID' })
});
export const GetDatasetTagUsageResponseSchema = z.array(
  z.object({
    tagId: z.string().meta({ description: '标签 ID' }),
    collections: z.array(z.string()).meta({ description: '集合 ID 列表' })
  })
);
export type GetDatasetTagUsageResponseType = z.infer<typeof GetDatasetTagUsageResponseSchema>;
