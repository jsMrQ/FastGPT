import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateAccountBodySchema,
  CreateAccountResponseSchema,
  type CreateAccountResponseType
} from '@fastgpt/global/openapi/support/user/team/member/createAccount/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamDefaultRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { getNanoid, hashStr } from '@fastgpt/global/common/string/tools';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { Types } from '@fastgpt/service/common/mongo';

/**
 * 管理员开通内部账号：创建 users + team_members，可选挂部门，并写入团队角色权限。
 *
 * 密码写入必须与登录前端一致：`postLogin` 会先 `hashStr(plain)` 再提交，
 * MongoUser.password setter 查询时再 hash 一次。因此这里写入前先 `hashStr`，
 * 最终库内为双重 hash（与 `initRootUser` 一致），否则浏览器登录会 account_psw_error。
 */
async function handler(req: ApiRequestProps): Promise<CreateAccountResponseType> {
  const { body } = parseApiInput({
    req,
    bodySchema: CreateAccountBodySchema
  });

  const { teamId, tmbId: operatorTmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const username = body.username.trim();
  const memberName = body.memberName.trim();
  const permission = body.permission ?? TeamDefaultRoleVal;
  const generatedPassword = body.password?.trim() ? undefined : getNanoid(12);
  const plainPassword = (body.password?.trim() || generatedPassword) as string;
  // 预 hash：配合登录前端 hashStr + schema setter 的双重 hash 链路
  const passwordForStore = hashStr(plainPassword);

  if (body.orgId) {
    const org = await MongoOrgModel.findOne({
      _id: new Types.ObjectId(body.orgId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!org) {
      return Promise.reject(TeamErrEnum.orgNotExist);
    }
  }

  try {
    const result = await mongoSessionRun(async (session) => {
      const [{ _id: userId }] = await MongoUser.create(
        [
          {
            username,
            password: passwordForStore
          }
        ],
        { session, ordered: true }
      );

      const [{ _id: newTmbId }] = await MongoTeamMember.create(
        [
          {
            teamId,
            userId,
            name: memberName,
            status: TeamMemberStatusEnum.active
          }
        ],
        { session, ordered: true }
      );

      // 默认登录落到该团队成员身份，避免首次登录找不到 tmb
      await MongoUser.updateOne(
        { _id: userId },
        { $set: { lastLoginTmbId: newTmbId } },
        { session }
      );

      if (body.orgId) {
        await MongoOrgMemberModel.create(
          [
            {
              teamId,
              orgId: body.orgId,
              tmbId: newTmbId
            }
          ],
          { session, ordered: true }
        );
      }

      // 团队级权限无 resourceId；密码已预 hash（见文件头注释）
      await MongoResourcePermission.create(
        [
          {
            teamId,
            tmbId: newTmbId,
            resourceType: PerResourceTypeEnum.team,
            permission
          }
        ],
        { session, ordered: true }
      );

      return {
        userId: String(userId),
        tmbId: String(newTmbId)
      };
    });

    addAuditLog({
      tmbId: operatorTmbId,
      teamId,
      event: AuditEventEnum.JOIN_TEAM,
      params: {
        name: memberName,
        link: 'admin_create'
      }
    });

    return CreateAccountResponseSchema.parse({
      userId: result.userId,
      tmbId: result.tmbId,
      username,
      memberName,
      ...(generatedPassword ? { generatedPassword } : {})
    });
  } catch (error: any) {
    if (error?.code === 11000 || String(error?.message || '').includes('duplicate')) {
      return Promise.reject(UserErrEnum.userExist);
    }
    throw error;
  }
}

export default NextAPI(handler);
