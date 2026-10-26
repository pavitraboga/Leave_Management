// MongoDB store used in the deployed container (docker compose).
const mongoose = require('mongoose');

const toJSON = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    if (ret.employeeId) ret.employeeId = String(ret.employeeId);
    return ret;
  },
};

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ['employee', 'manager', 'hr'], default: 'employee' },
    leaveBalance: { type: Number, default: 20 },
  },
  { toJSON }
);

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: String,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    decidedBy: String,
    decisionNote: String,
    createdAt: { type: Date, default: Date.now },
  },
  { toJSON }
);

const Employee = mongoose.model('Employee', employeeSchema);
const Leave = mongoose.model('Leave', leaveSchema);

const out = (doc) => (doc ? doc.toJSON() : null);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

async function createMongoStore(uri) {
  await mongoose.connect(uri);

  return {
    async createEmployee(data) {
      return out(await Employee.create(data));
    },
    async getEmployee(id) {
      return validId(id) ? out(await Employee.findById(id)) : null;
    },
    async listEmployees() {
      return (await Employee.find()).map(out);
    },
    async updateEmployeeBalance(id, leaveBalance) {
      return out(await Employee.findByIdAndUpdate(id, { leaveBalance }, { new: true }));
    },
    async createLeave(data) {
      return out(await Leave.create(data));
    },
    async getLeave(id) {
      return validId(id) ? out(await Leave.findById(id)) : null;
    },
    async listLeaves(filter = {}) {
      const q = {};
      for (const [k, v] of Object.entries(filter)) q[k] = Array.isArray(v) ? { $in: v } : v;
      return (await Leave.find(q).sort({ createdAt: -1 })).map(out);
    },
    async updateLeave(id, changes) {
      return out(await Leave.findByIdAndUpdate(id, changes, { new: true }));
    },
    async ping() {
      return mongoose.connection.readyState === 1;
    },
  };
}

module.exports = { createMongoStore };
