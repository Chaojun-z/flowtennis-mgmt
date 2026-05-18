function createPurchaseEntitlementWriteHandler(deps){
  const {
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
    tables
  } = deps;
  const purchaseVoidService=createPurchaseVoidService({
    scan,
    get,
    put,
    uuidv4,
    assertCanVoidPurchase,
    tables:{
      purchases:tables.purchases,
      entitlements:tables.entitlements,
      entitlementLedger:tables.entitlementLedger
    }
  });
  const purchaseUpdateService=createPurchaseUpdateService({
    get,
    put,
    validatePurchaseInputForPackage,
    buildPurchaseRecord,
    syncEntitlementFromPurchase,
    tables:{
      packages:tables.packages,
      students:tables.students,
      purchases:tables.purchases,
      entitlements:tables.entitlements
    }
  });

  return async function handlePurchaseEntitlementWriteRequest({path,method,user,body,res}){
    if(path==='/purchases'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='POST'){
        const pkg=await get(tables.packages,body.packageId).catch(()=>null);
        if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);
        const student=await get(tables.students,body.studentId).catch(()=>null);
        if(!student)return sendJson(res,{error:'学员不存在'},404);
        const purchaseDate=body.purchaseDate||new Date().toISOString().slice(0,10);
        validatePurchaseInputForPackage(pkg,{...body,purchaseDate});
        const id=uuidv4();
        const now=new Date().toISOString();
        const purchase=buildPurchaseRecord(pkg,{...body,purchaseDate},student,{id,now,operator:user.name});
        const entitlement=buildEntitlementFromPurchase(pkg,purchase,student,uuidv4(),now);
        await writePurchaseAndEntitlementAtomic({put,del},tables.purchases,tables.entitlements,purchase,entitlement);
        return sendJson(res,{purchase,entitlement});
      }
      return null;
    }

    const purchaseMatch=path.match(/^\/purchases\/(.+)$/);
    if(purchaseMatch){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=purchaseMatch[1];
      if(method==='PUT'){
        const old=await get(tables.purchases,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'购买记录不存在'},404);
        const ents=(await scan(tables.entitlements).catch(()=>[])).filter(e=>e.purchaseId===id);
        const ledger=await scan(tables.entitlementLedger).catch(()=>[]);
        const now=new Date().toISOString();
        if(purchaseHasEntitlementLedger(id,ents,ledger)){
          const r={...old,notes:body.notes!==undefined?body.notes:old.notes,updatedAt:now};
          assertCanEditPurchaseWithLedger(old,r,ents,ledger);
          await put(tables.purchases,id,r);
          return sendJson(res,{purchase:r,entitlements:[]});
        }
        const result=await purchaseUpdateService.updatePurchase({
          purchaseId:id,
          oldPurchase:old,
          body,
          entitlements:ents,
          userName:user.name,
          now
        });
        if(result?.error)return sendJson(res,{error:result.error},result.status||400);
        return sendJson(res,result);
      }
      if(method==='DELETE'){
        await purchaseVoidService.voidPurchase({purchaseId:id,reason:body.reason,userName:user.name||''});
        return sendJson(res,{success:true});
      }
      return null;
    }

    const entitlementMatch=path.match(/^\/entitlements\/(.+)$/);
    if(entitlementMatch){
      const id=entitlementMatch[1];
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        assertCanDeleteEntitlement(id,await scan(tables.entitlementLedger).catch(()=>[]),await scan(tables.entitlements).catch(()=>[]));
        await del(tables.entitlements,id);
        return sendJson(res,{success:true});
      }
      return null;
    }

    return null;
  };
}

module.exports = { createPurchaseEntitlementWriteHandler };
