const fs = require('fs');
const path = require('path');

const auditPath = path.join(__dirname, '..', '..', 'docs', 'reports', 'mabao-membership-sheet-audit-details.json');
const referencePath = path.join(__dirname, '..', '..', 'docs', 'reports', 'mabao-membership-sheet-reference.json');
const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');

function normalizeName(value) {
  return String(value || '').replace(/[（）()]/g, '').replace(/\s+/g, '').trim();
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function main() {
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const refs = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
  const refByPhone = new Map(refs.map((row) => [normalizePhone(row.phone), row]));

  const autoFix = [];
  const manualFix = [];
  const archiveCandidates = [];

  (audit.mismatches || []).forEach((row) => {
    const ref = refByPhone.get(normalizePhone(row.phone)) || refs.find((item) => normalizeName(item.name) === normalizeName(row.name));
    const issueTypes = new Set((row.issues || []).map((item) => item.type));
    const systemOrders = row.systemOrders || [];

    if (systemOrders.length === 1) {
      const systemOrder = systemOrders[0];
      const onlySafeTypes = [...issueTypes].every((type) => [
        'first_bonus_mismatch',
        'discount_mismatch',
        'benefit_publicLessonCount_mismatch',
        'benefit_stringingLaborCount_mismatch',
        'benefit_ballMachineCount_mismatch',
        'benefit_level2PartnerCount_mismatch'
      ].includes(type));
      if (onlySafeTypes && ref) {
        autoFix.push({
          rowNo: row.rowNo,
          name: row.name,
          phone: row.phone,
          membershipOrderId: systemOrder.id,
          membershipOrderCourtId: systemOrder.courtId,
          expected: {
            bonusAmount: ref.bonusAmount,
            discountRate: ref.discountRate,
            publicLessonCount: ref.publicLessonCount,
            stringingLaborCount: ref.stringingLaborCount,
            ballMachineCount: ref.ballMachineCount,
            level2PartnerCount: ref.level2PartnerCount,
            notes: ref.notes
          },
          actual: {
            bonusAmount: systemOrder.bonusAmount,
            discountRate: systemOrder.discountRate,
            benefitSnapshot: systemOrder.benefitSnapshot || {},
            notes: systemOrder.notes || ''
          }
        });
        return;
      }
    }

    manualFix.push({
      rowNo: row.rowNo,
      name: row.name,
      phone: row.phone,
      issues: row.issues || [],
      systemOrders
    });
  });

  (audit.extraSystemOrders || []).forEach((row) => {
    archiveCandidates.push({
      membershipOrderId: row.id,
      courtId: row.courtId,
      name: row.name,
      rechargeAmount: row.rechargeAmount,
      bonusAmount: row.bonusAmount,
      notes: row.notes || ''
    });
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    autoFixCount: autoFix.length,
    manualFixCount: manualFix.length,
    archiveCandidateCount: archiveCandidates.length
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'mabao-membership-repair-plan-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportDir, 'mabao-membership-repair-plan-details.json'), JSON.stringify({
    autoFix,
    manualFix,
    archiveCandidates
  }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main();
