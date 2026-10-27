// Demo data so the dashboard, charts and calendar have something to show.
// Employees are matched by email (safe to run on every start).
// Sample leaves are only added when the database has no leaves at all.
const DEMO_PEOPLE = [
  { key: 'asha', name: 'Asha Rao', email: 'asha@corp.test', role: 'employee', leaveBalance: 20 },
  { key: 'ravi', name: 'Ravi Kumar', email: 'ravi@corp.test', role: 'employee', leaveBalance: 0 },
  { key: 'vikram', name: 'Vikram Shah', email: 'vikram@corp.test', role: 'employee', leaveBalance: 15 },
  { key: 'neha', name: 'Neha Iyer', email: 'neha@corp.test', role: 'employee', leaveBalance: 18 },
  { key: 'meera', name: 'Meera Nair', email: 'meera@corp.test', role: 'manager', leaveBalance: 20 },
  { key: 'kiran', name: 'Kiran Das', email: 'kiran@corp.test', role: 'hr', leaveBalance: 20 },
];

function isoOffset(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// [employee, startOffset, endOffset, status, reason]
const DEMO_LEAVES = [
  ['asha', -20, -18, 'APPROVED', 'Family function'],
  ['asha', 5, 6, 'PENDING', 'Personal work'],
  ['vikram', -2, 1, 'APPROVED', 'Vacation'],
  ['vikram', 10, 12, 'REJECTED', 'Trip'],
  ['neha', -35, -31, 'APPROVED', 'Medical'],
  ['neha', 2, 2, 'PENDING', 'Doctor appointment'],
  ['meera', -8, -7, 'APPROVED', 'Wedding'],
];

async function seed(store) {
  const existing = await store.listEmployees();
  const byEmail = new Map(existing.map((e) => [e.email, e]));
  const people = {};
  for (const p of DEMO_PEOPLE) {
    const { key, ...data } = p;
    people[key] = byEmail.get(p.email) || (await store.createEmployee(data));
  }

  if ((await store.listLeaves()).length > 0) return;

  const managerId = people.meera.id;
  for (const [key, from, to, status, reason] of DEMO_LEAVES) {
    const emp = people[key];
    const days = to - from + 1;
    await store.createLeave({
      employeeId: emp.id,
      startDate: isoOffset(from),
      endDate: isoOffset(to),
      days,
      reason,
      status,
      decidedBy: status === 'PENDING' ? undefined : managerId,
    });
    if (status === 'APPROVED') {
      emp.leaveBalance = Math.max(0, emp.leaveBalance - days);
      await store.updateEmployeeBalance(emp.id, emp.leaveBalance);
    }
  }
  console.log('Seeded demo leaves');
}

module.exports = { seed };
