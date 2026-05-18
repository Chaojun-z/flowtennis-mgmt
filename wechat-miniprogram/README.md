# FlowTennis 微信小程序

这是 FlowTennis 教练端微信小程序壳。

## 当前载体结论

- 真实工程：`flowtennis-mgmt-main/wechat-miniprogram`
- 真实 AppID：`wx7acb7603ee803923`
- 教练登录入口：`miniprogram/pages/index/index`
- 当前角色：教练端小程序壳
- 不是当前正式用户约球入口
- 不是当前约球验收对象

## 当前用途拆分

- 教练登录入口：`pages/index/index`
- 教练课表主页面：`pages/schedule/schedule`
- 默认启动只进入教练端登录页与教练工作台
- 正式用户约球入口不在这套壳里，继续留在 `flowtennis-mini-match`

## 使用方式

1. 用微信开发者工具打开 `wechat-miniprogram` 目录。
2. 拿到真实 AppID 后，替换 `project.config.json` 里的 `appid`。
3. 小程序环境由 `miniprogram/config.js` 控制，默认导出 `production`。
4. 联调前先检查：
   - `miniprogram/env.local.js`
   - `miniprogram/env.staging.js`
   - `miniprogram/env.production.js`
5. 如需让测试版临时走 `staging`，只改 `miniprogram/config.js` 里的 `MANUAL_ENV='staging'` 后再上传测试版；不要改 `DEFAULT_ENV`。
6. 微信后台补齐合法 request 域名、消息模板和隐私保护指引配置。
7. staging 接线和 Preview URL 取值步骤见：
   [2026-05-11-staging接线与首轮快照准备清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-11-staging接线与首轮快照准备清单.md)

## 当前占位

- `project.config.json` 当前 `appid`: `wx7acb7603ee803923`
- 默认 `DEFAULT_ENV`: `production`
- 手动覆盖 `MANUAL_ENV`: `''`
- `staging` API_BASE_URL: `https://staging-not-configured.flowtennis.invalid/api`
- `production` API_BASE_URL: `https://www.flowtennis.cn/api`

## 微信后台最小待办

后续拿到真实 staging Preview URL 后，只做这 4 件事：

1. 把真实 staging API 域名填进 `miniprogram/env.staging.js`
2. 去微信后台补合法 `request` 域名
3. 如有上传/下载/图片资源，再补对应合法域名
4. 确认模板消息和隐私保护指引配置
