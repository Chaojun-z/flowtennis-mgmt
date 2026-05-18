# FlowTennis 仓库级硬约束

> 适用对象：Codex、Claude Code、Gemini、任何接手本仓库的 AI 或开发
> 目标：让新线程进入仓库后，不依赖口头提醒，也能先吃到最重要的硬规则。
> 优先级：高于普通文档说明，低于用户当前最新明确指令。

---

## 1. 总原则

1. 你的首要目标不是“尽快把功能做出来”，而是**在不误伤线上数据、财务口径和其他端的前提下完成需求**。
2. 任何“看起来只是小改动”的需求，只要触达：
   - `purchases`
   - `entitlements`
   - `entitlement_ledger`
   - `courts`
   - `financial_ledger`
   - `membership_orders`
   - `membership_benefit_ledger`
   都必须默认按高风险需求处理。
3. 不允许依赖“我小心一点”来避免事故，必须优先依赖：
   - 已冻结文档
   - 明确边界
   - 回归验证
   - 基准比对

---

## 2. 生产与财务红线

1. **本地预览 / 开发环境默认不得直连生产真实数据。**
2. **课包、购买、权益类需求，默认不得顺手改财务口径。**
3. **任何影响财务页的改动，必须先对比财务基准数字。**
4. **生产环境不得默认开启 bootstrap / repair 类自动写入。**
5. **修线上数据与发功能必须分流，不允许混在同一交付里。**
6. **涉及财务相关表、财务页聚合、`api/index.js` 启动/repair 逻辑的改动，提交前必须运行 `npm run guard:finance`。**
7. **本地预览若需要切到生产变量，必须明确说明原因；默认只允许 `dev/staging` 固定样本或脱敏快照。**
8. **`ALLOW_PRODUCTION_BOOTSTRAP_WRITES=true` 只允许用于已批准的运维修复，不允许作为日常开发或预览默认配置。**

---

## 2.1 修数脚本与功能开发分流

以下脚本前缀只允许用于独立运维修复任务：

1. `scripts/repair-*`
2. `scripts/cleanup-*`
3. `scripts/finalize-*`
4. `scripts/archive-*`

硬规则：

1. 功能开发需求不得顺手修改这些脚本来“顺便修数据”。
2. 如需执行修数，默认先做 dry-run 或审计输出，再显式进入写模式。
3. 功能 PR / 需求交付中，如果同时包含功能代码和修数脚本，默认视为越界，需要拆分。

---

## 3. 新线程开工前必须先看

### 如果任务涉及整体架构、财务、环境、主干、发布

必须先看：

1. [全面技术架构与代码诊断报告](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-10-全面技术架构与代码诊断报告.md)
2. [生产数据变更入口清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/生产数据变更入口清单.md)
3. [核心表关系图](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/核心表关系图.md)
4. [日常开发与发布治理方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/日常开发与发布治理方案.md)
5. [主干清场与分支恢复方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/主干清场与分支恢复方案.md)
6. [dev-staging-prod环境建设方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/dev-staging-prod环境建设方案.md)
7. [财务基准数字确认表](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务基准数字确认表.md)
8. [财务回归与CI门禁方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务回归与CI门禁方案.md)

### 如果任务涉及高敏感数据页性能治理

必须先看：

- `docs/performance-governance/` 目录下整套文档

### 如果任务涉及后台前端标准页改造

必须先看：

- `docs/superpowers/specs/` 下标准页主线文档

---

## 4. 任务边界硬规则

1. 如果是课包 / 购买 / 权益需求：
   - 可以改 `packages / purchases / entitlements / 对应UI`
   - 不得默认改财务聚合口径
   - 若必须改财务，必须明确说明“这是独立财务任务”

2. 如果是性能治理任务：
   - 不允许回到“前端拿大包现场重算”的路线
   - 不允许把新接口做成另一种原始大包接口

3. 如果是标准页改造：
   - 不允许绕过冻结决策
   - 不允许顺手全局改公共壳样式

4. 如果是线上修复：
   - 默认先 dry-run
   - 再确认影响范围
   - 最后才允许 `--write`

---

## 5. 合并与交付前最低要求

1. 说明本次改动影响哪几个端：
   - 管理后台 Web
   - 教练端 Web
   - 教练端 PWA
   - 教练端微信小程序
   - 约球子系统

2. 说明是否触达高危表。

3. 若触达财务相关口径，必须对比财务基准数字：
   - 总收入
   - 课包收入
   - 订场收入
   - 会员储值
   - 成交笔数
   - 命令：`npm run guard:finance`

4. 如果本次不是财务需求，也必须说明“非目标模块是否出现异常差异”。

5. 不得在未通过可验收门槛前交付给用户验收。

---

## 6. 可验收门槛

交付给用户前，至少满足：

1. 能登录
2. 目标页面能正常出数据
3. 非目标高频页面不空白
4. 没有关键 `401 / 404 / 500`
5. 目标功能链路能完整点通

---

## 7. 禁止事项

1. 禁止把本地预览默认当成生产环境验证工具。
2. 禁止在功能任务里顺手带修数脚本。
3. 禁止在没有对账的情况下改财务页来源链。
4. 禁止绕过已冻结治理文档，自行发明另一套路线。
5. 禁止在未明确说明的情况下，修改：
   - `api/index.js` 中 bootstrap / repair 逻辑
   - 财务聚合口径
   - 约球同步财务链
6. 禁止让 `.github/workflows/ci-guard.yml` 退回成占位步骤、TODO 步骤或假通过步骤。

## 8. 正式工作区执行规则

1. 当前目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge` 是唯一正式验收目录。
2. 当前目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge` 也是唯一正式上传目录。
3. 日常开发不得直接在旧主目录 `flowtennis-mgmt-main` 继续进行。
4. 以后新开发目录只允许是：
   - `flowtennis-mgmt-main/.worktrees/<任务名>`
   - 起点分支只允许 `origin/thread26-staging-latest` 或恢复后的正式 `main`
5. 旧主目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main` 现在只允许：
   - 历史取证
   - 差异比对
6. 老板后续只做 3 步：
   - 停用旧主目录
   - 验收和上传统一进入 `thread114-staging-merge`
   - 新需求统一新建 worktree
