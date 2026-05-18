# First staging refresh checklist

> 用途：首轮生产快照导出 -> 脱敏 -> 导入 staging 的执行清单。  
> 原则：没有拿到 staging TableStore 凭据前，也先把前 3 步做完。

## A. 批次信息

- 批次名：
- 计划执行人：
- 审批人：
- 生产快照时间：
- 目标 staging Preview URL：

## B. 现在就能完成的步骤

- [ ] 已确认本次使用的 manifest 文件
- [ ] 已执行 `npm run staging-data:export`
- [ ] 已生成 `staging-data/exports/.../export-plan.json`
- [ ] 已拿到原始快照文件
- [ ] 已执行 `npm run staging-data:sanitize -- --input=<raw-json>`
- [ ] 已生成 `staging-data/sanitized/*.sanitized.json`
- [ ] 已生成 `staging-data/reports/*.report.json`
- [ ] 已执行 `npm run staging-data:import -- --input=<sanitized-json>`
- [ ] 已生成 `staging-data/imports/*.import-ready.json`
- [ ] 已生成 `staging-data/reports/*.import-report.json`

## C. 外部阻塞

- [ ] 已拿到 `TS_ENDPOINT`
- [ ] 已拿到 `TS_INSTANCE`
- [ ] 已拿到 `ALIBABA_CLOUD_ACCESS_KEY_ID`
- [ ] 已拿到 `ALIBABA_CLOUD_ACCESS_KEY_SECRET`

## D. Vercel / Preview 接线

- [ ] Preview 已设置 `APP_ENV=staging`
- [ ] Preview 已设置 `DATA_ENV=staging`
- [ ] Preview 已设置 staging TableStore 4 个值
- [ ] Preview 已设置 `JWT_SECRET`
- [ ] Preview 已设置 `MATCH_DATABASE_URL`
- [ ] Preview 已设置 `MATCH_DATABASE_SSL`
- [ ] 已确认真实 Preview URL

## E. 小程序 staging 接线

- [ ] `wechat-miniprogram/miniprogram/env.staging.js` 已替换成真实 staging API
- [ ] 微信后台已补合法 `request` 域名
- [ ] 如有上传/下载/图片，还已补齐对应合法域名
- [ ] 已确认模板消息配置
- [ ] 已确认隐私保护指引配置

## F. 首轮联调验收

- [ ] 能登录
- [ ] `workbench` 有数据
- [ ] `finance` 页不空白
- [ ] 会员链路可打开
- [ ] 小程序可连通 staging API
- [ ] 本次结果已登记到批次记录
