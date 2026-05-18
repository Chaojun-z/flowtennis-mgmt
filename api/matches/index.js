function createMatchModule(deps){
  const {
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
    financeBridge
  } = deps;
  const {
    getMatchFinanceDailyReportForAdmin,
    syncMatchFeeSplitToCourtFinance,
    syncMatchFeeSplitRefundToCourtFinance
  } = financeBridge;

function readHeader(req,name){
  return String(req?.headers?.[name]||'').trim();
}
function resolveMatchClientContext(req){
  return {
    client: readHeader(req,'x-flowtennis-client').toLowerCase(),
    clientEnv: readHeader(req,'x-flowtennis-client-env').toLowerCase(),
    wechatEnvVersion: readHeader(req,'x-flowtennis-wechat-env-version').toLowerCase()
  };
}
function resolveMatchRuntimeStage(env=process.env){
  const appEnv=String(env?.APP_ENV||'').trim().toLowerCase();
  if(appEnv)return appEnv;
  const vercelEnv=String(env?.VERCEL_ENV||'').trim().toLowerCase();
  if(vercelEnv)return vercelEnv;
  const nodeEnv=String(env?.NODE_ENV||'').trim().toLowerCase();
  return nodeEnv||'development';
}
function assertMatchWriteAllowed(req,{runtimeStage=resolveMatchRuntimeStage()}={}){
  if(runtimeStage!=='production')return;
  const clientContext=resolveMatchClientContext(req);
  const isMiniMatchClient=clientContext.client==='mini-match';
  const hitsNonProdEnv=clientContext.clientEnv&&clientContext.clientEnv!=='production';
  const hitsNonReleaseWechat=clientContext.wechatEnvVersion&&clientContext.wechatEnvVersion!=='release';
  if(isMiniMatchClient&&(hitsNonProdEnv||hitsNonReleaseWechat)){
    throw new Error('测试版约球小程序禁止写入正式环境，请改连 staging API。');
  }
}

function buildMatchSubscribeMessage({templateId,openid,match,content}){
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/match-detail/index?id=${encodeURIComponent(String(match?.id||''))}`,
    data:{
      thing1:{value:truncateWechatValue(match?.title||'约球通知')},
      thing2:{value:truncateWechatValue(content||'约球状态已更新')},
      time3:{value:String(match?.starttime||match?.startTime||'').replace('T',' ').slice(0,16)}
    }
  };
}
async function notifyMatchUsers(matchId,action){
  if(!MATCH_WECHAT_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const pool=getMatchSqlPool();
  const [matchRes,usersRes]=await Promise.all([
    pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
    pool.query("SELECT DISTINCT u.openid,u.id FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id WHERE r.matchId=$1 OR u.id=(SELECT creatorUserId FROM match_posts WHERE id=$1)",[matchId])
  ]);
  const match=matchRes.rows[0];
  if(!match)return {skipped:true,reason:'missing_match'};
  let sent=0,failed=0;
  for(const user of usersRes.rows){
    try{
      await sendWechatSubscribeMessage(buildMatchSubscribeMessage({templateId:MATCH_WECHAT_TEMPLATE_ID,openid:user.openid,match,content:matchNotificationText(action,match.title)}));
      sent++;
    }catch(err){
      failed++;
      await pool.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user','system','notify_failed',JSON.stringify({userId:user.id,action}),JSON.stringify({error:String(err?.message||err)})]).catch(()=>null);
    }
  }
  return {sent,failed};
}

async function canMatchUserCreate(userId){
  const pool=getMatchSqlPool();
  const userRes=await pool.query('SELECT * FROM match_users WHERE id=$1',[userId]);
  const user=userRes.rows[0]||{};
  const phone=normalizePhone(user.phone||'');
  if(!phone)return false;
  const adminUser=findAdminUserByPhone(await scan(T_USERS).catch(()=>[]),phone)||await getCachedRow(T_USERS,phone).catch(()=>null);
  return canMatchUserCreateByAdminUser(adminUser);
}

function buildMatchUserToken(user){
  return jwt.sign({id:user.id,type:'match_user',openid:user.openid},JWT_SECRET,{expiresIn:'7d'});
}
function readOptionalMatchUser(req){
  const user=authUser(req);
  return user&&user.type==='match_user'?user:null;
}
function assertMatchPostInput(input){
  const title=String(input.title||'').trim();
  if(!title)throw new Error('请填写标题');
  const matchType=normalizeMatchType(input.matchType);
  if(!['single','double'].includes(matchType))throw new Error('请选择约球类型');
  const targetHeadcount=parseInt(input.targetHeadcount,10);
  if(!Number.isInteger(targetHeadcount)||targetHeadcount<2)throw new Error('请填写有效人数');
  const rawNtrpMin=String(input.ntrpMin??'').trim();
  const rawNtrpMax=String(input.ntrpMax??'').trim();
  const hasPresetLevel=rawNtrpMin!==''||rawNtrpMax!=='';
  const ntrpMin=hasPresetLevel?Number(rawNtrpMin):0;
  const ntrpMax=hasPresetLevel?Number(rawNtrpMax):0;
  if(hasPresetLevel&&(!isValidNtrp(ntrpMin)||!isValidNtrp(ntrpMax)||ntrpMin>ntrpMax))throw new Error('NTRP 范围不正确');
  if(!hasPresetLevel&&(rawNtrpMin!==rawNtrpMax))throw new Error('NTRP 范围不正确');
  if(!['不限','男生','女生'].includes(input.genderPreference))throw new Error('请选择性别偏好');
  const estimatedCourtFee=normalizeMoney(input.estimatedCourtFee);
  if(estimatedCourtFee<=0)throw new Error('费用必须大于 0');
  const venueName=String(input.venueName||'').trim();
  if(!venueName)throw new Error('请选择球场');
  const startMs=dateMs(input.startTime);
  const endMs=dateMs(input.endTime);
  if(!Number.isFinite(startMs))throw new Error('请选择开始时间');
  if(!Number.isFinite(endMs)||endMs<=startMs)throw new Error('结束时间必须晚于开始时间');
  if(String(input.startTime||'').slice(0,10)!==String(input.endTime||'').slice(0,10))throw new Error('不能跨天');
  return {...input,title,matchType,targetHeadcount,ntrpMin,ntrpMax,levelMode:hasPresetLevel?'preset':'first_join',estimatedCourtFee,venueName,status:input.status||'open'};
}
function normalizeMatchType(value){
  const raw=String(value||'').trim();
  if(raw==='单打')return 'single';
  if(raw==='双打')return 'double';
  return raw;
}
function maskPhone(value=''){
  const phone=normalizePhone(value);
  if(!/^1\d{10}$/.test(phone))return '';
  return `${phone.slice(0,3)}****${phone.slice(-4)}`;
}
function isValidNtrp(value){
  return Number.isFinite(value)&&value>=1&&value<=5&&Math.abs(value*2-Math.round(value*2))<0.001;
}
function formatNtrpValue(value){
  const num=Number(value);
  if(!isValidNtrp(num))return '';
  return num.toFixed(1);
}
function formatNtrpRangeText(minValue,maxValue){
  const min=formatNtrpValue(minValue);
  const max=formatNtrpValue(maxValue);
  if(min&&max)return min===max?min:`${min}-${max}`;
  return min||max||'待首位报名定级';
}
function activeMatchRegistrations(registrations=[]){
  return (registrations||[]).filter(row=>String(row.registrationstatus||row.registrationStatus)==='registered');
}
function activeRegistrationLevels(registrations=[]){
  return activeMatchRegistrations(registrations)
    .map(row=>Number(row.ntrplevel||row.ntrpLevel||0))
    .filter(isValidNtrp)
    .sort((a,b)=>a-b);
}
function resolveEffectiveLevelRange(row,registrations=[]){
  const levels=activeRegistrationLevels(registrations);
  if(levels.length>0)return {min:levels[0],max:levels[levels.length-1],pending:false};
  const min=Number(row.ntrpmin||row.ntrpMin||0);
  const max=Number(row.ntrpmax||row.ntrpMax||0);
  if(isValidNtrp(min)&&isValidNtrp(max))return {min,max,pending:false};
  return {min:0,max:0,pending:true};
}
function matchTimelineStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(status==='cancelled')return '已取消';
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startMs=dateMs(match.startTime||match.starttime);
  const endMs=dateMs(match.endTime||match.endtime);
  if(Number.isFinite(endMs)&&nowMs>=endMs)return '已结束';
  if(Number.isFinite(startMs)&&nowMs<startMs)return '待开始';
  return '进行中';
}
function deriveMatchStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(['cancelled','settled','fee_pending'].includes(status))return status;
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startTime=match.startTime||match.starttime;
  const endTime=match.endTime||match.endtime;
  if(status==='booked'){
    if(Number.isFinite(dateMs(endTime))&&nowMs>=dateMs(endTime))return 'attendance_pending';
    if(Number.isFinite(dateMs(startTime))&&nowMs>=dateMs(startTime))return 'playing';
  }
  return status;
}
function matchDurationHours(startTime,endTime){
  const startMs=dateMs(startTime);
  const endMs=dateMs(endTime);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return 0;
  return (endMs-startMs)/(60*60*1000);
}
function isFourPlayerGroupMatch(match){
  return Number(match?.targetheadcount||match?.targetHeadcount||0)===4;
}
function computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount}={}){
  const base=Math.round(normalizeMoney(finalCourtFee));
  const count=Number(participantCount||0);
  if(count<=1)throw new Error('1人默认取消，不能生成AA');
  let surcharge=0;
  if(normalizeMatchType(matchType)==='single'&&count===2&&matchDurationHours(startTime,endTime)>=1.99)surcharge=60;
  return base+surcharge;
}
function buildPreviewAaText({matchType,startTime,endTime,estimatedCourtFee=0,finalCourtFee=0,activeCount=0,targetHeadcount=0}={}){
  const currentCount=Number(activeCount||0);
  const previewCount=currentCount>1?currentCount:(currentCount===0?Number(targetHeadcount||0):0);
  const finalFee=normalizeMoney(finalCourtFee);
  const estimatedFee=normalizeMoney(estimatedCourtFee);
  if(previewCount>1&&finalFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:finalFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(previewCount>1&&estimatedFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:estimatedFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(currentCount===1)return '待成团';
  return 'AA待定';
}
function splitAaFee(finalCourtFee,participantIds){
  const total=Math.round(normalizeMoney(finalCourtFee));
  const ids=[...new Set((participantIds||[]).filter(Boolean).map(String))];
  if(total<=0)throw new Error('最终费用必须大于 0');
  if(ids.length<=0)throw new Error('没有可计费参与人');
  const each=Math.ceil(total/ids.length);
  return ids.map((userId,index)=>{
    const amount=index===ids.length-1?total-each*(ids.length-1):each;
    return {userId,amount};
  });
}
async function withMatchSqlTransaction(fn){
  const client=await getMatchSqlPool().connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(err){
    await client.query('ROLLBACK').catch(()=>null);
    throw err;
  }finally{
    client.release();
  }
}
async function registerMatchUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['open','full'].includes(status))throw new Error('当前状态不能报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能报名');
    const [dup,activeRegsRes,userRes]=await Promise.all([
      client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]),
      client.query("SELECT r.*,u.ntrpLevel FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.registrationStatus='registered' ORDER BY r.createdAt ASC",[matchId]),
      client.query('SELECT * FROM match_users WHERE id=$1',[userId])
    ]);
    if(dup.rowCount>0)throw new Error('已报名');
    const user=userRes.rows[0];
    if(!user)throw new Error('用户不存在');
    const userNtrp=Number(user.ntrplevel||user.ntrpLevel||0);
    if(!isValidNtrp(userNtrp))throw new Error('请先在“我的”页面设置真实水平');
    const activeRegs=activeRegsRes.rows;
    const count=activeRegs.length;
    if(count>=Number(match.targetheadcount||match.targetHeadcount))throw new Error('名额已满');
    const currentMin=Number(match.ntrpmin||match.ntrpMin||0);
    const levelMode=String(match.levelmode||match.levelMode||'preset');
    if(levelMode==='first_join'&&count===0&&currentMin<=0){
      await client.query('UPDATE match_posts SET ntrpMin=$1,ntrpMax=$1,updatedAt=NOW() WHERE id=$2',[userNtrp,matchId]);
    }else if(isValidNtrp(currentMin)&&userNtrp<currentMin){
      throw new Error(`本局最低水平为 ${currentMin.toFixed(1)}`);
    }
    const id=uuidv4();
    await client.query("INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt) VALUES($1,$2,$3,'registered',NOW())",[id,matchId,userId]);
    const nextCount=count+1;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    let formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    let justFormedGroup=false;
    if(isFourPlayerGroupMatch(match)&&nextCount>=4){
      const prepayDeadlineAt=new Date(Date.now()+MATCH_PREPAY_WINDOW_HOURS*60*60*1000).toISOString();
      const participantIds=[...activeRegs.map(row=>String(row.userid||row.userId)),String(userId)];
      const existingFeeRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
      if(existingFeeRes.rowCount<=0){
        const ledger=buildGroupPrepayLedger({matchId,estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,participantIds});
        await client.query(
          'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
          [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.record.status]
        );
        for(const split of ledger.splits){
          await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount]);
        }
        justFormedGroup=true;
      }
      formationStatus='group_ready';
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NOW(),prepayDeadlineAt=$3,updatedAt=NOW() WHERE id=$4',[nextStatus,formationStatus,prepayDeadlineAt,matchId]);
    }else{
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,formationStatus,matchId]);
    }
    return {
      id,
      currentHeadcount:nextCount,
      status:nextStatus,
      formationStatus,
      justFormedGroup,
      formationNotice:justFormedGroup?'本局已成团，需在2小时内完成预付；全员付款成功后约球生效':''};
  });
}
function toMatchView(row,registrations=[],viewerId='',feeSplits=[]){
  const active=(registrations||[]).filter(r=>String(r.registrationstatus||r.registrationStatus)==='registered');
  const viewerRegistration=(registrations||[]).find(r=>String(r.userid||r.userId)===String(viewerId));
  const finalFee=normalizeMoney(row.finalcourtfee||row.finalCourtFee);
  const activeCount=active.length;
  const viewerFeeSplit=(feeSplits||[]).find(row=>String(row.userid||row.userId)===String(viewerId))||null;
  const levelRange=resolveEffectiveLevelRange(row,active);
  const formationStatus=String(row.formationstatus||row.formationStatus||'free_open');
  const canSelfCancel=Boolean(viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered'&&formationStatus!=='group_locked');
  const derivedStatus=deriveMatchStatus(row);
  const statusText=formationStatus==='group_ready'?'待预付':formationStatus==='group_locked'?'已成团':matchStatusText(derivedStatus);
  return {
    id:row.id,
    creatorUserId:row.creatoruserid||row.creatorUserId,
    title:row.title,
    matchType:row.matchtype||row.matchType,
    targetHeadcount:Number(row.targetheadcount||row.targetHeadcount||0),
    currentHeadcount:activeCount,
    startTime:row.starttime||row.startTime,
    endTime:row.endtime||row.endTime,
    venueName:row.venuename||row.venueName||'',
    venueAddress:row.venueaddress||row.venueAddress||'',
    ntrpMin:levelRange.min,
    ntrpMax:levelRange.max,
    ntrpRangeText:formatNtrpRangeText(levelRange.min,levelRange.max),
    levelMode:row.levelmode||row.levelMode||'preset',
    genderPreference:row.genderpreference||row.genderPreference||'不限',
    estimatedCourtFee:normalizeMoney(row.estimatedcourtfee||row.estimatedCourtFee),
    finalCourtFee:finalFee,
    status:derivedStatus,
    statusText,
    timelineStatusText:matchTimelineStatus(row),
    formationStatus,
    prepayDeadlineAt:row.prepaydeadlineat||row.prepayDeadlineAt||'',
    statusHintText:buildMatchStatusHint({match:row,registrations:active,viewerId,viewerJoined:Boolean(viewerRegistration)}),
    viewerJoined:!!viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered',
    viewerIsCreator:String(row.creatoruserid||row.creatorUserId)===String(viewerId),
    viewerRegistrationStatus:viewerRegistration?.registrationstatus||viewerRegistration?.registrationStatus||'',
    aaDisplayText:buildPreviewAaText({matchType:row.matchtype||row.matchType,startTime:row.starttime||row.startTime,endTime:row.endtime||row.endTime,estimatedCourtFee:row.estimatedcourtfee||row.estimatedCourtFee,finalCourtFee:finalFee,activeCount,targetHeadcount:row.targetheadcount||row.targetHeadcount}),
    viewerFeeSplit,
    offlinePaymentText:viewerFeeSplit&&String(viewerFeeSplit.paystatus||viewerFeeSplit.payStatus)==='pending'?'请线下联系运营收款，付款后由管理端确认':'',
    canSelfCancel,
    registrations:active.map(reg=>({
      ...reg,
      userName:String(reg.nickname||reg.nickName||maskPhone(reg.phone)||reg.userid||reg.userId||'球友').trim(),
      ntrpText:formatNtrpValue(reg.ntrplevel||reg.ntrpLevel)||'未设水平',
      attendanceRateText:reg.attendanceratetext||reg.attendanceRateText||'暂无守约率',
      finalAttendanceStatus:reg.finalattendancestatus||reg.finalAttendanceStatus||'pending'
    }))
  };
}
async function loadAttendanceRateMap(pool,userIds=[]){
  const uniqueUserIds=[...new Set((userIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!uniqueUserIds.length)return new Map();
  const statsRows=await pool.query(`
    SELECT
      userId,
      COUNT(*) FILTER (WHERE finalStatus IN ('attended','absent'))::int AS resolved_count,
      COUNT(*) FILTER (WHERE finalStatus='attended')::int AS attended_count
    FROM match_attendance
    WHERE userId = ANY($1::text[])
    GROUP BY userId
  `,[uniqueUserIds]);
  const rateMap=new Map();
  for(const row of statsRows.rows){
    const resolved=Number(row.resolved_count||0);
    const attended=Number(row.attended_count||0);
    rateMap.set(String(row.userid||row.userId),resolved>0?`${Math.round(attended*100/resolved)}%`:'暂无守约率');
  }
  return rateMap;
}
async function loadMatchRegistrationViews(pool,matchIds=[],{registeredOnly=true}={}){
  const uniqueMatchIds=[...new Set((matchIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!uniqueMatchIds.length)return [];
  const statusClause=registeredOnly?"AND r.registrationStatus='registered'":'';
  const regRows=await pool.query(`
    SELECT
      r.*,
      u.nickName,
      u.phone,
      u.avatarUrl,
      u.ntrpLevel,
      a.finalStatus
    FROM match_registrations r
    LEFT JOIN match_users u ON u.id=r.userId
    LEFT JOIN match_attendance a ON a.matchId=r.matchId AND a.userId=r.userId
    WHERE r.matchId = ANY($1::text[])
    ${statusClause}
  `,[uniqueMatchIds]);
  const rateMap=await loadAttendanceRateMap(pool,regRows.rows.map(row=>String(row.userid||row.userId||'')));
  return regRows.rows.map(row=>({
    ...row,
    attendanceRateText:rateMap.get(String(row.userid||row.userId||''))||'暂无守约率'
  }));
}
function toMatchDetailResponse(view){
  if(!view)return null;
  const registrations=Array.isArray(view.registrations)?view.registrations:[];
  const match={...view};
  delete match.registrations;
  return {...view,match,registrations};
}
function matchStatusText(status){
  return ({open:'招募中',full:'已满员',booked:'已订场',playing:'进行中',attendance_pending:'待确认到场',fee_pending:'待确认费用',settled:'已结清',cancelled:'已取消'})[status]||status;
}
function assertMatchBookingInput(input){
  const finalCourtFee=normalizeMoney(input.finalCourtFee);
  if(finalCourtFee<=0)throw new Error('请填写最终场地费');
  const bookingStatus=input.bookingStatus||'booked';
  if(!['booked','cancelled'].includes(bookingStatus))throw new Error('订场状态不正确');
  return {...input,finalCourtFee,bookingStatus};
}
function assertBookedWithdrawalInput(input={}){
  const financialResponsibility=String(input.financialResponsibility||'').trim();
  if(!['charge','waive','abnormal'].includes(financialResponsibility))throw new Error('退赛责任不正确');
  const reason=String(input.reason||input.withdrawalReason||'').trim();
  return {financialResponsibility,reason};
}
function assertMatchFeeSplitUpdateInput(input={}){
  const payStatus=String(input.payStatus||'paid').trim();
  if(!['pending','paid','waived','refunded','bad_debt','abnormal'].includes(payStatus))throw new Error('收款状态不正确');
  const note=String(input.note||'').trim();
  const amount=input.amount==null?null:normalizeMoney(input.amount);
  if(amount!=null&&amount<0)throw new Error('AA金额不能小于 0');
  if((['waived','refunded','bad_debt','abnormal'].includes(payStatus)||amount!=null)&&!note)throw new Error('请填写原因');
  const paidAmount=input.paidAmount==null?null:normalizeMoney(input.paidAmount);
  return {payStatus,paidAmount,amount,note};
}
function assertMatchReplacementTransferInput(input={}){
  const fromUserId=String(input.fromUserId||'').trim();
  if(!fromUserId)throw new Error('请选择原报名人');
  const replacementPhone=assertPhone(input.replacementPhone||input.phone||'');
  const replacementPayStatus=String(input.replacementPayStatus||'paid').trim();
  if(!['pending','paid'].includes(replacementPayStatus))throw new Error('替补付款状态不正确');
  const refundNote=String(input.refundNote||input.note||'').trim();
  if(!refundNote)throw new Error('请填写转让说明');
  return {
    fromUserId,
    replacementPhone,
    replacementPayStatus,
    refundNote,
    transferNote:String(input.transferNote||'').trim()
  };
}
function resolveFinalAttendanceStatus(row){
  if(row?.creatorStatus==='attended'||row?.creatorstatus==='attended')return 'attended';
  if(row?.creatorStatus==='absent'||row?.creatorstatus==='absent')return 'absent';
  return 'pending';
}
function buildMatchStatusHint({match={},registrations=[],viewerId='',viewerJoined=false}={}){
  const activeCount=activeMatchRegistrations(registrations).length;
  const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
  const timeline=matchTimelineStatus(match);
  if(timeline==='已结束'&&String(match.status||'')!=='settled')return '球局已结束，等待到场和费用确认';
  if(resolveEffectiveLevelRange(match,registrations).pending)return '未设水平时，以首位报名球友的真实水平定级';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_ready')return '本局已成团，需在2小时内完成预付，全员付款成功约球生效';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_locked')return '四人成团已锁定，如需退出请自行联系替补并由后台处理名额转让';
  if(isFourPlayerGroupMatch(match)&&activeCount<4)return '未满4人前仅占位报名，不收款，可自由取消';
  return '';
}
function buildGroupPrepayLedger({matchId,estimatedCourtFee=0,participantIds=[]}={}){
  const total=Math.round(normalizeMoney(estimatedCourtFee));
  if(total<=0)throw new Error('预付金额必须大于 0');
  const splits=splitAaFee(total,participantIds);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:total,
      finalCourtFee:total,
      participantCount:splits.length,
      aaAmount:Math.ceil(total/splits.length),
      roundingRule:'ceil',
      roundingDifference:total-splits.reduce((sum,row)=>sum+row.amount,0),
      status:'prepay_pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
function resolveMatchPrepayClosure({mode='cancelled',reason='',splits=[]}={}){
  const normalizedReason=String(reason||'').trim();
  const nextSplits=(splits||[]).map((row)=>{
    const paidAmount=normalizeMoney(row.paidamount??row.paidAmount??0);
    const nextStatus=paidAmount>0||String(row.paystatus||row.payStatus||'')==='paid'?'refunded':'cancelled';
    const baseNote=String(row.note||'').trim();
    return {
      ...row,
      payStatus:nextStatus,
      paidAmount,
      note:[baseNote,normalizedReason].filter(Boolean).join('；')
    };
  });
  const refunded=nextSplits.some((row)=>row.payStatus==='refunded');
  const recordStatus=mode==='downgraded'
    ? (refunded?'prepay_downgraded_refunded':'prepay_downgraded')
    : (refunded?'prepay_cancelled_refunded':'prepay_cancelled');
  return {recordStatus,splits:nextSplits};
}
async function closeMatchPrepayLedger(client,matchId,{mode='cancelled',reason=''}={}){
  const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
  const feeRecord=feeRecordRes.rows[0]||null;
  if(!feeRecord)return {changed:false,recordStatus:'',splits:[]};
  if(!/^prepay_/.test(String(feeRecord.status||'')))return {changed:false,recordStatus:String(feeRecord.status||''),splits:[]};
  const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 FOR UPDATE',[matchId]);
  const closure=resolveMatchPrepayClosure({mode,reason,splits:splitRes.rows});
  for(const row of closure.splits){
    await client.query(
      'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
      [row.payStatus,row.paidAmount,row.payStatus==='refunded'?(row.paidat||row.paidAt||new Date()):null,row.note||'',row.id]
    );
  }
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[closure.recordStatus,matchId]);
  return {...closure,changed:true};
}
async function syncMatchFeeRecordState(client,matchId,{isPrepay=false}={}){
  const activeSplitsRes=await client.query("SELECT payStatus FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
  const settled=activeSplitsRes.rows.length>0&&activeSplitsRes.rows.every(row=>['paid','waived'].includes(row.paystatus||row.payStatus));
  if(isPrepay){
    const status=settled?'prepay_paid':'prepay_pending';
    await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
    await client.query("UPDATE match_posts SET formationStatus=$2,updatedAt=NOW() WHERE id=$1",[matchId,settled?'group_locked':'group_ready']);
    return {settled,status};
  }
  const status=settled?'settled':'confirmed';
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
  if(settled)await client.query("UPDATE match_posts SET status='settled',updatedAt=NOW() WHERE id=$1",[matchId]);
  return {settled,status};
}
function buildMatchFeeLedger({matchId,estimatedCourtFee=0,finalCourtFee,matchType,startTime,endTime,participants=[]}={}){
  const billable=(participants||[]).filter(row=>row.finalStatus==='attended'||row.finalstatus==='attended'||row.chargeAbsent===true);
  const settlementTotal=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount:billable.length});
  const splits=splitAaFee(settlementTotal,billable.map(row=>row.userId||row.userid));
  const distributedTotal=splits.reduce((sum,row)=>sum+row.amount,0);
  const aaAmount=Math.ceil(normalizeMoney(settlementTotal)/splits.length);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:normalizeMoney(estimatedCourtFee),
      finalCourtFee:Math.round(normalizeMoney(settlementTotal)),
      participantCount:splits.length,
      aaAmount,
      roundingRule:'ceil',
      roundingDifference:Math.round(normalizeMoney(settlementTotal))-distributedTotal,
      status:'pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
async function listMatchesForViewer(viewerId){
  const pool=getMatchSqlPool();
  const matches=await pool.query("SELECT * FROM match_posts WHERE status<>'cancelled' ORDER BY startTime ASC");
  const registrations=await loadMatchRegistrationViews(pool,matches.rows.map(row=>String(row.id||'')),{registeredOnly:true});
  const regsByMatch=new Map();
  for(const row of registrations){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],viewerId));
}
async function getMatchForViewer(matchId,viewerId){
  const pool=getMatchSqlPool();
  const match=await pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]);
  if(!match.rows[0])return null;
  const [regs,splits]=await Promise.all([
    loadMatchRegistrationViews(pool,[matchId],{registeredOnly:false}),
    pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId])
  ]);
  return toMatchView(match.rows[0],regs,viewerId,splits.rows);
}
async function createMatchForUser(userId,input){
  if(!(await canMatchUserCreate(userId)))throw new Error('仅管理员可发起约球');
  const row=assertMatchPostInput(input);
  const id=uuidv4();
  await getMatchSqlPool().query(
    'INSERT INTO match_posts(id,creatorUserId,title,matchType,targetHeadcount,startTime,endTime,venueName,venueAddress,venueLatitude,venueLongitude,ntrpMin,ntrpMax,levelMode,genderPreference,estimatedCourtFee,status,formationStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())',
    [id,userId,row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,'open','free_open']
  );
  return getMatchForViewer(id,userId);
}
async function updateMatchForUser(matchId,userId,input){
  const row=assertMatchPostInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可编辑');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能编辑');
    const regs=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    await client.query(
      'UPDATE match_posts SET title=$1,matchType=$2,targetHeadcount=$3,startTime=$4,endTime=$5,venueName=$6,venueAddress=$7,venueLatitude=$8,venueLongitude=$9,ntrpMin=$10,ntrpMax=$11,levelMode=$12,genderPreference=$13,estimatedCourtFee=$14,updatedAt=NOW() WHERE id=$15',
      [row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,matchId]
    );
    if((regs.rows[0]?.count||0)>0){
      await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'match_update',JSON.stringify(match),JSON.stringify(row)]);
    }
    return {success:true};
  });
}
async function closeMatchFeeLedger(client,matchId,note,{feeRecord=null,onlyPrepay=false,mode='cancelled'}={}){
  const lockedFeeRecord=feeRecord||((await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId])).rows[0]||null);
  if(!lockedFeeRecord)return {feeRecord:null,isPrepay:false,updatedSplits:[]};
  const isPrepay=/^prepay_/.test(String(lockedFeeRecord.status||''));
  if(onlyPrepay&&!isPrepay)return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits:[]};
  const splitRows=(await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 FOR UPDATE',[matchId])).rows;
  if(isPrepay){
    const closure=resolveMatchPrepayClosure({mode,reason:note,splits:splitRows});
    for(const split of closure.splits){
      await client.query(
        'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
        [split.payStatus,split.paidAmount,split.payStatus==='refunded'?(split.paidat||split.paidAt||new Date()):null,split.note||'',String(split.id||'')]
      );
    }
    await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE id=$2',[closure.recordStatus,String(lockedFeeRecord.id||'')]);
    return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits:closure.splits};
  }
  const updatedSplits=[];
  for(const split of splitRows){
    const currentStatus=String(split.paystatus||split.payStatus||'').trim();
    if(['cancelled','refunded'].includes(currentStatus))continue;
    const paidAmount=normalizeMoney(split.paidamount||split.paidAmount);
    const nextStatus=paidAmount>0?'refunded':'cancelled';
    const nextPaidAmount=nextStatus==='refunded'?paidAmount:0;
    await client.query(
      'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
      [nextStatus,nextPaidAmount,nextStatus==='refunded'?new Date():null,note,String(split.id||'')]
    );
    updatedSplits.push({...split,payStatus:nextStatus,paidAmount:nextPaidAmount});
  }
  const nextRecordStatus=updatedSplits.some(row=>String(row.payStatus||'')==='refunded')?'refunded':'cancelled';
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE id=$2',[nextRecordStatus,String(lockedFeeRecord.id||'')]);
  return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits};
}
async function cancelMatchForUser(matchId,userId,reason=''){
  const cancellationReason=String(reason||'发起者取消').trim()||'发起者取消';
  const financeSync={refundUserIds:[]};
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可取消');
    const status=deriveMatchStatus(match);
    if(!['open','full','booked'].includes(status))throw new Error('当前状态不能取消');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消');
    let feeClosure=null;
    if(status==='booked'){
      await client.query(
        "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility='waive',withdrawalReason=$1,withdrawalHandledBy=$2,withdrawalHandledAt=NOW() WHERE matchId=$3 AND registrationStatus='registered'",
        [cancellationReason,userId,matchId]
      );
      feeClosure=await closeMatchFeeLedger(client,matchId,cancellationReason,{mode:'cancelled'});
      if(feeClosure&&!feeClosure.isPrepay){
        financeSync.refundUserIds=feeClosure.updatedSplits
          .filter(row=>String(row.payStatus||'')==='refunded')
          .map(row=>String(row.userid||row.userId||''))
          .filter(Boolean);
      }
    }
    await client.query("UPDATE match_posts SET status='cancelled',formationStatus='free_open',cancelReason=$1,prepayTriggeredAt=NULL,prepayDeadlineAt=NULL,updatedAt=NOW() WHERE id=$2",[cancellationReason,matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,status==='booked'?'match_cancel_booked':'match_cancel',JSON.stringify(match),JSON.stringify({reason:cancellationReason,closedFeeSplits:feeClosure?.updatedSplits?.length||0})]);
    return {success:true,status:'cancelled',closedFeeSplits:feeClosure?.updatedSplits?.length||0};
  });
  for(const refundUserId of financeSync.refundUserIds){
    await syncMatchFeeSplitRefundToCourtFinance(matchId,refundUserId,userId,cancellationReason).catch(()=>null);
  }
  notifyMatchUsers(matchId,'match_update').catch(()=>null);
  return result;
}
async function cancelRegistrationForUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(status==='booked')throw new Error('已订场，请联系运营处理');
    if(formationStatus==='group_locked')throw new Error('四人成团并付款后不能自主退局，请先联系替补');
    if(!['open','full'].includes(status))throw new Error('当前状态不能取消报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消报名');
    const result=await client.query("UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW() WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' RETURNING id",[matchId,userId]);
    if(result.rowCount<=0)throw new Error('未报名');
    const countRes=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const nextCount=countRes.rows[0]?.count||0;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    if(isFourPlayerGroupMatch(match)&&nextCount<4){
      const feeClosure=await closeMatchFeeLedger(client,matchId,'四人局人数不足，已降级为自由局',{onlyPrepay:true,mode:'downgraded'});
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NULL,prepayDeadlineAt=NULL,updatedAt=NOW() WHERE id=$3',[nextStatus,'free_open',matchId]);
      await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'formation_downgrade',JSON.stringify(match),JSON.stringify({reason:'四人局人数不足，已降级为自由局',closedFeeSplits:feeClosure.updatedSplits.length})]);
      return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus:'free_open'};
    }
    await client.query('UPDATE match_posts SET status=$1,updatedAt=NOW() WHERE id=$2',[nextStatus,matchId]);
    return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus};
  });
}
async function listAdminMatches(){
  const pool=getMatchSqlPool();
  const [matches,registrations,bookings,fees,splits,logs]=await Promise.all([
    pool.query('SELECT * FROM match_posts ORDER BY startTime DESC'),
    pool.query('SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId'),
    pool.query('SELECT * FROM match_bookings ORDER BY createdAt DESC'),
    pool.query('SELECT * FROM match_fee_records ORDER BY createdAt DESC'),
    pool.query('SELECT s.*,u.nickName,u.phone FROM match_fee_splits s LEFT JOIN match_users u ON u.id=s.userId ORDER BY s.createdAt ASC'),
    pool.query('SELECT * FROM match_operation_logs ORDER BY createdAt DESC')
  ]);
  const regsByMatch=new Map();
  for(const row of registrations.rows){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  const bookingByMatch=new Map(bookings.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeByMatch=new Map(fees.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeSplitsByMatch=new Map();
  for(const row of splits.rows){
    const key=String(row.matchid||row.matchId);
    feeSplitsByMatch.set(key,[...(feeSplitsByMatch.get(key)||[]),row]);
  }
  const logsByMatch=new Map();
  for(const row of logs.rows){
    const key=String(row.matchid||row.matchId);
    logsByMatch.set(key,[...(logsByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>({...toMatchView(row,regsByMatch.get(String(row.id))||[],''),booking:bookingByMatch.get(String(row.id))||null,feeRecord:feeByMatch.get(String(row.id))||null,feeSplits:feeSplitsByMatch.get(String(row.id))||[],operationLogs:logsByMatch.get(String(row.id))||[]}));
}
async function adminBookMatch(matchId,operatorId,input){
  const booking=assertMatchBookingInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const id=uuidv4();
    await client.query(
      'INSERT INTO match_bookings(id,matchId,operatorUserId,venueNameFinal,venueAddressFinal,venueLatitudeFinal,venueLongitudeFinal,courtNo,bookingStartTime,bookingEndTime,finalCourtFee,bookingStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())',
      [id,matchId,operatorId,booking.venueNameFinal||'',booking.venueAddressFinal||'',booking.venueLatitudeFinal||null,booking.venueLongitudeFinal||null,booking.courtNo||'',booking.bookingStartTime||match.starttime||match.startTime,booking.bookingEndTime||match.endtime||match.endTime,booking.finalCourtFee,booking.bookingStatus]
    );
    const nextStatus=booking.bookingStatus==='booked'?'booked':'cancelled';
    await client.query('UPDATE match_posts SET status=$1,finalCourtFee=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,booking.finalCourtFee,matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booking',JSON.stringify(match),JSON.stringify(booking)]);
    notifyMatchUsers(matchId,'booking').catch(()=>null);
    return {success:true,matchId,status:nextStatus,bookingId:id,finalCourtFee:booking.finalCourtFee};
  });
}
async function confirmMatchAttendance(matchId,operatorId,items=[]){
  if(!Array.isArray(items)||items.length===0)throw new Error('请提交到场名单');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    for(const item of items){
      const userId=String(item.userId||'').trim();
      if(!userId)continue;
      const creatorStatus=item.finalStatus||item.creatorStatus;
      if(!['attended','absent'].includes(creatorStatus))throw new Error('到场状态不正确');
      const finalStatus=resolveFinalAttendanceStatus({creatorStatus});
      await client.query(
        "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$5,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=EXCLUDED.creatorStatus,finalStatus=EXCLUDED.finalStatus,updatedAt=NOW()",
        [uuidv4(),matchId,userId,creatorStatus,finalStatus]
      );
    }
    await client.query("UPDATE match_posts SET status='fee_pending',updatedAt=NOW() WHERE id=$1",[matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'attendance_confirm',JSON.stringify(match),JSON.stringify(items)]);
    return {success:true,status:'fee_pending'};
  });
}
async function adminHandleBookedWithdrawal(matchId,userId,operatorId,input={}){
  const withdrawal=assertBookedWithdrawalInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(status!=='booked')throw new Error('只有已订场球局需要后台处理退赛');
    const regRes=await client.query("SELECT * FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' FOR UPDATE",[matchId,userId]);
    const reg=regRes.rows[0];
    if(!reg)throw new Error('报名记录不存在');
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility=$1,withdrawalReason=$2,withdrawalHandledBy=$3,withdrawalHandledAt=NOW() WHERE matchId=$4 AND userId=$5 AND registrationStatus='registered'",
      [withdrawal.financialResponsibility,withdrawal.reason,operatorId,matchId,userId]
    );
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booked_withdrawal',JSON.stringify(reg),JSON.stringify(withdrawal)]);
    return {success:true,financialResponsibility:withdrawal.financialResponsibility};
  });
}
async function adminTransferMatchReplacement(matchId,operatorId,input={}){
  const transfer=assertMatchReplacementTransferInput(input);
  const financeSync={refund:null,paid:null};
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(!isFourPlayerGroupMatch(match))throw new Error('当前仅支持四人局替补转让');
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(!['group_ready','group_locked'].includes(formationStatus))throw new Error('当前状态无需替补转让');
    const [fromRegRes,replacementUserRes]=await Promise.all([
      client.query("SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.userId=$2 AND r.registrationStatus='registered' FOR UPDATE",[matchId,transfer.fromUserId]),
      client.query('SELECT * FROM match_users WHERE phone=$1 ORDER BY updatedAt DESC LIMIT 1',[transfer.replacementPhone])
    ]);
    const fromReg=fromRegRes.rows[0];
    if(!fromReg)throw new Error('原报名记录不存在');
    const replacementUser=replacementUserRes.rows[0];
    if(!replacementUser)throw new Error('替补用户不存在，请先让对方登录小程序并完成手机号授权');
    const replacementUserId=String(replacementUser.id||'');
    if(replacementUserId===String(transfer.fromUserId))throw new Error('替补用户不能和原报名人相同');
    const replacementDupRes=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' LIMIT 1",[matchId,replacementUserId]);
    if(replacementDupRes.rowCount>0)throw new Error('替补用户已经在本局报名名单里');
    const replacementLevel=Number(replacementUser.ntrplevel||replacementUser.ntrpLevel||0);
    const matchMinLevel=Number(match.ntrpmin||match.ntrpMin||0);
    if(!isValidNtrp(replacementLevel))throw new Error('替补用户还没有设置真实水平');
    if(isValidNtrp(matchMinLevel)&&replacementLevel<matchMinLevel)throw new Error(`本局最低水平为 ${matchMinLevel.toFixed(1)}，替补不符合要求`);
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||null;
    const isPrepay=/^prepay_/.test(String(feeRecord?.status||''));
    let previousSplit=null;
    if(feeRecord){
      const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,transfer.fromUserId]);
      previousSplit=splitRes.rows[0]||null;
      if(!previousSplit)throw new Error('原报名人的账单不存在');
    }

    const replacementRegistrationId=uuidv4();
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility='transferred',withdrawalReason=$1,withdrawalHandledBy=$2,withdrawalHandledAt=NOW() WHERE id=$3",
      [transfer.refundNote,operatorId,fromReg.id]
    );
    await client.query(
      "INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt,financialResponsibility,withdrawalReason) VALUES($1,$2,$3,'registered',NOW(),$4,$5)",
      [replacementRegistrationId,matchId,replacementUserId,'replacement',transfer.transferNote||'']
    );
    await client.query('DELETE FROM match_attendance WHERE matchId=$1 AND userId=$2',[matchId,replacementUserId]);

    let replacementSplitId='';
    let originalSplitStatus='';
    if(previousSplit){
      const amount=normalizeMoney(previousSplit.amount);
      const previousPaidAmount=normalizeMoney(previousSplit.paidamount||previousSplit.paidAmount);
      originalSplitStatus=previousPaidAmount>0?'refunded':'cancelled';
      await client.query(
        'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE matchId=$5 AND userId=$6',
        [originalSplitStatus,previousPaidAmount,originalSplitStatus==='refunded'?new Date():null,transfer.refundNote,matchId,transfer.fromUserId]
      );
      replacementSplitId=uuidv4();
      const replacementPaidAmount=transfer.replacementPayStatus==='paid'?amount:0;
      await client.query(
        'INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
        [replacementSplitId,matchId,replacementUserId,amount,transfer.replacementPayStatus,replacementPaidAmount,transfer.replacementPayStatus==='paid'?new Date():null,transfer.transferNote||transfer.refundNote]
      );
      if(feeRecord){
        const nextFeeState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
        if(isPrepay&&nextFeeState.status==='prepay_pending'){
          await client.query("UPDATE match_posts SET status='full',updatedAt=NOW() WHERE id=$1",[matchId]);
        }
      }
      financeSync.refund=!isPrepay&&originalSplitStatus==='refunded'?{needed:true}:null;
      financeSync.paid=!isPrepay&&transfer.replacementPayStatus==='paid'?{needed:true,userId:replacementUserId}:null;
    }

    const replacementRowId=uuidv4();
    await client.query(
      'INSERT INTO match_replacements(id,matchId,fromUserId,toUserId,operatorUserId,originalSplitAmount,originalSplitRefundedAmount,replacementSplitAmount,replacementPayStatus,reason,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())',
      [
        replacementRowId,
        matchId,
        transfer.fromUserId,
        replacementUserId,
        operatorId,
        normalizeMoney(previousSplit?.amount||0),
        normalizeMoney(previousSplit?.paidamount||previousSplit?.paidAmount||0),
        normalizeMoney(previousSplit?.amount||0),
        transfer.replacementPayStatus,
        transfer.refundNote,
        transfer.transferNote||''
      ]
    );
    await client.query(
      'INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',
      [
        uuidv4(),
        matchId,
        'admin_user',
        operatorId,
        'replacement_transfer',
        JSON.stringify({fromUserId:transfer.fromUserId,fromPhone:fromReg.phone||'',fromNickName:fromReg.nickname||fromReg.nickName||''}),
        JSON.stringify({toUserId:replacementUserId,toPhone:replacementUser.phone||'',toNickName:replacementUser.nickname||replacementUser.nickName||'',replacementPayStatus:transfer.replacementPayStatus,reason:transfer.refundNote,note:transfer.transferNote||''})
      ]
    );
    return {
      success:true,
      fromUserId:transfer.fromUserId,
      toUserId:replacementUserId,
      replacementPayStatus:transfer.replacementPayStatus,
      replacementNickName:replacementUser.nickname||replacementUser.nickName||maskPhone(replacementUser.phone)||replacementUserId,
      message:transfer.replacementPayStatus==='paid'?'替补已入局并完成付款':'替补名额已转让，等待替补付款'
    };
  });
  if(financeSync.refund?.needed)result.refundSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,transfer.fromUserId,operatorId,transfer.refundNote);
  if(financeSync.paid?.needed)result.paidSync=await syncMatchFeeSplitToCourtFinance(matchId,financeSync.paid.userId,operatorId);
  notifyMatchUsers(matchId,'match_update').catch(()=>null);
  return result;
}
async function selfConfirmMatchAttendance(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['booked','playing','attendance_pending'].includes(status))throw new Error('当前还不能确认到场');
    if(dateMs(match.starttime||match.startTime)>Date.now())throw new Error('未到开始时间');
    const reg=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]);
    if(reg.rowCount<=0)throw new Error('未报名，不能确认到场');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'attended','pending','pending',NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET selfStatus='attended',updatedAt=NOW()",
      [uuidv4(),matchId,userId]
    );
    return {success:true,selfStatus:'attended'};
  });
}
async function creatorConfirmMatchAttendance(matchId,creatorUserId,registrationId,finalStatus){
  if(!['attended','absent'].includes(finalStatus))throw new Error('到场状态不正确');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(creatorUserId))throw new Error('只有发起者可确认');
    const reg=await client.query('SELECT * FROM match_registrations WHERE id=$1 AND matchId=$2',[registrationId,matchId]);
    const row=reg.rows[0];
    if(!row)throw new Error('报名记录不存在');
    const feeRecord=await client.query('SELECT id FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
    if(feeRecord.rowCount>0)throw new Error('已生成AA，不能再修改到场名单');
    const confirmDeadline=dateMs(match.endtime||match.endTime)+(MATCH_CREATOR_CONFIRM_DEADLINE_HOURS*60*60*1000);
    if(Number.isFinite(confirmDeadline)&&Date.now()>confirmDeadline)throw new Error('已超过发起者确认时限，请联系运营处理');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$4,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=$4,finalStatus=$4,updatedAt=NOW()",
      [uuidv4(),matchId,row.userid||row.userId,finalStatus]
    );
    return {success:true,finalStatus};
  });
}
async function generateMatchFeeLedger(matchId,operatorId,{chargeAbsentUserIds=[]}={}){
  const chargeAbsentSet=new Set((chargeAbsentUserIds||[]).map(String));
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const bookingRes=await client.query("SELECT * FROM match_bookings WHERE matchId=$1 AND bookingStatus='booked' ORDER BY createdAt DESC LIMIT 1",[matchId]);
    const finalCourtFee=bookingRes.rows[0]?.finalcourtfee||bookingRes.rows[0]?.finalCourtFee||match.finalcourtfee||match.finalCourtFee;
    const attendanceRes=await client.query('SELECT * FROM match_attendance WHERE matchId=$1',[matchId]);
    const activeRegsRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const confirmedAttendanceUserIds=new Set(
      attendanceRes.rows
        .filter(row=>['attended','absent'].includes(row.finalstatus||row.finalStatus))
        .map(row=>String(row.userid||row.userId))
    );
    const unconfirmedUsers=activeRegsRes.rows.filter(row=>!confirmedAttendanceUserIds.has(String(row.userid||row.userId)));
    if(unconfirmedUsers.length)throw new Error('请先完成全部到场确认，再生成AA');
    const chargeWithdrawalRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='cancelled' AND financialResponsibility='charge'",[matchId]);
    const existingSplitsRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId]);
    const existingPaidByUser=new Map(existingSplitsRes.rows.map(row=>[String(row.userid||row.userId),normalizeMoney(row.paidamount||row.paidAmount)]));
    const ledger=buildMatchFeeLedger({
      matchId,
      estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,
      finalCourtFee,
      matchType:match.matchtype||match.matchType,
      startTime:match.starttime||match.startTime,
      endTime:match.endtime||match.endTime,
      participants:[
        ...attendanceRes.rows.map(row=>({...row,chargeAbsent:chargeAbsentSet.has(String(row.userid||row.userId))})),
        ...chargeWithdrawalRes.rows.map(row=>({userId:row.userid||row.userId,finalStatus:'absent',chargeAbsent:true}))
      ]
    });
    ledger.splits=ledger.splits.map(split=>{
      const paidAmount=existingPaidByUser.get(String(split.userId))||0;
      return {...split,paidAmount,payStatus:paidAmount>=split.amount?'paid':'pending'};
    });
    await client.query('DELETE FROM match_fee_splits WHERE matchId=$1',[matchId]);
    await client.query('DELETE FROM match_fee_records WHERE matchId=$1',[matchId]);
    await client.query(
      'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
      [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.splits.every(row=>row.payStatus==='paid')?'settled':ledger.record.status]
    );
    for(const split of ledger.splits){
      await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount,split.payStatus==='paid'?new Date():null]);
    }
    await client.query("UPDATE match_posts SET status=$2,updatedAt=NOW() WHERE id=$1",[matchId,ledger.splits.every(row=>row.payStatus==='paid')?'settled':'fee_pending']);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_generate',JSON.stringify(match),JSON.stringify(ledger.record)]);
    notifyMatchUsers(matchId,'fee_generate').catch(()=>null);
    return {ledger,paidUserIds:ledger.splits.filter(row=>row.payStatus==='paid').map(row=>String(row.userId))};
  });
  for(const paidUserId of result.paidUserIds){
    await syncMatchFeeSplitToCourtFinance(matchId,paidUserId,operatorId).catch(()=>null);
  }
  return result.ledger;
}
async function markMatchFeeSplit(matchId,userId,operatorId,input={}){
  const update=assertMatchFeeSplitUpdateInput(input);
  const result=await withMatchSqlTransaction(async(client)=>{
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||{};
    const isPrepay=/^prepay_/.test(String(feeRecord.status||''));
    const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,userId]);
    const split=splitRes.rows[0];
    if(!split)throw new Error('账单不存在');
    const amount=update.amount==null?normalizeMoney(split.amount):normalizeMoney(update.amount);
    const previousPaidAmount=normalizeMoney(split.paidamount||split.paidAmount);
    if(update.payStatus==='refunded'&&String(split.paystatus||split.payStatus)!=='paid'&&previousPaidAmount<=0)throw new Error('未收款不能退款');
    const nextPaidAmount=update.paidAmount==null?(update.payStatus==='paid'?amount:(update.payStatus==='refunded'?previousPaidAmount:0)):update.paidAmount;
    await client.query('UPDATE match_fee_splits SET amount=$1,payStatus=$2,paidAmount=$3,paidAt=$4,note=$5,updatedAt=NOW() WHERE matchId=$6 AND userId=$7',[amount,update.payStatus,nextPaidAmount,update.payStatus==='paid'?new Date():null,update.note,matchId,userId]);
    const feeRowsRes=await client.query("SELECT * FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
    const activeRows=feeRowsRes.rows;
    const participantCount=activeRows.length;
    const finalCourtFee=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    const aaAmount=participantCount>0?Math.ceil(finalCourtFee/participantCount):0;
    const distributedTotal=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    await client.query('UPDATE match_fee_records SET finalCourtFee=$1,participantCount=$2,aaAmount=$3,roundingDifference=$4,updatedAt=NOW() WHERE matchId=$5',[finalCourtFee,participantCount,aaAmount,finalCourtFee-distributedTotal,matchId]);
    const nextState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_split_update',JSON.stringify(split),JSON.stringify({amount,payStatus:update.payStatus,paidAmount:nextPaidAmount,note:update.note})]);
    return {success:true,status:nextState.status,isPrepay};
  });
  if(!result.isPrepay&&update.payStatus==='paid')result.financeSync=await syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId);
  if(!result.isPrepay&&update.payStatus==='refunded')result.financeSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,update.note);
  return result;
}
function buildMatchProfileStats({createdMatches=[],joinedMatches=[],attendanceRows=[],feeSplits=[]}={}){
  const resolvedAttendance=(attendanceRows||[]).filter(row=>['attended','absent'].includes(row.finalStatus||row.finalstatus));
  const attended=resolvedAttendance.filter(row=>(row.finalStatus||row.finalstatus)==='attended').length;
  const attendanceRate=resolvedAttendance.length?Math.round(attended*100/resolvedAttendance.length):0;
  const totalFeeAmount=(feeSplits||[]).reduce((sum,row)=>{
    const status=String(row.payStatus||row.paystatus||'').trim();
    const amount=normalizeMoney(row.paidAmount??row.paidamount??row.amount);
    if(status==='paid')return sum+amount;
    if(status==='refunded')return sum-amount;
    return sum;
  },0);
  return {
    createdCount:(createdMatches||[]).length,
    joinedCount:(joinedMatches||[]).length,
    matchCreatedCount:(createdMatches||[]).length,
    matchJoinedCount:(joinedMatches||[]).length,
    matchCompletedCount:resolvedAttendance.length,
    attendanceRate,
    attendanceRateText:resolvedAttendance.length?`${attendanceRate}%`:'暂无记录',
    totalFeeAmount
  };
}
async function listMyMatches(userId){
  const pool=getMatchSqlPool();
  const rows=await pool.query(
    "SELECT DISTINCT p.* FROM match_posts p LEFT JOIN match_registrations r ON r.matchId=p.id LEFT JOIN match_attendance a ON a.matchId=p.id WHERE p.creatorUserId=$1 OR (r.userId=$1 AND r.registrationStatus='registered') OR a.userId=$1 ORDER BY p.startTime DESC",
    [userId]
  );
  const registrations=await loadMatchRegistrationViews(pool,rows.rows.map(row=>String(row.id||'')),{registeredOnly:true});
  const regsByMatch=new Map();
  for(const row of registrations){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  return rows.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],userId));
}
async function getMatchProfile(userId){
  const pool=getMatchSqlPool();
  const [userRes,created,joined,attendance,fees]=await Promise.all([
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId]),
    pool.query('SELECT id FROM match_posts WHERE creatorUserId=$1',[userId]),
    pool.query("SELECT DISTINCT matchId AS id FROM match_registrations WHERE userId=$1 AND registrationStatus='registered'",[userId]),
    pool.query('SELECT a.*,p.status AS matchStatus FROM match_attendance a LEFT JOIN match_posts p ON p.id=a.matchId WHERE a.userId=$1',[userId]),
    pool.query('SELECT * FROM match_fee_splits WHERE userId=$1',[userId])
  ]);
  const stats=buildMatchProfileStats({createdMatches:created.rows,joinedMatches:joined.rows,attendanceRows:attendance.rows,feeSplits:fees.rows});
  const user=userRes.rows[0]||{};
  return {...stats,user:{id:user.id,phone:user.phone||'',nickName:user.nickname||user.nickName||'',avatarUrl:user.avatarurl||user.avatarUrl||'',ntrpLevel:user.ntrplevel||user.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(userId)}};
}
async function updateMatchProfile(userId,input){
  const phone=assertPhone(input.phone||'');
  const ntrpLevel=input.ntrpLevel==null?'':String(input.ntrpLevel||'').trim();
  const nickName=input.nickName==null?'':String(input.nickName||'').trim();
  const avatarUrl=input.avatarUrl==null?'':String(input.avatarUrl||'').trim();
  await getMatchSqlPool().query(
    'UPDATE match_users SET phone=COALESCE(NULLIF($2,$6),phone),ntrpLevel=COALESCE(NULLIF($3,$6),ntrpLevel),nickName=COALESCE(NULLIF($4,$6),nickName),avatarUrl=COALESCE(NULLIF($5,$6),avatarUrl),updatedAt=NOW() WHERE id=$1',
    [userId,phone,ntrpLevel,nickName,avatarUrl,'']
  );
  return getMatchProfile(userId);
}
async function listMatchNotifications(userId){
  const rows=await getMatchSqlPool().query(
    "SELECT l.*,p.title FROM match_operation_logs l LEFT JOIN match_posts p ON p.id=l.matchId LEFT JOIN match_registrations r ON r.matchId=l.matchId AND r.userId=$1 WHERE p.creatorUserId=$1 OR r.userId=$1 ORDER BY l.createdAt DESC LIMIT 50",
    [userId]
  );
  return rows.rows.map(row=>({
    id:row.id,
    matchId:row.matchid||row.matchId,
    title:row.title||'约球通知',
    action:row.action,
    content:matchNotificationText(row.action,row.title),
    createdAt:row.createdat||row.createdAt
  }));
}
function matchNotificationText(action,title=''){
  const name=title||'球局';
  return ({booking:`${name} 已更新订场信息`,match_cancel:`${name} 已取消`,fee_generate:`${name} 已生成 AA 应收`,attendance_confirm:`${name} 已确认到场名单`,match_update:`${name} 信息已更新`})[action]||`${name} 有新动态`;
}
async function listMatchPlayers(){
  const rows=await getMatchSqlPool().query(
    "SELECT u.id,u.nickName,u.avatarUrl,u.ntrpLevel,COUNT(r.id)::int AS joinedCount FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id AND r.registrationStatus='registered' GROUP BY u.id ORDER BY joinedCount DESC,u.createdAt DESC LIMIT 100"
  );
  return rows.rows.map(row=>({id:row.id,nickName:row.nickname||row.nickName||'球友',avatarUrl:row.avatarurl||row.avatarUrl||'',ntrpLevel:row.ntrplevel||row.ntrpLevel||'',joinedCount:row.joinedcount||row.joinedCount||0}));
}

  async function handleMatchRequest({req,res,path,method,body,query}){
        if(path==='/auth/wechat-mini-login'&&method==='POST'){
          const code=String(body.code||'').trim();
          if(!code)return sendJson(res,{error:'缺少微信登录凭证'},400);
          const session=await fetchWechatSession(code,'match');
          const openid=extractWechatOpenId(session);
          const unionid=session.unionid?String(session.unionid):'';
          const pool=getMatchSqlPool();
          const existing=await pool.query('SELECT * FROM match_users WHERE openid=$1 LIMIT 1',[openid]);
          let matchUser=existing.rows[0];
          if(!matchUser){
            const now=new Date().toISOString();
            matchUser={id:uuidv4(),openid,unionid,nickName:'',avatarUrl:'',phone:'',ntrpLevel:'',createdAt:now,updatedAt:now};
            await pool.query(
              'INSERT INTO match_users(id,openid,unionid,nickName,avatarUrl,phone,ntrpLevel,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',
              [matchUser.id,matchUser.openid,matchUser.unionid,matchUser.nickName,matchUser.avatarUrl,matchUser.phone,matchUser.ntrpLevel]
            );
          }
          return sendJson(res,{token:buildMatchUserToken(matchUser),user:{id:matchUser.id,type:'match_user',openid:matchUser.openid,phone:matchUser.phone||'',nickName:matchUser.nickname||matchUser.nickName||'',avatarUrl:matchUser.avatarurl||matchUser.avatarUrl||'',ntrpLevel:matchUser.ntrplevel||matchUser.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(matchUser.id)}});
        }
        if(path==='/matches'&&method==='GET'){
          const matchUser=readOptionalMatchUser(req);
          return sendJson(res,{items:await listMatchesForViewer(matchUser?.id||'')});
        }
        if(path==='/matches'&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
          if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
          return sendJson(res,await createMatchForUser(matchUser.id,body));
        }
        const matchDetailM=path.match(/^\/matches\/([^/]+)$/);
        if(matchDetailM&&method==='GET'){
          const matchUser=readOptionalMatchUser(req);
          const match=await getMatchForViewer(matchDetailM[1],matchUser?.id||'');
          if(!match)return sendJson(res,{error:'球局不存在'},404);
          return sendJson(res,toMatchDetailResponse(match));
        }
        const matchUpdateM=path.match(/^\/matches\/([^/]+)$/);
        if(matchUpdateM&&method==='PUT'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          try{
            await updateMatchForUser(matchUpdateM[1],matchUser.id,body);
            const match=await getMatchForViewer(matchUpdateM[1],matchUser.id);
            return sendJson(res,toMatchDetailResponse(match));
          }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const matchCancelM=path.match(/^\/matches\/([^/]+)\/cancel$/);
        if(matchCancelM&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          try{return sendJson(res,await cancelMatchForUser(matchCancelM[1],matchUser.id,body.reason));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const matchRegisterM=path.match(/^\/matches\/([^/]+)\/register$/);
        if(matchRegisterM&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          const profile=await getMatchSqlPool().query('SELECT phone FROM match_users WHERE id=$1',[matchUser.id]);
          if(!profile.rows[0]?.phone)return sendJson(res,{error:'请先授权手机号'},409);
          try{return sendJson(res,await registerMatchUser(matchRegisterM[1],matchUser.id));}
          catch(err){
            const message=String(err?.message||err);
            return sendJson(res,{error:message},/名额已满|已报名/.test(message)?409:400);
          }
        }
        const matchCancelRegisterM=path.match(/^\/matches\/([^/]+)\/cancel-registration$/);
        if(matchCancelRegisterM&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          try{return sendJson(res,await cancelRegistrationForUser(matchCancelRegisterM[1],matchUser.id));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        if(path==='/my-matches'&&method==='GET'){
          const matchUser=requireMatchUser(req);
          return sendJson(res,{items:await listMyMatches(matchUser.id)});
        }
        if(path==='/match-profile'&&method==='GET'){
          const matchUser=requireMatchUser(req);
          return sendJson(res,await getMatchProfile(matchUser.id));
        }
        if(path==='/match-profile'&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          return sendJson(res,await updateMatchProfile(matchUser.id,body));
        }
        if(path==='/match-profile/phone'&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          return sendJson(res,await updateMatchProfile(matchUser.id,{phone:body.phone}));
        }
        if(path==='/match-profile/phone-code'&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          try{
            const phone=await fetchWechatPhoneNumber(String(body.code||'').trim(),'match');
            return sendJson(res,await updateMatchProfile(matchUser.id,{phone}));
          }catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        if(path==='/match-attendance/creator-confirm'&&method==='POST'){
          try{assertMatchWriteAllowed(req);}catch(err){return sendJson(res,{error:String(err?.message||err)},403);}
          const matchUser=requireMatchUser(req);
          try{return sendJson(res,await creatorConfirmMatchAttendance(body.matchId,matchUser.id,body.registrationId,body.finalAttendanceStatus));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        if(path==='/match-notifications'&&method==='GET'){
          const matchUser=requireMatchUser(req);
          return sendJson(res,{items:await listMatchNotifications(matchUser.id)});
        }
        if(path==='/match-players'&&method==='GET'){
          requireMatchUser(req);
          return sendJson(res,{items:await listMatchPlayers()});
        }
        if(!/^\/admin\/matches(?:\/|$)/.test(path))return false;
        let user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
        if(user.type==='match_user')return sendJson(res,{error:'无管理端权限'},403);
        const storedAuthUser=await getCachedRow(T_USERS,user.id).catch(()=>null);
        user=mergeStoredAuthUser(user,storedAuthUser);
        try{assertAuthUserActive(user);}catch(e){return sendJson(res,{error:e.message},403);}
        if(path==='/admin/matches'&&method==='GET'){
          requireAdminUser(user);
          return sendJson(res,{items:await listAdminMatches()});
        }
        if(path==='/admin/matches/finance-daily'&&method==='GET'){
          requireMatchAdminPermission(user,'match_finance');
          return sendJson(res,await getMatchFinanceDailyReportForAdmin(query.get('date')||new Date().toISOString().slice(0,10)));
        }
        const adminBookingM=path.match(/^\/admin\/matches\/([^/]+)\/booking$/);
        if(adminBookingM&&method==='POST'){
          requireMatchAdminPermission(user,'match_ops');
          try{return sendJson(res,await adminBookMatch(adminBookingM[1],user.id,body));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const adminAttendanceM=path.match(/^\/admin\/matches\/([^/]+)\/attendance$/);
        if(adminAttendanceM&&method==='POST'){
          requireMatchAdminPermission(user,'match_ops');
          try{return sendJson(res,await confirmMatchAttendance(adminAttendanceM[1],user.id,body.items||body.participants||[]));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const adminWithdrawalM=path.match(/^\/admin\/matches\/([^/]+)\/registrations\/([^/]+)\/withdrawal$/);
        if(adminWithdrawalM&&method==='POST'){
          requireMatchAdminPermission(user,'match_ops');
          try{return sendJson(res,await adminHandleBookedWithdrawal(adminWithdrawalM[1],adminWithdrawalM[2],user.id,body));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const adminReplacementM=path.match(/^\/admin\/matches\/([^/]+)\/replacements\/transfer$/);
        if(adminReplacementM&&method==='POST'){
          requireMatchAdminPermission(user,'match_ops');
          requireMatchAdminPermission(user,'match_finance');
          try{return sendJson(res,await adminTransferMatchReplacement(adminReplacementM[1],user.id,body));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const adminFeeConfirmM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/confirm$/);
        if(adminFeeConfirmM&&method==='POST'){
          requireMatchAdminPermission(user,'match_finance');
          try{return sendJson(res,await generateMatchFeeLedger(adminFeeConfirmM[1],user.id,body));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
        const adminFeeSplitM=path.match(/^\/admin\/matches\/([^/]+)\/fees\/splits\/([^/]+)$/);
        if(adminFeeSplitM&&method==='POST'){
          requireMatchAdminPermission(user,'match_finance');
          try{return sendJson(res,await markMatchFeeSplit(adminFeeSplitM[1],adminFeeSplitM[2],user.id,body));}
          catch(err){return sendJson(res,{error:String(err?.message||err)},400);}
        }
    
    return false;
  }
  return {
    handleMatchRequest,
    testExports:{
      buildMatchUserToken,
      assertMatchPostInput,
      normalizeMatchType,
      matchTimelineStatus,
      splitAaFee,
      deriveMatchStatus,
      requireMatchUser,
      requireAdminUser,
      assertMatchBookingInput,
      assertBookedWithdrawalInput,
      buildMatchFeeLedger,
      resolveFinalAttendanceStatus,
      buildMatchProfileStats,
      buildMatchSubscribeMessage,
      notifyMatchUsers,
      matchNotificationText,
      toMatchView,
      toMatchDetailResponse,
      userMatchPermissions,
      requireMatchAdminPermission,
      assertMatchFeeSplitUpdateInput,
      assertMatchReplacementTransferInput,
      canMatchUserCreateByAdminUser,
      canMatchUserCreate,
      resolveMatchClientContext,
      assertMatchWriteAllowed,
      readOptionalMatchUser,
      resolveMatchPrepayClosure,
      registerMatchUser,
      listMatchesForViewer,
      getMatchForViewer,
      createMatchForUser,
      updateMatchForUser,
      cancelMatchForUser,
      cancelRegistrationForUser,
      listAdminMatches,
      adminBookMatch,
      confirmMatchAttendance,
      adminHandleBookedWithdrawal,
      adminTransferMatchReplacement,
      creatorConfirmMatchAttendance,
      generateMatchFeeLedger,
      markMatchFeeSplit,
      listMyMatches,
      getMatchProfile,
      updateMatchProfile,
      listMatchNotifications,
      listMatchPlayers,
      syncMatchFeeSplitToCourtFinance: financeBridge.syncMatchFeeSplitToCourtFinance,
      syncMatchFeeSplitRefundToCourtFinance: financeBridge.syncMatchFeeSplitRefundToCourtFinance,
      getMatchFinanceDailyReportForAdmin: financeBridge.getMatchFinanceDailyReportForAdmin,
      buildMatchFinanceDailyReport: financeBridge.buildMatchFinanceDailyReport,
      buildMatchCourtFinanceHistoryRow: financeBridge.buildMatchCourtFinanceHistoryRow,
      buildMatchCourtFinanceRefundRow: financeBridge.buildMatchCourtFinanceRefundRow
    }
  };
}

module.exports = { createMatchModule };
