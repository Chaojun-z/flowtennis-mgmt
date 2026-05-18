# FlowTennis · 网球兄弟管理系统

校区管理、学员管理、排课管理、教练视角。

## 当前目录身份

- 你现在所在目录 `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
- 这是当前唯一正式验收目录。
- 这也是当前唯一正式上传目录。

## 固定目录规则

- 日常开发目录：
  - `flowtennis-mgmt-main/.worktrees/<任务名>`
- 验收目录：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
- 上传目录：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/.worktrees/thread114-staging-merge`
- 旧主目录用途：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main` 只允许历史取证和差异比对

## 老板只做 3 步

1. 停用旧主目录 `flowtennis-mgmt-main`。
2. 验收和上传统一在 `thread114-staging-merge` 做。
3. 新需求一律从 `origin/thread26-staging-latest` 或恢复后的正式 `main` 新建 worktree。

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
