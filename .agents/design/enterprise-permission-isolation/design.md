# 企业内部账号权限隔离 — 需求与开发设计文档

> 目标读者：Cursor / AI 开发助手。本文档自包含，所有路径均相对仓库根目录 `FastGPT/`。
> 需求来源：企业自部署开源版 FastGPT，需要完整的内部账号权限隔离（部门树 + 资源级授权 + 管理员开通账号）。

## 1. 需求背景

企业内部使用 FastGPT，需要：

1. **部门树（组织架构）**：按部门管理成员，资源可授权给部门，权限沿树继承。
2. **管理员开通账号**：不开放自助注册，账号由团队管理员创建并分配到部门。
3. **资源级权限隔离**：应用/知识库/技能默认私有，管理员可将资源授权给个人、部门、成员组，权限分 read/write/manage/owner。
4. **登录方式**：使用 FastGPT 自带账号密码登录（不接 SSO/OIDC/LDAP）。

## 2. 已确认的决策

| 决策点 | 结论 |
|---|---|
| 实现路径 | 方案 A：本地实现开源版缺失的 `/proApi` 后端路由（前端与 Schema 均已存在） |
| 组织模型 | 部门树（teams_orgs 树形结构），成员组（member group）作为阶段 2 可选项 |
| 账号来源 | 管理员在成员管理页直接创建账号（用户名 + 初始密码），无自助注册、无邀请链接 |
| 部门数据隔离 | **不强制隔离，采用"默认私有 + 显式授权共享"**（见第 4 节） |

### 关于"是否强制部门隔离"的设计说明

**结论：不强制。** 依据：

- FastGPT 的资源（app/dataset/skill）归属**团队**而非部门，Schema 中没有"资源所属部门"字段。强制隔离需要给所有资源类型增加部门归属元数据，并改造全部创建、列表、授权、继承路径，改动面大且与现有 `inheritPermission`（文件夹权限继承）模型冲突。
- 现有权限模型已经是**默认私有**（`PermissionTypeEnum.private/clbPrivate`）：新建资源仅创建者可见，任何人（含部门）要访问必须被显式授权。这已实现"部门 A 未共享的资源，部门 B 完全不可见"。
- 企业内部跨部门协作是常见诉求，显式授权 + 审计日志（AuditLog）比硬隔离更实用。

## 3. 现状盘点（开源代码中已具备的能力）

**核心结论：所有数据模型、前端页面、权限求值逻辑均已开源，缺失的只有一批 API 路由 handler。无需新增任何 Mongo Schema。**

| 能力 | 位置 | 状态 |
|---|---|---|
| 团队/成员 Schema | `packages/service/support/user/team/teamSchema.ts`、`teamMemberSchema.ts` | ✅ 已有 |
| 组织架构（部门树）Schema | `packages/service/support/permission/org/orgSchema.ts`（teams_orgs，path/pathId 树）、`orgMemberSchema.ts`（team_org_members） | ✅ 已有 |
| 成员组 Schema | `packages/service/support/permission/memberGroup/memberGroupSchema.ts`、`groupMemberSchema.ts` | ✅ 已有 |
| 资源权限 Schema | `packages/service/support/permission/schema.ts`（resource_permissions，支持 tmbId/groupId/orgId 三种授权主体） | ✅ 已有 |
| 权限位运算/继承冲突工具 | `packages/global/support/permission/utils.ts`（sumPer/mergeCollaboratorList/checkRoleUpdateConflict） | ✅ 已有 |
| 权限求值（个人>组>部门，位求和） | `packages/service/support/permission/controller.ts` → `getTmbPermission` | ✅ 已有 |
| 文件夹权限继承同步 | `packages/service/support/permission/inheritPermission.ts` → `syncChildrenPermission` | ✅ 已有 |
| 部门树读侧查询 | `packages/service/support/permission/org/controllers.ts`（getOrgIdSetWithParentByTmbId/getChildrenByOrg/getOrgAndChildren/createRootOrg） | ✅ 已有 |
| 成员组读侧查询 | `packages/service/support/permission/memberGroup/controllers.ts`（getGroupsByTmbId/getTeamDefaultGroup） | ✅ 已有 |
| 资源列表按部门/组过滤 | `projects/app/src/pages/api/core/app/list.ts`、`dataset/list.ts` 等已调用上述控制器 | ✅ 已有 |
| 前端管理页面 | `projects/app/src/pageComponents/account/team/`（MemberTable/OrgManage/GroupManage/PermissionManage） | ✅ 已有 |
| 前端 API 客户端与 Zod 契约 | `projects/app/src/web/support/user/team/{api,org/api,group/api}.ts`、`projects/app/src/web/core/{app,dataset,skill}/...`、`packages/global/openapi/support/permission/api.ts` | ✅ 已有 |
| 团队鉴权 | `packages/service/support/permission/user/auth.ts` → `authUserPer`；资源鉴权 `authApp/authDataset` 等 | ✅ 已有 |
| root 用户与默认团队初始化 | `projects/app/src/service/mongo.ts` → `initRootUser`（含 createDefaultTeam + createRootOrg + 默认成员组） | ✅ 已有 |

**缺失（本需求要实现的全部内容）**：前端调用的下列接口全部指向 `/proApi/*` 前缀（商业版后端），开源仓库中无 handler。未配置商业版时由 catch-all 代理 `projects/app/src/pages/api/proApi/[...path].ts` 返回错误。

## 4. 总体方案：路由遮蔽（Route Shadowing）

Next.js Pages Router 的路由优先级：**具体路径 > catch-all**。现有 catch-all 位于 `projects/app/src/pages/api/proApi/[...path].ts`。

**做法**：在 `projects/app/src/pages/api/proApi/` 下按前端既有调用路径创建具体路由文件（如 `support/user/team/org/list.ts`），即可在不动前端一行代码的情况下接管该接口。未遮蔽的其余 proApi 路径仍走 catch-all（未配置商业版时报错，与现状一致）。

前端请求格式（`projects/app/src/web/common/api/request.ts`）：

- REST 方法映射：GET 用 query 传参；POST/PUT body 传 JSON；DELETE 实际发 POST + header `X-HTTP-Method-Override`（读 request.ts 的 DELETE 实现确认）。
- 响应统一走 `jsonRes`；错误抛 `Promise.reject(错误枚举)`。
- 路由统一导出 `NextAPI(handler)`，参考任意开源路由（如 `projects/app/src/pages/api/support/user/team/update.ts`）。

## 5. 需实现的 API 清单

鉴权常量来自 `@fastgpt/global/support/permission/constant`：`ManagePermissionVal`（团队管理）、`OwnerRoleVal`/`ManageRoleVal`/`WriteRoleVal`/`ReadRoleVal`（资源协作者）。团队级鉴权统一用：

```ts
const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });
```

### 5.1 成员与账号管理（阶段 1，P0）

| # | 路由（文件建于 `projects/app/src/pages/api/proApi/` 下） | 方法 | 逻辑要点 |
|---|---|---|---|
| M1 | `support/user/team/member/list.ts` | POST | 分页（`PaginationProps`/`PaginationResponse`，见 `@fastgpt/global/openapi/api`）。筛选：searchKey（memberName 模糊）、orgId、groupId、status。`withPermission: true` 时对每个成员调 `getTmbPermission({resourceType:'team', teamId, tmbId})` 包装成 `TeamPermission`；`withOrgs: true` 时查 team_org_members + teams_orgs 拼 `/团队名/部门1/部门2` 路径数组 |
| M2 | `support/user/team/member/count.ts` | GET | active 成员计数 |
| M3 | `support/user/team/member/delete.ts` | DELETE | 软删除：tmb.status = inactive；同一事务内：删除其全部 resource_permissions、team_org_members、team_member_group_members 记录；删除其全部 session（`delUserAllSession`，见 `packages/service/support/user/session.ts`）。禁止删除 owner |
| M4 | `support/user/team/member/restore.ts` | POST | status 恢复 active（权限不自动恢复，需重新授权——文档化该行为） |
| M5 | `support/user/team/member/updateNameByManager.ts` | PUT | 管理员改成员显示名；要求 ManagePermissionVal |
| M6 | `support/user/team/member/updateName.ts` | PUT | 成员改自己显示名；`authCert` 后校验 tmbId 归属 |
| M7 | `support/user/team/member/leave.ts` | DELETE | 员工自助离职：同 M3 逻辑，非 owner 可执行 |
| M8 | **新增开源路由** `projects/app/src/pages/api/support/user/team/member/createAccount.ts` | POST | **管理员开通账号**（详见 5.2，核心接口，不走 proApi 遮蔽，直接新增） |
| M9 | `support/user/team/list.ts` | GET | 当前用户加入的团队列表（TeamSelector 依赖）。查询 team_members by userId + populate team |
| M10 | `support/user/team/switch.ts` | PUT | 切换当前团队：更新 user.lastLoginTmbId 并签发新 session |
| M11 | `support/user/team/changeOwner.ts` | PUT | 团队所有权转移（详见 5.4） |
| M12 | `support/user/team/create.ts` | POST | 企业场景禁止普通成员自建团队：非 manage 权限直接 reject `TeamErrEnum.unAuthTeam`（保持接口存在避免 404 噪音） |

> **砍掉不实现**：邀请链接（invitationLink 全套）、`member/updateInvite`、自助注册、oauth/wx/fastLogin、验证码（sendAuthCode/captcha）。前端登录页对这些有降级容错（开源版单独部署是官方支持形态），无需处理。

### 5.2 管理员开通账号（M8，本需求核心新接口）

**请求**（新增 Zod schema，放 `packages/global/openapi/support/user/team/member/createAccount/api.ts`，遵循仓库 openapi 契约组织方式）：

```ts
{
  username: string;        // 工号或邮箱，唯一（users.username 有 unique 索引）
  password: string;        // 明文（POST body 经 https），或空则服务端生成随机密码返回
  memberName: string;      // 显示名
  orgId?: string;          // 初始部门（可选，须属于当前团队）
  permission?: number;     // 团队角色位值，默认 TeamDefaultRoleVal
}
```

**实现要点**：

1. 鉴权：`authUserPer({req, authToken: true, per: ManagePermissionVal})`。
2. 入参校验用 `parseApiInput`（**仓库强制规范，禁止直接 Schema.parse(req.body)**）。
3. 事务（`mongoSessionRun`，参考 `initRootUser`）：
   - `MongoUser.create([{ username, password: hashStr(password) }])` —— **密码写入模式必须与 `projects/app/src/service/mongo.ts` 的 `initRootUser` 完全一致**（先 `hashStr` 再传入 create）。
   - `MongoTeamMember.create([{ teamId: 当前团队, userId, name: memberName, status: active }])` —— **注意：不要调用 `createDefaultTeam`**（那是注册流程建新团队用的）；管理员开通的账号直接加入当前团队。
   - 若传 orgId：校验 org 属于本团队后 `MongoOrgMemberModel.create([{ teamId, orgId, tmbId }])`。
   - 写团队角色：`MongoResourcePermission` upsert（resourceType: 'team', teamId, tmbId, permission）。
4. **验收硬标准**：创建后立即用该 username/password 走标准登录接口 `/api/support/user/account/loginByPassword` 必须成功。若失败（疑似 mongoose schema setter 二次 hash），把 create 改为传明文（去掉手动 hashStr）再验，二选一以测试通过为准。此问题必须在开发时实测锁定，并在代码注释中写明结论。
5. 用户名冲突：捕获 duplicate key，返回友好错误（`UserErrEnum` 或自定义 i18n 文案）。
6. 审计：`addAuditLog`（参考 `updatePasswordByOld.ts` 用法，事件用现有 `AuditEventEnum` 中最贴近的，必要时新增枚举）。

### 5.3 组织架构（部门树）管理（阶段 1，P0）

树结构约定（`orgSchema.ts`）：每部门有 `pathId`（nanoid）与 `path`（祖先 pathId 以 `/` 串联，根部门 path=''）。子部门 path = `parent.path + '/' + parent.pathId`（用 `getOrgChildrenPath`，定义于 `packages/global/support/user/team/org/constant.ts`，实现时以该文件实际导出为准）。团队创建时已自动建 ROOT 部门（`createRootOrg`）。

| # | 路由 | 方法 | 逻辑要点 |
|---|---|---|---|
| O1 | `support/user/team/org/list.ts` | POST | body: `{orgId?, withPermission?, searchKey?}`（`projects/app/src/web/support/user/team/org/api.ts`）。orgId 为空返回根的一级子部门；否则返回 `orgId` 的直接子部门（按 path 前缀查，参考 `getChildrenByOrg` 改造为"仅直接子级"）。每项返回 `OrgListItemType`：含 total（直接成员数+直接子部门数）；withPermission 时包装 `TeamPermission`（部门本体作为授权主体时对团队资源的权限，用于前端显示） |
| O2 | `support/user/team/org/create.ts` | POST | body 见 `postCreateOrgData`（name/description/avatar/orgId 父部门）。计算新 path/pathId（nanoid）。非空 orgId 时校验父部门存在 |
| O3 | `support/user/team/org/update.ts` | PUT | 改 name/avatar/description，禁止改根（orgId 必填即此意） |
| O4 | `support/user/team/org/move.ts` | PUT | 移动部门到新父级。**path 重写**：目标子树所有后代 path 前缀替换（查 `getOrgAndChildren`，事务内批量 update）。禁止：移入自己或自己的后代（成环校验） |
| O5 | `support/user/team/org/delete.ts` | DELETE | **非空禁止删除**：该部门存在成员或子部门时 reject（后端强校验，前端已有确认框）。空部门删除 org + 其 org members 残留 |
| O6 | `support/user/team/org/updateMembers.ts` | PUT | body: `{orgId?, members: [{tmbId}]}`。覆盖式设置该部门直接成员集合（diff：删除移出的、新增移入的）。orgId 为空表示根部门（此时允许清空根成员？——根部门成员=未分组成员，允许设置）。校验所有 tmbId 属于本团队且 active |
| O7 | `support/user/team/org/deleteMember.ts` | DELETE | 从指定部门移除单个成员（query: orgId, tmbId） |

所有 O 系列接口鉴权 `ManagePermissionVal`。O1 同时被成员选择器（协作者授权弹窗 `MemberModal.tsx`）以 `withPermission: false` 调用，注意该场景也放行（仍是管理员才可授权资源，但弹窗本身可能被非管理员打开——保守起见 O1 鉴权降为 `ReadPermissionVal`，写操作保持 manage）。

### 5.4 团队所有权与团队级角色（阶段 1，P0）

- **M11 changeOwner**：校验操作者是当前 owner（`TeamMemberRoleEnum.owner`，注意 `teamMemberSchema.role` 字段虽标注 deprecated 但 `getTeamMember` 仍以它判 isOwner，**必须同步更新**）。事务内：旧 owner role→member、新 owner role→owner；resource_permissions 中 team 资源类型的 OwnerRoleVal 记录从旧 owner tmbId 迁移到新 owner tmbId。
- **团队协作者（PermissionManage 页面）**：

| # | 路由 | 方法 | 逻辑要点 |
|---|---|---|---|
| T1 | `support/user/team/collaborator/list.ts` | GET | 查 `MongoResourcePermission`（resourceType: 'team', teamId, resourceId 不存在），用 `getClbsInfo`（controller.ts 已有）补 name/avatar，返回 `CollaboratorListType`（clbs 仅自身，无 parentClbs） |
| T2 | `support/user/team/collaborator/update.ts` | POST | 覆盖式更新团队协作者集合（diff 删除/新增/改权限，注意保留 owner 记录不可删） |
| T3 | `support/user/team/collaborator/updateOne.ts` | PUT | 单个协作者（tmbId/orgId/groupId 三选一）权限更新 |
| T4 | `support/user/team/collaborator/delete.ts` | DELETE | 删除单条团队协作者记录（owner 不可删） |

T1–T4 鉴权 `ManagePermissionVal`；授权对象校验属于本团队。团队角色位值语义见 `packages/global/support/permission/user/constant.ts`（含 appCreate/datasetCreate 等 4 个能力位）。

### 5.5 资源协作者授权（阶段 2，P0——权限隔离的核心闭环）

三类资源共用同一套模式。契约已开源：`packages/global/openapi/support/permission/api.ts`（app）、`packages/global/core/dataset/collaborator.ts`、`packages/global/core/ai/skill/collaborator.ts`。读侧参考已开源的 `projects/app/src/pages/api/core/app/getPermission.ts`。

| # | 路由 | 方法 | 逻辑要点 |
|---|---|---|---|
| C1 | `core/app/collaborator/list.ts` | GET | query: appId。鉴权 `authApp({req, appId, per: ReadPermissionVal})`（manage 以上才可见完整列表，读权限只能看自己——参考商业版行为，简化为 manage）。返回 `{clbs, parentClbs}`：资源自身 clbs；若资源 `inheritPermission: true` 且有 parentId，合并父级 clbs（`mergeCollaboratorList`）作为 parentClbs |
| C2 | `core/app/collaborator/update.ts` | POST | body: `{appId, collaborators: CollaboratorItemSchema[]}`。鉴权 `authApp({per: OwnerRoleVal})`。覆盖式更新：diff 新旧集合 → 删除消失项/更新变更项/新增新项（bulkWrite upsert，参考 `createResourceDefaultCollaborators` 的写法）。**继承冲突**：目标资源是文件夹或处于继承态时，用 `checkRoleUpdateConflict` 判断变更是否触碰父级授权——触碰则将该资源 `inheritPermission` 置 false（参考 `resumeInheritPermission.ts` 与 `syncChildrenPermission` 的既有语义）。**文件夹级联**：目标是文件夹时调 `syncChildrenPermission` 同步全部后代。owner 记录（资源创建者）不可被移除，最多降为 manage |
| C3 | `core/dataset/collaborator/list.ts` | GET | 同 C1，datasetId 参数，鉴权 `authDataset` |
| C4 | `core/dataset/collaborator/update.ts` | POST | 同 C2，dataset 版 |
| C5 | `core/ai/skill/collaborator/list.ts` | GET | 同 C1，skillId 参数，鉴权参考 skill 模块已有 auth |
| C6 | `core/ai/skill/collaborator/update.ts` | POST | 同 C2，skill 版 |

授权主体校验：tmbId/groupId/orgId 必须属于本团队，否则 reject（防止跨团队 ObjectId 注入）。

> 资源默认即私有（创建时仅 owner 一条权限记录，见 `createResourceDefaultCollaborators`），无需额外"强制隔离"开关。

### 5.6 成员组（阶段 3，P1，可选）

前端页面与 Schema 均在（`GroupManage`）。若部门树已满足需求可暂缓；实现时接口为 `support/user/team/group/{list,create,delete,update,changeOwner}`，模式与 O 系列一致（group 的 owner 用 team_member_group_members.role 字段，见 `GroupMemberRole`）。本文档不展开，需要时补充。

## 6. 工程规范（仓库强制，违反会被 review 打回）

1. **入参校验一律 `parseApiInput`**（`@fastgpt/service/common/zod/requestParseError`），禁止 `Schema.parse(req.body)`。设计文档：`.agents/design/api/zod-request-parse-error-handling.md`。
2. **Mongo 索引**：本需求**不新增/不修改任何索引与 Schema**。若后续确需，必须用 `defineIndex` 并同步 `packages/service/test/common/mongo/indexManager.test.ts`，禁止 `schema.index()` / `index: true`。
3. **函数注释**：导出函数、权限校验、事务边界、diff 写入等关键函数补 `/** */` 中文注释，说明设计原因而非复述代码。
4. **子函数位置**：单函数使用的 helper 放函数内部；跨复用才上模块级并加注释。
5. **事务**：多集合写入（账号创建、成员删除、部门移动、所有权转移）必须 `mongoSessionRun`。
6. **审计**：敏感操作（开通账号、删除成员、转移所有权、协作者变更）调 `addAuditLog`。
7. **参考实现优先级**：写每个 handler 前，先读对应领域已有开源代码（同表格中列出的文件），保持错误枚举（`TeamErrEnum`/`UserErrEnum`）、返回结构与既有风格一致。
8. Next.js 版本有破坏性变更：写路由前先看 `projects/app/node_modules/next/dist/docs/` 相应指南与邻近既有路由的实际写法。

## 7. 分阶段 TODO

### 阶段 1：账号与部门树（最小可用）
- [x] 1.1 M8 createAccount（含 5.2 密码写入模式实测 + 登录闭环测试）
- [x] 1.2 M1/M2 member/list、count（含 withPermission/withOrgs）
- [x] 1.3 M3/M4/M5/M6/M7 成员删除/恢复/改名/离职
- [x] 1.4 M9/M10/M12 team/list、switch、create（禁用）
- [x] 1.5 O1–O7 部门树全套 CRUD + 移动 + 成员调整
- [x] 1.6 M11 + T1–T4 所有权转移与团队角色管理
- [x] 1.7 局部测试：账号创建→登录→入部门→列表可见
- [ ] 1.8 手工回归：/account/team 页面五个 tab 全部无报错

### 阶段 2：资源授权闭环（隔离生效）
- [ ] 2.1 C1/C2 app 协作者（含继承冲突与文件夹级联）
- [ ] 2.2 C3/C4 dataset 协作者
- [ ] 2.3 C5/C6 skill 协作者
- [ ] 2.4 隔离验证：A 部门账号登录看不到 B 部门未共享资源；授权 read 后可见不可编辑
- [ ] 2.5 全局搜索 `/proApi/` 核对剩余调用点，确认未实现项均有前端降级（不阻塞主流程）

### 阶段 3（可选）：成员组
- [ ] 3.1 group 全套接口
- [ ] 3.2 组成员选择器接入协作者授权弹窗验证

### 收尾
- [ ] 4.1 `pnpm test` 全量通过（中途只跑局部测试）
- [ ] 4.2 补充/更新 `packages/global/openapi` 契约与 i18n 文案（新增错误提示需中英日三语）

## 8. 验收标准（端到端场景）

1. 管理员创建账号（指定部门 A）→ 新用户密码登录成功 → 只看到自己创建的资源。
2. 管理员建部门树 研发中心/前端组、后端组 → 移动部门、增删成员均正确，路径显示 `/研发中心/前端组`。
3. 将 App X 授权给"前端组"（read）→ 前端组所有成员可见 App X；后端组不可见。
4. 同一资源叠加个人 write + 部门 read → 生效 write（位求和，`getTmbPermission` 语义）。
5. 移除成员 → 其会话失效、权限清空、恢复后需重新授权。
6. 所有管理操作出现在审计日志。

## 9. 明确不做（Out of Scope）

- SSO/OIDC/LDAP 对接（后续单独立项）
- 邀请链接、自助注册、手机/邮箱验证码
- 资源"所属部门"字段与强制部门隔离（见第 2 节设计说明）
- 跨团队数据共享（单团队内部隔离场景）
