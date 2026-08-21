import z from 'zod';
import { TeamDefaultRoleVal } from '../../../../../../support/permission/user/constant';

/* ============================================================================
 * API: 管理员开通团队账号
 * Route: POST /api/support/user/team/member/createAccount
 * Method: POST
 * Description: 由具备团队管理权限的成员创建内部账号，并加入当前团队（可选部门）
 * Tags: ['辅助-用户体系', '团队管理', 'Write']
 * ============================================================================ */

export const CreateAccountBodySchema = z.object({
  username: z
    .string()
    .min(2)
    .max(60)
    .meta({ example: 'zhangsan', description: '登录用户名，全局唯一（工号/邮箱等）' }),
  password: z
    .string()
    .min(6)
    .max(64)
    .optional()
    .meta({ description: '初始密码；为空时由服务端生成随机密码并在响应中返回' }),
  memberName: z.string().min(1).max(60).meta({ example: '张三', description: '团队内显示名' }),
  orgId: z
    .string()
    .optional()
    .meta({ description: '初始部门 ID，须属于当前团队；为空则仅加入团队' }),
  permission: z
    .number()
    .int()
    .optional()
    .default(TeamDefaultRoleVal)
    .meta({ description: '团队角色位值，默认普通成员' })
});
export type CreateAccountBodyType = z.infer<typeof CreateAccountBodySchema>;

export const CreateAccountResponseSchema = z.object({
  userId: z.string().meta({ description: '用户 ID' }),
  tmbId: z.string().meta({ description: '团队成员 ID' }),
  username: z.string().meta({ description: '登录用户名' }),
  memberName: z.string().meta({ description: '显示名' }),
  /** 仅当请求未传 password、由服务端生成时返回明文，便于管理员告知用户 */
  generatedPassword: z.string().optional().meta({ description: '服务端生成的初始密码（明文）' })
});
export type CreateAccountResponseType = z.infer<typeof CreateAccountResponseSchema>;
