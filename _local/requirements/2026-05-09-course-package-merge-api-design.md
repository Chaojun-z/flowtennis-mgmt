# 课包合并接口设计

> 路径：`_local/requirements/2026-05-09-course-package-merge-api-design.md`
>
> 本文档只定义“课包合并”的接口层设计，不写实施步骤，不写代码细节。
> 范围按多包版：`一个主包 A + 多个 source package B1/B2/B3...`

---

## 1. 目标

接口层必须满足：

- 支持 `A <- [B1, B2, B3, ...]`
- 发起前支持 preview
- 发起后按批处理任务执行
- 支持 resume 补跑
- 所有读写统一经过 canonical package 解析层
- 支持独立 merge 审计查询
- 支持主包成员关系视图

---

## 2. 统一约定

### 2.1 鉴权

- 所有 merge 管理接口仅 `admin` 可调用
- 非 admin 调用返回 `403`

### 2.2 统一术语

- `targetPackageId`
  - 主包 A
- `sourcePackageIds`
  - 被合并包列表 B1/B2/B3...
- `canonicalPackageId`
  - 最终主包 ID
- `mergeAuditId`
  - 本次 merge 任务 ID

### 2.3 sourcePackageIds 标准化

所有 merge 相关接口在进入核心逻辑前，都必须执行：

1. 对每个 `sourcePackageId` 执行 canonical 解析
2. 去重
3. 剔除解析后等于 `targetPackageId` canonical 结果的项
4. 保留原始输入到标准化结果的映射

统一返回字段建议：

```json
{
  "sourceInput": ["B1", "B2", "B2", "A"],
  "sourceResolved": [
    { "inputPackageId": "B1", "canonicalPackageId": "B1" },
    { "inputPackageId": "B2", "canonicalPackageId": "B2" },
    { "inputPackageId": "A", "canonicalPackageId": "A" }
  ],
  "sourceDeduped": ["B1", "B2"],
  "sourceRemovedAsTarget": ["A"]
}
```

### 2.4 返回错误码建议

统一业务错误：

- `PACKAGE_NOT_FOUND`
- `TARGET_PACKAGE_INVALID`
- `TARGET_PACKAGE_MERGED`
- `SOURCE_PACKAGE_INVALID`
- `SOURCE_PACKAGE_ALREADY_MERGED`
- `SOURCE_EQUALS_TARGET`
- `SOURCE_LIST_EMPTY`
- `MERGE_RULE_MISMATCH`
- `MERGE_CONFIRM_TEXT_INVALID`
- `MERGE_AUDIT_NOT_FOUND`
- `MERGE_AUDIT_STATUS_INVALID`

---

## 3. 内部能力接口

这些可以是内部函数，不一定暴露 HTTP。

### 3.1 resolveCanonicalPackageId

用途：

- 把任意 packageId 解析到最终主包

签名建议：

```js
resolveCanonicalPackageId(packageId, packageMap) => {
  packageId: "A",
  chain: ["B1", "A"],
  depth: 2
}
```

要求：

- 支持链式兼容
- 做循环保护
- 找不到包时抛业务错误

### 3.2 normalizeMergeSourcePackages

用途：

- 标准化 `sourcePackageIds[]`

签名建议：

```js
normalizeMergeSourcePackages({
  targetPackageId,
  sourcePackageIds,
  packageMap
}) => {
  targetCanonicalPackageId: "A",
  sourceInput: [],
  sourceResolved: [],
  sourceDeduped: [],
  sourceRemovedAsTarget: [],
  normalizedSourcePackageIds: ["B1", "B2", "B3"]
}
```

### 3.3 validateMergeRuleAgainstTarget

用途：

- 校验每个 source package 是否与主包 A 履约规则一致

返回建议：

```json
{
  "ok": true,
  "checks": [
    {
      "sourcePackageId": "B1",
      "ok": true,
      "fields": [
        { "field": "courseType", "ok": true },
        { "field": "lessons", "ok": true },
        { "field": "validityRule", "ok": true },
        { "field": "timeBand", "ok": true },
        { "field": "dailyTimeWindows", "ok": true },
        { "field": "coachScope", "ok": true },
        { "field": "campusScope", "ok": true },
        { "field": "maxStudents", "ok": true }
      ]
    }
  ]
}
```

### 3.4 summarizeMergeImpact

用途：

- 计算每个 source package 的影响摘要，以及全量汇总

返回建议：

```json
{
  "bySource": [
    {
      "sourcePackageId": "B1",
      "purchaseCount": 4,
      "entitlementCount": 4,
      "totalLessons": 40,
      "usedLessons": 10,
      "remainingLessons": 30
    }
  ],
  "summary": {
    "sourceCount": 3,
    "purchaseCount": 12,
    "entitlementCount": 12,
    "totalLessons": 120,
    "usedLessons": 38,
    "remainingLessons": 82
  }
}
```

---

## 4. HTTP 接口

### 4.1 Preview

`POST /packages/merge-preview`

用途：

- 发起前预检查
- 返回标准化结果、规则校验、影响摘要

请求：

```json
{
  "targetPackageId": "A",
  "sourcePackageIds": ["B1", "B2", "B3"]
}
```

返回：

```json
{
  "targetPackage": {
    "id": "A",
    "name": "主课包A"
  },
  "normalization": {
    "targetCanonicalPackageId": "A",
    "sourceInput": ["B1", "B2", "B3"],
    "sourceResolved": [
      { "inputPackageId": "B1", "canonicalPackageId": "B1" },
      { "inputPackageId": "B2", "canonicalPackageId": "B2" },
      { "inputPackageId": "B3", "canonicalPackageId": "B3" }
    ],
    "sourceDeduped": ["B1", "B2", "B3"],
    "sourceRemovedAsTarget": [],
    "normalizedSourcePackageIds": ["B1", "B2", "B3"]
  },
  "validation": {
    "ok": true,
    "checks": []
  },
  "impact": {
    "bySource": [],
    "summary": {}
  },
  "warnings": []
}
```

拦截条件：

- A 不存在
- A 已 merged
- 标准化后没有可合并 source package
- 任一 source package 与 A 履约规则不一致

### 4.2 Create

`POST /packages/merge`

用途：

- 创建 merge 审计任务
- 立即执行 `mark_source`
- 启动批处理

请求：

```json
{
  "targetPackageId": "A",
  "sourcePackageIds": ["B1", "B2", "B3"],
  "reason": "历史等价课包统一归主包A",
  "confirmText": "主课包A"
}
```

返回：

```json
{
  "mergeAuditId": "merge_xxx",
  "status": "running",
  "targetPackageId": "A",
  "sourcePackageIds": ["B1", "B2", "B3"],
  "impactSummary": {
    "sourceCount": 3,
    "purchaseCount": 12,
    "entitlementCount": 12
  }
}
```

关键要求：

- 实际写入审计表的 sourcePackageIds 必须是标准化后的结果
- `confirmText` 必须等于 A 当前名称
- 合并后履约规则只认 A，不生成任何并集规则

### 4.3 Query Audit

`GET /package-merge-audit/:id`

用途：

- 查看 merge 任务状态
- 查看双层进度

返回：

```json
{
  "id": "merge_xxx",
  "status": "running",
  "targetPackageId": "A",
  "sourcePackageIds": ["B1", "B2", "B3"],
  "impactSummary": {},
  "packageProgress": [
    {
      "sourcePackageId": "B1",
      "status": "completed"
    },
    {
      "sourcePackageId": "B2",
      "status": "running"
    }
  ],
  "recordProgress": [
    {
      "sourcePackageId": "B2",
      "purchaseTotal": 4,
      "purchaseProcessed": 2,
      "purchaseRemaining": 2,
      "purchaseCursor": "purchase_xxx",
      "entitlementTotal": 4,
      "entitlementProcessed": 1,
      "entitlementRemaining": 3,
      "entitlementCursor": "ent_xxx"
    }
  ],
  "errorMessage": ""
}
```

### 4.4 Resume

`POST /package-merge-audit/:id/resume`

用途：

- 中断后继续补跑

请求：

```json
{}
```

返回：

```json
{
  "mergeAuditId": "merge_xxx",
  "status": "running"
}
```

限制：

- 仅 `failed` 或 `running` 但未完成任务可 resume
- `completed` 任务不可重复重开

### 4.5 List Audit

`GET /package-merge-audit`

用途：

- 管理端查看 merge 历史

支持参数建议：

- `targetPackageId`
- `status`
- `dateFrom`
- `dateTo`

返回建议：

```json
{
  "rows": [
    {
      "id": "merge_xxx",
      "targetPackageId": "A",
      "targetPackageName": "主课包A",
      "sourcePackageCount": 3,
      "status": "completed",
      "operator": "管理员",
      "createdAt": "2026-05-09T10:00:00.000Z",
      "completedAt": "2026-05-09T10:01:30.000Z"
    }
  ]
}
```

### 4.6 主包成员关系视图

`GET /packages/:id/merge-members`

用途：

- 查看主包 A 下挂的历史包及各自贡献摘要

返回：

```json
{
  "targetPackageId": "A",
  "targetPackageName": "主课包A",
  "members": [
    {
      "packageId": "B1",
      "packageName": "历史包B1",
      "mergedAt": "2026-05-09T10:00:00.000Z",
      "mergedBy": "管理员",
      "purchaseCount": 4,
      "entitlementCount": 4,
      "totalLessons": 40,
      "usedLessons": 10,
      "remainingLessons": 30
    }
  ],
  "summary": {
    "memberCount": 3,
    "purchaseCount": 12,
    "entitlementCount": 12,
    "totalLessons": 120,
    "usedLessons": 38,
    "remainingLessons": 82
  }
}
```

### 4.7 读取课包列表兼容

`GET /packages`

补充行为：

- 默认过滤 `mergedIntoPackageId` 非空的 source package
- 支持管理端可选 `includeMergedSources=true`

### 4.8 写入购买兼容

`POST /purchases`

补充行为：

- 传入 `packageId` 后先执行 canonical 解析
- 真正落库到 purchase / entitlement 的 packageId 一律写 canonical A

返回建议补充：

```json
{
  "purchase": {},
  "entitlement": {},
  "packageResolution": {
    "inputPackageId": "B1",
    "canonicalPackageId": "A"
  }
}
```

### 4.9 导入购买兼容

当前导入逻辑如果内部走 `/purchases`，则自动继承 canonical 规则。  
如果存在单独导入接口，也必须返回：

- 原始匹配包
- canonical 包
- 是否发生自动映射

---

## 5. 审计表字段建议

表：`ft_package_merge_audit`

主字段建议：

- `id`
- `targetPackageId`
- `targetPackageName`
- `sourcePackageIds`
- `sourcePackageNames`
- `sourcePackageCount`
- `sourceInput`
- `sourceResolved`
- `sourceRemovedAsTarget`
- `reason`
- `operator`
- `status`
- `validationSnapshot`
- `impactSummary`
- `packageProgress`
- `recordProgress`
- `errorMessage`
- `createdAt`
- `updatedAt`
- `completedAt`

说明：

- `packageProgress` 是包级状态
- `recordProgress` 是记录级进度

---

## 6. 状态机建议

任务总状态：

- `pending`
- `running`
- `completed`
- `failed`

单个 source package 状态：

- `pending`
- `marked`
- `migrating_purchases`
- `purchases_done`
- `migrating_entitlements`
- `entitlements_done`
- `completed`
- `failed`

---

## 7. 兼容读写规则

### 7.1 统一读口径

以下读场景都应显示 canonical A：

- 购买记录列表
- 权益列表
- 统计报表
- 排课推荐

历史详情可以额外显示：

- `originalPackageId`
- `originalPackageName`
- `mergedFromPackageId`
- `mergeAuditId`

### 7.2 统一写口径

以下写场景都必须先 canonical 化：

- 新增购买
- 编辑购买切换包
- CSV 导入
- 手工补录
- 修复脚本

---

## 8. 非目标

本轮接口不做：

- 前台撤销 merge
- 多主包相互合并
- 自动合并推荐
- 前台学员端展示 merge 结构

---

## 9. 结论

接口层的关键不是“多一个 merge 接口”，而是：

- 先把 canonical package 解析层立住
- 再把 merge 任务做成可预检查、可中断、可补跑的批处理接口
- 所有读写都统一收敛到 canonical 主包 A

如果后面实现时偏成“单包接口 + 特判多个 source package 循环调用”，就会返工。第一版就应该按多包审计、多包进度、多包预览来落。
