# 课包合并开发前 P0 Gate 清单

> 路径：`_local/requirements/2026-05-09-course-package-merge-p0-gates.md`
>
> 本文档只列“开发前和上线前必须满足的 P0 硬门槛”。
> 任何一项未满足，课包合并功能都不应上线。

---

## 1. 目标

这份清单只解决一件事：

- 防止“课包合并”做成能点、能跑、但线上会埋雷的功能

判定原则：

- 不是“差不多能用”就算过
- 必须是“线上出事概率被压到可接受范围”才算过

---

## 2. P0 Gate 总表

上线前必须全部满足：

1. merge 并发互斥已落地
2. canonical 链路硬保护已落地
3. merge preview 阻断项已落地
4. merge 幂等与 resume 边界已落地
5. 合并后履约唯一口径已落到代码
6. canonical 已接入日常写入入口
7. 双层进度可查询、可恢复
8. 只读巡检已跑通并输出报告

---

## 3. Gate 1：merge 并发互斥

### 必须满足

- 同一时间不能有两个任务操作同一个 `targetPackageId`
- 同一时间不能有两个任务操作同一个 `sourcePackageId`
- 创建 merge 时必须先检查运行中任务
- resume 时也必须检查锁冲突

### 最低实现要求

- 应用层锁
- 审计任务状态锁
- 至少保证同一组 package 不会并发迁移

### 不通过风险

- purchase 重复迁移
- entitlement 重复迁移
- 审计状态错乱
- source package 被并发写坏

### 验收方式

- 人为同时发起两个包含同一 A 的 merge，请求之一被拦下
- 人为同时发起两个包含同一 B 的 merge，请求之一被拦下

---

## 4. Gate 2：canonical 链路硬保护

### 必须满足

- `resolveCanonicalPackageId` 有环检测
- 有最大深度限制，例如 `maxDepth=10`
- 发现异常链时直接报错
- 不能静默回退

### 最低实现要求

- 维护 `visited` 集合
- 超深链直接抛业务错误
- 环链直接抛业务错误

### 不通过风险

- 死循环
- 错误解析到非最终主包
- merge 任务无法稳定 resume

### 验收方式

- 构造 `B -> A` 正常通过
- 构造 `C -> B -> A` 正常通过
- 构造 `A -> B -> A` 必须报错
- 构造超过深度限制的链必须报错

---

## 5. Gate 3：merge preview 阻断项

### 必须满足

preview 不能只做“规则一致性展示”，必须提前拦下以下情况：

- `targetPackageId` 已有运行中 merge
- 任一 `sourcePackageId` 已有运行中 merge
- target 本身是 merged source
- source 里存在 canonical 后等于 target 的无效项，需明确剔除
- source 标准化后为空
- source / target 存在脏链
- purchase / entitlement 缺关键字段导致无法安全迁移

### 最低实现要求

- preview 返回：
  - 阻断项列表
  - 警告项列表
  - 标准化结果

### 不通过风险

- 管理员以为可合并，执行时才炸
- 线上出现半途失败

### 验收方式

- 构造运行中冲突任务，preview 必须直接拦截
- 构造 source 标准化为空，preview 必须直接拦截

---

## 6. Gate 4：merge 幂等与 resume 边界

### 必须满足

- purchase 已归到 A 时再次执行必须跳过
- entitlement 已归到 A 时再次执行必须跳过
- `completed` 任务不能重新 create
- resume 只能补未完成部分
- 失败后 resume 不得重复污染已完成记录

### 最低实现要求

- 包级状态
- 记录级游标
- 每次写入前先判断当前归属

### 不通过风险

- 重复写
- 审计计数失真
- 数据被多次覆盖

### 验收方式

- 同一任务执行中断后 resume，最终结果与一次跑完一致
- completed 任务重复 resume 不会再次迁移数据

---

## 7. Gate 5：合并后履约唯一口径

### 必须满足

- 合并后所有履约校验只认 A
- 明确禁止规则并集
- 不允许继续从 source package 读取教练/校区/时段/有效期规则

### 最低实现要求

- 排课校验用 canonical A
- 新增购买校验用 canonical A
- 推荐逻辑用 canonical A

### 不通过风险

- 同一个主包 A 下，不同历史来源包表现不一致
- 履约逻辑不可解释

### 验收方式

- source package 原规则与 A 完全一致时正常履约
- 人为构造读取 source package 规则的路径必须被测试拦住

---

## 8. Gate 6：canonical 接入日常写入入口

### 必须满足

以下写入入口都必须先 canonical：

- 新增购买
- 编辑购买切换 packageId
- CSV 导入购买
- 手工补录购买
- 修复脚本内 packageId 写入

### 最低实现要求

- 后端统一封装写入前解析
- 不允许前端自己决定是否改写成 A

### 不通过风险

- merge 后新数据继续落到 B
- 过一段时间数据再次脏化

### 验收方式

- 手工传 `packageId=B`，落库结果必须是 A
- 导入传 B，落库结果必须是 A

---

## 9. Gate 7：双层进度可查询、可恢复

### 必须满足

- 包级进度可查
- 记录级进度可查
- 包级失败能定位到具体 source package
- 记录级失败能定位到 purchase / entitlement 处理区间

### 最低实现要求

包级至少有：

- `pending`
- `marked`
- `migrating_purchases`
- `purchases_done`
- `migrating_entitlements`
- `entitlements_done`
- `completed`
- `failed`

记录级至少有：

- `purchaseTotal`
- `purchaseProcessed`
- `purchaseRemaining`
- `purchaseCursor`
- `entitlementTotal`
- `entitlementProcessed`
- `entitlementRemaining`
- `entitlementCursor`

### 不通过风险

- 任务失败后不知道从哪续
- 运营和开发都无法定位问题

### 验收方式

- 模拟中断后，审计接口能清楚显示卡在哪个包、哪一层记录

---

## 10. Gate 8：只读巡检脚本

### 必须满足

上线前必须有一份只读巡检输出，至少检查：

- canonical 链是否有环
- 是否有 merged source 仍被活跃 purchase 引用
- 是否有 merged source 仍被活跃 entitlement 引用
- 是否有 merge 审计状态异常
- 是否有明显遗漏的直接按原 packageId 聚合逻辑点

### 最低实现要求

- 只读
- 不改数据
- 输出清晰报告

### 不通过风险

- 带着脏链和脏引用上线
- 按钮一开就爆线上旧坑

### 验收方式

- 巡检脚本能在当前数据集上成功跑完
- 输出报告可供人工复核

---

## 11. 开发前通过标准

开发前至少要确认：

- P0 Gate 已被纳入实现范围
- 没有任何一项被默认为“后面再看”
- 测试文件和验收 case 已对应到每个 Gate

如果做不到，说明方案还没有进入安全开发态。

---

## 12. 上线前通过标准

上线前必须满足：

- 8 个 P0 Gate 全部通过
- 测试通过
- 巡检脚本报告通过人工复核
- 关键页面手工回归通过

只要有一项未过：

- 不上线

---

## 13. 结论

“课包合并”真正危险的不是代码量，而是：

- 一旦开口子，后续所有新旧数据都会被它影响

所以这个功能的上线标准必须高于普通页面功能。  
这 8 个 P0 Gate 不是加码，是最低安全线。
