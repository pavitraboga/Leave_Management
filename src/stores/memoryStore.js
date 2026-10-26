// In-memory store used by the automated tests (no database needed in CI).
function createMemoryStore() {
  let employees = [];
  let leaves = [];
  let seq = 1;
  const id = () => String(seq++);
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

  return {
    async createEmployee(data) {
      const emp = { id: id(), ...data };
      employees.push(emp);
      return clone(emp);
    },
    async getEmployee(empId) {
      return clone(employees.find((e) => e.id === empId) || null);
    },
    async listEmployees() {
      return clone(employees);
    },
    async updateEmployeeBalance(empId, leaveBalance) {
      const emp = employees.find((e) => e.id === empId);
      if (emp) emp.leaveBalance = leaveBalance;
      return clone(emp || null);
    },
    async createLeave(data) {
      const leave = { id: id(), ...data, createdAt: new Date().toISOString() };
      leaves.push(leave);
      return clone(leave);
    },
    async getLeave(leaveId) {
      return clone(leaves.find((l) => l.id === leaveId) || null);
    },
    async listLeaves(filter = {}) {
      return clone(
        leaves.filter((l) =>
          Object.entries(filter).every(([k, v]) =>
            Array.isArray(v) ? v.includes(l[k]) : l[k] === v
          )
        )
      );
    },
    async updateLeave(leaveId, changes) {
      const leave = leaves.find((l) => l.id === leaveId);
      if (leave) Object.assign(leave, changes);
      return clone(leave || null);
    },
    async ping() {
      return true;
    },
    async reset() {
      employees = [];
      leaves = [];
      seq = 1;
    },
  };
}

module.exports = { createMemoryStore };
