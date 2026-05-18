function createTeachingHandler(deps){
  const {
    createPurchaseEntitlementWriteHandler,
    createPurchaseVoidService,
    createPurchaseUpdateService,
    sendJson,
    init,
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
    tables
  } = deps;
  const handlePurchaseEntitlementWriteRequest=createPurchaseEntitlementWriteHandler({
    createPurchaseVoidService,
    createPurchaseUpdateService,
    sendJson,
    init,
    get,
    scan,
    put,
    del,
    uuidv4,
    validatePurchaseInputForPackage,
    buildPurchaseRecord,
    buildEntitlementFromPurchase,
    writePurchaseAndEntitlementAtomic,
    purchaseHasEntitlementLedger,
    assertCanEditPurchaseWithLedger,
    syncEntitlementFromPurchase,
    assertCanVoidPurchase,
    assertCanDeleteEntitlement,
    tables:{
      packages:tables.packages,
      students:tables.students,
      purchases:tables.purchases,
      entitlements:tables.entitlements,
      entitlementLedger:tables.entitlementLedger
    }
  });

  async function handleTeachingCoreRequest({ path, method, user, body, query, res }){
    const purchaseEntitlementWriteResponse=await handlePurchaseEntitlementWriteRequest({path,method,user,body,res});
    if(purchaseEntitlementWriteResponse)return purchaseEntitlementWriteResponse;

    if(path==='/students'){
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(tables.students);
        if(user.role==='admin')return sendJson(res,rows);
        const [schedule,classes,coaches,users]=await Promise.all([
          getCachedScan(tables.schedule).catch(()=>[]),
          getCachedScan(tables.classes).catch(()=>[]),
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        return sendJson(res,filterLoadAllForUser({students:rows,schedule,classes,coaches},user,coachRefs).students);
      }
      if(method==='POST'){
        assertStudentWriteAccess(user);
        const id=uuidv4();
        const r={...body,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(tables.students,id,r);
        return sendJson(res,r);
      }
      return null;
    }

    const studentMatch=path.match(/^\/students\/(.+)$/);
    if(studentMatch){
      const id=studentMatch[1];
      if(method==='PUT'){
        assertStudentWriteAccess(user);
        const old=await get(tables.students,id).catch(()=>null);
        const r={...body,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};
        await put(tables.students,id,r);
        const studentUpdates=old?await applyStudentIdentityUpdate(old,r):{plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[]};
        return sendJson(res,{...r,studentUpdates});
      }
      if(method==='DELETE'){
        assertStudentWriteAccess(user);
        const [classes,schedule,courts,feedbacks,purchases,entitlements,entitlementLedger]=await Promise.all([
          scan(tables.classes).catch(()=>[]),
          scan(tables.schedule).catch(()=>[]),
          scan(tables.courts).catch(()=>[]),
          getCachedFeedbacks(),
          scan(tables.purchases).catch(()=>[]),
          scan(tables.entitlements).catch(()=>[]),
          scan(tables.entitlementLedger).catch(()=>[])
        ]);
        assertCanDeleteStudent(id,{classes,schedule,courts,feedbacks,purchases,entitlements,entitlementLedger});
        await del(tables.students,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    if(path==='/packages'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(tables.packages).catch(()=>[]));
      if(method==='POST'){
        const id=uuidv4();
        const refs={
          products:await getCachedScan(tables.products).catch(()=>[]),
          coaches:await getCachedScan(tables.coaches).catch(()=>[]),
          campuses:await getCachedScan(tables.campuses).catch(()=>[])
        };
        const now=new Date().toISOString();
        const r=normalizePackageRecord({...body,id},null,refs,now);
        r.createdAt=now;
        await put(tables.packages,id,r);
        return sendJson(res,r);
      }
      return null;
    }

    const packageMatch=path.match(/^\/packages\/(.+)$/);
    if(packageMatch){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=packageMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.packages,id));
      if(method==='PUT'){
        const old=await get(tables.packages,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'售卖课包不存在'},404);
        const refs={
          products:await scan(tables.products).catch(()=>[]),
          coaches:await scan(tables.coaches).catch(()=>[]),
          campuses:await scan(tables.campuses).catch(()=>[])
        };
        const r=normalizePackageRecord({...body,id},old,refs);
        assertCanEditPackageWithPurchases(old,r,await scan(tables.purchases).catch(()=>[]));
        await put(tables.packages,id,r);
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        assertCanDeletePackage(id,await scan(tables.purchases).catch(()=>[]));
        await del(tables.packages,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    if(path==='/purchases'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(tables.purchases).catch(()=>[]));
      return null;
    }

    const purchaseMatch=path.match(/^\/purchases\/(.+)$/);
    if(purchaseMatch){
      const id=purchaseMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.purchases,id));
      return null;
    }

    if(path==='/entitlement-ledger'){
      await init();
      if(method==='GET')return sendJson(res,normalizeEntitlementLedgerRowsForView(await getCachedScan(tables.entitlementLedger).catch(()=>[])));
      return null;
    }

    if(path==='/entitlements'){
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(tables.entitlements).catch(()=>[]);
        const sid=query.get('studentId')||'';
        if(user.role==='admin')return sendJson(res,sid?rows.filter(e=>e.studentId===sid):rows);
        const [students,schedule,classes,coaches,users]=await Promise.all([
          getCachedScan(tables.students).catch(()=>[]),
          getCachedScan(tables.schedule).catch(()=>[]),
          getCachedScan(tables.classes).catch(()=>[]),
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        const scoped=filterLoadAllForUser({students,schedule,classes,entitlements:rows,coaches},user,coachRefs).entitlements;
        return sendJson(res,sid?scoped.filter(e=>e.studentId===sid):scoped);
      }
      return null;
    }

    if(path==='/entitlements/recommend'&&method==='POST'){
      await init();
      const [rows,coachRows,userRows]=await Promise.all([
        getCachedScan(tables.entitlements).catch(()=>[]),
        getCachedScan(tables.coaches).catch(()=>[]),
        getCachedScan(tables.users).catch(()=>[])
      ]);
      const coachRefs=buildCoachRefs({coaches:coachRows,users:userRows});
      const scopedRows=rows.filter(e=>parseArr(body.studentIds).includes(e.studentId));
      return sendJson(res,recommendEntitlements(scopedRows,{...body,coachRefs}));
    }

    const entitlementMatch=path.match(/^\/entitlements\/(.+)$/);
    if(entitlementMatch){
      const id=entitlementMatch[1];
      if(method==='GET')return sendJson(res,await getCachedRow(tables.entitlements,id));
      return null;
    }

    if(path==='/feedbacks'){
      await init();
      if(method==='GET')return sendJson(res,await withTimeout(getCachedScan(tables.feedbacks).catch(()=>[]),3000,[]));
      if(method==='POST'){
        const id=uuidv4();
        const schedule=await get(tables.schedule,body.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        const [coaches,users]=await Promise.all([
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        assertCanWriteFeedback(user,schedule,buildCoachRefs({coaches,users}));
        const r=buildFeedbackRecord(body,{id},user);
        await putFeedback(id,r);
        return sendJson(res,r);
      }
      return null;
    }

    const feedbackMatch=path.match(/^\/feedbacks\/(.+)$/);
    if(feedbackMatch){
      const id=feedbackMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.feedbacks,id));
      if(method==='PUT'){
        const ex=await get(tables.feedbacks,id).catch(()=>null);
        if(!ex)return sendJson(res,{error:'反馈不存在'},404);
        const schedule=await get(tables.schedule,body.scheduleId||ex.scheduleId).catch(()=>null);
        if(!schedule)return sendJson(res,{error:'排课不存在'},404);
        const [coaches,users]=await Promise.all([
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        assertCanWriteFeedback(user,schedule,buildCoachRefs({coaches,users}));
        const r=buildFeedbackRecord({...ex,...body},{...ex,id},user);
        await putFeedback(id,r);
        return sendJson(res,r);
      }
      return null;
    }

    if(path==='/schedule'){
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(tables.schedule);
        if(user.role==='admin')return sendJson(res,rows);
        const [coaches,users]=await Promise.all([
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        return sendJson(res,filterLoadAllForUser({schedule:rows,coaches},user,coachRefs).schedule);
      }
      if(method==='POST'){
        try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
        const id=uuidv4();
        const baseRecord={...body,...normalizeCoachLateInfo(body),studentIds:parseArr(body.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue),id,status:body.status||'已排课',cancelReason:body.cancelReason||'',notifyStatus:body.notifyStatus||'未通知',confirmStatus:body.confirmStatus||'待确认',scheduleSource:body.scheduleSource||'排课表',createdBy:user.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        const linkedClass=baseRecord.classId?await getCachedRow(tables.classes,baseRecord.classId).catch(()=>null):null;
        const r=applyLinkedClassScheduleSnapshot(baseRecord,linkedClass);
        const {risk,entitlementDeltas}=await timed('schedule create validate',async()=>{
          const risk=await validateScheduleSave(r,null);
          assertScheduleEntitlementRequired(r);
          const [entitlementRows,coachRows,userRows]=await Promise.all([
            getCachedScan(tables.entitlements).catch(()=>[]),
            getCachedScan(tables.coaches).catch(()=>[]),
            getCachedScan(tables.users).catch(()=>[])
          ]);
          const coachRefs=buildCoachRefs({coaches:coachRows,users:userRows});
          const entitlementDeltas=resolveScheduleEntitlementDeltas({...r,coachRefs},entitlementRows);
          r.entitlementIds=entitlementDeltas.map(d=>d.entitlementId);
          r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
          await assertScheduleEntitlementCapacity({...r,coachRefs},null);
          return {risk,entitlementDeltas};
        });
        await timed('schedule create persist',()=>put(tables.schedule,id,r));
        const nextDelta=scheduleLessonDelta(r);
        const appliedEntitlements=[];
        let lessonApplied=false;
        try{
          const entitlementChanged=await timed('schedule create entitlement writes',async()=>{
            const changed=[];
            for(const nextEntDelta of entitlementDeltas){
              const update=await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','排课消课',user);
              if(update)changed.push(update);
              appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'排课保存失败退回'});
            }
            return changed;
          });
          const lessonUpdate=nextDelta?await timed('schedule create lesson writes',()=>applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds)):null;
          if(nextDelta)lessonApplied=true;
          const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
          const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
          const notification=await timed(
            'schedule create coach notification',
            ()=>withTimeout(
              notifyCoachScheduleCreated(r).catch(err=>({sent:false,error:err.message})),
              5000,
              {sent:false,error:'微信通知超时'}
            )
          );
          Object.assign(r,buildScheduleNotificationUpdate(r,notification,'schedule_created',new Date().toISOString()));
          await put(tables.schedule,id,r);
          return sendJson(res,{schedule:r,warnings:risk.warnings||[],...(lessonUpdate||{}),entitlements,entitlementLedger,entitlement:entitlements[0]||null,ledger:entitlementLedger[0]||null,notification});
        }catch(err){
          await del(tables.schedule,id).catch(()=>null);
          for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user).catch(()=>null);
          if(nextDelta&&lessonApplied)await applyLessonDelta(nextDelta.classId,-nextDelta.delta,r.studentIds).catch(()=>null);
          throw err;
        }
      }
      return null;
    }

    const scheduleMatch=path.match(/^\/schedule\/(.+)$/);
    if(scheduleMatch){
      const id=scheduleMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.schedule,id));
      if(method==='PUT'){
        try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
        const ex=await get(tables.schedule,id).catch(()=>null);
        const baseRecord={...ex,...body,...normalizeCoachLateInfo({...ex,...body}),studentIds:parseArr(body.studentIds??ex?.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds??ex?.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds??ex?.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue??ex?.venue),id,updatedAt:new Date().toISOString()};
        const linkedClass=baseRecord.classId?await getCachedRow(tables.classes,baseRecord.classId).catch(()=>null):null;
        const r=applyLinkedClassScheduleSnapshot(baseRecord,linkedClass);
        const oldDelta=scheduleLessonDelta(ex);
        const nextDelta=scheduleLessonDelta(r);
        const {risk,oldEntDeltas,nextEntDeltas}=await timed('schedule update validate',async()=>{
          const risk=await validateScheduleSave(r,ex);
          assertScheduleEntitlementRequired(r);
          assertScheduleEditableAfterFeedback(
            ex,
            r,
            await timed('schedule update feedback guard',()=>withTimeout(getCachedFeedbacks(),3000,[]))
          );
          const oldEntDeltas=scheduleEntitlementDeltas(ex);
          const oldEntIds=new Set(oldEntDeltas.map(d=>d.entitlementId));
          const [entitlementRows,coachRows,userRows]=await Promise.all([
            getCachedScan(tables.entitlements).catch(()=>[]),
            getCachedScan(tables.coaches).catch(()=>[]),
            getCachedScan(tables.users).catch(()=>[])
          ]);
          const coachRefs=buildCoachRefs({coaches:coachRows,users:userRows});
          const nextBaseRows=entitlementRows.map(ent=>oldEntIds.has(ent.id)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+(oldEntDeltas.find(d=>d.entitlementId===ent.id)?.delta||0)}:ent);
          const nextEntDeltas=resolveScheduleEntitlementDeltas({...r,coachRefs},nextBaseRows);
          r.entitlementIds=nextEntDeltas.map(d=>d.entitlementId);
          r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
          await assertScheduleEntitlementCapacity({...r,coachRefs},ex);
          return {risk,oldEntDeltas,nextEntDeltas};
        });
        await timed('schedule update persist',()=>put(tables.schedule,id,r));
        const appliedEntitlements=[];
        const appliedClassDeltas=[];
        try{
          const changed=[];
          const entitlementChanged=await timed('schedule update entitlement writes',async()=>{
            const rows=[];
            const entDiff=diffScheduleEntitlementDeltas(oldEntDeltas,nextEntDeltas);
            for(const oldEntDelta of entDiff.returns){
              rows.push(await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','编辑排课退回旧权益',user));
              appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'编辑排课失败重新扣旧权益'});
            }
            for(const nextEntDelta of entDiff.consumes){
              rows.push(await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','编辑排课消课',user));
              appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'编辑排课失败退回新权益'});
            }
            return rows;
          });
          await timed('schedule update lesson writes',async()=>{
            if(oldDelta){
              changed.push(await applyLessonDelta(oldDelta.classId,-oldDelta.delta,parseArr(ex.studentIds)));
              appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta,studentIds:parseArr(ex.studentIds)});
            }
            if(nextDelta){
              changed.push(await applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds));
              appliedClassDeltas.push({classId:nextDelta.classId,delta:-nextDelta.delta,studentIds:r.studentIds});
            }
          });
          const classes=changed.filter(Boolean).map(x=>x.class);
          const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
          const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
          return sendJson(res,{schedule:r,classes,entitlements,entitlementLedger,warnings:risk.warnings||[]});
        }catch(err){
          await put(tables.schedule,id,ex).catch(()=>null);
          for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta,item.studentIds).catch(()=>null);
          for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user).catch(()=>null);
          throw err;
        }
      }
      if(method==='DELETE'){
        const ex=await get(tables.schedule,id).catch(()=>null);
        const oldDelta=scheduleLessonDelta(ex);
        assertCanDeleteSchedule(id,await getCachedFeedbacks(),await scan(tables.entitlementLedger).catch(()=>[]));
        await del(tables.schedule,id);
        try{
          const lessonUpdate=oldDelta?await applyLessonDelta(oldDelta.classId,-oldDelta.delta):null;
          return sendJson(res,{success:true,...(lessonUpdate||{})});
        }catch(err){
          if(ex)await put(tables.schedule,id,ex).catch(()=>null);
          if(oldDelta)await applyLessonDelta(oldDelta.classId,oldDelta.delta).catch(()=>null);
          throw err;
        }
      }
      return null;
    }

    if(path==='/coaches'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(tables.coaches));
      if(method==='POST'){
        const id=uuidv4();
        const name=String(body.name||'').trim();
        if(!name)return sendJson(res,{error:'请填写教练姓名'},400);
        assertUniqueCoachName(name,await getCachedScan(tables.coaches));
        const r={...body,name,phone:assertPhone(body.phone),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(tables.coaches,id,r);
        return sendJson(res,r);
      }
      return null;
    }

    const coachMatch=path.match(/^\/coaches\/(.+)$/);
    if(coachMatch){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=coachMatch[1];
      if(method==='PUT'){
        const old=await get(tables.coaches,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'教练不存在'},404);
        const name=String(body.name||'').trim();
        if(!name)return sendJson(res,{error:'请填写教练姓名'},400);
        assertUniqueCoachName(name,await scan(tables.coaches),id);
        const r={...body,name,phone:assertPhone(body.phone),id,updatedAt:new Date().toISOString()};
        await put(tables.coaches,id,r);
        const coachUpdates=await applyCoachRename(old.name,name);
        return sendJson(res,{...r,coachUpdates});
      }
      if(method==='DELETE'){
        const old=await get(tables.coaches,id).catch(()=>null);
        if(!old)return sendJson(res,{success:true});
        assertCanDeleteCoachName(old.name,await loadCoachReferenceData(),old.id);
        await del(tables.coaches,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    return null;
  }

  async function handleTeachingCompatRequest({ path, method, user, body, query, res }){
    if(path==='/products'){
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(tables.products).catch(()=>[]));
      if(method==='POST'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const id=uuidv4();
        const now=new Date().toISOString();
        const r=normalizeProductRecord({...body,id},null,now);
        r.createdAt=now;
        await put(tables.products,id,r);
        return sendJson(res,r);
      }
      return null;
    }

    const productMatch=path.match(/^\/products\/(.+)$/);
    if(productMatch){
      const id=productMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.products,id));
      if(method==='PUT'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const old=await get(tables.products,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'课程产品不存在'},404);
        const now=new Date().toISOString();
        const r=normalizeProductRecord({...body,id},old,now);
        const [classes,packages]=await Promise.all([
          scan(tables.classes).catch(()=>[]),
          scan(tables.packages).catch(()=>[])
        ]);
        assertCanEditProductWithReferences(old,r,{classes,packages});
        await put(tables.products,id,r);
        const sync=buildProductRenameDisplayUpdates(old,r,{classes},now);
        if(sync.classes.length)await Promise.all(sync.classes.map(row=>put(tables.classes,row.id,row)));
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const [classes,packages]=await Promise.all([
          scan(tables.classes),
          scan(tables.packages).catch(()=>[])
        ]);
        assertCanDeleteProduct(id,classes,packages);
        await del(tables.products,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    if(path==='/classes'){
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(tables.classes);
        if(user.role==='admin')return sendJson(res,rows);
        const [schedule,coaches,users]=await Promise.all([
          getCachedScan(tables.schedule).catch(()=>[]),
          getCachedScan(tables.coaches).catch(()=>[]),
          getCachedScan(tables.users).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        return sendJson(res,filterLoadAllForUser({classes:rows,schedule,coaches},user,coachRefs).classes);
      }
      if(method==='POST'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        assertCanWriteClass(user);
        const id=uuidv4();
        const now=new Date().toISOString();
        const [existingClasses,product]=await Promise.all([
          getCachedScan(tables.classes).catch(()=>[]),
          get(tables.products,body.productId).catch(()=>null)
        ]);
        if(!product)return sendJson(res,{error:'课程产品不存在'},404);
        validateClassInput({...body,usedLessons:0},product);
        const classNo=await reserveNextClassNo(existingClasses,user,now);
        const r=buildClassCreateRecord({...body,productName:product.name||body.productName||'',productCourseType:product.type||body.courseType||''},{id,classNo,user,now});
        await put(tables.classes,id,r);
        return sendJson(res,{class:r});
      }
      return null;
    }

    const classMatch=path.match(/^\/classes\/(.+)$/);
    if(classMatch){
      const id=classMatch[1];
      if(method==='GET')return sendJson(res,await get(tables.classes,id));
      if(method==='PUT'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        assertCanWriteClass(user);
        const old=await get(tables.classes,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'班次不存在'},404);
        const product=await get(tables.products,body.productId||old.productId).catch(()=>null);
        if(!product)return sendJson(res,{error:'课程产品不存在'},404);
        const r=buildClassUpdateRecord(old,body,{product,now:new Date().toISOString()});
        validateClassInput(r,product);
        assertCanEditClassWithSchedules(old,r,await getCachedScan(tables.schedule));
        await put(tables.classes,id,r);
        return sendJson(res,{class:r});
      }
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        assertCanWriteClass(user);
        assertCanDeleteClass(id,await getCachedScan(tables.schedule));
        await del(tables.classes,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    return null;
  }

  return async function handleTeachingRequest(ctx){
    const coreResponse=await handleTeachingCoreRequest(ctx);
    if(coreResponse)return coreResponse;
    return handleTeachingCompatRequest(ctx);
  };
}

module.exports = { createTeachingHandler };
