const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

const cls = {
  id: 'class-a',
  className: 'CLS0001-成人私教10节',
  productName: '成人私教10节',
  coach: '朝珺',
  campus: 'mabao',
  totalLessons: 10,
  usedLessons: 2,
  status: '已排班'
};

const students = [
  { id: 'stu-1', name: '大宝', phone: '13800000001' },
  { id: 'stu-2', name: '二宝', phone: '13800000002' }
];

const plan = rules.buildClassPlanRecord(cls, students[0]);
assert.deepStrictEqual(
  {
    classId: plan.classId,
    studentId: plan.studentId,
    studentName: plan.studentName,
    studentPhone: plan.studentPhone,
    className: plan.className,
    productName: plan.productName,
    coach: plan.coach,
    campus: plan.campus,
    totalLessons: plan.totalLessons,
    usedLessons: plan.usedLessons,
    status: plan.status
  },
  {
    classId: 'class-a',
    studentId: 'stu-1',
    studentName: '大宝',
    studentPhone: '13800000001',
    className: 'CLS0001-成人私教10节',
    productName: '成人私教10节',
    coach: '朝珺',
    campus: 'mabao',
    totalLessons: 10,
    usedLessons: 2,
    status: 'active'
  },
  'active class should create active student plan'
);

assert.strictEqual(
  rules.buildClassPlanRecord({ ...cls, status: '已取消' }, students[0]).status,
  '已取消',
  'cancelled class should create cancelled student plan'
);

assert.strictEqual(
  rules.buildClassPlanRecord({ ...cls, status: '已结课' }, students[0]).status,
  '已结课',
  'finished class should create finished student plan'
);

assert.throws(
  () => rules.assertCanDeleteProduct('prod-a', [{ productId: 'prod-a', className: 'CLS0001' }]),
  /已有班次使用/,
  'product used by classes should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteClass('class-a', [{ classId: 'class-a' }]),
  /已有排课/,
  'class with schedules should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteCourt({ id: 'court-a', history: [{ type: '充值', amount: 1000 }] }),
  /已有财务流水/,
  'court account with finance history should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteCourt({ id: 'court-b', balance: 500, history: [] }),
  /已有财务数据/,
  'legacy court account with non-zero money should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteCourt({ id: 'court-c', balance: 0, totalDeposit: 0, spentAmount: 0, history: [] }),
  'empty court account can be deleted'
);

console.log('class plan rules tests passed');
