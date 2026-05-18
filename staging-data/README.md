# staging-data 承接目录

这个目录只服务一件事：把 staging 数据刷新流程落成固定目录，而不是继续靠人工记忆。

## 目录职责

- `exports/`：生产导出的原始快照，禁止直接用于联调
- `sanitized/`：脱敏后的可流转快照
- `imports/`：准备导入 staging 的规范化包
- `manifests/`：每次刷新任务的清单
- `reports/`：脱敏 / 导入 / 校验报告
- `checklists/`：首轮或每次刷新时给负责人追状态的执行清单

## 最小执行顺序

1. `npm run staging-data:export`
2. `npm run staging-data:sanitize -- --input=<raw-json>`
3. `npm run staging-data:import -- --input=<sanitized-json>`

首轮执行清单见：

- [first-staging-refresh-checklist.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/staging-data/checklists/first-staging-refresh-checklist.md)
- [2026-05-11-staging接线与首轮快照准备清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-11-staging接线与首轮快照准备清单.md)

## 当前唯一外部阻塞

- 还没有阿里云 staging TableStore 子账号与 4 个凭据值

没有这组凭据前：

- 可以做导出批次准备
- 可以做脱敏
- 可以做导入包校验
- 不能真正把数据写进远端 staging
