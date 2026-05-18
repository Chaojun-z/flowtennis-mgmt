# FlowTennis 环境分层最小执行规则

## 1. 当前约束

- 本地预览默认只允许 `APP_ENV=local`
- staging 联调默认只允许 `APP_ENV=staging`
- production 只用于正式运行或已批准运维
- 非生产环境默认禁止加载生产目标；若确需临时连生产，必须显式设置 `ALLOW_PRODUCTION_DATA_FOR_NON_PROD=true`

## 2. 环境文件

- `.env.example`：变量总表
- `.env.local.example`：本地开发模板
- `.env.staging.example`：staging 模板
- `.env.production.example`：production 模板

建议复制方式：

```bash
cp .env.local.example .env.local
cp .env.staging.example .env.staging
cp .env.production.example .env.production
```

## 3. 默认命令

```bash
npm run dev
npm run dev:staging
npm run staging-data:export
npm run staging-data:sanitize -- --input=...
npm run staging-data:import -- --input=...
```

## 4. 修数 / 审计脚本规则

- 以后统一通过 `scripts/lib/runtime-env.js` 读取环境
- 默认 `APP_ENV` 为空时按 `local` 处理
- 旧的根 `.env` 只作为 `production` 兼容回退，不再作为本地默认来源

## 5. 小程序规则

- 小程序环境配置改为 `env.local.js / env.staging.js / env.production.js`
- `config.js` 默认导出 `staging`
- 未切换前，小程序默认不得再隐式直连生产 API
