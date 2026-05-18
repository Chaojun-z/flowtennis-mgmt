# scripts/import

本目录只放历史数据导入、归档、补录脚本。

当前已迁入首批高风险脚本：

- `archive-mabao-bridged-import-rows.js`
- `import-confirmed-income-batch.js`

规则：

1. 导入前先有预览或审计结果。
2. 真写入必须显式触发。
3. 导入脚本不属于普通功能开发。

命令入口示例：

- `node scripts/import/archive-mabao-bridged-import-rows.js --raw=<csv> --bridged=<csv>`
- `node scripts/import/import-confirmed-income-batch.js --input=<csv>`
