# FlowTennis · 网球兄弟管理系统

校区管理、学员管理、排课管理、教练视角。

## 当前目录身份

- 你现在看到的目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main` 已退役。
- 这个目录现在只允许：
  - 历史取证
  - 差异比对
- 这个目录现在禁止：
  - 日常开发
  - 联调
  - 验收
  - 上传

## 以后固定目录

- 日常开发目录：
  - 从 `origin/thread26-staging-latest` 或恢复后的正式 `main` 新建到 `flowtennis-mgmt-main/.worktrees/<任务名>`
- 验收目录：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
- 上传目录：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
- 老板操作单：
  - [正式工作区切换-老板只做这3步.md](/Users/shaobaolu/Desktop/FlowTennis/正式工作区切换-老板只做这3步.md)

## 当前业务收敛规则

- 教学售卖主链路以 `售卖课包 -> 购买记录 -> 课包余额 -> 排课消课` 为准。
- `课程产品 / 班次管理 / 学习计划` 视为历史兼容模块，暂不作为新增功能依赖。
- 后续凡是教学售卖、排课履约相关需求，默认优先接在 `packages / purchases / entitlements / schedule` 上，不要再把新逻辑接回 `products / classes / plans`。
- 详细约束见：
  [教学售卖链路治理说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/教学售卖链路治理说明.md)

## 重要提醒

- `codex/match-real-launch` 已封存，禁止继续合入 `main`，禁止继续基于它开发。
- 这条旧分支只保留历史取证价值，不再作为上线来源。
- 当前如果某个 `flowtennis-mgmt-main` 工作区仍停在 `codex/match-real-launch`，该工作区一律不得继续用于开发、验收、上传。
- 当前主目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main` 已正式定性为旧线只读取证区：
  - 禁止开发
  - 禁止联调
  - 禁止验收
  - 禁止上传
  - 只允许历史取证和差异比对
- 以后唯一允许的开发来源：`origin/thread26-staging-latest`，或新 `main` 恢复后的正式 `main`。
- 以后 `flowtennis-mgmt-main` 家族唯一正式干净母本目录：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`。
- 以后唯一允许的上传核对工作区：`flowtennis-mgmt-main/.worktrees/thread114-staging-merge`。
- `flowtennis-mini-match-release` 已正式定性为约球小程序唯一上传副本，必须保持干净，上传只允许从这里进行。
- 归档说明见：
  [2026-04-26-thread38-archive-note.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/reports/2026-04-26-thread38-archive-note.md)

## 工作区切换最小执行规则

### 老板切换到新流程只做 3 步

1. 停用旧主目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main`，不再在这里开发、验收、上传。
2. 验收和上传统一改到 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`。
3. 后续新需求一律从 `origin/thread26-staging-latest` 新建 worktree 到 `flowtennis-mgmt-main/.worktrees/<任务名>`，不再从旧主目录继续做。

### 以后新线程创建 worktree 的唯一标准步骤

1. 先确认起点分支只允许是 `origin/thread26-staging-latest`，或新 `main` 恢复后的正式 `main`。
2. 在 `flowtennis-mgmt-main/.worktrees/` 下创建新工作区目录，命名为本次任务名。
3. 新线程开发只在新 worktree 内进行；验收和上传仍只认 `thread114-staging-merge`。

## 技术架构

- **前端**：单页 HTML（`public/index.html`）
- **后端**：Vercel Serverless Function（`api/index.js`）
- **数据库**：阿里云 TableStore（华北2北京）

## 部署

推送到 GitHub 后 Vercel 自动部署。

## 环境变量（Vercel 控制台配置）

- `TS_ENDPOINT` — TableStore 公网地址
- `TS_INSTANCE` — `flowtennis`
- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `JWT_SECRET` — `flowtennis-jwt-2026`

## 环境分层最小规则

- `npm run dev` 现在固定走 `APP_ENV=local`，只读取 `.env.local`
- `npm run dev:staging` 固定走 `APP_ENV=staging`，只读取 `.env.staging`
- `APP_ENV=production` 时优先读取 `.env.production`，兼容旧 `.env`
- 本地 / staging 默认禁止连接生产目标；如确需临时放行，必须显式设置 `ALLOW_PRODUCTION_DATA_FOR_NON_PROD=true`
- 环境模板见：
  - [`.env.example`](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.env.example)
  - [`.env.local.example`](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.env.local.example)
  - [`.env.staging.example`](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.env.staging.example)
  - [`.env.production.example`](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.env.production.example)
- staging 数据承接目录见 [staging-data/README.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/staging-data/README.md)
- staging 接线状态表、Preview 变量清单、首轮快照执行清单见：
  [2026-05-11-staging接线与首轮快照准备清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-11-staging接线与首轮快照准备清单.md)

## scripts 分流最小规则

- `scripts/` 不再被视为“随手堆脚本”的公共目录。
- 目标分流目录为：
  - `scripts/dev/`
  - `scripts/staging/`
  - `scripts/audit/`
  - `scripts/repair/`
  - `scripts/import/`
  - `scripts/inspect/`
- `feature/*` 只承载正常业务功能开发，不承载修数 / 导入脚本。
- `ops/*` 承载修数、历史导入、批量补录、数据收口脚本。
- 现状分类与迁移顺序见：
  - [scripts/README.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/scripts/README.md)
  - [scripts/MIGRATION-TODO.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/scripts/MIGRATION-TODO.md)
