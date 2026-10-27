/* Absenta — Employee Leave Management front end (no frameworks, no build step). */
(() => {
  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayIso = () => iso(new Date());
  const fmt = (s) => { const d = fromIso(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const fmtRange = (a, b) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);
  const covers = (l, day) => l.startDate <= day && day <= l.endDate;
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  const AVATAR = [['#fde4e8', '#c1415a'], ['#e2f6ea', '#23885a'], ['#ece8fb', '#5a4bab'], ['#faf6cf', '#857a10'], ['#e3f3fb', '#2a6b8c'], ['#fdeedd', '#b05f12']];
  const initials = (name) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (p, sm) => {
    const i = state.people.findIndex((x) => x.id === p.id);
    const [bg, fg] = AVATAR[(i < 0 ? 0 : i) % AVATAR.length];
    return `<span class="avatar${sm ? ' sm' : ''}" style="background:${bg};color:${fg}">${esc(initials(p.name))}</span>`;
  };
  const shortName = (p) => p.name.replace(/\s*\(.*?\)/g, '');
  const statusTag = (s) => `<span class="tag tag-${s.toLowerCase()}">${s.charAt(0) + s.slice(1).toLowerCase()}</span>`;

  async function api(url, opts = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  }

  let toastTimer;
  function toast(msg, ok = true) {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${ok ? 'ok' : 'bad'}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ---------------------------------------------------------------- state
  const now = new Date();
  const state = {
    view: location.hash === '#manager' ? 'manager' : store.get('absenta.view') || 'employee',
    rules: { maxDaysPerApproval: 10 },
    version: '',
    people: [],
    leaves: [],
    meId: store.get('absenta.me'),
    mgrId: store.get('absenta.mgr'),
    empMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    teamMode: 'week',
    teamMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    weekStart: addDays(now, -now.getDay()),
  };
  const person = (id) => state.people.find((p) => p.id === id);
  const team = () => state.people.filter((p) => p.role !== 'hr');

  // ---------------------------------------------------------------- data
  async function load() {
    const [r, people, leaves] = await Promise.all([api('/api/rules'), api('/api/employees'), api('/api/leaves')]);
    if (r.ok) { state.rules = r.body.rules; state.version = r.body.version; }
    state.people = people.ok ? people.body : [];
    state.leaves = leaves.ok ? leaves.body : [];
    const emps = state.people.filter((p) => p.role === 'employee');
    const mgrs = state.people.filter((p) => p.role === 'manager');
    if (!person(state.meId) || person(state.meId).role !== 'employee') state.meId = emps[0] && emps[0].id;
    if (!person(state.mgrId) || person(state.mgrId).role !== 'manager') state.mgrId = mgrs[0] && mgrs[0].id;
    render();
  }

  // ---------------------------------------------------------------- render: shared
  function render() {
    $('versionPill').textContent = `build ${state.version || 'dev'}`;
    $('rulePill').textContent = `max ${state.rules.maxDaysPerApproval} days / approval`;
    const isMgr = state.view === 'manager';
    $('roleSwitch').classList.toggle('manager', isMgr);
    document.querySelectorAll('#roleSwitch button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    $('employeeView').hidden = isMgr;
    $('managerView').hidden = !isMgr;
    if (isMgr) renderManager(); else renderEmployee();
  }

  function fillSelect(sel, list, value) {
    sel.innerHTML = list.map((p) => `<option value="${p.id}">${esc(shortName(p))}</option>`).join('');
    if (value) sel.value = value;
  }

  // Donut with a single arc. value/total -> share of the ring.
  function donut(value, total, color, num, label, cap) {
    const r = 46, c = 2 * Math.PI * r;
    const frac = total > 0 ? Math.min(1, value / total) : 0;
    return `<div class="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label="${esc(label)}: ${num}">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--track)" stroke-width="14"/>
        <circle class="arc" cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" ${frac === 0 ? 'opacity="0"' : ''}/>
        <text x="60" y="60" text-anchor="middle" dominant-baseline="central" font-size="28" font-weight="600" fill="var(--ink)" font-family="inherit">${pad(num)}</text>
      </svg>
      <div class="label">${esc(label)}</div>
      <div class="cap">${esc(cap)}</div>
    </div>`;
  }

  // Month grid; chipsFor(dayIso) -> array of {cls, text, title}
  function monthGrid(monthStart, chipsFor, maxChips = 3) {
    const first = addDays(monthStart, -monthStart.getDay());
    const today = todayIso();
    let html = '<div class="month">' + DOW.map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(first, i);
      if (i === 35 && d.getMonth() !== monthStart.getMonth()) break;
      const day = iso(d);
      const chips = chipsFor(day);
      const cls = ['day', d.getMonth() !== monthStart.getMonth() && 'out', day === today && 'today', (d.getDay() % 6 === 0) && 'weekend'].filter(Boolean).join(' ');
      html += `<div class="${cls}"><span class="dnum">${d.getDate()}</span>`;
      html += chips.slice(0, maxChips).map((c) => `<div class="chip chip-${c.cls}" title="${esc(c.title)}">${esc(c.text)}</div>`).join('');
      if (chips.length > maxChips) html += `<span class="more">+${chips.length - maxChips} more</span>`;
      html += '</div>';
    }
    return html + '</div>';
  }

  // ---------------------------------------------------------------- render: employee
  function renderEmployee() {
    fillSelect($('meSelect'), state.people.filter((p) => p.role === 'employee'), state.meId);
    const me = person(state.meId);
    if (!me) { $('empDonuts').innerHTML = '<div class="empty">No employees yet.</div>'; return; }

    const mine = state.leaves.filter((l) => l.employeeId === me.id);
    const taken = sum(mine.filter((l) => l.status === 'APPROVED'), (l) => l.days);
    const pending = sum(mine.filter((l) => l.status === 'PENDING'), (l) => l.days);
    const entitlement = me.leaveBalance + taken;

    $('empDonuts').innerHTML =
      donut(me.leaveBalance, entitlement, 'var(--mint)', me.leaveBalance, 'Leave Balance', 'days remaining') +
      donut(taken, entitlement, 'var(--blush)', taken, 'Leave Taken', 'days approved') +
      donut(pending, entitlement, 'var(--butter)', pending, 'Pending', 'days awaiting approval');

    // Up next
    const today = todayIso();
    const upcoming = mine.filter((l) => l.endDate >= today && l.status !== 'REJECTED').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
    const chipColors = { APPROVED: ['var(--mint-soft)', 'var(--mint-ink)'], PENDING: ['var(--butter-soft)', 'var(--butter-ink)'] };
    $('upNext').innerHTML = upcoming.length ? upcoming.map((l) => {
      const d = fromIso(l.startDate); const [bg, fg] = chipColors[l.status];
      return `<div class="next-item">
        <div class="date-chip" style="background:${bg};color:${fg}"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()].slice(0, 3)}</span></div>
        <div style="flex:1;min-width:0"><div style="font-weight:500">${esc(l.reason || 'Leave')}</div>
        <div class="muted small">${fmtRange(l.startDate, l.endDate)} · ${l.days} day${l.days > 1 ? 's' : ''}</div></div>
        ${statusTag(l.status)}</div>`;
    }).join('') : '<div class="empty">No upcoming leave. Time for a break? 🌴</div>';

    $('empRuleNote').innerHTML = me.leaveBalance <= 0
      ? '<b>Your balance is zero</b> — new requests will be rejected.'
      : `Managers can approve up to <b>${state.rules.maxDaysPerApproval} days</b> per request. Overlapping dates aren't allowed.`;

    // Calendar
    const m = state.empMonth;
    $('empCalTitle').textContent = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
    $('empCalendar').innerHTML = monthGrid(m, (day) => mine.filter((l) => covers(l, day)).map((l) => ({
      cls: l.status.toLowerCase(), text: l.reason || 'Leave', title: `${l.reason || 'Leave'} · ${l.status}`,
    })));

    // Record
    const rows = [...mine].sort((a, b) => b.startDate.localeCompare(a.startDate));
    $('empRecord').innerHTML = '<thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Decided by</th></tr></thead><tbody>' +
      (rows.length ? rows.map((l) => `<tr><td>${fmtRange(l.startDate, l.endDate)}</td><td>${l.days}</td><td>${esc(l.reason || '—')}</td>
        <td>${statusTag(l.status)}</td><td>${l.decidedBy && person(l.decidedBy) ? esc(shortName(person(l.decidedBy))) : '<span class="muted">—</span>'}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">No leave requests yet.</td></tr>') + '</tbody>';
  }

  // ---------------------------------------------------------------- render: manager
  const ICONS = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5 3 11l1.5-1.5 7 1L16 6a2.1 2.1 0 0 1 3 3l-4.5 4.5 1 7L14 22l-2.5-7.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
  };

  function renderManager() {
    fillSelect($('mgrSelect'), state.people.filter((p) => p.role === 'manager'), state.mgrId);
    const today = todayIso();
    const members = team();
    const pending = state.leaves.filter((l) => l.status === 'PENDING').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const approved = state.leaves.filter((l) => l.status === 'APPROVED');
    const onLeave = members.filter((p) => approved.some((l) => l.employeeId === p.id && covers(l, today)));

    // KPIs
    const kpi = (icon, bg, fg, v, l) => `<div class="card kpi"><div class="ico" style="background:${bg};color:${fg}">${ICONS[icon]}</div><div><div class="v">${v}</div><div class="l">${l}</div></div></div>`;
    $('kpis').innerHTML =
      kpi('clock', 'var(--butter-soft)', 'var(--butter-ink)', pending.length, 'Pending requests') +
      kpi('plane', 'var(--sky-soft)', '#2a6b8c', `${onLeave.length}<span class="muted small"> / ${members.length}</span>`, 'On leave today') +
      kpi('check', 'var(--mint-soft)', 'var(--mint-ink)', sum(approved, (l) => l.days), 'Approved leave days') +
      kpi('shield', 'var(--lav-soft)', 'var(--lav-ink)', `${state.rules.maxDaysPerApproval}d`, 'Max per approval');

    // Pending approvals
    $('pendingList').innerHTML = pending.length ? pending.map((l) => {
      const p = person(l.employeeId) || { id: l.employeeId, name: 'Unknown' };
      const flags = [];
      if (l.days > state.rules.maxDaysPerApproval) flags.push(`<span class="tag tag-warn">Over ${state.rules.maxDaysPerApproval}-day limit</span>`);
      if (p.leaveBalance !== undefined && l.days > p.leaveBalance) flags.push('<span class="tag tag-rejected">Insufficient balance</span>');
      if (p.id === state.mgrId) flags.push('<span class="tag tag-warn">Your own request</span>');
      return `<div class="req">${avatar(p)}
        <div class="info"><b>${esc(shortName(p))}</b>
          <div class="sub">${fmtRange(l.startDate, l.endDate)} · ${l.days} day${l.days > 1 ? 's' : ''} · ${esc(l.reason || 'No reason')} · balance ${p.leaveBalance ?? '—'}</div>
          ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}</div>
        <div class="acts"><button class="btn btn-sm btn-approve" data-decide="approve" data-id="${l.id}">Approve</button>
        <button class="btn btn-sm btn-reject" data-decide="reject" data-id="${l.id}">Reject</button></div></div>`;
    }).join('') : '<div class="empty">All caught up — no pending requests. ✨</div>';

    // Availability
    const d = new Date();
    $('todayLabel').textContent = `· ${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
    $('availability').innerHTML = members.map((p) => {
      const away = approved.find((l) => l.employeeId === p.id && covers(l, today));
      return `<div class="avail">${avatar(p)}<div class="who"><b>${esc(shortName(p))}</b><small>${p.role}${away ? ` · back ${fmt(iso(addDays(fromIso(away.endDate), 1)))}` : ''}</small></div>
        ${away ? '<span class="tag tag-onleave">On Leave</span>' : '<span class="tag tag-available">Available</span>'}</div>`;
    }).join('') || '<div class="empty">No team members.</div>';

    renderTeamCalendar(members);
    renderCharts(members);

    // Decision history
    const decided = state.leaves.filter((l) => l.status !== 'PENDING').sort((a, b) => b.startDate.localeCompare(a.startDate));
    $('mgrRecord').innerHTML = '<thead><tr><th>Employee</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Decided by</th></tr></thead><tbody>' +
      (decided.length ? decided.map((l) => {
        const p = person(l.employeeId) || { id: l.employeeId, name: 'Unknown' };
        const by = person(l.decidedBy);
        return `<tr><td><div class="person">${avatar(p, true)}${esc(shortName(p))}</div></td><td>${fmtRange(l.startDate, l.endDate)}</td><td>${l.days}</td>
          <td>${esc(l.reason || '—')}</td><td>${statusTag(l.status)}</td><td>${by ? esc(shortName(by)) : '—'}</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="empty">No decisions yet.</td></tr>') + '</tbody>';
  }

  function renderTeamCalendar(members) {
    document.querySelectorAll('#teamMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.teamMode));
    const today = todayIso();
    const visible = state.leaves.filter((l) => members.some((p) => p.id === l.employeeId));

    if (state.teamMode === 'month') {
      const m = state.teamMonth;
      $('teamCalTitle').textContent = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
      $('teamCalendar').innerHTML = monthGrid(m, (day) => visible.filter((l) => covers(l, day)).map((l) => {
        const p = person(l.employeeId);
        return { cls: l.status.toLowerCase(), text: shortName(p).split(' ')[0], title: `${shortName(p)} · ${l.reason || 'Leave'} · ${l.status}` };
      }));
      return;
    }

    const ws = state.weekStart;
    const days = [...Array(7)].map((_, i) => addDays(ws, i));
    const we = days[6];
    $('teamCalTitle').textContent = ws.getMonth() === we.getMonth()
      ? `${ws.getDate()} – ${we.getDate()} ${MONTHS[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`
      : `${ws.getDate()} ${MONTHS[ws.getMonth()].slice(0, 3)} – ${we.getDate()} ${MONTHS[we.getMonth()].slice(0, 3)}`;

    let html = '<div class="week-wrap"><div class="week"><div class="corner">Team Member</div>';
    html += days.map((d) => `<div class="wh${iso(d) === today ? ' today' : ''}"><div class="d">${DOW[d.getDay()]}</div><div class="n">${pad(d.getDate())}</div></div>`).join('');
    for (const p of members) {
      html += `<div class="member">${avatar(p, true)}<span>${esc(shortName(p))}</span></div>`;
      for (const d of days) {
        const day = iso(d);
        const l = visible.find((x) => x.employeeId === p.id && covers(x, day) && x.status !== 'REJECTED')
          || visible.find((x) => x.employeeId === p.id && covers(x, day));
        const cls = ['slot', day === today && 'today', d.getDay() % 6 === 0 && 'weekend'].filter(Boolean).join(' ');
        html += `<div class="${cls}">${l ? `<div class="block block-${l.status.toLowerCase()}" title="${esc(l.status)}"><b>${esc(l.reason || 'Leave')}</b><br>${fmtRange(l.startDate, l.endDate)}</div>` : ''}</div>`;
      }
    }
    $('teamCalendar').innerHTML = html + '</div></div>';
  }

  function renderCharts(members) {
    // 1) Stacked balance bars per member
    const rows = members.map((p) => {
      const mine = state.leaves.filter((l) => l.employeeId === p.id);
      const taken = sum(mine.filter((l) => l.status === 'APPROVED'), (l) => l.days);
      const pend = sum(mine.filter((l) => l.status === 'PENDING'), (l) => l.days);
      return { p, taken, pend, total: p.leaveBalance + taken };
    });
    const maxTotal = Math.max(1, ...rows.map((r) => r.total));
    $('balanceChart').innerHTML = '<div class="bars">' + rows.map((r) => {
      const w = (v) => `${((v / maxTotal) * 100).toFixed(1)}%`;
      const pendShown = Math.min(r.pend, r.p.leaveBalance);
      return `<div class="bar-row"><span class="name">${esc(shortName(r.p))}</span>
        <div class="bar" style="width:${w(r.total) === '0.0%' ? '4%' : w(r.total)}" title="${r.taken} taken · ${r.pend} pending · ${r.p.leaveBalance} remaining">
          <span class="taken" style="width:${r.total ? (r.taken / r.total) * 100 : 0}%"></span><span class="pend" style="width:${r.total ? (pendShown / r.total) * 100 : 0}%"></span></div>
        <span class="val">${r.p.leaveBalance} left</span></div>`;
    }).join('') + '</div>';

    // 2) Multi-segment status donut
    const counts = ['APPROVED', 'PENDING', 'REJECTED'].map((s) => [s, state.leaves.filter((l) => l.status === s).length]);
    const total = sum(counts, (c) => c[1]);
    const colors = { APPROVED: 'var(--mint)', PENDING: 'var(--butter)', REJECTED: 'var(--blush)' };
    const r = 46, c = 2 * Math.PI * r;
    let offset = 0, arcs = '';
    for (const [s, n] of counts) {
      if (!n) continue;
      const len = (n / total) * c;
      arcs += `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${colors[s]}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2).toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 60 60)"/>`;
      offset += len;
    }
    $('statusChart').innerHTML = `<div class="status-chart">
      <svg viewBox="0 0 120 120" role="img" aria-label="Request status breakdown"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--track)" stroke-width="16"/>${arcs}
        <text x="60" y="55" text-anchor="middle" font-size="24" font-weight="600" fill="var(--ink)" font-family="inherit">${total}</text>
        <text x="60" y="75" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="inherit">requests</text></svg>
      <div class="status-legend">${counts.map(([s, n]) => `<div><i class="dot" style="background:${colors[s]}"></i>${s.charAt(0) + s.slice(1).toLowerCase()}<b>${n}</b></div>`).join('')}</div></div>`;

    // 3) Approved leave days per month (last 6 months), counted by day so spans split correctly
    const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return d; });
    const perMonth = months.map((m) => {
      const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      let n = 0;
      for (const l of state.leaves.filter((x) => x.status === 'APPROVED')) {
        for (let d = fromIso(l.startDate); iso(d) <= l.endDate; d = addDays(d, 1)) if (iso(d).startsWith(key)) n++;
      }
      return n;
    });
    const maxV = Math.max(4, ...perMonth);
    const W = 300, H = 170, base = 140, colW = 30, gap = (W - 20 - colW * 6) / 5;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Approved leave days per month">`;
    [0.5, 1].forEach((f) => { const y = base - f * 110; svg += `<line x1="10" x2="${W - 10}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 4"/>`; });
    svg += `<line x1="10" x2="${W - 10}" y1="${base}" y2="${base}" stroke="var(--line)"/>`;
    perMonth.forEach((v, i) => {
      const x = 10 + i * (colW + gap), h = (v / maxV) * 110, isNow = i === 5;
      svg += `<rect x="${x}" y="${base - h}" width="${colW}" height="${Math.max(h, 0)}" rx="7" fill="${isNow ? 'var(--rose)' : 'var(--lav)'}"><title>${v} days</title></rect>`;
      svg += `<text x="${x + colW / 2}" y="${base - h - 6}" text-anchor="middle" font-size="11" fill="var(--ink)" font-weight="500">${v}</text>`;
      svg += `<text x="${x + colW / 2}" y="${base + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${MONTHS[months[i].getMonth()].slice(0, 3)}</text>`;
    });
    $('monthChart').innerHTML = `<div class="colchart">${svg}</svg></div>`;
  }

  // ---------------------------------------------------------------- modal
  function openModal() {
    $('leaveForm').reset();
    $('fError').textContent = '';
    const t = todayIso();
    $('fStart').min = t; $('fEnd').min = t;
    updatePreview();
    $('modal').hidden = false;
    setTimeout(() => $('fStart').focus(), 50);
  }
  const closeModal = () => { $('modal').hidden = true; };

  function updatePreview() {
    const me = person(state.meId);
    const s = $('fStart').value, e = $('fEnd').value || s;
    if (!s || !me) { $('fPreview').innerHTML = 'Pick your dates to see a summary.'; return; }
    if (e < s) { $('fPreview').innerHTML = '<span class="warn">End date is before start date.</span>'; return; }
    const days = Math.round((fromIso(e) - fromIso(s)) / 86400000) + 1;
    const after = me.leaveBalance - days;
    const notes = [];
    if (me.leaveBalance <= 0) notes.push('<span class="warn">Your balance is zero — this will be rejected.</span>');
    else if (after < 0) notes.push('<span class="warn">Not enough balance for this request.</span>');
    if (days > state.rules.maxDaysPerApproval) notes.push(`<span class="warn">Longer than the ${state.rules.maxDaysPerApproval}-day approval limit — a manager won't be able to approve it.</span>`);
    $('fPreview').innerHTML = `<b>${days} day${days > 1 ? 's' : ''}</b> · balance now <b>${me.leaveBalance}</b> → after approval <b>${Math.max(after, 0)}</b>${notes.length ? '<br>' + notes.join('<br>') : ''}`;
  }

  async function submitLeave(ev) {
    ev.preventDefault();
    const startDate = $('fStart').value, endDate = $('fEnd').value || startDate;
    if (!startDate) { $('fError').textContent = 'Please choose a start date.'; return; }
    const r = await api('/api/leaves', { method: 'POST', body: JSON.stringify({ employeeId: state.meId, startDate, endDate, reason: $('fReason').value.trim() }) });
    if (!r.ok) { $('fError').textContent = r.body.error || 'Something went wrong.'; return; }
    closeModal();
    toast(`Requested ${r.body.days} day${r.body.days > 1 ? 's' : ''} — waiting for approval`);
    state.empMonth = new Date(fromIso(startDate).getFullYear(), fromIso(startDate).getMonth(), 1);
    load();
  }

  // ---------------------------------------------------------------- events
  $('roleSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b || b.dataset.view === state.view) return;
    state.view = b.dataset.view;
    store.set('absenta.view', state.view);
    history.replaceState(null, '', state.view === 'manager' ? '#manager' : '#employee');
    render();
  });
  $('meSelect').addEventListener('change', (e) => { state.meId = e.target.value; store.set('absenta.me', state.meId); render(); });
  $('mgrSelect').addEventListener('change', (e) => { state.mgrId = e.target.value; store.set('absenta.mgr', state.mgrId); render(); });
  $('teamMode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) { state.teamMode = b.dataset.mode; render(); }
  });
  document.querySelectorAll('[data-cal]').forEach((btn) => btn.addEventListener('click', () => {
    const step = Number(btn.dataset.step), n = new Date();
    if (btn.dataset.cal === 'emp') {
      state.empMonth = step === 0 ? new Date(n.getFullYear(), n.getMonth(), 1) : new Date(state.empMonth.getFullYear(), state.empMonth.getMonth() + step, 1);
    } else if (state.teamMode === 'week') {
      state.weekStart = step === 0 ? addDays(n, -n.getDay()) : addDays(state.weekStart, 7 * step);
    } else {
      state.teamMonth = step === 0 ? new Date(n.getFullYear(), n.getMonth(), 1) : new Date(state.teamMonth.getFullYear(), state.teamMonth.getMonth() + step, 1);
    }
    render();
  }));
  $('pendingList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-decide]');
    if (!b) return;
    b.disabled = true;
    const r = await api(`/api/leaves/${b.dataset.id}/${b.dataset.decide}`, { method: 'POST', body: JSON.stringify({ managerId: state.mgrId }) });
    if (r.ok) toast(`Leave ${r.body.status.toLowerCase()}`, true);
    else toast(r.body.error || 'Could not update the request', false);
    load();
  });

  $('requestBtn').addEventListener('click', openModal);
  $('closeModal').addEventListener('click', closeModal);
  $('cancelModal').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
  $('fStart').addEventListener('change', () => { if (!$('fEnd').value || $('fEnd').value < $('fStart').value) $('fEnd').value = $('fStart').value; $('fEnd').min = $('fStart').value; updatePreview(); });
  $('fEnd').addEventListener('change', updatePreview);
  $('leaveForm').addEventListener('submit', submitLeave);

  load();
})();
