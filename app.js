/* PocketLedger UI. Plain JavaScript, no build step. */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const modalRoot = document.getElementById('modal-root');

const ui = { tab: 'home', modal: null, filter: null, search: '', earnings: null, syncing: false, resetScroll: false };

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtShort = iso => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const fmtFull = iso => new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });
const monthName = d => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

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
  const label = tag || (t.pot ? POTS[t.pot] : (t.isIgnored ? 'Ignored' : ''));
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

/* ---------- views ---------- */

function homeView() {
  const now = new Date();
  const goal = S.savingsGoalTarget > 0 ? Math.min(Math.max(S.savingsPot / S.savingsGoalTarget, 0), 1) : null;
  return `
  <div class="row"><h1>Home</h1>
    <button class="link" data-action="refresh">${ui.syncing ? 'Syncing…' : 'Refresh'}</button></div>

  <div class="grid2">
    <div class="card"><div class="muted small">💳 Spending</div><div class="big ${S.spendingPot < 0 ? 'neg' : ''}">${usd(S.spendingPot)}</div></div>
    <div class="card"><div class="muted small">🏦 Savings</div><div class="big ${S.savingsPot < 0 ? 'neg' : ''}">${usd(S.savingsPot)}</div></div>
  </div>

  ${goal === null ? '' : `<div class="card">
    <div class="row"><b>${esc(S.savingsGoalName)}</b><span class="muted small">${usd(S.savingsPot)} of ${usd(S.savingsGoalTarget)}</span></div>
    <div class="bar"><div style="width:${Math.round(goal * 100)}%"></div></div></div>`}

  <div class="grid3">
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
          <button class="btn primary" data-action="assign" data-id="${esc(t.id)}" data-pot="spending">💳 Spending</button>
          <button class="btn" data-action="assign" data-id="${esc(t.id)}" data-pot="savings">🏦 Savings</button>
        </div>
        <button class="link small" data-action="ignore" data-id="${esc(t.id)}">Not a spend</button>
      </div>`).join('')}</div>`
    : `<div class="card">${emptyBox('All caught up ✅', 'New purchases will show up here.')}</div>`}
  ${rec.length ? `<div class="day">Recently sorted</div><div class="card">${rec.map(t => txRow(t)).join('')}</div>` : ''}`;
}

function incomeView() {
  const now = new Date();
  const items = countedIncome(now);
  return `<div class="row"><h1>Income</h1><button class="link" data-action="addExtra" style="font-size:28px;line-height:1">＋</button></div>
  <div class="card"><div class="muted small">Earned in ${monthName(now)}</div><div class="big pos" style="font-size:32px">${usd(totalEarnings(now))}</div></div>

  <div class="card"><h2>Regular income (added automatically)</h2>
    ${S.incomeSources.map(s => {
      const got = receivedFrom(s, now);
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
    <div class="muted small" style="margin-top:6px">Tap a deposit to remove extra income. Use ＋ to count another deposit as tips, a gift, etc.</div>
  </div>`;
}

function earningsValue() {
  const run = runFor(new Date());
  return ui.earnings != null ? ui.earnings : (run ? run.earnings : expectedMonthlyEarnings());
}

const r2 = round2;

function budgetView() {
  const now = new Date();
  const run = runFor(now);
  const earn = earningsValue();
  const left = earn - fixedTotal();
  const num_ = (v, attrs) => `<input type="number" inputmode="decimal" step="any" value="${r2(v)}" ${attrs}>`;
  return `<h1>Budget</h1>
  <div class="card row"><b style="font-size:17px">${monthName(now)}</b>
    <span class="badge ${run ? 'b-hi' : 'b-mid'}">${run ? 'Applied' : 'Not applied yet'}</span></div>

  <div class="card"><h2>Monthly earnings</h2>
    ${S.incomeSources.map(s => `<div class="field"><span>${esc(s.name || 'Unnamed source')}</span><b>${usd(s.expectedAmount)}</b></div>`).join('')}
    <div class="field"><span><b>Earnings to budget</b></span>${num_(earn, 'id="earn" data-change="earnings" data-live="1"')}</div>
    <div class="muted small">Starts from your expected income. Type your real number to override it.</div>
  </div>

  <div class="card"><h2>Constant monthly expenses</h2>
    ${S.fixedExpenses.map(e => `<div class="field">
      <input class="wide" placeholder="Name" value="${esc(e.name)}" data-change="fixedName" data-id="${e.id}" data-live="1">
      <input style="width:100px" type="number" inputmode="decimal" step="any" value="${r2(e.amount)}" data-change="fixedAmt" data-id="${e.id}" data-live="1">
      <button class="link" data-action="fixedDel" data-id="${e.id}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="link" data-action="fixedAdd">＋ Add expense</button>
    <div class="field"><span><b>Total</b></span><b id="fixed-total">${usd(fixedTotal())}</b></div>
  </div>

  <div class="card"><h2>Result</h2>
    <div class="field"><span>Earnings</span><span style="text-align:right" id="res-earn">${usd(earn)}</span></div>
    <div class="field"><span>Constant expenses</span><span style="text-align:right" id="res-fixed">− ${usd(fixedTotal())}</span></div>
    <div class="field"><span><b>Added to Spending pot</b></span><b id="res-left" class="${left < 0 ? 'neg' : 'pos'}">${usd(left)}</b></div>
    <button class="btn primary full" id="applyBtn" data-action="applyBudget">${run ? "Update this month's budget" : 'Apply ' + now.toLocaleString('en-US', { month: 'long' }) + ' budget'}</button>
    <div class="muted small" style="margin-top:8px">Updating a month that's already applied only adds the difference, so nothing is counted twice.</div>
  </div>

  <div class="card"><h2>Pots &amp; goal</h2>
    <div class="field"><span>Spending pot</span>${num_(S.spendingPot, 'data-change="potField" data-field="spendingPot"')}</div>
    <div class="field"><span>Savings pot</span>${num_(S.savingsPot, 'data-change="potField" data-field="savingsPot"')}</div>
    <div class="field"><span>Goal name</span><input value="${esc(S.savingsGoalName)}" data-change="potField" data-field="savingsGoalName"></div>
    <div class="field"><span>Goal target</span>${num_(S.savingsGoalTarget, 'data-change="potField" data-field="savingsGoalTarget"')}</div>
    <div class="muted small">Set your starting balances here, or move money between pots by editing both.</div>
  </div>

  <div class="card"><h2>Automation</h2>
    <div class="field"><span>Apply automatically on the 1st</span><input type="checkbox" ${S.autoRunBudget ? 'checked' : ''} data-change="auto"></div>
    <div class="muted small">Uses your expected earnings the first time the app opens each month. You can correct it above afterwards.</div>
  </div>

  ${S.budgetRuns.length ? `<div class="card"><h2>History</h2>${S.budgetRuns.map(r => `
    <div class="row" style="padding:5px 0"><span>${r.monthKey}</span>
      <span style="text-align:right"><b>+${usd(r.leftover)}</b><div class="muted small">${usd(r.earnings)} − ${usd(r.fixedTotal)}</div></span></div>`).join('')}</div>` : ''}

  <div class="card"><h2>Backup</h2>
    <div class="muted small" style="margin-bottom:8px">Your data lives only in this browser. iOS can clear it if the app goes unused for a long time, so export a copy now and then.</div>
    <div class="btn-row"><button class="btn" data-action="export">Export</button><button class="btn" data-action="import">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden data-change="import">
  </div>`;
}

function patchBudget() {
  const earn = earningsValue();
  const left = earn - fixedTotal();
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('res-earn', usd(earn));
  set('res-fixed', '− ' + usd(fixedTotal()));
  set('fixed-total', usd(fixedTotal()));
  set('res-left', usd(left));
  const l = $('res-left');
  if (l) l.className = left < 0 ? 'neg' : 'pos';
}

const VIEWS = { home: homeView, activity: activityView, review: reviewView, income: incomeView, budget: budgetView };

/* ---------- modals ---------- */

function sheet(title, inner, doneAction) {
  return `<div class="scrim"><div class="sheet">
    <div class="sheet-head"><b>${title}</b><button class="link" data-action="${doneAction || 'close'}">Done</button></div>
    ${inner}</div></div>`;
}

function seg(options, current, action, extra) {
  return `<div class="seg">${options.map(([val, label]) =>
    `<button class="${current === val ? 'on' : ''}" data-action="${action}" data-pot="${val}" ${extra || ''}>${label}</button>`).join('')}</div>`;
}

function txModal(id) {
  const t = txById(id);
  if (!t) return sheet('Transaction', emptyBox('Not found', ''));
  const c = CATS[t.category];
  const bar = Math.round(t.confidence * 100);
  let pots = '';
  if (isExpense(t)) {
    pots = `<div class="card"><h2>Deduct from</h2>
      ${seg([['none', 'Not yet'], ['spending', 'Spending'], ['savings', 'Savings']], t.pot || 'none', 'assign', `data-id="${esc(t.id)}"`)}
      ${t.isIgnored ? '<div class="muted small" style="margin-top:8px">Marked as not a spend.</div>'
        : `<button class="link" data-action="ignore" data-id="${esc(t.id)}">Not a spend (e.g. moving my own money)</button>`}
    </div>`;
  } else {
    const src = sourceName(t.incomeSourceID);
    pots = `<div class="card"><h2>Income</h2>
      ${src ? `<div class="pos">✓ Counted automatically as ${esc(src)}</div>`
        : t.extraIncomeLabel ? `<div class="pos">✓ Extra income: ${esc(t.extraIncomeLabel)}</div>
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
      ${seg([['spending', 'Add to Spending'], ['savings', 'Add to Savings']], m.pot, 'extraPot')}
    </div>
    <button class="btn primary full" data-action="saveExtra" ${m.selected ? '' : 'disabled'}>Add extra income</button>`);
}

function sourcesModal() {
  return sheet('Income sources', `
    ${S.incomeSources.map(s => `<div class="card stack">
      <input placeholder="Name (e.g. Full-time job)" value="${esc(s.name)}" data-change="srcName" data-id="${s.id}" data-live="1">
      <div class="field"><span>Expected per month</span><input type="number" inputmode="decimal" step="any" value="${r2(s.expectedAmount)}" data-change="srcAmt" data-id="${s.id}" data-live="1"></div>
      <input placeholder="Bank text to match (e.g. PAYROLL)" value="${esc(s.matchKeyword)}" autocapitalize="characters" autocorrect="off" data-change="srcKey" data-id="${s.id}" data-live="1">
      <div class="muted small">Deposits whose bank description contains the match text are counted automatically.</div>
      <button class="btn danger full" data-action="srcDel" data-id="${s.id}">Remove this source</button>
    </div>`).join('')}
    <button class="btn full" data-action="srcAdd">＋ Add income source</button>`, 'closeSources');
}

function modalHTML() {
  const m = ui.modal;
  if (m.type === 'tx') return txModal(m.id);
  if (m.type === 'extra') return extraModal();
  if (m.type === 'sources') return sourcesModal();
  return '';
}

/* ---------- render ---------- */

const TABS = [['home', '🏠', 'Home'], ['activity', '📋', 'Activity'], ['review', '📥', 'Review'], ['income', '💵', 'Income'], ['budget', '📊', 'Budget']];

function render() {
  const y = window.scrollY;
  const oldSheet = modalRoot.querySelector('.sheet');
  const sheetY = oldSheet ? oldSheet.scrollTop : 0;

  app.innerHTML = VIEWS[ui.tab]();
  const n = pending().length;
  tabbar.innerHTML = TABS.map(([k, icon, label]) =>
    `<button class="${ui.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}"><span class="i">${icon}</span>${label}${k === 'review' && n ? `<span class="pip">${n}</span>` : ''}</button>`).join('');
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

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pocketledger-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ACTIONS = {
  tab: d => { ui.tab = d.tab; ui.resetScroll = true; },
  open: d => { ui.modal = { type: 'tx', id: d.id }; },
  close: () => closeModal(),
  closeSources: () => closeModal(),
  assign: d => assign(d.id, d.pot === 'none' ? null : d.pot),
  ignore: d => ignoreTx(d.id),
  filter: d => { ui.filter = (ui.filter === d.cat || !d.cat) ? null : d.cat; },
  refresh: () => { doSync(); return false; },
  addExtra: d => { ui.modal = { type: 'extra', selected: d.id || null, label: 'Tips', pot: 'spending' }; },
  pickExtra: d => { ui.modal.selected = d.id; },
  extraPot: d => { ui.modal.pot = d.pot; },
  saveExtra: () => { markExtraIncome(ui.modal.selected, ui.modal.label, ui.modal.pot); ui.modal = null; },
  removeExtra: d => removeExtraIncome(d.id),
  editSources: () => { ui.modal = { type: 'sources' }; },
  srcAdd: () => { S.incomeSources.push({ id: uid(), name: '', expectedAmount: 0, matchKeyword: '' }); save(); },
  srcDel: d => { S.incomeSources = S.incomeSources.filter(s => s.id !== d.id); save(); },
  fixedAdd: () => { S.fixedExpenses.push({ id: uid(), name: '', amount: 0 }); save(); },
  fixedDel: d => { S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== d.id); save(); },
  applyBudget: () => { applyBudget(earningsValue()); ui.earnings = null; },
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

function handleField(el, final) {
  const d = el.dataset;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const find = (list) => list.find(x => x.id === d.id);
  switch (d.change) {
    case 'search':
      ui.search = v;
      { const box = $('actList'); if (box) box.innerHTML = activityListHTML(); }
      return;
    case 'earnings': ui.earnings = num(v); patchBudget(); return;
    case 'fixedName': { const e = find(S.fixedExpenses); if (e) { e.name = v; save(); } return; }
    case 'fixedAmt': { const e = find(S.fixedExpenses); if (e) { e.amount = num(v); save(); patchBudget(); } return; }
    case 'srcName': { const s = find(S.incomeSources); if (s) { s.name = v; save(); } return; }
    case 'srcAmt': { const s = find(S.incomeSources); if (s) { s.expectedAmount = num(v); save(); } return; }
    case 'srcKey': { const s = find(S.incomeSources); if (s) { s.matchKeyword = v.toUpperCase(); save(); } return; }
    case 'potField':
      S[d.field] = d.field === 'savingsGoalName' ? v : num(v); save(); return;
    case 'auto': S.autoRunBudget = v; save(); return;
    case 'extraLabel': ui.modal.label = v; return;
    case 'setcat': if (final) { setCategory(d.id, v); render(); } return;
    case 'import':
      if (final && el.files && el.files[0]) {
        el.files[0].text().then(text => {
          try { replaceState(JSON.parse(text)); ui.earnings = null; render(); }
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

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
