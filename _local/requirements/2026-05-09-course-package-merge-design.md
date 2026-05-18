# 课包合并设计方案

> 路径：`_local/requirements/2026-05-09-course-package-merge-design.md`
>
> 本文档只定义“课包合并”的产品规则、技术方案、数据影响、接口设计、页面交互、实施步骤、风险与审计。
> 当前结论：采用 `后端真实归并 + canonical package 解析层 + 保留原始来源字段 + 独立 merge 审计表 + 可重复执行批处理任务`。
> 从第一版开始即按 `一个主包 A，同时合并 3-5 个等价课包 B1/B2/B3...` 设计，不做单包版过渡方案。

---

## 1. 目标口径

管理端用户视角里：

- 合并后只看到主课包 A，看不到被合并课包 B
- 历史购买记录统一显示 A 的名字
- 历史权益和扣课统计统一算到 A
- 合并只允许管理员操作
- 必须保留完整审计
- 不做前台可撤销，但必须保留人工恢复依据

设计原则：

- 不做前端假合并
- 做后端真实归并
- 不能粗暴删除 B 的历史痕迹
- 必须补 `canonical package` 解析层，不能只依赖一次性数据改写
- 合并执行必须按“可重复执行的批处理/迁移任务”设计，支持中断后继续补跑
- 必须原生支持 `A <- [B1, B2, B3, ...]` 批量合并

---

## 2. 核心约束

### 2.1 主包与被合并包约束

- 只能执行 `B -> A`
- 一次操作允许 `A <- [B1, B2, B3, ...]`
- 第一版建议前端单次上限 5 个 source package，避免摘要和确认弹窗过大
- A 必须是活跃主包，不能本身也是已合并包
- 每个 B 都必须是未合并状态
- 任一 B 都不能等于 A
- source package 列表不能重复
- 不允许链式目标错误
  - 允许历史上存在 `C -> B -> A` 这种兼容链，但最终 canonical 必须解析到 A
  - 新发起的 merge 操作里，目标 A 必须已经是最终 canonical 主包

### 2.2 合并校验口径

不要把“价格一致”作为硬门槛。

价格属于历史销售事实，不属于履约规则本身。  
合并校验应以“履约规则一致”判断，建议校验项如下：

- `courseType`
- `lessons`
- `validDays / usageStartDate / usageEndDate` 的履约口径
- `timeBand`
- `dailyTimeWindows`
- `coachIds / coachNames`
- `campusIds`
- `maxStudents`

说明：

- `price`
- `packagePrice`
- `amountPaid`
- `overrideReason`

这些属于销售事实或成交事实，不作为是否允许合并的硬门槛。

### 2.2.1 合并后的履约规则唯一口径

多包合并后，一律以主包 A 的履约规则为唯一标准。

明确禁止：

- 不能把多个 source package 的教练范围取并集
- 不能把多个 source package 的校区范围取并集
- 不能把多个 source package 的时段规则取并集
- 不能把多个 source package 的有效期规则拼接成混合规则

执行口径：

- 合并前：要求每个 source package 与 A 的履约规则一致
- 合并后：系统只认 A 当前的履约规则
- 历史成交价格、原始来源、历史购买事实仍保留，但履约侧只按 A 生效

### 2.3 权限约束

- 仅 `admin` 可发起
- 合并按钮只在管理员端展示
- 非管理员所有读写都通过 canonical 解析层自动看到 A，不暴露任何 B

---

## 3. 产品规则

### 3.1 管理端展示规则

- 课包列表默认隐藏已合并包 B
- A 继续正常显示
- 购买记录列表默认显示 A 的名字
- 权益列表默认显示 A 的名字
- 统计、筛选、聚合全部按 A 归口

### 3.2 历史追溯规则

虽然默认都显示 A，但历史详情里必须保留：

- 原购买课包名
- 原购买课包 ID
- 原权益来源课包名
- 原权益来源课包 ID
- 合并来源包 B
- 合并时间
- 合并操作人

### 3.3 被合并包 B 的状态规则

所有 source package 不删除，只转成历史兼容包：

- 不可新购
- 不可作为编辑目标继续改核心履约规则
- 不可再次作为主包被选择
- 不可从普通列表中展示
- 仍可在审计详情和历史追溯中看到

### 3.4 导入、补录、修复规则

后续任何写入如果传入 B，都不能直接继续写 B，必须先解析 canonical：

- 购买导入
- 手工补录购买
- 脚本修复
- 排课推荐
- 任何后端写接口

即：

- 传入 `packageId=B`
- 后端先解析 `resolveCanonicalPackageId(B) => A`
- 实际写入与校验均对 A 生效

如果是批量 merge 场景，`sourcePackageIds[]` 在真正执行前也必须先做同样的标准化：

1. 先对每个 source package 做 canonical 解析
2. 去重
3. 剔除解析后已经等于目标 A 的项
4. 如果剔除后为空，则直接拦截并提示“没有可合并的 source package”

### 3.5 合并前影响摘要

管理员发起前必须先看到影响摘要：

- A 当前基础信息
- 所有 source package 当前基础信息
- A 当前基础信息
- 校验结果：每个 source package 与 A 的履约规则一致性
- 每个 source package 的单独影响数据
- 汇总影响数据：
  - 受影响购买记录总数
  - 受影响权益记录总数
  - 总课时
  - 已消耗课时
  - 剩余课时
- 是否存在历史兼容链
- 是否存在异常数据

---

## 4. 技术方案总览

推荐方案分 4 层：

1. `packages` 真正标记所有 B 已并入 A
2. `purchases / entitlements` 真实归并到 A
3. 新增 `canonical package` 解析层，后续所有读写都先过解析
4. 新增独立 `package_merge_audit` 审计表，记录每次 merge 任务和快照

重点：

- 不是只改前端展示
- 不是只改一次历史数据
- 不是按单次事务思路
- 而是按“可中断、可重复执行、补跑安全”的批处理任务思路

---

## 5. 数据模型设计

### 5.1 packages 表新增字段

给课包表增加：

- `mergedIntoPackageId`
- `mergedIntoPackageName`
- `mergedAt`
- `mergedBy`
- `mergeAuditId`
- `mergeReason`
- `mergeStatus`
  - 建议值：`none | merged_source`

说明：

- A：`mergeStatus=none`
- 每个 B：`mergeStatus=merged_source`，并带 `mergedIntoPackageId=A.id`

### 5.2 purchases 表新增字段

保留历史来源：

- `originalPackageId`
- `originalPackageName`
- `mergedFromPackageId`
- `mergedFromPackageName`
- `mergeAuditId`
- `lastCanonicalPackageId`

口径：

- 合并后 `packageId/packageName` 改成 A
- 如果原来没有 `originalPackageId/originalPackageName`，首次合并时写入 B

### 5.3 entitlements 表新增字段

保留历史来源：

- `originalPackageId`
- `originalPackageName`
- `mergedFromPackageId`
- `mergedFromPackageName`
- `mergeAuditId`
- `lastCanonicalPackageId`

口径：

- 合并后 `packageId/packageName` 改成 A
- entitlement 本身不拆分、不重建、不重算消耗事实

### 5.4 新增独立 merge 审计表

新增表建议名：

- `ft_package_merge_audit`

每条 merge 一条主审计记录，字段建议：

- `id`
- `targetPackageId`
- `targetPackageName`
- `sourcePackageIds`
- `sourcePackageNames`
- `sourcePackageCount`
- `operator`
- `reason`
- `status`
  - `pending`
  - `running`
  - `completed`
  - `failed`
- `validationSnapshot`
- `impactSummary`
- `purchaseTotal`
- `entitlementTotal`
- `entitlementTotalLessons`
- `entitlementUsedLessons`
- `entitlementRemainingLessons`
- `cursor`
  - 批处理进度游标
- `sourceProgress`
  - 每个 source package 的批处理进度
- `recordProgress`
  - 每个 source package 下 purchase / entitlement 的记录级处理进度
- `processedPurchaseIds`
- `processedEntitlementIds`
- `errorMessage`
- `createdAt`
- `updatedAt`
- `completedAt`

说明：

- 不建议把 merge 审计混进 entitlement ledger
- entitlement ledger 只管权益变化事实
- merge 审计是独立管理行为，应单独成表

### 5.5 entitlement ledger 处理口径

历史消课流水不改业务事实，不批量重写历史 `lessonDelta`。

可选补一条零变动审计行：

- `action=package_merge`
- `lessonDelta=0`
- `reason=课包归并`
- `operator=管理员`

这条只是辅助查看，不替代独立 merge 审计表。

---

## 6. Canonical Package 解析层

这是本需求的硬要求，不能省。

### 6.1 为什么必须有这一层

只做一次性历史改写不够，原因：

- 旧脚本、导入、补录可能还会传 B
- 有可能出现中断，部分历史还没改完
- 兼容链存在时，读写不能依赖调用方自己判断
- 后续任何统计和接口都需要统一归口

所以必须新增统一解析函数，例如：

- `resolveCanonicalPackageId(packageId)`
- `resolveCanonicalPackage(packageId)`
- `normalizePackageReferenceForWrite(packageId)`

### 6.2 解析规则

给任意 packageId：

1. 查当前 package
2. 如果没有 `mergedIntoPackageId`，返回自己
3. 如果有，继续沿链追到最终主包
4. 做循环保护
5. 返回最终 canonical A

说明：

- 无论历史上是单包 merge 还是多包 merge，canonical 解析都是“给一个 packageId，返回最终主包”
- 多包 merge 不需要特殊解析 API，解析层本身天然支持

### 6.2.1 sourcePackageIds[] 标准化规则

多包 merge 发起前，对 `sourcePackageIds[]` 必须执行统一标准化：

1. 读取原始 `sourcePackageIds[]`
2. 对每个 packageId 执行 `resolveCanonicalPackageId`
3. 把解析结果收集为 canonical source 列表
4. 去重
5. 剔除任何已经等于 `targetPackageId` canonical 结果的项
6. 保留一份“原始输入 -> canonical 结果”的映射，用于预检查提示和审计

结果要求：

- 后续 preview
- merge create
- merge resume
- UI 预览展示

都基于这套标准化后的 source package 列表，不允许各处各算各的。

### 6.3 读场景必须接入

以下读逻辑都应先 canonical 化：

- 课包详情读取
- 购买记录列表显示
- 权益列表显示
- 排课推荐课包
- 财务/统计按课包聚合
- 导入预览中课包名称映射

### 6.4 写场景必须接入

以下写逻辑都应先 canonical 化：

- 新建购买
- 编辑购买切换 packageId
- CSV 导入购买
- 手工补录购买
- 修复脚本补写 purchase
- 任何依赖 packageId 的后台任务

### 6.5 页面过滤规则

普通课包列表：

- 默认过滤 `mergedIntoPackageId` 非空的包

详情或审计页：

- 可按“包含历史兼容包”模式查看

---

## 7. 合并执行模型

### 7.1 不按普通事务思路

本项目底层是 TableStore 主链，不能假设存在一次性强事务把所有表全包住。  
因此 merge 不应设计成“一个接口内全量事务提交”，而应设计成：

- 先创建 merge 审计任务
- 再按批次扫描和写入
- 中断后可继续
- 重复执行不会造成二次污染
- 同一任务内支持多个 source package

### 7.2 任务阶段

建议分 5 个阶段：

1. `prepare`
   - 校验 A 和全部 B
   - 生成 impact summary
   - 写入 merge audit `pending`

2. `mark_source`
   - 给所有标准化后的 B 写 `mergedIntoPackageId=A.id`
   - 让 canonical 解析层立即生效
   - 这一步很关键，后续即使批处理未跑完，新增写入也已自动归 A

3. `migrate_purchases`
   - 按 source package 分批更新所有 B 下 purchases 到 A

4. `migrate_entitlements`
   - 按 source package 分批更新所有 B 下 entitlements 到 A

5. `finalize`
   - 写完成状态
   - 记录汇总
   - 可选补 entitlement ledger 审计行

### 7.3 为什么先 mark_source

因为你明确要求“后续任何读取/写入遇到 B，都要先解析到 A”。

所以即使历史迁移还没全跑完，只要：

- 所有 B 已标记 mergedInto A
- canonical 解析层已上线

那么：

- 新读请求看到的是 A
- 新写请求也会落到 A

这比“等全部历史改完再切换”更稳。

### 7.4 幂等设计

批处理必须支持重复运行，不产生脏数据。

做法：

- 更新 purchase 前先判断：
  - 如果当前已是 `packageId=A.id`，跳过
- 更新 entitlement 前先判断：
  - 如果当前已是 `packageId=A.id`，跳过
- 审计表记录每个 source package 的进度
- 中断后从各自 source package 的未完成游标继续

### 7.4.1 双层进度要求

批处理进度必须支持：

1. 包级进度
   - 每个 source package 当前在哪个阶段
   - 例如：`pending / marked / purchases_done / entitlements_done / completed / failed`

2. 记录级进度
   - 每个 source package 下 purchase 处理进度
   - 每个 source package 下 entitlement 处理进度
   - 至少要有：
     - `purchaseTotal`
     - `purchaseProcessed`
     - `purchaseRemaining`
     - `entitlementTotal`
     - `entitlementProcessed`
     - `entitlementRemaining`
     - 对应游标或最后处理记录标记

不能只有“整批 running/completed”这种单层状态，否则中断后无法清楚补跑和排错。

### 7.5 中断恢复

如果任务中途失败：

- 已成功 mark 的 B 仍已 canonical 到 A
- 系统读写不受阻
- 再次触发 `resume merge` 即可补跑剩余 purchase / entitlement

所以产品上是“不可撤销”，技术上是“可恢复执行”。

---

## 8. 接口设计

### 8.1 预检查接口

`POST /packages/merge-preview`

入参：

```json
{
  "sourcePackageIds": ["B1", "B2", "B3"],
  "targetPackageId": "A"
}
```

返回：

```json
{
  "sourcePackages": [],
  "targetPackage": {},
  "targetIsMerged": false,
  "sourceValidation": [
    {
      "sourcePackageId": "B1",
      "sourceIsMerged": false,
      "validation": {
        "ok": true,
        "checks": [
          { "field": "courseType", "ok": true },
          { "field": "lessons", "ok": true },
          { "field": "validityRule", "ok": true },
          { "field": "timeBand", "ok": true },
          { "field": "dailyTimeWindows", "ok": true },
          { "field": "coachScope", "ok": true },
          { "field": "campusScope", "ok": true },
          { "field": "maxStudents", "ok": true }
        ]
      },
      "impactSummary": {
        "purchaseCount": 4,
        "entitlementCount": 4,
        "totalLessons": 40,
        "usedLessons": 10,
        "remainingLessons": 30
      }
    }
  ],
  "validation": {
    "ok": true,
    "sourceCount": 3
  },
  "impactSummary": {
    "purchaseCount": 12,
    "entitlementCount": 12,
    "totalLessons": 120,
    "usedLessons": 38,
    "remainingLessons": 82
  },
  "canonicalInfo": {
    "targetCanonicalPackageId": "A"
  }
}
```

说明：

- 如果任一 B 已经 merged，直接返回该 source 的 canonical 信息和禁止重复 merge 的提示
- 如果 A 本身也是 merged 包，直接拦截
- preview 阶段就必须先执行 `sourcePackageIds[]` 标准化，并把：
  - 原始输入列表
  - canonical 后列表
  - 被剔除的等于 A 的项
  - 去重合并后的结果
  
  一并返回给前端展示

### 8.2 发起合并接口

`POST /packages/merge`

入参：

```json
{
  "sourcePackageIds": ["B1", "B2", "B3"],
  "targetPackageId": "A",
  "reason": "历史同规则课包统一归口",
  "confirmText": "A课包名称"
}
```

返回：

```json
{
  "auditId": "merge_xxx",
  "status": "running",
  "impactSummary": {
    "purchaseCount": 12,
    "entitlementCount": 12
  },
  "sourceCount": 3
}
```

后端动作：

1. admin 权限校验
2. confirmText 校验
3. 规则一致性校验
4. 创建 merge audit
5. 先写全部 B 的 merged 标记
6. 启动或同步推进批处理

补充要求：

- 执行前必须先对 `sourcePackageIds[]` 做 canonical 解析、去重、剔除目标 A
- 实际入库到 audit 的 source package 列表，只能是标准化后的结果

### 8.3 查询合并任务接口

`GET /package-merge-audit/:id`

返回：

- 当前状态
- 已处理数量
- 未处理数量
- 失败原因
- impact summary
- 包级进度
- 记录级进度

### 8.3.1 主包成员关系视图接口

建议新增：

`GET /packages/:id/merge-members`

用途：

- 查看主包 A 下面挂了哪些历史包
- 查看每个历史包各自贡献了多少购买、多少权益、多少剩余课时

返回建议：

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

### 8.4 继续补跑接口

`POST /package-merge-audit/:id/resume`

用途：

- 任务中断后继续补跑
- 仅 admin 可用

### 8.5 列表接口兼容

现有接口需要接 canonical 逻辑：

- `GET /packages`
- `GET /purchases`
- `GET /entitlements`
- `GET /page-data/purchases`
- `GET /page-data/finance`
- 任何按 package 展示或聚合的接口

要求：

- 默认隐藏 merged source 包
- 返回字段里可附加：
  - `displayPackageId`
  - `displayPackageName`
  - `originalPackageId`
  - `originalPackageName`

---

## 9. 页面交互设计

### 9.1 入口位置

页面：`售卖课包`

支持两种入口，底层都走多包版：

- 单包入口：某个 B 的操作区增加 `合并到主课包`
- 批量入口：课包列表支持勾选多个 B，再点击 `合并到主课包`

按钮展示条件：

- 当前用户是 admin
- 课包不是 merged source

### 9.2 第一步：选择 source package 与主课包

交互：

- 可从单个 B 入口进入，默认带一个 source package
- 也可先勾选多个 B 再进入
- 弹窗选择 A
- 下拉里只显示：
  - 未合并包
  - 不在 source package 列表里的包
  - 活跃可作为主包的课包

### 9.3 第二步：影响预检查弹窗

弹窗内容建议：

1. 源课包 B 信息
2. 目标课包 A 信息
3. 每个 source package 与 A 的履约规则一致性检查表
4. 每个 source package 的单独影响摘要
5. 汇总影响摘要
6. 风险提示

文案重点：

- 合并后普通列表只显示 A
- 历史购买和权益统计将统一归到 A
- 所有 source package 不会删除，但会转为历史兼容包
- 合并后所有履约规则一律只认主包 A，不会做 source package 规则并集
- 此操作前台不可撤销

### 9.3.1 标准化结果提示

预检查弹窗里建议增加一块“标准化结果”：

- 原始选中 source package 数
- canonical 解析后 source package 数
- 被自动去重的项
- 被剔除为目标 A 的项

让管理员知道系统实际会合并哪些包。

### 9.4 第三步：强确认

强确认要求：

- 需要输入 A 的课包名称
- 再点确认

按钮文案建议：

- 主按钮：`确认合并，不可撤销`
- 次按钮：`取消`

### 9.5 合并执行中提示

合并不是瞬时事务，页面要允许短暂处理中。

建议提示：

- `已开始合并，系统正在后台归并历史购买和权益记录`
- `现在开始，所有新读写都会自动归到主课包 A`
- `本次共合并 N 个等价课包到 A`

### 9.6 合并完成提示

提示内容：

- 已完成合并
- 已合并 source package 数
- 影响购买数
- 影响权益数
- 审计记录编号

### 9.7 历史详情展示

在购买详情、权益详情中增加只读字段：

- 当前归属课包：A
- 原始课包：B
- 合并时间
- 合并操作人

### 9.8 主包成员关系视图

管理端建议补一个“主包成员关系视图”，可放在课包详情或单独弹窗里。

目标：

- 让管理员看到 A 下面挂了哪些历史包
- 每个历史包贡献了多少购买、多少权益、多少剩余课时

建议展示列：

- 历史包名称
- mergedAt
- mergedBy
- 购买数
- 权益数
- 总课时
- 已消耗
- 剩余课时

---

## 10. 数据影响面

### 10.1 packages

- 所有 B 被标记 merged source
- A 继续作为 canonical 主包

### 10.2 purchases

- 所有历史 B1/B2/B3... 购买记录改挂 A
- 历史销售金额事实不变
- 原始来源字段补齐

### 10.3 entitlements

- 所有历史 B1/B2/B3... entitlement 改挂 A
- entitlement 结构不重建
- 已用/剩余课时不重算事实，只改归属

### 10.4 entitlement_ledger

- 历史消课事实不改
- 统计通过 entitlement 归属自然归到 A
- 可选补零变动 merge 审计行

### 10.5 报表与聚合

凡是按 packageId 聚合的地方都要检查：

- 财务页
- 购买页
- 权益页
- 排课推荐
- 导入预览
- 审计/修复脚本

---

## 11. 实施步骤

### Phase 1：底层能力

1. 给 `packages / purchases / entitlements` 补字段
2. 新增 `ft_package_merge_audit`
3. 实现 canonical package 解析函数
4. 先把所有读写入口接 canonical 解析层

先做这一步的原因：

- 即使 merge 功能按钮还没开放，系统也已经具备兼容能力

### Phase 2：预检查与合并任务

1. 实现 merge preview
2. 实现 merge create
3. 实现 merge resume
4. 实现 impact summary
5. 实现 `sourcePackageIds[]` 标准化
6. 实现多 source package 的包级 + 记录级双层进度
7. 实现多 source package 的批处理游标与幂等补跑

### Phase 3：页面交互

1. 课包页增加“合并到主课包”
2. 预检查弹窗
3. 强确认交互
4. 合并任务状态提示
5. 历史详情补原始来源字段
6. 主包成员关系视图

### Phase 4：兼容收口

1. 购买导入自动映射到 A
2. 手工补录自动映射到 A
3. 统计页过滤 merged source
4. 审计查看页或审计详情弹窗

### Phase 5：验证

验证点：

- merge 后所有 B 不在普通列表展示
- 历史 purchase 默认显示 A
- 历史 entitlement 默认显示 A
- 历史详情仍能看见各自原始 B
- 合并后履约规则只认 A，不取并集
- 导入 B 自动落 A
- 排课推荐与统计归口正确
- merge 中断后 resume 可继续跑完

---

## 12. 风险与控制

### 12.1 风险一：错误合并了履约规则不一致的包

控制：

- 预检查必须展示逐项校验
- 不通过则禁止提交

### 12.2 风险二：只改了一部分历史数据

控制：

- canonical 解析层先上线
- merge 按任务分阶段执行
- 支持 resume 补跑

### 12.3 风险三：某些旧脚本仍把 B 当活跃包

控制：

- 统一封装 canonical 解析
- 所有导入/修复脚本复用这一层

### 12.4 风险四：聚合统计口径不一致

控制：

- 所有按 packageId 的报表和筛选点逐个检查
- 统一以 canonical packageId 聚合

### 12.5 风险五：误以为“不可撤销”就不用保留恢复依据

控制：

- 产品不提供撤销按钮
- 技术必须保留完整 merge audit 快照
- 保留人工回放恢复可能性

---

## 13. 回滚/恢复方案

产品口径：

- 不提供前台一键撤销

技术口径：

- 必须可人工恢复

恢复依赖：

- `ft_package_merge_audit` 中的 before snapshot
- 各 source package 的受影响 purchase 列表
- 各 source package 的受影响 entitlement 列表
- 各 source package 原 package 记录快照

说明：

- 这里不是给用户“撤销”
- 是给技术人员“事故恢复依据”

---

## 14. 验收清单

### 功能验收

- 管理员可发起 `A <- [B1, B2, B3...]`
- A 不能本身也是 merged 包
- 非 admin 无法发起
- 价格不同但履约规则一致时允许合并
- 履约规则不一致时禁止合并
- sourcePackageIds[] 会先 canonical 解析、去重、剔除目标 A

### 数据验收

- 所有 B 被标记 merged source
- purchases 归口到 A
- entitlements 归口到 A
- original/source 字段保留
- merge audit 成功落表
- merge audit 能看到包级 + 记录级双层进度

### 兼容验收

- 后续读取任一 B 时自动解析到 A
- 后续写入任一 B 时自动改落 A
- CSV 导入传任一 B 时自动写到 A
- 手工补录传任一 B 时自动写到 A
- 合并后任何履约校验只按 A 当前规则执行

### 稳定性验收

- 批处理重复执行不产生重复污染
- 中断后 resume 能继续
- 多 source package 同任务执行可成功完成
- 普通列表不再看到任何 B
- 历史详情仍能追溯各自 B
- 主包成员关系视图能正确展示 A 下挂历史包及各自贡献摘要

---

## 15. 最终结论

本需求不能做成“前端展示替换”或“一次性数据改写后就结束”。

正确落地口径是：

- 后端真实归并
- 多个 B 可同时归并到一个 A
- 所有 B 保留历史兼容字段，不删除
- purchases / entitlements 真实改挂 A
- 独立 `package_merge_audit` 记录整个 merge 行为
- 所有读写统一接 `canonical package` 解析层
- merge 任务按可重复执行批处理设计，支持中断后补跑
- 导入、补录、修复、统计全部自动归 A

这套方案同时满足：

- 管理端只看到 A
- 历史统一归 A
- 保留原始来源
- 保留完整审计
- 不做前台撤销
- 出事故时仍有技术恢复依据
