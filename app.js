/* PocketLedger UI. Plain JavaScript, no build step. */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const modalRoot = document.getElementById('modal-root');

const ui = {
  tab: 'home', modal: null, filter: null, search: '', syncing: false, resetScroll: false,
  potId: null, selectMode: false, selected: {},
  budgetInputs: {}, openRuns: {}, checkMonth: null, actual: null, adjTarget: 'spending',
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const r2 = round2;
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + usd(Math.abs(n));
const fmtShort = iso => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const fmtFull = iso => new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });
const monthName = d => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
const monthLabel = key => { const [y, m] = key.split('-').map(Number); return monthName(new Date(y, m - 1, 1)); };

/* ---------- shared pieces ---------- */

function badge(t) {
  if (t.userConfirmed) return '<span class="badge b-hi">You set</span>';
  const cls = t.confidence >= 0.85 ? 'b-hi' : t.confidence >= 0.6 ? 'b-mid' : 'b-lo';
  return `<span class="badge ${cls}">${Math.round(t.confidence * 100)}%</span>`;
}

function incomeTag(t) {
  return isIncomeCounted(t) ? (sourceName(t.incomeSourceID) || t.extraIncomeLabel) : '';
}

/* opts.action: what a tap does; opts.check: null (no checkmark column) or true/false */
function txRow(t, tag, opts) {
  opts = opts || {};
  const c = CATS[t.category];
  const label = tag || (t.pot ? potName(t.pot) : (t.isIgnored ? 'Ignored' : ''));
  const check = opts.check === undefined || opts.check === null ? '' : `<div class="check">${opts.check ? '✓' : ''}</div>`;
  return `<div class="tx" data-action="${opts.action || 'open'}" data-id="${esc(t.id)}">
    ${check}
    <div class="ic" style="background:${c.color}2e">${c.icon}</div>
    <div class="mid">
      <div class="t1">${esc(t.simpleName)}</div>
      <div class="raw">${esc(t.rawName)}</div>
      <div class="when">${fmtShort(t.date)}</div>
    </div>
    <div class="right">
      <div class="amt ${t.amount > 0 ? 'pos' : ''}">${usd(t.amount)}</div>
      <div class="meta">${label ? esc(label) : ''} ${badge(t)}</div>
    </div>
  </div>`;
}

const emptyBox = (title, text) => `<div class="empty"><b>${title}</b>${text}</div>`;
const numInput = (v, attrs, style) => `<input type="number" inputmode="decimal" step="any" value="${r2(v)}" ${style ? `style="${style}"` : ''} ${attrs}>`;

/* ---------- home ---------- */

function potCard(p) {
  const pct = p.target > 0 ? Math.min(Math.max(p.balance / p.target, 0), 1) : null;
  return `<div class="card pot" data-action="openPot" data-id="${esc(p.id)}">
    <div class="muted small">${p.icon} ${esc(p.name)} ›</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}">${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar"><div style="width:${Math.round(pct * 100)}%"></div></div><div class="muted small">of ${usd(p.target)} goal</div>`}
  </div>`;
}

function homeView() {
  const now = new Date();
  return `
  <div class="row"><h1>Home</h1>
    <button class="link" data-action="refresh">${ui.syncing ? 'Syncing…' : 'Refresh'}</button></div>

  ${backupDue() ? `<div class="card banner"><b>Time for a backup</b>
    <div class="small">${S.lastExport ? daysSinceBackup() + ' days since your last backup.' : 'You haven\'t backed up yet.'} Your data lives only on this phone.</div>
    <button class="btn full" style="margin-top:8px" data-action="export">Back up now</button></div>` : ''}

  <div class="grid2">${S.pots.map(potCard).join('')}</div>
  <button class="btn full dashed" data-action="addPot">＋ Add pot or goal</button>

  <div class="grid3" style="margin-top:12px">
    <div class="card"><div class="muted small">Earned</div><div class="stat pos">${usd(totalEarnings(now))}</div></div>
    <div class="card"><div class="muted small">Spent</div><div class="stat">${usd(spentIn(now))}</div></div>
    <div class="card"><div class="muted small">Deductible YTD</div><div class="stat" style="color:${CATS.videoCamera.color}">${usd(taxDeductibleTotal(now.getFullYear()))}</div></div>
  </div>

  ${FEATURES.creditScore ? creditCard() : ''}

  <div class="card"><h2>Accounts</h2>
    ${S.accounts.length ? S.accounts.map(a => `
      <div class="row" style="padding:6px 0">
        <div><div style="font-weight:600">${esc(a.name)}</div><div class="muted small">${esc(a.institution)}</div></div>
        <b class="${a.balance < 0 ? 'neg' : ''}">${usd(a.balance)}</b>
      </div>`).join('') : '<div class="muted">No accounts yet.</div>'}
    ${S.lastSync ? `<div class="muted small" style="margin-top:6px">Updated ${fmtShort(S.lastSync)}</div>` : ''}
    ${syncError ? `<div class="err">${esc(syncError)}</div>` : ''}
    ${lastSaveError ? `<div class="err">Couldn't save: ${esc(lastSaveError)}</div>` : ''}
  </div>

  <div class="card"><h2>Recent transactions</h2>
    ${S.transactions.length ? S.transactions.slice(0, 8).map(t => txRow(t, incomeTag(t))).join('') : emptyBox('Nothing yet', 'Pull in your accounts with Refresh.')}
  </div>`;
}

function creditCard() {
  const c = S.creditScore;
  return `<div class="card"><div class="muted small">Credit score</div>
    ${c ? `<div class="big">${c.score}</div><div class="muted small">${esc(c.bureau)} · ${fmtShort(c.date)}</div>`
        : '<div class="muted">Not connected</div>'}</div>`;
}

/* ---------- a pot's own page ---------- */

function potEntryRow(e) {
  const t = (e.kind === 'tx' || e.kind === 'extra') ? txById(e.txId) : null;
  if (t) {
    const sel = ui.selectMode && e.kind === 'tx';
    const ded = e.kind === 'tx'
      ? `<div class="muted small ded">Deducted ${usd(-e.amount)}${Math.abs(-e.amount - e.exact) > 0.004 ? ' (exact ' + usd(e.exact) + ')' : ''}</div>` : '';
    return `<div class="rv-lite">${txRow(t, e.kind === 'extra' ? 'Extra income' : '', { action: sel ? 'toggleSel' : 'open', check: sel ? !!ui.selected[t.id] : null })}${ded}</div>`;
  }
  const icons = { budget: '📅', extra: '💵', transfer: '🔁', manual: '✏️', adjust: '⚖️', tx: '🧾' };
  const undo = (e.kind === 'manual' || e.kind === 'transfer')
    ? `<button class="link small" data-action="undoLog" data-id="${esc(e.id)}">Undo</button>` : '';
  return `<div class="tx" style="cursor:default">
    <div class="ic" style="background:#9ca3af2e">${icons[e.kind] || '•'}</div>
    <div class="mid"><div class="t1">${esc(e.label)}</div><div class="when">${fmtShort(e.date)}</div></div>
    <div class="right"><div class="amt ${e.amount > 0 ? 'pos' : ''}">${signed(e.amount)}</div>${undo}</div>
  </div>`;
}

function potView() {
  const p = potById(ui.potId);
  if (!p) { ui.tab = 'home'; return homeView(); }
  const entries = potEntries(p.id);
  const ins = entries.filter(e => e.amount > 0);
  const outs = entries.filter(e => e.amount < 0);
  const sum = list => r2(list.reduce((a, e) => a + e.amount, 0));
  const pct = p.target > 0 ? Math.min(Math.max(p.balance / p.target, 0), 1) : null;
  const nSel = Object.keys(ui.selected).length;
  const others = S.pots.filter(x => x.id !== p.id);

  return `
  <div class="row"><button class="link" data-action="tab" data-tab="home">‹ Home</button>
    <button class="link" data-action="editPot" data-id="${esc(p.id)}">Edit</button></div>
  <h1>${p.icon} ${esc(p.name)}</h1>

  <div class="card">
    <div class="muted small">Balance</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}" style="font-size:34px">${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar"><div style="width:${Math.round(pct * 100)}%"></div></div>
      <div class="muted small">${Math.round(pct * 100)}% of ${usd(p.target)} goal</div>`}
    <div class="btn-row"><button class="btn" data-action="moveMoney" data-id="${esc(p.id)}">Move money</button></div>
  </div>

  <div class="row" style="margin:14px 4px 6px"><div class="day" style="margin:0">Money in · ${signed(sum(ins))}</div></div>
  <div class="card">${ins.length ? ins.map(potEntryRow).join('') : '<div class="muted">Nothing has come in yet.</div>'}</div>

  <div class="row" style="margin:14px 4px 6px"><div class="day" style="margin:0">Money out · ${signed(sum(outs))}</div>
    ${outs.some(e => e.kind === 'tx') ? `<button class="link small" data-action="toggleSelectMode">${ui.selectMode ? 'Cancel' : 'Select'}</button>` : ''}</div>
  <div class="card">${outs.length ? outs.map(potEntryRow).join('') : '<div class="muted">Nothing has come out yet.</div>'}</div>
  <div class="muted small" style="margin:0 4px">Tap a transaction to edit its category or pot.</div>

  ${ui.selectMode && nSel ? `<div class="selbar"><span><b>${nSel}</b> selected</span>
    <select id="bulkTarget">${others.map(o => `<option value="${esc(o.id)}">Move to ${esc(o.name)}</option>`).join('')}<option value="none">Back to Review</option></select>
    <button class="btn primary" data-action="bulkMove">Move</button></div>` : ''}`;
}

/* ---------- activity ---------- */

function activityListHTML() {
  const q = ui.search.toLowerCase();
  const list = S.transactions.filter(t =>
    (!ui.filter || t.category === ui.filter) &&
    (!q || (t.rawName + ' ' + t.simpleName).toLowerCase().includes(q)));
  if (!list.length) return emptyBox('No transactions', 'Try a different search or category.');
  let html = '', lastDay = '', open = false;
  for (const t of list) {
    const day = new Date(t.date).toDateString();
    if (day !== lastDay) {
      if (open) html += '</div>';
      html += `<div class="day">${new Date(t.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div><div class="card">`;
      lastDay = day; open = true;
    }
    html += txRow(t, incomeTag(t));
  }
  return html + (open ? '</div>' : '');
}

function activityView() {
  const chip = (key, label, color, icon) => {
    const on = key === null ? !ui.filter : ui.filter === key;
    return `<button class="chip" data-action="filter" data-cat="${key || ''}"
      style="background:${on ? color : color + '26'};color:${on ? '#fff' : color}">${icon ? icon + ' ' : ''}${label}</button>`;
  };
  return `<h1>Activity</h1>
  <input id="search" type="search" placeholder="Search name or merchant" value="${esc(ui.search)}" data-change="search" data-live="1" style="margin-bottom:10px">
  <div class="chips">
    ${chip(null, 'All', '#0f766e', '')}
    ${Object.entries(CATS).map(([k, c]) => chip(k, c.title, c.color, c.icon)).join('')}
  </div>
  <div id="actList">${activityListHTML()}</div>`;
}

/* ---------- review ---------- */

function reviewView() {
  const p = pending();
  const rec = recentlyReviewed();
  return `<h1>Review</h1>
  ${p.length ? `<div class="day" style="margin-top:0">Needs a pot (${p.length})</div>
    <div class="card">${p.map(t => `
      <div class="rv">
        ${txRow(t)}
        <div class="muted small" style="margin:2px 0 6px">Deduct this from…</div>
        <div class="btn-row">
          ${S.pots.map((pot, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-action="assign" data-id="${esc(t.id)}" data-pot="${esc(pot.id)}">${pot.icon} ${esc(pot.name)}</button>`).join('')}
        </div>
        <button class="link small" data-action="ignore" data-id="${esc(t.id)}">Not a spend</button>
      </div>`).join('')}</div>`
    : `<div class="card">${emptyBox('All caught up ✅', 'New purchases will show up here.')}</div>`}
  ${rec.length ? `<div class="day">Recently sorted</div><div class="card">${rec.map(t => txRow(t)).join('')}</div>` : ''}`;
}

/* ---------- income ---------- */

function incomeView() {
  const now = new Date();
  const items = countedIncome(now);
  return `<div class="row"><h1>Income</h1><button class="link" data-action="addExtra" style="font-size:28px;line-height:1">＋</button></div>
  <div class="card"><div class="muted small">Earned in ${monthName(now)}</div><div class="big pos" style="font-size:32px">${usd(totalEarnings(now))}</div></div>

  <div class="card"><h2>Income sources</h2>
    ${S.incomeSources.map(s => {
      const got = receivedFrom(s, now);
      if (s.variable) {
        return `<div style="padding:6px 0"><div class="row"><b>${esc(s.name || 'Unnamed source')}</b><b>${usd(got)}</b></div>
          <div class="muted small">Varies month to month · received this month</div></div>`;
      }
      const pct = s.expectedAmount > 0 ? Math.min(got / s.expectedAmount, 1) : 0;
      return `<div style="padding:6px 0">
        <div class="row"><b>${esc(s.name || 'Unnamed source')}</b><b>${usd(got)}</b></div>
        <div class="bar"><div style="width:${Math.round(pct * 100)}%"></div></div>
        <div class="muted small">of ${usd(s.expectedAmount)} expected</div></div>`;
    }).join('') || '<div class="muted">No income sources yet.</div>'}
    <button class="link" data-action="editSources">Edit income sources</button>
  </div>

  <div class="card"><h2>Counted this month</h2>
    ${items.length ? items.map(t => txRow(t, incomeTag(t))).join('') : '<div class="muted">No income counted yet this month.</div>'}
    <div class="muted small" style="margin-top:6px">Tap a deposit to remove extra income. Use ＋ to count another deposit as tips, a gift, etc. Variable income like freelance is added to your budget by hand on the Budget tab.</div>
  </div>`;
}

/* ---------- budget ---------- */

const srcById = id => S.incomeSources.find(s => s.id === id);

function earningAmounts() {
  const run = runFor(new Date());
  return S.incomeSources.map(s => {
    let amount;
    if (ui.budgetInputs[s.id] != null) amount = ui.budgetInputs[s.id];
    else {
      const prev = run && (run.earningsBreakdown || []).find(b => b.sourceId === s.id);
      amount = prev ? prev.amount : (s.variable ? 0 : s.expectedAmount);
    }
    return { sourceId: s.id, name: s.name || 'Unnamed source', amount: amount || 0 };
  });
}

function budgetCalc() {
  const rows = earningAmounts();
  const earn = r2(rows.reduce((a, r) => a + r.amount, 0));
  const fixed = r2(fixedTotal());
  const pct = S.savingsPercent || 0;
  const save = r2(earn * pct / 100);
  return { rows, earn, fixed, pct, save, left: r2(earn - fixed - save) };
}

function discHTML(d) {
  if (Math.abs(d) < 0.005) return '<div class="pos" style="padding:6px 0"><b>✓ Everything lines up</b></div>';
  return `<div style="padding:6px 0">${d > 0 ? 'You have' : "You're missing"} <b class="${d > 0 ? 'pos' : 'neg'}">${usd(Math.abs(d))}</b> ${d > 0 ? 'extra' : 'compared to your pots'}.</div>
    <button class="btn primary full" data-action="redistribute">${d > 0 ? 'Add' : 'Take'} ${usd(Math.abs(d))} ${d > 0 ? 'to' : 'from'} the pot below</button>`;
}

function checkCard() {
  const keys = [...new Set([monthKey(new Date()), ...S.budgetRuns.map(r => r.monthKey)])].sort().reverse();
  if (!ui.checkMonth || !keys.includes(ui.checkMonth)) ui.checkMonth = keys[0];
  const key = ui.checkMonth;
  const rs = roundingStats(key);
  const d = discrepancy(key, ui.actual);
  return `<div class="card"><h2>Month-end check</h2>
    <select data-change="checkMonth">${keys.map(k => `<option value="${k}" ${k === key ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}</select>
    <div class="field" style="margin-top:8px"><span>Spent from pots (exact)</span><span>${usd(rs.exact)}</span></div>
    <div class="field"><span>Deducted (rounded)</span><span>${usd(rs.deducted)}</span></div>
    <div class="field"><span>Rounding difference</span><b class="${rs.diff > 0 ? 'pos' : rs.diff < 0 ? 'neg' : ''}">${signed(rs.diff)}</b></div>
    <div class="field"><span>All pots add up to</span><b id="pots-total">${usd(potsTotal())}</b></div>
    <div class="field"><span>Real money you have for them <span class="muted small">(optional)</span></span>
      ${ui.actual == null ? numInput(0, 'id="actual" data-change="actual" data-live="1" placeholder="0"', 'width:120px').replace('value="0"', 'value=""') : numInput(ui.actual, 'id="actual" data-change="actual" data-live="1"', 'width:120px')}</div>
    <div class="muted small">Leave it blank to check only the rounding. Enter your real count to catch any other missing or extra dollars.</div>
    <div id="disc-box" style="margin-top:6px">${discHTML(d)}</div>
    <div class="field"><span>Put it in</span><select id="adjTarget" data-change="adjTarget" style="width:180px">
      ${S.pots.map(p => `<option value="${esc(p.id)}" ${ui.adjTarget === p.id ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}
      <option value="all" ${ui.adjTarget === 'all' ? 'selected' : ''}>Split across all pots</option></select></div>
  </div>`;
}

function historyDetail(run) {
  const key = run.monthKey;
  const txs = monthTxs(key);
  const income = txs.filter(isIncomeCounted);
  const unsorted = txs.filter(needsReview);
  const rs = roundingStats(key);
  const adj = S.adjustments.filter(a => a.monthKey === key);
  const line = (a, b, cls) => `<div class="field"><span>${a}</span><span class="${cls || ''}">${b}</span></div>`;
  const byPot = S.pots.map(p => ({
    p, items: S.potLog.filter(e => e.potId === p.id && e.kind === 'tx' && monthKey(e.date) === key && txById(e.txId)),
  })).filter(g => g.items.length);

  return `<div class="hist-body">
    <div class="day" style="margin-top:6px">The budget</div>
    ${(run.earningsBreakdown || []).map(b => line(esc(b.name), usd(b.amount))).join('') || ''}
    ${line('<b>Earnings</b>', '<b>' + usd(run.earnings) + '</b>')}
    ${(run.fixedItems || []).map(f => line(esc(f.name || 'Expense'), '− ' + usd(f.amount))).join('')}
    ${line('Constant expenses', '− ' + usd(run.fixedTotal))}
    ${run.savingsAmount ? line('Savings (' + run.savingsPercent + '%)', '− ' + usd(run.savingsAmount) + ' → Savings') : ''}
    ${line('<b>Left for spending</b>', '<b>' + usd(run.leftover) + '</b>', run.leftover < 0 ? 'neg' : 'pos')}
    ${adj.length ? `<div class="day">Month-end adjustments</div>${adj.map(a => line(fmtShort(a.date), signed(a.amount) + ' → ' + (a.target === 'all' ? 'all pots' : esc(potName(a.target))))).join('')}` : ''}
    <div class="day">Rounding</div>
    ${line('Spent (exact) → deducted', usd(rs.exact) + ' → ' + usd(rs.deducted))}
    ${line('Difference', signed(rs.diff))}
    <div class="day">Income that month</div>
    ${income.length ? income.map(t => txRow(t, incomeTag(t))).join('') : '<div class="muted small">None counted.</div>'}
    ${byPot.map(g => `<div class="day">Spent from ${g.p.icon} ${esc(g.p.name)} · ${usd(-r2(g.items.reduce((a, e) => a + e.amount, 0)))}</div>
      ${g.items.map(e => txRow(txById(e.txId))).join('')}`).join('')}
    ${unsorted.length ? `<div class="day">Not sorted into a pot</div>${unsorted.map(t => txRow(t)).join('')}` : ''}
  </div>`;
}

function historyCard() {
  if (!S.budgetRuns.length) return '';
  return `<div class="card"><h2>Budget history</h2>
    ${S.budgetRuns.map(r => {
      const open = !!ui.openRuns[r.monthKey];
      return `<div class="hist">
        <div class="row hist-head" data-action="toggleRun" data-key="${r.monthKey}">
          <b>${monthLabel(r.monthKey)}</b>
          <span><b class="${r.leftover < 0 ? 'neg' : 'pos'}">${signed(r.leftover)}</b> <span class="muted">${open ? '▾' : '▸'}</span></span>
        </div>
        ${open ? historyDetail(r) : ''}
      </div>`;
    }).join('')}</div>`;
}

function budgetView() {
  const now = new Date();
  const run = runFor(now);
  const c = budgetCalc();
  return `<h1>Budget</h1>
  <div class="card row"><b style="font-size:17px">${monthName(now)}</b>
    <span class="badge ${run ? 'b-hi' : 'b-mid'}">${run ? 'Applied' : 'Not applied yet'}</span></div>

  <div class="card"><h2>Earnings this month</h2>
    ${c.rows.map(r => {
      const s = srcById(r.sourceId);
      const got = r2(receivedFrom(s, now));
      return `<div class="field"><span>${esc(r.name)}${s.variable ? ' <span class="muted small">(varies)</span>' : ''}</span>
          ${numInput(r.amount, `data-change="earnInput" data-id="${s.id}" data-live="1"`, 'width:110px')}</div>
        ${s.variable ? `<div class="muted small" style="margin:-2px 0 6px">Received so far this month: <b>${usd(got)}</b>
          ${got > 0 ? `<button class="link small" data-action="useReceived" data-id="${s.id}">Use ${usd(got)}</button>` : ''}</div>` : ''}`;
    }).join('') || '<div class="muted">Add an income source on the Income tab.</div>'}
    <div class="field"><span><b>Earnings to budget</b></span><b id="earn-total">${usd(c.earn)}</b></div>
    <div class="muted small">Variable income like freelance starts at $0. Add it here only in the months you want it in your budget.</div>
  </div>

  <div class="card"><h2>Constant monthly expenses</h2>
    ${S.fixedExpenses.map(e => `<div class="field">
      <input class="wide" placeholder="Name" value="${esc(e.name)}" data-change="fixedName" data-id="${e.id}" data-live="1">
      ${numInput(e.amount, `data-change="fixedAmt" data-id="${e.id}" data-live="1"`, 'width:100px')}
      <button class="link" data-action="fixedDel" data-id="${e.id}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="link" data-action="fixedAdd">＋ Add expense</button>
    <div class="field"><span>💰 Savings (% of earnings)</span>
      <span class="pctbox">${numInput(S.savingsPercent, 'data-change="savePct" data-live="1"', 'width:70px')} %</span></div>
    <div class="muted small">That's <b id="save-amt">${usd(c.save)}</b> set aside for Savings this month.</div>
    <div class="field"><span><b>Total expenses</b></span><b id="fixed-total">${usd(c.fixed)}</b></div>
  </div>

  <div class="card"><h2>Result</h2>
    <div class="field"><span>Earnings</span><span style="text-align:right" id="res-earn">${usd(c.earn)}</span></div>
    <div class="field"><span>Constant expenses</span><span style="text-align:right" id="res-fixed">− ${usd(c.fixed)}</span></div>
    <div class="field"><span>Savings</span><span style="text-align:right" id="res-save">− ${usd(c.save)}</span></div>
    <div class="field"><span><b>Added to Spending</b></span><b id="res-left" class="${c.left < 0 ? 'neg' : 'pos'}">${usd(c.left)}</b></div>
    <button class="btn primary full" data-action="applyBudget">${run ? "Update this month's budget" : 'Apply ' + now.toLocaleString('en-US', { month: 'long' }) + ' budget'}</button>
    <div class="muted small" style="margin-top:8px">Nothing happens until you tap this. Updating a month that's already applied replaces its numbers, so nothing is counted twice.</div>
  </div>

  ${checkCard()}

  <div class="card"><h2>Rounding &amp; pot balances</h2>
    <div class="field"><span>Round spending when deducting</span>
      <select data-change="roundMode" style="width:150px">
        <option value="nearest" ${S.roundMode === 'nearest' ? 'selected' : ''}>Nearest dollar</option>
        <option value="up" ${S.roundMode === 'up' ? 'selected' : ''}>Round up</option>
        <option value="off" ${S.roundMode === 'off' ? 'selected' : ''}>Exact cents</option></select></div>
    <div class="muted small" style="margin-bottom:6px">Applies to purchases you sort from now on.</div>
    ${S.pots.map(p => `<div class="field"><span>${p.icon} ${esc(p.name)}</span>${numInput(p.balance, `data-change="potBal" data-id="${esc(p.id)}"`, 'width:120px')}</div>`).join('')}
    <div class="muted small">Editing a balance records a manual adjustment on that pot's page.</div>
  </div>

  ${historyCard()}

  <div class="card"><h2>Backup</h2>
    <div class="muted small" style="margin-bottom:8px">${S.lastExport ? 'Last backup: ' + fmtShort(S.lastExport) + '.' : 'No backup yet.'} Your data lives only on this phone. Export weekly and at the end of each month.</div>
    <div class="btn-row"><button class="btn" data-action="export">Export</button><button class="btn" data-action="import">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden data-change="import">
  </div>`;
}

/* Only touch the DOM when the content changed, so a tap on a button isn't lost when a text field blurs. */
function setHTMLIfChanged(el, html) {
  if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

function patchBudget() {
  const c = budgetCalc();
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('earn-total', usd(c.earn));
  set('res-earn', usd(c.earn));
  set('res-fixed', '− ' + usd(c.fixed));
  set('res-save', '− ' + usd(c.save));
  set('fixed-total', usd(c.fixed));
  set('save-amt', usd(c.save));
  set('res-left', usd(c.left));
  const l = $('res-left');
  if (l) l.className = c.left < 0 ? 'neg' : 'pos';
}

function patchCheck() {
  setHTMLIfChanged($('disc-box'), discHTML(discrepancy(ui.checkMonth, ui.actual)));
  const t = $('pots-total');
  if (t) t.textContent = usd(potsTotal());
}

/* ---------- to-do & notes ---------- */

function planView() {
  const open = S.todos.filter(t => !t.done), done = S.todos.filter(t => t.done);
  const row = t => `<div class="todo ${t.done ? 'done' : ''}">
    <input type="checkbox" ${t.done ? 'checked' : ''} data-change="todoDone" data-id="${t.id}">
    <span class="todo-text">${esc(t.text)}</span>
    <button class="link" data-action="delTodo" data-id="${t.id}" aria-label="Delete">✕</button></div>`;
  return `<h1>To-do &amp; Notes</h1>
  <div class="card"><h2>Money to-do list</h2>
    <div class="row" style="gap:8px"><input id="todoText" placeholder="Add a task or goal…" style="flex:1">
      <button class="btn primary" data-action="addTodo">Add</button></div>
    <div style="margin-top:8px">
      ${open.map(row).join('') || '<div class="muted" style="padding:8px 0">Nothing to do. Add something above.</div>'}
      ${done.length ? `<div class="day">Done</div>${done.map(row).join('')}
        <button class="link small" data-action="clearDone">Clear completed</button>` : ''}
    </div>
  </div>
  <div class="card"><div class="row"><h2 style="margin:0">Notes</h2><button class="link" data-action="addNote">＋ New note</button></div>
    ${S.notes.length ? S.notes.map(n => `<div class="note" data-action="openNote" data-id="${n.id}">
      <div class="t1">${esc(n.title || 'Untitled note')}</div>
      <div class="muted small note-prev">${esc((n.body || '').slice(0, 120)) || 'Empty'}</div>
      <div class="muted small">${fmtShort(n.updated)}</div></div>`).join('')
      : '<div class="muted" style="padding:8px 0">No notes yet.</div>'}
  </div>`;
}

const VIEWS = { home: homeView, pot: potView, activity: activityView, review: reviewView, income: incomeView, budget: budgetView, plan: planView };

/* ---------- modals ---------- */

function sheet(title, inner, doneAction) {
  return `<div class="scrim"><div class="sheet">
    <div class="sheet-head"><b>${title}</b><button class="link" data-action="${doneAction || 'close'}">Done</button></div>
    ${inner}</div></div>`;
}

function seg(options, current, action, extra) {
  return `<div class="seg">${options.map(([val, label]) =>
    `<button class="${current === val ? 'on' : ''}" data-action="${action}" data-pot="${esc(val)}" ${extra || ''}>${label}</button>`).join('')}</div>`;
}

const potOptions = () => S.pots.map(p => [p.id, p.icon + ' ' + esc(p.name)]);

function txModal(id) {
  const t = txById(id);
  if (!t) return sheet('Transaction', emptyBox('Not found', ''));
  const c = CATS[t.category];
  const bar = Math.round(t.confidence * 100);
  let pots = '';
  if (isExpense(t)) {
    const entry = S.potLog.find(e => e.kind === 'tx' && e.txId === id);
    pots = `<div class="card"><h2>Deduct from</h2>
      ${seg([['none', 'Not yet'], ...potOptions()], t.pot || 'none', 'assign', `data-id="${esc(t.id)}"`)}
      ${entry ? `<div class="muted small" style="margin-top:8px">Deducted ${usd(-entry.amount)} from ${esc(potName(t.pot))}${Math.abs(-entry.amount - entry.exact) > 0.004 ? ' (exact ' + usd(entry.exact) + ')' : ''}.</div>` : ''}
      ${t.isIgnored ? '<div class="muted small" style="margin-top:8px">Marked as not a spend.</div>'
        : `<button class="link" data-action="ignore" data-id="${esc(t.id)}">Not a spend (e.g. moving my own money)</button>`}
    </div>`;
  } else {
    const src = sourceName(t.incomeSourceID);
    pots = `<div class="card"><h2>Income</h2>
      ${src ? `<div class="pos">✓ Counted automatically as ${esc(src)}</div>`
        : t.extraIncomeLabel ? `<div class="pos">✓ Extra income: ${esc(t.extraIncomeLabel)} → ${esc(potName(t.extraIncomePot))}</div>
            <button class="btn danger full" style="margin-top:8px" data-action="removeExtra" data-id="${esc(t.id)}">Remove from extra income</button>`
        : `<button class="btn full" data-action="addExtra" data-id="${esc(t.id)}">Count as extra income</button>`}
    </div>`;
  }
  return sheet('Transaction', `
    <div class="card hero">
      <div class="amt-big ${t.amount > 0 ? 'pos' : ''}">${usd(t.amount)}</div>
      <div style="font-weight:700;margin-top:4px">${esc(t.simpleName)}</div>
      <span class="pill" style="background:${c.color}">${c.icon} ${c.title}</span>
    </div>
    <div class="card"><h2>Original</h2>
      <div class="field"><span class="muted">Bank description</span><div class="mono" style="max-width:62%">${esc(t.rawName)}</div></div>
      <div class="field"><span class="muted">Date &amp; time</span><div style="text-align:right">${fmtFull(t.date)}</div></div>
      <div class="field"><span class="muted">Account</span><div>${esc(accountName(t.accountID))}</div></div>
    </div>
    <div class="card"><h2>How it was read</h2>
      <div class="field"><span class="muted">Simplified as</span><div style="text-align:right">${esc(t.simpleName)}</div></div>
      <div class="row"><span class="muted">Confidence</span>${badge(t)}</div>
      <div class="bar"><div style="width:${t.userConfirmed ? 100 : bar}%"></div></div>
      <div class="muted small">Low confidence usually means an unfamiliar merchant. Changing the category teaches the app for every transaction from this merchant.</div>
    </div>
    <div class="card"><h2>Category</h2>
      <select data-change="setcat" data-id="${esc(t.id)}">
        ${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === t.category ? 'selected' : ''}>${v.icon} ${v.title}</option>`).join('')}
      </select>
      ${c.taxDeductible ? '<div class="muted small" style="margin-top:8px">Counted toward your tax-deductible total.</div>' : ''}
    </div>
    ${pots}`);
}

function extraModal() {
  const m = ui.modal;
  const cands = S.transactions.filter(t => t.amount > 0 && !isIncomeCounted(t));
  const labels = ['Tips', 'Gift', 'Refund', 'Side gig', 'Other'];
  return sheet('Extra income', `
    <div class="card"><h2>Pick a deposit from your history</h2>
      ${cands.length ? cands.map(t => txRow(t, '', { action: 'pickExtra', check: m.selected === t.id })).join('') : '<div class="muted">No uncounted deposits.</div>'}
    </div>
    <div class="card"><h2>What was it?</h2>
      <select data-change="extraLabel">${labels.map(l => `<option ${l === m.label ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div style="height:10px"></div>
      <div class="muted small" style="margin-bottom:6px">Add it to…</div>
      ${seg(potOptions(), m.pot, 'extraPot')}
    </div>
    <button class="btn primary full" data-action="saveExtra" ${m.selected ? '' : 'disabled'}>Add extra income</button>`);
}

function sourcesModal() {
  return sheet('Income sources', `
    ${S.incomeSources.map(s => `<div class="card stack">
      <input placeholder="Name (e.g. Full-time job)" value="${esc(s.name)}" data-change="srcName" data-id="${s.id}" data-live="1">
      <label class="field"><span>Varies month to month (no expected amount)</span>
        <input type="checkbox" ${s.variable ? 'checked' : ''} data-change="srcVar" data-id="${s.id}"></label>
      ${s.variable ? '' : `<div class="field"><span>Expected per month</span>${numInput(s.expectedAmount, `data-change="srcAmt" data-id="${s.id}" data-live="1"`)}</div>`}
      <input placeholder="Bank text to match (e.g. PAYROLL)" value="${esc(s.matchKeyword)}" autocapitalize="characters" autocorrect="off" data-change="srcKey" data-id="${s.id}" data-live="1">
      <div class="muted small">Deposits whose bank description contains the match text are counted automatically.</div>
      <button class="btn danger full" data-action="srcDel" data-id="${s.id}">Remove this source</button>
    </div>`).join('')}
    <button class="btn full" data-action="srcAdd">＋ Add income source</button>`, 'closeSources');
}

function potEditModal() {
  const m = ui.modal;
  const f = m.fields;
  const existing = m.id ? potById(m.id) : null;
  return sheet(existing ? 'Edit pot' : 'New pot or goal', `
    <div class="card stack">
      <input placeholder="Name (e.g. Camera fund, Trip)" value="${esc(f.name)}" data-change="potName" data-live="1">
      <div class="field"><span>Icon</span><select data-change="potIcon" style="width:90px">${POT_ICONS.map(i => `<option ${i === f.icon ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
      <div class="field"><span>${existing ? 'Balance' : 'Starting balance'}</span>${numInput(f.balance, 'data-change="potBalance" data-live="1"')}</div>
      <div class="field"><span>Goal target <span class="muted small">(optional)</span></span>${numInput(f.target || 0, 'data-change="potTarget" data-live="1"')}</div>
      <div class="muted small">Leave the goal target at 0 for a pot without a goal.</div>
    </div>
    <button class="btn primary full" data-action="savePot">${existing ? 'Save changes' : 'Create pot'}</button>
    ${existing && !existing.core ? `<button class="btn danger full" style="margin-top:8px" data-action="deletePot" data-id="${esc(existing.id)}">Delete this pot</button>` : ''}`);
}

function moveModal() {
  const m = ui.modal;
  const opts = sel => S.pots.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('');
  return sheet('Move money', `
    <div class="card stack">
      <div class="field"><span>From</span><select data-change="moveFrom" style="width:190px">${opts(m.from)}</select></div>
      <div class="field"><span>To</span><select data-change="moveTo" style="width:190px">${opts(m.to)}</select></div>
      <div class="field"><span>Amount</span>${numInput(m.amount || 0, 'data-change="moveAmount" data-live="1"')}</div>
    </div>
    <button class="btn primary full" data-action="doMove">Move</button>`);
}

function noteModal() {
  const n = S.notes.find(x => x.id === ui.modal.id);
  if (!n) return sheet('Note', emptyBox('Not found', ''));
  return sheet('Note', `
    <div class="card stack">
      <input placeholder="Title" value="${esc(n.title)}" data-change="noteTitle" data-id="${n.id}" data-live="1">
      <textarea rows="12" placeholder="Write here…" data-change="noteBody" data-id="${n.id}" data-live="1">${esc(n.body)}</textarea>
    </div>
    <button class="btn danger full" data-action="delNote" data-id="${n.id}">Delete note</button>`);
}

function modalHTML() {
  const m = ui.modal;
  switch (m.type) {
    case 'tx': return txModal(m.id);
    case 'extra': return extraModal();
    case 'sources': return sourcesModal();
    case 'potEdit': return potEditModal();
    case 'move': return moveModal();
    case 'note': return noteModal();
  }
  return '';
}

/* ---------- render ---------- */

const TABS = [['home', '🏠', 'Home'], ['activity', '📋', 'Activity'], ['review', '📥', 'Review'], ['income', '💵', 'Income'], ['budget', '📊', 'Budget'], ['plan', '✅', 'To-do']];

function render() {
  const y = window.scrollY;
  const oldSheet = modalRoot.querySelector('.sheet');
  const sheetY = oldSheet ? oldSheet.scrollTop : 0;

  app.innerHTML = VIEWS[ui.tab]();
  // remember what the live-patched areas currently show (see setHTMLIfChanged)
  if ($('disc-box')) $('disc-box').__html = discHTML(discrepancy(ui.checkMonth, ui.actual));
  if ($('actList')) $('actList').__html = activityListHTML();
  const n = pending().length;
  const active = ui.tab === 'pot' ? 'home' : ui.tab;
  tabbar.innerHTML = TABS.map(([k, icon, label]) =>
    `<button class="${active === k ? 'on' : ''}" data-action="tab" data-tab="${k}"><span class="i">${icon}</span>${label}${k === 'review' && n ? `<span class="pip">${n}</span>` : ''}</button>`).join('');
  modalRoot.innerHTML = ui.modal ? modalHTML() : '';
  document.body.style.overflow = ui.modal ? 'hidden' : '';

  window.scrollTo(0, ui.resetScroll ? 0 : y);
  ui.resetScroll = false;
  const newSheet = modalRoot.querySelector('.sheet');
  if (newSheet && oldSheet) newSheet.scrollTop = sheetY;
}

/* ---------- actions ---------- */

async function doSync() {
  ui.syncing = true; render();
  await sync();
  ui.syncing = false; render();
}

function closeModal() {
  if (ui.modal && ui.modal.type === 'sources') rematchIncomeSources();
  ui.modal = null;
}

async function exportData() {
  const json = JSON.stringify(S, null, 2);
  const name = 'pocketledger-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'PocketLedger backup' });   // lets you "Save to Files"
      S.lastExport = new Date().toISOString(); save(); render();
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // you closed the share sheet
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  S.lastExport = new Date().toISOString(); save(); render();
}

function openPotEdit(id) {
  const p = id ? potById(id) : null;
  ui.modal = { type: 'potEdit', id: id || null,
    fields: { name: p ? p.name : '', icon: p ? p.icon : POT_ICONS[2], balance: p ? p.balance : 0, target: p ? (p.target || 0) : 0 } };
}

const ACTIONS = {
  tab: d => { ui.tab = d.tab; ui.resetScroll = true; ui.selectMode = false; ui.selected = {}; },
  open: d => { ui.modal = { type: 'tx', id: d.id }; },
  close: () => closeModal(),
  closeSources: () => closeModal(),
  assign: d => assign(d.id, d.pot === 'none' ? null : d.pot),
  ignore: d => ignoreTx(d.id),
  filter: d => { ui.filter = (ui.filter === d.cat || !d.cat) ? null : d.cat; },
  refresh: () => { doSync(); return false; },

  // pots
  openPot: d => { ui.tab = 'pot'; ui.potId = d.id; ui.resetScroll = true; ui.selectMode = false; ui.selected = {}; },
  addPot: () => openPotEdit(null),
  editPot: d => openPotEdit(d.id),
  savePot: () => {
    const m = ui.modal, f = m.fields;
    if (m.id) {
      updatePot(m.id, { name: f.name.trim() || 'Pot', icon: f.icon, target: f.target > 0 ? f.target : null });
      setPotBalance(m.id, f.balance);
    } else {
      const id = addPot(f.name.trim(), f.icon, f.balance, f.target);
      ui.tab = 'pot'; ui.potId = id; ui.resetScroll = true;
    }
    ui.modal = null;
  },
  deletePot: d => {
    if (!confirm('Delete this pot? Purchases sorted into it go back to Review, and its history is removed.')) return false;
    deletePot(d.id);
    ui.modal = null; ui.tab = 'home';
  },
  moveMoney: d => {
    const to = S.pots.find(p => p.id !== d.id);
    ui.modal = { type: 'move', from: d.id, to: to ? to.id : d.id, amount: 0 };
  },
  doMove: () => {
    const m = ui.modal;
    if (!moveMoney(m.from, m.to, m.amount)) { alert('Pick two different pots and an amount above $0.'); return false; }
    ui.modal = null;
  },
  undoLog: d => undoLog(d.id),
  toggleSelectMode: () => { ui.selectMode = !ui.selectMode; ui.selected = {}; },
  toggleSel: d => { if (ui.selected[d.id]) delete ui.selected[d.id]; else ui.selected[d.id] = true; },
  bulkMove: () => {
    const target = $('bulkTarget').value;
    Object.keys(ui.selected).forEach(id => assign(id, target === 'none' ? null : target));
    ui.selected = {}; ui.selectMode = false;
  },

  // income
  addExtra: d => { ui.modal = { type: 'extra', selected: d.id || null, label: 'Tips', pot: 'spending' }; },
  pickExtra: d => { ui.modal.selected = d.id; },
  extraPot: d => { ui.modal.pot = d.pot; },
  saveExtra: () => { markExtraIncome(ui.modal.selected, ui.modal.label, ui.modal.pot); ui.modal = null; },
  removeExtra: d => removeExtraIncome(d.id),
  editSources: () => { ui.modal = { type: 'sources' }; },
  srcAdd: () => { S.incomeSources.push({ id: uid(), name: '', expectedAmount: 0, variable: false, matchKeyword: '' }); save(); },
  srcDel: d => { S.incomeSources = S.incomeSources.filter(s => s.id !== d.id); save(); },

  // budget
  fixedAdd: () => { S.fixedExpenses.push({ id: uid(), name: '', amount: 0 }); save(); },
  fixedDel: d => { S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== d.id); save(); },
  useReceived: d => { const s = srcById(d.id); ui.budgetInputs[d.id] = r2(receivedFrom(s, new Date())); },
  applyBudget: () => { applyBudget(budgetCalc().rows); ui.budgetInputs = {}; },
  redistribute: () => {
    const d = discrepancy(ui.checkMonth, ui.actual);
    if (redistribute(ui.checkMonth, d, ui.adjTarget)) ui.actual = null;
  },
  toggleRun: d => { ui.openRuns[d.key] = !ui.openRuns[d.key]; },

  // to-do & notes
  addTodo: () => { const el = $('todoText'); if (el && el.value.trim()) { addTodo(el.value); } },
  delTodo: d => deleteTodo(d.id),
  clearDone: () => clearDoneTodos(),
  addNote: () => { ui.modal = { type: 'note', id: addNote() }; },
  openNote: d => { ui.modal = { type: 'note', id: d.id }; },
  delNote: d => { if (!confirm('Delete this note?')) return false; deleteNote(d.id); ui.modal = null; },

  // backup
  export: () => { exportData(); return false; },
  import: () => { const f = $('importFile'); if (f) f.click(); return false; },
};

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('scrim')) { closeModal(); render(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (fn(el.dataset, el) !== false) render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.id === 'todoText') { ACTIONS.addTodo(); render(); }
});

function handleField(el, final) {
  const d = el.dataset;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const find = list => list.find(x => x.id === d.id);
  const m = ui.modal;
  switch (d.change) {
    case 'search':
      ui.search = v;
      setHTMLIfChanged($('actList'), activityListHTML());
      return;
    // budget
    case 'earnInput': ui.budgetInputs[d.id] = num(v); patchBudget(); return;
    case 'savePct': S.savingsPercent = Math.min(Math.max(num(v), 0), 100); save(); patchBudget(); return;
    case 'fixedName': { const e = find(S.fixedExpenses); if (e) { e.name = v; save(); } return; }
    case 'fixedAmt': { const e = find(S.fixedExpenses); if (e) { e.amount = num(v); save(); patchBudget(); } return; }
    case 'roundMode': S.roundMode = v; save(); return;
    case 'potBal': if (final) { setPotBalance(d.id, num(v)); patchCheck(); } return;
    case 'checkMonth': if (final) { ui.checkMonth = v; ui.actual = null; render(); } return;
    case 'actual': ui.actual = v === '' ? null : num(v); patchCheck(); return;
    case 'adjTarget': ui.adjTarget = v; return;
    // income sources
    case 'srcName': { const s = find(S.incomeSources); if (s) { s.name = v; save(); } return; }
    case 'srcAmt': { const s = find(S.incomeSources); if (s) { s.expectedAmount = num(v); save(); } return; }
    case 'srcKey': { const s = find(S.incomeSources); if (s) { s.matchKeyword = v.toUpperCase(); save(); } return; }
    case 'srcVar': { const s = find(S.incomeSources); if (s) { s.variable = v; if (v) s.expectedAmount = 0; save(); render(); } return; }
    // categories & extra income
    case 'setcat': if (final) { setCategory(d.id, v); render(); } return;
    case 'extraLabel': m.label = v; return;
    // pots
    case 'potName': m.fields.name = v; return;
    case 'potIcon': m.fields.icon = v; return;
    case 'potBalance': m.fields.balance = num(v); return;
    case 'potTarget': m.fields.target = num(v); return;
    case 'moveFrom': m.from = v; return;
    case 'moveTo': m.to = v; return;
    case 'moveAmount': m.amount = num(v); return;
    // to-do & notes
    case 'todoDone': toggleTodo(d.id); render(); return;
    case 'noteTitle': updateNote(d.id, { title: v }); return;
    case 'noteBody': updateNote(d.id, { body: v }); return;
    case 'import':
      if (final && el.files && el.files[0]) {
        el.files[0].text().then(text => {
          try { replaceState(JSON.parse(text)); ui.budgetInputs = {}; ui.actual = null; render(); }
          catch (err) { alert('That file could not be imported.'); }
        });
      }
      return;
  }
}

document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.live) handleField(e.target, false); });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.change) handleField(e.target, true); });

/* ---------- start ---------- */

render();
doSync();

// Ask the browser to keep this app's data even when storage is tight.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
