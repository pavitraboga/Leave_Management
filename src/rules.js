const RULES = {

  maxDaysPerApproval: 10,
};

const DAY_MS = 24 * 60 * 60 * 1000;


function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}


function countDays(start, end) {
  return Math.round((end - start) / DAY_MS) + 1;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

module.exports = { RULES, parseDate, countDays, overlaps };
