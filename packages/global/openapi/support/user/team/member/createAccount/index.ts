import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { CreateAccountBodySchema, CreateAccountResponseSchema } from './api';

export const CreateAccountPath: OpenAPIPath = {
  '/support/user/team/member/createAccount': {
    post: {
      summary: '管理员开通团队账号',
      description: '创建内部登录账号并加入当前团队，可选分配初始部门',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateAccountBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '开通成功',
          content: {
            'application/json': {
              schema: CreateAccountResponseSchema
            }
          }
        }
      }
    }
  }
};
