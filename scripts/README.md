# scripts 目录分流说明

这个目录现在同时承载了两类东西：

1. 正常开发必需脚本
2. 线上 / staging 数据审计、修复、导入、排查脚本

线程18先落最小分流规则。
线程31、线程32已完成前两批高风险脚本的最小物理迁移。
线程37已完成第四批只读脚本的最小物理迁移。
线程40已完成第五批收入辅助脚本的最小物理迁移。

## 目标目录

- `scripts/dev/`：本地开发、本地校验、非生产辅助脚本
- `scripts/staging/`：staging 快照导出、脱敏、导入、最小联通校验
- `scripts/audit/`：默认只读审计脚本
- `scripts/repair/`：会改线上或 staging 数据的修复脚本
- `scripts/import/`：历史数据导入与归档脚本
- `scripts/inspect/`：`inspect / find / preview / prepare / bridge / build` 这类排查和辅助脚本
- `scripts/lib/`：共享运行时和脚本库

## 当前脚本分类

### 1. 本地开发脚本

- `dev/dev-server.js`
- `dev/migrate-match-db.js`
- `dev/finance-regression.js`

### 2. staging 数据脚本

- `staging/staging-data-export.js`
- `staging/staging-data-sanitize.js`
- `staging/staging-data-import.js`
- `staging/ensure-staging-login-minimal.js`
- `staging/ensure-staging-browse-minimal.js`
- `lib/staging-data-store.js`
- `lib/staging-data-import-plan.js`

### 3. 审计脚本

- `audit/audit-coach-reference-consistency.js`
- `audit/audit-court-finance-anomalies.js`
- `audit/audit-history-income-import.js`
- `audit/audit-ledger-student.js`
- `audit/audit-mabao-match-history.js`
- `audit/audit-mabao-membership-sheet.js`

### 4. 修复脚本

- `repair/cleanup-duplicate-imported-ledger.js`
- `repair/complete-mabao-zhoutao-viki-cleanup.js`
- `repair/create-mabao-membership-safe-missing.js`
- `repair/finalize-mabao-zhoutao-viki.js`
- `repair/fix-mabao-membership-orders.js`
- `repair/repair-coach-reference-consistency.js`
- `repair/repair-court-finance-anomalies.js`
- `repair/repair-entitlement-balances-from-ledger.js`
- `repair/repair-mabao-membership-safe-manual.js`
- `repair/repair-mabao-membership-sheet.js`
- `repair/restore-damaged-mabao-membership-orders.js`
- `repair/settle-history-income-tail.js`

### 5. 导入脚本

- `import/archive-mabao-bridged-import-rows.js`
- `import/import-confirmed-income-batch.js`

### 6. inspect / find / preview 辅助脚本

- `inspect/find-entitlements-by-keyword.js`
- `inspect/find-purchases-by-keyword.js`
- `inspect/find-students-by-keyword.js`
- `inspect/inspect-coach-reference-anomalies.js`
- `inspect/inspect-mabao-ledger-by-court.js`
- `inspect/inspect-mabao-membership-damaged-orders.js`
- `inspect/inspect-mabao-membership-plan.js`
- `inspect/inspect-mabao-membership-related.js`
- `inspect/inspect-purchase-entitlement-by-id.js`
- `inspect/preview-mabao-income-csv.py`
- `inspect/prepare-mabao-income-import.py`
- `inspect/build-confirmed-income-batch.py`
- `inspect/bridge-mabao-ready-to-confirmed.py`

## 当前最危险的脚本

### P0：明确写入或删除线上数据

- `repair/cleanup-duplicate-imported-ledger.js`
- `repair/repair-coach-reference-consistency.js`
- `repair/repair-court-finance-anomalies.js`
- `repair/repair-entitlement-balances-from-ledger.js`
- `repair/restore-damaged-mabao-membership-orders.js`
- `repair/fix-mabao-membership-orders.js`
- `repair/finalize-mabao-zhoutao-viki.js`
- `repair/complete-mabao-zhoutao-viki-cleanup.js`
- `repair/create-mabao-membership-safe-missing.js`
- `repair/settle-history-income-tail.js`
- `import/archive-mabao-bridged-import-rows.js`
- `import/import-confirmed-income-batch.js`

原因：

- 默认可直连真实 TableStore
- 部分脚本用 `--write`
- 部分脚本即使没有 `--write`，也具备 `putRow / deleteRow`

### P1：默认只读，但默认贴近真实数据

- 全部 `audit-*`
- 全部 `inspect-*`
- 全部 `find-*`
- `staging/ensure-staging-login-minimal.js`
- `staging/ensure-staging-browse-minimal.js`

## 本轮落地边界

本轮已做三件事：

1. 固化目标目录和命名边界
2. 把前三批 `repair / cleanup / finalize / archive / import / staging-data-*` 脚本按目录物理迁入子目录
3. 同步修正测试引用与文档入口

本轮不做：

1. 大规模搬完全部旧脚本
2. 重写旧脚本实现
3. 改动业务功能链路

详细迁移清单见 [MIGRATION-TODO.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/scripts/MIGRATION-TODO.md)。

## scripts 目录最终归位表

| 类别 | 目录 | 允许内容 | 禁止内容 | 当前入口 |
| --- | --- | --- | --- | --- |
| 功能开发脚本 | `scripts/dev/` | 本地启动、本地迁移、财务回归门禁 | 修数、导入、生产审计 | `npm run dev` `npm run dev:staging` `npm run db:migrate:match` `npm run guard:finance` |
| staging 脚本 | `scripts/staging/` | 快照导出、脱敏、导入、最小联通补齐 | 生产修数、业务功能开发 | `npm run staging-data:*` `npm run staging:ensure-*:check/write` |
| 审计脚本 | `scripts/audit/` | 默认只读核查、对账、审计报告 | 内置写入动作 | 手工 `node scripts/audit/*` |
| 修复脚本 | `scripts/repair/` | staging / production 修复、补数、回填 | 功能开发、页面联调 | 手工 `node scripts/repair/*` |
| 导入脚本 | `scripts/import/` | 历史导入、导入归档 | 功能开发、默认自动执行 | 手工 `node scripts/import/*` |

高风险入口补充：

- `scripts/staging/ensure-staging-login-minimal.js`：默认只检查，必须显式传 `SOURCE_TS_INSTANCE`，且只有 `--write` 才写入。
- `scripts/staging/ensure-staging-browse-minimal.js`：默认只检查，只有 `--write` 才允许建表。
- `scripts/dev/finance-regression.js`：继续作为财务门禁唯一脚本入口，不并入 `repair` 或 `import`。
