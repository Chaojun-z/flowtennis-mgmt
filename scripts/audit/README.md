# scripts/audit

本目录只放默认只读审计脚本。

当前已迁入：

- `audit-coach-reference-consistency.js`
- `audit-court-finance-anomalies.js`
- `audit-history-income-import.js`
- `audit-ledger-student.js`
- `audit-mabao-match-history.js`
- `audit-mabao-membership-sheet.js`

规则：

1. 默认只读。
2. 不允许内置写入动作。
3. 输出应以终端报告或 `docs/reports/` 报告为主。
