# 课包合并实施方案

> 路径：`_local/requirements/2026-05-09-course-package-merge-implementation-plan.md`
>
> 本文档把“课包合并”拆成可执行的实施任务。
> 范围按多包版：`一个主包 A，同时合并 3-5 个等价课包 B1/B2/B3...`
> 本文档不直接写代码，但要明确改哪些文件、先做什么、怎么验收。

---

## 一、目标

本轮上线后，系统要具备这 6 个结果：

1. 管理员可以把多个等价课包合并到一个主包 A
2. 合并后普通列表只显示 A
3. 历史购买、权益、统计统一归 A
4. 后续任何读写遇到 B 都会先 canonical 解析到 A
5. merge 按可重复执行批处理运行，可中断后 resume
6. 管理端可查看主包成员关系和 merge 审计

---

## 二、范围边界

### 本轮要做

- canonical package 解析层
- packages/purchases/entitlements 字段补齐
- 独立 `ft_package_merge_audit`
- merge preview/create/resume/query/members 接口
- 管理端“多包并一包”交互
- 导入/补录自动映射到 A
- 主包成员关系视图
- 双层进度审计

### 本轮不做

- merge 撤销按钮
- 自动识别哪些包应该合并
- 面向学员端的 merge 展示
- 大范围重构 `api/index.js`

---

## 三、涉及文件

### 后端

- 修改：`api/index.js`
  - 新增 merge 审计表常量
  - 新增 canonical package 解析函数
  - 新增 sourcePackageIds 标准化函数
  - 新增 merge 规则校验函数
  - 新增 impact summary 函数
  - 新增 merge 任务函数
  - 新增 merge 相关 HTTP 接口
  - 修改 purchases / entitlements / page-data 相关读取与写入兼容逻辑

### 前端

- 修改：`public/assets/scripts/pages/packages.js`
  - 新增多选 source package
  - 新增“合并到主课包”入口
  - 新增 merge preview 弹窗
  - 新增强确认交互
  - 新增主包成员关系视图

- 修改：`public/assets/scripts/pages/entitlements.js`
  - 历史详情补原始来源字段时使用

- 修改：`public/assets/scripts/pages/courts.js`
  - 购买导入和手工购买时，显示 canonical 映射结果

### 测试

- 新增：`tests/package-merge-rules.test.js`
  - canonical 解析
  - sourcePackageIds 标准化
  - 多包规则校验
  - 合并后履约规则只认 A

- 新增：`tests/package-merge-api.test.js`
  - merge preview
  - merge create
  - merge resume
  - merge members

- 新增：`tests/package-merge-view.test.js`
  - 管理端入口
  - 预检查弹窗字段
  - 成员关系视图字段

- 修改：`tests/entitlement-rules.test.js`
  - 增加 canonical package 写入兼容测试

---

## 四、实施顺序

顺序不能乱。  
必须先立 canonical 层，再做 merge 任务，再开 UI。

### Phase 1：数据与解析层

目标：

- 系统先具备“即使还没开放 merge 按钮，也能识别 merged source -> canonical A”的能力

任务：

1. 补 packages 字段
2. 补 purchases 字段
3. 补 entitlements 字段
4. 新增 `ft_package_merge_audit`
5. 实现 `resolveCanonicalPackageId`
6. 实现 `normalizeMergeSourcePackages`

验收：

- 给一个已 merged source package，读取时能解析到 A
- 标准化函数能去重、剔除目标 A、自带映射结果

### Phase 2：写入兼容

目标：

- 后续所有写入先走 canonical 层

任务：

1. 改 `/purchases POST`
2. 改 `/purchases PUT`
3. 改导入购买逻辑
4. 改任何使用 packageId 做履约校验的后端逻辑

验收：

- 传入 B 购买，实际写入 A
- 返回结果能看到 `inputPackageId -> canonicalPackageId`

### Phase 3：merge 任务后端

目标：

- 后端可预检查、创建、查询、补跑 merge 任务

任务：

1. 实现 merge rule 校验
2. 实现 impact summary
3. 实现 preview 接口
4. 实现 create 接口
5. 实现包级 + 记录级双层进度
6. 实现 resume 接口
7. 实现 merge audit 查询接口
8. 实现 members 关系接口

验收：

- preview 能返回标准化结果 + 校验 + 摘要
- create 后先 mark source，再跑迁移
- 中断后能 resume

### Phase 4：管理端 UI

目标：

- 管理员可以在页面上安全完成多包合并

任务：

1. 课包列表支持勾选多个 source package
2. 增加“合并到主课包”按钮
3. 预检查弹窗展示：
   - 标准化结果
   - 每包校验
   - 每包摘要
   - 总摘要
4. 强确认输入 A 名称
5. merge 任务状态提示
6. 主包成员关系视图

验收：

- 单包入口能带一个 B 进入
- 多选入口能带多个 B 进入
- preview 信息完整

### Phase 5：收尾兼容与验证

目标：

- 报表、统计、详情都收口到一致口径

任务：

1. 课包列表默认隐藏 merged source
2. 购买列表默认显示 A
3. 权益列表默认显示 A
4. 历史详情补原始来源字段
5. 审计页可查 merge 任务

验收：

- 普通管理员看不到 B
- 历史详情能追到 B
- 统计只归 A

---

## 五、具体任务拆分

### Task 1：canonical package 解析基础

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-rules.test.js`

内容：

1. 新增 package canonical 解析函数
2. 支持链式解析
3. 加循环保护
4. 标准化 `sourcePackageIds[]`

验收：

- `B1 -> A`
- `C -> B1 -> A`
- `A -> A`
- `["B1","B1","A"] -> ["B1"]`

### Task 2：履约规则校验

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-rules.test.js`

内容：

1. 以 A 为唯一标准做对比
2. 不把价格列入硬校验
3. 明确禁止并集规则

验收：

- 价格不同但规则一致可通过
- 时段不同直接失败
- 校区不同直接失败

### Task 3：merge 审计表与任务状态

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-api.test.js`

内容：

1. 增加 `ft_package_merge_audit`
2. 定义总状态
3. 定义包级进度
4. 定义记录级进度

验收：

- 创建任务后能看到 `pending/running`
- 每个 source package 有自己的状态
- purchase / entitlement 有独立 processed 计数

### Task 4：merge preview 接口

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-api.test.js`

内容：

1. 返回标准化结果
2. 返回规则校验
3. 返回按 source package 拆分的影响摘要
4. 返回总摘要

验收：

- 被剔除的等于 A 的项能返回
- 去重结果能返回
- 异常项能提示

### Task 5：merge create 与批处理

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-api.test.js`

内容：

1. 创建 audit
2. 先 mark source
3. 分 source package 迁移 purchases
4. 分 source package 迁移 entitlements
5. 完成后写 completed

验收：

- mark source 后，新的读写已自动归 A
- 历史迁移没完成前系统仍可继续工作

### Task 6：resume 补跑

**文件：**

- 修改：`api/index.js`
- 测试：`tests/package-merge-api.test.js`

内容：

1. 从包级未完成项继续
2. 从记录级游标继续
3. 重复执行不二次污染

验收：

- 中断后 resume 成功继续
- completed 任务不会被重复污染

### Task 7：写入兼容 purchases / 导入

**文件：**

- 修改：`api/index.js`
- 修改：`public/assets/scripts/pages/courts.js`
- 测试：`tests/entitlement-rules.test.js`

内容：

1. 新增购买先 canonical 化
2. 编辑购买切换包先 canonical 化
3. CSV 导入展示 canonical 映射结果

验收：

- 导入 B 自动落 A
- 手工新增 B 自动落 A

### Task 8：管理端 merge UI

**文件：**

- 修改：`public/assets/scripts/pages/packages.js`
- 测试：`tests/package-merge-view.test.js`

内容：

1. 列表勾选多个 source package
2. 单包入口 / 多包入口共用弹窗
3. 预检查弹窗
4. 强确认
5. 合并状态提示

验收：

- 管理员能选 3-5 个包发起 preview
- 弹窗里能看每包摘要和总摘要

### Task 9：主包成员关系视图

**文件：**

- 修改：`public/assets/scripts/pages/packages.js`
- 修改：`api/index.js`
- 测试：`tests/package-merge-view.test.js`

内容：

1. 主包详情增加“历史成员关系”
2. 调用 `/packages/:id/merge-members`
3. 展示每个历史包贡献摘要

验收：

- 能看到 A 下挂了哪些 B
- 能看到每个 B 的购买数、权益数、剩余课时

---

## 六、测试策略

### 规则测试

文件：

- `tests/package-merge-rules.test.js`

覆盖：

- canonical 解析
- sourcePackageIds 标准化
- 规则一致性判断
- 合并后只认 A 规则

### API 测试

文件：

- `tests/package-merge-api.test.js`

覆盖：

- preview
- create
- resume
- query audit
- merge members

### 视图测试

文件：

- `tests/package-merge-view.test.js`

覆盖：

- 多选入口
- 弹窗关键字段
- 主包成员关系视图

### 回归测试

文件：

- `tests/entitlement-rules.test.js`

覆盖：

- 购买写入 canonical 兼容
- entitlement 归属变化后仍能正常履约

---

## 七、上线前检查

### 数据检查

- 是否已有历史 merged package 数据需要兼容
- 是否有脚本直接写 `packageId`
- 是否有报表直接按 `packageId` 聚合

### 功能检查

- merge preview 是否能处理重复 source package
- sourcePackageIds 是否会自动剔除 A
- A 是否会被错误选成 merged source

### 稳定性检查

- 中断后的 audit 是否可读
- resume 是否只补未完成部分
- 双层进度是否能正确刷新

---

## 八、验收清单

### P0

- 管理员可发起多包并一包 merge
- 合并后只认 A 的履约规则
- 后续任何读写传 B 都会先解析到 A
- merge 任务有包级 + 记录级双层进度
- 导入补录自动映射 A

### P1

- merge 审计可查询
- 主包成员关系视图可查看
- 历史详情可追溯原始来源

---

## 九、风险提醒

最容易做歪的地方有 4 个：

1. 只做一次性改历史数据，没把 canonical 层接到后续写入
2. 把多包 merge 偷偷实现成前端循环调用单包 merge
3. 批处理只做一个总状态，没有双层进度
4. 合并后把 source package 规则做并集

这 4 个都不能接受。

---

## 十、结论

正确实施顺序只有一条：

1. 先做 canonical 解析层
2. 再做写入兼容
3. 再做 merge 任务和审计
4. 最后开管理端 UI

如果先做按钮和接口，再补底层兼容，后面一定返工。
