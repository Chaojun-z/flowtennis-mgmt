function createPurchaseUpdateService(deps){
  const {
    get,
    put,
    validatePurchaseInputForPackage,
    buildPurchaseRecord,
    syncEntitlementFromPurchase,
    tables
  } = deps;

  return {
    async updatePurchase({purchaseId,oldPurchase,body,entitlements,userName='',now=new Date().toISOString()}){
      const nextPackageId=body.packageId||oldPurchase.packageId;
      const purchaseDate=body.purchaseDate||oldPurchase.purchaseDate||new Date().toISOString().slice(0,10);
      const pkg=await get(tables.packages,nextPackageId).catch(()=>null);
      if(!pkg)return {error:'售卖课包不存在',status:404};
      validatePurchaseInputForPackage(pkg,{...oldPurchase,...body,purchaseDate},{isEdit:true,oldPackageId:oldPurchase.packageId});
      const student=await get(tables.students,body.studentId||oldPurchase.studentId).catch(()=>null);
      if(!student)return {error:'学员不存在',status:404};
      const purchase=buildPurchaseRecord(
        pkg,
        {...oldPurchase,...body,id:purchaseId,createdAt:oldPurchase.createdAt,purchaseDate},
        student,
        {id:purchaseId,now,operator:oldPurchase.operator||userName}
      );
      await put(tables.purchases,purchaseId,purchase);
      const synced=[];
      try{
        for(const ent of entitlements){
          const next=syncEntitlementFromPurchase(pkg,purchase,student,ent,now);
          await put(tables.entitlements,ent.id,next);
          synced.push(next);
        }
        return {purchase,entitlements:synced};
      }catch(err){
        await put(tables.purchases,purchaseId,oldPurchase).catch(()=>null);
        for(const ent of entitlements)await put(tables.entitlements,ent.id,ent).catch(()=>null);
        throw err;
      }
    }
  };
}

module.exports = { createPurchaseUpdateService };
