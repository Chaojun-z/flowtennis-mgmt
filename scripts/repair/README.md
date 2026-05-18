# scripts/repair

本目录只放修数脚本。

当前已迁入前两批高风险脚本：

- `cleanup-duplicate-imported-ledger.js`
- `complete-mabao-zhoutao-viki-cleanup.js`
- `create-mabao-membership-safe-missing.js`
- `finalize-mabao-zhoutao-viki.js`
- `fix-mabao-membership-orders.js`
- `repair-coach-reference-consistency.js`
- `repair-court-finance-anomalies.js`
- `repair-entitlement-balances-from-ledger.js`
- `repair-mabao-membership-safe-manual.js`
- `repair-mabao-membership-sheet.js`
- `restore-damaged-mabao-membership-orders.js`
- `settle-history-income-tail.js`

规则：

1. 默认先 dry-run。
2. 真写入必须显式参数触发。
3. 不得和普通功能开发一起交付。
4. 默认走 `ops/*` 分支，不走 `feature/*`。

命令入口示例：

- `node scripts/repair/cleanup-duplicate-imported-ledger.js --dry-run`
- `node scripts/repair/repair-coach-reference-consistency.js`
- `node scripts/repair/fix-mabao-membership-orders.js --write`
