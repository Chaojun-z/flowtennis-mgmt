# scripts/inspect

本目录只放排查辅助脚本。

包括：

- `inspect-*`
- `find-*`
- `preview-*`
- `prepare-*`
- `build-*`
- `bridge-*`

规则：

1. 以只读、排查、生成中间结果为主。
2. 如果后续出现写入动作，就不应继续放在本目录。

当前已迁入：

- `find-entitlements-by-keyword.js`
- `find-purchases-by-keyword.js`
- `find-students-by-keyword.js`
- `inspect-coach-reference-anomalies.js`
- `inspect-mabao-ledger-by-court.js`
- `inspect-mabao-membership-damaged-orders.js`
- `inspect-mabao-membership-plan.js`
- `inspect-mabao-membership-related.js`
- `inspect-purchase-entitlement-by-id.js`
- `preview-mabao-income-csv.py`
- `prepare-mabao-income-import.py`
- `build-confirmed-income-batch.py`
- `bridge-mabao-ready-to-confirmed.py`
