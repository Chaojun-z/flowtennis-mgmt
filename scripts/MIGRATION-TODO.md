# scripts 迁移清单

## 迁移原则

1. 先分规则，再分文件。
2. 先迁高风险写入脚本的归属说明，再迁低风险辅助脚本。
3. 单次只迁一类，避免把功能主线和修数主线一起搅动。

## 目录落地状态

- `scripts/dev/`：已建目录说明，暂未迁入文件
- `scripts/staging/`：已迁入 `staging-data-*` 三条 staging 专用脚本
- `scripts/audit/`：已迁入全部 `audit-*` 只读脚本
- `scripts/repair/`：已迁入第一批高风险修复脚本
- `scripts/import/`：已迁入第一批高风险导入脚本
- `scripts/inspect/`：已迁入全部 `inspect-*` / `find-*` 只读脚本

## 第一批优先迁移

目标：先把最容易误伤数据、又最不该跟功能开发混放的脚本，明确归到 `repair / import / audit / inspect`。

### repair

- `[已迁] repair/cleanup-duplicate-imported-ledger.js`
- `[已迁] repair/repair-coach-reference-consistency.js`
- `[已迁] repair/repair-court-finance-anomalies.js`
- `[已迁] repair/repair-entitlement-balances-from-ledger.js`
- `[已迁] repair/repair-mabao-membership-safe-manual.js`
- `[已迁] repair/restore-damaged-mabao-membership-orders.js`
- `[已迁] repair/fix-mabao-membership-orders.js`
- `[已迁] repair/finalize-mabao-zhoutao-viki.js`
- `[已迁] repair/complete-mabao-zhoutao-viki-cleanup.js`
- `[已迁] repair/create-mabao-membership-safe-missing.js`
- `[已迁] repair/settle-history-income-tail.js`

### import

- `[已迁] import/archive-mabao-bridged-import-rows.js`
- `[已迁] import/import-confirmed-income-batch.js`

### audit

- `[已迁] audit/audit-coach-reference-consistency.js`
- `[已迁] audit/audit-court-finance-anomalies.js`
- `[已迁] audit/audit-history-income-import.js`
- `[已迁] audit/audit-ledger-student.js`
- `[已迁] audit/audit-mabao-match-history.js`
- `[已迁] audit/audit-mabao-membership-sheet.js`

### inspect

- `[已迁] inspect/find-entitlements-by-keyword.js`
- `[已迁] inspect/find-purchases-by-keyword.js`
- `[已迁] inspect/find-students-by-keyword.js`
- `[已迁] inspect/inspect-coach-reference-anomalies.js`
- `[已迁] inspect/inspect-mabao-ledger-by-court.js`
- `[已迁] inspect/inspect-mabao-membership-damaged-orders.js`
- `[已迁] inspect/inspect-mabao-membership-plan.js`
- `[已迁] inspect/inspect-mabao-membership-related.js`
- `[已迁] inspect/inspect-purchase-entitlement-by-id.js`

## 第二批迁移

目标：继续搬仍留在根层的高风险写入脚本，但暂时不要碰 staging 主线。

### repair 已完成

- `[已迁] repair/restore-damaged-mabao-membership-orders.js`
- `[已迁] repair/fix-mabao-membership-orders.js`
- `[已迁] repair/complete-mabao-zhoutao-viki-cleanup.js`
- `[已迁] repair/create-mabao-membership-safe-missing.js`
- `[已迁] repair/settle-history-income-tail.js`

## 第三批迁移

目标：继续迁只读或 staging 专用链路，但仍不要混入功能主线。

### staging 已完成

- `[已迁] staging/staging-data-export.js`
- `[已迁] staging/staging-data-sanitize.js`
- `[已迁] staging/staging-data-import.js`

### staging 已完成

- `[已迁] staging/ensure-staging-login-minimal.js`
- `[已迁] staging/ensure-staging-browse-minimal.js`

### audit / inspect

- `[已迁] 全部 audit-*`
- `[已迁] 全部 inspect-*`
- `[已迁] 全部 find-*`

### lib

- 如果后续稳定，再评估是否把 staging 专属库从 `scripts/lib/` 拆到 `scripts/staging/`

## 第四批迁移

目标：继续迁只读辅助链，不碰 staging 页面验收主线，也不碰财务写入逻辑。

### audit / inspect

- `[已迁] 全部 audit-*`
- `[已迁] 全部 inspect-*`
- `[已迁] 全部 find-*`

### import 辅助链

- `[已迁] inspect/preview-mabao-income-csv.py`
- `[已迁] inspect/prepare-mabao-income-import.py`
- `[已迁] inspect/build-confirmed-income-batch.py`
- `[已迁] inspect/bridge-mabao-ready-to-confirmed.py`

## 第五批迁移

目标：继续清理 scripts 根层的收入辅助脚本，不碰 staging 主线和正式导入实现。

### inspect 已完成

- `[已迁] inspect/preview-mabao-income-csv.py`
- `[已迁] inspect/prepare-mabao-income-import.py`
- `[已迁] inspect/build-confirmed-income-batch.py`
- `[已迁] inspect/bridge-mabao-ready-to-confirmed.py`

## 暂时可以不动

这些脚本现在继续留在根层影响相对较小，可最后再处理：

- `scripts/lib/runtime-env.js`

## 第六批迁移

目标：继续清理 scripts 根层的开发辅助脚本，不碰 staging 页面链路，也不碰财务回归实现。

### dev 已完成

- `[已迁] dev/dev-server.js`
- `[已迁] dev/migrate-match-db.js`
- `[已迁] dev/finance-regression.js`

## 实施规则

1. 物理迁移时，优先一类一批迁，不要穿插多个类别。
2. 迁移同一批脚本时，要同步更新测试引用和文档命令示例；只有存在 npm 命令入口时才更新 `package.json`。
3. 功能分支不接收 `repair / import / cleanup / finalize / archive` 新脚本。
4. 这类脚本如果必须新增，默认去 `ops/*` 分支完成，再按治理规则合回。
