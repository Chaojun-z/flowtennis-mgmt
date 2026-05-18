function createStartupSideEffectsRunner(deps){
  const {
    mkTable,
    bootstrapDefaultUsers,
    ensureDefaultCampuses,
    ensureCoachBindings,
    bootstrapMabaoFinanceSeed,
    repairImportedLedgerDuplicates,
    syncDefaultPricePlans
  } = deps;

  async function ensureTables(tableNames=[]){
    for(const tableName of tableNames)await mkTable(tableName);
  }

  async function runBootstrapBase(){
    await bootstrapDefaultUsers();
    await ensureDefaultCampuses();
    await ensureCoachBindings();
  }

  async function runFinanceSeedBootstrap(){
    await bootstrapMabaoFinanceSeed();
  }

  async function runImportedLedgerRepair(){
    return repairImportedLedgerDuplicates();
  }

  async function runDefaultPricePlanSync(){
    await syncDefaultPricePlans();
  }

  return {
    ensureTables,
    runBootstrapBase,
    runFinanceSeedBootstrap,
    runImportedLedgerRepair,
    runDefaultPricePlanSync
  };
}

module.exports = { createStartupSideEffectsRunner };
