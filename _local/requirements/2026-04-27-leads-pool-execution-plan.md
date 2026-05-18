# 线索池实施计划

> **执行说明：** 本计划用于在不破坏现有课程、订场、会员主链的前提下，落地线索池、跟进时间线、CSV 导入、线索转学员 / 转订场桥。步骤使用 checkbox 语法跟踪。任何涉及导入正式写库的动作，都必须在本计划的门禁步骤全部通过后执行。

**目标：** 把 `/Users/shaobaolu/Downloads/网球兄弟·马坡「线索-转化表」 - 线索跟进.csv` 中的线索管理迁入系统，替代本地文档维护方式，让运营可以在系统内完成：

- 录入线索
- 查看线索
- 新增跟进
- 自动形成时间线
- 设置下次跟进
- 转为学员
- 转为订场用户
- 识别订场会员升级结果

**架构：** 新增 `Lead + LeadFollowup` 两层；保留现有 `Student / Court / Membership` 主结构；通过受控转化桥连接，不改写课程、订场、会员核心业务逻辑。

**技术栈：** 单页 HTML（`public/index.html`）、页面脚本（`public/assets/scripts/pages/*.js`）、状态层（`public/assets/scripts/core/*.js`）、后端（`api/index.js`）、Node 原生测试（`tests/*.test.js`）。

---

## 1. 参考文档

- 冻结规格与门禁：
  - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/_local/requirements/2026-04-27-leads-pool-frozen-spec-and-gates.md`

---

## 2. 文件范围

### 2.1 核心改动文件

**前端**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/state.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/bootstrap.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/students.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/courts.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/leads.js`

**后端**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`

**测试**

- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-convert.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/page-data-requirements.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/index-asset-split.test.js`

### 2.2 禁止改动文件范围

本计划执行中，禁止以“顺手优化”为理由重构下面模块：

- 课包购买整体结构
- 班次整体结构
- 排课整体结构
- 订场财务结构
- 会员账务结构

允许做的只读增强：

- 学员详情增加线索摘要
- 订场详情增加线索摘要

---

## 3. Task 1：建立后端 Lead / LeadFollowup 数据骨架

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js`

- [ ] **Step 1：新增表常量与初始化入口**

新增：

- `T_LEADS`
- `T_LEAD_FOLLOWUPS`

要求：

- 接入现有初始化逻辑
- 接入缓存扫描逻辑
- 不影响已有表初始化

- [ ] **Step 2：新增 Lead 规范化函数**

建议新增函数：

- `normalizeLeadRecord()`
- `normalizeLeadFollowupRecord()`
- `deriveLeadSystemStatus()`
- `extractLeadPhoneMeta()`
- `applyLeadFollowupSnapshot()`

要求：

- CSV 16 个核心字段全部有落点
- `systemStatus` 由规则推导，不由前端自由拼

- [ ] **Step 3：为状态归类与字段规范化补测试**

测试覆盖：

- `已报名-*` -> `已转课程`
- `已定场` -> `已转订场`
- `已流失 / 无意向` -> `已流失`
- 同时有 `studentId + courtId` -> `已转课程+订场`
- 手机提取规则安全，不误提取昵称

- [ ] **Step 4：运行规则测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js
```

Expected:

```text
leads rules tests passed
```

---

## 4. Task 2：建立 leads / followups 基础接口

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js`

- [ ] **Step 1：新增 leads CRUD 接口**

实现：

- `GET /leads`
- `POST /leads`
- `PUT /leads/:id`

要求：

- 列表支持筛选：
  - 搜索
  - 来源
  - 咨询需求
  - 跟进人
  - 系统状态
  - 是否待跟进
- 返回主表汇总字段，不依赖前端再拼

- [ ] **Step 2：新增 followups 接口**

实现：

- `GET /leads/:id/followups`
- `POST /leads/:id/followups`

要求：

- 新增 followup 后自动回写 lead：
  - `lastFollowupAt`
  - `latestConcern`
  - `latestConclusion`
  - `nextFollowupAt`
  - `nextAction`
  - `rawStatus`
  - `systemStatus`

- [ ] **Step 3：补接口级测试**

覆盖：

- 创建 lead 成功
- 更新 lead 成功
- 新增 followup 后 lead 汇总字段自动更新
- followup 列表按时间倒序返回

- [ ] **Step 4：运行测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js
```

Expected:

```text
leads rules tests passed
```

---

## 5. Task 3：建立 CSV 导入预览链路

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js`

- [ ] **Step 1：新增导入预览接口**

实现：

- `POST /leads/import-preview`

职责：

- 解析 CSV
- 校验必需列
- 做字段映射
- 尝试匹配现有 `student / court / membership`
- 生成逐行预览结果

必须返回：

- 总行数
- 可导入行数
- 错误行数
- 自动关联学员数
- 自动关联订场数
- 疑似匹配数
- 未匹配数
- 每行预览明细

- [ ] **Step 2：实现匹配函数**

建议新增：

- `matchLeadToStudent()`
- `matchLeadToCourt()`
- `matchLeadToMembership()`
- `buildLeadImportPreviewRow()`

硬规则：

- 手机号完全一致 -> 自动
- 姓名完全一致但无手机号 -> 疑似
- 微信名相同 -> 只提示

- [ ] **Step 3：补导入预览测试**

测试覆盖：

- 必需列校验
- 字段映射正确
- 首条 followup 内容预构建正确
- 自动匹配 / 疑似匹配 / 未匹配 分类正确

- [ ] **Step 4：运行导入测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js
```

Expected:

```text
leads import tests passed
```

---

## 6. Task 4：建立 CSV 正式导入链路

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js`

- [ ] **Step 1：新增正式导入接口**

实现：

- `POST /leads/import-commit`

职责：

- 每行创建 `Lead`
- 每行创建首条 `LeadFollowup`
- 回填自动匹配到的 `studentId / courtId / membershipAccountId`

禁止：

- 自动创建 student
- 自动创建 court
- 自动创建 membership
- 自动改写现有 student / court

- [ ] **Step 2：加正式导入幂等控制**

要求：

- 同一批导入不能重复写两次
- 允许通过 request key / hash / preview token 做幂等控制

- [ ] **Step 3：补正式导入测试**

覆盖：

- 首次导入成功
- 重复提交不重复写库
- 首条 followup 一定存在
- 导入结果统计正确

- [ ] **Step 4：运行导入测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js
```

Expected:

```text
leads import tests passed
```

---

## 7. Task 5：建立线索转学员 / 转订场桥

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-convert.test.js`

- [ ] **Step 1：新增转为学员接口**

实现：

- `POST /leads/:id/convert-student`

规则：

- 已有关联时不重复创建
- 检测到重复候选时返回前端确认
- 创建成功后回填：
  - `studentId`
  - `isCourseConverted`
  - `systemStatus`

- [ ] **Step 2：新增转为订场用户接口**

实现：

- `POST /leads/:id/convert-court`

规则：

- 已有关联时不重复创建
- 检测到重复候选时返回前端确认
- 创建成功后回填：
  - `courtId`
  - `isCourtConverted`
  - `systemStatus`

- [ ] **Step 3：新增关联已有对象接口**

实现：

- `POST /leads/:id/link-student`
- `POST /leads/:id/link-court`

规则：

- 只做绑定，不创建新对象
- 重新计算 `systemStatus`

- [ ] **Step 4：补转化测试**

覆盖：

- 线索转学员成功
- 线索转订场成功
- 重复转化不重复创建
- 关联已有对象成功
- 同一线索可同时有关联 `student + court`

- [ ] **Step 5：运行转化测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-convert.test.js
```

Expected:

```text
leads convert tests passed
```

---

## 8. Task 6：接入前端状态层与页面入口

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/state.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/bootstrap.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/page-data-requirements.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/index-asset-split.test.js`

- [ ] **Step 1：注册 leads 数据集**

在 `state.js` 中新增：

- `leads`
- `leadFollowups`

要求：

- 接好 API loader
- 纳入页面依赖映射
- 首屏尽量只阻塞 leads 列表所需数据

- [ ] **Step 2：注册 leads 页面跳转**

在 `bootstrap.js` 中新增：

- 页面标题映射
- admin 页面路由支持

- [ ] **Step 3：在 index.html 增加左侧入口**

新增：

- 左侧菜单项 `线索池`

位置：

- `工作台` 下
- `学员信息` 上

- [ ] **Step 4：在 index.html 增加 page section**

新增：

- `page-leads`

包含：

- 搜索栏
- 筛选器
- 统计卡
- 列表表格
- 分页区域
- 新建按钮
- 导入按钮

- [ ] **Step 5：引入页面脚本**

在 `index.html` 中引入：

- `assets/scripts/pages/leads.js`

- [ ] **Step 6：更新基础视图测试**

要求：

- 菜单存在
- 页面容器存在
- 脚本引入存在

---

## 9. Task 7：实现线索池列表页

**Files:**

- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/leads.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js`

- [ ] **Step 1：实现列表页筛选逻辑**

支持：

- 搜索：姓名 / 手机 / 微信名
- 来源
- 咨询需求
- 系统状态
- 跟进人
- 是否待跟进
- 日期范围

- [ ] **Step 2：实现统计卡**

统计卡固定为：

- 新线索
- 今日待跟进
- 已逾期未跟进
- 已转课程
- 已转订场
- 已流失

- [ ] **Step 3：实现列表字段**

固定列：

- 姓名 / 手机 / 微信名
- 来源
- 咨询需求
- 意向
- 当前状态
- 跟进人
- 最近跟进
- 下次跟进
- 转化结果
- 操作

- [ ] **Step 4：实现操作按钮**

只允许：

- `查看`
- `跟进`
- `转化`

禁止一行塞过多按钮。

- [ ] **Step 5：补视图测试**

覆盖：

- 统计卡可见
- 核心列表字段可见
- 操作按钮可见

- [ ] **Step 6：运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js
```

Expected:

```text
leads view tests passed
```

---

## 10. Task 8：实现线索详情与跟进时间线

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/leads.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js`

- [ ] **Step 1：实现详情弹窗**

区块固定为：

- 顶部摘要
- 当前判断
- 跟进时间线
- 转化关系

- [ ] **Step 2：实现新增 / 编辑线索弹窗**

录入字段只包含本期必须字段，不额外膨胀。

- [ ] **Step 3：实现新增跟进弹窗**

字段：

- 跟进时间
- 跟进人
- 跟进方式
- 沟通内容
- 用户顾虑
- 本次结论
- 当前状态
- 下次跟进时间
- 下次动作

要求：

- 默认自动带当前时间
- 默认自动带当前登录人

- [ ] **Step 4：实现时间线渲染**

每条卡片显示：

- 跟进时间
- 跟进人
- 跟进方式
- 沟通内容
- 用户顾虑
- 本次结论
- 下次跟进时间
- 下次动作

- [ ] **Step 5：详情按钮接转化桥**

按钮：

- 新增跟进
- 编辑线索
- 转为学员
- 转为订场用户
- 关联已有学员
- 关联已有订场用户

- [ ] **Step 6：补视图测试**

覆盖：

- 时间线可见
- 详情区块可见
- 跟进弹窗字段可见

- [ ] **Step 7：运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js
```

Expected:

```text
leads view tests passed
```

---

## 11. Task 9：实现导入前端流程

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/leads.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js`

- [ ] **Step 1：实现导入入口**

功能：

- 选择 CSV
- 请求 `import-preview`
- 展示导入预览

- [ ] **Step 2：实现导入预览弹窗**

必须展示：

- 识别到的字段
- 缺失字段提醒
- 总行数
- 状态归类统计
- 自动匹配统计
- 疑似匹配列表
- 未匹配列表

- [ ] **Step 3：实现正式导入确认**

要求：

- 只有预览成功后才允许正式导入
- 正式导入前再二次确认

- [ ] **Step 4：补视图测试**

覆盖：

- 导入按钮存在
- 预览弹窗结构存在
- 确认按钮存在

---

## 12. Task 10：在学员和订场详情增加只读线索摘要

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/students.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/courts.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js`

- [ ] **Step 1：学员详情增加线索摘要**

展示：

- 线索来源
- 咨询需求
- 跟进人
- 最近跟进
- 是否由线索转化
- 查看线索按钮

只读，不允许在学员详情直接改线索。

- [ ] **Step 2：订场详情增加线索摘要**

展示规则同上。

- [ ] **Step 3：补视图测试**

覆盖：

- 学员详情能看到线索摘要
- 订场详情能看到线索摘要

---

## 13. Task 11：基础回归与试导入

**Files:**

- 使用现有测试文件 + 新增 leads 测试文件

- [ ] **Step 1：跑线索模块测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-rules.test.js
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-import.test.js
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-view.test.js
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/leads-convert.test.js
```

Expected：

- 所有 leads 测试通过

- [ ] **Step 2：跑原有关键回归**

至少覆盖：

```bash
npm test
```

如果全量过慢，最低限度必须确认：

- 学员
- 购买记录
- 班次
- 排课
- 订场
- 会员

相关测试仍通过。

- [ ] **Step 3：用真实 CSV 跑预览导入**

文件：

- `/Users/shaobaolu/Downloads/网球兄弟·马坡「线索-转化表」 - 线索跟进.csv`

要求：

- 不写库
- 输出统计结果
- 抽查至少 20 条

- [ ] **Step 4：测试环境正式导入**

要求：

- 只在测试环境执行
- 导入后抽查：
  - lead
  - followup
  - student 关联
  - court 关联
  - membership 识别

- [ ] **Step 5：生产导入门禁复核**

只有下面都成立才允许生产导入：

- leads 测试全绿
- 原有关键回归全绿
- 预览导入统计合理
- 抽查 20 条无明显误绑
- 测试环境正式导入无异常

---

## 14. 上线顺序冻结

上线顺序只允许如下：

1. 后端表与接口
2. 前端线索池页面
3. 转化桥
4. 只读线索摘要
5. 导入预览
6. 测试环境正式导入
7. 生产正式导入

禁止：

- 功能未跑通前先导历史数据
- 未做测试环境试导入就生产导入

---

## 15. 任务拆包建议

### 包 A：后端数据与接口

负责人范围：

- `api/index.js`
- `tests/leads-rules.test.js`
- `tests/leads-import.test.js`
- `tests/leads-convert.test.js`

内容：

- 表结构
- CRUD
- 导入预览 / 正式导入
- 转化桥
- 关联接口

### 包 B：前端线索页

负责人范围：

- `public/index.html`
- `public/assets/scripts/core/state.js`
- `public/assets/scripts/core/bootstrap.js`
- `public/assets/scripts/pages/leads.js`
- `tests/leads-view.test.js`

内容：

- 菜单
- 页面
- 列表
- 详情
- 跟进时间线
- 导入预览 UI

### 包 C：现有页面只读联动

负责人范围：

- `public/assets/scripts/pages/students.js`
- `public/assets/scripts/pages/courts.js`
- `tests/leads-view.test.js`

内容：

- 学员详情线索摘要
- 订场详情线索摘要

### 包 D：试导入与回归

负责人范围：

- 测试环境执行
- CSV 预览
- 正式导入演练
- 回归记录

---

## 16. 最终执行原则

执行过程中，始终守住下面这条线：

`线索池只新增入口、跟进时间线、导入能力、转化桥和只读摘要；不重写现有课程、订场、会员核心业务链。`

只要偏离这条线，就必须停下重新审查。
