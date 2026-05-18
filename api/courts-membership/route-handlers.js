function forbidNonAdmin(user){
  if(user?.role!=='admin')return {status:403,body:{error:'无权限'}};
  return null;
}

function createCourtsMembershipHandler(deps){
  const {
    init,
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
    tables
  } = deps;

  return async function handleCourtsMembershipRequest({path,method,user,body,query}){
    if(path==='/price-plans'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      if(method==='GET')return {body:await getCachedScan(tables.pricePlans).catch(()=>[])};
      if(method==='POST'){
        const id=uuidv4();
        const now=new Date().toISOString();
        const record=normalizePricePlan({...body,id},id,now);
        await put(tables.pricePlans,id,record);
        return {body:record};
      }
      return null;
    }

    if(path==='/price-plans/quote'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      return {body:quoteVenuePrice(await getCachedScan(tables.pricePlans).catch(()=>[]),body)};
    }

    const pricePlanMatch=path.match(/^\/price-plans\/(.+)$/);
    if(pricePlanMatch){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const id=pricePlanMatch[1];
      if(method==='GET')return {body:await getCachedRow(tables.pricePlans,id)};
      const old=await getCachedRow(tables.pricePlans,id).catch(()=>null);
      if(!old)return {status:404,body:{error:'价格方案不存在'}};
      if(method==='PUT'){
        const record=normalizePricePlan({...old,...body,id},id,new Date().toISOString(),old);
        await put(tables.pricePlans,id,record);
        return {body:record};
      }
      if(method==='DELETE'){
        const record={...old,status:'inactive',updatedAt:new Date().toISOString()};
        await put(tables.pricePlans,id,record);
        return {body:{success:true,archived:true,pricePlan:record}};
      }
      return null;
    }

    if(path==='/courts'){
      await init();
      if(method==='GET')return {body:await getCachedScan(tables.courts)};
      if(method==='POST'){
        const id=uuidv4();
        const schedules=await getCachedScan(tables.schedule).catch(()=>[]);
        const record={...normalizeCourtRecord(body,{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(tables.courts,id,record);
        await syncCourtSortIndex(record,null);
        return {body:record};
      }
      return null;
    }

    if(path==='/courts/import'&&method==='POST'){
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return {body:await importCourtRows(rows)};
    }

    if(path==='/courts/batch-delete'&&method==='POST'){
      await init();
      return {body:await deleteCourtsByIds(body.ids,await loadCourtDeleteReferenceData())};
    }

    if(path==='/courts/merge'&&method==='POST'){
      await init();
      const sourceCourtId=String(body?.sourceCourtId||'').trim();
      const targetCourtId=String(body?.targetCourtId||'').trim();
      const deleteSource=body?.deleteSource===true;
      if(!sourceCourtId||!targetCourtId)return {status:400,body:{error:'请选择要合并的订场用户'}};
      if(sourceCourtId===targetCourtId)return {status:400,body:{error:'不能合并到自己'}};
      const [sourceCourt,targetCourt,membershipRefs]=await Promise.all([
        getCachedRow(tables.courts,sourceCourtId).catch(()=>null),
        getCachedRow(tables.courts,targetCourtId).catch(()=>null),
        loadCourtDeleteReferenceData()
      ]);
      if(!sourceCourt)return {status:404,body:{error:'原订场用户不存在'}};
      if(!targetCourt)return {status:404,body:{error:'目标订场用户不存在'}};
      const merged=mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts:membershipRefs.membershipAccounts,
        membershipOrders:membershipRefs.membershipOrders,
        membershipBenefitLedger:membershipRefs.membershipBenefitLedger,
        membershipAccountEvents:membershipRefs.membershipAccountEvents,
        now:new Date().toISOString()
      });
      await put(tables.courts,targetCourt.id,merged.targetCourt);
      await syncCourtSortIndex(merged.targetCourt,targetCourt);
      await Promise.all([
        ...merged.membershipAccounts.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(tables.membershipAccounts,row.id,row)),
        ...merged.membershipOrders.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(tables.membershipOrders,row.id,row)),
        ...merged.membershipBenefitLedger.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(tables.membershipBenefitLedger,row.id,row)),
        ...merged.membershipAccountEvents.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(tables.membershipAccountEvents,row.id,row))
      ]);
      if(deleteSource){
        await del(tables.courts,sourceCourt.id);
        await syncCourtSortIndex(null,sourceCourt);
      }else{
        await put(tables.courts,sourceCourt.id,merged.sourceCourt);
        await syncCourtSortIndex(merged.sourceCourt,sourceCourt);
      }
      return {body:{success:true,targetCourt:merged.targetCourt,removedCourtId:deleteSource?sourceCourt.id:'',archivedSource:!deleteSource}};
    }

    if(path==='/courts/migrate-legacy'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(tables.courts);
      let changed=0;
      const preview=[];
      for(const row of rows){
        const parsed=parseLegacyCourtNotes(row.notes);
        const next={
          ...row,
          notes:parsed.notes,
          owner:row.owner||parsed.updates.owner||'',
          depositAttitude:row.depositAttitude||parsed.updates.depositAttitude||'',
          familiarity:row.familiarity||parsed.updates.familiarity||'',
          spentAmount:row.spentAmount!=null&&row.spentAmount!==''?parseFloat(row.spentAmount)||0:(parsed.updates.spentAmount||0)
        };
        const hasFieldChange=
          String(next.notes||'')!==String(row.notes||'')||
          String(next.owner||'')!==String(row.owner||'')||
          String(next.depositAttitude||'')!==String(row.depositAttitude||'')||
          String(next.familiarity||'')!==String(row.familiarity||'')||
          String(next.spentAmount||0)!==String(row.spentAmount||0);
        if(!hasFieldChange)continue;
        changed++;
        if(preview.length<20)preview.push({id:row.id,name:row.name,before:row.notes||'',after:next.notes||'',owner:next.owner||'',depositAttitude:next.depositAttitude||'',familiarity:next.familiarity||'',spentAmount:next.spentAmount||0});
        if(!dryRun){
          const saved={...next,updatedAt:new Date().toISOString()};
          await put(tables.courts,row.id,saved);
          await syncCourtSortIndex(saved,row);
        }
      }
      return {body:{dryRun,total:rows.length,changed,preview}};
    }

    if(path==='/courts/migrate-finance-legacy'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(tables.courts);
      const schedules=await getCachedScan(tables.schedule).catch(()=>[]);
      let candidates=0,migrated=0,skipped=0;
      const preview=[];
      for(const row of rows){
        if(!shouldMigrateLegacyCourtFinance(row))continue;
        candidates++;
        const history=buildLegacyCourtOpeningHistory(row);
        const warnings=legacyCourtFinanceWarnings(row);
        let computed=null;
        try{computed=computeCourtFinance({...row,history});}catch(err){warnings.push(err.message);}
        if(preview.length<20)preview.push({
          id:row.id,
          name:row.name||'',
          before:{balance:normalizeMoney(row.balance),totalDeposit:normalizeMoney(row.totalDeposit),spentAmount:normalizeMoney(row.spentAmount),receivedAmount:normalizeMoney(row.receivedAmount)},
          generated:history,
          computed,
          warnings
        });
        if(warnings.length){skipped++;continue;}
        if(!dryRun){
          const next=normalizeCourtRecord({...row,history,updatedAt:new Date().toISOString()},{schedules});
          await put(tables.courts,row.id,next);
          await syncCourtSortIndex(next,row);
          migrated++;
        }
      }
      return {body:{dryRun,total:rows.length,candidates,migrated,skipped,preview}};
    }

    if(path==='/admin/rebuild-court-sort-index'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const rows=await getCachedScan(tables.courts).catch(()=>[]);
      return {body:await rebuildCourtSortIndex(rows,{dryRun:body?.dryRun!==false,previewLimit:body?.previewLimit||20})};
    }

    const courtMatch=path.match(/^\/courts\/(.+)$/);
    if(courtMatch){
      const id=courtMatch[1];
      if(method==='PUT'){
        const prev=await getCachedRow(tables.courts,id).catch(()=>null);
        const prevHistory=JSON.stringify(normalizeCourtHistory(prev?.history));
        const nextHistory=JSON.stringify(normalizeCourtHistory(body?.history));
        const schedules=prevHistory===nextHistory?[]:await getCachedScan(tables.schedule).catch(()=>[]);
        const record={...normalizeCourtRecord(body,{schedules}),id,updatedAt:new Date().toISOString()};
        await put(tables.courts,id,record);
        await syncCourtSortIndex(record,prev);
        return {body:record};
      }
      if(method==='DELETE'){
        const court=await getCachedRow(tables.courts,id).catch(()=>null);
        if(!court)return {status:404,body:{error:'订场用户不存在'}};
        const action=courtDeleteAction(court,await loadCourtDeleteReferenceData());
        if(action==='delete'){
          await del(tables.courts,id);
          await syncCourtSortIndex(null,court);
          return {body:{success:true,archived:false}};
        }
        const now=new Date().toISOString();
        const nextCourt={...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now};
        await put(tables.courts,id,nextCourt);
        await syncCourtSortIndex(nextCourt,court);
        return {body:{success:true,archived:true}};
      }
      return null;
    }

    if(path==='/membership-plans'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      if(method==='GET')return {body:await getCachedScan(tables.membershipPlans).catch(()=>[])};
      if(method==='POST'){
        const now=new Date().toISOString();
        const record=buildMembershipPlanRecord(body,{id:uuidv4(),now});
        await put(tables.membershipPlans,record.id,record);
        return {body:record};
      }
      return null;
    }

    const membershipPlanMatch=path.match(/^\/membership-plans\/(.+)$/);
    if(membershipPlanMatch){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      const id=membershipPlanMatch[1];
      if(method==='GET')return {body:await getCachedRow(tables.membershipPlans,id)};
      if(method==='PUT'){
        const old=await getCachedRow(tables.membershipPlans,id).catch(()=>null);
        if(!old)return {status:404,body:{error:'会员方案不存在'}};
        const record=buildMembershipPlanRecord({...old,...body,id,createdAt:old.createdAt},{id,now:new Date().toISOString()});
        await put(tables.membershipPlans,id,record);
        return {body:record};
      }
      if(method==='DELETE'){
        const old=await getCachedRow(tables.membershipPlans,id).catch(()=>null);
        if(!old)return {status:404,body:{error:'会员方案不存在'}};
        if(old.status==='active')return {status:400,body:{error:'上架中的会员方案不能删除，请先停售'}};
        const orders=await getCachedScan(tables.membershipOrders).catch(()=>[]);
        if(orders.some(row=>row.membershipPlanId===id))return {status:400,body:{error:'该会员方案已有购买记录，不能删除，请停用'}};
        await del(tables.membershipPlans,id);
        return {body:{success:true}};
      }
      return null;
    }

    if(path==='/membership-accounts/reconcile'&&method==='POST'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      return {body:await runMembershipReconcile()};
    }

    if(path==='/membership-accounts'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(tables.membershipAccounts).catch(()=>[]);
        const courtId=queryParam(query,'courtId');
        return {body:courtId?rows.filter(row=>row.courtId===courtId):rows};
      }
      return null;
    }

    const membershipAccountMatch=path.match(/^\/membership-accounts\/(.+)$/);
    if(membershipAccountMatch){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      const id=membershipAccountMatch[1];
      if(method==='GET')return {body:await getCachedRow(tables.membershipAccounts,id)};
      if(method==='PUT'){
        const old=await getCachedRow(tables.membershipAccounts,id).catch(()=>null);
        if(!old)return {status:404,body:{error:'会员账户不存在'}};
        const now=new Date().toISOString();
        const record={...old,...body,id,updatedAt:now};
        if(body.status==='voided'){
          record.status='voided';
          record.voidedAt=now;
          record.voidedBy=user.name||'';
          record.voidReason=body.voidReason||body.reason||'手动作废会员';
        }
        let event=null;
        if(old.status!==record.status&&record.status==='voided'){
          event=buildMembershipAccountEventRecord({
            membershipAccountId:id,
            courtId:record.courtId,
            eventType:'voided',
            beforeStatus:old.status,
            afterStatus:'voided',
            operator:user.name||'',
            reason:record.voidReason
          },{id:uuidv4(),now});
        }
        await put(tables.membershipAccounts,id,record);
        if(event)await put(tables.membershipAccountEvents,event.id,event);
        return {body:event?{account:record,event}:record};
      }
      return null;
    }

    const membershipWriteResponse=await handleMembershipWriteRequest({path,method,user,body,query});
    if(membershipWriteResponse)return membershipWriteResponse;

    if(path==='/membership-account-events'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      if(method==='GET')return {body:await getCachedScan(tables.membershipAccountEvents).catch(()=>[])};
      return null;
    }

    return null;
  };
}

function queryParam(query,key){
  if(!query||typeof query.get!=='function')return '';
  return query.get(key)||'';
}

module.exports = { createCourtsMembershipHandler };
