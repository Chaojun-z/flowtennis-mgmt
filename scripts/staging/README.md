# scripts/staging

本目录只放 staging 快照与 staging 联通相关脚本。

当前已迁入：

- `staging-data-export.js`
- `staging-data-sanitize.js`
- `staging-data-import.js`
- `ensure-staging-login-minimal.js`
- `ensure-staging-browse-minimal.js`

允许：

- staging 导出包准备
- staging 脱敏
- staging 导入
- staging 最小联通检查
- staging 最小账号补齐

入口约束：

- 默认只检查，不写入
- 只有显式带 `--write` 才允许建表或写账号
- `ensure-staging-login-minimal.js` 必须显式提供 `SOURCE_TS_INSTANCE`

不允许：

- 顺手塞进生产修数脚本
- 顺手塞进业务功能开发脚本
