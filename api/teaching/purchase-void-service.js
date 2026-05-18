function createPurchaseVoidService(deps){
  const {
    scan,
    get,
    put,
    uuidv4,
    assertCanVoidPurchase,
    tables
  } = deps;

  return {
    async voidPurchase({purchaseId,reason='购买记录作废',userName='',now=new Date().toISOString()}){
      const [ents,ledger]=await Promise.all([
        scan(tables.entitlements).catch(()=>[]),
        scan(tables.entitlementLedger).catch(()=>[])
      ]);
      assertCanVoidPurchase(purchaseId,ents,ledger);
      for(const ent of ents.filter(e=>e.purchaseId===purchaseId)){
        await put(tables.entitlements,ent.id,{...ent,status:'voided',updatedAt:now});
        const event={
          id:uuidv4(),
          entitlementId:ent.id,
          studentId:ent.studentId||'',
          purchaseId,
          lessonDelta:0,
          action:'void_purchase',
          reason,
          operator:userName,
          createdAt:now
        };
        await put(tables.entitlementLedger,event.id,event);
      }
      const old=await get(tables.purchases,purchaseId).catch(()=>null);
      if(old){
        await put(tables.purchases,purchaseId,{
          ...old,
          status:'voided',
          voidedAt:now,
          voidedBy:userName,
          voidReason:reason,
          updatedAt:now
        });
      }
      return {success:true};
    }
  };
}

module.exports = { createPurchaseVoidService };
