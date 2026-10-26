const express = require('express');
const path = require('path');
const { RULES, parseDate, countDays, overlaps } = require('./rules');

const APP_VERSION = process.env.APP_VERSION || 'dev';

function createApp(store) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  const fail = (res, status, error) => res.status(status).json({ error });

  // ---------- Health ----------
  app.get('/health', wrap(async (_req, res) => {
    const db = await store.ping().catch(() => false);
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      db: db ? 'up' : 'down',
      version: APP_VERSION,
      rules: RULES,
    });
  }));

  app.get('/api/rules', (_req, res) => res.json({ version: APP_VERSION, rules: RULES }));

  // ---------- Employees ----------
  app.post('/api/employees', wrap(async (req, res) => {
    const { name, email, role = 'employee', leaveBalance = 20 } = req.body || {};
    if (!name || !email) return fail(res, 400, 'name and email are required');
    if (!['employee', 'manager', 'hr'].includes(role)) return fail(res, 400, 'invalid role');
    if (!Number.isInteger(leaveBalance) || leaveBalance < 0) {
      return fail(res, 400, 'leaveBalance must be a non-negative integer');
    }
    res.status(201).json(await store.createEmployee({ name, email, role, leaveBalance }));
  }));

  app.get('/api/employees', wrap(async (_req, res) => res.json(await store.listEmployees())));

  // ---------- Employee applies for leave ----------
  app.post('/api/leaves', wrap(async (req, res) => {
    const { employeeId, startDate, endDate, reason = '' } = req.body || {};
    const emp = await store.getEmployee(employeeId);
    if (!emp) return fail(res, 404, 'employee not found');

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end) return fail(res, 400, 'dates must be in YYYY-MM-DD format');
    if (end < start) return fail(res, 400, 'endDate must be on or after startDate');

    const days = countDays(start, end);

    // Rule: cannot apply when balance is zero, or for more days than available.
    if (emp.leaveBalance <= 0) return fail(res, 422, 'leave balance is zero');
    if (days > emp.leaveBalance) return fail(res, 422, 'insufficient leave balance');

    // Rule: no overlapping leave dates (against pending and approved requests).
    const existing = await store.listLeaves({ employeeId, status: ['PENDING', 'APPROVED'] });
    const clash = existing.find((l) =>
      overlaps(start, end, parseDate(l.startDate), parseDate(l.endDate))
    );
    if (clash) return fail(res, 409, `overlaps with existing leave ${clash.startDate} to ${clash.endDate}`);

    const leave = await store.createLeave({
      employeeId, startDate, endDate, days, reason, status: 'PENDING',
    });
    res.status(201).json(leave);
  }));

  app.get('/api/leaves', wrap(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    res.json(await store.listLeaves(filter));
  }));

  // ---------- Manager approves / rejects ----------
  async function loadDecision(req, res) {
    const manager = await store.getEmployee(req.body && req.body.managerId);
    if (!manager || manager.role !== 'manager') {
      fail(res, 403, 'only a manager can approve or reject leave');
      return null;
    }
    const leave = await store.getLeave(req.params.id);
    if (!leave) { fail(res, 404, 'leave not found'); return null; }
    if (leave.status !== 'PENDING') { fail(res, 409, `leave already ${leave.status}`); return null; }
    if (leave.employeeId === manager.id) {
      fail(res, 403, 'managers cannot decide their own leave');
      return null;
    }
    return { manager, leave };
  }

  app.post('/api/leaves/:id/approve', wrap(async (req, res) => {
    const ctx = await loadDecision(req, res);
    if (!ctx) return;
    const { manager, leave } = ctx;

    // Rule (CI/CD demo rule): requests longer than the limit cannot be approved.
    if (leave.days > RULES.maxDaysPerApproval) {
      return fail(res, 422,
        `leave of ${leave.days} days exceeds the approval limit of ${RULES.maxDaysPerApproval} days`);
    }

    const emp = await store.getEmployee(leave.employeeId);
    // Rule: reject approval when balance is zero / insufficient at decision time.
    if (emp.leaveBalance <= 0) return fail(res, 422, 'leave balance is zero');
    if (leave.days > emp.leaveBalance) return fail(res, 422, 'insufficient leave balance');

    // Rule: balance is deducted only on approval.
    await store.updateEmployeeBalance(emp.id, emp.leaveBalance - leave.days);
    const updated = await store.updateLeave(leave.id, { status: 'APPROVED', decidedBy: manager.id });
    res.json(updated);
  }));

  app.post('/api/leaves/:id/reject', wrap(async (req, res) => {
    const ctx = await loadDecision(req, res);
    if (!ctx) return;
    const updated = await store.updateLeave(ctx.leave.id, {
      status: 'REJECTED',
      decidedBy: ctx.manager.id,
      decisionNote: (req.body && req.body.note) || '',
    });
    res.json(updated);
  }));

  // ---------- HR views balances ----------
  app.get('/api/hr/balances', wrap(async (req, res) => {
    const hr = await store.getEmployee(req.query.hrId);
    if (!hr || hr.role !== 'hr') return fail(res, 403, 'only HR can view leave balances');
    const employees = await store.listEmployees();
    const approved = await store.listLeaves({ status: 'APPROVED' });
    res.json(employees.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      leaveBalance: e.leaveBalance,
      daysTaken: approved.filter((l) => l.employeeId === e.id).reduce((s, l) => s + l.days, 0),
    })));
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
