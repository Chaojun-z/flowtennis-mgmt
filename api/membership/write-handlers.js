function forbidNonAdmin(user){
  if(user?.role!=='admin')return {status:403,body:{error:'无权限'}};
  return null;
}

function createMembershipWriteHandler(deps){
  const {
    init,
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
    tables
  } = deps;

  return async function handleMembershipWriteRequest({path,method,user,body}){
    const denied=forbidNonAdmin(user);
    if((path==='/membership-orders'||path==='/membership-benefit-ledger'||/^\/membership-orders\/.+$/.test(path))&&denied)return denied;

    if(path==='/membership-orders'){
      await init();
      if(method==='GET')return {body:await getCachedScan(tables.membershipOrders).catch(()=>[])};
      if(method==='POST'){
        const now=new Date().toISOString();
        const purchaseDate=body.purchaseDate||now.slice(0,10);
        const rechargeAmount=normalizeMoney(body.rechargeAmount);
        const requestReservationKey=reserveRecentMembershipOrderRequest({courtId:body.courtId,membershipPlanId:body.membershipPlanId,purchaseDate,rechargeAmount,requestKey:body.requestKey},now);
        if(!requestReservationKey)return {status:409,body:{error:'检测到重复提交，请勿重复开卡/续充'}};
        const [court,plan,existingAccountFallback]=await Promise.all([
          getCachedRow(tables.courts,body.courtId).catch(()=>null),
          getCachedRow(tables.membershipPlans,body.membershipPlanId).catch(()=>null),
          body.membershipAccountId?getCachedRow(tables.membershipAccounts,body.membershipAccountId).catch(()=>null):Promise.resolve(null)
        ]);
        if(!court){
          releaseRecentMembershipOrderRequest(requestReservationKey);
          return {status:404,body:{error:'订场用户不存在'}};
        }
        const existingAccount=existingAccountFallback&&existingAccountFallback.courtId===court.id&&existingAccountFallback.status!=='voided'
          ? existingAccountFallback
          : (await getCachedScan(tables.membershipAccounts).catch(()=>[])).find(a=>a.courtId===court.id&&a.status!=='voided');
        if(!plan){
          releaseRecentMembershipOrderRequest(requestReservationKey);
          return {status:404,body:{error:'会员方案不存在'}};
        }
        if(plan.status&&plan.status!=='active'){
          releaseRecentMembershipOrderRequest(requestReservationKey);
          return {status:400,body:{error:'该会员方案已停用'}};
        }
        if(plan.saleStartDate&&purchaseDate<plan.saleStartDate){
          releaseRecentMembershipOrderRequest(requestReservationKey);
          return {status:400,body:{error:'未到会员方案售卖时间'}};
        }
        if(plan.saleEndDate&&purchaseDate>plan.saleEndDate){
          releaseRecentMembershipOrderRequest(requestReservationKey);
          return {status:400,body:{error:'会员方案售卖时间已结束'}};
        }
        const finalRechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
        const built=buildMembershipPurchase({court,plan:normalizeMembershipPlanViewRecord(plan),existingAccount,body:{...body,purchaseDate,rechargeAmount:finalRechargeAmount,operator:body.operator||user.name},now});
        const benefitLedgerRows=buildMembershipGrantLedgerRows(built.order,{idFactory:uuidv4,now});
        const originalCourt={...court};
        try{
          const history=[...normalizeCourtHistory(court.history),built.historyRow];
          const nextCourt=normalizeCourtRecord({...court,history,updatedAt:now});
          await Promise.all([
            put(tables.membershipAccounts,built.account.id,built.account),
            put(tables.membershipOrders,built.order.id,built.order),
            put(tables.courts,court.id,nextCourt),
            syncCourtSortIndex(nextCourt,court),
            ...benefitLedgerRows.map(row=>put(tables.membershipBenefitLedger,row.id,row))
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey,{keep:true});
          return {body:{...built,benefitLedgerRows}};
        }catch(err){
          await Promise.all([
            put(tables.courts,originalCourt.id,originalCourt).catch(()=>null),
            del(tables.membershipOrders,built.order.id).catch(()=>null),
            ...benefitLedgerRows.map(row=>del(tables.membershipBenefitLedger,row.id).catch(()=>null)),
            (!existingAccount?del(tables.membershipAccounts,built.account.id):put(tables.membershipAccounts,existingAccount.id,existingAccount)).catch(()=>null)
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey);
          throw err;
        }
      }
      return null;
    }

    const membershipOrderMatch=path.match(/^\/membership-orders\/(.+)$/);
    if(membershipOrderMatch){
      const id=membershipOrderMatch[1];
      if(method==='GET')return {body:await getCachedRow(tables.membershipOrders,id)};
      if(method==='PUT'){
        const old=await getCachedRow(tables.membershipOrders,id).catch(()=>null);
        if(!old)return {status:404,body:{error:'会员购买记录不存在'}};
        const r={...old,...body,id,updatedAt:new Date().toISOString()};
        await put(tables.membershipOrders,id,r);
        return {body:r};
      }
      if(method==='DELETE'){
        const old=await getCachedRow(tables.membershipOrders,id).catch(()=>null);
        if(old)await put(tables.membershipOrders,id,{...old,status:'voided',voidedAt:new Date().toISOString(),voidedBy:user.name||'',voidReason:body.reason||'会员购买记录作废',updatedAt:new Date().toISOString()});
        return {body:{success:true}};
      }
      return null;
    }

    if(path==='/membership-benefit-ledger'){
      await init();
      if(method==='GET'){
        const [rows,users]=await Promise.all([
          getCachedScan(tables.membershipBenefitLedger).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        return {
          body:(rows||[]).map(row=>({
            ...row,
            operator:normalizeOperatorAccountName(row.operator,users)
          }))
        };
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const account=body.membershipAccountId?await getCachedRow(tables.membershipAccounts,body.membershipAccountId).catch(()=>null):null;
        const operator=body.operator||operatorAccountName(user);
        if(account&&['voided','cleared'].includes(account.status)&&['consume','supplement'].includes(body.action))return {status:400,body:{error:'当前会员状态不可再消耗或补发权益，请先重新开卡'}};
        if(!body.membershipOrderId&&(body.action==='consume'||parseInt(body.delta)<0)){
          const [orders,ledger]=await Promise.all([
            getCachedScan(tables.membershipOrders).catch(()=>[]),
            getCachedScan(tables.membershipBenefitLedger).catch(()=>[])
          ]);
          const relevantOrders=(orders||[]).filter(order=>order.membershipAccountId===body.membershipAccountId&&order.courtId===body.courtId);
          const needsPlanFallback=relevantOrders.some(order=>{
            const hasBenefitSnapshot=order?.benefitSnapshot&&Object.keys(order.benefitSnapshot).length>0;
            const hasPlanSnapshot=order?.planBenefitTemplateSnapshot&&Object.keys(order.planBenefitTemplateSnapshot).length>0;
            const hasLegacyCounts=deps.membershipBenefitFieldMap.some(({field})=>parseInt(order?.[field])>0);
            return !hasBenefitSnapshot&&!hasPlanSnapshot&&!hasLegacyCounts;
          });
          const plans=needsPlanFallback?await getCachedScan(tables.membershipPlans).catch(()=>[]):[];
          const planMap=new Map((plans||[]).map(plan=>[plan.id,normalizeMembershipPlanViewRecord(plan)]));
          const normalizedOrders=relevantOrders.map(order=>normalizeMembershipOrderViewRecord(order,planMap.get(order.membershipPlanId)||null));
          const rows=allocateMembershipBenefitUsage({
            membershipAccountId:body.membershipAccountId,
            courtId:body.courtId,
            benefitCode:body.benefitCode,
            benefitLabel:body.benefitLabel,
            unit:body.unit,
            consumeCount:Math.abs(parseInt(body.delta)||0)||Math.abs(parseInt(body.consumeCount)||0),
            orders:normalizedOrders,
            ledger,
            relatedDate:body.relatedDate,
            reason:body.reason||'会员权益使用',
            operator,
            now,
            idFactory:uuidv4
          });
          await Promise.all(rows.map(row=>put(tables.membershipBenefitLedger,row.id,row)));
          return {body:{records:rows}};
        }
        const r=buildMembershipBenefitLedgerRecord({...body,operator},{id:uuidv4(),now});
        await put(tables.membershipBenefitLedger,r.id,r);
        return {body:r};
      }
      return null;
    }

    return null;
  };
}

function normalizeOperatorAccountName(operator,users=[]){
  const raw=String(operator||'').trim();
  if(!raw)return '';
  const byUsername=(users||[]).find(u=>String(u?.username||'').trim()===raw||String(u?.id||'').trim()===raw);
  if(byUsername)return String(byUsername.username||byUsername.id||raw).trim();
  const byName=(users||[]).find(u=>String(u?.name||'').trim()===raw);
  return String(byName?.username||byName?.id||raw).trim();
}

module.exports = { createMembershipWriteHandler };
