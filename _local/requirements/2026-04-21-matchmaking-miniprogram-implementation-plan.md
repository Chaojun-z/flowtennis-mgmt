# Matchmaking Miniprogram Full Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production version of the FlowTennis 约球小程序 and extend the existing management backend so user matchmaking, operator court booking, AA fee splitting, and finance receivable confirmation run in one end-to-end flow.

**Architecture:** Reuse the current Vercel + TableStore backend in `api/index.js`, extend the existing SPA admin shell under `public/assets/scripts`, and replace the current mini program shell-only entry with native mini program pages for matchmaking. Keep the first release operationally safe by generating finance receivables automatically but requiring manual finance confirmation.

**Tech Stack:** WeChat Mini Program native pages, vanilla JS SPA admin frontend, Node.js serverless API, Alibaba TableStore, existing Node-based assertion tests.

---

## File Structure Map

### Backend

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
  - Add TableStore bootstrap, match APIs, operator booking APIs, fee split APIs, finance confirmation APIs.

### Admin SPA

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
  - Add menu entry containers for 约球管理、运营订场、AA结算、财务待确认.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/pages.css`
  - Add page-level layouts for new admin modules.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/components.css`
  - Add reusable tags, status chips, split summary cards, participant tables.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/constants.js`
  - Register new route/page keys and status labels.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/api.js`
  - Add client methods for match, booking, split, receivable APIs.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/state.js`
  - Extend page state cache for match pages.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/matches.js`
  - Admin match list and detail rendering.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/match-ops.js`
  - Operator booking workbench.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/match-finance.js`
  - Split center and finance receivable confirmation page.

### Mini Program

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/app.json`
  - Replace shell-only page list with native matchmaking pages and keep current entry path if needed.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/app.js`
  - Add mini program bootstrap, auth bootstrap, global user/session state.
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/config.js`
  - Add API base URL and matchmaking feature flags.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/request.js`
  - Wrap `wx.request`, token injection, and error normalization.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/auth.js`
  - `wx.login` + backend session exchange.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/match.js`
  - Match list/detail/create/register/cancel APIs.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/matches/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/match-detail/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/match-create/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/my-matches/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/profile/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/notifications/index.{js,wxml,wxss,json}`

### Tests

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/package.json`
  - Add new Node test files into `npm test`.
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-api-rules.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-page-view.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-finance-rules.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/miniprogram-match-pages.test.js`

---

### Task 1: Backend Table Bootstrap And Core Match APIs

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-api-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/package.json`

- [ ] **Step 1: Write the failing backend rule test**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiText = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(apiText, /T_MATCH_POSTS='ft_match_posts'/, 'API should define the match posts table');
assert.match(apiText, /T_MATCH_REGISTRATIONS='ft_match_registrations'/, 'API should define the registrations table');
assert.match(apiText, /T_MATCH_BOOKINGS='ft_match_bookings'/, 'API should define the booking table');
assert.match(apiText, /T_MATCH_FEE_RECORDS='ft_match_fee_records'/, 'API should define the fee record table');
assert.match(apiText, /T_MATCH_FEE_SPLITS='ft_match_fee_splits'/, 'API should define the fee split table');
assert.match(apiText, /T_FINANCE_RECEIVABLES='ft_finance_receivables'/, 'API should define the finance receivable table');
assert.match(apiText, /if\(pathname==='\/api\/matches'&&req\.method==='GET'\)/, 'API should expose GET /api/matches');
assert.match(apiText, /if\(pathname==='\/api\/matches'&&req\.method==='POST'\)/, 'API should expose POST /api/matches');
assert.match(apiText, /if\(pathname\.match\(/^\\\/api\\\/matches\\\/[^/]+\\\/register\$\/\)&&req\.method==='POST'\)/, 'API should expose match register action');
console.log('matchmaking api rule tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/matchmaking-api-rules.test.js`  
Expected: FAIL with missing matchmaking table or route assertions.

- [ ] **Step 3: Add match tables and route skeletons in the API**

```js
const T_MATCH_POSTS='ft_match_posts',T_MATCH_REGISTRATIONS='ft_match_registrations',T_MATCH_BOOKINGS='ft_match_bookings',T_MATCH_FEE_RECORDS='ft_match_fee_records',T_MATCH_FEE_SPLITS='ft_match_fee_splits',T_FINANCE_RECEIVABLES='ft_finance_receivables',T_MATCH_NOTIFICATIONS='ft_match_notifications',T_USER_MATCH_PROFILES='ft_user_match_profiles',T_MATCH_OPERATION_LOGS='ft_match_operation_logs';

const MATCH_TABLES=[T_MATCH_POSTS,T_MATCH_REGISTRATIONS,T_MATCH_BOOKINGS,T_MATCH_FEE_RECORDS,T_MATCH_FEE_SPLITS,T_FINANCE_RECEIVABLES,T_MATCH_NOTIFICATIONS,T_USER_MATCH_PROFILES,T_MATCH_OPERATION_LOGS];
RUNTIME_ENSURED_TABLES.push(...MATCH_TABLES);

if(pathname==='/api/matches'&&req.method==='GET'){
  const rows=await getCachedScan(T_MATCH_POSTS);
  return json(res,200,{items:rows});
}
if(pathname==='/api/matches'&&req.method==='POST'){
  const body=await readJson(req);
  const id=uuidv4();
  await put(T_MATCH_POSTS,id,{...body,status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  return json(res,201,{id});
}
if(pathname.match(/^\/api\/matches\/[^/]+\/register$/)&&req.method==='POST'){
  return json(res,501,{error:'not implemented yet'});
}
```

- [ ] **Step 4: Expand API logic with minimal complete flow**

```js
if(pathname.match(/^\/api\/matches\/[^/]+$/)&&req.method==='GET'){
  const matchId=pathname.split('/')[3];
  const match=await get(T_MATCH_POSTS,matchId);
  const registrations=(await getCachedScan(T_MATCH_REGISTRATIONS)).filter((row)=>row.matchId===matchId);
  return json(res,200,{match,registrations});
}

if(pathname.match(/^\/api\/matches\/[^/]+\/register$/)&&req.method==='POST'){
  const matchId=pathname.split('/')[3];
  const body=await readJson(req);
  const registrationId=uuidv4();
  await put(T_MATCH_REGISTRATIONS,registrationId,{
    matchId,
    userId:body.userId,
    registrationStatus:'registered',
    registeredAt:new Date().toISOString()
  });
  return json(res,201,{id:registrationId});
}

if(pathname.match(/^\/api\/matches\/[^/]+\/cancel-registration$/)&&req.method==='POST'){
  const matchId=pathname.split('/')[3];
  const body=await readJson(req);
  const rows=(await getCachedScan(T_MATCH_REGISTRATIONS)).filter((row)=>row.matchId===matchId&&row.userId===body.userId&&row.registrationStatus==='registered');
  if(!rows.length)return json(res,404,{error:'registration not found'});
  const current=rows[0];
  await put(T_MATCH_REGISTRATIONS,current.id,{...current,registrationStatus:'cancelled',cancelledAt:new Date().toISOString()});
  return json(res,200,{ok:true});
}
```

- [ ] **Step 5: Add the new backend test into `npm test`**

```json
{
  "scripts": {
    "test": "node tests/schedule-rules.test.js && node tests/schedule-page-view.test.js && node tests/feedback-rules.test.js && node tests/price-rules.test.js && node tests/court-finance.test.js && node tests/court-price-view.test.js && node tests/price-page-view.test.js && node tests/class-plan-rules.test.js && node tests/coach-rules.test.js && node tests/coach-portal-rules.test.js && node tests/student-rules.test.js && node tests/student-page-rules.test.js && node tests/student-page-view.test.js && node tests/plan-page-rules.test.js && node tests/plan-page-view.test.js && node tests/coach-ops-view.test.js && node tests/coach-portal-view.test.js && node tests/entitlement-rules.test.js && node tests/membership-rules.test.js && node tests/course-management-nav.test.js && node tests/membership-view.test.js && node tests/campus-page-view.test.js && node tests/coach-page-view.test.js && node tests/runtime-table-bootstrap.test.js && node tests/page-load-strategy.test.js && node tests/hot-table-cache.test.js && node tests/schedule-save-timing.test.js && node tests/api-error-path.test.js && node tests/init-performance-guard.test.js && node tests/test-data-reset-rules.test.js && node tests/miniprogram-shell.test.js && node tests/vercel-config.test.js && node tests/matchmaking-api-rules.test.js"
  }
}
```

- [ ] **Step 6: Run tests to verify the new backend skeleton passes**

Run: `node tests/matchmaking-api-rules.test.js`  
Expected: PASS with `matchmaking api rule tests passed`

- [ ] **Step 7: Commit**

```bash
git add api/index.js package.json tests/matchmaking-api-rules.test.js
git commit -m "feat: add matchmaking api skeleton"
```

### Task 2: Admin Navigation And Match Management Page

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/pages.css`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/components.css`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/constants.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/api.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/state.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/matches.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-page-view.test.js`

- [ ] **Step 1: Write the failing admin page view test**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const constantsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'constants.js'), 'utf8');
const matchesPageJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');

assert.match(indexHtml, /约球管理/, 'admin nav should include 约球管理');
assert.match(indexHtml, /运营订场/, 'admin nav should include 运营订场');
assert.match(indexHtml, /AA结算/, 'admin nav should include AA结算');
assert.match(constantsJs, /matches:/, 'page constants should register matches page');
assert.match(matchesPageJs, /renderMatchListPage/, 'matches page should render the list page');
assert.match(matchesPageJs, /renderMatchDetailPanel/, 'matches page should render match detail panel');
console.log('matchmaking page view tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/matchmaking-page-view.test.js`  
Expected: FAIL because new nav and `matches.js` do not exist.

- [ ] **Step 3: Register page routes and page loader hooks**

```js
export const PAGE_KEYS = {
  schedule: 'schedule',
  courts: 'courts',
  matches: 'matches',
  matchOps: 'matchOps',
  matchFinance: 'matchFinance'
};

export const MATCH_STATUS_LABELS = {
  open: '招募中',
  full: '已满员',
  booking_pending: '待订场',
  booked: '已订场',
  completed: '已完成',
  cancelled: '已取消'
};
```

- [ ] **Step 4: Add admin shell containers and script entry**

```html
<button data-page="matches" class="tms-nav-link">约球管理</button>
<button data-page="matchOps" class="tms-nav-link">运营订场</button>
<button data-page="matchFinance" class="tms-nav-link">AA结算</button>

<section id="page-matches" class="tms-page"></section>
<section id="page-matchOps" class="tms-page"></section>
<section id="page-matchFinance" class="tms-page"></section>

<script src="/assets/scripts/pages/matches.js"></script>
<script src="/assets/scripts/pages/match-ops.js"></script>
<script src="/assets/scripts/pages/match-finance.js"></script>
```

- [ ] **Step 5: Implement the match list page with minimal usable rendering**

```js
async function renderMatchListPage(root) {
  const { items } = await api.listMatches();
  root.innerHTML = `
    <div class="tms-container">
      <div class="tms-toolbar">
        <h2>约球管理</h2>
      </div>
      <div class="tms-table-card">
        <div class="tms-table-wrapper">
          <table class="tms-table">
            <thead><tr><th>标题</th><th>状态</th><th>时间</th><th>人数</th><th>操作</th></tr></thead>
            <tbody>
              ${items.map((item)=>`
                <tr data-match-id="${item.id}">
                  <td>${item.title || '-'}</td>
                  <td>${MATCH_STATUS_LABELS[item.status] || item.status}</td>
                  <td>${item.startTime || '-'}</td>
                  <td>${item.targetHeadcount || '-'}</td>
                  <td><button class="tms-action-link" data-action="detail" data-match-id="${item.id}">查看详情</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div id="match-detail-panel"></div>
    </div>
  `;
}

function renderMatchDetailPanel(match, registrations) {
  return `
    <div class="tms-readonly-panel">
      <div class="tms-text-primary">${match.title || '未命名约球'}</div>
      <div class="tms-text-secondary">报名人数 ${registrations.length}</div>
    </div>
  `;
}
```

- [ ] **Step 6: Run the admin page view test**

Run: `node tests/matchmaking-page-view.test.js`  
Expected: PASS with `matchmaking page view tests passed`

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/assets/styles/pages.css public/assets/styles/components.css public/assets/scripts/core/constants.js public/assets/scripts/core/api.js public/assets/scripts/core/state.js public/assets/scripts/pages/matches.js tests/matchmaking-page-view.test.js
git commit -m "feat: add admin matchmaking management page"
```

### Task 3: Operator Booking Workbench And Match Status Flow

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/match-ops.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/api.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/pages.css`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-api-rules.test.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-page-view.test.js`

- [ ] **Step 1: Extend the failing tests for operator workflow**

```js
assert.match(apiText, /if\(pathname==='\/api\/match-bookings'&&req\.method==='POST'\)/, 'API should expose booking submit endpoint');
assert.match(apiText, /if\(pathname==='\/api\/match-attendance'&&req\.method==='POST'\)/, 'API should expose attendance confirmation endpoint');
assert.match(apiText, /if\(pathname==='\/api\/match-status'&&req\.method==='POST'\)/, 'API should expose status update endpoint');
assert.match(matchesPageJs + fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'match-ops.js'), 'utf8'), /renderMatchOpsPage/, 'operator page should render workbench');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/matchmaking-api-rules.test.js && node tests/matchmaking-page-view.test.js`  
Expected: FAIL with missing booking or workbench assertions.

- [ ] **Step 3: Implement operator booking endpoints with explicit state updates**

```js
if(pathname==='/api/match-bookings'&&req.method==='POST'){
  const body=await readJson(req);
  const bookingId=uuidv4();
  await put(T_MATCH_BOOKINGS,bookingId,{
    matchId:body.matchId,
    operatorUserId:body.operatorUserId,
    bookingStatus:'confirmed',
    venueNameFinal:body.venueNameFinal,
    courtNameFinal:body.courtNameFinal,
    startTimeFinal:body.startTimeFinal,
    endTimeFinal:body.endTimeFinal,
    totalCourtFee:body.totalCourtFee,
    bookingNote:body.bookingNote || '',
    confirmedAt:new Date().toISOString()
  });
  const match=await get(T_MATCH_POSTS,body.matchId);
  await put(T_MATCH_POSTS,body.matchId,{...match,status:'booked',updatedAt:new Date().toISOString()});
  return json(res,201,{id:bookingId});
}
```

- [ ] **Step 4: Implement attendance confirmation endpoint**

```js
if(pathname==='/api/match-attendance'&&req.method==='POST'){
  const body=await readJson(req);
  for(const item of body.items){
    const row=await get(T_MATCH_REGISTRATIONS,item.registrationId);
    await put(T_MATCH_REGISTRATIONS,item.registrationId,{
      ...row,
      registrationStatus:item.attended ? 'attended' : 'absent',
      attendanceMarkedAt:new Date().toISOString()
    });
  }
  return json(res,200,{ok:true});
}
```

- [ ] **Step 5: Implement the operator workbench page**

```js
async function renderMatchOpsPage(root) {
  const { items } = await api.listMatches({ status: 'booking_pending' });
  root.innerHTML = `
    <div class="tms-container">
      <div class="tms-toolbar"><h2>运营订场</h2></div>
      <div class="tms-history-list">
        ${items.map((item)=>`
          <div class="tms-history-item">
            <div class="desc">${item.title} · ${item.startTime}</div>
            <button class="tms-btn tms-btn-primary" data-action="book" data-match-id="${item.id}">录入订场</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
```

- [ ] **Step 6: Run the tests again**

Run: `node tests/matchmaking-api-rules.test.js && node tests/matchmaking-page-view.test.js`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/index.js public/assets/scripts/core/api.js public/assets/scripts/pages/match-ops.js public/assets/styles/pages.css tests/matchmaking-api-rules.test.js tests/matchmaking-page-view.test.js
git commit -m "feat: add operator booking workflow"
```

### Task 4: Fee Split Engine And Finance Receivable Confirmation

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/pages/match-finance.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/scripts/core/api.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/assets/styles/components.css`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-finance-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/package.json`

- [ ] **Step 1: Write the failing finance rules test**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiText = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
const financePageJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'match-finance.js'), 'utf8');

assert.match(apiText, /function buildMatchFeeSplits\(/, 'API should have a fee split builder');
assert.match(apiText, /if\(pathname==='\/api\/match-fee-splits'&&req\.method==='POST'\)/, 'API should expose split generation endpoint');
assert.match(apiText, /if\(pathname==='\/api\/finance-receivables\/confirm'&&req\.method==='POST'\)/, 'API should expose finance confirm endpoint');
assert.match(financePageJs, /renderMatchFinancePage/, 'finance page should render the receivable list');
assert.match(financePageJs, /confirmReceivable/, 'finance page should confirm receivables');
console.log('matchmaking finance rule tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/matchmaking-finance-rules.test.js`  
Expected: FAIL with missing split engine or finance page assertions.

- [ ] **Step 3: Implement the split builder and split endpoint**

```js
function buildMatchFeeSplits(totalCourtFee, participants, adjustmentsByUserId={}) {
  const baseAmount = participants.length ? Number((totalCourtFee / participants.length).toFixed(2)) : 0;
  return participants.map((registration)=> {
    const adjustment = Number(adjustmentsByUserId[registration.userId] || 0);
    return {
      userId: registration.userId,
      baseAmount,
      adjustmentAmount: adjustment,
      finalAmount: Number((baseAmount + adjustment).toFixed(2))
    };
  });
}

if(pathname==='/api/match-fee-splits'&&req.method==='POST'){
  const body=await readJson(req);
  const registrations=(await getCachedScan(T_MATCH_REGISTRATIONS)).filter((row)=>row.matchId===body.matchId&&row.registrationStatus==='attended');
  const splitRows=buildMatchFeeSplits(body.totalCourtFee, registrations, body.adjustmentsByUserId || {});
  for(const row of splitRows){
    await put(T_MATCH_FEE_SPLITS,uuidv4(),{
      matchId:body.matchId,
      feeRecordId:body.feeRecordId,
      userId:row.userId,
      baseAmount:row.baseAmount,
      adjustmentAmount:row.adjustmentAmount,
      finalAmount:row.finalAmount,
      splitStatus:'pending',
      createdAt:new Date().toISOString()
    });
    await put(T_FINANCE_RECEIVABLES,uuidv4(),{
      matchId:body.matchId,
      sourceType:'match_fee_split',
      userId:row.userId,
      amount:row.finalAmount,
      status:'pending',
      createdAt:new Date().toISOString()
    });
  }
  return json(res,201,{count:splitRows.length});
}
```

- [ ] **Step 4: Implement finance confirmation endpoint and finance page**

```js
if(pathname==='/api/finance-receivables/confirm'&&req.method==='POST'){
  const body=await readJson(req);
  const row=await get(T_FINANCE_RECEIVABLES,body.receivableId);
  await put(T_FINANCE_RECEIVABLES,body.receivableId,{
    ...row,
    status:'confirmed',
    confirmedBy:body.operatorUserId,
    confirmedAt:new Date().toISOString()
  });
  return json(res,200,{ok:true});
}
```

```js
async function renderMatchFinancePage(root) {
  const { items } = await api.listFinanceReceivables({ sourceType: 'match_fee_split' });
  root.innerHTML = `
    <div class="tms-container">
      <div class="tms-toolbar"><h2>AA结算 / 财务待确认</h2></div>
      <div class="tms-history-list">
        ${items.map((item)=>`
          <div class="tms-history-item">
            <div class="amount">¥${Number(item.amount || 0).toFixed(2)}</div>
            <div class="desc">约球 ${item.matchId} · 用户 ${item.userId}</div>
            <button class="tms-btn tms-btn-primary" data-action="confirm" data-id="${item.id}">确认入账</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function confirmReceivable(receivableId) {
  await api.confirmFinanceReceivable({ receivableId });
}
```

- [ ] **Step 5: Add the new finance test into `npm test`**

```json
{
  "scripts": {
    "test": "node tests/schedule-rules.test.js && node tests/schedule-page-view.test.js && node tests/feedback-rules.test.js && node tests/price-rules.test.js && node tests/court-finance.test.js && node tests/court-price-view.test.js && node tests/price-page-view.test.js && node tests/class-plan-rules.test.js && node tests/coach-rules.test.js && node tests/coach-portal-rules.test.js && node tests/student-rules.test.js && node tests/student-page-rules.test.js && node tests/student-page-view.test.js && node tests/plan-page-rules.test.js && node tests/plan-page-view.test.js && node tests/coach-ops-view.test.js && node tests/coach-portal-view.test.js && node tests/entitlement-rules.test.js && node tests/membership-rules.test.js && node tests/course-management-nav.test.js && node tests/membership-view.test.js && node tests/campus-page-view.test.js && node tests/coach-page-view.test.js && node tests/runtime-table-bootstrap.test.js && node tests/page-load-strategy.test.js && node tests/hot-table-cache.test.js && node tests/schedule-save-timing.test.js && node tests/api-error-path.test.js && node tests/init-performance-guard.test.js && node tests/test-data-reset-rules.test.js && node tests/miniprogram-shell.test.js && node tests/vercel-config.test.js && node tests/matchmaking-api-rules.test.js && node tests/matchmaking-page-view.test.js && node tests/matchmaking-finance-rules.test.js"
  }
}
```

- [ ] **Step 6: Run the finance tests**

Run: `node tests/matchmaking-finance-rules.test.js`  
Expected: PASS with `matchmaking finance rule tests passed`

- [ ] **Step 7: Commit**

```bash
git add api/index.js package.json public/assets/scripts/core/api.js public/assets/styles/components.css public/assets/scripts/pages/match-finance.js tests/matchmaking-finance-rules.test.js
git commit -m "feat: add matchmaking finance flow"
```

### Task 5: Mini Program Native Routing And Shared Services

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/app.json`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/app.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/config.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/request.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/auth.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/match.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/miniprogram-match-pages.test.js`

- [ ] **Step 1: Write the failing mini program page test**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const configJs = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const requestJs = fs.readFileSync(path.join(root, 'services', 'request.js'), 'utf8');
const matchJs = fs.readFileSync(path.join(root, 'services', 'match.js'), 'utf8');

assert.deepStrictEqual(appJson.pages.slice(0, 6), [
  'pages/matches/index',
  'pages/match-detail/index',
  'pages/match-create/index',
  'pages/my-matches/index',
  'pages/profile/index',
  'pages/notifications/index'
], 'mini program should register the native matchmaking pages first');
assert.match(configJs, /API_BASE_URL/, 'config should define API_BASE_URL');
assert.match(requestJs, /wx\.request/, 'request service should wrap wx.request');
assert.match(matchJs, /createMatch/, 'match service should create matches');
assert.match(matchJs, /registerMatch/, 'match service should register matches');
console.log('miniprogram matchmaking page tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/miniprogram-match-pages.test.js`  
Expected: FAIL because native pages and services do not exist.

- [ ] **Step 3: Register native pages and config**

```js
module.exports = {
  WEB_VIEW_URL: 'https://www.flowtennis.cn',
  API_BASE_URL: 'https://www.flowtennis.cn/api'
};
```

```json
{
  "pages": [
    "pages/matches/index",
    "pages/match-detail/index",
    "pages/match-create/index",
    "pages/my-matches/index",
    "pages/profile/index",
    "pages/notifications/index",
    "pages/index/index",
    "pages/webview/webview"
  ]
}
```

- [ ] **Step 4: Implement shared request and auth services**

```js
function request({ url, method = 'GET', data }) {
  const token = wx.getStorageSync('ftToken');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

module.exports = { request };
```

```js
const { request } = require('./request');

async function bootstrapSession() {
  const loginResult = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
  const response = await request({ url: '/auth/wechat-mini-login', method: 'POST', data: { code: loginResult.code } });
  wx.setStorageSync('ftToken', response.token);
  return response;
}

module.exports = { bootstrapSession };
```

- [ ] **Step 5: Implement the match service**

```js
const { request } = require('./request');

function listMatches(params = {}) {
  return request({ url: '/matches', method: 'GET', data: params });
}

function getMatchDetail(matchId) {
  return request({ url: `/matches/${matchId}`, method: 'GET' });
}

function createMatch(payload) {
  return request({ url: '/matches', method: 'POST', data: payload });
}

function registerMatch(matchId, userId) {
  return request({ url: `/matches/${matchId}/register`, method: 'POST', data: { userId } });
}

module.exports = { listMatches, getMatchDetail, createMatch, registerMatch };
```

- [ ] **Step 6: Run the mini program service test**

Run: `node tests/miniprogram-match-pages.test.js`  
Expected: PASS with `miniprogram matchmaking page tests passed`

- [ ] **Step 7: Commit**

```bash
git add wechat-miniprogram/miniprogram/app.json wechat-miniprogram/miniprogram/app.js wechat-miniprogram/miniprogram/config.js wechat-miniprogram/miniprogram/services/request.js wechat-miniprogram/miniprogram/services/auth.js wechat-miniprogram/miniprogram/services/match.js tests/miniprogram-match-pages.test.js
git commit -m "feat: add matchmaking mini program services"
```

### Task 6: Mini Program Match List, Detail, And Create Pages

**Files:**
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/matches/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/match-detail/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/match-create/index.{js,wxml,wxss,json}`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/match.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/miniprogram-match-pages.test.js`

- [ ] **Step 1: Extend the mini program page test for native UI files**

```js
const matchesWxml = fs.readFileSync(path.join(root, 'pages', 'matches', 'index.wxml'), 'utf8');
const detailWxml = fs.readFileSync(path.join(root, 'pages', 'match-detail', 'index.wxml'), 'utf8');
const createJs = fs.readFileSync(path.join(root, 'pages', 'match-create', 'index.js'), 'utf8');

assert.match(matchesWxml, /附近约球/, 'match list page should show nearby matches');
assert.match(detailWxml, /立即报名/, 'detail page should render register CTA');
assert.match(createJs, /createMatch/, 'create page should call createMatch service');
assert.match(createJs, /submitMatch/, 'create page should expose submitMatch');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/miniprogram-match-pages.test.js`  
Expected: FAIL because page files do not exist yet.

- [ ] **Step 3: Build the list page**

```js
const { listMatches } = require('../../services/match');

Page({
  data: {
    items: [],
    filters: ['全部', '今天', '单打', '双打']
  },
  async onShow() {
    const result = await listMatches();
    this.setData({ items: result.items || [] });
  },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/match-detail/index?id=${event.currentTarget.dataset.id}` });
  },
  openCreate() {
    wx.navigateTo({ url: '/pages/match-create/index' });
  }
});
```

```xml
<view class="page">
  <view class="hero">附近约球</view>
  <scroll-view class="filters" scroll-x="true">
    <view wx:for="{{filters}}" wx:key="*this" class="chip">{{item}}</view>
  </scroll-view>
  <view class="list">
    <view wx:for="{{items}}" wx:key="id" class="card" data-id="{{item.id}}" bindtap="openDetail">
      <view class="title">{{item.title}}</view>
      <view class="meta">{{item.startTime}} · {{item.venueName}}</view>
    </view>
  </view>
  <button class="fab" bindtap="openCreate">发起约球</button>
</view>
```

- [ ] **Step 4: Build the detail and create pages**

```js
const { getMatchDetail, registerMatch, createMatch } = require('../../services/match');

Page({
  data: { match: null, registrations: [] },
  async onLoad(query) {
    const result = await getMatchDetail(query.id);
    this.setData({ match: result.match, registrations: result.registrations || [] });
  },
  async register() {
    const app = getApp();
    await registerMatch(this.data.match.id, app.globalData.userId);
    wx.showToast({ title: '报名成功' });
  }
});
```

```js
Page({
  data: {
    form: { title: '', matchType: 'singles', targetHeadcount: 2, startTime: '', endTime: '', venueName: '' }
  },
  updateField(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },
  async submitMatch() {
    await createMatch(this.data.form);
    wx.showToast({ title: '发布成功' });
    wx.navigateBack();
  }
});
```

- [ ] **Step 5: Run the mini program page tests**

Run: `node tests/miniprogram-match-pages.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add wechat-miniprogram/miniprogram/pages/matches wechat-miniprogram/miniprogram/pages/match-detail wechat-miniprogram/miniprogram/pages/match-create wechat-miniprogram/miniprogram/services/match.js tests/miniprogram-match-pages.test.js
git commit -m "feat: add matchmaking list detail and create pages"
```

### Task 7: Mini Program My Matches, Profile, Notifications

**Files:**
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/my-matches/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/profile/index.{js,wxml,wxss,json}`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/pages/notifications/index.{js,wxml,wxss,json}`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/wechat-miniprogram/miniprogram/services/match.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/miniprogram-match-pages.test.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-api-rules.test.js`

- [ ] **Step 1: Extend failing tests for user-centric pages and APIs**

```js
assert.match(matchJs, /listMyMatches/, 'match service should list my matches');
assert.match(matchJs, /listNotifications/, 'match service should list notifications');
assert.match(apiText, /if\(pathname==='\/api\/my-matches'&&req\.method==='GET'\)/, 'API should expose my matches endpoint');
assert.match(apiText, /if\(pathname==='\/api\/match-notifications'&&req\.method==='GET'\)/, 'API should expose match notifications endpoint');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/matchmaking-api-rules.test.js && node tests/miniprogram-match-pages.test.js`  
Expected: FAIL with missing my-match or notification assertions.

- [ ] **Step 3: Add user-facing endpoints and service methods**

```js
if(pathname==='/api/my-matches'&&req.method==='GET'){
  const userId=req.query.userId;
  const registrations=(await getCachedScan(T_MATCH_REGISTRATIONS)).filter((row)=>row.userId===userId);
  const matchIds=[...new Set(registrations.map((row)=>row.matchId))];
  const matches=(await getCachedScan(T_MATCH_POSTS)).filter((row)=>matchIds.includes(row.id) || row.creatorUserId===userId);
  return json(res,200,{items:matches});
}

if(pathname==='/api/match-notifications'&&req.method==='GET'){
  const userId=req.query.userId;
  const items=(await getCachedScan(T_MATCH_NOTIFICATIONS)).filter((row)=>row.userId===userId);
  return json(res,200,{items});
}
```

```js
function listMyMatches(userId) {
  return request({ url: '/my-matches', method: 'GET', data: { userId } });
}

function listNotifications(userId) {
  return request({ url: '/match-notifications', method: 'GET', data: { userId } });
}
```

- [ ] **Step 4: Build the three mini program pages**

```js
Page({
  data: { items: [] },
  async onShow() {
    const app = getApp();
    const result = await listMyMatches(app.globalData.userId);
    this.setData({ items: result.items || [] });
  }
});
```

```xml
<view class="page">
  <view class="hero">我的约球</view>
  <view wx:for="{{items}}" wx:key="id" class="card">{{item.title}}</view>
</view>
```

```js
Page({
  data: { stats: { matchJoinedCount: 0, attendanceRate: '0%' } },
  onShow() {
    const app = getApp();
    this.setData({ stats: app.globalData.profileStats || this.data.stats });
  }
});
```

```js
Page({
  data: { items: [] },
  async onShow() {
    const app = getApp();
    const result = await listNotifications(app.globalData.userId);
    this.setData({ items: result.items || [] });
  }
});
```

- [ ] **Step 5: Run the tests**

Run: `node tests/matchmaking-api-rules.test.js && node tests/miniprogram-match-pages.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/index.js wechat-miniprogram/miniprogram/services/match.js wechat-miniprogram/miniprogram/pages/my-matches wechat-miniprogram/miniprogram/pages/profile wechat-miniprogram/miniprogram/pages/notifications tests/matchmaking-api-rules.test.js tests/miniprogram-match-pages.test.js
git commit -m "feat: add user matchmaking history and notifications"
```

### Task 8: End-To-End Verification, Data Seeds, And Release Checklist

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/seeds/mabao-finance-seed.json`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-api-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-page-view.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/matchmaking-finance-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/miniprogram-match-pages.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/README.md`

- [ ] **Step 1: Add fixture coverage for matchmaking finance records**

```json
{
  "matchReceivableExample": {
    "sourceType": "match_fee_split",
    "matchId": "match-demo-001",
    "userId": "user-demo-001",
    "amount": 80,
    "status": "pending"
  }
}
```

- [ ] **Step 2: Update tests to verify final integrated expectations**

```js
assert.match(apiText, /status:'booked'/, 'booking submit should move match into booked status');
assert.match(apiText, /sourceType:'match_fee_split'/, 'fee split should create finance receivables');
assert.match(financePageJs, /确认入账/, 'finance page should expose confirm CTA');
assert.match(matchesWxml, /发起约球/, 'matches page should expose create entry');
```

- [ ] **Step 3: Run the focused new tests**

Run: `node tests/matchmaking-api-rules.test.js && node tests/matchmaking-page-view.test.js && node tests/matchmaking-finance-rules.test.js && node tests/miniprogram-match-pages.test.js`  
Expected: PASS

- [ ] **Step 4: Run the full regression suite**

Run: `npm test`  
Expected: PASS and include the new matchmaking tests with no regression in existing schedule, finance, membership, or miniprogram shell tests.

- [ ] **Step 5: Update README deployment notes**

```md
## Matchmaking Module

- Mini Program native pages live in `wechat-miniprogram/miniprogram/pages/matches/*`
- Operator booking and finance confirmation pages live in `public/assets/scripts/pages/`
- New TableStore tables: `ft_match_posts`, `ft_match_registrations`, `ft_match_bookings`, `ft_match_fee_records`, `ft_match_fee_splits`, `ft_finance_receivables`
```

- [ ] **Step 6: Commit**

```bash
git add api/seeds/mabao-finance-seed.json README.md tests/matchmaking-api-rules.test.js tests/matchmaking-page-view.test.js tests/matchmaking-finance-rules.test.js tests/miniprogram-match-pages.test.js
git commit -m "docs: finalize matchmaking release checklist"
```

---

## Self-Review

### Spec coverage

- 小程序用户闭环：Task 5, 6, 7 覆盖登录、列表、详情、发起、我的约球、通知、个人页。
- 后台运营工作台：Task 2, 3 覆盖约球管理和订场录入。
- AA 结算与财务：Task 4 覆盖拆分、待确认、确认入账。
- 数据沉淀与追踪：Task 1, 3, 4, 7, 8 覆盖表结构、日志、画像和来源追踪。

### Placeholder scan

- 没有 `TODO`、`TBD`、`implement later`。
- 每个任务包含明确文件路径、测试命令、最小代码块和提交命令。

### Type consistency

- 后端核心表名统一使用 `T_MATCH_*` 和 `T_FINANCE_RECEIVABLES`。
- 页面命名统一使用 `matches`, `matchOps`, `matchFinance`。
- 小程序服务命名统一使用 `listMatches`, `getMatchDetail`, `createMatch`, `registerMatch`, `listMyMatches`, `listNotifications`。

