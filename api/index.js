const TableStore = require('tablestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const mabaoFinanceSeed = require('./seeds/mabao-finance-seed.json');
const {
  PREVIEW_TS_INSTANCE,
  readBooleanEnv,
  resolveRuntimeStage,
  resolveDataStage,
  runtimeDebugEnvValue,
  assertRuntimeDebugReadable,
  assertTableStoreTarget,
  buildBootstrapSafetyFlags,
  logBlockedAutoWrite
} = require('./runtime/bootstrap-guards.js');
const { createInitRuntime } = require('./bootstrap/init-runtime.js');
const { createStartupSideEffectsRunner } = require('./bootstrap/startup-side-effects.js');
const { createPageDataHandler } = require('./page-data/aggregate-handlers.js');
const {
  COURT_ACCOUNT_LIST_PROJECTION_FIELDS,
  createCourtAccountListViewLoader,
  createCourtAccountListCompareLoader
} = require('./page-data/court-account-read-model.js');
const { createFinancePageDataLoader } = require('./page-data/finance-read-model.js');
const { createMembershipWriteHandler } = require('./membership/write-handlers.js');
const { createCourtsMembershipHandler } = require('./courts-membership/route-handlers.js');
const { createCourtSortIndexService } = require('./courts/court-sort-index.js');
const { createTeachingHandler } = require('./teaching/route-handlers.js');
const { createPurchaseEntitlementWriteHandler } = require('./teaching/purchase-entitlement-write-handlers.js');
const { createPurchaseVoidService } = require('./teaching/purchase-void-service.js');
const { createPurchaseUpdateService } = require('./teaching/purchase-update-service.js');
const { createAuthAdminHandler } = require('./auth-admin/route-handlers.js');
const { createMatchModule } = require('./matches');
const { createMatchFinanceBridge } = require('./matches/finance-bridge.js');

const JWT_SECRET = process.env.JWT_SECRET;
const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = process.env.TS_INSTANCE;
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'TS_ENDPOINT', 'TS_INSTANCE', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'];
const RUNTIME_DEBUG_TABLES = ['ft_users','ft_students','ft_purchases','ft_entitlement_ledger','ft_courts','ft_membership_orders'];
async function inspectRuntimeDebugTable(storage,tableName){
  try{
    const rows=await storage.scan(tableName);
    const rowCount=Array.isArray(rows)?rows.length:0;
    return {tableName,exists:true,isEmpty:rowCount===0,rowCount,status:rowCount>0?'has_rows':'empty'};
  }catch(err){
    if(isTableMissingError(err))return {tableName,exists:false,isEmpty:true,rowCount:0,status:'missing'};
    throw err;
  }
}
async function buildRuntimeDataSourceDebugSnapshot(storage={scan},env=process.env){
  const tableStates=await Promise.all(RUNTIME_DEBUG_TABLES.map(tableName=>inspectRuntimeDebugTable(storage,tableName)));
  return {
    generatedAt:new Date().toISOString(),
    runtimeStage:resolveRuntimeStage(env),
    APP_ENV:runtimeDebugEnvValue(env,'APP_ENV'),
    DATA_ENV:runtimeDebugEnvValue(env,'DATA_ENV'),
    TS_INSTANCE:runtimeDebugEnvValue(env,'TS_INSTANCE'),
    TS_ENDPOINT:runtimeDebugEnvValue(env,'TS_ENDPOINT'),
    previewExpectedTSInstance:PREVIEW_TS_INSTANCE,
    tables:tableStates
  };
}
const BOOTSTRAP_SAFETY_FLAGS=buildBootstrapSafetyFlags();
const RAW_ENABLE_DEFAULT_USER_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_DEFAULT_USER_BOOTSTRAP');
const RAW_ENABLE_TABLE_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_TABLE_BOOTSTRAP');
const RAW_ENABLE_RUNTIME_TABLE_ENSURE=readBooleanEnv(process.env,'ENABLE_RUNTIME_TABLE_ENSURE');
const RAW_ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP');
const RAW_ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP');
const RAW_ENABLE_IMPORTED_LEDGER_AUTO_REPAIR=readBooleanEnv(process.env,'ENABLE_IMPORTED_LEDGER_AUTO_REPAIR');
const ENABLE_DEFAULT_USER_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableDefaultUserBootstrap;
const ENABLE_TABLE_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableTableBootstrap;
const ENABLE_RUNTIME_TABLE_ENSURE = BOOTSTRAP_SAFETY_FLAGS.enableRuntimeTableEnsure;
const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableDefaultPricePlanBootstrap;
const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableMabaoFinanceSeedBootstrap;
const ENABLE_IMPORTED_LEDGER_AUTO_REPAIR = BOOTSTRAP_SAFETY_FLAGS.enableImportedLedgerAutoRepair;
const WECHAT_MINIPROGRAM_APPID = process.env.WECHAT_MINIPROGRAM_APPID || 'wx7acb7603ee803923';
const WECHAT_MINIPROGRAM_SECRET = process.env.WECHAT_MINIPROGRAM_SECRET;
const MATCH_MINIPROGRAM_APPID = process.env.MATCH_MINIPROGRAM_APPID || '';
const MATCH_MINIPROGRAM_SECRET = process.env.MATCH_MINIPROGRAM_SECRET || '';
const WECHAT_SCHEDULE_TEMPLATE_ID = process.env.WECHAT_SCHEDULE_TEMPLATE_ID;
const WECHAT_COURSE_REMINDER_TEMPLATE_ID = process.env.WECHAT_COURSE_REMINDER_TEMPLATE_ID;
const MATCH_WECHAT_TEMPLATE_ID = process.env.MATCH_WECHAT_TEMPLATE_ID;
const MATCH_DATABASE_URL = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL;
const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = process.env.DEFAULT_ADMIN_BOOTSTRAP_PASSWORD || '';
const MATCH_CREATOR_CONFIRM_DEADLINE_HOURS = 12;
const MATCH_PREPAY_WINDOW_HOURS = 2;
const LEGACY_STATIC_COACH_REFS=[{id:'legacy-coach-tianhao',name:'天昊'}];

const T_USERS='ft_users',T_COURTS='ft_courts',T_COURT_SORT_INDEX='ft_court_sort_index',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CLASS_NOS='ft_class_nos',T_CAMPUSES='ft_campuses',T_FEEDBACKS='ft_feedbacks',T_PACKAGES='ft_packages',T_PURCHASES='ft_purchases',T_ENTITLEMENTS='ft_entitlements',T_ENTITLEMENT_LEDGER='ft_entitlement_ledger',T_FINANCIAL_LEDGER='ft_financial_ledger',T_MEMBERSHIP_PLANS='ft_membership_plans',T_MEMBERSHIP_ACCOUNTS='ft_membership_accounts',T_MEMBERSHIP_ORDERS='ft_membership_orders',T_MEMBERSHIP_BENEFIT_LEDGER='ft_membership_benefit_ledger',T_MEMBERSHIP_ACCOUNT_EVENTS='ft_membership_account_events',T_PRICE_PLANS='ft_price_plans';
const HOT_CACHE_TTL_MS=10*60*1000;
const MATCH_COURT_FINANCE_ACCOUNT_ID='match-court-finance';
const FINANCE_PAGE_COURT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus',
  'campusName',
  'owner',
  'notes',
  'studentId',
  'studentIds',
  'balance',
  'totalDeposit',
  'spentAmount',
  'receivedAmount',
  'storedValueSpent',
  'directPaidSpent',
  'cachedBalance',
  'cachedTotalDeposit',
  'cachedTotalSpent',
  'cachedTotalReceived',
  'joinDate',
  'createdAt',
  'updatedAt'
];
const MATCH_SQL_TABLES=['match_users','match_posts','match_registrations','match_attendance','match_bookings','match_fee_records','match_fee_splits','match_operation_logs','match_replacements'];
const MEMBERSHIP_TABLES=[T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS];
const RUNTIME_ENSURED_TABLES=[T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_CLASS_NOS,T_PRICE_PLANS,T_COURT_SORT_INDEX,...MEMBERSHIP_TABLES];
const TEST_DATA_RESET_TABLES=[
  T_COURTS,
  T_COURT_SORT_INDEX,
  T_STUDENTS,
  T_PRODUCTS,
  T_SCHEDULE,
  T_CLASSES,
  T_CLASS_NOS,
  T_FEEDBACKS,
  T_PACKAGES,
  T_PURCHASES,
  T_ENTITLEMENTS,
  T_ENTITLEMENT_LEDGER,
  T_PRICE_PLANS,
  ...MEMBERSHIP_TABLES
];
const HOT_SCAN_TABLES=new Map([
  [T_USERS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_COURTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_STUDENTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_PRODUCTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_SCHEDULE,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_CLASSES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_FEEDBACKS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_PACKAGES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_PURCHASES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_ENTITLEMENTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_ENTITLEMENT_LEDGER,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_FINANCIAL_LEDGER,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_PLANS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_BENEFIT_LEDGER,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_ACCOUNT_EVENTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_COACHES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_CAMPUSES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_PRICE_PLANS,{ttlMs:HOT_CACHE_TTL_MS}]
]);
const HOT_GET_TABLES=new Map([
  [T_USERS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_CLASSES,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_ENTITLEMENTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_COURTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_PLANS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:HOT_CACHE_TTL_MS}],
  [T_PRICE_PLANS,{ttlMs:HOT_CACHE_TTL_MS}]
]);
const hotScanCache=new Map();
const hotGetCache=new Map();
let importedLedgerRepairChecked=false;

let tsClient;
const wechatAccessTokenCacheByApp = new Map();
const wechatAccessTokenCache = wechatAccessTokenCacheByApp;
let matchSqlPool;
function gc(){if(!tsClient)tsClient=new TableStore.Client({accessKeyId:TS_KEY_ID,secretAccessKey:TS_KEY_SEC,endpoint:TS_ENDPOINT,instancename:TS_INSTANCE,maxRetries:3,httpOptions:{timeout:15000}});return tsClient;}
function getMatchSqlPool(){
  if(!MATCH_DATABASE_URL)throw new Error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL，约球真实数据不能使用 mock 或 TableStore');
  if(!matchSqlPool)matchSqlPool=new Pool({connectionString:MATCH_DATABASE_URL,ssl:process.env.MATCH_DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
  return matchSqlPool;
}
function isTransientStorageError(err){
  const msg=String(err?.message||err||'');
  return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(msg);
}
async function withStorageRetry(fn,maxAttempts=2){
  let lastErr;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await fn();}
    catch(err){
      lastErr=err;
      if(!isTransientStorageError(err)||attempt===maxAttempts)throw err;
      await new Promise(res=>setTimeout(res,attempt*200));
    }
  }
  throw lastErr;
}
function cloneCacheValue(value){return JSON.parse(JSON.stringify(value));}
function normalizeScanOptions(options){
  const columns=Array.isArray(options?.columns)
    ? [...new Set(options.columns.map(item=>String(item||'').trim()).filter(Boolean))]
    : [];
  return columns.length?{columns}:null;
}
function hotScanCacheKey(t,options){
  const normalized=normalizeScanOptions(options);
  return normalized?`${t}::${normalized.columns.join('|')}`:t;
}
function invalidateHotScanCache(t){
  for(const key of hotScanCache.keys()){
    if(key===t||key.startsWith(`${t}::`))hotScanCache.delete(key);
  }
}
function hotGetCacheKey(t,id){return `${t}:${String(id)}`;}
function invalidateHotGetCache(t,id){
  if(id===undefined||id===null){
    for(const key of hotGetCache.keys())if(key.startsWith(`${t}:`))hotGetCache.delete(key);
    return;
  }
  hotGetCache.delete(hotGetCacheKey(t,id));
}
async function getCachedScan(t,options){
  const cfg=HOT_SCAN_TABLES.get(t);
  if(!cfg)return scan(t,options);
  const now=Date.now();
  const key=hotScanCacheKey(t,options);
  const cached=hotScanCache.get(key);
  if(cached&&cached.expiresAt>now)return cloneCacheValue(cached.rows);
  const rows=await scan(t,options);
  hotScanCache.set(key,{rows:cloneCacheValue(rows),expiresAt:now+cfg.ttlMs});
  return rows;
}
async function getCachedRow(t,id){
  const cfg=HOT_GET_TABLES.get(t);
  if(!cfg)return get(t,id);
  const now=Date.now();
  const key=hotGetCacheKey(t,id);
  const cached=hotGetCache.get(key);
  if(cached&&cached.expiresAt>now)return cloneCacheValue(cached.row);
  const row=await get(t,id);
  hotGetCache.set(key,{row:cloneCacheValue(row),expiresAt:now+cfg.ttlMs});
  return row;
}
function put(t,id,attrs){if(HOT_SCAN_TABLES.has(t))invalidateHotScanCache(t);if(HOT_GET_TABLES.has(t))invalidateHotGetCache(t,id);return withStorageRetry(()=>new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));}
function putIfAbsent(t,id,attrs){return withStorageRetry(()=>new Promise((res,rej)=>{gc().putRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST,null),primaryKey:[{id:String(id)}],attributeColumns:Object.entries(attrs).filter(([k])=>k!=='id').map(([k,v])=>({[k]:typeof v==='object'?JSON.stringify(v):String(v??'')}))},( e,d)=>e?rej(e):res(d));}));}
function get(t,id){return withStorageRetry(()=>new Promise((res,rej)=>{gc().getRow({tableName:t,primaryKey:[{id:String(id)}],maxVersions:1},(e,d)=>{if(e)return rej(e);if(!d.row||!d.row.primaryKey)return res(null);const obj={id:d.row.primaryKey[0].value};(d.row.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});res(obj);});}));}
function normalizeRangePrimaryKey(primaryKey){
  if(!Array.isArray(primaryKey))return primaryKey;
  return primaryKey.map((item)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))return item;
    if(Object.prototype.hasOwnProperty.call(item,'name')&&Object.prototype.hasOwnProperty.call(item,'value')){
      return {[item.name]:item.value};
    }
    return item;
  });
}
function scan(t,options){return withStorageRetry(()=>new Promise((res,rej)=>{const rows=[];const normalized=normalizeScanOptions(options);function f(sk){const params={tableName:t,direction:TableStore.Direction.FORWARD,inclusiveStartPrimaryKey:normalizeRangePrimaryKey(sk)||[{id:TableStore.INF_MIN}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MAX}],maxVersions:1,limit:500};if(normalized?.columns?.length)params.columnsToGet=normalized.columns;gc().getRange(params,(e,d)=>{if(e)return rej(e);(d.rows||[]).forEach(r=>{if(!r.primaryKey)return;const obj={id:r.primaryKey[0].value};(r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});rows.push(obj);});d.nextStartPrimaryKey?f(d.nextStartPrimaryKey):res(rows);});}f();}));}
async function getCachedRowsByIds(t,ids=[]){
  const normalizedIds=[...new Set((ids||[]).map(item=>String(item||'').trim()).filter(Boolean))];
  if(!normalizedIds.length)return [];
  const rows=await Promise.all(normalizedIds.map(id=>getCachedRow(t,id)));
  return rows.filter(Boolean);
}
function listTableRowsDesc(t,{limit=20,cursor=''}={}){return withStorageRetry(()=>new Promise((res,rej)=>{const normalizedLimit=Math.max(1,Math.min(parseInt(limit,10)||20,100));const normalizedCursor=String(cursor||'').trim();gc().getRange({tableName:t,direction:TableStore.Direction.BACKWARD,inclusiveStartPrimaryKey:normalizedCursor?[{id:normalizedCursor}]:[{id:TableStore.INF_MAX}],exclusiveEndPrimaryKey:[{id:TableStore.INF_MIN}],maxVersions:1,limit:normalizedLimit+(normalizedCursor?1:0)},(e,d)=>{if(e)return rej(e);const rows=[];(d.rows||[]).forEach(r=>{if(!r.primaryKey)return;const id=r.primaryKey[0].value;if(normalizedCursor&&String(id)===normalizedCursor)return;const obj={id};(r.attributes||[]).forEach(a=>{try{obj[a.columnName]=JSON.parse(a.columnValue);}catch{obj[a.columnName]=a.columnValue;}});rows.push(obj);});const sliced=rows.slice(0,normalizedLimit);const hasMore=Boolean(d.nextStartPrimaryKey)||(rows.length>normalizedLimit);res({rows:sliced,nextCursor:hasMore&&sliced.length?String(sliced[sliced.length-1].id):''});});}));}
function del(t,id){if(HOT_SCAN_TABLES.has(t))invalidateHotScanCache(t);if(HOT_GET_TABLES.has(t))invalidateHotGetCache(t,id);return withStorageRetry(()=>new Promise((res,rej)=>{gc().deleteRow({tableName:t,condition:new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE,null),primaryKey:[{id:String(id)}]},(e,d)=>e?rej(e):res(d));}));}
async function clearTables(storage,tables){
  const result={success:true,total:0,tables:[]};
  for(const table of tables){
    try{
      const rows=await storage.scan(table);
      for(const row of rows)await storage.del(table,row.id);
      result.total+=rows.length;
      result.tables.push({table,count:rows.length});
    }catch(err){
      result.success=false;
      result.tables.push({table,count:0,error:String(err?.message||err)});
    }
  }
  return result;
}
function getTestDataResetTables(){return [...TEST_DATA_RESET_TABLES];}
function mkTable(t){return new Promise(res=>{gc().createTable({tableMeta:{tableName:t,primaryKey:[{name:'id',type:TableStore.PrimaryKeyType.STRING}]},reservedThroughput:{capacityUnit:{read:0,write:0}},tableOptions:{timeToLive:-1,maxVersions:1}},e=>res(e?'exists':'ok'));});}
async function timed(label,fn){const startedAt=Date.now();try{return await fn();}finally{console.log(`[api-timing] ${label} ${Date.now()-startedAt}ms`);}}
function withTimeout(promise,ms,fallback){
  return Promise.race([promise,new Promise((res)=>setTimeout(()=>res(fallback),ms))]);
}
function isTableMissingError(err){return /not.*exist|table.*not.*exist|OTSObjectNotExist/i.test(String(err?.message||err||''));}
async function putFeedback(id,row){
  try{return await put(T_FEEDBACKS,id,row);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_FEEDBACKS);
    return put(T_FEEDBACKS,id,row);
  }
}
async function scanFeedbacks(){
  try{return await scan(T_FEEDBACKS);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    return [];
  }
}
async function getCachedFeedbacks(){
  return getCachedScan(T_FEEDBACKS).catch(err=>{
    if(!isTableMissingError(err))throw err;
    return [];
  });
}
async function prewarmHotScanCache(){
  await Promise.all([...HOT_SCAN_TABLES.keys()].map(t=>getCachedScan(t)));
}
function getRuntimeEnsuredTables(){return [...RUNTIME_ENSURED_TABLES];}
function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function parseLessonValue(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function isBillableSchedule(rec){return rec&&rec.status!=='已取消';}
function isScheduleLessonCharged(rec){return isBillableSchedule(rec)&&!rec.coachLateFree;}
async function applyLessonDelta(classId,delta,studentIds=[]){
  if(!classId||!delta)return null;
  const cls=await getCachedRow(T_CLASSES,classId);
  if(!cls)return null;
  const oldClass={...cls};
  const nextUsed=Math.max(0,parseLessonValue(cls.usedLessons)+delta);
  try{
    const nextClass={...cls,usedLessons:nextUsed,updatedAt:new Date().toISOString()};
    await put(T_CLASSES,classId,nextClass);
    return {class:nextClass};
  }catch(err){
    await put(T_CLASSES,classId,oldClass).catch(()=>null);
    throw err;
  }
}
function scheduleLessonDelta(rec){
  if(!rec||!rec.classId||!isScheduleLessonCharged(rec))return null;
  const lessonCount=parseLessonValue(rec.lessonCount);
  if(lessonCount<=0)return null;
  return {classId:rec.classId,delta:lessonCount};
}
function applyLinkedClassScheduleSnapshot(rec,linkedClass){
  const base={...(rec||{})};
  if(!base.classId)return {
    ...base,
    classNo:'',
    className:'',
    productId:'',
    productName:''
  };
  if(!linkedClass)return base;
  const classNo=firstNonEmptyText(linkedClass.classNo,base.classNo);
  const className=firstNonEmptyText(linkedClass.className,base.className);
  const productId=firstNonEmptyText(linkedClass.productId,base.productId);
  const productName=firstNonEmptyText(linkedClass.productName,base.productName);
  const courseType=firstNonEmptyText(base.courseType,linkedClass.courseType);
  return {
    ...base,
    ...(classNo?{classNo}:{}),
    ...(className?{className}:{}),
    ...(productId?{productId}:{}),
    ...(productName?{productName}:{}),
    ...(courseType?{courseType}:{}),
  };
}
function effectiveScheduleStatus(rec,now=new Date()){
  if(!rec)return '';
  const status=rec.status||'已排课';
  if(status==='已下课')return '已结束';
  if(status==='已取消'||status==='已结束')return status;
  const end=dateMs(rec.endTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(status==='已排课'&&Number.isFinite(end)&&Number.isFinite(nowMs)&&end<nowMs)return '已结束';
  return status;
}
function scheduleLessonChargeStatus(rec,ledger=[]){
  if(!rec||effectiveScheduleStatus(rec)==='已取消')return '不扣课';
  if(rec.coachLateFree)return '迟到免费';
  if(parseLessonValue(rec.lessonCount)<=0)return '不扣课';
  if(!rec.entitlementId)return '未扣课';
  const used=(ledger||[]).some(l=>l.scheduleId===rec.id&&l.entitlementId===rec.entitlementId&&parseLessonValue(l.lessonDelta)<0);
  return used?'已扣课':'扣课异常';
}
function assertCanWriteSchedule(user){
  if(user?.role==='admin')return;
  throw new Error('无权限');
}
function scheduleHasFeedbackRecord(schedule,feedbacks=[]){
  const scheduleId=String(schedule?.id||'').trim();
  if(!scheduleId)return false;
  return (feedbacks||[]).some(item=>String(item?.scheduleId||'').trim()===scheduleId);
}
function scheduleIsTrialLesson(schedule){
  if(schedule?.isTrial===true)return true;
  return /体验/.test(String(schedule?.courseType||''));
}
function workbenchTrialConvertedByPurchaseRecord(schedule,purchases=[]){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const studentId=studentIds[0]||String(schedule?.studentId||'').trim();
  const studentName=String(schedule?.studentName||'').trim();
  const trialDate=dateKey(schedule?.endTime||schedule?.startTime);
  if(!trialDate)return false;
  return (purchases||[]).some(item=>{
    if(String(item?.status||'').trim()==='voided')return false;
    const purchaseDate=dateKey(item?.purchaseDate||item?.createdAt);
    if(!purchaseDate||purchaseDate<trialDate)return false;
    if(studentId)return String(item?.studentId||'').trim()===studentId;
    return !!studentName&&String(item?.studentName||'').trim()===studentName;
  });
}
function resolveWorkbenchState(schedule,prevSchedule,now=new Date(),feedbacks=[]){
  const fromBackend=schedule?.workbenchState;
  if(fromBackend&&typeof fromBackend==='object'&&fromBackend.code&&fromBackend.label){
    return {code:fromBackend.code,label:fromBackend.label};
  }
  if(!schedule||effectiveScheduleStatus(schedule,now)==='已取消')return null;
  const startMs=dateMs(schedule.startTime);
  const endMs=dateMs(schedule.endTime||schedule.startTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startDiff=Number.isFinite(startMs)&&Number.isFinite(nowMs)?Math.round((startMs-nowMs)/60000):null;
  const sameDay=prevSchedule&&dateKey(prevSchedule.startTime)===dateKey(schedule.startTime);
  const travelGap=sameDay&&prevSchedule&&prevSchedule.campus!==schedule.campus&&prevSchedule.endTime
    ? Math.round((dateMs(schedule.startTime)-dateMs(prevSchedule.endTime))/60000)
    : null;
  const ended=effectiveScheduleStatus(schedule,now)==='已结束';
  if(Number.isFinite(startMs)&&Number.isFinite(endMs)&&startMs<=nowMs&&nowMs<endMs){
    return {code:'live',label:'进行中'};
  }
  if(Number.isFinite(startDiff)&&startDiff>=0&&startDiff<=30){
    return {code:'upcoming',label:'即将开始'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30&&Number.isFinite(travelGap)&&travelGap>=0&&travelGap<60){
    return {code:'travel',label:'需换场'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30){
    return {code:'later',label:'今日后续'};
  }
  if(ended&&!scheduleHasFeedbackRecord(schedule,feedbacks)){
    return {code:'pending',label:'待反馈'};
  }
  return null;
}
function buildWorkbenchStats(input={}){
  if(
    Object.prototype.hasOwnProperty.call(input,'monthFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'weekFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'todayFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'monthFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'pendingFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'monthTrialLessonCount')
    ||Object.prototype.hasOwnProperty.call(input,'trialConversionRate')
  ){
    return {
      monthFinishedLessonUnits:parseLessonValue(input.monthFinishedLessonUnits),
      weekFinishedLessonUnits:parseLessonValue(input.weekFinishedLessonUnits),
      todayFinishedLessonUnits:parseLessonValue(input.todayFinishedLessonUnits),
      monthFeedbackCount:parseInt(input.monthFeedbackCount,10)||0,
      pendingFeedbackCount:parseInt(input.pendingFeedbackCount,10)||0,
      monthTrialLessonCount:parseInt(input.monthTrialLessonCount,10)||0,
      trialConversionRate:parseLessonValue(input.trialConversionRate)
    };
  }
  const now=input.now instanceof Date?input.now:new Date();
  const scheduleRows=Array.isArray(input.schedule)?input.schedule:[];
  const feedbacks=Array.isArray(input.feedbacks)?input.feedbacks:[];
  const purchases=Array.isArray(input.purchases)?input.purchases:[];
  const monthKey=dateKey(now.toISOString()).slice(0,7);
  const dayKey=dateKey(now.toISOString());
  const weekStart=new Date(now);
  weekStart.setHours(0,0,0,0);
  const day=weekStart.getDay()||7;
  weekStart.setDate(weekStart.getDate()-day+1);
  const weekStartKey=dateKey(weekStart.toISOString());
  const weekEnd=new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate()+6);
  const weekEndKey=dateKey(weekEnd.toISOString());
  const endedRows=scheduleRows.filter(item=>effectiveScheduleStatus(item,now)==='已结束');
  const monthEndedRows=endedRows.filter(item=>dateKey(item.startTime).slice(0,7)===monthKey);
  const weekEndedRows=endedRows.filter(item=>{const key=dateKey(item.startTime);return key>=weekStartKey&&key<=weekEndKey;});
  const todayEndedRows=endedRows.filter(item=>dateKey(item.startTime)===dayKey);
  const monthTrialRows=monthEndedRows.filter(scheduleIsTrialLesson);
  const monthTrialConverted=monthTrialRows.filter(item=>workbenchTrialConvertedByPurchaseRecord(item,purchases)).length;
  return {
    monthFinishedLessonUnits:monthEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    weekFinishedLessonUnits:weekEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    todayFinishedLessonUnits:todayEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    monthFeedbackCount:monthEndedRows.filter(item=>scheduleHasFeedbackRecord(item,feedbacks)).length,
    pendingFeedbackCount:endedRows.filter(item=>!scheduleHasFeedbackRecord(item,feedbacks)).length,
    monthTrialLessonCount:monthTrialRows.length,
    trialConversionRate:monthTrialRows.length?Math.round(monthTrialConverted/monthTrialRows.length*100):0
  };
}
function decorateWorkbenchScheduleRows(schedule=[],feedbacks=[],purchases=[],now=new Date()){
  const sorted=(Array.isArray(schedule)?schedule:[]).slice().sort((a,b)=>{
    const coachCompare=String(a?.coach||'').localeCompare(String(b?.coach||''),'zh-CN');
    if(coachCompare!==0)return coachCompare;
    return String(a?.startTime||'').localeCompare(String(b?.startTime||''));
  });
  let prevByCoachDay=new Map();
  return sorted.map(item=>{
    const coachKey=String(item?.coach||'').trim();
    const dayKeyValue=dateKey(item?.startTime);
    const prevKey=`${coachKey}__${dayKeyValue}`;
    const prevSchedule=prevByCoachDay.get(prevKey)||null;
    const workbenchState=resolveWorkbenchState(item,prevSchedule,now,feedbacks);
    prevByCoachDay.set(prevKey,item);
    return {
      ...item,
      workbenchState:workbenchState
    };
  });
}
function assertClassSchedulable(cls,rec){
  if(!rec?.classId||!isBillableSchedule(rec))return;
  if(!cls)throw new Error('关联班次不存在');
  if(cls.status==='已取消')throw new Error('该班次已取消，不能继续排课');
  if(cls.status==='已结课')throw new Error('该班次已结课，不能继续排课');
}
function dateMs(v){if(!v)return NaN;return new Date(String(v).replace(' ','T')).getTime();}
function dateKey(v){return String(v||'').slice(0,10);}
function clockMin(v){const m=String(v||'').slice(0,5).match(/^(\d{1,2}):(\d{2})$/);return m?(parseInt(m[1])*60+parseInt(m[2])):NaN;}
function addDaysKey(ds,days){
  const d=new Date(`${ds}T00:00:00`);
  d.setDate(d.getDate()+(parseInt(days)||0));
  return d.toISOString().slice(0,10);
}
function dayOfWeek1to7(ds){
  const d=new Date(`${ds}T00:00:00`);
  const n=d.getDay();
  return n===0?7:n;
}
function normalizeVenue(v){
  const raw=String(v||'').trim();
  const m=raw.match(/([1-4])\s*号场/);
  return m?`${m[1]}号场`:raw;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd){
  const as=dateMs(aStart),ae=dateMs(aEnd),bs=dateMs(bStart),be=dateMs(bEnd);
  if(!Number.isFinite(as)||!Number.isFinite(ae)||!Number.isFinite(bs)||!Number.isFinite(be))return false;
  return as<be&&bs<ae;
}
function minutesBetween(a,b){
  const am=dateMs(a),bm=dateMs(b);
  if(!Number.isFinite(am)||!Number.isFinite(bm))return null;
  return Math.round(Math.abs(bm-am)/60000);
}
function shareStudent(a,b){
  const aIds=parseArr(a.studentIds).filter(Boolean);
  const bIds=parseArr(b.studentIds).filter(Boolean);
  if(aIds.length&&bIds.length)return aIds.some(id=>bIds.includes(id));
  const an=String(a.studentName||'').trim();
  const bn=String(b.studentName||'').trim();
  return !!(an&&bn&&an===bn);
}
function assertLessonCapacity(cls,oldDelta,nextDelta){
  if(!nextDelta)return;
  if(!cls)throw new Error('关联班次不存在');
  const total=parseLessonValue(cls.totalLessons);
  const used=parseLessonValue(cls.usedLessons);
  const oldSame=oldDelta&&oldDelta.classId===nextDelta.classId?parseLessonValue(oldDelta.delta):0;
  const nextUsed=used-oldSame+parseLessonValue(nextDelta.delta);
  if(total>0&&nextUsed>total)throw new Error(`剩余课时不足：剩余 ${Math.max(0,total-used+oldSame)} 节，本次消课 ${nextDelta.delta} 节`);
}
function validateScheduleConflicts(candidate,schedules,excludeId){
  if(!isBillableSchedule(candidate))return;
  if(!candidate.startTime)throw new Error('请选择上课时间');
  if(!candidate.endTime)throw new Error('请选择下课时间，系统需要用它校验冲突');
  if(String(candidate.startTime).slice(0,10)!==String(candidate.endTime).slice(0,10))throw new Error('上课时间不能跨天');
  if(dateMs(candidate.endTime)<=dateMs(candidate.startTime))throw new Error('下课时间不能早于上课时间');
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(!rangesOverlap(candidate.startTime,candidate.endTime,rec.startTime,rec.endTime))continue;
    if(candidate.coach&&rec.coach&&candidate.coach===rec.coach)throw new Error(`教练「${candidate.coach}」此时间已有课程`);
    const candidateVenue=normalizeVenue(candidate.venue);
    const recVenue=normalizeVenue(rec.venue);
    if(candidateVenue&&recVenue&&candidateVenue===recVenue&&(candidate.campus||'')===(rec.campus||''))throw new Error(`场地「${candidateVenue}」此时间已被占用`);
    if(shareStudent(candidate,rec))throw new Error('学员此时间已有课程');
  }
}
function courtBookingRange(court,row){
  if(row?.type&&row.type!=='消费')return null;
  if(row?.category&&row.category!=='订场')return null;
  if(!row?.date||!row?.startTime||!row?.endTime)return null;
  const campus=row.campus||court?.campus||'';
  const venue=normalizeVenue(row.venue||'');
  if(!campus||!venue)return null;
  const startClock=String(row.startTime).includes(' ')?String(row.startTime).slice(11,16):String(row.startTime).slice(0,5);
  const endClock=String(row.endTime).includes(' ')?String(row.endTime).slice(11,16):String(row.endTime).slice(0,5);
  return {
    courtName:court?.name||'订场用户',
    campus,
    venue,
    startTime:`${row.date} ${startClock}`,
    endTime:`${row.date} ${endClock}`
  };
}
function validateCourtBookingConflicts(candidate,courts){
  if(candidate?.scheduleSource==='订场陪打')return;
  if(!isBillableSchedule(candidate)||!candidate.startTime||!candidate.endTime||!candidate.campus||!candidate.venue)return;
  const candidateVenue=normalizeVenue(candidate.venue);
  for(const court of courts||[]){
    for(const row of normalizeCourtHistory(court.history)){
      const booking=courtBookingRange(court,row);
      if(!booking)continue;
      if(booking.campus!==candidate.campus||booking.venue!==candidateVenue)continue;
      if(rangesOverlap(candidate.startTime,candidate.endTime,booking.startTime,booking.endTime)){
        throw new Error(`场地「${candidateVenue}」${booking.startTime.slice(11,16)}-${booking.endTime.slice(11,16)} 已被订场用户「${booking.courtName}」订场`);
      }
    }
  }
}
function normalizeCourtBookingHistoryRows(court,history){
  return (history||[]).map(row=>{
    if(row?.type==='消费'&&row?.category==='订场'&&!row.campus){
      return {...row,campus:court?.campus||''};
    }
    return row;
  });
}
function assertCourtBookingHistoryAgainstSchedules(court,schedules){
  for(const row of normalizeCourtHistory(court?.history)){
    if(row?.type!=='消费'||row?.category!=='订场')continue;
    const booking=courtBookingRange(court,row);
    if(!booking)continue;
    validateScheduleConflicts(
      {
        id:row.id||court?.id||'court-booking',
        startTime:booking.startTime,
        endTime:booking.endTime,
        campus:booking.campus,
        venue:booking.venue,
        status:'已排课'
      },
      schedules,
      row.id
    );
  }
}
function buildEntitlementFromPurchase(pkg,purchase,student,id=uuidv4(),now=new Date().toISOString()){
  const purchaseDate=purchase.purchaseDate||now.slice(0,10);
  const validUntil=pkg.usageEndDate||pkg.validUntil||(pkg.validDays?addDaysKey(purchaseDate,pkg.validDays):'');
  const totalLessons=parseInt(pkg.lessons)||parseInt(pkg.totalLessons)||0;
  return {
    id,
    studentId:purchase.studentId||student?.id||'',
    studentName:purchase.studentName||student?.name||purchase.studentId||'',
    purchaseId:purchase.id||'',
    packageId:pkg.id||purchase.packageId||'',
    packageName:pkg.name||purchase.packageName||'',
    productId:pkg.productId||'',
    productName:pkg.productName||'',
    courseType:pkg.courseType||pkg.type||'',
    totalLessons,
    usedLessons:0,
    remainingLessons:totalLessons,
    validFrom:purchaseDate,
    validUntil,
    usageStartDate:pkg.usageStartDate||purchaseDate,
    usageEndDate:pkg.usageEndDate||validUntil,
    dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
    timeBand:pkg.timeBand||'',
    coachIds:parseArr(pkg.coachIds),
    coachNames:parseArr(pkg.coachNames),
    ownerCoach:purchase.ownerCoach||'',
    allowedCoaches:parseArr(purchase.allowedCoaches),
    campusIds:parseArr(pkg.campusIds),
    maxStudents:parseInt(pkg.maxStudents)||0,
    status:'active',
    createdAt:now,
    updatedAt:now
  };
}
function buildPurchaseRecord(pkg,body,student,opts={}){
  const now=opts.now||new Date().toISOString();
  const purchaseDate=body.purchaseDate||now.slice(0,10);
  const systemAmount=normalizeMoney(pkg.price);
  const finalAmount=normalizeMoney(body.amountPaid??pkg.price);
  const priceOverridden=systemAmount!==finalAmount;
  const overrideReason=String(body.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  return {
    ...body,
    id:opts.id||body.id||uuidv4(),
    studentId:student.id,
    studentName:student.name||student.id,
    studentPhone:student.phone||'',
    packageId:pkg.id,
    packageName:pkg.name||'',
    productId:pkg.productId||'',
    productName:pkg.productName||'',
    courseType:pkg.courseType||pkg.type||'',
    packageLessons:parseInt(pkg.lessons)||0,
    packagePrice:normalizeMoney(pkg.price),
    priceSource:'package',
    priceSourceId:pkg.id,
    priceSourceName:pkg.name||'',
    systemAmount,
    finalAmount,
    priceOverridden,
    overrideReason,
    packageTimeBand:pkg.timeBand||'',
    dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
    coachIds:parseArr(pkg.coachIds),
    coachNames:parseArr(pkg.coachNames),
    ownerCoach:body.ownerCoach||'',
    allowedCoaches:parseArr(body.allowedCoaches),
    campusIds:parseArr(pkg.campusIds),
    usageStartDate:pkg.usageStartDate||'',
    usageEndDate:pkg.usageEndDate||'',
    purchaseDate,
    amountPaid:finalAmount,
    payMethod:body.payMethod||'',
    operator:opts.operator||body.operator||'',
    status:body.status||'active',
    createdAt:body.createdAt||now,
    updatedAt:now
  };
}
function validateProductInput(product){
  if(!String(product?.name||'').trim())throw new Error('请填写课程名称');
  if(!String(product?.type||'').trim())throw new Error('请选择课程类型');
  if((parseInt(product?.maxStudents)||0)<=0)throw new Error('人数必须大于 0');
  if(normalizeMoney(product?.price)<0)throw new Error('价格不能小于 0');
  if((parseInt(product?.lessons)||0)<0)throw new Error('课时不能小于 0');
}
function normalizeProductRecord(input,old=null,now=new Date().toISOString()){
  const base={...(old||{}),...(input||{})};
  const r={
    ...base,
    name:String(base.name||'').trim(),
    type:String(base.type||'').trim(),
    maxStudents:parseInt(base.maxStudents)||0,
    price:normalizeMoney(base.price),
    lessons:parseInt(base.lessons)||0,
    notes:String(base.notes||'').trim(),
    updatedAt:now
  };
  validateProductInput(r);
  return r;
}
function packageRefIds(values){
  return parseArr(values).map(x=>String(x||'').trim()).filter(Boolean);
}
function validatePackageInput(pkg,refs={}){
  if(!String(pkg?.name||'').trim())throw new Error('请填写课包名称');
  if(!String(pkg?.courseType||'').trim())throw new Error('请选择课程类型');
  if(pkg?.productId&&refs.products&&!(refs.products||[]).some(p=>p.id===pkg.productId))throw new Error('课程产品不存在');
  if((parseInt(pkg.lessons)||0)<=0)throw new Error('课时必须大于 0');
  if(normalizeMoney(pkg.price)<=0)throw new Error('价格必须大于 0');
  if((parseInt(pkg.validDays)||0)<=0)throw new Error('有效天数必须大于 0');
  if((parseInt(pkg.maxStudents)||0)<=0)throw new Error('人数限制必须大于 0');
  if(pkg.saleStartDate&&pkg.saleEndDate&&pkg.saleEndDate<pkg.saleStartDate)throw new Error('活动结束时间不能早于活动开始时间');
  if(pkg.usageStartDate&&pkg.usageEndDate&&pkg.usageEndDate<pkg.usageStartDate)throw new Error('可用结束时间不能早于可用开始时间');
  for(const w of parseArr(pkg.dailyTimeWindows)){
    if((w.startTime&&!w.endTime)||(!w.startTime&&w.endTime))throw new Error('可用时段请填写完整');
    if(w.startTime&&w.endTime&&w.endTime<=w.startTime)throw new Error('可用结束时间必须晚于开始时间');
  }
  const coachIds=packageRefIds(pkg.coachIds);
  const coachNames=packageRefIds(pkg.coachNames);
  if(refs.coaches&&(coachIds.length||coachNames.length)){
    const ok=new Set((refs.coaches||[]).flatMap(c=>[c.id,c.name]).filter(Boolean).map(String));
    const targetCoachRefs=coachNames.length?coachNames:coachIds;
    if(targetCoachRefs.some(id=>!ok.has(String(id))))throw new Error('可用教练不存在');
  }
  const campusIds=packageRefIds(pkg.campusIds);
  if(refs.campuses&&campusIds.length){
    const ok=new Set((refs.campuses||[]).flatMap(c=>[c.id,c.code]).filter(Boolean).map(String));
    if(campusIds.some(id=>!ok.has(String(id))))throw new Error('可用校区不存在');
  }
}
function normalizePackageRecord(input,old=null,refs={},now=new Date().toISOString()){
  const base={...(old||{}),...(input||{})};
  const r={...base,productId:String(base.productId||'').trim(),productName:String(base.productName||'').trim(),courseType:String(base.courseType||'').trim(),lessons:parseInt(base.lessons)||0,price:normalizeMoney(base.price),validDays:parseInt(base.validDays)||0,maxStudents:parseInt(base.maxStudents)||0,status:base.status||'active',updatedAt:now};
  validatePackageInput(r,refs);
  return r;
}
function stableRuleValue(value){
  if(Array.isArray(value))return JSON.stringify(value.map(stableRuleValue));
  if(value&&typeof value==='object'){
    return JSON.stringify(Object.keys(value).sort().reduce((acc,k)=>{acc[k]=stableRuleValue(value[k]);return acc;},{}));
  }
  const arr=parseArr(value);
  if(arr.length)return JSON.stringify(arr.map(stableRuleValue));
  return String(value??'');
}
function changedCoreFields(oldRec,nextRec,fields){
  return fields.filter(k=>stableRuleValue(oldRec?.[k])!==stableRuleValue(nextRec?.[k]));
}
function assertCanEditProductWithReferences(oldProduct,nextProduct,refs={}){
  if(!oldProduct||!nextProduct)return;
  const used=(refs.classes||[]).some(c=>c.productId===oldProduct.id)||(refs.packages||[]).some(p=>p.productId===oldProduct.id);
  if(!used)return;
  if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)throw new Error('该课程产品已有班次或售卖课包使用，不能修改核心字段');
}
function assertCanEditPackageWithPurchases(oldPackage,nextPackage,purchases=[]){
  if(!oldPackage||!nextPackage)return;
  if(!(purchases||[]).some(p=>p.packageId===oldPackage.id))return;
  const changed=changedCoreFields(oldPackage,nextPackage,[
    'productId','productName','courseType','price','lessons','validDays',
    'saleStartDate','saleEndDate','usageStartDate','usageEndDate',
    'dailyTimeWindows','timeBand','coachIds','coachNames','campusIds','maxStudents'
  ]);
  if(changed.length)throw new Error('该课包已有购买记录，不能修改核心规则');
}
function assertCanEditPurchaseWithLedger(oldPurchase,nextPurchase,entitlements=[],ledger=[]){
  if(!oldPurchase||!nextPurchase)return;
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===oldPurchase.id).map(e=>e.id));
  if(!(ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))return;
  const changed=Object.keys({...oldPurchase,...nextPurchase}).filter(k=>!['notes','updatedAt'].includes(k)&&stableRuleValue(oldPurchase[k])!==stableRuleValue(nextPurchase[k]));
  if(changed.length)throw new Error('该购买已有课时消耗，只能修改备注');
}
function purchaseHasEntitlementLedger(purchaseId,entitlements=[],ledger=[]){
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return (ledger||[]).some(l=>entitlementIds.has(l.entitlementId));
}
function validatePurchaseInputForPackage(pkg,purchase,{isEdit=false,oldPackageId=''}={}){
  if(!pkg)throw new Error('售卖课包不存在');
  const samePackage=isEdit&&String(pkg.id||'')===String(oldPackageId||'');
  if(pkg.status&&pkg.status!=='active'&&!samePackage)throw new Error('该课包已停用');
  const purchaseDate=purchase?.purchaseDate||new Date().toISOString().slice(0,10);
  if(pkg.saleStartDate&&purchaseDate<pkg.saleStartDate)throw new Error('不在课包活动购买时间内');
  if(pkg.saleEndDate&&purchaseDate>pkg.saleEndDate)throw new Error('不在课包活动购买时间内');
}
function assertScheduleEntitlementRequired(rec){
  if(!isBillableSchedule(rec))return;
}
function scheduleParticipantSummary(rec){
  const actual=parseArr(rec?.studentIds).filter(Boolean);
  const expected=parseArr(rec?.expectedStudentIds).filter(Boolean);
  const base=expected.length?expected:actual;
  const actualSet=new Set(actual);
  return {
    expectedCount:base.length,
    actualCount:actual.length,
    absentCount:base.filter(id=>!actualSet.has(id)).length
  };
}
function syncEntitlementFromPurchase(pkg,purchase,student,oldEnt,now=new Date().toISOString()){
  const used=parseLessonValue(oldEnt?.usedLessons);
  const next=buildEntitlementFromPurchase(pkg,purchase,student,oldEnt?.id||uuidv4(),now);
  if(oldEnt?.createdAt)next.createdAt=oldEnt.createdAt;
  next.usedLessons=used;
  next.remainingLessons=parseLessonValue(next.totalLessons)-used;
  if(next.remainingLessons<0)throw new Error('该购买记录已有消耗，不能改成课时不足的课包');
  next.status=oldEnt?.status==='voided'?'voided':(next.remainingLessons<=0?'depleted':'active');
  return next;
}
async function writePurchaseAndEntitlementAtomic(store,purchaseTable,entitlementTable,purchase,entitlement){
  await store.put(purchaseTable,purchase.id,purchase);
  try{return await store.put(entitlementTable,entitlement.id,entitlement);}
  catch(err){
    await store.del(purchaseTable,purchase.id).catch(()=>null);
    throw err;
  }
}
function isScheduleInsideDailyTimeWindows(schedule,windows){
  const list=parseArr(windows);
  if(!list.length)return true;
  const ds=dateKey(schedule.startTime);
  if(!ds||ds!==dateKey(schedule.endTime))return false;
  const wd=dayOfWeek1to7(ds);
  const start=clockMin(String(schedule.startTime||'').slice(11,16));
  const end=clockMin(String(schedule.endTime||'').slice(11,16));
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  return list.some(w=>{
    const days=parseArr(w.daysOfWeek).map(n=>parseInt(n)).filter(Boolean);
    if(days.length&&!days.includes(wd))return false;
    const ws=clockMin(w.startTime),we=clockMin(w.endTime);
    return Number.isFinite(ws)&&Number.isFinite(we)&&start>=ws&&end<=we;
  });
}
function validateEntitlementForSchedule(entitlement,schedule){
  if(!isBillableSchedule(schedule))return;
  if(!entitlement)return;
  if(entitlement.status&&entitlement.status!=='active')throw new Error('课包余额不可用');
  const lessonCount=parseLessonValue(schedule.lessonCount,1);
  if(parseLessonValue(entitlement.remainingLessons)<lessonCount)throw new Error('课包剩余课时不足');
  const studentIds=parseArr(schedule.studentIds);
  if(entitlement.studentId&&studentIds.length&&!studentIds.includes(entitlement.studentId))throw new Error('课包所属学员不匹配');
  if(entitlement.courseType&&schedule.courseType&&entitlement.courseType!==schedule.courseType)throw new Error('课程类型不匹配');
  const coachIds=parseArr(entitlement.coachIds);
  const coachNames=parseArr(entitlement.coachNames);
  const coachRefs=Array.isArray(schedule?.coachRefs)?schedule.coachRefs:[];
  const scheduleCoachRefs=[schedule.coachId,schedule.coach].filter(Boolean);
  if(coachIds.length&&scheduleCoachRefs.length&&!coachIds.some(ref=>scheduleCoachRefs.some(current=>sameCoachName(ref,current,coachRefs))))throw new Error('课包可用教练不匹配');
  if(coachNames.length&&schedule.coach&&!coachNames.some(n=>sameCoachName(n,schedule.coach,coachRefs)))throw new Error('课包可用教练不匹配');
  const saleCoachNames=[entitlement.ownerCoach,...parseArr(entitlement.allowedCoaches)].filter(Boolean);
  if(saleCoachNames.length&&schedule.coach&&!saleCoachNames.some(n=>sameCoachName(n,schedule.coach,coachRefs)))throw new Error('课包可上课教练不匹配');
  const campusIds=parseArr(entitlement.campusIds);
  if(campusIds.length&&schedule.campus&&!campusIds.includes(schedule.campus))throw new Error('课包可用校区不匹配');
  const usedDate=dateKey(schedule.startTime);
  const from=entitlement.usageStartDate||entitlement.validFrom;
  const until=entitlement.usageEndDate||entitlement.validUntil;
  if((from&&usedDate<from)||(until&&usedDate>until))throw new Error('不在课包可用日期范围');
  if(!isScheduleInsideDailyTimeWindows(schedule,entitlement.dailyTimeWindows))throw new Error('不在课包可用时间段');
  const max=parseInt(entitlement.maxStudents)||0;
  if(max>0&&studentIds.length>max)throw new Error('课包适用人数不匹配');
}
function entitlementMatchesCoach(entitlement,coachName){
  const name=String(coachName||'').trim();
  if(!name)return false;
  return String(entitlement?.ownerCoach||'').trim()===name||parseArr(entitlement?.allowedCoaches).some(c=>String(c||'').trim()===name);
}
function scheduleEntitlementDeltas(rec){
  if(!rec||!isScheduleLessonCharged(rec))return[];
  const lessonCount=parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  const ids=parseArr(rec.entitlementIds).filter(Boolean);
  if(ids.length)return ids.map(entitlementId=>({entitlementId,delta:lessonCount}));
  if(rec.entitlementId)return[{entitlementId:rec.entitlementId,delta:lessonCount}];
  return[];
}
function normalizeCoachLateInfo(input={}){
  const late=!!input.coachLateFree;
  return {
    coachLateFree:late,
    lateMinutes:late?Math.max(0,parseInt(input.lateMinutes)||0):0,
    lateReason:late?String(input.lateReason||'').trim():'',
    coachLateFieldFeeAmount:late?Math.max(0,parseFloat(input.coachLateFieldFeeAmount)||0):0,
    coachLateHandledAt:late?String(input.coachLateHandledAt||'').trim():'',
    coachLateHandledBy:late?String(input.coachLateHandledBy||'').trim():''
  };
}
function buildCoachLateSettlementRows(schedules=[],month=''){
  return (schedules||[]).filter(s=>{
    if(!s?.coachLateFree)return false;
    const ds=String(s.startTime||'').slice(0,7);
    return !month||ds===month;
  }).map(s=>({
    scheduleId:s.id||'',
    month:String(s.startTime||'').slice(0,7),
    coach:s.coach||'',
    date:String(s.startTime||'').slice(0,10),
    time:`${String(s.startTime||'').slice(11,16)}-${String(s.endTime||'').slice(11,16)}`,
    campus:s.campus||'',
    venue:s.venue||'',
    studentName:s.studentName||'',
    lateMinutes:parseInt(s.lateMinutes)||0,
    fieldFeeAmount:parseFloat(s.coachLateFieldFeeAmount)||0
  }));
}
function recommendEntitlements(entitlements,schedule){
  const options=(entitlements||[]).map(ent=>{
    const warnings=[];
    try{validateEntitlementForSchedule(ent,schedule);}
    catch(e){warnings.push(e.message);}
    return {
      studentId:ent.studentId||'',
      entitlementId:ent.id,
      id:ent.id,
      packageName:ent.packageName||'',
      remainingLessons:parseLessonValue(ent.remainingLessons),
      totalLessons:parseLessonValue(ent.totalLessons),
      validUntil:ent.validUntil||'',
      timeBand:ent.timeBand||'',
      selectable:warnings.length===0,
      warnings,
      _source:ent
    };
  }).sort((a,b)=>{
    if(a.selectable!==b.selectable)return a.selectable?-1:1;
    const av=a.validUntil||'9999-12-31',bv=b.validUntil||'9999-12-31';
    if(av!==bv)return av.localeCompare(bv);
    if(a.remainingLessons!==b.remainingLessons)return a.remainingLessons-b.remainingLessons;
    return String(a._source.purchaseDate||a._source.createdAt||'').localeCompare(String(b._source.purchaseDate||b._source.createdAt||''));
  });
  const clean=options.map(({_source,...rest})=>rest);
  return {recommended:clean.find(o=>o.selectable)||null,options:clean};
}
function resolveScheduleEntitlementDeltas(rec,entitlements=[]){
  const explicit=scheduleEntitlementDeltas(rec);
  if(explicit.length)return explicit;
  if(!rec||!isBillableSchedule(rec))return[];
  const lessonCount=parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  return parseArr(rec.studentIds).filter(Boolean).map(studentId=>{
    const options=(entitlements||[]).filter(e=>e.studentId===studentId);
    const {recommended}=recommendEntitlements(options,{...rec,studentIds:[studentId]});
    return recommended?{studentId,entitlementId:recommended.entitlementId,delta:lessonCount}:null;
  }).filter(Boolean);
}
function applyEntitlementLessonDelta(entitlement,delta,now=new Date().toISOString()){
  const total=parseLessonValue(entitlement.totalLessons);
  const used=Math.max(0,parseLessonValue(entitlement.usedLessons)-parseLessonValue(delta));
  if(used>total)throw new Error('课包剩余课时不足');
  const remaining=Math.max(0,total-used);
  const status=remaining<=0?'depleted':(entitlement.status==='depleted'?'active':(entitlement.status||'active'));
  return {...entitlement,usedLessons:used,remainingLessons:remaining,status,updatedAt:now};
}
function assertScheduleEditableAfterFeedback(oldRec,nextRec,feedbacks){
  if(!oldRec||!nextRec)return;
  if(!(feedbacks||[]).some(f=>f.scheduleId===oldRec.id))return;
  const coreFields=['studentName','classId','entitlementId','startTime','endTime','coach','coachId','campus','venue','courseType','isTrial','lessonCount','status'];
  const changed=coreFields.filter(k=>String(oldRec[k]??'')!==String(nextRec[k]??''));
  const oldStudents=parseArr(oldRec.studentIds).sort();
  const nextStudents=parseArr(nextRec.studentIds).sort();
  const sameStudents=oldStudents.length===nextStudents.length&&oldStudents.every((id,idx)=>id===nextStudents[idx]);
  if(!sameStudents)changed.push('studentIds');
  if(changed.length)throw new Error('该排课已有课后反馈，不能修改学员、班次、课包余额、时间、教练、校区、场地、课程类型、课时或状态');
}
function scheduleEntitlementDelta(rec){
  return scheduleEntitlementDeltas(rec)[0]||null;
}
function diffScheduleEntitlementDeltas(oldDeltas=[],nextDeltas=[]){
  const keyOf=d=>`${d.entitlementId}|${parseLessonValue(d.delta)}`;
  const nextCounts=new Map();
  nextDeltas.forEach(d=>nextCounts.set(keyOf(d),(nextCounts.get(keyOf(d))||0)+1));
  const returns=[];
  oldDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=nextCounts.get(key)||0;
    if(count>0)nextCounts.set(key,count-1);
    else returns.push(d);
  });
  const oldCounts=new Map();
  oldDeltas.forEach(d=>oldCounts.set(keyOf(d),(oldCounts.get(keyOf(d))||0)+1));
  const consumes=[];
  nextDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=oldCounts.get(key)||0;
    if(count>0)oldCounts.set(key,count-1);
    else consumes.push(d);
  });
  return {returns,consumes};
}
async function assertScheduleEntitlementCapacity(nextRec,oldRec){
  const nextDeltas=scheduleEntitlementDeltas(nextRec);
  if(!nextDeltas.length)return null;
  const oldDeltas=scheduleEntitlementDeltas(oldRec);
  const oldMap=new Map(oldDeltas.map(d=>[d.entitlementId,d.delta]));
  const checked=[];
  for(const nextDelta of nextDeltas){
    const ent=await getCachedRow(T_ENTITLEMENTS,nextDelta.entitlementId);
    if(!ent)throw new Error('课包余额不存在');
    const adjusted=oldMap.has(nextDelta.entitlementId)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+oldMap.get(nextDelta.entitlementId)}:ent;
    validateEntitlementForSchedule(adjusted,{...nextRec,studentIds:[adjusted.studentId].filter(Boolean)});
    checked.push(adjusted);
  }
  return checked;
}
async function applyEntitlementDelta(entitlementId,scheduleId,delta,action,reason,user){
  if(!entitlementId||!delta)return null;
  const ent=await getCachedRow(T_ENTITLEMENTS,entitlementId);
  if(!ent)return null;
  const next=applyEntitlementLessonDelta(ent,delta);
  await put(T_ENTITLEMENTS,entitlementId,next);
  const ledger={
    id:uuidv4(),
    entitlementId,
    studentId:ent.studentId||'',
    scheduleId:scheduleId||'',
    lessonDelta:delta,
    action,
    reason,
    operator:user?.name||'',
    createdAt:new Date().toISOString()
  };
  await put(T_ENTITLEMENT_LEDGER,ledger.id,ledger);
  return {entitlement:next,ledger};
}
function collectScheduleRiskWarnings(candidate,schedules,excludeId){
  if(!isBillableSchedule(candidate)||!candidate.coach||!candidate.campus||!candidate.startTime||!candidate.endTime)return[];
  const warnings=[];
  for(const rec of schedules||[]){
    if(!rec||rec.id===(excludeId||candidate.id)||!isBillableSchedule(rec))continue;
    if(rec.coach!==candidate.coach||!rec.campus||rec.campus===candidate.campus)continue;
    const gapBefore=minutesBetween(rec.endTime,candidate.startTime);
    if(gapBefore!==null&&dateMs(rec.endTime)<=dateMs(candidate.startTime)&&gapBefore<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${rec.campus}，下一节在 ${candidate.campus}，中间仅 ${gapBefore} 分钟`);
      continue;
    }
    const gapAfter=minutesBetween(candidate.endTime,rec.startTime);
    if(gapAfter!==null&&dateMs(candidate.endTime)<=dateMs(rec.startTime)&&gapAfter<60){
      warnings.push(`跨校区提醒：${candidate.coach}上一节在 ${candidate.campus}，下一节在 ${rec.campus}，中间仅 ${gapAfter} 分钟`);
    }
  }
  return [...new Set(warnings)];
}
function feedbackScopeForSchedule(schedule={}){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const courseType=String(schedule?.courseType||schedule?.type||schedule?.title||'').trim();
  if(schedule?.feedbackScope==='class'||schedule?.feedbackScope==='student')return schedule.feedbackScope;
  if(String(schedule?.classId||'').trim()&&(studentIds.length>1||/班课|训练营|小班|大师课/.test(courseType)))return 'class';
  return 'student';
}
function buildFeedbackRecord(body,base,user){
  if(!body.scheduleId)throw new Error('缺少排课ID');
  const now=new Date().toISOString();
  const studentIds=parseArr(body.studentIds).filter(Boolean);
  const feedbackScope=feedbackScopeForSchedule(body);
  const studentId=feedbackScope==='class'?'':(body.studentId||studentIds[0]||'');
  return {
    ...base,
    scheduleId:body.scheduleId,
    classId:body.classId||'',
    feedbackScope,
    studentId,
    studentIds,
    studentName:body.studentName||'',
    coach:body.coach||user?.name||'',
    startTime:body.startTime||'',
    campus:body.campus||'',
    venue:body.venue||'',
    lessonCount:body.lessonCount||0,
    isTrial:!!body.isTrial,
    remainingLessons:body.remainingLessons||'',
    practicedToday:body.practicedToday||body.focus||body.performance||'',
    knowledgePoint:body.knowledgePoint||body.problems||'',
    nextTraining:body.nextTraining||body.nextAdvice||'',
    playerLevel:body.playerLevel||'',
    goalType:body.goalType||'',
    experienceBackground:body.experienceBackground||'',
    mainIssues:body.mainIssues||'',
    conversionIntent:body.conversionIntent||'',
    recommendedProductType:body.recommendedProductType||'',
    recommendedReason:body.recommendedReason||'',
    needOpsFollowUp:body.needOpsFollowUp===true||body.needOpsFollowUp==='是',
    opsFollowUpPriority:body.opsFollowUpPriority||'',
    opsFollowUpSuggestion:body.opsFollowUpSuggestion||'',
    sentToStudent:body.sentToStudent||false,
    updatedBy:user?.name||'',
    updatedAt:now,
    createdAt:base.createdAt||now
  };
}
function assertCanWriteFeedback(user,schedule,coachRefs=[]){
  if(user?.role==='admin')return;
  const coachId=String(user?.coachId||user?.id||user?.username||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  const hasReliableCoachId=!!(coachId&&coachId!==authId);
  const scheduleCoachId=String(schedule?.coachId||'').trim();
  const scheduleCoach=String(schedule?.coach||'').trim();
  if(hasReliableCoachId&&scheduleCoachId){
    if(sameCoachName(coachId,scheduleCoachId,coachRefs))return;
    throw new Error('只能填写自己的课程反馈');
  }
  if(hasReliableCoachId&&scheduleCoach){
    if(sameCoachName(coachId,scheduleCoach,coachRefs))return;
    throw new Error('只能填写自己的课程反馈');
  }
  if(coachName&&scheduleCoach&&sameCoachName(coachName,scheduleCoach,coachRefs))return;
  throw new Error('只能填写自己的课程反馈');
}
function filterLoadAllForUser(data,user,coachRefs=[]){
  const normalized={
    courts:Array.isArray(data?.courts)?data.courts:[],
    students:Array.isArray(data?.students)?data.students:[],
    products:Array.isArray(data?.products)?data.products:[],
    packages:Array.isArray(data?.packages)?data.packages:[],
    purchases:Array.isArray(data?.purchases)?data.purchases:[],
    entitlements:Array.isArray(data?.entitlements)?data.entitlements:[],
    entitlementLedger:Array.isArray(data?.entitlementLedger)?data.entitlementLedger:[],
    membershipPlans:Array.isArray(data?.membershipPlans)?data.membershipPlans:[],
    membershipAccounts:Array.isArray(data?.membershipAccounts)?data.membershipAccounts:[],
    membershipOrders:Array.isArray(data?.membershipOrders)?data.membershipOrders:[],
    membershipBenefitLedger:Array.isArray(data?.membershipBenefitLedger)?data.membershipBenefitLedger:[],
    membershipAccountEvents:Array.isArray(data?.membershipAccountEvents)?data.membershipAccountEvents:[],
    pricePlans:Array.isArray(data?.pricePlans)?data.pricePlans:[],
    schedule:Array.isArray(data?.schedule)?data.schedule:[],
    coaches:Array.isArray(data?.coaches)?data.coaches:[],
    classes:Array.isArray(data?.classes)?data.classes:[],
    campuses:Array.isArray(data?.campuses)?data.campuses:[],
    feedbacks:Array.isArray(data?.feedbacks)?data.feedbacks:[]
  };
  if(user?.role==='admin')return normalized;
  const coachId=String(user?.coachId||user?.id||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  const hasReliableCoachId=!!(coachId&&coachId!==authId);
  const rowMatchesCoach=(row)=>{
    const rowCoachId=String(row?.coachId||row?.primaryCoachId||'').trim();
    const rowCoachName=String(row?.coach||row?.primaryCoach||'').trim();
    if(hasReliableCoachId&&rowCoachId)return sameCoachName(rowCoachId,coachId,coachRefs);
    if(hasReliableCoachId&&rowCoachName)return sameCoachName(rowCoachName,coachId,coachRefs)||sameCoachName(rowCoachName,coachName,coachRefs);
    return coachName&&rowCoachName&&sameCoachName(rowCoachName,coachName,coachRefs);
  };
  const ownSchedule=normalized.schedule.filter(rowMatchesCoach);
  const scheduleIds=new Set(ownSchedule.map(s=>s.id).filter(Boolean));
  const scheduleClassIds=new Set(ownSchedule.map(s=>s.classId).filter(Boolean));
  const ownClasses=normalized.classes.filter(c=>rowMatchesCoach(c)||scheduleClassIds.has(c.id));
  const studentIds=new Set();
  normalized.students.filter(rowMatchesCoach).forEach(s=>studentIds.add(s.id));
  ownSchedule.forEach(s=>parseArr(s.studentIds).forEach(id=>studentIds.add(id)));
  ownClasses.forEach(c=>parseArr(c.studentIds).forEach(id=>studentIds.add(id)));
  const safeEntitlements=normalized.entitlements.filter(e=>studentIds.has(e.studentId)).map(e=>({
    id:e.id,studentId:e.studentId,studentName:e.studentName,packageName:e.packageName,courseType:e.courseType,totalLessons:e.totalLessons,usedLessons:e.usedLessons,remainingLessons:e.remainingLessons,validFrom:e.validFrom,validUntil:e.validUntil,timeBand:e.timeBand,status:e.status,ownerCoach:e.ownerCoach,allowedCoaches:parseArr(e.allowedCoaches)
  }));
  const safeLedger=normalized.entitlementLedger.filter(l=>
    scheduleIds.has(l.scheduleId)||(
      studentIds.has(l.studentId)&&!l.scheduleId&&!!importedLedgerMonthKey(l)&&Number(l.lessonDelta)<0
    )
  ).map(l=>({
    id:l.id,entitlementId:l.entitlementId,studentId:l.studentId,scheduleId:l.scheduleId,lessonDelta:l.lessonDelta,action:l.action,reason:l.reason,createdAt:l.createdAt,relatedDate:l.relatedDate,sourceMonth:l.sourceMonth,importSource:l.importSource,notes:l.notes
  }));
  const safePurchases=normalized.purchases.filter(p=>studentIds.has(p.studentId)).map(p=>({
    id:p.id,
    studentId:p.studentId||'',
    studentName:p.studentName||'',
    purchaseDate:p.purchaseDate||'',
    createdAt:p.createdAt||'',
    status:p.status||'active'
  }));
  return {
    courts:[],
    students:normalized.students.filter(s=>studentIds.has(s.id)),
    products:normalized.products,
    packages:[],
    purchases:safePurchases,
    entitlements:safeEntitlements,
    entitlementLedger:normalizeEntitlementLedgerRowsForView(safeLedger),
    membershipPlans:[],
    membershipAccounts:[],
    membershipOrders:[],
    membershipBenefitLedger:[],
    membershipAccountEvents:[],
    pricePlans:[],
    schedule:ownSchedule,
    coaches:normalized.coaches.filter(c=>sameCoachName(c.id||c.name,coachId||coachName,coachRefs)),
    classes:ownClasses,
    campuses:normalized.campuses,
    feedbacks:normalized.feedbacks.filter(f=>scheduleIds.has(f.scheduleId))
  };
}
function coachRefAliases(value,coachRefs=[]){
  const raw=String(value||'').trim();
  const refs=Array.isArray(coachRefs)?coachRefs:[];
  if(!raw)return [];
  const values=new Set([raw]);
  refs.forEach(ref=>{
    const id=String(ref?.id||'').trim();
    const name=String(ref?.name||'').trim();
    if(raw===id||raw===name){
      if(id)values.add(id);
      if(name)values.add(name);
    }
  });
  return [...values];
}
function sameCoachName(a,b,coachRefs=[]){
  const left=coachRefAliases(a,coachRefs);
  const right=new Set(coachRefAliases(b,coachRefs));
  return left.some(item=>right.has(item));
}
function buildCoachRefs({coaches=[],users=[]}={}){
  const refs=[];
  const seen=new Set();
  const push=(id,name)=>{
    const cid=String(id||'').trim();
    const cname=String(name||'').trim();
    if(!cid&&!cname)return;
    const key=`${cid}::${cname}`;
    if(seen.has(key))return;
    seen.add(key);
    refs.push({id:cid,name:cname});
  };
  (coaches||[]).forEach(coach=>push(coach?.id,coach?.name));
  LEGACY_STATIC_COACH_REFS.forEach(ref=>push(ref.id,ref.name));
  (users||[]).filter(user=>String(user?.role||'')==='editor').forEach(user=>{
    const coachName=user?.coachName||user?.name;
    push(user?.coachId||user?.id||user?.username,coachName);
    if(user?.id&&user?.coachId&&String(user.id).trim()!==String(user.coachId).trim())push(user.id,coachName);
    if(user?.username&&user?.coachId&&String(user.username).trim()!==String(user.coachId).trim())push(user.username,coachName);
  });
  return refs;
}
function assertUniqueCoachName(name,coaches,excludeId){
  const coach=String(name||'').trim();
  if(!coach)return;
  if((coaches||[]).some(c=>c.id!==excludeId&&sameCoachName(c.name,coach)))throw new Error('教练姓名已存在');
}
function mergeStoredAuthUser(tokenUser,storedUser){
  const source=storedUser||tokenUser||{};
  const role=source.role||tokenUser?.role||'';
  const name=source.name||tokenUser?.name||'';
  const id=source.id||tokenUser?.id||'';
  const username=source.username||tokenUser?.username||'';
  return {
    id,
    name,
    role,
    status:source.status||tokenUser?.status||'active',
    username,
    coachId:source.coachId||tokenUser?.coachId||(role==='editor'?(id||username):''),
    coachName:source.coachName||(role==='editor'?name:(tokenUser?.coachName||'')),
    matchPermissions:source.matchPermissions||source.permissions||tokenUser?.matchPermissions||tokenUser?.permissions||[]
  };
}
function assertAuthUserActive(user){
  if(String(user?.status||'active')==='inactive')throw new Error('账号已停用');
}
function buildWechatCode2SessionUrl(appid,secret,code){
  return `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
}
function extractWechatOpenId(data){
  if(data?.openid)return String(data.openid);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信登录失败：${msg}`);
}
function resolveWechatMiniConfig(kind='coach'){
  if(kind==='match'){
    return {
      appid: MATCH_MINIPROGRAM_APPID,
      secret: MATCH_MINIPROGRAM_SECRET,
      errorText: '缺少约球小程序密钥配置'
    };
  }
  return {
    appid: WECHAT_MINIPROGRAM_APPID,
    secret: WECHAT_MINIPROGRAM_SECRET,
    errorText: '缺少微信小程序密钥配置'
  };
}
async function fetchWechatSession(code,kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const url=buildWechatCode2SessionUrl(config.appid,config.secret,code);
  const res=await fetch(url);
  const data=await res.json();
  return data;
}
function buildWechatBoundUser(user,openid,now=new Date().toISOString()){
  return {...user,wechatOpenId:String(openid||''),wechatBoundAt:now};
}
function buildWechatUnboundUser(user){
  return {...user,wechatOpenId:'',wechatBoundAt:''};
}
function buildAdminUserView(u){
  return {
    id:u.id,
    name:u.name,
    phone:normalizePhone(u.phone||''),
    role:u.role,
    status:u.status||'active',
    coachId:u.coachId||'',
    coachName:u.coachName||'',
    matchPermissions:userMatchPermissions(u),
    wechatBound:!!u.wechatOpenId,
    wechatBoundAt:u.wechatBoundAt||''
  };
}
function buildWechatAccessTokenUrl(appid,secret){
  return `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
}
function extractWechatAccessToken(data){
  if(data?.access_token)return String(data.access_token);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信 access_token 获取失败：${msg}`);
}
async function fetchWechatAccessToken(kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const now=Date.now();
  const cached=wechatAccessTokenCacheByApp.get(config.appid);
  if(cached&&cached.expiresAt>now)return cached.token;
  const res=await fetch(buildWechatAccessTokenUrl(config.appid,config.secret));
  const data=await res.json();
  const token=extractWechatAccessToken(data);
  const ttlMs=Math.max(300000,((parseInt(data.expires_in)||7200)-300)*1000);
  wechatAccessTokenCacheByApp.set(config.appid,{token,expiresAt:now+ttlMs});
  return token;
}
async function fetchWechatPhoneNumber(code,kind='coach'){
  const token=await fetchWechatAccessToken(kind);
  const res=await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code})
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信手机号获取失败：${data.errmsg||data.errcode}`);
  const phone=data?.phone_info?.phoneNumber||data?.phone_info?.purePhoneNumber;
  if(!phone)throw new Error('微信未返回手机号');
  return assertPhone(phone);
}
function truncateWechatValue(value,max=20){
  const text=String(value||'').trim();
  return text.length>max?text.slice(0,max):text;
}
function scheduleNotifyLocation(schedule){
  return [schedule.campus,schedule.venue||schedule.externalVenueName||schedule.externalCourtName].filter(Boolean).join(' ')||'待确认';
}
function findWechatScheduleRecipient(schedule,users=[]){
  const coachId=String(schedule?.coachId||'').trim();
  const coachName=String(schedule?.coach||'').trim();
  return (users||[]).find(u=>{
    if(!u?.wechatOpenId)return false;
    if(String(u.role||'')!=='editor')return false;
    if(coachId&&String(u.coachId||'').trim()===coachId)return true;
    return coachName&&String(u.coachName||u.name||'').trim()===coachName;
  })||null;
}
function findWechatUserByOpenId(users=[],openid=''){
  const key=String(openid||'').trim();
  if(!key)return null;
  const matched=(users||[]).filter(u=>String(u?.wechatOpenId||'').trim()===key);
  return matched.find(u=>String(u?.role||'')==='editor')||matched[0]||null;
}
function buildScheduleSubscribeMessage({templateId,openid,schedule}){
  const start=String(schedule?.startTime||'').trim();
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      thing1:{value:truncateWechatValue(schedule?.courseType||'课程')},
      time2:{value:start},
      thing3:{value:truncateWechatValue(schedule?.studentName||'学员')},
      thing4:{value:truncateWechatValue(scheduleNotifyLocation(schedule))}
    }
  };
}
async function sendWechatSubscribeMessage(message){
  const token=await fetchWechatAccessToken();
  const res=await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(message)
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信订阅消息发送失败：${data.errmsg||data.errcode}`);
  return data;
}
async function notifyCoachScheduleCreated(schedule){
  if(!WECHAT_SCHEDULE_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const users=await getCachedScan(T_USERS).catch(()=>[]);
  const recipient=findWechatScheduleRecipient(schedule,users);
  if(!recipient)return {skipped:true,reason:'missing_openid'};
  const message=buildScheduleSubscribeMessage({templateId:WECHAT_SCHEDULE_TEMPLATE_ID,openid:recipient.wechatOpenId,schedule});
  await sendWechatSubscribeMessage(message);
  return {sent:true,userId:recipient.id};
}
function buildScheduleNotificationUpdate(schedule,result={},type='schedule_created',now=new Date().toISOString()){
  const sent=!!result.sent;
  const reason=String(result.reason||'').trim();
  const error=String(result.error||'').trim();
  const log={
    type,
    status:sent?'sent':'failed',
    channel:'wechat_subscribe',
    targetUserId:String(result.userId||'').trim(),
    reason,
    error,
    createdAt:now
  };
  return {
    notifyStatus:sent?'已通知教练':'通知失败',
    lastNotifyAt:now,
    lastNotifyError:sent?'':(error||reason||'通知失败'),
    notificationLogs:[...parseArr(schedule?.notificationLogs),log]
  };
}
function collectCourseReminderCandidates(rows=[],now=new Date()){
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const minMs=nowMs+45*60000;
  const maxMs=nowMs+75*60000;
  const active=(rows||[]).filter(s=>effectiveScheduleStatus(s,now)==='已排课'&&!s.courseReminderSentAt&&Number.isFinite(dateMs(s.startTime)));
  return active
    .filter(s=>{const start=dateMs(s.startTime);return start>=minMs&&start<=maxMs;})
    .sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime))
    .map(schedule=>{
      const sameCoach=(rows||[]).filter(s=>s.id!==schedule.id&&String(s.coach||'').trim()===String(schedule.coach||'').trim());
      const previous=sameCoach
        .filter(s=>Number.isFinite(dateMs(s.endTime))&&dateMs(s.endTime)<=dateMs(schedule.startTime))
        .sort((a,b)=>dateMs(b.endTime)-dateMs(a.endTime))[0]||null;
      const gap=previous?Math.round((dateMs(schedule.startTime)-dateMs(previous.endTime))/60000):null;
      const crossCampus=!!(previous&&gap!==null&&gap>=0&&gap<=90&&String(previous.campus||'')!==String(schedule.campus||''));
      return {schedule,previous,gap,crossCampus};
    });
}
function buildCourseReminderSubscribeMessage({templateId,openid,schedule,crossCampus=false}){
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      thing1:{value:truncateWechatValue(crossCampus?'跨校区，请预留通勤时间':'即将上课，请提前准备')},
      time2:{value:String(schedule?.startTime||'').trim()},
      thing3:{value:truncateWechatValue(schedule?.studentName||'学员')},
      thing4:{value:truncateWechatValue(schedule?.courseType||'课程')}
    }
  };
}
async function sendCourseReminders({now=new Date()}={}){
  if(!WECHAT_COURSE_REMINDER_TEMPLATE_ID)return {success:true,skipped:true,reason:'missing_template',sent:0,failed:0};
  const [rows,users]=await Promise.all([getCachedScan(T_SCHEDULE).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);
  const candidates=collectCourseReminderCandidates(rows,now);
  const result={success:true,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    const recipient=findWechatScheduleRecipient(item.schedule,users);
    if(!recipient){result.skipped++;result.items.push({id:item.schedule.id,skipped:true,reason:'missing_openid'});continue;}
    try{
      const message=buildCourseReminderSubscribeMessage({templateId:WECHAT_COURSE_REMINDER_TEMPLATE_ID,openid:recipient.wechatOpenId,schedule:item.schedule,crossCampus:item.crossCampus});
      await sendWechatSubscribeMessage(message);
      await put(T_SCHEDULE,item.schedule.id,{...item.schedule,courseReminderSentAt:new Date().toISOString(),courseReminderCrossCampus:item.crossCampus?'true':'false'});
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true,crossCampus:item.crossCampus});
    }catch(err){
      result.failed++;
      result.items.push({id:item.schedule.id,sent:false,error:err.message});
    }
  }
  return result;
}
function operatorAccountName(user){
  return String(user?.username||user?.id||user?.name||'').trim();
}
function normalizeOperatorAccountName(operator,users=[]){
  const raw=String(operator||'').trim();
  if(!raw)return '';
  const byUsername=(users||[]).find(u=>String(u?.username||'').trim()===raw||String(u?.id||'').trim()===raw);
  if(byUsername)return String(byUsername.username||byUsername.id||raw).trim();
  const byName=(users||[]).find(u=>String(u?.name||'').trim()===raw);
  return String(byName?.username||byName?.id||raw).trim();
}
function buildCoachRenameUpdates(oldName,newName,data,now=new Date().toISOString()){
  const oldCoach=String(oldName||'').trim();
  const nextCoach=String(newName||'').trim();
  const empty={classes:[],schedule:[],plans:[],users:[],feedbacks:[]};
  if(!oldCoach||!nextCoach||oldCoach===nextCoach)return empty;
  const touch=row=>({...row,updatedAt:now});
  return {
    classes:(data.classes||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach})),
    schedule:(data.schedule||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach})),
    plans:[],
    users:(data.users||[]).filter(r=>sameCoachName(r.coachName,oldCoach)).map(r=>touch({...r,coachName:nextCoach})),
    feedbacks:(data.feedbacks||[]).filter(r=>sameCoachName(r.coach,oldCoach)).map(r=>touch({...r,coach:nextCoach}))
  };
}
function assertCanDeleteCoachName(name,data,coachId=''){
  const coach=String(name||'').trim();
  const cid=String(coachId||'').trim();
  if(!coach&&!cid)return;
  const coachRefHit=r=>parseArr(r.coachNames).some(n=>sameCoachName(n,coach))||parseArr(r.coachIds).some(n=>sameCoachName(n,coach)||String(n||'').trim()===cid);
  const used=
    (data.classes||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.schedule||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.users||[]).some(r=>sameCoachName(r.coachName,coach))||
    (data.feedbacks||[]).some(r=>sameCoachName(r.coach,coach))||
    (data.packages||[]).some(coachRefHit)||
    (data.entitlements||[]).some(coachRefHit);
  if(used)throw new Error('该教练已有班次、排课、账号、反馈、课包或权益关联，不能直接删除');
}
async function loadCoachReferenceData(){
  const [classes,schedule,users,feedbacks,packages,entitlements]=await Promise.all([
    timed('scan classes for coach references',()=>scan(T_CLASSES).catch(()=>[])),
    timed('scan schedule for coach references',()=>scan(T_SCHEDULE).catch(()=>[])),
    timed('scan users for coach references',()=>scan(T_USERS).catch(()=>[])),
    timed('scan feedbacks for coach references',()=>withTimeout(getCachedFeedbacks(),3000,[])),
    timed('scan packages for coach references',()=>scan(T_PACKAGES).catch(()=>[])),
    timed('scan entitlements for coach references',()=>scan(T_ENTITLEMENTS).catch(()=>[]))
  ]);
  return {classes,schedule,plans:[],users,feedbacks,packages,entitlements};
}
async function applyCoachRename(oldName,newName){
  const updates=buildCoachRenameUpdates(oldName,newName,await loadCoachReferenceData());
  await Promise.all([
    ...updates.classes.map(r=>put(T_CLASSES,r.id,r)),
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.users.map(r=>put(T_USERS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r))
  ]);
  return updates;
}
function buildStudentIdentityUpdates(oldStudent,nextStudent,data,now=new Date().toISOString()){
  const id=oldStudent?.id||nextStudent?.id;
  const name=String(nextStudent?.name||'').trim();
  const phone=normalizePhone(nextStudent?.phone);
  const oldName=String(oldStudent?.name||'').trim();
  const oldPhone=normalizePhone(oldStudent?.phone);
  const empty={plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[],courts:[]};
  if(!id||(!name&&!phone))return empty;
  const changedName=String(oldStudent?.name||'')!==String(nextStudent?.name||'');
  const changedPhone=normalizePhone(oldStudent?.phone)!==phone;
  if(!changedName&&!changedPhone)return empty;
  const touch=row=>({...row,updatedAt:now});
  return {
    plans:[],
    schedule:(data.schedule||[]).filter(r=>parseArr(r.studentIds).includes(id)||r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    purchases:(data.purchases||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName,studentPhone:phone})),
    entitlements:(data.entitlements||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    feedbacks:(data.feedbacks||[]).filter(r=>r.studentId===id||parseArr(r.studentIds).includes(id)).map(r=>touch({...r,studentName:name||r.studentName})),
    courts:(data.courts||[]).filter(r=>{
      const ids=parseArr(r.studentIds);
      if(ids.includes(id)||r.studentId===id)return false;
      const exactName=oldName&&String(r.name||'').trim()===oldName;
      const exactPhone=oldPhone&&normalizePhone(r.phone)===oldPhone;
      return exactName||exactPhone;
    }).map(r=>touch({...r,studentId:id,studentIds:[id]}))
  };
}
async function loadStudentReferenceData(){
  const [schedule,purchases,entitlements,feedbacks,courts]=await Promise.all([
    getCachedScan(T_SCHEDULE).catch(()=>[]),
    scan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    withTimeout(getCachedFeedbacks(),3000,[]),
    getCachedScan(T_COURTS).catch(()=>[])
  ]);
  return {plans:[],schedule,purchases,entitlements,feedbacks,courts};
}
async function applyStudentIdentityUpdate(oldStudent,nextStudent){
  const updates=buildStudentIdentityUpdates(oldStudent,nextStudent,await loadStudentReferenceData());
  await Promise.all([
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.purchases.map(r=>put(T_PURCHASES,r.id,r)),
    ...updates.entitlements.map(r=>put(T_ENTITLEMENTS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r)),
    ...updates.courts.map(r=>put(T_COURTS,r.id,r))
  ]);
  return updates;
}
async function validateScheduleSave(nextRec,oldRec){
  const schedules=await timed('scan schedule for conflict check',()=>getCachedScan(T_SCHEDULE));
  validateScheduleConflicts(nextRec,schedules,nextRec.id);
  validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>getCachedScan(T_COURTS).catch(()=>[])));
  const oldDelta=scheduleLessonDelta(oldRec);
  const nextDelta=scheduleLessonDelta(nextRec);
  if(nextRec?.classId&&isBillableSchedule(nextRec)){
    const cls=await get(T_CLASSES,nextRec.classId);
    assertClassSchedulable(cls,nextRec);
    if(nextDelta){
    assertLessonCapacity(cls,oldDelta,nextDelta);
    }
  }
  return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
}

const DEFAULT_COACH_USERS=['baiyangj','chendand','yuekez','zhoux','sunmingy'];
const DEFAULT_CAMPUSES=[
  {id:'mabao',name:'顺义马坡',code:'mabao'},
  {id:'shilipu',name:'朝阳十里堡',code:'shilipu'},
  {id:'guowang',name:'朝阳国网',code:'guowang'},
  {id:'langang',name:'朝阳蓝色港湾',code:'langang'},
  {id:'chaojun',name:'朝珺私教',code:'chaojun'}
];
async function bootstrapDefaultUsers(){
  if(!ENABLE_DEFAULT_USER_BOOTSTRAP)return;
  if(!DEFAULT_ADMIN_BOOTSTRAP_PASSWORD)throw new Error('ENABLE_DEFAULT_USER_BOOTSTRAP=true 时必须配置 DEFAULT_ADMIN_BOOTSTRAP_PASSWORD');
  const us=[{id:'admin',name:'管理员',role:'admin',username:'admin'},{id:'baiyangj',name:'白杨静',role:'editor',username:'baiyangj'},{id:'chendand',name:'陈丹丹',role:'editor',username:'chendand'},{id:'yuekez',name:'岳克舟',role:'editor',username:'yuekez'},{id:'zhoux',name:'周欣',role:'editor',username:'zhoux'},{id:'sunmingy',name:'孙明玥',role:'editor',username:'sunmingy'}];
  const h=await bcrypt.hash(DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,10);
  for(const u of us){
    const ex=await get(T_USERS,u.id).catch(()=>null);
    if(!ex)await put(T_USERS,u.id,{...u,password:h,createdAt:new Date().toISOString()});
  }
}
async function ensureCoachBindings(){
  for(const id of DEFAULT_COACH_USERS){
    const u=await get(T_USERS,id).catch(()=>null);
    if(!u)continue;
    if(u.role==='editor'&&(!u.coachName||!String(u.coachName).trim())){
      await put(T_USERS,id,{...u,coachName:u.name||id,coachId:u.coachId||id,updatedAt:new Date().toISOString()});
    }
  }
}
async function ensureDefaultCampuses(){
  await mkTable(T_CAMPUSES);
  for(const campus of DEFAULT_CAMPUSES){
    const ex=await get(T_CAMPUSES,campus.id).catch(()=>null);
    if(!ex)await put(T_CAMPUSES,campus.id,{...campus,createdAt:new Date().toISOString()});
  }
}
async function putSeedRows(table,rows=[]){
  const chunkSize=20;
  for(let i=0;i<rows.length;i+=chunkSize){
    await Promise.all(rows.slice(i,i+chunkSize).map(row=>put(table,row.id,row)));
  }
}
function isMabaoFinanceSeedRow(row){
  return String(row?.seedTag||'').startsWith('mabao-finance-seed-');
}
function importedLedgerMonthKey(row){
  const sourceMonth=String(row?.sourceMonth||'').trim();
  if(sourceMonth)return sourceMonth;
  if(row?.scheduleId||Number(row?.lessonDelta)>=0)return '';
  const reason=String(row?.reason||'').trim();
  const match=reason.match(/^历史导入\s*(\d{1,2})月消课$/);
  if(!match)return '';
  const year=String(row?.relatedDate||row?.createdAt||'').slice(0,4);
  if(!/^\d{4}$/.test(year))return '';
  return `${year}-${String(match[1]).padStart(2,'0')}`;
}
function isImportedMonthlyLedgerRow(row){
  return !!importedLedgerMonthKey(row);
}
function importedLedgerDuplicateKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.reason||'',
    monthKey
  ].join('|');
}
function isCurrentImportedLedgerRow(row){
  return !!(importedLedgerMonthKey(row)&&String(row?.sourceMonth||'').trim()&&isMabaoFinanceSeedRow(row)&&String(row?.studentId||'').trim());
}
function importedLedgerExactKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.studentId,
    Number(row.lessonDelta)||0,
    row.action||'',
    row.reason||'',
    monthKey,
    row.sourceSheet||'',
    row.notes||''
  ].join('|');
}
function importedLedgerRowScore(row){
  return [
    String(row?.sourceMonth||'').trim()?1:0,
    isMabaoFinanceSeedRow(row)?1:0,
    String(row?.relatedDate||''),
    String(row?.createdAt||'')
  ];
}
function compareImportedLedgerRowScore(a,b){
  const as=importedLedgerRowScore(a),bs=importedLedgerRowScore(b);
  for(let i=0;i<as.length;i++){
    if(as[i]===bs[i])continue;
    return as[i]>bs[i]?1:-1;
  }
  return 0;
}
function collectDuplicateImportedLedgerIds(existingRows=[]){
  const grouped=new Map();
  const removeIds=[];
  (existingRows||[]).forEach(row=>{
    const key=importedLedgerDuplicateKey(row);
    if(!key)return;
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  });
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    const candidates=currentRows.length?currentRows:list;
    const currentIds=new Set(candidates.map(row=>row.id));
    list.forEach(row=>{if(!currentIds.has(row.id))removeIds.push(row.id);});
    const keepers=new Map();
    candidates.forEach(row=>{
      const key=importedLedgerExactKey(row)||importedLedgerDuplicateKey(row);
      const current=keepers.get(key);
      if(!current){
        keepers.set(key,row);
        return;
      }
      if(compareImportedLedgerRowScore(row,current)>0){
        removeIds.push(current.id);
        keepers.set(key,row);
        return;
      }
      removeIds.push(row.id);
    });
  });
  return [...new Set(removeIds.filter(Boolean))];
}
function filterImportedLedgerRowsForView(rows=[]){
  const grouped=new Map();
  const passthrough=[];
  for(const row of rows||[]){
    const key=importedLedgerDuplicateKey(row);
    if(!key){
      passthrough.push(row);
      continue;
    }
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  }
  const filtered=[...passthrough];
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    filtered.push(...(currentRows.length?currentRows:list));
  });
  return filtered;
}
function normalizeEntitlementLedgerRowsForView(rows=[]){
  const deduped=[];
  const seen=new Set();
  for(const row of filterImportedLedgerRowsForView(rows)||[]){
    const monthKey=importedLedgerMonthKey(row);
    const key=monthKey
      ? [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          monthKey,
          row.sourceSheet||'',
          row.notes||''
        ].join('|')
      : [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          row.scheduleId||'',
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          row.relatedDate||'',
          row.sourceMonth||'',
          row.sourceSheet||'',
          row.notes||''
        ].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    deduped.push(row);
  }
  const monthlyMap=new Map();
  const result=[];
  for(const row of deduped){
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey){
      result.push(row);
      continue;
    }
    const key=[row.entitlementId,row.purchaseId,row.studentId,row.reason||'',monthKey].join('|');
    const current=monthlyMap.get(key);
    if(!current){
      monthlyMap.set(key,{...row,sourceMonth:row.sourceMonth||monthKey});
      continue;
    }
    monthlyMap.set(key,{
      ...current,
      lessonDelta:(Number(current.lessonDelta)||0)+(Number(row.lessonDelta)||0),
      relatedDate:String(row.relatedDate||'')>String(current.relatedDate||'')?row.relatedDate:current.relatedDate,
      createdAt:String(row.createdAt||'')>String(current.createdAt||'')?row.createdAt:current.createdAt,
      sourceMonth:current.sourceMonth||monthKey
    });
  }
  return [...result,...monthlyMap.values()];
}
function collectMabaoSeedStaleRowIds(existingRows=[],seedRows=[],tag=''){
  const nextIds=new Set((seedRows||[]).map(row=>row.id));
  return (existingRows||[])
    .filter(row=>isMabaoFinanceSeedRow(row)&&(!nextIds.has(row.id)||String(row.seedTag||'')!==String(tag||'')))
    .map(row=>row.id);
}
function collectMabaoSeedImportedLedgerReplacementIds(existingRows=[],seedRows=[]){
  const seedKeys=new Set((seedRows||[]).map(row=>{
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey)return '';
    return [row.entitlementId,row.purchaseId,row.studentId,monthKey].join('|');
  }).filter(Boolean));
  if(!seedKeys.size)return [];
  return (existingRows||[])
    .filter(row=>!isMabaoFinanceSeedRow(row)&&isImportedMonthlyLedgerRow(row))
    .filter(row=>seedKeys.has([row.entitlementId,row.purchaseId,row.studentId,importedLedgerMonthKey(row)].join('|')))
    .map(row=>row.id);
}
async function replaceMabaoSeedRows(table,seedRows=[],tag=''){
  const staleIds=collectMabaoSeedStaleRowIds(await scan(table).catch(()=>[]),seedRows,tag);
  if(staleIds.length)await deleteSeedRows(table,staleIds);
  await putSeedRows(table,seedRows);
}
async function replaceMabaoSeedLedgerRows(seedRows=[],tag=''){
  const existingRows=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
  const staleIds=collectMabaoSeedStaleRowIds(existingRows,seedRows,tag);
  const replacementIds=collectMabaoSeedImportedLedgerReplacementIds(existingRows,seedRows);
  const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
  const removeIds=[...new Set([...staleIds,...replacementIds,...duplicateIds])];
  if(removeIds.length)await deleteSeedRows(T_ENTITLEMENT_LEDGER,removeIds);
  await putSeedRows(T_ENTITLEMENT_LEDGER,seedRows);
}
async function repairImportedLedgerDuplicates(){
  if(!ENABLE_IMPORTED_LEDGER_AUTO_REPAIR){
    if(RAW_ENABLE_IMPORTED_LEDGER_AUTO_REPAIR&&BOOTSTRAP_SAFETY_FLAGS.isProduction&&!BOOTSTRAP_SAFETY_FLAGS.allowProductionBootstrapWrites)logBlockedAutoWrite('repairImportedLedgerDuplicates');
    return 0;
  }
  const existingRows=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
  const duplicateIds=collectDuplicateImportedLedgerIds(existingRows);
  if(!duplicateIds.length)return 0;
  await deleteSeedRows(T_ENTITLEMENT_LEDGER,duplicateIds);
  return duplicateIds.length;
}
async function maybeRepairImportedLedgerDuplicates(){
  if(importedLedgerRepairChecked)return 0;
  importedLedgerRepairChecked=true;
  try{
    return await repairImportedLedgerDuplicates();
  }catch(err){
    importedLedgerRepairChecked=false;
    throw err;
  }
}
function hasCurrentMabaoSeedRows(existingRows=[],seedRows=[],tag=''){
  const seedIds=new Set((seedRows||[]).map(row=>row.id));
  const existingSeedRows=(existingRows||[]).filter(isMabaoFinanceSeedRow);
  return existingSeedRows.length===seedRows.length&&existingSeedRows.every(row=>seedIds.has(row.id)&&String(row.seedTag||'')===String(tag||''));
}
async function deleteSeedRows(table,ids=[]){
  const chunkSize=20;
  for(let i=0;i<ids.length;i+=chunkSize){
    await Promise.all(ids.slice(i,i+chunkSize).map(id=>del(table,id).catch(()=>null)));
  }
}
async function isMabaoFinanceSeedCurrent(){
  const tag=mabaoFinanceSeed?.meta?.tag;
  if(!tag)return false;
  const [purchases,entitlements,ledger]=await Promise.all([
    scan(T_PURCHASES).catch(()=>[]),
    scan(T_ENTITLEMENTS).catch(()=>[]),
    scan(T_ENTITLEMENT_LEDGER).catch(()=>[])
  ]);
  if(!hasCurrentMabaoSeedRows(purchases,mabaoFinanceSeed.purchases,tag))return false;
  if(!hasCurrentMabaoSeedRows(entitlements,mabaoFinanceSeed.entitlements,tag))return false;
  if(!hasCurrentMabaoSeedRows(ledger,mabaoFinanceSeed.entitlementLedger,tag))return false;
  if(collectMabaoSeedImportedLedgerReplacementIds(ledger,mabaoFinanceSeed.entitlementLedger).length)return false;
  for(const id of mabaoFinanceSeed?.meta?.deletePurchases||[]){
    const old=await get(T_PURCHASES,id).catch(()=>null);
    if(old)return false;
  }
  return true;
}
async function bootstrapMabaoFinanceSeed(){
  if(!ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP){
    if(RAW_ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP&&BOOTSTRAP_SAFETY_FLAGS.isProduction&&!BOOTSTRAP_SAFETY_FLAGS.allowProductionBootstrapWrites)logBlockedAutoWrite('bootstrapMabaoFinanceSeed');
    return;
  }
  if(await isMabaoFinanceSeedCurrent())return;
  const tag=mabaoFinanceSeed?.meta?.tag||'';
  await deleteSeedRows(T_PURCHASES,mabaoFinanceSeed?.meta?.deletePurchases||[]);
  await deleteSeedRows(T_PACKAGES,mabaoFinanceSeed?.meta?.deletePackages||[]);
  await replaceMabaoSeedRows(T_STUDENTS,mabaoFinanceSeed.students,tag);
  await replaceMabaoSeedRows(T_PRODUCTS,mabaoFinanceSeed.products,tag);
  await replaceMabaoSeedRows(T_PACKAGES,mabaoFinanceSeed.packages,tag);
  await replaceMabaoSeedRows(T_PURCHASES,mabaoFinanceSeed.purchases,tag);
  await replaceMabaoSeedRows(T_ENTITLEMENTS,mabaoFinanceSeed.entitlements,tag);
  await replaceMabaoSeedLedgerRows(mabaoFinanceSeed.entitlementLedger,tag);
}
async function listCampusesWithDefaults(){
  const rows=await getCachedScan(T_CAMPUSES).catch(()=>[]);
  return rows.length?rows:DEFAULT_CAMPUSES;
}
const courtSortIndexService=createCourtSortIndexService({
  tableName:T_COURT_SORT_INDEX,
  listPageDesc:listTableRowsDesc,
  put,
  del,
  scanAll:scan
});
async function syncCourtSortIndex(nextCourt,prevCourt=null){
  return courtSortIndexService.syncCourt(nextCourt,prevCourt);
}
async function rebuildCourtSortIndex(courts=[],options={}){
  return courtSortIndexService.rebuild(courts,options);
}
async function loadCourtSortPreviewPage({limit=20,cursor='',getCachedRow,tables}={}){
  const page=await courtSortIndexService.listPage({limit,cursor});
  const rows=await Promise.all((page.rows||[]).map(async(row)=>{
    const court=await getCachedRow(tables.courts,row.courtId).catch(()=>null);
    if(!court)return null;
    return {
      id:court.id,
      name:court.name||'',
      updatedAt:court.updatedAt||'',
      createdAt:court.createdAt||'',
      owner:court.owner||'',
      campus:court.campus||'',
      sortIndexId:row.id
    };
  }));
  return {items:rows.filter(Boolean),nextCursor:page.nextCursor||''};
}
const loadFinancePageData=createFinancePageDataLoader({
  listCampusesWithDefaults,
  getCachedScan,
  financeCourtProjectionFields:FINANCE_PAGE_COURT_PROJECTION_FIELDS,
  tables:{
    students:T_STUDENTS,
    schedule:T_SCHEDULE,
    entitlements:T_ENTITLEMENTS,
    entitlementLedger:T_ENTITLEMENT_LEDGER,
    financialLedger:T_FINANCIAL_LEDGER,
    coaches:T_COACHES,
    products:T_PRODUCTS,
    purchases:T_PURCHASES,
    packages:T_PACKAGES,
    courts:T_COURTS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipBenefitLedger:T_MEMBERSHIP_BENEFIT_LEDGER,
    membershipAccountEvents:T_MEMBERSHIP_ACCOUNT_EVENTS
  }
});
const fixedCourtAcceptanceSamples=require('../docs/performance-governance/15-样板页固定验收样本.json');
const loadCourtAccountListView=createCourtAccountListViewLoader({
  listCampusesWithDefaults,
  getCachedScan,
  fixedSampleAccounts:fixedCourtAcceptanceSamples,
  tables:{
    students:T_STUDENTS,
    courts:T_COURTS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipPlans:T_MEMBERSHIP_PLANS
  }
});
const loadCourtAccountListViewCompare=createCourtAccountListCompareLoader({
  listCampusesWithDefaults,
  getCachedScan,
  getCachedRowsByIds,
  tables:{
    students:T_STUDENTS,
    courts:T_COURTS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipPlans:T_MEMBERSHIP_PLANS
  },
  fixedSampleAccounts:fixedCourtAcceptanceSamples
});
const handlePageDataRequest=createPageDataHandler({
  init:()=>initRuntime.init(),
  getCachedScan,
  getCachedRow,
  courtListProjectionFields:COURT_ACCOUNT_LIST_PROJECTION_FIELDS,
  getCachedFeedbacks,
  withTimeout,
  loadFinancePageData,
  loadCourtAccountListView,
  loadCourtAccountListViewCompare,
  loadCourtSortPreviewPage,
  listCampusesWithDefaults,
  tables:{
    students:T_STUDENTS,
    schedule:T_SCHEDULE,
    entitlements:T_ENTITLEMENTS,
    entitlementLedger:T_ENTITLEMENT_LEDGER,
    financialLedger:T_FINANCIAL_LEDGER,
    coaches:T_COACHES,
    products:T_PRODUCTS,
    purchases:T_PURCHASES,
    packages:T_PACKAGES,
    courts:T_COURTS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipBenefitLedger:T_MEMBERSHIP_BENEFIT_LEDGER,
    membershipAccountEvents:T_MEMBERSHIP_ACCOUNT_EVENTS,
    membershipPlans:T_MEMBERSHIP_PLANS,
    pricePlans:T_PRICE_PLANS,
    classes:T_CLASSES,
    users:T_USERS
  },
  normalizeMembershipPlanViewRecord,
  normalizeMembershipOrderViewRecord,
  runMembershipReconcile,
  buildCoachRefs,
  filterLoadAllForUser,
  decorateWorkbenchStudents,
  decorateWorkbenchFeedbacks,
  decorateWorkbenchScheduleRows,
  decorateWorkbenchClasses,
  buildWorkbenchStats
});
const startupSideEffects=createStartupSideEffectsRunner({
  mkTable,
  bootstrapDefaultUsers,
  ensureDefaultCampuses,
  ensureCoachBindings,
  bootstrapMabaoFinanceSeed,
  repairImportedLedgerDuplicates,
  syncDefaultPricePlans
});
const initRuntime=createInitRuntime({
  env:process.env,
  logger:console,
  requiredEnvVars:REQUIRED_ENV_VARS,
  rawFlags:{
    enableDefaultUserBootstrap:RAW_ENABLE_DEFAULT_USER_BOOTSTRAP,
    enableTableBootstrap:RAW_ENABLE_TABLE_BOOTSTRAP,
    enableDefaultPricePlanBootstrap:RAW_ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP,
    enableMabaoFinanceSeedBootstrap:RAW_ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP,
    enableImportedLedgerAutoRepair:RAW_ENABLE_IMPORTED_LEDGER_AUTO_REPAIR
  },
  flags:BOOTSTRAP_SAFETY_FLAGS,
  enabledFlags:{
    enableDefaultUserBootstrap:ENABLE_DEFAULT_USER_BOOTSTRAP,
    enableTableBootstrap:ENABLE_TABLE_BOOTSTRAP,
    enableRuntimeTableEnsure:ENABLE_RUNTIME_TABLE_ENSURE,
    enableDefaultPricePlanBootstrap:ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP,
    enableMabaoFinanceSeedBootstrap:ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP,
    enableImportedLedgerAutoRepair:ENABLE_IMPORTED_LEDGER_AUTO_REPAIR
  },
  startupSideEffects,
  runtimeEnsuredTables:RUNTIME_ENSURED_TABLES,
  seedEnsureTables:[T_STUDENTS,T_PRODUCTS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER],
  bootstrapTables:[T_USERS,T_COURTS,T_COURT_SORT_INDEX,T_STUDENTS,T_PRODUCTS,T_SCHEDULE,T_COACHES,T_CLASSES,T_CLASS_NOS,T_CAMPUSES,T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_PRICE_PLANS],
  assertTableStoreTarget,
  logBlockedAutoWrite,
  prewarmHotScanCache
});
const scheduleInitInBackground=()=>initRuntime.scheduleInitInBackground();
const init=()=>initRuntime.init();

scheduleInitInBackground();

function sendJson(res,body,code=200){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.status(code).json(body);
}
function authUser(req){const token=(req.headers.authorization||'').replace('Bearer ','');if(!token)return null;try{return jwt.verify(token,JWT_SECRET);}catch{return null;}}
function requireAdminUser(user){
  if(user?.type==='match_user')throw new Error('无管理端权限');
  if(!user?.id)throw new Error('未登录');
  return user;
}
function parsePermissionList(value){
  if(Array.isArray(value))return value.map(x=>String(x||'').trim()).filter(Boolean);
  return String(value||'').split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
}
function userMatchPermissions(user){
  const permissions=new Set(parsePermissionList(user?.permissions||user?.matchPermissions));
  if(user?.role==='admin')permissions.add('match_ops'),permissions.add('match_finance');
  if(user?.matchOps)permissions.add('match_ops');
  if(user?.matchFinance)permissions.add('match_finance');
  return [...permissions].filter(x=>['match_ops','match_finance'].includes(x));
}
function requireMatchAdminPermission(user,permission){
  requireAdminUser(user);
  const permissions=userMatchPermissions(user);
  if(permissions.includes(permission))return true;
  throw new Error(permission==='match_finance'?'无约球财务权限':'无约球运营权限');
}
function requireMatchUser(req){
  const user=authUser(req);
  if(!user||user.type!=='match_user')throw new Error('未登录');
  return user;
}
function canMatchUserCreateByAdminUser(adminUser){
  if(!adminUser)return false;
  const permissions=userMatchPermissions(adminUser);
  return adminUser.role==='admin'||permissions.includes('match_ops');
}
function findAdminUserByPhone(users=[],phone=''){
  const normalizedPhone=normalizePhone(phone);
  if(!normalizedPhone)return null;
  const list=Array.isArray(users)?users:[];
  const matchedByPhone=list.find((user)=>normalizePhone(user?.phone||'')===normalizedPhone);
  if(matchedByPhone)return matchedByPhone;
  return list.find((user)=>String(user?.id||'').trim()===normalizedPhone)||null;
}
function normalizePhone(value){return String(value||'').replace(/\s+/g,'').trim();}
function isValidCnPhone(value){return /^1[3-9]\d{9}$/.test(normalizePhone(value));}
function assertPhone(value){
  const phone=normalizePhone(value);
  if(phone&&!isValidCnPhone(phone))throw new Error('手机号格式不正确');
  return phone;
}
function normalizeMoney(value){
  const n=parseFloat(String(value??'').replace(/,/g,''));
  return Number.isFinite(n)?n:0;
}
function defaultMabaoPricePlans(){
  const venue=[
    ['工作日','06:00','08:00',100],
    ['工作日','08:00','16:00',140],
    ['工作日','16:00','20:00',220],
    ['工作日','20:00','22:00',180],
    ['周末节假日','06:00','08:00',100],
    ['周末节假日','08:00','22:00',220]
  ].map(([dateType,startTime,endTime,unitPrice])=>({type:'venue_rate',campus:'mabao',venueSpaceType:'室内',dateType,startTime,endTime,unitPrice,status:'active',notes:'默认马坡场地价'}));
  const products=[
    ['青少年1v1私教体验课','体验课','lesson','1小时',60,199],
    ['成人1v1私教体验课','体验课','lesson','1小时',60,239],
    ['青少年1v4小班课体验课','小班课','lesson','1-2小时',0,99],
    ['成人1v4小班课体验课','小班课','lesson','1-2小时',0,129],
    ['王牌专项：2.5~3.0多球实战特训','体验课','lesson','1-2小时',0,200],
    ['发接发与实战练习','体验课','lesson','1-2小时',0,260],
    ['削球实战训练','体验课','lesson','1-2小时',0,260],
    ['截击入门训练','体验课','lesson','1-2小时',0,260],
    ['疯狂多球训练','体验课','lesson','1-2小时',0,260],
    ['新客福利 约球双打局 2H','订场券','court','2小时',120,70],
    ['晚场福利 场地预定 1H','订场券','court','1小时',60,180],
    ['新客福利 场地预定 2H','订场券','court','2小时',120,240]
  ].map(([productName,productType,businessType,durationLabel,durationMinutes,salePrice])=>({type:'channel_product',channel:'大众点评',productName,productType,businessType,durationLabel,durationMinutes,salePrice,status:'active',notes:'默认大众点评商品价'}));
  return [...venue,...products];
}
function normalizeDefaultPriceName(name){
  return String(name||'').replace(/[：:\s]/g,'').replace(/体验课$/,'体验').trim();
}
function assertPricePlanInput(plan){
  const type=String(plan?.type||'').trim();
  if(!['venue_rate','channel_product'].includes(type))throw new Error('请选择价格类型');
  if(type==='venue_rate'){
    if(!String(plan.campus||'').trim())throw new Error('请选择校区');
    if(!String(plan.venueSpaceType||'').trim())throw new Error('请选择场地类型');
    if(!String(plan.dateType||'').trim())throw new Error('请选择日期类型');
    const start=clockMin(plan.startTime),end=clockMin(plan.endTime);
    if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('请填写有效时间段');
    if(end<=start)throw new Error('结束时间必须晚于开始时间');
    if(normalizeMoney(plan.unitPrice)<=0)throw new Error('场地价格必须大于 0');
  }
  if(type==='channel_product'){
    if(!String(plan.channel||'').trim())throw new Error('请选择渠道');
    if(!String(plan.productName||'').trim())throw new Error('请填写渠道商品名称');
    if(!String(plan.productType||'').trim())throw new Error('请选择商品类型');
    if(!String(plan.businessType||'').trim())throw new Error('请选择关联业务');
    if(String(plan.businessType||'').trim()==='court'&&(parseInt(plan.durationMinutes)||0)<=0&&!String(plan.durationLabel||'').trim())throw new Error('订场券请填写时长');
    if(normalizeMoney(plan.salePrice)<=0)throw new Error('渠道商品售价必须大于 0');
  }
}
function normalizePricePlan(input={},id=uuidv4(),now=new Date().toISOString(),old=null){
  const type=String(input.type||old?.type||'').trim();
  const base={
    id,
    type,
    campus:String(input.campus??old?.campus??'').trim(),
    venueSpaceType:String(input.venueSpaceType??old?.venueSpaceType??'室内').trim()||'室内',
    dateType:String(input.dateType??old?.dateType??'').trim(),
    startTime:String(input.startTime??old?.startTime??'').trim(),
    endTime:String(input.endTime??old?.endTime??'').trim(),
    unitPrice:normalizeMoney(input.unitPrice??old?.unitPrice),
    channel:String(input.channel??old?.channel??'').trim(),
    productName:String(input.productName??old?.productName??'').trim(),
    productType:String(input.productType??old?.productType??'').trim(),
    businessType:String(input.businessType??old?.businessType??'').trim(),
    durationMinutes:parseInt(input.durationMinutes??old?.durationMinutes)||0,
    durationLabel:String(input.durationLabel??old?.durationLabel??'').trim(),
    salePrice:normalizeMoney(input.salePrice??old?.salePrice),
    status:String(input.status??old?.status??'active').trim()||'active',
    effectiveFrom:String(input.effectiveFrom??old?.effectiveFrom??'').trim(),
    effectiveTo:String(input.effectiveTo??old?.effectiveTo??'').trim(),
    notes:String(input.notes??old?.notes??'').trim(),
    createdAt:old?.createdAt||input.createdAt||now,
    updatedAt:now
  };
  if(base.type==='venue_rate'){
    base.channel='';
    base.productName='';
    base.productType='';
    base.businessType='';
    base.durationMinutes=0;
    base.durationLabel='';
    base.salePrice=0;
  }
  if(base.type==='channel_product'){
    base.campus='';
    base.venueSpaceType='';
    base.dateType='';
    base.startTime='';
    base.endTime='';
    base.unitPrice=0;
  }
  assertPricePlanInput(base);
  return base;
}
async function syncDefaultPricePlans(){
  const existing=await scan(T_PRICE_PLANS).catch(()=>[]);
  const now=new Date().toISOString();
  for(const row of defaultMabaoPricePlans()){
    const same=existing.find(p=>{
      if(p.type!==row.type)return false;
      if(row.type==='venue_rate')return p.campus===row.campus&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
      return p.channel===row.channel&&normalizeDefaultPriceName(p.productName)===normalizeDefaultPriceName(row.productName);
    });
    const normalized=normalizePricePlan(row,same?.id||uuidv4(),now,same||null);
    await put(T_PRICE_PLANS,normalized.id,normalized);
    if(!same)existing.push(normalized);
  }
}
function priceDateType(date){
  const d=new Date(`${dateKey(date)}T00:00:00`);
  const day=d.getDay();
  return day===0||day===6?'周末节假日':'工作日';
}
function roundMoney(n){return Math.round((Number(n)||0)*100)/100;}
function quoteVenuePrice(pricePlans=[],input={}){
  const campus=String(input.campus||'').trim();
  const ds=dateKey(input.date||input.startTime);
  const dateType=String(input.dateType||'').trim()||priceDateType(ds);
  const start=clockMin(input.startTime);
  const end=clockMin(input.endTime);
  if(!campus)throw new Error('请选择校区');
  if(!ds)throw new Error('请选择日期');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('请填写有效时间段');
  const candidates=(pricePlans||[]).filter(plan=>{
    if(plan?.type!=='venue_rate'||plan.status==='inactive')return false;
    if(String(plan.campus||'').trim()!==campus)return false;
    if(String(plan.dateType||'').trim()!==dateType)return false;
    if(plan.effectiveFrom&&ds<plan.effectiveFrom)return false;
    if(plan.effectiveTo&&ds>plan.effectiveTo)return false;
    return true;
  }).sort((a,b)=>clockMin(a.startTime)-clockMin(b.startTime));
  let cursor=start;
  const segments=[];
  while(cursor<end){
    const hit=candidates.find(plan=>{
      const ps=clockMin(plan.startTime),pe=clockMin(plan.endTime);
      return Number.isFinite(ps)&&Number.isFinite(pe)&&cursor>=ps&&cursor<pe;
    });
    if(!hit)throw new Error('未找到匹配的场地价格');
    const segmentEnd=Math.min(end,clockMin(hit.endTime));
    const hours=(segmentEnd-cursor)/60;
    const amount=roundMoney(hours*normalizeMoney(hit.unitPrice));
    segments.push({pricePlanId:hit.id,startTime:minToClock(cursor),endTime:minToClock(segmentEnd),unitPrice:normalizeMoney(hit.unitPrice),amount});
    cursor=segmentEnd;
  }
  const originalAmount=roundMoney(segments.reduce((sum,row)=>sum+row.amount,0));
  const rawDiscount=parseFloat(input.memberDiscount);
  const memberDiscount=Number.isFinite(rawDiscount)&&rawDiscount>0?rawDiscount:1;
  const systemAmount=roundMoney(originalAmount*memberDiscount);
  return {pricePlanIds:[...new Set(segments.map(s=>s.pricePlanId))],dateType,systemAmount,originalAmount,memberDiscount,segments};
}
function minToClock(min){
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}
function hasMoneyValue(value){
  return value!==undefined&&value!==null&&String(value).trim()!=='';
}
const MEMBERSHIP_BENEFIT_FIELD_MAP=[
  {field:'publicLessonCount',code:'publicLesson',label:'大师公开课'},
  {field:'stringingLaborCount',code:'stringingLabor',label:'穿线免手工费'},
  {field:'ballMachineCount',code:'ballMachine',label:'发球机免费'},
  {field:'level2PartnerCount',code:'level2Partner',label:'国家二级运动员陪打'},
  {field:'designatedCoachPartnerCount',code:'designatedCoachPartner',label:'指定教练陪打'}
];
function normalizeMembershipBenefitTemplate(input={},fallbackTemplate={}){
  const rawTemplate=input?.benefitTemplate&&typeof input.benefitTemplate==='object'?input.benefitTemplate:{};
  const fallback=fallbackTemplate&&typeof fallbackTemplate==='object'?fallbackTemplate:{};
  const template={};
  MEMBERSHIP_BENEFIT_FIELD_MAP.forEach(({field,code,label})=>{
    const count=parseInt(
      input?.[field]??
      rawTemplate?.[code]?.count??
      fallback?.[code]?.count??
      0
    )||0;
    if(count<=0)return;
    template[code]={
      label,
      unit:'次',
      count
    };
    if(code==='designatedCoachPartner'){
      const designatedCoachIds=[...new Set(parseArr(
        input?.designatedCoachIds??
        rawTemplate?.[code]?.designatedCoachIds??
        fallback?.[code]?.designatedCoachIds
      ).map(x=>String(x||'').trim()).filter(Boolean))];
      if(designatedCoachIds.length)template[code].designatedCoachIds=designatedCoachIds;
    }
  });
  const customBenefits=parseArr(input?.customBenefits??rawTemplate?.customBenefits??fallback?.customBenefits).map(item=>{
    const count=parseInt(item?.count)||0;
    if(count<=0)return null;
    return {
      label:String(item?.label||'').trim()||'自定义权益',
      unit:String(item?.unit||'次').trim()||'次',
      count
    };
  }).filter(Boolean);
  if(customBenefits.length)template.customBenefits=customBenefits;
  return template;
}
function hasMembershipBenefitSnapshot(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
}
function addMonthsKey(ds,months){
  const [y,m,d0]=String(ds||'').slice(0,10).split('-').map(n=>parseInt(n)||0);
  const d=new Date(Date.UTC(y,m-1,d0));
  d.setUTCMonth(d.getUTCMonth()+(parseInt(months)||0));
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
function normalizeStudentIds(input){
  const ids=Array.isArray(input.studentIds)?input.studentIds:(input.studentId?[input.studentId]:[]);
  return [...new Set(ids.map(x=>String(x||'').trim()).filter(Boolean))];
}
function extractDepositAmountFromText(text){
  const raw=String(text||'');
  const m=raw.match(/已储值\s*([0-9]+(?:\.[0-9]+)?)/);
  return m?normalizeMoney(m[1]):0;
}
function normalizeFinancePriceSnapshot(row){
  const hasSnapshot=row.priceMode||row.pricePlanId||row.systemAmount!==undefined||row.finalAmount!==undefined;
  if(!hasSnapshot)return row;
  const systemAmount=normalizeMoney(row.systemAmount);
  const finalAmount=normalizeMoney(row.finalAmount!==undefined?row.finalAmount:row.amount);
  const priceOverridden=systemAmount>0&&finalAmount>0&&systemAmount!==finalAmount;
  const overrideReason=String(row.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  return {
    ...row,
    priceMode:String(row.priceMode||'manual').trim(),
    pricePlanId:String(row.pricePlanId||'').trim(),
    channel:String(row.channel||'').trim(),
    channelOrderNo:String(row.channelOrderNo||'').trim(),
    redeemCode:String(row.redeemCode||'').trim(),
    systemAmount,
    finalAmount,
    amount:finalAmount||normalizeMoney(row.amount),
    priceOverridden,
    overrideReason,
    memberDiscount:normalizeMoney(row.memberDiscount||1)||1
  };
}
function courtFinanceRevenueBucket(row){
  if(row?.category==='内部占用')return '内部占用';
  if(row?.category!=='订场')return '';
  const method=String(row?.payMethod||'').trim();
  if(method==='储值扣款')return '储值扣款';
  if(method==='代用户订场')return '代用户订场';
  return '现场收款';
}
function normalizeCourtHistory(history){
  if(!Array.isArray(history))return[];
  return history.map((h)=> {
    const priced=normalizeFinancePriceSnapshot(h);
    const amountRaw=normalizeMoney(priced.amount);
    const type=h.type||'消费';
    const payMethod=h.payMethod||(type==='消费'&&amountRaw<0?'储值扣款':'');
    const revenueBucket=courtFinanceRevenueBucket({...priced,type,payMethod});
    const isInternalOccupancy=type==='消费'&&priced.category==='内部占用';
    const recordedAt=String(priced.recordedAt||priced.createdAt||'').trim();
    const occurredDate=String(priced.occurredDate||priced.date||'').slice(0,10);
    return {
      ...priced,
      type,
      payMethod,
      category:priced.category||'其他',
      studentId:priced.studentId||'',
      amount:isInternalOccupancy?0:Math.abs(amountRaw),
      bonusAmount:normalizeMoney(priced.bonusAmount),
      ...(occurredDate&&recordedAt?{occurredDate}:{}),
      ...(recordedAt?{recordedAt}:{}),
      ...(revenueBucket?{revenueBucket}:{})
    };
  });
}
function isMembershipExpiryClearRow(row){
  return row?.type==='冲正'&&row?.category==='会员到期清零';
}
function computeCourtFinance(input){
  const history=normalizeCourtHistory(input.history);
  if(!history.length){
    return {
      balance:normalizeMoney(input.balance),
      totalDeposit:normalizeMoney(input.totalDeposit),
      spentAmount:normalizeMoney(input.spentAmount),
      receivedAmount:normalizeMoney(input.receivedAmount!=null?input.receivedAmount:input.totalDeposit),
      storedValueSpent:normalizeMoney(input.storedValueSpent),
      directPaidSpent:normalizeMoney(input.directPaidSpent)
    };
  }
  const totals={balance:0,totalDeposit:0,spentAmount:0,receivedAmount:0,storedValueSpent:0,directPaidSpent:0};
  for(const h of history){
    const amount=normalizeMoney(h.amount);
    const bonus=normalizeMoney(h.bonusAmount);
    if(h.type==='消费'&&h.category==='内部占用')continue;
    if(amount<=0)throw new Error('流水金额必须大于0');
    if(h.type==='充值'){
      totals.totalDeposit+=amount;
      totals.receivedAmount+=amount;
      totals.balance+=amount+bonus;
      continue;
    }
    if(h.type==='消费'){
      totals.spentAmount+=amount;
      if(h.payMethod==='储值扣款'){
        totals.storedValueSpent+=amount;
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能使用储值扣款');
      }else{
        totals.directPaidSpent+=amount;
        totals.receivedAmount+=amount;
      }
      continue;
    }
    if(h.type==='退款'){
      if(h.payMethod==='储值退款'){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能退款');
      }
      totals.receivedAmount-=amount;
      if(totals.receivedAmount<0)throw new Error('退款金额超过累计实收');
      continue;
    }
    if(h.type==='冲正'){
      if(isMembershipExpiryClearRow(h)){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能执行会员到期清零');
        continue;
      }
      totals.spentAmount-=amount;
      if(totals.spentAmount<0)throw new Error('冲正金额超过累计消费');
      if(h.payMethod==='储值扣款'){
        totals.storedValueSpent-=amount;
        if(totals.storedValueSpent<0)throw new Error('冲正金额超过储值扣款消费');
        totals.balance+=amount;
      }else{
        totals.directPaidSpent-=amount;
        if(totals.directPaidSpent<0)throw new Error('冲正金额超过单次支付消费');
        totals.receivedAmount-=amount;
        if(totals.receivedAmount<0)throw new Error('冲正金额超过累计实收');
      }
      continue;
    }
  }
  Object.keys(totals).forEach(k=>{totals[k]=Math.round(totals[k]*100)/100;});
  return totals;
}
function buildCachedCourtFinanceFields(input){
  const finance=computeCourtFinance(input||{history:[]});
  return {
    cachedBalance:normalizeMoney(finance.balance),
    cachedTotalDeposit:normalizeMoney(finance.totalDeposit),
    cachedTotalSpent:normalizeMoney(finance.spentAmount),
    cachedTotalReceived:normalizeMoney(finance.receivedAmount)
  };
}
function summarizeCourtFinanceRevenue(input){
  const history=normalizeCourtHistory(input?.history||[]);
  const summary={
    storedValueBooking:0,
    onsiteBooking:0,
    proxyBooking:0,
    matchBooking:0,
    internalOccupancyCount:0,
    internalOccupancyAmount:0,
    cashReceived:0,
    confirmedRevenue:0,
    pendingRevenue:0,
    bookingUsageAmount:0,
    paidBookingCount:0
  };
  for(const h of history){
    if(!['消费','退款','冲正'].includes(h.type))continue;
    const amount=normalizeMoney(h.amount);
    if(h.category==='内部占用'){
      if(h.type!=='消费')continue;
      summary.internalOccupancyCount+=1;
      continue;
    }
    if(h.category!=='订场')continue;
    const direction=h.type==='消费'?1:-1;
    const bucket=h.revenueBucket||courtFinanceRevenueBucket(h);
    const signedAmount=amount*direction;
    if(h.type==='消费')summary.paidBookingCount+=1;
    if(h.sourceCategory==='约球订场')summary.matchBooking+=signedAmount;
    if(bucket==='储值扣款')summary.storedValueBooking+=signedAmount;
    else if(bucket==='代用户订场')summary.proxyBooking+=signedAmount;
    else summary.onsiteBooking+=signedAmount;
  }
  summary.cashReceived=summary.onsiteBooking+summary.proxyBooking;
  summary.confirmedRevenue=summary.storedValueBooking+summary.onsiteBooking;
  summary.pendingRevenue=summary.proxyBooking;
  summary.bookingUsageAmount=summary.storedValueBooking+summary.onsiteBooking+summary.proxyBooking;
  Object.keys(summary).forEach(k=>{summary[k]=Math.round(summary[k]*100)/100;});
  return summary;
}
function isoDateKey(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const ms=Date.parse(raw);
  return Number.isNaN(ms)?'':new Date(ms).toISOString().slice(0,10);
}
async function getCourtRecordForTest(id){
  return getCachedRow(T_COURTS,id);
}
async function removeMatchCourtFinanceRowsForTest(matchIdPrefix){
  const account=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  if(!account)return {removed:0};
  const history=normalizeCourtHistory(account.history);
  const prefix=String(matchIdPrefix||'');
  const nextHistory=history.filter(row=>{
    const haystack=[row.matchId,row.note,row.matchUserId,row.id].map(x=>String(x||'')).join(' ');
    return !haystack.includes(prefix);
  });
  const removed=history.length-nextHistory.length;
  if(removed>0){
    const next=normalizeCourtRecord({...account,history:nextHistory,updatedAt:new Date().toISOString()});
    await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  }
  return {removed};
}
function assertCanDeleteProduct(productId,classes,packages=[]){
  if((classes||[]).some(c=>c.productId===productId))throw new Error('该课程产品已有班次使用，不能删除');
  if((packages||[]).some(p=>p.productId===productId))throw new Error('该课程产品已有售卖课包使用，不能删除');
}
function assertCanDeleteClass(classId,schedules){
  if((schedules||[]).some(s=>s.classId===classId))throw new Error('该班次已有排课，不能删除');
}
function assertCanDeletePackage(packageId,purchases){
  if((purchases||[]).some(p=>p.packageId===packageId))throw new Error('该课包已有购买记录，不能删除，请停用');
}
function assertCanVoidPurchase(purchaseId,entitlements,ledger){
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  if((ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))throw new Error('该购买记录已有课时消耗，不能直接作废');
}
function assertCanDeleteEntitlement(entitlementId,ledger,entitlements=[]){
  if((ledger||[]).some(l=>l.entitlementId===entitlementId))throw new Error('该课包余额已有消耗记录，不能删除');
  if((entitlements||[]).some(e=>e.id===entitlementId&&e.purchaseId))throw new Error('该课包余额来自购买记录，不能删除');
}
function sameStudentIds(a,b){
  const x=parseArr(a).filter(Boolean).sort();
  const y=parseArr(b).filter(Boolean).sort();
  return x.length===y.length&&x.every((id,i)=>id===y[i]);
}
function classRemainingLessonsForRecord(cls){
  return parseLessonValue(cls?.totalLessons)-parseLessonValue(cls?.usedLessons);
}
function assertCanWriteClass(user){
  if(user?.role!=='admin')throw new Error('无权限');
}
function nextClassNoFromClasses(classes){
  const nums=(classes||[]).map(c=>{
    const m=String(c?.classNo||'').match(/^CLS(\d+)$/);
    return m?parseInt(m[1]):0;
  });
  const next=(nums.length?Math.max(...nums):0)+1;
  return 'CLS'+String(next).padStart(4,'0');
}
function isClassNoReservationConflict(err){
  return /condition|expect|exist|OTSConditionCheckFail|ConditionCheck/i.test(String(err?.code||'')+' '+String(err?.message||err||''));
}
async function reserveNextClassNo(existingClasses,user,now){
  let base=existingClasses||[];
  for(let attempt=0;attempt<8;attempt++){
    const classNo=nextClassNoFromClasses(base);
    try{
      await putIfAbsent(T_CLASS_NOS,classNo,{id:classNo,classNo,createdBy:user?.name||'',createdAt:now});
      return classNo;
    }catch(err){
      if(isTableMissingError(err)){await mkTable(T_CLASS_NOS);continue;}
      if(!isClassNoReservationConflict(err))throw err;
      base=await scan(T_CLASSES).catch(()=>base);
      base=[...base,{classNo}];
    }
  }
  throw new Error('班次编号生成失败，请重试');
}
function validateClassInput(input,product){
  if(!input?.productId)throw new Error('请选择课程产品');
  const total=parseLessonValue(input.totalLessons,Number.NaN);
  const used=parseLessonValue(input.usedLessons);
  if(Number.isNaN(total)||total<0)throw new Error('应上课时不能小于0');
  if(used<0)throw new Error('已上课时不能小于0');
  if(used>total)throw new Error('已上课时不能大于应上课时');
  const studentIds=parseArr(input.studentIds).filter(Boolean);
  const max=parseInt(product?.maxStudents)||0;
  if(max>0&&studentIds.length>max)throw new Error(`选择学员数超过课程产品人数上限：最多 ${max} 人`);
  if(input.startDate&&input.endDate&&String(input.endDate)<String(input.startDate))throw new Error('结束日期不能早于开始日期');
}
function buildClassCreateRecord(body,{id,classNo,user,now}){
  const { productCourseType='', ...rest }=body||{};
  const productName=rest.productName||'';
  return {
    ...rest,
    id,
    classNo,
    className:classNo+'-'+productName,
    productName,
    courseType:firstNonEmptyText(rest.courseType,productCourseType),
    studentIds:parseArr(rest.studentIds),
    scheduleDays:parseArr(rest.scheduleDays),
    totalLessons:parseLessonValue(rest.totalLessons),
    usedLessons:0,
    status:rest.status||'已排班',
    createdBy:user?.name||'',
    createdAt:now,
    updatedAt:now
  };
}
function buildClassUpdateRecord(oldClass,body,{product,now}){
  const classNo=oldClass?.classNo||body.classNo||'';
  const productName=product?.name||body.productName||oldClass?.productName||'';
  return {
    ...oldClass,
    ...body,
    id:oldClass?.id||body.id,
    classNo,
    className:classNo&&productName?classNo+'-'+productName:(body.className||oldClass?.className||''),
    productName,
    courseType:firstNonEmptyText(body.courseType,product?.type,oldClass?.courseType),
    studentIds:parseArr(body.studentIds),
    scheduleDays:parseArr(body.scheduleDays),
    totalLessons:parseLessonValue(body.totalLessons),
    usedLessons:parseLessonValue(oldClass?.usedLessons),
    status:body.status||oldClass?.status||'已排班',
    updatedAt:now
  };
}
function firstNonEmptyText(...values){
  for(const value of values){
    const text=String(value??'').trim();
    if(text)return text;
  }
  return '';
}
function formatClassScheduleDaysText(days){
  const list=parseArr(days).map(item=>String(item||'').trim()).filter(Boolean);
  if(!list.length)return '';
  return `每${list.join('、')}`;
}
function formatClassScheduleTimeFromLesson(lesson){
  const start=String(lesson?.startTime||'').trim();
  const end=String(lesson?.endTime||'').trim();
  if(!start||!end)return '';
  const startDate=new Date(start.replace(' ','T'));
  const endDate=new Date(end.replace(' ','T'));
  if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))return '';
  const weekDays=['周日','周一','周二','周三','周四','周五','周六'];
  const startText=`${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`;
  const endText=`${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`;
  return `${weekDays[startDate.getDay()]} ${startText} - ${endText}`;
}
function decorateWorkbenchClasses(classes,schedule){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(classes)?classes:[]).map(item=>{
    const classLessons=lessons
      .filter(lesson=>String(lesson?.status||'')!=='已取消')
      .filter(lesson=>String(lesson?.classId||'').trim()===String(item?.id||'').trim())
      .sort((a,b)=>String(a?.startTime||'').localeCompare(String(b?.startTime||'')));
    const scheduleTime=firstNonEmptyText(
      classLessons[0]&&formatClassScheduleTimeFromLesson(classLessons[0]),
      formatClassScheduleDaysText(item?.scheduleDays)
    );
    return {
      ...item,
      courseContent:firstNonEmptyText(item?.courseContent,item?.productName),
      scheduleTime:scheduleTime,
      campus:firstNonEmptyText(item?.campus,item?.campusName),
      remark:firstNonEmptyText(item?.remark,item?.opsNote)
    };
  });
}
function workbenchLessonUnits(schedule){
  const count=parseLessonValue(schedule?.lessonCount);
  if(count>0)return count;
  const start=dateMs(schedule?.startTime);
  const end=dateMs(schedule?.endTime);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return Math.max(0,(end-start)/3600000);
  return 1;
}
function decorateWorkbenchStudents(students=[],schedule=[],now=new Date()){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(students)?students:[]).map(item=>({
    ...item,
    phone:firstNonEmptyText(item?.phone,item?.mobile,item?.phoneNumber),
    type:firstNonEmptyText(item?.type,item?.studentType,item?.category),
    campus:firstNonEmptyText(item?.campus,item?.campusName,item?.primaryCampus),
    primaryCoach:firstNonEmptyText(item?.primaryCoach,item?.coachName),
    ownerCoach:firstNonEmptyText(item?.ownerCoach,item?.saleCoach,item?.salesCoach),
    remark:firstNonEmptyText(item?.remark,item?.studentRemark,item?.note,item?.notes),
    historyIssue:firstNonEmptyText(item?.historyIssue,item?.issueHistory,item?.issueNote,item?.healthNote),
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus),
    lessonUnitsCompleted:lessons
      .filter(lesson=>effectiveScheduleStatus(lesson,now)==='已结束')
      .filter(lesson=>parseArr(lesson?.studentIds).includes(item?.id)||String(lesson?.studentId||'')===String(item?.id||''))
      .reduce((sum,lesson)=>sum+workbenchLessonUnits(lesson),0)
  }));
}
function decorateWorkbenchFeedbacks(feedbacks=[]){
  return (Array.isArray(feedbacks)?feedbacks:[]).map(item=>({
    ...item,
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus,item?.coachFocus,item?.coachNote),
    summary:firstNonEmptyText(item?.summary,item?.practicedToday)
  }));
}
function assertCanEditClassWithSchedules(oldClass,nextClass,schedules){
  const classSchedules=(schedules||[]).filter(s=>s.classId===oldClass?.id);
  if(!classSchedules.length)return;
  if(String(oldClass?.productId||'').trim()!==String(nextClass?.productId||'').trim())throw new Error('该班次已有排课，不能直接修改课程产品');
  if(String(oldClass?.coach||'').trim()!==String(nextClass?.coach||'').trim())throw new Error('该班次已有排课，不能直接修改教练');
  if(String(oldClass?.campus||'').trim()!==String(nextClass?.campus||'').trim())throw new Error('该班次已有排课，不能直接修改校区');
  if(!sameStudentIds(oldClass?.studentIds,nextClass?.studentIds))throw new Error('该班次已有排课，不能直接修改学员');
  if(parseLessonValue(oldClass?.totalLessons)!==parseLessonValue(nextClass?.totalLessons))throw new Error('该班次已有排课，不能直接修改总课时');
  if(parseLessonValue(oldClass?.usedLessons)!==parseLessonValue(nextClass?.usedLessons))throw new Error('已上课时由排课自动维护，不能手动修改');
  const oldStatus=oldClass?.status||'已排班',nextStatus=nextClass?.status||'已排班';
  if(oldStatus!==nextStatus&&nextStatus==='已取消')throw new Error('该班次已有排课，不能直接取消');
  if(oldStatus!==nextStatus&&nextStatus==='已结课'&&classRemainingLessonsForRecord(nextClass)>0)throw new Error('该班次仍有剩余课时，不能直接结课');
}
function assertCanDeleteSchedule(scheduleId,feedbacks,ledger=[]){
  if((feedbacks||[]).some(f=>f.scheduleId===scheduleId))throw new Error('该排课已有课后反馈，不能直接删除');
  if((ledger||[]).some(l=>l.scheduleId===scheduleId))throw new Error('该排课已有权益消耗记录，不能直接删除，请取消排课');
}
function assertCanDeleteStudent(studentId,data){
  if(!studentId)return;
  const reasons=[];
  if((data.classes||[]).some(c=>parseArr(c.studentIds).includes(studentId)))reasons.push('班次');
  if((data.schedule||[]).some(s=>parseArr(s.studentIds).includes(studentId)))reasons.push('排课');
  if((data.purchases||[]).some(p=>p.studentId===studentId))reasons.push('购买记录');
  if((data.entitlements||[]).some(e=>e.studentId===studentId))reasons.push('课包余额');
  if((data.entitlementLedger||[]).some(l=>l.studentId===studentId))reasons.push('扣课记录');
  if((data.courts||[]).some(c=>c.studentId===studentId||parseArr(c.studentIds).includes(studentId)||normalizeCourtHistory(c.history).some(h=>h.studentId===studentId)))reasons.push('订场账户');
  if((data.feedbacks||[]).some(f=>f.studentId===studentId||parseArr(f.studentIds).includes(studentId)))reasons.push('课后反馈');
  if(reasons.length)throw new Error(`该学员不能直接删除：已关联${[...new Set(reasons)].join('、')}`);
}
function assertStudentWriteAccess(user){
  if(user?.role!=='admin')throw new Error('无权限');
}
function assertCanDeleteCourt(court,data={}){
  const reasons=[];
  if(parseArr(court?.history).length)reasons.push('已存在财务流水');
  if(normalizeMoney(court?.balance)||normalizeMoney(court?.totalDeposit)||normalizeMoney(court?.spentAmount))reasons.push('仍有财务余额或累计金额');
  const courtId=String(court?.id||'').trim();
  if(courtId){
    if((data.membershipAccounts||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员账户');
    if((data.membershipOrders||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员订单');
    if((data.membershipBenefitLedger||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联权益流水');
    if((data.membershipAccountEvents||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联账户事件');
  }
  if(reasons.length)throw new Error(`该客户不能直接删除：${[...new Set(reasons)].join('、')}`);
}
function courtDeleteAction(court,data={}){
  try{
    assertCanDeleteCourt(court,data);
    return 'delete';
  }catch(e){
    return 'archive';
  }
}
function mergeCourtNotes(targetCourt,sourceCourt){
  const targetNotes=String(targetCourt?.notes||'').trim();
  const sourceNotes=String(sourceCourt?.notes||'').trim();
  const sourceMark=`[合并自 ${sourceCourt?.name||'原用户'} · ${sourceCourt?.id||''}]`;
  if(!sourceNotes)return [targetNotes,sourceMark].filter(Boolean).join('\n');
  return [targetNotes,`${sourceMark} ${sourceNotes}`].filter(Boolean).join('\n');
}
function mergeCourtRecords({targetCourt,sourceCourt,membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],now=new Date().toISOString()}={}){
  if(!targetCourt?.id||!sourceCourt?.id)throw new Error('请选择要合并的订场用户');
  if(String(targetCourt.id)===String(sourceCourt.id))throw new Error('不能合并到自己');
  const targetActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(targetCourt.id)&&row.status!=='voided');
  const sourceActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(sourceCourt.id)&&row.status!=='voided');
  if(targetActiveAccount&&sourceActiveAccount)throw new Error('两个订场用户都已有会员账户，当前暂不支持直接合并，请先处理会员账户');
  const mergedStudentIds=[...new Set([...normalizeStudentIds(targetCourt),...normalizeStudentIds(sourceCourt)])];
  const mergedHistory=[...buildLegacyCourtOpeningHistory(targetCourt),...buildLegacyCourtOpeningHistory(sourceCourt)];
  const mergedTarget=normalizeCourtRecord({
    ...sourceCourt,
    ...targetCourt,
    id:targetCourt.id,
    name:targetCourt.name||sourceCourt.name||'',
    phone:targetCourt.phone||sourceCourt.phone||'',
    campus:targetCourt.campus||sourceCourt.campus||'',
    joinDate:targetCourt.joinDate||sourceCourt.joinDate||'',
    recentFollowUpDate:targetCourt.recentFollowUpDate||sourceCourt.recentFollowUpDate||'',
    nextFollowUpDate:targetCourt.nextFollowUpDate||sourceCourt.nextFollowUpDate||'',
    owner:targetCourt.owner||sourceCourt.owner||'',
    depositAttitude:targetCourt.depositAttitude||sourceCourt.depositAttitude||'',
    familiarity:targetCourt.familiarity||sourceCourt.familiarity||'',
    notes:mergeCourtNotes(targetCourt,sourceCourt),
    studentId:mergedStudentIds[0]||'',
    studentIds:mergedStudentIds,
    status:'active',
    history:mergedHistory,
    updatedAt:now
  });
  const rewriteCourtLink=row=>({...row,courtId:targetCourt.id,courtName:mergedTarget.name||targetCourt.name||targetCourt.id,phone:mergedTarget.phone||'',studentIds:mergedStudentIds,updatedAt:now});
  return {
    targetCourt:mergedTarget,
    sourceCourt:{...sourceCourt,status:'inactive',mergedIntoCourtId:targetCourt.id,mergedAt:now,updatedAt:now},
    membershipAccounts:(membershipAccounts||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipOrders:(membershipOrders||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipBenefitLedger:(membershipBenefitLedger||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipAccountEvents:(membershipAccountEvents||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row)
  };
}
function assertCanDeleteCampus(campusId,data={}){
  const id=String(campusId||'').trim();
  if(!id)return;
  const used=
    (data.students||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.coaches||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.classes||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.schedule||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.courts||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.packages||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id))||
    (data.entitlements||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id));
  if(used)throw new Error('该校区已有学员、教练、班次、排课、课包或权益关联，不能直接删除');
}
function buildProductRenameDisplayUpdates(oldProduct,nextProduct,data={},now=new Date().toISOString()){
  const empty={classes:[],plans:[]};
  if(!oldProduct||!nextProduct)return empty;
  const oldName=String(oldProduct.name||'').trim();
  const nextName=String(nextProduct.name||'').trim();
  if(!oldName||!nextName||oldName===nextName)return empty;
  if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)return empty;
  const classes=(data.classes||[]).filter(c=>c.productId===oldProduct.id).map(c=>{
    const className=c.classNo&&nextName?`${c.classNo}-${nextName}`:(nextName||c.className||'');
    return {...c,productName:nextName,className,updatedAt:now};
  });
  return {classes,plans:[]};
}
function normalizeCourtRecord(input,refs={}){
  const inferredDeposit=extractDepositAmountFromText(input.depositAttitude);
  const normalizedInput={...input};
  if(inferredDeposit>0&&!normalizeMoney(normalizedInput.totalDeposit))normalizedInput.totalDeposit=inferredDeposit;
  if(inferredDeposit>0&&!hasMoneyValue(input.balance)){
    const spent=normalizeMoney(normalizedInput.spentAmount);
    const total=normalizeMoney(normalizedInput.totalDeposit);
    if(spent>0&&total>0)normalizedInput.balance=Math.max(0,total-spent);
  }
  const currentHistory=normalizeCourtHistory(input.history);
  const history=normalizeCourtBookingHistoryRows(normalizedInput,currentHistory.length?currentHistory:buildLegacyCourtOpeningHistory(normalizedInput));
  if(Array.isArray(refs.schedules))assertCourtBookingHistoryAgainstSchedules({...normalizedInput,history},refs.schedules);
  const finance=computeCourtFinance({...normalizedInput,history});
  const cachedFinance=buildCachedCourtFinanceFields({...normalizedInput,history});
  const studentIds=normalizeStudentIds(normalizedInput);
  return {
    ...normalizedInput,
    phone:assertPhone(normalizedInput.phone),
    studentId:studentIds[0]||'',
    studentIds,
    history,
    ...finance
    ,...cachedFinance
  };
}
function buildLegacyCourtOpeningHistory(court){
  const history=normalizeCourtHistory(court?.history);
  if(history.length||!court)return history;
  const total=normalizeMoney(court.totalDeposit);
  const balance=normalizeMoney(court.balance);
  const spent=normalizeMoney(court.spentAmount);
  const date=court.joinDate||new Date().toISOString().slice(0,10);
  const idBase=String(court.id||'legacy');
  const stored=Math.max(0,total-balance);
  const direct=Math.max(0,spent-stored);
  const rows=[];
  if(total>0)rows.push({id:'legacy-deposit-'+idBase,date,type:'充值',category:'历史储值',payMethod:'历史导入',amount:total,note:'期初导入汇总',source:'import'});
  if(stored>0)rows.push({id:'legacy-stored-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'储值扣款',amount:stored,note:'期初导入汇总',source:'import'});
  if(direct>0)rows.push({id:'legacy-direct-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'历史导入',amount:direct,note:'期初导入汇总',source:'import'});
  return rows;
}
function buildMembershipPlanRecord(input,opts={}){
  const now=opts.now||new Date().toISOString();
  if(!String(input?.name||'').trim())throw new Error('请填写会员方案名称');
  const rechargeAmount=normalizeMoney(input.rechargeAmount);
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const discountRate=normalizeMoney(input.discountRate||1);
  if(discountRate<=0||discountRate>1)throw new Error('会员折扣必须在 0 到 1 之间');
  const saleStartDate=String(input.saleStartDate||'').trim();
  const saleEndDate=String(input.saleEndDate||'').trim();
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate)throw new Error('售卖结束日期不能早于售卖开始日期');
  const benefitTemplate=normalizeMembershipBenefitTemplate(input,input?.benefitTemplate);
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    name:String(input.name).trim(),
    tierCode:String(input.tierCode||'').trim(),
    rechargeAmount,
    discountRate,
    bonusAmount:normalizeMoney(input.bonusAmount),
    publicLessonCount:parseInt(input.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(input.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(input.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(input.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(input.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(input.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(input.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate,
    validMonths:parseInt(input.validMonths)||12,
    maxMonths:parseInt(input.maxMonths)||24,
    saleStartDate,
    saleEndDate,
    status:input.status||'draft',
    notes:input.notes||'',
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}
function normalizeMembershipPlanViewRecord(plan){
  if(!plan||typeof plan!=='object')return plan;
  const benefitTemplate=normalizeMembershipBenefitTemplate(plan,plan?.benefitTemplate);
  return {
    ...plan,
    publicLessonCount:parseInt(plan.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(plan.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(plan.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(plan.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(plan.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(plan.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(plan.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate
  };
}
function normalizeMembershipOrderViewRecord(order,plan=null){
  if(!order||typeof order!=='object')return order;
  const normalizedPlan=normalizeMembershipPlanViewRecord(plan||{});
  const planBenefitTemplateSnapshot=normalizeMembershipBenefitTemplate(order?.planBenefitTemplateSnapshot?{benefitTemplate:order.planBenefitTemplateSnapshot}:order,normalizedPlan?.benefitTemplate||{});
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const benefitSnapshot=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,planBenefitTemplateSnapshot);
  const systemAmount=normalizeMoney(order.systemAmount??normalizedPlan.rechargeAmount);
  const finalAmount=normalizeMoney(order.finalAmount??order.rechargeAmount??systemAmount);
  const priceOverridden=order.priceOverridden!==undefined?!!order.priceOverridden:(systemAmount!==finalAmount);
  const overrideReason=String(order.overrideReason||'').trim();
  return {
    ...order,
    priceSource:order.priceSource||'membership_plan',
    priceSourceId:order.priceSourceId||order.membershipPlanId||'',
    priceSourceName:order.priceSourceName||order.membershipPlanName||normalizedPlan.name||'',
    systemAmount,
    finalAmount,
    priceOverridden,
    overrideReason,
    planBenefitTemplateSnapshot,
    benefitSnapshot
  };
}
function membershipDateRange(startDate,validMonths=12,maxMonths=24){
  return {
    cycleStartDate:startDate,
    validUntil:addMonthsKey(startDate,validMonths),
    hardExpireAt:addMonthsKey(startDate,maxMonths)
  };
}
function isMembershipAccountInTerm(account,purchaseDate){
  return account&&['active','extended'].includes(account.status)&&account.validUntil&&purchaseDate<=account.validUntil;
}
function buildMembershipPurchase({court,plan,existingAccount=null,body={},now=new Date().toISOString(),accountId=uuidv4(),orderId=uuidv4(),historyId=uuidv4()}){
  if(!court?.id)throw new Error('订场用户不存在');
  if(!plan?.id)throw new Error('会员方案不存在');
  const purchaseDate=body.purchaseDate||now.slice(0,10);
  const systemAmount=normalizeMoney(plan.rechargeAmount);
  const rechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
  const priceOverridden=systemAmount!==rechargeAmount;
  const overrideReason=String(body.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const validMonths=parseInt(plan.validMonths)||12;
  const maxMonths=parseInt(plan.maxMonths)||24;
  const oldAccount=existingAccount||null;
  const inTerm=isMembershipAccountInTerm(oldAccount,purchaseDate);
  const lastQualified=normalizeMoney(oldAccount?.lastQualifiedRechargeAmount);
  const qualifiesRenewalReset=!oldAccount||oldAccount.status==='cleared'||(inTerm&&(!lastQualified||rechargeAmount>=lastQualified));
  const range=qualifiesRenewalReset?membershipDateRange(purchaseDate,validMonths,maxMonths):{
    cycleStartDate:oldAccount.cycleStartDate,
    validUntil:oldAccount.validUntil,
    hardExpireAt:oldAccount.hardExpireAt
  };
  const purchaseBenefitTemplate=body.benefitSnapshot||plan.benefitTemplate||{};
  const benefitSnapshotCustomized=body.benefitSnapshotCustomized===true||hasMembershipBenefitSnapshot(body.benefitSnapshot)||MEMBERSHIP_BENEFIT_FIELD_MAP.some(({field})=>body[field]!==undefined&&body[field]!==null&&String(body[field]).trim()!=='');
  const benefitSnapshot=normalizeMembershipBenefitTemplate({
    ...plan,
    ...body,
    publicLessonCount:body.publicLessonCount??purchaseBenefitTemplate.publicLesson?.count??plan.publicLessonCount,
    stringingLaborCount:body.stringingLaborCount??purchaseBenefitTemplate.stringingLabor?.count??plan.stringingLaborCount,
    ballMachineCount:body.ballMachineCount??purchaseBenefitTemplate.ballMachine?.count??plan.ballMachineCount,
    level2PartnerCount:body.level2PartnerCount??purchaseBenefitTemplate.level2Partner?.count??plan.level2PartnerCount,
    designatedCoachPartnerCount:body.designatedCoachPartnerCount??purchaseBenefitTemplate.designatedCoachPartner?.count??plan.designatedCoachPartnerCount,
    benefitTemplate:purchaseBenefitTemplate,
    customBenefits:body.customBenefits??(benefitSnapshotCustomized?[]:(purchaseBenefitTemplate.customBenefits??plan.customBenefits??plan.benefitTemplate?.customBenefits)),
    designatedCoachIds:body.designatedCoachIds??purchaseBenefitTemplate.designatedCoachPartner?.designatedCoachIds??plan.designatedCoachIds
  },plan.benefitTemplate||{});
  const account={
    ...(oldAccount||{}),
    id:oldAccount?.id||accountId,
    courtId:court.id,
    courtName:court.name||court.id,
    phone:court.phone||'',
    studentIds:normalizeStudentIds(court),
    status:'active',
    memberTag:plan.tierCode||'',
    memberLabel:plan.name||'',
    discountRate:normalizeMoney(body.discountRate??plan.discountRate),
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    autoExtended:false,
    lastQualifiedRechargeAmount:qualifiesRenewalReset?rechargeAmount:(oldAccount?.lastQualifiedRechargeAmount||rechargeAmount),
    lastOrderId:orderId,
    notes:body.accountNotes||oldAccount?.notes||'',
    createdAt:oldAccount?.createdAt||now,
    updatedAt:now
  };
  const order={
    id:orderId,
    membershipAccountId:account.id,
    courtId:court.id,
    courtName:court.name||court.id,
    studentIds:normalizeStudentIds(court),
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    priceSource:'membership_plan',
    priceSourceId:plan.id,
    priceSourceName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    rechargeAmount,
    bonusAmount:normalizeMoney(body.bonusAmount??plan.bonusAmount),
    discountRate:account.discountRate,
    purchaseDate,
    effectiveDate:body.effectiveDate||purchaseDate,
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    qualifiesRenewalReset,
    planBenefitTemplateSnapshot:normalizeMembershipBenefitTemplate(plan,plan.benefitTemplate||{}),
    benefitSnapshot,
    benefitSnapshotCustomized,
    benefitValidUntil:addMonthsKey(purchaseDate,validMonths),
    courtHistoryRechargeId:historyId,
    operator:body.operator||'',
    requestKey:String(body.requestKey||'').trim(),
    status:body.status||'active',
    notes:body.notes||'',
    createdAt:now,
    updatedAt:now
  };
  const historyRow={
    id:historyId,
    date:purchaseDate,
    type:'充值',
    payMethod:body.payMethod||'会员充值',
    category:'会员充值',
    amount:rechargeAmount,
    bonusAmount:order.bonusAmount,
    membershipOrderId:order.id,
    membershipAccountId:account.id,
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    discountRate:account.discountRate,
    originalAmount:0,
    discountedAmount:0,
    note:body.note||`${plan.name||'会员'}开卡/续充`
  };
  const warning=oldAccount&&inTerm&&!qualifiesRenewalReset?'低于原会员档位，已记录充值但不重置会员有效期':'';
  return {account,order,historyRow,warning};
}
function membershipBenefitItemsFromOrder(order){
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const snap=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,order?.planBenefitTemplateSnapshot||{});
  const items=[];
  Object.entries(snap).forEach(([code,value])=>{
    if(code==='customBenefits')return;
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:code,benefitLabel:value.label||code,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  parseArr(snap.customBenefits).forEach((value,idx)=>{
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:`custom_${idx+1}`,benefitLabel:value.label||`自定义权益${idx+1}`,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  return items;
}
function summarizeMembershipBenefits({orders=[],ledger=[],today=new Date().toISOString().slice(0,10)}={}){
  return (orders||[]).filter(o=>o.status!=='voided'&&o.status!=='refunded').flatMap(order=>membershipBenefitItemsFromOrder(order).map(item=>{
    const rows=(ledger||[]).filter(l=>l.membershipOrderId===item.membershipOrderId&&l.benefitCode===item.benefitCode&&l.action!=='grant');
    const positiveDelta=rows.filter(l=>(parseInt(l.delta)||0)>0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const negativeDelta=rows.filter(l=>(parseInt(l.delta)||0)<0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const total=(item.total||0)+positiveDelta;
    const expired=item.benefitValidUntil&&today>item.benefitValidUntil;
    return {...item,total,used:Math.abs(negativeDelta),adjusted:positiveDelta,remaining:expired?0:Math.max(0,total+negativeDelta),status:expired?'expired':'active'};
  }));
}
function buildMembershipGrantLedgerRows(order,opts={}){
  return membershipBenefitItemsFromOrder(order).map(item=>buildMembershipBenefitLedgerRecord({
    membershipOrderId:order.id,
    membershipAccountId:order.membershipAccountId,
    courtId:order.courtId,
    benefitCode:item.benefitCode,
    benefitLabel:item.benefitLabel,
    unit:item.unit,
    delta:item.total,
    action:'grant',
    reason:'开卡/续充赠送权益',
    operator:order.operator||'',
    relatedDate:order.purchaseDate
  },{id:opts.idFactory?opts.idFactory():uuidv4(),now:opts.now||new Date().toISOString()}));
}
function isDuplicateMembershipOrderSubmission({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey='',recentOrders=[],now=new Date().toISOString()}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  const targetAmount=normalizeMoney(rechargeAmount);
  const nowMs=dateMs(now);
  return (recentOrders||[]).some(order=>{
    if(!order||order.status==='voided'||order.status==='refunded')return false;
    if(cleanRequestKey&&String(order.requestKey||'').trim()&&String(order.requestKey||'').trim()===cleanRequestKey)return true;
    if(String(order.courtId||'')!==String(courtId||''))return false;
    if(String(order.membershipPlanId||'')!==String(membershipPlanId||''))return false;
    if(String(order.purchaseDate||'')!==String(purchaseDate||''))return false;
    if(normalizeMoney(order.rechargeAmount)!==targetAmount)return false;
    const createdMs=dateMs(order.createdAt);
    return Number.isFinite(nowMs)&&Number.isFinite(createdMs)&&Math.abs(nowMs-createdMs)<=15000;
  });
}
const RECENT_MEMBERSHIP_ORDER_TTL_MS=60000;
const recentMembershipOrderRequests=new Map();
function membershipOrderRequestDedupKey({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey=''}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  if(cleanRequestKey)return `request:${cleanRequestKey}`;
  return `payload:${String(courtId||'')}|${String(membershipPlanId||'')}|${String(purchaseDate||'')}|${normalizeMoney(rechargeAmount)}`;
}
function reserveRecentMembershipOrderRequest(input={},now=new Date().toISOString()){
  const key=membershipOrderRequestDedupKey(input);
  const nowMs=dateMs(now);
  for(const [requestKey,ts] of recentMembershipOrderRequests.entries()){
    if(!Number.isFinite(nowMs)||!Number.isFinite(ts)||Math.abs(nowMs-ts)>RECENT_MEMBERSHIP_ORDER_TTL_MS)recentMembershipOrderRequests.delete(requestKey);
  }
  const existingAt=recentMembershipOrderRequests.get(key);
  if(Number.isFinite(existingAt)&&Number.isFinite(nowMs)&&Math.abs(nowMs-existingAt)<=RECENT_MEMBERSHIP_ORDER_TTL_MS)return null;
  recentMembershipOrderRequests.set(key,Number.isFinite(nowMs)?nowMs:Date.now());
  return key;
}
function releaseRecentMembershipOrderRequest(key,{keep=false}={}){
  if(!key)return;
  if(!keep)recentMembershipOrderRequests.delete(key);
}
function buildMembershipBenefitLedgerRecord(input,opts={}){
  if(!input?.membershipOrderId)throw new Error('会员权益流水必须关联购买批次');
  if(!input?.membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!input?.courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!input?.benefitCode)throw new Error('请选择会员权益');
  const delta=parseInt(input.delta)||0;
  if(!delta)throw new Error('权益变动次数不能为 0');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    delta,
    benefitLabel:input.benefitLabel||input.benefitCode,
    unit:input.unit||'次',
    action:input.action||(delta<0?'consume':'supplement'),
    reason:input.reason||(delta<0?'会员权益使用':'会员权益补发'),
    operator:input.operator||'',
    notes:input.notes||'',
    relatedDate:input.relatedDate||opts.now?.slice(0,10)||new Date().toISOString().slice(0,10),
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function buildMembershipAccountEventRecord(input,opts={}){
  if(!input?.membershipAccountId)throw new Error('会员账户事件必须关联会员账户');
  if(!input?.courtId)throw new Error('会员账户事件必须关联订场用户');
  if(!input?.eventType)throw new Error('会员账户事件必须包含事件类型');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    operator:input.operator||'',
    reason:input.reason||'',
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function allocateMembershipBenefitUsage({membershipAccountId,courtId,benefitCode,benefitLabel='',unit='次',consumeCount,orders=[],ledger=[],today,now=new Date().toISOString(),idFactory=uuidv4,operator='',reason='会员权益使用',relatedDate=''}={}){
  const need=Math.abs(parseInt(consumeCount)||0);
  if(!membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!benefitCode)throw new Error('请选择会员权益');
  if(need<=0)throw new Error('权益变动次数不能为 0');
  const currentDay=today||String(relatedDate||now).slice(0,10);
  const batches=summarizeMembershipBenefits({orders,ledger,today:currentDay})
    .filter(item=>item.membershipAccountId===membershipAccountId&&item.courtId===courtId&&item.benefitCode===benefitCode&&item.remaining>0&&item.status!=='expired')
    .sort((a,b)=>{
      const av=String(a.benefitValidUntil||'9999-99-99');
      const bv=String(b.benefitValidUntil||'9999-99-99');
      if(av!==bv)return av.localeCompare(bv);
      return String(a.membershipOrderId||'').localeCompare(String(b.membershipOrderId||''));
    });
  const available=batches.reduce((sum,item)=>sum+(parseInt(item.remaining)||0),0);
  if(available<need)throw new Error('剩余权益不足');
  let remaining=need;
  const rows=[];
  for(const batch of batches){
    if(remaining<=0)break;
    const delta=Math.min(remaining,parseInt(batch.remaining)||0);
    if(delta<=0)continue;
    rows.push(buildMembershipBenefitLedgerRecord({
      membershipOrderId:batch.membershipOrderId,
      membershipAccountId,
      courtId,
      benefitCode,
      benefitLabel:benefitLabel||batch.benefitLabel||benefitCode,
      unit:unit||batch.unit||'次',
      delta:-delta,
      action:'consume',
      reason,
      operator,
      relatedDate:relatedDate||currentDay
    },{id:idFactory(),now}));
    remaining-=delta;
  }
  return rows;
}
function reconcileMembershipAccounts({accounts=[],courts=[],today=new Date().toISOString().slice(0,10),now=new Date().toISOString(),eventIdFactory=uuidv4,historyIdFactory=uuidv4}={}){
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  const nextAccounts=[],events=[],historyRows=[];
  for(const account of accounts||[]){
    let next={...account};
    const court=courtMap.get(account.courtId);
    const finance=computeCourtFinance(court||{history:[]});
    const balance=normalizeMoney(finance.balance);
    if(account.hardExpireAt&&today>account.hardExpireAt&&balance>0&&account.status!=='cleared'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_clear',beforeStatus:account.status,afterStatus:'cleared',beforeValidUntil:account.validUntil,afterValidUntil:account.validUntil,operator:'system',reason:'两年到期余额清零',createdAt:now};
      const historyRow={id:historyIdFactory(),date:today,type:'冲正',payMethod:'储值扣款',category:'会员到期清零',amount:balance,membershipAccountId:account.id,note:'两年到期余额清零'};
      next={...next,status:'cleared',updatedAt:now};
      events.push(event);
      historyRows.push(historyRow);
    }else if(account.validUntil&&account.hardExpireAt&&today>account.validUntil&&today<=account.hardExpireAt&&balance>0&&!account.autoExtended&&account.status==='active'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_extend',beforeStatus:account.status,afterStatus:'extended',beforeValidUntil:account.validUntil,afterValidUntil:account.hardExpireAt,operator:'system',reason:'一年期到期仍有余额，自动延续 12 个月',createdAt:now};
      next={...next,status:'extended',autoExtended:true,updatedAt:now};
      events.push(event);
    }
    nextAccounts.push(next);
  }
  return {accounts:nextAccounts,events,historyRows};
}
function legacyCourtFinanceWarnings(court){
  const total=normalizeMoney(court?.totalDeposit);
  const balance=normalizeMoney(court?.balance);
  const spent=normalizeMoney(court?.spentAmount);
  const warnings=[];
  if(balance>total)warnings.push('余额大于累计充值');
  if(total-balance>spent)warnings.push('余额减少金额大于累计消费');
  return warnings;
}
function shouldMigrateLegacyCourtFinance(court){
  return !normalizeCourtHistory(court?.history).length&&(
    normalizeMoney(court?.balance)>0||
    normalizeMoney(court?.totalDeposit)>0||
    normalizeMoney(court?.spentAmount)>0
  );
}
async function loadCourtDeleteReferenceData(){
  const [membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents]=await Promise.all([
    getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])
  ]);
  return {membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents};
}
async function deleteCourtsByIds(ids,data={}){
  const uniqueIds=[...new Set((ids||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  const courts=await getCachedScan(T_COURTS).catch(()=>[]);
  const courtMap=new Map((courts||[]).map(c=>[String(c.id||''),c]));
  const deleted=[],archived=[],errors=[];
  for(let i=0;i<uniqueIds.length;i+=25){
    const chunk=uniqueIds.slice(i,i+25);
    const results=await Promise.all(chunk.map(async(id)=>{
      try{
        const court=courtMap.get(id)||null;
        if(!court)return {id,ok:false,error:'订场用户不存在'};
        const action=courtDeleteAction(court,data);
        if(action==='delete'){
          await del(T_COURTS,id);
          await syncCourtSortIndex(null,court);
          return {id,ok:true,action};
        }
        const now=new Date().toISOString();
        const nextCourt={...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now};
        await put(T_COURTS,id,nextCourt);
        await syncCourtSortIndex(nextCourt,court);
        return {id,ok:true,action};
      }catch(e){
        return {id,ok:false,error:e.message};
      }
    }));
    results.forEach(r=>{
      if(!r.ok){errors.push({id:r.id,error:r.error});return;}
      if(r.action==='archive')archived.push(r.id);
      else deleted.push(r.id);
    });
  }
  return {success:deleted.length,archivedCount:archived.length,failed:errors.length,deleted,archived,errors};
}
async function clearAllCourts(){
  const existing=await getCachedScan(T_COURTS);
  for(let i=0;i<existing.length;i+=20)await Promise.all(existing.slice(i,i+20).map(r=>del(T_COURTS,r.id)));
  const indexRows=await scan(T_COURT_SORT_INDEX).catch(()=>[]);
  for(let i=0;i<indexRows.length;i+=50)await Promise.all(indexRows.slice(i,i+50).map(r=>del(T_COURT_SORT_INDEX,r.id)));
  return existing.length;
}
async function importCourtRows(rows){
  const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
  let success=0,failed=0;
  const errors=[];
  for(const row of rows){
    try{
      const id=uuidv4();
      const record={...normalizeCourtRecord(row,{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await put(T_COURTS,id,record);
      await syncCourtSortIndex(record,null);
      success++;
    }catch(e){
      failed++;
      errors.push({name:row?.name||'',error:e.message});
    }
  }
  return {success,failed,errors};
}
async function runMembershipReconcile(rows){
  const accounts=Array.isArray(rows?.accounts)?rows.accounts:await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
  const courts=Array.isArray(rows?.courts)?rows.courts:await getCachedScan(T_COURTS).catch(()=>[]);
  const result=reconcileMembershipAccounts({accounts,courts});
  const accountMap=new Map((accounts||[]).map(a=>[a.id,a]));
  const changedAccounts=result.accounts.filter(a=>JSON.stringify(a)!==JSON.stringify(accountMap.get(a.id)));
  for(const account of changedAccounts)await put(T_MEMBERSHIP_ACCOUNTS,account.id,account);
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  for(const row of result.historyRows){
    const court=courtMap.get(row.courtId);
    if(!court)continue;
    const history=[...normalizeCourtHistory(court.history),row];
    const next=normalizeCourtRecord({...court,history,updatedAt:new Date().toISOString()});
    await put(T_COURTS,court.id,next);
    await syncCourtSortIndex(next,court);
    courtMap.set(court.id,next);
  }
  for(const event of result.events)await put(T_MEMBERSHIP_ACCOUNT_EVENTS,event.id,event);
  return {...result,accounts:result.accounts,courts:[...courtMap.values()]};
}
const handleMembershipWriteRequest=createMembershipWriteHandler({
  init:()=>initRuntime.init(),
  getCachedScan,
  getCachedRow,
  put,
  del,
  uuidv4,
  normalizeMoney,
  reserveRecentMembershipOrderRequest,
  releaseRecentMembershipOrderRequest,
  buildMembershipPurchase,
  buildMembershipGrantLedgerRows,
  normalizeCourtHistory,
  normalizeCourtRecord,
  normalizeMembershipPlanViewRecord,
  buildMembershipBenefitLedgerRecord,
  allocateMembershipBenefitUsage,
  normalizeMembershipOrderViewRecord,
  operatorAccountName,
  syncCourtSortIndex,
  membershipBenefitFieldMap:MEMBERSHIP_BENEFIT_FIELD_MAP,
  tables:{
    users:T_USERS,
    courts:T_COURTS,
    membershipPlans:T_MEMBERSHIP_PLANS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipBenefitLedger:T_MEMBERSHIP_BENEFIT_LEDGER
  }
});
const handleCourtsMembershipRequest=createCourtsMembershipHandler({
  init:()=>initRuntime.init(),
  getCachedScan,
  getCachedRow,
  put,
  del,
  uuidv4,
  normalizePricePlan,
  quoteVenuePrice,
  normalizeCourtRecord,
  importCourtRows,
  deleteCourtsByIds,
  loadCourtDeleteReferenceData,
  mergeCourtRecords,
  parseLegacyCourtNotes,
  shouldMigrateLegacyCourtFinance,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  computeCourtFinance,
  normalizeMoney,
  normalizeCourtHistory,
  buildMembershipPlanRecord,
  runMembershipReconcile,
  buildMembershipAccountEventRecord,
  syncCourtSortIndex,
  rebuildCourtSortIndex,
  handleMembershipWriteRequest,
  tables:{
    schedule:T_SCHEDULE,
    courts:T_COURTS,
    courtSortIndex:T_COURT_SORT_INDEX,
    pricePlans:T_PRICE_PLANS,
    membershipPlans:T_MEMBERSHIP_PLANS,
    membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
    membershipOrders:T_MEMBERSHIP_ORDERS,
    membershipBenefitLedger:T_MEMBERSHIP_BENEFIT_LEDGER,
    membershipAccountEvents:T_MEMBERSHIP_ACCOUNT_EVENTS
  }
});
const handleTeachingRequest=createTeachingHandler({
  createPurchaseEntitlementWriteHandler,
  createPurchaseVoidService,
  createPurchaseUpdateService,
  sendJson,
  init:()=>initRuntime.init(),
  get,
  scan,
  put,
  del,
  getCachedScan,
  getCachedRow,
  getCachedFeedbacks,
  withTimeout,
  uuidv4,
  timed,
  parseArr,
  normalizeVenue,
  normalizeCoachLateInfo,
  assertPhone,
  assertStudentWriteAccess,
  applyStudentIdentityUpdate,
  assertCanDeleteStudent,
  buildCoachRefs,
  filterLoadAllForUser,
  normalizeProductRecord,
  assertCanEditProductWithReferences,
  buildProductRenameDisplayUpdates,
  assertCanDeleteProduct,
  normalizePackageRecord,
  assertCanEditPackageWithPurchases,
  assertCanDeletePackage,
  validatePurchaseInputForPackage,
  buildPurchaseRecord,
  buildEntitlementFromPurchase,
  writePurchaseAndEntitlementAtomic,
  purchaseHasEntitlementLedger,
  assertCanEditPurchaseWithLedger,
  syncEntitlementFromPurchase,
  assertCanVoidPurchase,
  normalizeEntitlementLedgerRowsForView,
  recommendEntitlements,
  assertCanDeleteEntitlement,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  putFeedback,
  assertCanWriteSchedule,
  validateScheduleSave,
  assertScheduleEntitlementRequired,
  resolveScheduleEntitlementDeltas,
  assertScheduleEntitlementCapacity,
  scheduleLessonDelta,
  applyEntitlementDelta,
  applyLessonDelta,
  notifyCoachScheduleCreated,
  buildScheduleNotificationUpdate,
  assertScheduleEditableAfterFeedback,
  scheduleEntitlementDeltas,
  parseLessonValue,
  diffScheduleEntitlementDeltas,
  applyLinkedClassScheduleSnapshot,
  assertCanDeleteSchedule,
  assertUniqueCoachName,
  applyCoachRename,
  loadCoachReferenceData,
  assertCanDeleteCoachName,
  assertCanWriteClass,
  validateClassInput,
  reserveNextClassNo,
  buildClassCreateRecord,
  buildClassUpdateRecord,
  assertCanEditClassWithSchedules,
  assertCanDeleteClass,
  tables:{
    users:T_USERS,
    courts:T_COURTS,
    students:T_STUDENTS,
    products:T_PRODUCTS,
    schedule:T_SCHEDULE,
    coaches:T_COACHES,
    classes:T_CLASSES,
    campuses:T_CAMPUSES,
    feedbacks:T_FEEDBACKS,
    packages:T_PACKAGES,
    purchases:T_PURCHASES,
    entitlements:T_ENTITLEMENTS,
    entitlementLedger:T_ENTITLEMENT_LEDGER
  }
});
const handleAuthAdminRequest=createAuthAdminHandler({
  init:()=>initRuntime.init(),
  get,
  put,
  getCachedRow,
  getCachedScan,
  bcrypt,
  jwt,
  jwtSecret:JWT_SECRET,
  fetchWechatSession,
  extractWechatOpenId,
  findWechatUserByOpenId,
  mergeStoredAuthUser,
  assertAuthUserActive,
  userMatchPermissions,
  buildWechatBoundUser,
  buildWechatUnboundUser,
  buildAdminUserView,
  findAdminUserByPhone,
  assertPhone,
  isTableMissingError,
  logger:console,
  tables:{
    users:T_USERS
  }
});
function parseLegacyCourtNotes(notes){
  const raw=String(notes||'').trim();
  if(!raw)return{notes:'',updates:{},changed:false};
  const parts=raw.split(/[；;]\s*/).map(x=>String(x||'').trim()).filter(Boolean);
  const remain=[];
  const updates={};
  for(const part of parts){
    const m=part.match(/^([^：:]+)[：:]\s*(.+)$/);
    if(!m){remain.push(part);continue;}
    const key=String(m[1]||'').trim();
    const value=String(m[2]||'').trim();
    if(!value)continue;
    if(key==='序号')continue;
    if((key==='负责人'||key==='对接人')&&!updates.owner)updates.owner=value;
    else if((key==='对储值的态度'||key==='对储值态度')&&!updates.depositAttitude)updates.depositAttitude=value;
    else if(key==='熟悉程度'&&!updates.familiarity)updates.familiarity=value;
    else if((key==='消费金额'||key==='消费金额（仅自己订场部分）')&&updates.spentAmount==null){
      const amt=parseFloat(String(value).replace(/[^\d.-]/g,''));
      if(!Number.isNaN(amt))updates.spentAmount=amt;
    }else remain.push(part);
  }
const nextNotes=remain.join('；');
  const changed=nextNotes!==raw||Object.keys(updates).length>0;
  return {notes:nextNotes,updates,changed};
}

const matchFinanceBridge=createMatchFinanceBridge({
  getMatchSqlPool,
  getCachedRow,
  put,
  T_COURTS,
  MATCH_COURT_FINANCE_ACCOUNT_ID,
  normalizeCourtHistory,
  normalizeCourtRecord,
  normalizeMoney,
  isoDateKey,
  uuidv4
});

const matchModule=createMatchModule({
  jwt,
  JWT_SECRET,
  MATCH_WECHAT_TEMPLATE_ID,
  MATCH_PREPAY_WINDOW_HOURS,
  getMatchSqlPool,
  scan,
  getCachedRow,
  getCachedScan,
  put,
  T_USERS,
  authUser,
  requireAdminUser,
  requireMatchUser,
  userMatchPermissions,
  requireMatchAdminPermission,
  canMatchUserCreateByAdminUser,
  findAdminUserByPhone,
  mergeStoredAuthUser,
  assertAuthUserActive,
  fetchWechatSession,
  extractWechatOpenId,
  fetchWechatPhoneNumber,
  sendWechatSubscribeMessage,
  truncateWechatValue,
  sendJson,
  uuidv4,
  normalizePhone,
  normalizeMoney,
  assertPhone,
  dateMs,
  financeBridge:matchFinanceBridge
});
const handleMatchRequest=matchModule.handleMatchRequest;
const matchTestExports=matchModule.testExports;

module.exports = async (req, res) => {
  scheduleInitInBackground();
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-FlowTennis-Client,X-FlowTennis-Client-Env,X-FlowTennis-Wechat-Env-Version');return res.status(200).end();}
  const path=(req.url||'').replace(/^\/api/,'').split('?')[0];
  const query=new URL(req.url||'/', 'http://local').searchParams;
  const user=authUser(req);
  const method=req.method;
  const startedAt=Date.now();
  if(res&&typeof res.on==='function')res.on('finish',()=>{console.log(`[api] ${method} ${path} ${res.statusCode} ${Date.now()-startedAt}ms`);});
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if(path==='/debug/runtime-source'&&method==='GET'){
      assertRuntimeDebugReadable(process.env);
      return sendJson(res,await buildRuntimeDataSourceDebugSnapshot({scan},process.env));
    }
    if(path==='/cron/course-reminders'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendCourseReminders());
    }
    const authAdminResponse=await handleAuthAdminRequest({path,method,user,body,req});
    if(authAdminResponse)return sendJson(res,authAdminResponse.body,authAdminResponse.status||200);
    if(await handleMatchRequest({req,res,path,method,body,query}))return;
    if(path==='/admin/clear-test-data'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(body.confirm!=='CLEAR_TEST_DATA')return sendJson(res,{error:'缺少清空确认'},400);
      await init();
      const result=await clearTables({scan,del},TEST_DATA_RESET_TABLES);
      return sendJson(res,{...result,kept:[T_USERS,T_COACHES,T_CAMPUSES]});
    }
    if(path==='/admin/replace-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      const rows=Array.isArray(body.rows)?body.rows:[];
      const result=await importCourtRows(rows);
      return sendJson(res,{cleared,...result});
    }
    if(path==='/admin/clear-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      return sendJson(res,{cleared});
    }
    if(path==='/admin/import-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return sendJson(res,await importCourtRows(rows));
    }
    if(path==='/load-all'&&method==='GET'){
      await init();
      if(ENABLE_IMPORTED_LEDGER_AUTO_REPAIR)await maybeRepairImportedLedgerDuplicates();
      const [rawCourts,students,products,packages,purchases,entitlements,entitlementLedger,financialLedger,membershipPlans,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,pricePlans,schedule,coaches,classes,campuses,feedbacks]=await Promise.all([
        timed('load-all scan courts',()=>scan(T_COURTS)),
        timed('load-all scan students',()=>scan(T_STUDENTS)),
        timed('load-all scan products',()=>scan(T_PRODUCTS)),
        timed('load-all scan packages',()=>scan(T_PACKAGES).catch(()=>[])),
        timed('load-all scan purchases',()=>scan(T_PURCHASES).catch(()=>[])),
        timed('load-all scan entitlements',()=>scan(T_ENTITLEMENTS).catch(()=>[])),
        timed('load-all scan entitlement ledger',()=>scan(T_ENTITLEMENT_LEDGER).catch(()=>[])),
        timed('load-all scan financial ledger',()=>scan(T_FINANCIAL_LEDGER).catch(()=>[])),
        timed('load-all scan membership plans',()=>scan(T_MEMBERSHIP_PLANS).catch(()=>[])),
        timed('load-all scan membership accounts',()=>scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])),
        timed('load-all scan membership orders',()=>scan(T_MEMBERSHIP_ORDERS).catch(()=>[])),
        timed('load-all scan membership benefit ledger',()=>scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])),
        timed('load-all scan membership account events',()=>scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])),
        timed('load-all scan price plans',()=>scan(T_PRICE_PLANS).catch(()=>[])),
        timed('load-all scan schedule',()=>scan(T_SCHEDULE)),
        timed('load-all scan coaches',()=>scan(T_COACHES).catch(()=>[])),
        timed('load-all scan classes',()=>scan(T_CLASSES).catch(()=>[])),
        timed('load-all scan campuses',()=>listCampusesWithDefaults()),
        timed('load-all scan feedbacks',()=>withTimeout(getCachedFeedbacks(),3000,[]))
      ]);
      const normalizedMembershipPlans=(Array.isArray(membershipPlans)?membershipPlans:[]).map(normalizeMembershipPlanViewRecord);
      const membershipPlanMap=new Map(normalizedMembershipPlans.map(p=>[p.id,p]));
      const normalizedMembershipOrders=(Array.isArray(membershipOrders)?membershipOrders:[]).map(order=>normalizeMembershipOrderViewRecord(order,membershipPlanMap.get(order.membershipPlanId)));
      const reconciled=await runMembershipReconcile({accounts:membershipAccounts,courts:rawCourts});
      const courts=reconciled.courts||rawCourts;
      const loaded=filterLoadAllForUser({
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        packages:Array.isArray(packages)?packages:[],
        purchases:Array.isArray(purchases)?purchases:[],
        entitlements:Array.isArray(entitlements)?entitlements:[],
        entitlementLedger:normalizeEntitlementLedgerRowsForView(Array.isArray(entitlementLedger)?entitlementLedger:[]),
        financialLedger:Array.isArray(financialLedger)?financialLedger:[],
        membershipPlans:normalizedMembershipPlans,
        membershipAccounts:Array.isArray(reconciled.accounts)?reconciled.accounts:[],
        membershipOrders:normalizedMembershipOrders,
        membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
        membershipAccountEvents:[...(Array.isArray(membershipAccountEvents)?membershipAccountEvents:[]),...(reconciled.events||[])],
        pricePlans:Array.isArray(pricePlans)?pricePlans:[],
        schedule:Array.isArray(schedule)?schedule:[],
        coaches:Array.isArray(coaches)?coaches:[],
        classes:Array.isArray(classes)?classes:[],
        campuses:Array.isArray(campuses)?campuses:[],
        feedbacks:Array.isArray(feedbacks)?feedbacks:[]
      },user);
      return sendJson(res,{...loaded,user});
    }
    const courtsMembershipResponse=await handleCourtsMembershipRequest({path,method,user,body,query});
    if(courtsMembershipResponse)return sendJson(res,courtsMembershipResponse.body,courtsMembershipResponse.status||200);
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    const teachingResponse=await handleTeachingRequest({path,method,user,body,query,res});
    if(teachingResponse)return teachingResponse;
    const pageDataResponse=await handlePageDataRequest({path,method,user,query});
    if(pageDataResponse)return sendJson(res,pageDataResponse.body,pageDataResponse.status||200);
    if(path==='/campuses'){await init();if(method==='GET')return sendJson(res,await listCampusesWithDefaults());if(method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const id=body.code||uuidv4();const r={...body,id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}}
    const caM=path.match(/^\/campuses\/(.+)$/);if(caM){const id=caM[1];if(method==='PUT'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const r={...body,id,updatedAt:new Date().toISOString()};await put(T_CAMPUSES,id,r);return sendJson(res,r);}if(method==='DELETE'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);const [students,coaches,classes,schedule,courts,packages,entitlements]=await Promise.all([scan(T_STUDENTS).catch(()=>[]),scan(T_COACHES).catch(()=>[]),scan(T_CLASSES).catch(()=>[]),scan(T_SCHEDULE).catch(()=>[]),scan(T_COURTS).catch(()=>[]),scan(T_PACKAGES).catch(()=>[]),scan(T_ENTITLEMENTS).catch(()=>[])]);assertCanDeleteCampus(id,{students,coaches,classes,schedule,courts,packages,entitlements});await del(T_CAMPUSES,id);return sendJson(res,{success:true});}}
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};

module.exports._test={
  ...matchTestExports,
  PREVIEW_TS_INSTANCE,
  RUNTIME_DEBUG_TABLES,
  normalizeRangePrimaryKey,
  resolveDataStage,
  assertRuntimeDebugReadable,
  buildRuntimeDataSourceDebugSnapshot,
  assertTableStoreTarget,
  MEMBERSHIP_TABLES,
  TEST_DATA_RESET_TABLES,
  scheduleLessonDelta,
  effectiveScheduleStatus,
  scheduleLessonChargeStatus,
  isScheduleLessonCharged,
  normalizeCoachLateInfo,
  buildCoachLateSettlementRows,
  assertClassSchedulable,
  assertLessonCapacity,
  validateScheduleConflicts,
  validateCourtBookingConflicts,
  buildEntitlementFromPurchase,
  buildPurchaseRecord,
  validateProductInput,
  normalizeProductRecord,
  validatePackageInput,
  normalizePackageRecord,
  validatePurchaseInputForPackage,
  assertCanEditProductWithReferences,
  assertCanEditPackageWithPurchases,
  assertCanEditPurchaseWithLedger,
  assertScheduleEntitlementRequired,
  scheduleParticipantSummary,
  collectMabaoSeedStaleRowIds,
  collectMabaoSeedImportedLedgerReplacementIds,
  collectDuplicateImportedLedgerIds,
  normalizeEntitlementLedgerRowsForView,
  syncEntitlementFromPurchase,
  writePurchaseAndEntitlementAtomic,
  validateEntitlementForSchedule,
  recommendEntitlements,
  scheduleEntitlementDeltas,
  resolveScheduleEntitlementDeltas,
  applyEntitlementLessonDelta,
  diffScheduleEntitlementDeltas,
  applyLinkedClassScheduleSnapshot,
  assertScheduleEditableAfterFeedback,
  isScheduleInsideDailyTimeWindows,
  scheduleEntitlementDelta,
  collectScheduleRiskWarnings,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  buildFeedbackRecord,
  feedbackScopeForSchedule,
  assertCanWriteSchedule,
  filterLoadAllForUser,
  buildWorkbenchStats,
  resolveWorkbenchState,
  decorateWorkbenchClasses,
  decorateWorkbenchStudents,
  decorateWorkbenchFeedbacks,
  workbenchLessonUnits,
  buildCoachRenameUpdates,
  buildStudentIdentityUpdates,
  buildProductRenameDisplayUpdates,
  assertCanDeleteCoachName,
  assertUniqueCoachName,
  assertAuthUserActive,
  mergeStoredAuthUser,
  userMatchPermissions,
  requireMatchAdminPermission,
  resolveWechatMiniConfig,
  buildWechatCode2SessionUrl,
  extractWechatOpenId,
  buildWechatBoundUser,
  buildWechatUnboundUser,
  buildAdminUserView,
  findAdminUserByPhone,
  buildWechatAccessTokenUrl,
  extractWechatAccessToken,
  fetchWechatPhoneNumber,
  findWechatScheduleRecipient,
  findWechatUserByOpenId,
  buildScheduleSubscribeMessage,
  buildScheduleNotificationUpdate,
  collectCourseReminderCandidates,
  buildCourseReminderSubscribeMessage,
  normalizeVenue,
  rangesOverlap,
  computeCourtFinance,
  summarizeCourtFinanceRevenue,
  buildMatchFinanceDailyReport:matchFinanceBridge.buildMatchFinanceDailyReport,
  buildMatchCourtFinanceHistoryRow:matchFinanceBridge.buildMatchCourtFinanceHistoryRow,
  buildMatchCourtFinanceRefundRow:matchFinanceBridge.buildMatchCourtFinanceRefundRow,
  normalizePricePlan,
  assertPricePlanInput,
  quoteVenuePrice,
  normalizeMembershipBenefitTemplate,
  buildMembershipPlanRecord,
  buildMembershipPurchase,
  summarizeMembershipBenefits,
  isDuplicateMembershipOrderSubmission,
  buildMembershipAccountEventRecord,
  buildMembershipBenefitLedgerRecord,
  buildMembershipGrantLedgerRows,
  allocateMembershipBenefitUsage,
  reconcileMembershipAccounts,
  mergeCourtRecords,
  normalizeMembershipPlanViewRecord,
  normalizeMembershipOrderViewRecord,
  isTransientStorageError,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  extractDepositAmountFromText,
  importCourtRows,
  assertCanDeleteProduct,
  assertCanDeleteClass,
  assertCanWriteClass,
  nextClassNoFromClasses,
  isClassNoReservationConflict,
  validateClassInput,
  buildClassCreateRecord,
  buildClassUpdateRecord,
  assertCanDeletePackage,
  assertCanVoidPurchase,
  assertCanDeleteEntitlement,
  assertStudentWriteAccess,
  assertCanEditClassWithSchedules,
  assertCanDeleteSchedule,
  assertCanDeleteStudent,
  assertCanDeleteCourt,
  courtDeleteAction,
  assertCanDeleteCampus,
  deleteCourtsByIds,
  getRuntimeEnsuredTables,
  getTestDataResetTables,
  clearTables,
  buildBootstrapSafetyFlags,
  MATCH_SQL_TABLES,
  getMatchSqlPool,
  COURT_ACCOUNT_LIST_PROJECTION_FIELDS,
  getCourtRecordForTest,
  removeMatchCourtFinanceRowsForTest
};
