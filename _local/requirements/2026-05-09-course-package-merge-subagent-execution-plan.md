# 课包合并 Subagent 执行计划

> 路径：`_local/requirements/2026-05-09-course-package-merge-subagent-execution-plan.md`
>
> 本文档定义“课包合并”功能的实际执行方式：阶段划分、subagent 拆分、分支策略、合并上线策略、验收门槛。
> 目标不是“尽快写完”，而是“在多线程并行开发环境里，尽量降低互相污染和上线失控风险”。

---

## 1. 执行总原则

这次开发必须遵守下面 4 条：

1. 先在新分支开发，不直接在当前主线改
2. 开发阶段允许完整改动，但上线阶段只把最小必要改动摘到最新 `main`
3. 不能假设其他线程不会改同一批文件
4. 如果出现和其他线程重叠改动，必须优先保证“最终可安全摘取上线”，而不是强行整包带走

---

## 2. 分支与上线策略

### 2.1 开发分支策略

建议：

- 基于当下最新可用基线，创建一个独立开发分支
- 分支命名建议：`feat/package-merge`

目的：

- 隔离“课包合并”大改动
- 避免在主线和其他线程交叉写时互相污染

### 2.2 上线策略

上线时不建议整分支直接合并回 `main`。

必须采用：

- 先同步最新 `main`
- 再从开发分支中只摘取“课包合并最终需要的最小改动”
- 在最新 `main` 上重新验证

推荐动作原则：

- 不是“把整个分支带上”
- 而是“把最小必要提交或最小必要文件变更摘过去”

### 2.3 为什么必须这样

因为这次需求会碰：

- `api/index.js`
- `public/assets/scripts/pages/packages.js`
- 购买/权益相关逻辑
- page-data 聚合逻辑

这些位置都很容易和别的线程撞。  
如果最后整分支回灌，很容易把别人的新改动冲掉，或者把你这边基于旧状态写的内容带坏线上。

---

## 3. 推荐阶段划分

不建议一阶段做完。  
建议拆成 **4 个阶段**。

### 阶段 1：后端底座

目标：

- 先把最危险、最基础的底层规则立住

范围：

- packages / purchases / entitlements 字段补齐
- `ft_package_merge_audit`
- canonical package 解析层
- `sourcePackageIds[]` 标准化
- 环检测
- 深度限制
- 并发互斥

完成标准：

- 不开 UI，也已经能安全识别 `B -> A`
- P0 Gate 里最底层的安全约束已落地

### 阶段 2：merge 任务后端

目标：

- 让后端完整支持多包 merge 任务

范围：

- preview
- create
- query audit
- resume
- merge members
- impact summary
- 包级 + 记录级双层进度

完成标准：

- 后端接口已经能独立验证全链路
- 即使没有前端，也能模拟 merge 流程

### 阶段 3：写入口兼容与收口

目标：

- 堵住 merge 后继续写 B 的所有口子

范围：

- `/purchases` 新增 canonical 化
- `/purchases` 编辑 canonical 化
- CSV 导入 canonical 化
- 手工补录 canonical 化
- 排课/推荐/统计归口到 A
- 只读巡检脚本

完成标准：

- 新流量不会继续把数据写到 source package
- 历史与新增口径统一

### 阶段 4：管理端 UI

目标：

- 管理员可以安全操作 merge

范围：

- 课包页多选 source package
- merge preview 弹窗
- 强确认
- merge 状态展示
- 主包成员关系视图
- 历史详情来源展示

完成标准：

- UI 接口闭环完整
- 管理员能看懂、能操作、能追溯

---

## 4. Subagent 拆分建议

这次适合开 subagent，但不要拆太碎。  
建议 **3 个角色** 就够。

### Subagent A：后端主负责人

职责：

- 阶段 1
- 阶段 2
- 阶段 3 里的后端部分

负责范围：

- `api/index.js`
- merge 审计表
- canonical 解析
- preview/create/resume/query/members
- purchases 写入口兼容
- 聚合口径收口

为什么必须一个人主负责：

- 这些逻辑强耦合
- 如果拆给多个 agent，很容易出现：
  - 标准化逻辑写两套
  - audit 结构不统一
  - resume 和 create 不一致

### Subagent B：前端管理端负责人

职责：

- 阶段 4
- 配合阶段 2/3 接口联调

负责范围：

- `public/assets/scripts/pages/packages.js`
- 必要的列表/弹窗交互
- 成员关系视图

注意：

- 必须等后端接口字段基本稳定后再全面接
- 不要自己发明接口字段

### Subagent C：测试与巡检负责人

职责：

- 测试覆盖
- 巡检脚本
- 回归核对

负责范围：

- `tests/package-merge-rules.test.js`
- `tests/package-merge-api.test.js`
- `tests/package-merge-view.test.js`
- 只读巡检脚本

注意：

- 不负责改业务逻辑
- 只负责把安全边界测实

---

## 5. 阶段与 Subagent 对应关系

### 阶段 1

- 主负责：Subagent A
- 配合：Subagent C

说明：

- C 可以并行开始写规则测试
- A 负责把底层能力做出来

### 阶段 2

- 主负责：Subagent A
- 配合：Subagent C

说明：

- 先把 merge 接口和任务能力闭环
- C 跟进 API 测试

### 阶段 3

- 主负责：Subagent A
- 配合：Subagent C

说明：

- 这是最容易漏的阶段，不能跳
- 没做完这步，merge 功能会“表面可用，后续继续写脏”

### 阶段 4

- 主负责：Subagent B
- 配合：Subagent A、Subagent C

说明：

- A 负责解释接口真实口径
- C 负责视图测试和上线前回归

---

## 6. 推荐执行顺序

建议这样推进：

1. Subagent A 先做阶段 1
2. 阶段 1 稳定后，A 继续做阶段 2
3. 阶段 2 基本成型后，A 做阶段 3，同时 C 补 API 与规则测试
4. 阶段 2 接口稳定后，B 再开始阶段 4
5. 全部完成后，C 跑巡检和回归

不建议的顺序：

- UI 先做
- preview 先做但 canonical 层没落地
- 把多包 merge 做成前端循环调单包接口

---

## 7. 开发期提交策略

为了后续“只摘最小改动到最新 main”，开发分支上的提交也要控制。

建议提交分组：

1. `feat: add canonical package resolution and merge audit base`
2. `feat: add multi-source package merge task APIs`
3. `feat: route purchases and imports through canonical package`
4. `feat: add package merge admin UI and members view`
5. `test: add package merge coverage and readonly audit checks`

目的：

- 后续如果需要只摘 2、3、4 中的部分提交，更容易操作
- 不要把无关修复和 merge 功能混在一个提交里

---

## 8. 最小上线摘取策略

当功能在开发分支完成后，不要直接整分支并回 `main`。

正确做法：

1. 拉取最新 `main`
2. 检查 `api/index.js`、`packages.js`、测试文件是否已有其他线程改动
3. 只摘课包合并真正需要的提交
4. 在最新 `main` 上重跑测试
5. 人工回归 merge 主链

如果发现开发分支里混进了其他实验性改动：

- 不要硬带上
- 必须拆掉，只保留本功能最小集

---

## 9. 文件冲突高风险区

上线前要重点注意这些文件最容易和其他线程撞：

- `api/index.js`
- `public/assets/scripts/pages/packages.js`
- `public/assets/scripts/pages/courts.js`
- `tests/entitlement-rules.test.js`

策略：

- 这些文件的改动要尽量局部
- 不要顺手重构大段无关代码
- 否则最后摘取时冲突会非常重

---

## 10. 每阶段完成标准

### 阶段 1 通过标准

- canonical 层可用
- 环检测可用
- 深度限制可用
- source 标准化可用
- 互斥方案已实现

### 阶段 2 通过标准

- preview/create/resume/query/members 接口可跑通
- merge audit 可写
- 双层进度可查

### 阶段 3 通过标准

- 新增购买传 B 自动落 A
- 编辑购买传 B 自动落 A
- 导入传 B 自动落 A
- 统计/推荐归 A
- 巡检脚本可用

### 阶段 4 通过标准

- 多选 merge UI 可用
- 强确认可用
- 成员关系视图可用
- 来源追溯展示可用

---

## 11. 上线前最终 Gate

上线前必须同时满足：

1. `P0 Gate` 文档中的 8 条全部通过
2. 阶段 1-4 全部完成
3. 巡检脚本输出通过人工复核
4. 在最新 `main` 上重跑验证通过
5. 最终上线改动是“最小摘取集”，不是整分支回灌

---

## 12. 总工结论

这个需求不适合一阶段做完，也不适合 UI 先行。

最稳妥的执行方式是：

- 新分支开发
- 4 个阶段推进
- 3 个 subagent 分工
- 最后只把最小必要改动摘到最新 `main`

这样做的目的只有一个：

- 在多人并行开发环境里，把“功能做出来”和“最后能安全上线”同时保证住
