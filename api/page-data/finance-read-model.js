function createFinancePageDataLoader(deps){
  const {
    listCampusesWithDefaults,
    getCachedScan,
    tables,
    financeCourtProjectionFields = []
  } = deps;

  return async function loadFinancePageData(){
    const [
      campuses,
      students,
      schedule,
      entitlements,
      entitlementLedger,
      financialLedger,
      coaches,
      products,
      purchases,
      packages,
      courts,
      membershipAccounts,
      membershipOrders,
      membershipBenefitLedger,
      membershipAccountEvents
    ] = await Promise.all([
      listCampusesWithDefaults(),
      getCachedScan(tables.students).catch(()=>[]),
      getCachedScan(tables.schedule).catch(()=>[]),
      getCachedScan(tables.entitlements).catch(()=>[]),
      getCachedScan(tables.entitlementLedger).catch(()=>[]),
      getCachedScan(tables.financialLedger).catch(()=>[]),
      getCachedScan(tables.coaches).catch(()=>[]),
      getCachedScan(tables.products).catch(()=>[]),
      getCachedScan(tables.purchases).catch(()=>[]),
      getCachedScan(tables.packages).catch(()=>[]),
      getCachedScan(
        tables.courts,
        financeCourtProjectionFields.length ? { columns: financeCourtProjectionFields } : undefined
      ).catch(()=>[]),
      getCachedScan(tables.membershipAccounts).catch(()=>[]),
      getCachedScan(tables.membershipOrders).catch(()=>[]),
      getCachedScan(tables.membershipBenefitLedger).catch(()=>[]),
      getCachedScan(tables.membershipAccountEvents).catch(()=>[])
    ]);

    return {
      campuses,
      students,
      schedule,
      entitlements,
      entitlementLedger,
      financialLedger,
      coaches,
      products,
      purchases,
      packages,
      courts,
      membershipAccounts,
      membershipOrders,
      membershipBenefitLedger,
      membershipAccountEvents
    };
  };
}

module.exports = { createFinancePageDataLoader };
