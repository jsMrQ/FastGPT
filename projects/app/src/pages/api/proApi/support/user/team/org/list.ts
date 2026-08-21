import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { OrgListItemType, OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';

const BodySchema = z.object({
  orgId: z.string().optional(),
  withPermission: z.boolean().optional(),
  searchKey: z.string().optional()
});

async function handler(req: ApiRequestProps): Promise<OrgListItemType[]> {
  const { body } = parseApiInput({ req, bodySchema: BodySchema });

  // O1 鉴权降为 ReadPermissionVal，允许非 manage 的协作者弹窗场景访问
  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  // 找父级 org：无 orgId 或空字符串时使用 ROOT
  let parentOrg: OrgSchemaType;
  if (body.orgId) {
    const found = await MongoOrgModel.findOne({
      _id: new Types.ObjectId(body.orgId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!found) return Promise.reject(TeamErrEnum.orgNotExist);
    parentOrg = found;
  } else {
    const root = await MongoOrgModel.findOne({
      teamId: new Types.ObjectId(teamId),
      path: ''
    }).lean();
    if (!root) return Promise.reject(TeamErrEnum.orgNotExist);
    parentOrg = root;
  }

  const directChildrenPath = getOrgChildrenPath(parentOrg);

  // 精确匹配直接子部门（不用正则，避免把孙子部门也拉进来）
  const childrenQuery: Record<string, any> = {
    teamId: new Types.ObjectId(teamId),
    path: directChildrenPath
  };
  if (body.searchKey) {
    childrenQuery.name = { $regex: body.searchKey, $options: 'i' };
  }

  const children = await MongoOrgModel.find(childrenQuery).lean();

  if (children.length === 0) return [];

  const childIds = children.map((c) => c._id);

  // 并行查询每个子部门的成员数和子部门数
  const [memberCounts, subOrgCounts, permRecords] = await Promise.all([
    // 直接成员数
    MongoOrgMemberModel.aggregate([
      { $match: { teamId: new Types.ObjectId(teamId), orgId: { $in: childIds } } },
      { $group: { _id: '$orgId', count: { $sum: 1 } } }
    ]),
    // 直接子部门数（path === 当前 org 的 childrenPath）
    Promise.all(
      children.map(async (c) => ({
        orgId: String(c._id),
        count: await MongoOrgModel.countDocuments({
          teamId: new Types.ObjectId(teamId),
          path: getOrgChildrenPath(c)
        })
      }))
    ),
    // 权限记录（如需 withPermission）
    body.withPermission
      ? MongoResourcePermission.find(
          {
            resourceType: PerResourceTypeEnum.team,
            teamId: new Types.ObjectId(teamId),
            orgId: { $in: childIds }
          },
          'orgId permission'
        ).lean()
      : Promise.resolve([])
  ]);

  const memberCountMap = new Map(
    (memberCounts as { _id: any; count: number }[]).map((r) => [String(r._id), r.count])
  );
  const subOrgCountMap = new Map(subOrgCounts.map((r) => [r.orgId, r.count]));
  const permMap = new Map(
    (permRecords as { orgId: any; permission: number }[]).map((r) => [
      String(r.orgId),
      r.permission
    ])
  );

  return children.map((org): OrgListItemType => {
    const orgIdStr = String(org._id);
    const memberCount = memberCountMap.get(orgIdStr) ?? 0;
    const subOrgCount = subOrgCountMap.get(orgIdStr) ?? 0;

    const item: OrgListItemType = {
      ...org,
      _id: orgIdStr,
      teamId: String(org.teamId),
      total: memberCount + subOrgCount
    };

    if (body.withPermission) {
      const per = permMap.get(orgIdStr);
      item.permission = new TeamPermission({ role: per ?? 0 });
    }

    return item;
  });
}

export default NextAPI(handler);
