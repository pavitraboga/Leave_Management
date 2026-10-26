const request = require('supertest');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/stores/memoryStore');
const { RULES, countDays, parseDate, overlaps } = require('../src/rules');

let store;
let app;
let emp;
let zeroEmp;
let manager;
let hr;

beforeEach(async () => {
  store = createMemoryStore();
  app = createApp(store);
  emp = await store.createEmployee({ name: 'Asha', email: 'a@x.test', role: 'employee', leaveBalance: 20 });
  zeroEmp = await store.createEmployee({ name: 'Ravi', email: 'r@x.test', role: 'employee', leaveBalance: 0 });
  manager = await store.createEmployee({ name: 'Meera', email: 'm@x.test', role: 'manager', leaveBalance: 20 });
  hr = await store.createEmployee({ name: 'Kiran', email: 'k@x.test', role: 'hr', leaveBalance: 20 });
});

const apply = (employeeId, startDate, endDate) =>
  request(app).post('/api/leaves').send({ employeeId, startDate, endDate, reason: 'test' });
const approve = (id, managerId = manager.id) =>
  request(app).post(`/api/leaves/${id}/approve`).send({ managerId });

describe('rules helpers', () => {
  test('countDays is inclusive', () => {
    expect(countDays(parseDate('2026-11-02'), parseDate('2026-11-04'))).toBe(3);
  });
  test('parseDate rejects invalid dates', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('02/11/2026')).toBeNull();
  });
  test('overlaps detects shared days', () => {
    const d = parseDate;
    expect(overlaps(d('2026-11-01'), d('2026-11-05'), d('2026-11-05'), d('2026-11-07'))).toBe(true);
    expect(overlaps(d('2026-11-01'), d('2026-11-04'), d('2026-11-05'), d('2026-11-07'))).toBe(false);
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('applying for leave', () => {
  test('creates a PENDING request with correct day count', async () => {
    const res = await apply(emp.id, '2026-11-02', '2026-11-04');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.days).toBe(3);
  });

  test('rejects overlapping leave dates', async () => {
    await apply(emp.id, '2026-11-02', '2026-11-05');
    const res = await apply(emp.id, '2026-11-05', '2026-11-07');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/overlaps/);
  });

  test('allows the same dates again after the earlier request was rejected', async () => {
    const first = await apply(emp.id, '2026-11-02', '2026-11-03');
    await request(app).post(`/api/leaves/${first.body.id}/reject`).send({ managerId: manager.id });
    const res = await apply(emp.id, '2026-11-02', '2026-11-03');
    expect(res.status).toBe(201);
  });

  test('rejects leave when balance is zero', async () => {
    const res = await apply(zeroEmp.id, '2026-11-02', '2026-11-02');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('leave balance is zero');
  });

  test('rejects leave longer than the remaining balance', async () => {
    await store.updateEmployeeBalance(emp.id, 2);
    const res = await apply(emp.id, '2026-11-02', '2026-11-04');
    expect(res.status).toBe(422);
  });

  test('rejects end date before start date', async () => {
    const res = await apply(emp.id, '2026-11-05', '2026-11-01');
    expect(res.status).toBe(400);
  });
});

describe('manager decisions', () => {
  test('approval deducts the balance', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-04');
    const res = await approve(leave.body.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect((await store.getEmployee(emp.id)).leaveBalance).toBe(17);
  });

  test('rejection does not deduct the balance', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-04');
    const res = await request(app).post(`/api/leaves/${leave.body.id}/reject`).send({ managerId: manager.id });
    expect(res.body.status).toBe('REJECTED');
    expect((await store.getEmployee(emp.id)).leaveBalance).toBe(20);
  });

  test('approval fails if balance dropped to zero after applying', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-02');
    await store.updateEmployeeBalance(emp.id, 0);
    const res = await approve(leave.body.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('leave balance is zero');
  });

  test('only managers can approve', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-02');
    const res = await approve(leave.body.id, hr.id);
    expect(res.status).toBe(403);
  });

  test('a request cannot be decided twice', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-02');
    await approve(leave.body.id);
    const res = await approve(leave.body.id);
    expect(res.status).toBe(409);
    expect((await store.getEmployee(emp.id)).leaveBalance).toBe(19);
  });

  // These two tests read RULES.maxDaysPerApproval, so they keep passing
  // whatever value the demo changes it to.
  test(`approves a request exactly at the limit (${RULES.maxDaysPerApproval} days)`, async () => {
    const start = '2026-12-01';
    const end = `2026-12-${String(RULES.maxDaysPerApproval).padStart(2, '0')}`;
    const leave = await apply(emp.id, start, end);
    expect(leave.body.days).toBe(RULES.maxDaysPerApproval);
    const res = await approve(leave.body.id);
    expect(res.status).toBe(200);
  });

  test('refuses to approve a request longer than the limit', async () => {
    const start = '2026-12-01';
    const end = `2026-12-${String(RULES.maxDaysPerApproval + 1).padStart(2, '0')}`;
    const leave = await apply(emp.id, start, end);
    const res = await approve(leave.body.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/exceeds the approval limit/);
    expect((await store.getEmployee(emp.id)).leaveBalance).toBe(20);
  });
});

describe('HR balances', () => {
  test('HR sees balances and days taken', async () => {
    const leave = await apply(emp.id, '2026-11-02', '2026-11-03');
    await approve(leave.body.id);
    const res = await request(app).get(`/api/hr/balances?hrId=${hr.id}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.id === emp.id);
    expect(row).toMatchObject({ leaveBalance: 18, daysTaken: 2 });
  });

  test('non-HR users cannot view balances', async () => {
    const res = await request(app).get(`/api/hr/balances?hrId=${emp.id}`);
    expect(res.status).toBe(403);
  });
});
