function createMatchFinanceBridge(deps){
  const {
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
  } = deps;

  function matchClockText(value){
    const raw=String(value||'');
    if(!raw)return '';
    const m=raw.replace('T',' ').match(/\s(\d{2}:\d{2})/);
    return m?m[1]:raw.slice(11,16);
  }
  function matchDateText(value){
    const raw=String(value||'');
    return raw.slice(0,10);
  }
  function matchFinanceRowDate(row={}){
    const rawPrimary=String(row.occurredDate||row.date||'').trim();
    const primary=/^\d{4}-\d{2}-\d{2}/.test(rawPrimary)?isoDateKey(rawPrimary):'';
    if(primary)return primary;
    return isoDateKey(row.recordedAt||row.createdAt);
  }
  function buildMatchFinanceDailyReport({date=new Date().toISOString().slice(0,10),feeSplits=[],financeHistory=[]}={}){
    const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
    const summary={receivable:0,paid:0,pending:0,waived:0,abnormal:0,refunded:0,ledgerIncome:0,ledgerRefund:0,ledgerNet:0,expectedNet:0,diff:0};
    const splitRows=(feeSplits||[]).filter(row=>isoDateKey(row.updatedAt||row.updatedat||row.paidAt||row.paidat||row.createdAt||row.createdat)===target);
    for(const split of splitRows){
      const amount=normalizeMoney(split.amount);
      const paidAmount=normalizeMoney(split.paidAmount||split.paidamount||amount);
      const status=split.payStatus||split.paystatus||'pending';
      summary.receivable+=amount;
      if(status==='paid'||status==='refunded')summary.paid+=paidAmount;
      else if(status==='waived')summary.waived+=amount;
      else if(status==='abnormal'||status==='bad_debt')summary.abnormal+=amount;
      else summary.pending+=amount;
    }
    const ledgerRows=normalizeCourtHistory(financeHistory).filter(row=>row.sourceCategory==='约球订场'&&row.category==='订场'&&matchFinanceRowDate(row)===target);
    for(const row of ledgerRows){
      const amount=normalizeMoney(row.amount);
      if(row.type==='消费')summary.ledgerIncome+=amount;
      if(row.type==='退款')summary.ledgerRefund+=amount;
    }
    summary.refunded=summary.ledgerRefund;
    summary.ledgerNet=summary.ledgerIncome-summary.ledgerRefund;
    summary.expectedNet=summary.paid-summary.refunded;
    summary.diff=summary.expectedNet-summary.ledgerNet;
    Object.keys(summary).forEach(key=>summary[key]=Math.round(summary[key]*100)/100);
    return {date:target,summary,feeSplits:splitRows,ledgerRows};
  }
  async function getMatchFinanceDailyReportForAdmin(date=new Date().toISOString().slice(0,10)){
    const pool=getMatchSqlPool();
    const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
    const splits=await pool.query(`
      SELECT s.*,u.nickName,u.phone,p.title,p.startTime,p.venueName
      FROM match_fee_splits s
      LEFT JOIN match_users u ON u.id=s.userId
      LEFT JOIN match_posts p ON p.id=s.matchId
      WHERE DATE(COALESCE(s.updatedAt,s.paidAt,s.createdAt))=$1::date
      ORDER BY s.updatedAt DESC
    `,[target]);
    const financeAccount=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
    return buildMatchFinanceDailyReport({date:target,feeSplits:splits.rows,financeHistory:financeAccount?.history||[]});
  }
  function buildMatchCourtFinanceHistoryRow({match={},split={},user={},operatorId='',now=new Date().toISOString()}={}){
    const amount=normalizeMoney(split.amount||split.paidAmount);
    if(amount<=0)throw new Error('约球收款金额必须大于 0');
    const start=match.starttime||match.startTime;
    const end=match.endtime||match.endTime;
    const title=String(match.title||'约球').trim();
    const payer=String(user.nickName||user.nickname||user.phone||user.id||split.userId||split.userid||'球友').trim();
    return {
      id:`match-fee-${split.id||uuidv4()}`,
      date:matchDateText(start)||String(now).slice(0,10),
      occurredDate:matchDateText(start)||String(now).slice(0,10),
      createdAt:now,
      recordedAt:now,
      type:'消费',
      category:'订场',
      sourceCategory:'约球订场',
      payMethod:'微信转账',
      amount,
      note:`约球订场 - ${title} - ${payer}`,
      startTime:matchClockText(start),
      endTime:matchClockText(end),
      venue:match.venuename||match.venueName||'',
      campus:match.campus||'',
      revenueBucket:'现场收款',
      priceMode:'manual',
      systemAmount:amount,
      finalAmount:amount,
      priceOverridden:false,
      overrideReason:'',
      matchId:match.id||split.matchId||split.matchid||'',
      matchFeeSplitId:split.id||'',
      matchUserId:split.userid||split.userId||user.id||'',
      operator:operatorId
    };
  }
  function buildMatchCourtFinanceRefundRow({paidRow={},split={},operatorId='',note='',now=new Date().toISOString()}={}){
    const amount=normalizeMoney(split.paidAmount||split.paidamount||split.amount||paidRow.amount);
    if(amount<=0)throw new Error('约球退款金额必须大于 0');
    return {
      ...paidRow,
      id:`match-fee-refund-${split.id||uuidv4()}`,
      createdAt:now,
      recordedAt:now,
      type:'退款',
      category:'订场',
      sourceCategory:'约球订场',
      payMethod:paidRow.payMethod||'微信转账',
      revenueBucket:paidRow.revenueBucket||'现场收款',
      amount,
      note:`约球订场退款 - ${String(note||'运营退款').trim()}`,
      matchFeeSplitId:split.id||paidRow.matchFeeSplitId||'',
      matchUserId:split.userid||split.userId||paidRow.matchUserId||'',
      operator:operatorId
    };
  }
  async function syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId){
    const pool=getMatchSqlPool();
    const [matchRes,splitRes,userRes]=await Promise.all([
      pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
      pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]),
      pool.query('SELECT * FROM match_users WHERE id=$1',[userId])
    ]);
    const match=matchRes.rows[0];
    const split=splitRes.rows[0];
    if(!match||!split||String(split.paystatus||split.payStatus)!=='paid')return {synced:false};
    const now=new Date().toISOString();
    const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
    const base=existing||{
      id:MATCH_COURT_FINANCE_ACCOUNT_ID,
      name:'约球订场',
      phone:'',
      campus:'',
      status:'active',
      history:[],
      createdAt:now
    };
    const history=normalizeCourtHistory(base.history);
    if(history.some(row=>String(row.matchFeeSplitId||'')===String(split.id)))return {synced:true,skipped:true};
    const row=buildMatchCourtFinanceHistoryRow({match,split,user:userRes.rows[0]||{},operatorId,now});
    const next=normalizeCourtRecord({...base,history:[...history,row],updatedAt:now});
    await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
    return {synced:true,historyId:row.id};
  }
  async function syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,note=''){
    const pool=getMatchSqlPool();
    const splitRes=await pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]);
    const split=splitRes.rows[0];
    if(!split||String(split.paystatus||split.payStatus)!=='refunded')return {synced:false};
    const now=new Date().toISOString();
    const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
    if(!existing)return {synced:false,error:'match court finance account missing'};
    const history=normalizeCourtHistory(existing.history);
    const splitId=String(split.id||'');
    if(history.some(row=>String(row.id||'')===`match-fee-refund-${splitId}`))return {synced:true,skipped:true};
    const paidRow=history.find(row=>String(row.matchFeeSplitId||'')===splitId&&row.type==='消费');
    if(!paidRow)throw new Error('未找到原收款流水，不能退款');
    const row=buildMatchCourtFinanceRefundRow({paidRow,split,operatorId,note,now});
    const next=normalizeCourtRecord({...existing,history:[...history,row],updatedAt:now});
    await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
    return {synced:true,historyId:row.id};
  }

  return {
    getMatchFinanceDailyReportForAdmin,
    syncMatchFeeSplitToCourtFinance,
    syncMatchFeeSplitRefundToCourtFinance,
    buildMatchFinanceDailyReport,
    buildMatchCourtFinanceHistoryRow,
    buildMatchCourtFinanceRefundRow
  };
}

module.exports = { createMatchFinanceBridge };
