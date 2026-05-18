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

`scripts/` 后续按下面 6 类管理：

1. `scripts/dev/`
2. `scripts/staging/`
3. `scripts/audit/`
4. `scripts/repair/`
5. `scripts/import/`
6. `scripts/inspect/`

以下脚本前缀或类别只允许用于独立运维修复任务，不得混进普通功能开发：

1. `scripts/repair-*`
2. `scripts/cleanup-*`
3. `scripts/finalize-*`
4. `scripts/archive-*`
5. 导入类 `scripts/import/*`

以下脚本默认不应跟 `feature/*` 功能改动一起交付：

1. 全部 `repair / cleanup / finalize / archive`
2. 全部历史导入脚本
3. 任何默认读取真实环境变量并能写表的脚本

硬规则：

1. 功能开发需求不得顺手修改这些脚本来“顺便修数据”。
2. 如需执行修数，默认先做 dry-run 或审计输出，再显式进入写模式。
3. 功能 PR / 需求交付中，如果同时包含功能代码和修数脚本，默认视为越界，需要拆分。
4. `feature/*` 只承载正常业务功能开发；`ops/*` 承载修数、导入、批量补录、历史数据收口。
5. `audit/*` 和 `inspect/*` 如果只是只读排查，可以独立存在；一旦具备写入动作，必须转入 `ops/*` 主线管理。

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
9. [2026-05-12-主干正式收官执行清单与风险清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-12-主干正式收官执行清单与风险清单.md)
10. [2026-05-14-真实载体与正式上传发布基线固化](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-14-真实载体与正式上传发布基线固化.md)

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

## 4.1 主干正式收官硬规则

适用于 2026-05-12 第二阶段主干恢复窗口：

1. 在新 `main` 正式恢复前，唯一可信主干收官锚点是 `origin/thread26-staging-latest`。
2. 在新 `main` 正式恢复前，所有新 `feature/*`、`hotfix/*`、`ops/*` 默认从 `origin/thread26-staging-latest` 切出，不得从旧 `main` 或 `codex/match-real-launch` 切出。
3. `codex/match-real-launch`、`legacy/local-main`、`protect/main-uncommitted-20260428`、`verify/main-baseline`、`staging-latest-candidate`、`codex/clean-main`、`codex/match-main-merge` 默认只允许只读比对，不允许整分支直接回主干。
4. 主干恢复时，只允许基于 `origin/thread26-staging-latest` 做审阅后收口；旧 `main` 只做差异核查，不得反向重新当母本。
5. 线程若涉及主干、分支来源、验收环境，必须同时遵守 [2026-05-12-主干正式收官执行清单与风险清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-12-主干正式收官执行清单与风险清单.md)。

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

## 5.1 5端与载体边界硬规则

后续所有线程默认必须遵守：

1. 5 个端固定是：
   - 管理端 Web
   - 教练端网页
   - 教练端 PWA
   - 教练端小程序
   - 约球小程序
2. 管理端 Web、教练端网页、教练端 PWA 共用真实代码目录：
   - `flowtennis-mgmt-main/public`
3. 这 3 个 Web/PWA 端的真实入口都是：
   - `flowtennis-mgmt-main/public/index.html`
4. 管理员登录后默认页固定是：
   - `students`
5. 教练登录后默认页固定是：
   - `workbench`
6. 教练端小程序真实载体固定是：
   - `flowtennis-mgmt-main/wechat-miniprogram/miniprogram`
   - AppID：`wx7acb7603ee803923`
   - 教练入口：`pages/index/index`
7. 约球小程序真实载体固定是：
   - `flowtennis-mini-match/miniprogram`
   - AppID：`wxec5ca996f273502b`
   - 默认首页：`pages/matches/index`
8. `flowtennis-mini-match` 当前定性为正式约球验收载体。
9. `flowtennis-mgmt-main/wechat-miniprogram` 当前是教练端小程序壳，不是当前约球验收对象。
10. 教练端入口不能作为约球默认首页。
11. 新线程不得自行猜测小程序真实载体、默认首页、AppID。
12. 任何涉及端与载体判断的任务，必须先看：
    - [2026-05-13-5端与载体边界固化](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-13-5端与载体边界固化.md)
13. 以下目录默认只允许历史取证，禁止继续当正式载体开发或发布：
    - `flowtennis-mgmt-main/_local/legacy-2026-04-10/`
    - `flowtennis-mgmt-main/.worktrees/`
    - `flowtennis-mgmt-main/.worktrees/codex-matchmaking-full-linkage/`
    - `flowtennis-mgmt-main/_local/requirements/`
14. `flowtennis-mgmt-main/public/index.backup-before-split.html` 是历史备份文件，不是任何真实入口。

## 5.2 正式上传目录与发布基线硬规则

后续所有涉及上传、体验版、真机、正式站、发版的线程默认必须遵守：

1. `flowtennis-mgmt-main` 家族（管理端 Web / 教练端网页 / 教练端 PWA / 教练端小程序）的正式发布基线，在新 `main` 恢复前只认：
   - `origin/thread26-staging-latest`
   - 当前确认提交：`8212c860b7eab3fa5ddfd8ce8ef6193bd1e6e5f0`
2. `flowtennis-mini-match` 是约球小程序唯一正式发布基线，当前可追溯提交只认：
   - `57a236955a930fa57231916f6a790658aa250492`
3. Web 正式发布工程目录只认：
   - `flowtennis-mgmt-main`
4. Web 前端真实载体目录只认：
   - `flowtennis-mgmt-main/public`
5. 教练端小程序正式上传工程目录只认：
   - `flowtennis-mgmt-main/wechat-miniprogram`
6. 约球小程序正式上传工程目录只认：
   - `flowtennis-mini-match`
7. 当前 `flowtennis-mgmt-main` 家族唯一允许用于上传前干净核对的工作区副本是：
   - `flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
7.1 当前 `flowtennis-mgmt-main` 家族唯一正式干净母本目录固定是：
   - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
7.2 该目录当前必须视为：
   - 正式验收目录
   - 正式上传核对目录
   - 后续干净工作区体系的母本
8. `flowtennis-mini-match-release` 正式定性为约球小程序唯一正式上传副本。
9. 约球小程序正式上传只允许从 `flowtennis-mini-match-release` 进行；`flowtennis-mini-match` 本体只作为正式开发目录与真实业务基线目录。
10. `flowtennis-mini-match-release` 必须始终保持干净；只要存在未提交改动，就禁止上传。
11. `flowtennis-mgmt-main` 家族正式上传前只允许从 `thread114-staging-merge` 做干净核对；当前仍停在 `codex/match-real-launch` 的主工作区禁止继续承载开发、联调、验收、上传、发版。
12. 只要目录存在未提交改动，就禁止把它当正式上传目录。
13. 真机、体验版、本地上传目录、正式站必须能回指到同一提交号；如果对不上，视为未完成正式上传。
14. 以下目录默认禁止继续当正式上传目录：
   - `flowtennis-mgmt-main/.worktrees/` 下除 `thread114-staging-merge` 外的所有目录
   - `flowtennis-mgmt-main/_local/legacy-2026-04-10/`
   - `flowtennis-mgmt-main/_local/requirements/`
   - 根目录 `.worktrees/`
   - 当前仍停在 `codex/match-real-launch` 的 `flowtennis-mgmt-main` 主工作区
15. 任何线程如果涉及“上传哪个目录、哪个 AppID、哪个首页、哪个基线提交”，不得自行猜测，必须先看：
   - [2026-05-14-真实载体与正式上传发布基线固化](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-14-真实载体与正式上传发布基线固化.md)
16. 以后 `flowtennis-mgmt-main` 家族的开发工作区只允许：
   - 从 `origin/thread26-staging-latest`（或新 `main` 恢复后的正式 `main`）切出的新工作区
17. 以后 `flowtennis-mgmt-main` 家族的上传核对工作区只允许：
   - `flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
18. `codex/match-real-launch` 只允许历史取证和只读比对，禁止继续承载开发、联调、验收、上传、发版。
19. 当前主工作区如果仍停在 `codex/match-real-launch`，后续必须视为只读旧线，不得继续在该工作区提交第二阶段后的任何有效开发结果。
20. 当前主目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main` 已正式退役为旧线只读取证区：
   - 禁止开发
   - 禁止联调
   - 禁止验收
   - 禁止上传
   - 只允许历史取证和差异核查
21. 老板后续切换到正式 worktree 流程时，只允许执行以下 3 步：
   - 停用旧主目录 `flowtennis-mgmt-main`
   - 验收和上传统一切到 `flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
   - 新需求一律从 `origin/thread26-staging-latest` 或恢复后的正式 `main` 新建 worktree
21.1 以后目录角色固定为：
   - 日常开发目录：`flowtennis-mgmt-main/.worktrees/<任务名>`
   - 验收目录：`flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
   - 上传目录：`flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
   - 旧主目录 `flowtennis-mgmt-main`：只读取证，禁止开发、联调、验收、上传
22. 以后新线程创建 `flowtennis-mgmt-main` 家族 worktree 的唯一标准步骤是：
   - 起点只允许是 `origin/thread26-staging-latest`，或新 `main` 恢复后的正式 `main`
   - 目录只允许创建在 `flowtennis-mgmt-main/.worktrees/<任务名>`
   - 开发只在新 worktree 内进行
   - 验收和上传仍只认 `thread114-staging-merge`

---

## 6. 可验收门槛

交付给用户前，至少满足：

1. 能登录
2. 目标页面能正常出数据
3. 非目标高频页面不空白
4. 没有关键 `401 / 404 / 500`
5. 目标功能链路能完整点通

## 6.1 完整业务链路验收硬规则

1. 禁止把“代码改到位了”当成“验收通过”。
2. 禁止把“单点测试通过”当成“完整业务链路通过”。
3. 只要任务触达真实业务操作，默认必须按“完整业务动作闭环”验收，不得只看接口返回成功、提示保存成功或局部 UI 已更新。
4. 表单类需求默认必须验证 4 步：
   - 能填
   - 能保存
   - 刷新后能看见
   - 再次进入能回填
5. 权限类需求默认必须验证 3 步：
   - 权限配置
   - 权限生效
   - 权限撤销后失效
6. 线程汇报“测试通过”时，必须同时写清：
   - 测了哪些业务动作
   - 没测哪些
   - 属于代码测试通过、接口测试通过，还是页面实操通过
7. 如果只跑了脚本、单测、接口测试，但没有完成要求中的完整业务链路实操验证，禁止汇报：
   - 已完成
   - 已通过
   - 可验收
8. 如因环境、权限、账号、数据样本限制，导致完整业务链路无法验完，必须明确标注阻塞项和未验证项，不得用模糊表述冒充通过。
9. 后续执行线程默认同时遵守：
   - [2026-05-13-完整业务链路验收规则](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-13-完整业务链路验收规则.md)
   - [2026-05-13-执行线程通用补充模板-完整链路验收](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-13-执行线程通用补充模板-完整链路验收.md)
   - [2026-05-13-统一验收回执模板](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-13-统一验收回执模板.md)

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
