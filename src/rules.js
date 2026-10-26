// Business rules for the Leave Management System.
//
// >>> CI/CD DEMO <<<
// Change maxDaysPerApproval (e.g. 10 -> 5), commit and push.
// Jenkins will test, build, deploy and health-check the new version automatically.
const RULES = {
  // A manager can approve a single leave request of at most this many days.
  maxDaysPerApproval: 10,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Accepts only "YYYY-MM-DD" and returns a UTC Date, or null if invalid.
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

// Inclusive number of calendar days between two dates.
function countDays(start, end) {
  return Math.round((end - start) / DAY_MS) + 1;
}

// True if the ranges [aStart, aEnd] and [bStart, bEnd] share at least one day.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

module.exports = { RULES, parseDate, countDays, overlaps };
