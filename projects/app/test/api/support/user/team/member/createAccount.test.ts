import { describe, it, expect, beforeEach } from 'vitest';
import * as createAccountApi from '@/pages/api/support/user/team/member/createAccount';
import * as loginApi from '@/pages/api/support/user/account/loginByPassword';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { getDataId } from '@fastgpt/service/support/tmpData/verification';
import { createRootOrg } from '@fastgpt/service/support/permission/org/controllers';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import type { CreateAccountBodyType } from '@fastgpt/global/openapi/support/user/team/member/createAccount/api';
import type { LoginByPasswordBodyType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { getNanoid, hashStr } from '@fastgpt/global/common/string/tools';

const saveLoginCode = (username: string, code = '123456') =>
  MongoTmpData.updateOne(
    { dataId: getDataId({ scene: 'login', type: 'password', key: username }) },
    {
      dataId: getDataId({ scene: 'login', type: 'password', key: username }),
      data: { preLoginCode: code },
      expireAt: new Date(Date.now() + 30_000)
    },
    { upsert: true }
  );

/** 模拟前端 postLogin：提交前先 hashStr 一次 */
const loginLikeFrontend = (username: string, plainPassword: string) =>
  Call<LoginByPasswordBodyType, Record<string, never>, any>(loginApi.default, {
    body: {
      username,
      password: hashStr(plainPassword),
      code: '123456',
      language: 'zh-CN'
    }
  });

describe('createAccount API', () => {
  let rootUser: Awaited<ReturnType<typeof getRootUser>>;

  beforeEach(async () => {
    rootUser = await getRootUser();
    await createRootOrg({ teamId: String(rootUser.teamId) });
  });

  it('creates account with plaintext password and can login', async () => {
    const username = `emp_${getNanoid(8)}`;
    const password = 'Passw0rd!';

    const createRes = await Call<CreateAccountBodyType, Record<string, never>, any>(
      createAccountApi.default,
      {
        auth: rootUser,
        body: {
          username,
          password,
          memberName: '测试员工'
        }
      }
    );

    expect(createRes.code).toBe(200);
    expect(createRes.data.username).toBe(username);
    expect(createRes.data.tmbId).toBeTruthy();
    expect(createRes.data.generatedPassword).toBeUndefined();

    const user = await MongoUser.findOne({ username });
    expect(user).toBeTruthy();

    const tmb = await MongoTeamMember.findById(createRes.data.tmbId);
    expect(tmb?.status).toBe(TeamMemberStatusEnum.active);
    expect(String(tmb?.teamId)).toBe(String(rootUser.teamId));

    const teamPer = await MongoResourcePermission.findOne({
      teamId: rootUser.teamId,
      tmbId: createRes.data.tmbId,
      resourceType: PerResourceTypeEnum.team
    });
    expect(teamPer).toBeTruthy();

    await saveLoginCode(username);
    const loginRes = await loginLikeFrontend(username, password);

    expect(loginRes.code).toBe(200);
    expect(loginRes.data.token).toBeTruthy();
  });

  it('generates password when omitted and assigns org', async () => {
    const username = `emp_${getNanoid(8)}`;
    const rootOrg = await MongoOrgModel.findOne({ teamId: rootUser.teamId, path: '' }).lean();
    expect(rootOrg).toBeTruthy();

    const [childOrg] = await MongoOrgModel.create([
      {
        teamId: rootUser.teamId,
        name: '研发部',
        path: `/${rootOrg!.pathId}`,
        pathId: getNanoid()
      }
    ]);

    const createRes = await Call<CreateAccountBodyType, Record<string, never>, any>(
      createAccountApi.default,
      {
        auth: rootUser,
        body: {
          username,
          memberName: '自动密码员工',
          orgId: String(childOrg._id)
        }
      }
    );

    expect(createRes.code).toBe(200);
    expect(createRes.data.generatedPassword).toBeTruthy();
    expect(createRes.data.generatedPassword!.length).toBeGreaterThanOrEqual(6);

    const orgMember = await MongoOrgMemberModel.findOne({
      teamId: rootUser.teamId,
      tmbId: createRes.data.tmbId,
      orgId: childOrg._id
    });
    expect(orgMember).toBeTruthy();

    await saveLoginCode(username);
    const loginRes = await loginLikeFrontend(username, createRes.data.generatedPassword!);
    expect(loginRes.code).toBe(200);
  });

  it('rejects duplicate username', async () => {
    const username = `emp_${getNanoid(8)}`;

    await Call(createAccountApi.default, {
      auth: rootUser,
      body: { username, password: 'Passw0rd!', memberName: 'A' }
    });

    const dup = await Call(createAccountApi.default, {
      auth: rootUser,
      body: { username, password: 'Passw0rd!', memberName: 'B' }
    });

    expect(dup.code).not.toBe(200);
    expect(String(dup.error || '')).toContain(UserErrEnum.userExist);
  });
});
