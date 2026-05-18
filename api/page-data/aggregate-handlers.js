function forbidNonAdmin(user){
  if(user?.role!=='admin')return {status:403,body:{error:'无权限'}};
  return null;
}

const PURCHASE_PAGE_PURCHASE_PROJECTION_FIELDS = [
  'studentId',
  'studentName',
  'packageId',
  'packageName',
  'packageLessons',
  'packagePrice',
  'courseType',
  'productName',
  'purchaseDate',
  'createdAt',
  'amountPaid',
  'finalAmount',
  'systemAmount',
  'overrideReason',
  'payMethod',
  'ownerCoach',
  'notes',
  'status'
];

const PURCHASE_PAGE_PACKAGE_PROJECTION_FIELDS = [
  'name',
  'price',
  'lessons',
  'status',
  'productId'
];

const PURCHASE_PAGE_STUDENT_PROJECTION_FIELDS = [
  'name',
  'phone',
  'type',
  'source',
  'activityRange',
  'notes',
  'campus',
  'primaryCoach'
];

const PURCHASE_PAGE_ENTITLEMENT_PROJECTION_FIELDS = [
  'purchaseId',
  'studentId',
  'studentName',
  'packageName',
  'courseType',
  'remainingLessons',
  'totalLessons',
  'validFrom',
  'validUntil',
  'status',
  'campusIds'
];

function projectCourtListRow(row = {}) {
  const balance = row?.cachedBalance === '' || row?.cachedBalance == null ? row?.balance : row?.cachedBalance;
  const totalDeposit = row?.cachedTotalDeposit === '' || row?.cachedTotalDeposit == null ? row?.totalDeposit : row?.cachedTotalDeposit;
  const spentAmount = row?.cachedTotalSpent === '' || row?.cachedTotalSpent == null ? row?.spentAmount : row?.cachedTotalSpent;
  const receivedAmount = row?.cachedTotalReceived === '' || row?.cachedTotalReceived == null ? row?.receivedAmount : row?.cachedTotalReceived;
  return {
    ...row,
    balance,
    totalDeposit,
    spentAmount,
    receivedAmount
  };
}

function createPageDataHandler(deps){
  const {
    init,
    getCachedScan,
    getCachedRow,
    courtListProjectionFields = [],
    getCachedFeedbacks,
    withTimeout,
    loadFinancePageData,
    loadCourtAccountListView,
    loadCourtAccountListViewCompare,
    loadCourtSortPreviewPage,
    listCampusesWithDefaults,
    tables,
    normalizeMembershipPlanViewRecord,
    normalizeMembershipOrderViewRecord,
    runMembershipReconcile,
    buildCoachRefs,
    filterLoadAllForUser,
    decorateWorkbenchStudents,
    decorateWorkbenchFeedbacks,
    decorateWorkbenchScheduleRows,
    decorateWorkbenchClasses,
    buildWorkbenchStats
  } = deps;

  return async function handlePageDataRequest({path,method,user,query}){
    if(method!=='GET')return null;

    if(path==='/page-data/purchases'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const [purchases,packages,students,entitlements]=await Promise.all([
        getCachedScan(tables.purchases,{columns:PURCHASE_PAGE_PURCHASE_PROJECTION_FIELDS}).catch(()=>[]),
        getCachedScan(tables.packages,{columns:PURCHASE_PAGE_PACKAGE_PROJECTION_FIELDS}).catch(()=>[]),
        getCachedScan(tables.students,{columns:PURCHASE_PAGE_STUDENT_PROJECTION_FIELDS}).catch(()=>[]),
        getCachedScan(tables.entitlements,{columns:PURCHASE_PAGE_ENTITLEMENT_PROJECTION_FIELDS}).catch(()=>[])
      ]);
      return {body:{purchases,packages,students,entitlements}};
    }

    if(path==='/page-data/finance'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      return {body:await loadFinancePageData()};
    }

    if(path==='/page-data/courts'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const [campuses,students,courts,membershipAccounts,coaches,pricePlans]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(tables.students).catch(()=>[]),
        getCachedScan(tables.courts,{columns:courtListProjectionFields}).catch(()=>[]),
        getCachedScan(tables.membershipAccounts).catch(()=>[]),
        getCachedScan(tables.coaches).catch(()=>[]),
        getCachedScan(tables.pricePlans).catch(()=>[])
      ]);
      return {body:{campuses,students,courts:(courts||[]).map(projectCourtListRow),membershipAccounts,coaches,pricePlans}};
    }

    const courtDetailMatch=path.match(/^\/page-data\/courts\/([^/]+)$/);
    if(courtDetailMatch){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const court=await getCachedRow(tables.courts,courtDetailMatch[1]).catch(()=>null);
      if(!court)return {status:404,body:{error:'订场用户不存在'}};
      return {body:court};
    }

    if(path==='/page-data/court-account-list-view'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      return {body:await loadCourtAccountListView({sampleIds:ids,sample})};
    }

    if(path==='/page-data/court-account-list-view-compare'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      return {body:await loadCourtAccountListViewCompare({sampleIds:ids,sample})};
    }

    if(path==='/page-data/courts-default-sort-preview'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const limit=query?.get('limit')||'20';
      const cursor=query?.get('cursor')||'';
      return {body:await loadCourtSortPreviewPage({limit,cursor,getCachedRow,tables})};
    }

    if(path==='/page-data/memberships'){
      const denied=forbidNonAdmin(user);
      if(denied)return denied;
      await init();
      const [campuses,students,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,membershipPlans,coaches]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(tables.students).catch(()=>[]),
        getCachedScan(tables.courts).catch(()=>[]),
        getCachedScan(tables.membershipAccounts).catch(()=>[]),
        getCachedScan(tables.membershipOrders).catch(()=>[]),
        getCachedScan(tables.membershipBenefitLedger).catch(()=>[]),
        getCachedScan(tables.membershipAccountEvents).catch(()=>[]),
        getCachedScan(tables.membershipPlans).catch(()=>[]),
        getCachedScan(tables.coaches).catch(()=>[])
      ]);
      const normalizedMembershipPlans=(Array.isArray(membershipPlans)?membershipPlans:[]).map(normalizeMembershipPlanViewRecord);
      const membershipPlanMap=new Map(normalizedMembershipPlans.map(item=>[item.id,item]));
      const normalizedMembershipOrders=(Array.isArray(membershipOrders)?membershipOrders:[]).map(order=>normalizeMembershipOrderViewRecord(order,membershipPlanMap.get(order.membershipPlanId)));
      const reconciled=await runMembershipReconcile({accounts:membershipAccounts,courts});
      return {
        body:{
          campuses,
          students,
          courts:reconciled.courts||courts,
          membershipAccounts:Array.isArray(reconciled.accounts)?reconciled.accounts:[],
          membershipOrders:normalizedMembershipOrders,
          membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
          membershipAccountEvents:[...(Array.isArray(membershipAccountEvents)?membershipAccountEvents:[]),...(reconciled.events||[])],
          membershipPlans:normalizedMembershipPlans,
          coaches
        }
      };
    }

    if(path==='/page-data/workbench'){
      await init();
      const [campuses,students,classes,schedule,feedbacks,purchases]=await Promise.all([
        listCampusesWithDefaults(),
        getCachedScan(tables.students).catch(()=>[]),
        getCachedScan(tables.classes).catch(()=>[]),
        getCachedScan(tables.schedule).catch(()=>[]),
        withTimeout(getCachedFeedbacks(),3000,[]),
        getCachedScan(tables.purchases).catch(()=>[])
      ]);
      const [coaches,users]=await Promise.all([
        getCachedScan(tables.coaches).catch(()=>[]),
        getCachedScan(tables.users).catch(()=>[])
      ]);
      const coachRefs=buildCoachRefs({coaches,users});
      const scoped=filterLoadAllForUser({campuses,students,classes,schedule,feedbacks,purchases,coaches},user,coachRefs);
      const now=new Date();
      const visibleStudentIds=new Set((scoped.students||[]).map(item=>String(item?.id||'').trim()).filter(Boolean));
      const visibleStudentNames=new Set((scoped.students||[]).map(item=>String(item?.name||'').trim()).filter(Boolean));
      const relevantPurchases=(scoped.purchases||[]).filter(item=>{
        const studentId=String(item?.studentId||'').trim();
        const studentName=String(item?.studentName||'').trim();
        return (studentId&&visibleStudentIds.has(studentId))||(studentName&&visibleStudentNames.has(studentName));
      });
      const decoratedStudents=decorateWorkbenchStudents(scoped.students||[],scoped.schedule||[],now);
      const decoratedFeedbacks=decorateWorkbenchFeedbacks(scoped.feedbacks||[]);
      const decoratedSchedule=decorateWorkbenchScheduleRows(scoped.schedule||[],decoratedFeedbacks,relevantPurchases,now);
      const decoratedClasses=decorateWorkbenchClasses(scoped.classes||[],scoped.schedule||[]);
      const stats=buildWorkbenchStats({schedule:decoratedSchedule,feedbacks:decoratedFeedbacks,purchases:relevantPurchases,now});
      return {
        body:{
          campuses:scoped.campuses||[],
          students:decoratedStudents,
          classes:decoratedClasses,
          schedule:decoratedSchedule,
          feedbacks:decoratedFeedbacks,
          stats
        }
      };
    }

    return null;
  };
}

module.exports = { createPageDataHandler };
