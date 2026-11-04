/* PocketLedger UI. Plain JavaScript, no build step. */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const modalRoot = document.getElementById('modal-root');

const ui = {
  tab: 'review', prevTab: 'review', linkMsg: '', linkItems: null, modal: null, picker: null, dialog: null, skipGhost: {}, bulkTarget: null, filter: null, search: '', rsearch: '', psearch: '', racct: 'all', openAcct: {}, afilter: null, xref: null, syncing: false, resetScroll: false,
  potId: null, selectMode: false, selected: {},
  budgetInputs: {}, editEarn: {}, resetEarn: {}, openRuns: {}, checkMonth: null, actual: null, adjTarget: 'spending',
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

/* Emoji, tinted to a color so they sit in the palette instead of shouting. */
let SAGE = '#a9bea1', DIM = '#9c9786';
const tintCache = {};
function tintFilter(hex) {
  if (tintCache[hex]) return tintCache[hex];
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
  let h = 0, s = 0;
  if (dl > 0) {
    s = dl / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    h = (h * 60 + 360) % 360;
  }
  return (tintCache[hex] = `grayscale(1) sepia(1) hue-rotate(${Math.round(h - 38)}deg) saturate(${(0.25 + s * 1.1).toFixed(2)})`);
}
const emo = (ch, color) => `<span class="emo" style="filter:${tintFilter(color || SAGE)}">${ch}</span>`;
const emoDark = ch => `<span class="emo" style="filter:grayscale(1) brightness(.2)">${ch}</span>`;

/* Progress fill and counting numbers: both are animated after each render (see animateUI). */
const fill = (key, pct, style) => `<div data-bar="${esc(key)}" data-w="${Math.round(pct)}" ${style ? `style="${style}"` : ''}></div>`;
const counted = (key, val) => `data-count="${esc(key)}" data-val="${val}"`;

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
    <div class="ic" style="color:${c.color};border-color:${c.color}55;background:${c.color}14">${emo(c.icon, c.color)}</div>
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
    <div class="muted small">${emo(p.icon)} ${esc(p.name)} ›</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}" ${counted('pot-' + p.id, p.balance)}>${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar">${fill('pot-' + p.id, pct * 100)}</div><div class="muted small">of ${usd(p.target)} goal</div>`}
  </div>`;
}

function backupBanner() {
  return backupDue() ? `<div class="card banner"><b>Time for a backup</b>
    <div class="small">${S.lastExport ? daysSinceBackup() + ' days since your last backup.' : 'You haven\'t backed up yet.'} Your data lives only on this phone.</div>
    <button class="btn full" style="margin-top:8px" data-action="shareCode">Email myself a backup code</button></div>` : '';
}

function homeView() {
  const now = new Date();
  return `
  <div class="row"><h1>Home</h1>
    ${S.useSampleData ? `<button class="link" data-action="refresh">${ui.syncing ? 'Syncing…' : 'Refresh'}</button>` : ''}</div>

  <div class="grid2">${S.pots.map(potCard).join('')}</div>
  <button class="btn full dashed" data-action="addPot">＋ Add pot or goal</button>

  <div class="grid3" style="margin-top:12px">
    <div class="card"><div class="muted small">Earned</div><div class="stat pos" ${counted('earned', totalEarnings(now))}>${usd(totalEarnings(now))}</div></div>
    <div class="card"><div class="muted small">Spent</div><div class="stat" ${counted('spent', spentIn(now))}>${usd(spentIn(now))}</div></div>
    <div class="card"><div class="muted small">Deductible YTD</div><div class="stat" style="color:${CATS.videoCamera.color}" ${counted('deduct', taxDeductibleTotal(now.getFullYear()))}>${usd(taxDeductibleTotal(now.getFullYear()))}</div></div>
  </div>

  ${FEATURES.creditScore ? creditCard() : ''}

  ${accountsHTML()}`;
}

/* Every account your banks send, grouped by bank. Tap one to see its details and recent transactions. */
function acctCard(a) {
  const open = !!ui.openAcct[a.id];
  const owed = a.kind === 'credit' || a.kind === 'loan';
  const all = S.transactions.filter(t => t.accountID === a.id);
  const month = inMonth(new Date()).filter(t => t.accountID === a.id);
  const inAmt = month.filter(t => t.amount > 0).reduce((x, t) => x + t.amount, 0);
  const outAmt = month.filter(t => t.amount < 0).reduce((x, t) => x + t.amount, 0);
  const line = (k, v) => `<div class="field"><span class="muted">${k}</span><div style="text-align:right">${v}</div></div>`;
  const base = KIND_LABEL[a.kind] || a.kind, sub = String(a.subtype || '').toLowerCase();
  const kindText = base + (sub && sub !== base && sub !== a.kind && !(a.kind === 'credit' && /credit/.test(sub)) ? ' · ' + sub : '');
  return `<div class="acct ${open ? 'open' : ''}">
    <div class="row acct-top" data-action="toggleAcct" data-id="${esc(a.id)}" style="padding:8px 0">
      <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</div>
        <div class="muted small">${esc(kindText)}</div></div>
      <div style="text-align:right;white-space:nowrap"><b class="${a.balance < 0 ? 'neg' : ''}">${usd(a.balance)}</b>
        <span class="chev">${open ? '⌄' : '›'}</span></div>
    </div>
    ${open ? `<div class="acct-body">
      ${line(owed ? 'You owe' : 'Available', usd(owed ? Math.abs(a.balance) : a.balance))}
      ${a.current != null && !owed && Math.abs(a.current - a.balance) > 0.004 ? line('Posted balance', usd(a.current)) : ''}
      ${a.limit ? line('Credit limit', usd(a.limit)) + line('Credit left', usd(Math.max(a.limit + a.balance, 0))) : ''}
      ${a.official && a.official !== a.name ? line('Account', esc(a.official)) : ''}
      ${line('This month', '<span class="pos">in ' + usd(inAmt) + '</span> · out ' + usd(Math.abs(outAmt)))}
      <div class="day" style="margin-top:8px">Recent</div>
      ${all.length ? all.slice(0, 8).map(t => txRow(t, incomeTag(t))).join('') : '<div class="muted small">No transactions yet.</div>'}
      ${all.length > 8 ? `<button class="link small" data-action="acctActivity" data-id="${esc(a.id)}">see all ${all.length} in Activity ›</button>` : ''}
    </div>` : ''}
  </div>`;
}

function accountsHTML() {
  const accts = S.accounts.slice().sort((x, y) => (x.institution || '').localeCompare(y.institution || '') || (KIND_RANK[x.kind] || 6) - (KIND_RANK[y.kind] || 6) || x.name.localeCompare(y.name));
  const cash = accts.filter(a => a.kind === 'checking' || a.kind === 'savings').reduce((t, a) => t + a.balance, 0);
  const owe = accts.filter(a => a.kind === 'credit' || a.kind === 'loan').reduce((t, a) => t + a.balance, 0);
  const banks = [...new Set(accts.map(a => a.institution || 'Other'))];
  return `<div class="card"><h2>Accounts</h2>
    ${accts.length ? `<div class="grid2" style="margin-bottom:6px">
        <div><div class="muted small">cash</div><b>${usd(cash)}</b></div>
        <div><div class="muted small">owed on cards</div><b class="${owe < 0 ? 'neg' : ''}">${usd(Math.abs(owe))}</b></div></div>
      ${banks.map(bk => `<div class="day">${esc(bk)}</div>${accts.filter(a => (a.institution || 'Other') === bk).map(acctCard).join('')}`).join('')}`
      : '<div class="muted small">No accounts linked. Purchases you add with ＋ on Review show up in Activity.</div>'}
    ${S.lastSync ? `<div class="muted small" style="margin-top:6px">Updated ${fmtShort(S.lastSync)}</div>` : ''}
    ${syncError ? `<div class="err">${esc(syncError)}</div>` : ''}
    ${lastSaveError ? `<div class="err">Couldn't save: ${esc(lastSaveError)}</div>` : ''}
    ${S.settings.linked ? '<div class="muted small" style="margin-top:6px">Missing an account? Settings → Bank accounts → choose accounts.</div>' : ''}
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
    <div class="ic">${emo(icons[e.kind] || '•', DIM)}</div>
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
  <h1>${emo(p.icon)} ${esc(p.name)}</h1>

  <div class="card">
    <div class="muted small">Balance</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}" style="font-size:34px" ${counted('potpage-' + p.id, p.balance)}>${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar">${fill('pot-' + p.id, pct * 100)}</div>
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
    ${selBtn('bulkTarget', '', 'flex:1')}
    <button class="btn primary" data-action="bulkMove">Move</button></div>` : ''}`;
}

/* ---------- activity ---------- */

/* Every word typed must appear somewhere: name, merchant, category, pot, amount, or date (e.g. "kroger 42", "gas october", "camera"). */
function txMatches(t, query) {
  const words = String(query || '').toLowerCase().replace(/\$/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const d = new Date(t.date);
  const hay = [
    t.rawName, t.simpleName, (CATS[t.category] || {}).title || '', t.pot ? potName(t.pot) : '',
    t.isIgnored ? 'ignored not a spend' : '', t.amount > 0 ? 'income deposit' : 'purchase',
    Math.abs(t.amount).toFixed(2), String(Math.round(Math.abs(t.amount))),
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), d.toISOString().slice(0, 10),
  ].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}
const searchBox = (id, value, change, ph) =>
  `<input id="${id}" type="search" placeholder="${ph}" value="${esc(value)}" data-change="${change}" data-live="1" autocapitalize="off" autocorrect="off" spellcheck="false" style="margin-bottom:10px">`;

function activityListHTML() {
  const list = S.transactions.filter(t => (!ui.afilter || t.accountID === ui.afilter) && (!ui.filter || t.category === ui.filter) && txMatches(t, ui.search));
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
      style="${on ? `background:${color};color:var(--bg);border-color:${color}` : `color:${color};border-color:${color}55`}">${icon ? (on ? emoDark(icon) : emo(icon, color)) + ' ' : ''}${label}</button>`;
  };
  return `<h1>Activity</h1>
  ${searchBox('search', ui.search, 'search', 'Search activity')}
  <div class="chips">
    ${chip(null, 'All', '#A3B89C', '')}
    ${Object.entries(CATS).map(([k, c]) => chip(k, c.title, c.color, c.icon)).join('')}
  </div>
  ${ui.afilter ? `<div class="row" style="margin-bottom:8px"><span class="muted small">Showing only ${esc(accountTitle(ui.afilter))}</span><button class="link small" data-action="clearAfilter">show all ✕</button></div>` : ''}
  <div id="actList">${activityListHTML()}</div>`;
}

/* ---------- review ---------- */

function spendingBar() {
  const L = spendingLevel();
  const p = L.pct;
  const color = p == null ? 'var(--accent)' : p > 0.5 ? 'var(--accent)' : p > 0.2 ? 'var(--orange)' : 'var(--red)';
  return `<div class="stick"><div class="card spendbar" data-action="openPot" data-id="spending">
    <div class="row"><span class="muted small">${emo(potById('spending').icon)} spending left this month ›</span>
      <span class="small muted">${L.available > 0 ? Math.round((p || 0) * 100) + '% left' : ''}</span></div>
    <div class="row"><div class="big ${L.left < 0 ? 'neg' : ''}" ${counted('spend', L.left)}>${usd(L.left)}</div>
      ${L.available > 0 ? `<div class="muted small" style="text-align:right">of ${usd(L.available)}<br>${usd(L.spent)} spent</div>` : '<div class="muted small" style="text-align:right">Apply this month\'s budget<br>to see your level</div>'}</div>
    ${p == null ? '' : `<div class="bar thick">${fill('spend', p * 100, 'background:' + color)}</div>`}
  </div></div>`;
}

const KIND_LABEL = { checking: 'checking', credit: 'credit card', savings: 'savings', loan: 'loan', investment: 'investment' };
const accountTitle = id => {
  if (id === 'manual') return 'Added by hand';
  const a = accountById(id);
  return a ? (a.institution ? a.institution + ' · ' : '') + a.name : 'Unknown account';
};

function assignButtons(t) {
  const first = accountDefaultPot(t.accountID);
  const ordered = [...S.pots.filter(p => p.id === first), ...S.pots.filter(p => p.id !== first)];
  return ordered.map(pot => `<button class="btn ${pot.id === first ? 'pick' : ''}" data-action="assign" data-id="${esc(t.id)}" data-pot="${esc(pot.id)}">${emo(pot.icon)} ${esc(pot.name)}</button>`).join('');
}

function reviewItem(t) {
  return `<div class="rv">
    ${txRow(t)}
    <div class="muted small" style="margin:2px 0 6px">Deduct this from…</div>
    <div class="btn-row">${assignButtons(t)}</div>
    <button class="link small" data-action="ignore" data-id="${esc(t.id)}">Not a spend</button>
  </div>`;
}

/* One list per account, so a fee on your savings account never sits in the same list as your checking or cards. */
function reviewAccounts() {
  const ids = [...new Set(pending().map(t => t.accountID))];
  return ids.sort((a, b) => accountRank(a) - accountRank(b));
}

function reviewListHTML() {
  const q = ui.rsearch.trim();
  const only = ui.racct && ui.racct !== 'all' ? ui.racct : null;
  const p = pending().filter(t => (!only || t.accountID === only) && txMatches(t, q));
  const rec = (q || only) ? S.transactions.filter(t => isExpense(t) && (t.pot || t.isIgnored) && (!only || t.accountID === only) && txMatches(t, q)).slice(0, 30) : recentlyReviewed();
  if ((q || only) && !p.length && !rec.length) return `<div class="card">${emptyBox('No matches', 'Nothing in Review matches that. Activity searches everything.')}</div>`;
  const ids = [...new Set(p.map(t => t.accountID))].sort((a, b) => accountRank(a) - accountRank(b));
  const groups = ids.map(id => {
    const list = p.filter(t => t.accountID === id);
    const a = accountById(id);
    return `<div class="day acct-head" style="margin-top:0"><span>${esc(accountTitle(id))}</span>
        <span class="muted small" style="white-space:nowrap">${list.length} to sort</span></div>
      <div class="card">${list.map(reviewItem).join('')}</div>`;
  }).join('');
  return `${groups || `<div class="card">${emptyBox('all caught up ' + emo('✅'), 'Tap ＋ Purchase when you buy something.')}</div>`}
  ${rec.length ? `<div class="day">Recently sorted</div><div class="card">${rec.map(t => txRow(t)).join('')}</div>` : ''}`;
}

function reviewChips() {
  const ids = reviewAccounts();
  if (ids.length < 2) return '';
  const chip = (id, label) => `<button class="chip ${((ui.racct || 'all') === id) ? 'on' : ''}" data-action="racct" data-id="${esc(id)}">${esc(label)}</button>`;
  return `<div class="chips" style="margin-bottom:8px">${chip('all', 'All accounts')}${ids.map(id => chip(id, accountTitle(id).replace(/^.*· /, ''))).join('')}</div>`;
}

function reviewView() {
  return `${spendingBar()}
  <div class="row"><h1>Review</h1><button class="btn" data-action="addTx">＋ Purchase</button></div>
  ${backupBanner()}
  ${S.useSampleData ? `<div class="card banner"><b>You're looking at sample data</b>
    <div class="small">Nothing here is real. When you're ready, clear it and start with your own purchases.</div>
    <button class="btn full" style="margin-top:8px" data-action="startFresh">Clear sample data &amp; start fresh</button></div>` : ''}
  ${reviewChips()}
  ${searchBox('rsearch', ui.rsearch, 'rsearch', 'Search purchases')}
  <div id="rvList">${reviewListHTML()}</div>`;
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
        <div class="bar">${fill('src-' + s.id, pct * 100)}</div>
        <div class="muted small">of ${usd(s.expectedAmount)} expected</div></div>`;
    }).join('') || '<div class="muted">No income sources yet.</div>'}
    <button class="link" data-action="editSources">Edit income sources</button>
  </div>

  <div class="card"><h2>Counted this month</h2>
    ${items.length ? items.map(t => txRow(t, incomeTag(t))).join('') : '<div class="muted">No income counted yet this month.</div>'}
    <div class="muted small" style="margin-top:6px">Tap a deposit to remove extra income. Use ＋ to count another deposit as tips, a gift, etc. Variable income like freelance is added to your budget by hand on the Budget tab.</div>
  </div>

  <button class="btn full" data-action="openHist">Income history &amp; cross-check ›</button>`;
}

/* ---------- income history ---------- */

const histMonth = i => { const n = MONTH_NAMES[i % 12]; return n[0].toUpperCase() + n.slice(1, 3) + ' ' + Math.floor(i / 12); };

function histImportCard(first) {
  return `<div class="card"><h2>${first ? 'Bring in your money-made lists' : 'Add or update records'}</h2>
    <div class="muted small" style="margin-bottom:8px">Paste the text of your lists (one or several years at once), or choose the files. Lines look like <b>$1,809.24 Employer</b> under a month name, with <b>MONEY MADE 2026</b> above them. Pasting a year again replaces that year, so nothing doubles. This stays on this phone and is never part of the app's code.</div>
    <textarea id="histText" rows="6" placeholder="MONEY MADE 2026&#10;OCTOBER&#10;$1,809.24 Employer"></textarea>
    <div class="btn-row"><button class="btn primary" data-action="importHist">Read pasted text</button><button class="btn" data-action="pickHist">Choose files</button></div>
    <input type="file" id="histFile" accept=".txt,text/plain" multiple hidden data-change="histFiles">
  </div>`;
}

const medianOf = a => { const v = a.slice().sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; };

function incomeHistoryView() {
  const back = `<div class="row"><button class="link" data-action="tab" data-tab="income">‹ income</button></div>`;
  if (!S.incomeHistory.length) return `${back}<h1>Income history</h1>
    <div class="card"><div class="muted small">Your past income lets the app see where money comes from: which jobs are still paying, which have ended, which months are bigger, and which bank deposits should count as income.</div></div>
    ${histImportCard(true)}`;

  const sums = incomeSummary(), years = incomeYearTotals(), months = incomeMonthTotals(12);
  const ymax = Math.max(...Object.values(years)), mmax = Math.max(...months.map(m => m.total));
  const last12 = months.reduce((a, m) => a + m.total, 0);
  const kindText = { regular: 'steady pay', varies: 'varies', 'one-off': 'one-off' };
  const ready = sums.filter(o => o.recent && o.kind !== 'one-off' && !S.incomeSources.some(x => x.name.toLowerCase() === o.name.toLowerCase()));
  const x = ui.xref;

  return `${back}<h1>Income history</h1>
  <div class="card"><h2>By year</h2>
    ${Object.keys(years).sort((a, b) => b - a).map(y => `<div style="padding:5px 0"><div class="row"><span>${y}</span><b>${usd(years[y])}</b></div>
      <div class="bar">${fill('yr-' + y, years[y] / ymax * 100)}</div></div>`).join('')}
  </div>

  <div class="card"><h2>Recent months</h2>
    ${months.map(m => `<div style="padding:4px 0"><div class="row"><span class="muted small">${histMonth(m.idx)}</span><b>${usd(m.total)}</b></div>
      <div class="bar">${fill('mo-' + m.idx, m.total / mmax * 100)}</div></div>`).join('')}
    <div class="muted small" style="margin-top:6px">Typical month: ${usd(medianOf(months.map(m => m.total)))} (the middle one). Average: ${usd(last12 / months.length)}, pulled up by big months.</div>
  </div>

  <div class="card"><h2>Where it comes from</h2>
    ${sums.map(o => `<div style="padding:8px 0;border-top:1px solid var(--line)">
      <div class="row"><b>${esc(o.name)}</b><b>${usd(o.total)}</b></div>
      <div class="small"><span class="pill ${o.recent ? 'on' : ''}">${o.recent ? 'still paying' : 'ended ' + histMonth(o.last)}</span> <span class="pill">${kindText[o.kind]}</span></div>
      <div class="muted small" style="margin-top:4px">${o.n} payment${o.n === 1 ? '' : 's'} · ${usd(o.avg)} each · ${histMonth(o.first)}${o.first === o.last ? '' : ' to ' + histMonth(o.last)}</div>
      ${o.recent && o.kind === 'regular' ? `<div class="muted small">about ${usd(o.monthlyAvg)} in a typical month (the middle one, so a 3-paycheck month doesn't count)</div>` : ''}
      <div class="muted small">${Object.keys(o.years).sort().map(y => y + ': ' + usd(o.years[y])).join(' · ')}</div>
    </div>`).join('')}
    ${ready.length ? `<div class="muted small" style="margin-top:8px">Not set up yet as income sources: ${ready.map(o => esc(o.name)).join(', ')}.</div>
      <button class="btn primary full" style="margin-top:8px" data-action="setupSources">Set up my current income sources</button>`
      : '<div class="muted small" style="margin-top:8px">Your current income sources are all set up. Edit them any time on the Income tab.</div>'}
  </div>

  <div class="card"><h2>Check against your bank</h2>
    <div class="muted small" style="margin-bottom:8px">Compares deposits from your linked accounts with these records (same amount, same month). Matches teach the app which bank text belongs to which employer, so future deposits count as income by themselves.</div>
    <button class="btn full" data-action="crossRef">Check deposits now</button>
    ${x ? `<div style="margin-top:10px">
      <div class="row"><span>Deposits matched to your records</span><b>${x.matched.length}</b></div>
      ${x.matched.slice(0, 12).map(m => `<div class="row small" style="padding:3px 0"><span class="muted">${fmtShort(m.tx.date)} · ${esc(m.tx.rawName.slice(0, 26))}</span><span>${usd(m.tx.amount)} → ${esc(m.h.source)}</span></div>`).join('')}
      ${Object.entries(x.keywords).filter(([, k]) => k).map(([n, k]) => `<div class="muted small">Bank text for ${esc(n)}: <b>${esc(k)}</b></div>`).join('')}
      ${x.newlyMatched ? `<button class="btn primary full" style="margin-top:8px" data-action="applyXref">Count these as income and learn the bank text</button>` : (x.matched.length ? '<div class="muted small" style="margin-top:6px">These are already counted.</div>' : '')}
      ${x.unmatched.length ? `<div class="day">In your bank, not in your records (${x.unmatched.length})</div>
        ${x.unmatched.slice(0, 12).map(t => `<div class="row small" style="padding:3px 0"><span class="muted">${fmtShort(t.date)} · ${esc(t.rawName.slice(0, 30))}</span><b>${usd(t.amount)}</b></div>`).join('')}
        <div class="muted small">Transfers, refunds and Zelle usually belong here. If one is real income, tap it on the Activity tab.</div>` : ''}
      ${x.missing.length ? `<div class="day">In your records, not found in the bank (${x.missing.length})</div>
        ${x.missing.slice(0, 12).map(h => `<div class="row small" style="padding:3px 0"><span class="muted">${histMonth(monthIdx(h.year, h.month))} · ${esc(h.source)}</span><b>${usd(h.amount)}</b></div>`).join('')}
        <div class="muted small">Could be cash, a different account, or an amount that differs slightly from the deposit.</div>` : ''}
    </div>` : ''}
  </div>

  ${histImportCard(false)}
  <button class="link small danger" data-action="clearHist">Remove my income history from this phone</button>`;
}

/* ---------- budget ---------- */

const srcById = id => S.incomeSources.find(s => s.id === id);

function earningAmounts() {
  const now = new Date();
  const run = runFor(now);
  return S.incomeSources.map(s => {
    const deposits = inMonth(now).filter(t => t.incomeSourceID === s.id);
    const got = r2(deposits.reduce((a, t) => a + t.amount, 0));
    const prev = run && (run.earningsBreakdown || []).find(b => b.sourceId === s.id);
    let amount, mode;
    if (ui.budgetInputs[s.id] != null) { amount = ui.budgetInputs[s.id]; mode = 'edited'; }
    else if (!ui.resetEarn[s.id] && prev && prev.edited) { amount = prev.amount; mode = 'edited'; }
    else if (deposits.length) { amount = got; mode = 'deposits'; }
    else if (!s.variable && s.expectedAmount > 0) { amount = s.expectedAmount; mode = 'expected'; }
    else { amount = 0; mode = 'none'; }
    return { sourceId: s.id, name: s.name || 'Unnamed source', amount: amount || 0, mode, edited: mode === 'edited', deposits, got };
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

const checkKeys = () => [...new Set([monthKey(new Date()), ...S.budgetRuns.map(r => r.monthKey)])].sort().reverse();

function checkCard() {
  const keys = checkKeys();
  if (!ui.checkMonth || !keys.includes(ui.checkMonth)) ui.checkMonth = keys[0];
  const key = ui.checkMonth;
  const rs = roundingStats(key);
  const d = discrepancy(key, ui.actual);
  return `<div class="card"><h2>Month-end check</h2>
    ${selBtn('checkMonth', '', '', 'width:100%')}
    <div class="field" style="margin-top:8px"><span>Spent from pots (exact)</span><span>${usd(rs.exact)}</span></div>
    <div class="field"><span>Deducted (rounded)</span><span>${usd(rs.deducted)}</span></div>
    <div class="field"><span>Rounding difference</span><b class="${rs.diff > 0 ? 'pos' : rs.diff < 0 ? 'neg' : ''}">${signed(rs.diff)}</b></div>
    <div class="field"><span>All pots add up to</span><b id="pots-total">${usd(potsTotal())}</b></div>
    <div class="field"><span>Round spending when deducting</span>
      ${selBtn('roundMode', '')}</div>
    <div class="field"><span>Real money you have for them <span class="muted small">(optional)</span></span>
      ${ui.actual == null ? numInput(0, 'id="actual" data-change="actual" data-live="1" placeholder="0"', 'width:120px').replace('value="0"', 'value=""') : numInput(ui.actual, 'id="actual" data-change="actual" data-live="1"', 'width:120px')}</div>
    <div class="muted small">Leave it blank to check only the rounding. Enter your real count to catch any other missing or extra dollars.</div>
    <div id="disc-box" style="margin-top:6px">${discHTML(d)}</div>
    <div class="field"><span>Put it in</span>${selBtn('adjTarget', '')}</div>
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
    ${byPot.map(g => `<div class="day">Spent from ${emo(g.p.icon)} ${esc(g.p.name)} · ${usd(-r2(g.items.reduce((a, e) => a + e.amount, 0)))}</div>
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
  const extra = countedIncome(now).filter(t => t.extraIncomeLabel);
  return `<h1>Budget</h1>
  <div class="card row"><b style="font-size:17px">${monthName(now)}</b>
    <span class="badge ${run ? 'b-hi' : 'b-mid'}">${run ? 'Applied' : 'Not applied yet'}</span></div>

  <div class="card"><h2>Earnings this month</h2>
    ${c.rows.map(r => {
      const note = r.mode === 'expected' ? 'No deposit yet, using your expected amount'
        : r.mode === 'none' ? (S.incomeSources.find(x => x.id === r.sourceId).variable ? 'Nothing received this month' : 'Nothing received yet')
        : r.mode === 'edited' ? `Edited${r.deposits.length ? ' · deposits total ' + usd(r.got) : ''}` : '';
      return `<div class="earn">
        <div class="row"><b>${esc(r.name)}</b>
          ${r.edited ? numInput(r.amount, `data-change="earnInput" data-id="${r.sourceId}" data-live="1"`, 'width:110px')
            : `<b>${usd(r.amount)}</b>`}</div>
        ${r.deposits.map(t => txRow(t)).join('')}
        <div class="row"><span class="muted small">${note}</span>
          ${r.edited ? `<button class="link small" data-action="resetEarn" data-id="${r.sourceId}">Reset</button>`
            : `<button class="link small" data-action="editEarn" data-id="${r.sourceId}">Edit</button>`}</div>
      </div>`;
    }).join('') || '<div class="muted">Add an income source on the Income tab.</div>'}
    ${extra.length ? `<div class="day">Extra income · already in your pots</div>${extra.map(t => txRow(t, incomeTag(t))).join('')}` : ''}
    <div class="field" style="border-top:1px solid var(--line);margin-top:6px"><span><b>Earnings to budget</b></span><b id="earn-total">${usd(c.earn)}</b></div>
    <div class="muted small">Pulled from the deposits on your Income tab. Tap Edit only to fix a difference.</div>
  </div>

  <div class="card"><h2>Constant monthly expenses</h2>
    ${S.fixedExpenses.map(e => `<div class="field">
      <input class="wide" placeholder="Name" value="${esc(e.name)}" data-change="fixedName" data-id="${e.id}" data-live="1">
      ${numInput(e.amount, `data-change="fixedAmt" data-id="${e.id}" data-live="1"`, 'width:100px')}
      <button class="link" data-action="fixedDel" data-id="${e.id}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="link" data-action="fixedAdd">＋ Add expense</button>
    <div class="field"><span>${emo('💰')} Savings %</span>
      <span class="pctbox">${numInput(S.savingsPercent, 'data-change="savePct" data-live="1"', 'width:70px')} %</span></div>
    <div class="muted small">That's <b id="save-amt">${usd(c.save)}</b> set aside for Savings this month.</div>
    <div class="field"><span><b>Total expenses</b></span><b id="fixed-total">${usd(c.fixed)}</b></div>
  </div>

  <div class="card"><h2>Result</h2>
    <div class="field"><span><b>Added to Spending</b></span><b id="res-left" class="${c.left < 0 ? 'neg' : 'pos'}">${usd(c.left)}</b></div>
    <div class="field"><span><b>Added to Savings</b></span><b id="res-save" class="pos">${usd(c.save)}</b></div>
    <button class="btn primary full" data-action="applyBudget">${run ? "Update this month's budget" : 'Apply ' + now.toLocaleString('en-US', { month: 'long' }) + ' budget'}</button>
    <div class="muted small" style="margin-top:8px">Nothing happens until you tap this. Updating a month that's already applied replaces its numbers, so nothing is counted twice.</div>
  </div>

  ${checkCard()}

  ${historyCard()}`;
}

function backupCard() {
  return `<div class="card"><h2>Backup &amp; restore</h2>
    <div class="muted small" style="margin-bottom:8px">${S.lastExport ? 'Last backup: ' + fmtShort(S.lastExport) + '.' : 'No backup yet.'} Your data lives only on this phone, so keep a copy somewhere private.</div>
    <button class="btn primary full" data-action="shareCode">Email myself a backup code</button>
    <div class="muted small" style="margin:6px 0 10px">Opens the share sheet. Choose Mail and send it to yourself. It can't send by itself; a web page has no way to email on its own.</div>
    <div class="btn-row"><button class="btn" data-action="copyCode">Copy code</button><button class="btn" data-action="export">Save file</button></div>
    <div class="day">Restore</div>
    <textarea id="restoreText" rows="3" placeholder="Paste your backup code (or the whole email) here"></textarea>
    <div class="btn-row"><button class="btn" data-action="restoreCode">Restore from code</button><button class="btn" data-action="import">Import file</button></div>
    <button class="btn full" style="margin-top:8px" data-action="restoreNotes">Bring back only my notes &amp; to-dos from this code</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden data-change="import">
    <div class="muted small" style="margin-top:8px">Restoring replaces everything on this phone. The code contains your financial data, so keep that email private and never post it online.</div>
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
  set('fixed-total', usd(c.fixed));
  set('save-amt', usd(c.save));
  set('res-left', usd(c.left));
  set('res-save', usd(c.save));
  const l = $('res-left');
  if (l) l.className = c.left < 0 ? 'neg' : 'pos';
}

function patchCheck() {
  setHTMLIfChanged($('disc-box'), discHTML(discrepancy(ui.checkMonth, ui.actual)));
  const t = $('pots-total');
  if (t) t.textContent = usd(potsTotal());
}

/* ---------- to-do & notes ---------- */

const planHit = (q, ...parts) => { const w = q.toLowerCase().split(/\s+/).filter(Boolean); const h = parts.join(' ').toLowerCase(); return w.every(x => h.includes(x)); };

function todoListHTML() {
  const q = ui.psearch;
  const todos = S.todos.filter(t => planHit(q, t.text));
  const open = todos.filter(t => !t.done), done = todos.filter(t => t.done);
  const row = t => `<div class="todo ${t.done ? 'done' : ''}">
    <input type="checkbox" ${t.done ? 'checked' : ''} data-change="todoDone" data-id="${t.id}">
    <span class="todo-text">${esc(t.text)}</span>
    <button class="link" data-action="delTodo" data-id="${t.id}" aria-label="Delete">✕</button></div>`;
  return `${open.map(row).join('') || `<div class="muted" style="padding:8px 0">${q ? 'No tasks match.' : 'Nothing to do. Add something above.'}</div>`}
      ${done.length ? `<div class="day">Done</div>${done.map(row).join('')}
        ${q ? '' : '<button class="link small" data-action="clearDone">Clear completed</button>'}` : ''}`;
}

function noteListHTML() {
  const notes = S.notes.filter(n => planHit(ui.psearch, n.title, n.body));
  return `${notes.length ? notes.map(n => `<div class="note" data-action="openNote" data-id="${n.id}">
      <div class="t1">${esc(n.title || 'Untitled note')}</div>
      <div class="muted small note-prev">${esc((n.body || '').slice(0, 120)) || 'Empty'}</div>
      <div class="muted small">${fmtShort(n.updated)}</div></div>`).join('')
      : `<div class="muted" style="padding:8px 0">${ui.psearch ? 'No notes match.' : 'No notes yet.'}</div>`}`;
}

function planView() {
  return `<h1>To-do &amp; Notes</h1>
  ${searchBox('psearch', ui.psearch, 'psearch', 'Search tasks and notes')}
  <div class="card"><h2>Money to-do list</h2>
    <div class="row" style="gap:8px"><input id="todoText" placeholder="Add a task or goal…" style="flex:1">
      <button class="btn primary" data-action="addTodo">Add</button></div>
    <div id="todoList" style="margin-top:8px">${todoListHTML()}</div>
  </div>
  <div class="card"><div class="row"><h2 style="margin:0">Notes</h2><button class="link" data-action="addNote">＋ New note</button></div>
    <div id="noteList">${noteListHTML()}</div>
  </div>`;
}

function syncLabel() {
  if (!S.settings.linked || !linkConfigured()) return '';
  if (ui.syncing) return '↻ syncing…';
  if (syncError) return '! sync problem · tap to retry';
  if (!S.lastSync) return '';
  const d = new Date(S.lastSync), same = d.toDateString() === new Date().toDateString();
  return '↻ ' + (same ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : fmtShort(S.lastSync));
}
const paintSync = () => { const el = $('syncStat'); if (el) el.textContent = syncLabel(); else if (ui.tab !== 'settings' && syncLabel()) renderWhenIdle(); };

/* Syncs by itself: when the app opens, when you come back to it, when the phone gets internet again, and every few minutes while it's open. */
let lastAuto = 0, autoBusy = false;
async function autoSync(force) {
  if (autoBusy || !linkConfigured()) return;
  if (!force && Date.now() - lastAuto < 30000) return;
  autoBusy = true; lastAuto = Date.now();
  try {
    if (!S.settings.linked) {                        // a bank may already be linked on your server
      const st = await linkApi('/status'); ui.linkItems = st.items || [];
      if (!ui.linkItems.length) return;
      S.settings.linked = true; save();
    }
    ui.syncing = true; paintSync();
    await syncLinked();
  } catch (e) { syncError = e.message || String(e); }
  finally { ui.syncing = false; autoBusy = false; renderWhenIdle(); }
}

/* Don't rebuild the screen while you're typing in a box. */
function renderWhenIdle(tries) {
  const el = document.activeElement, typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if (typing && (tries || 0) < 20) { setTimeout(() => renderWhenIdle((tries || 0) + 1), 1500); return; }
  render();
}

function topbar() {
  const nm = (S.settings.name || '').trim();
  const handle = (nm.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'you') + '@pocketledger';
  return `<div class="topbar"><span class="prompt">${esc(handle)}${syncLabel() ? `<button class="syncstat" id="syncStat" data-action="syncTop">${esc(syncLabel())}</button>` : ''}</span>
    <button class="profile" data-action="openSettings" aria-label="Profile and settings">${nm ? '<b>' + esc(nm[0].toUpperCase()) + '</b>' : emo('👤')}<span>settings</span></button></div>`;
}

const THEMES = [['auto', 'auto'], ['charcoal', 'charcoal'], ['black', 'black'], ['paper', 'paper']];
const ACCENTS = [['sage', '#a9bea1'], ['terra', '#de9770'], ['amber', '#dcae62'], ['sky', '#8fb4d9'], ['rose', '#d99aa6']];

function linkStatus() {
  if (S.settings.linked) return ['linked', 'b-hi'];
  if (S.useSampleData) return ['sample data', 'b-mid'];
  return ['not linked', 'b-mid'];
}

function settingsView() {
  const st = S.settings, link = getLink();
  const [statusText, statusCls] = linkStatus();
  const standalone = window.navigator.standalone === true;
  return `<div class="row"><button class="link" data-action="closeSettings">‹ back</button></div>
  <h1>Settings</h1>

  <div class="card"><h2>Profile</h2>
    <div class="field"><span>Your name</span><input class="wide" placeholder="optional" value="${esc(st.name)}" data-change="profileName" autocomplete="off" style="text-align:right"></div>
    <div class="muted small">Shown only in the top bar on this phone.</div>
  </div>

  <div class="card"><h2>Appearance</h2>
    <div class="muted small" style="margin-bottom:6px">Theme</div>
    ${seg(THEMES, st.theme, 'setTheme')}
    <div class="muted small" style="margin:12px 0 6px">Accent color</div>
    <div class="swatches">${ACCENTS.map(([k, c]) => `<button class="swatch ${st.accent === k ? 'on' : ''}" data-action="setAccent" data-pot="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')}</div>
    <div class="muted small" style="margin:12px 0 6px">Text size</div>
    ${seg([['1', 'A'], ['1.12', 'A+'], ['1.25', 'A++']], String(st.textSize), 'setSize')}
    <div class="muted small" style="margin:12px 0 6px">Animations</div>
    ${seg([['auto', 'on'], ['off', 'off']], st.motion, 'setMotion')}
  </div>

  <div class="card"><h2>Preferences</h2>
    <div class="field"><span>New purchases come out of</span>${selBtn('defaultPot', '')}</div>
    <div class="field"><span>Backup reminder</span>${selBtn('backupDays', '')}</div>
  </div>

  <div class="card"><h2>Bank accounts</h2>
    <div class="row"><span>Status</span><span class="badge ${statusCls}">${statusText}</span></div>
    ${ui.linkMsg ? `<div class="small" style="margin-top:8px">${esc(ui.linkMsg)}</div>` : ''}
    <div class="day">Your link server</div>
    <div class="stack">
      <input id="linkUrl" placeholder="https://pocketledger-link.your-name.workers.dev" value="${esc(link.url || '')}" data-change="linkUrl" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
      <input id="linkPass" type="password" placeholder="passphrase" value="${esc(link.passphrase || '')}" data-change="linkPass" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">
    </div>
    <div class="muted small" style="margin-top:6px">Stored only on this phone, and left out of backups.</div>
    <div class="btn-row">
      <button class="btn" data-action="checkLink">check connection</button>
      <button class="btn primary" data-action="linkBank">link a bank</button>
      ${S.settings.linked ? '<button class="btn" data-action="syncNow">sync now</button>' : ''}
    </div>
    ${ui.linkItems && ui.linkItems.length ? `<div class="day">Linked</div>${ui.linkItems.map(i => `<div class="row" style="padding:4px 0"><span>${esc(i.institution)}</span><span><button class="link small" data-action="chooseAccts" data-id="${esc(i.item_id)}">choose accounts</button> <button class="link small" data-action="unlinkItem" data-id="${esc(i.item_id)}">unlink</button></span></div>`).join('')}` : ''}
    <div class="field" style="margin-top:8px"><span>Count purchases from</span><input type="date" value="${esc(st.countFrom || '')}" data-change="countFrom" style="width:160px"></div>
    <div class="muted small">Older purchases are kept in Activity as history and never sent to Review, so your pots start clean.</div>
    <div class="day">Good to know</div>
    <div class="muted small info">
      ▸ Read-only: the app can see balances and purchases. It can't move money.<br>
      ▸ You sign in to your bank inside Plaid's window. PocketLedger never sees your bank password.<br>
      ▸ Your Plaid keys and bank access live on your own private server, never in this app or on GitHub.<br>
      ▸ Plaid's free Trial plan allows up to 10 linked connections. Unlink any time.<br>
      ▸ Some banks (Chase, for example) send you to their own site to approve. Do the first link in Safari, not the home-screen app${standalone ? ' (you are in the home-screen app now)' : ''}, then come back here and tap check connection.<br>
      ▸ Setup steps are in <b>server/README.md</b> in your repository.
    </div>
  </div>

  ${backupCard()}

  <div class="card"><h2>This phone</h2>
    <div class="btn-row"><button class="btn" data-action="reloadApp">reload app</button><button class="btn" data-action="clearTx">clear transactions</button></div>
    <div class="btn-row"><button class="btn danger" data-action="eraseAll">erase all data</button></div>
    <div class="muted small" style="margin-top:8px">Clear transactions empties your purchases, pot history and budgets but keeps your settings, income sources, expenses, to-dos and notes. (If a bank is linked, unlink it first, or it won't send those purchases again.) Erase removes everything stored on this phone, not your bank or server. Back up first.</div>
  </div>`;
}

const VIEWS = { ihist: incomeHistoryView, settings: settingsView, home: homeView, pot: potView, activity: activityView, review: reviewView, income: incomeView, budget: budgetView, plan: planView };

/* ---------- modals ---------- */

function sheet(title, inner, doneAction) {
  return `<div class="scrim" data-layer="sheet"><div class="sheet">
    <div class="grab"></div>
    <div class="sheet-head"><b>${title}</b><button class="link" data-action="${doneAction || 'close'}">Done</button></div>
    ${inner}</div></div>`;
}

function seg(options, current, action, extra) {
  return `<div class="seg ${options.length > 3 ? 'many' : ''}">${options.map(([val, label]) =>
    `<button class="${current === val ? 'on' : ''}" data-action="${action}" data-pot="${esc(val)}" ${extra || ''}>${label}</button>`).join('')}</div>`;
}

const potOptions = () => S.pots.map(p => [p.id, emo(p.icon) + ' ' + esc(p.name)]);

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
      ${src ? `<div class="pos">✓ Counted automatically as ${esc(src)}</div>
            <button class="btn full" style="margin-top:8px" data-action="addExtra" data-id="${esc(t.id)}">Count as extra income instead</button>`
        : t.extraIncomeLabel ? `<div class="pos">✓ Extra income: ${esc(t.extraIncomeLabel)} → ${esc(potName(t.extraIncomePot))}</div>
            <button class="btn danger full" style="margin-top:8px" data-action="removeExtra" data-id="${esc(t.id)}">Remove from extra income</button>`
        : `<button class="btn full" data-action="addExtra" data-id="${esc(t.id)}">Count as extra income</button>`}
    </div>`;
  }
  return sheet('Transaction', `
    <div class="card hero">
      <div class="amt-big ${t.amount > 0 ? 'pos' : ''}" ${counted('hero-' + t.id, t.amount)}>${usd(t.amount)}</div>
      <div style="font-weight:700;margin-top:4px">${esc(t.simpleName)}</div>
      <span class="pill" style="color:${c.color};border-color:${c.color}">${emo(c.icon, c.color)} ${c.title}</span>
    </div>
    <div class="card"><h2>Original</h2>
      <div class="field"><span class="muted">Bank description</span><div class="mono" style="max-width:62%">${esc(t.rawName)}</div></div>
      <div class="field"><span class="muted">Date &amp; time</span><div style="text-align:right">${fmtFull(t.date)}</div></div>
      <div class="field"><span class="muted">Account</span><div>${esc(accountName(t.accountID))}</div></div>
    </div>
    <div class="card"><h2>How it was read</h2>
      <div class="field"><span class="muted">Simplified as</span><div style="text-align:right">${esc(t.simpleName)}</div></div>
      <div class="row"><span class="muted">Confidence</span>${badge(t)}</div>
      <div class="bar">${fill('conf-' + t.id, t.userConfirmed ? 100 : bar)}</div>
      <div class="muted small">Low confidence usually means an unfamiliar merchant. Changing the category teaches the app for every transaction from this merchant.</div>
    </div>
    <div class="card"><h2>Category</h2>
      ${selBtn('setcat', t.id, '', 'width:100%')}
      ${c.taxDeductible ? '<div class="muted small" style="margin-top:8px">Counted toward your tax-deductible total.</div>' : ''}
    </div>
    ${pots}`);
}

function addTxModal() {
  const m = ui.modal;
  const buy = m.kind === 'purchase';
  return sheet(buy ? 'Add a purchase' : 'Add a deposit', `
    <div class="card stack">
      ${seg([['purchase', 'Purchase'], ['deposit', 'Deposit']], m.kind, 'txKind')}
      <div class="field"><span>Amount</span><input type="number" inputmode="decimal" step="any" placeholder="0.00" value="${m.amount || ''}" data-change="txAmount" data-live="1" style="width:130px"></div>
      <input placeholder="${buy ? 'Where? (e.g. Kroger, gas, coffee)' : 'From? (e.g. payroll, tips)'}" value="${esc(m.name)}" data-change="txName" data-live="1">
      ${buy ? `<div class="muted small">Deduct from…</div>${seg([...potOptions(), ['none', 'Decide later']], m.pot, 'txPot')}` : '<div class="muted small">Deposits whose text matches an income source are counted automatically.</div>'}
    </div>
    <button class="btn primary full" data-action="saveTx">Add ${buy ? 'purchase' : 'deposit'}</button>`);
}

function extraModal() {
  const m = ui.modal;
  const cands = S.transactions.filter(t => t.amount > 0 && !t.extraIncomeLabel);   // includes job deposits
  const chosen = m.selected && txById(m.selected);
  const labels = ['Tips', 'Gift', 'Refund', 'Side gig', 'Other'];
  return sheet('Extra income', `
    <div class="card"><h2>Pick a deposit from your history</h2>
      ${cands.length ? cands.map(t => txRow(t, incomeTag(t), { action: 'pickExtra', check: m.selected === t.id })).join('') : '<div class="muted">No deposits yet.</div>'}
      ${chosen && chosen.incomeSourceID ? `<div class="muted small" style="margin-top:8px">This deposit currently counts as ${esc(sourceName(chosen.incomeSourceID))}. Making it extra income moves it out of that job's budget earnings and into the pot you pick below.</div>` : ''}
    </div>
    <div class="card"><h2>What was it?</h2>
      ${selBtn('extraLabel', '', '', 'width:100%')}
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
      <div class="field"><span>Icon</span>${selBtn('potIcon', '', '', 'width:90px')}</div>
      <div class="field"><span>${existing ? 'Balance' : 'Starting balance'}</span>${numInput(f.balance, 'data-change="potBalance" data-live="1"')}</div>
      <div class="field"><span>Goal target <span class="muted small">(optional)</span></span>${numInput(f.target || 0, 'data-change="potTarget" data-live="1"')}</div>
      <div class="muted small">Leave the goal target at 0 for a pot without a goal.</div>
    </div>
    <button class="btn primary full" data-action="savePot">${existing ? 'Save changes' : 'Create pot'}</button>
    ${existing && !existing.core ? `<button class="btn danger full" style="margin-top:8px" data-action="deletePot" data-id="${esc(existing.id)}">Delete this pot</button>` : ''}`);
}

function moveModal() {
  const m = ui.modal;
  return sheet('Move money', `
    <div class="card stack">
      <div class="field"><span>From</span>${selBtn('moveFrom', '', '', 'width:190px')}</div>
      <div class="field"><span>To</span>${selBtn('moveTo', '', '', 'width:190px')}</div>
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

/* In-app replacements for the phone's own pop-up menus and alerts. */
function selBtn(field, id, style, w) {
  const d = pickDef(field, id);
  const cur = d && d.options.find(o => o[0] === d.current);
  return `<button class="sel" data-action="openSel" data-field="${field}" data-id="${esc(id)}" style="${[style, w].filter(Boolean).join(';')}">${cur ? cur[1] : '—'} <span class="muted">▾</span></button>`;
}

function pickDef(field, id) {
  const m = ui.modal;
  const pots = () => S.pots.map(p => [p.id, emo(p.icon) + ' ' + esc(p.name)]);
  switch (field) {
    case 'checkMonth': return { title: 'Month', options: checkKeys().map(k => [k, monthLabel(k)]), current: ui.checkMonth };
    case 'roundMode': return { title: 'Round spending', options: [['nearest', 'Nearest dollar'], ['up', 'Round up'], ['off', 'Exact cents']], current: S.roundMode };
    case 'adjTarget': return { title: 'Put it in', options: [...pots(), ['all', 'Split across all pots']], current: ui.adjTarget };
    case 'setcat': { const t = txById(id); return { title: 'Category', options: Object.entries(CATS).map(([k, v]) => [k, emo(v.icon, v.color) + ' ' + v.title]), current: t && t.category }; }
    case 'extraLabel': return { title: 'What was it?', options: ['Tips', 'Gift', 'Refund', 'Side gig', 'Other'].map(l => [l, l]), current: m && m.label };
    case 'potIcon': return { title: 'Icon', grid: true, options: POT_ICONS.map(i => [i, emo(i)]), current: m && m.fields && m.fields.icon };
    case 'moveFrom': return { title: 'Move from', options: pots(), current: m && m.from };
    case 'moveTo': return { title: 'Move to', options: pots(), current: m && m.to };
    case 'defaultPot': return { title: 'New purchases come out of', options: pots(), current: potById(S.settings.defaultPot) ? S.settings.defaultPot : 'spending' };
    case 'backupDays': return { title: 'Backup reminder', options: [['7', 'Every 7 days'], ['14', 'Every 14 days'], ['30', 'Every 30 days'], ['0', 'Off']], current: String(S.settings.backupDays) };
    case 'bulkTarget': {
      const others = S.pots.filter(x => x.id !== ui.potId);
      const cur = ui.bulkTarget && (ui.bulkTarget === 'none' || others.some(o => o.id === ui.bulkTarget)) ? ui.bulkTarget : (others[0] ? others[0].id : 'none');
      return { title: 'Move selected to', options: [...others.map(o => [o.id, 'Move to ' + esc(o.name)]), ['none', 'Back to Review']], current: cur };
    }
  }
  return null;
}

function pickerHTML() {
  const p = ui.picker, d = pickDef(p.field, p.id);
  if (!d) return '';
  return `<div class="scrim" data-layer="picker"><div class="sheet small">
    <div class="grab"></div>
    <div class="sheet-head"><b>${d.title}</b><button class="link" data-action="closePick">Cancel</button></div>
    <div class="${d.grid ? 'optgrid' : 'optlist'}">${d.options.map(([v, l]) =>
      `<button class="opt ${v === d.current ? 'on' : ''}" data-action="choose" data-v="${esc(v)}">${l}${v === d.current && !d.grid ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>
  </div></div>`;
}

function dialogHTML() {
  const d = ui.dialog;
  return `<div class="scrim" data-layer="dialog"><div class="dialog">
    ${d.title ? `<div class="dtitle">${esc(d.title)}</div>` : ''}
    <div class="dmsg">${esc(d.message)}</div>
    ${d.code ? `<textarea readonly rows="5" style="margin-top:8px;font-size:12px">${esc(d.code)}</textarea>` : ''}
    <div class="btn-row">${d.cancel === false ? '' : '<button class="btn" data-action="dlgCancel">cancel</button>'}
      <button class="btn ${d.danger ? 'danger' : 'primary'}" data-action="dlgOk">${esc(d.ok || 'ok')}</button></div>
  </div></div>`;
}

const askConfirm = (message, ok, onOk, danger) => { ui.dialog = { message, ok, onOk, danger }; };
const askAlert = (message, title) => { ui.dialog = { message, title, cancel: false, ok: 'ok' }; };

function modalHTML() {
  const m = ui.modal;
  switch (m.type) {
    case 'tx': return txModal(m.id);
    case 'extra': return extraModal();
    case 'addTx': return addTxModal();
    case 'sources': return sourcesModal();
    case 'potEdit': return potEditModal();
    case 'move': return moveModal();
    case 'note': return noteModal();
  }
  return '';
}

/* ---------- render ---------- */

const TABS = [['review', '📥', 'Review'], ['home', '🏠', 'Home'], ['activity', '📋', 'Activity'], ['income', '💵', 'Income'], ['budget', '📊', 'Budget'], ['plan', '✅', 'To-do']];

const ghostRoot = document.createElement('div');
ghostRoot.id = 'ghost-root';
document.body.appendChild(ghostRoot);

let lastTab = null;
const tabIndex = k => Math.max(TABS.findIndex(t => t[0] === (k === 'pot' ? 'home' : k === 'ihist' ? 'income' : k)), 0);

function render() {
  const y = window.scrollY;
  const oldSheet = modalRoot.querySelector('.sheet');
  const sheetY = oldSheet ? oldSheet.scrollTop : 0;
  const tabChanged = ui.tab !== lastTab;

  app.classList.remove('enter');
  app.innerHTML = (ui.tab === 'settings' ? '' : topbar()) + VIEWS[ui.tab]();
  if (tabChanged) {
    app.style.setProperty('--dx', (lastTab === null || tabIndex(ui.tab) >= tabIndex(lastTab) ? 1 : -1) * 18 + 'px');
    app.classList.add('enter');
  }
  // remember what the live-patched areas currently show (see setHTMLIfChanged)
  if ($('disc-box')) $('disc-box').__html = discHTML(discrepancy(ui.checkMonth, ui.actual));
  if ($('actList')) $('actList').__html = activityListHTML();
  const n = pending().length;
  const active = ui.tab === 'pot' ? 'home' : ui.tab === 'ihist' ? 'income' : ui.tab;
  tabbar.innerHTML = TABS.map(([k, icon, label]) =>
    `<button class="${active === k ? 'on' : ''}${active === k && tabChanged ? ' pop' : ''}" data-action="tab" data-tab="${k}"><span class="i">${emo(icon, active === k ? SAGE : DIM)}</span>${label}${k === 'review' && n ? `<span class="pip">${n}</span>` : ''}</button>`).join('');

  // pop-ups: slide/pop in when they appear, slide/pop out when they go
  const now = [ui.modal && 'sheet', ui.picker && 'picker', ui.dialog && 'dialog'].filter(Boolean);
  const before = [...modalRoot.children].filter(el => el.dataset && el.dataset.layer);
  const beforeNames = before.map(el => el.dataset.layer);
  before.forEach(el => {
    if (!now.includes(el.dataset.layer) && !ui.skipGhost[el.dataset.layer]) {
      const g = el.cloneNode(true);
      g.classList.add('out');
      ghostRoot.appendChild(g);
      setTimeout(() => g.remove(), 380);
    }
  });
  ui.skipGhost = {};
  modalRoot.innerHTML = (ui.modal ? modalHTML() : '') + (ui.picker ? pickerHTML() : '') + (ui.dialog ? dialogHTML() : '');
  [...modalRoot.children].forEach(el => { if (!beforeNames.includes(el.dataset.layer)) el.classList.add('in'); });
  syncHistory();
  document.body.style.overflow = now.length ? 'hidden' : '';

  window.scrollTo(0, ui.resetScroll ? 0 : y);
  ui.resetScroll = false;
  const newSheet = modalRoot.querySelector('.sheet');
  if (newSheet && oldSheet) newSheet.scrollTop = sheetY;

  animateUI(tabChanged || (ui.modal && !beforeNames.includes('sheet')));
  lastTab = ui.tab;
}

/* Progress bars ramp from where they were; money counts up or down to its new value. */
const barState = {}, numState = {};
let animToken = 0;
function animateUI(entering) {
  const token = ++animToken;
  const reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || S.settings.motion === 'off';

  const bars = [...document.querySelectorAll('[data-bar]')];
  bars.forEach(el => {
    const k = el.dataset.bar, w = +el.dataset.w;
    const from = reduce ? w : (barState[k] != null ? barState[k] : 0);
    barState[k] = w;
    el.style.transition = 'none';
    el.style.width = from + '%';
  });
  void document.body.offsetWidth;
  bars.forEach(el => { el.style.transition = ''; el.style.width = el.dataset.w + '%'; });

  const jobs = [];
  document.querySelectorAll('[data-count]').forEach(el => {
    const k = el.dataset.count, to = +el.dataset.val;
    let from = numState[k];
    if (from == null) from = entering ? 0 : to;
    if (reduce) from = to;
    numState[k] = from;
    if (Math.abs(from - to) > 0.004) { jobs.push({ el, k, from, to }); el.textContent = usd(from); }
    else numState[k] = to;
  });
  if (!jobs.length) return;
  const t0 = performance.now(), D = 700;
  const step = t => {
    if (token !== animToken) return;
    const p = Math.min((t - t0) / D, 1), e = 1 - Math.pow(1 - p, 3);
    jobs.forEach(j => { const v = j.from + (j.to - j.from) * e; numState[j.k] = p === 1 ? j.to : v; j.el.textContent = usd(p === 1 ? j.to : v); });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

const BACKUP_HEADER = 'PocketLedger backup. Keep this email private; it contains your financial data.\nTo restore: Budget tab > Backup & restore > paste this whole email > Restore from code.\n\n';

async function shareCode() {
  const code = await encodeBackup();
  const text = BACKUP_HEADER + code.replace(/(.{64})/g, '$1\n');
  try {
    if (navigator.share) {
      await navigator.share({ title: 'PocketLedger backup ' + new Date().toISOString().slice(0, 10), text });
      S.lastExport = new Date().toISOString(); save(); render();
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  await copyCode();
}

async function copyCode() {
  const code = await encodeBackup();
  try {
    await navigator.clipboard.writeText(code);
    S.lastExport = new Date().toISOString(); save();
    askAlert('Backup code copied. Paste it into an email or note to yourself.');
  } catch (e) {
    ui.dialog = { title: 'Copy this backup code', message: 'Press and hold in the box, choose Select All, then Copy.', code, cancel: false, ok: 'done' };
  }
  render();
}

async function restoreCode() {
  const box = $('restoreText');
  try {
    const obj = await decodeBackup(box ? box.value : '');
    askConfirm('Replace everything on this phone with this backup?', 'restore', () => {
      replaceState(obj); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {}; ui.actual = null;
      askAlert('Backup restored.');
    }, true);
  } catch (e) {
    askAlert('That code could not be read: ' + (e.message || 'unknown problem') + '. Paste the whole code, including PL1: at the start and ~ at the end.');
  }
  render();
}

/* Reads a backup but takes only the to-do list and notes; nothing else on this phone changes. Anything already here is kept. */
async function restoreNotesOnly() {
  const box = $('restoreText');
  try {
    const obj = await decodeBackup(box ? box.value : '');
    let nt = 0, nn = 0;
    const haveT = new Set(S.todos.map(t => t.id + '|' + t.text)), haveN = new Set(S.notes.map(n => n.id + '|' + n.title + '|' + n.body));
    for (const t of obj.todos || []) if (!haveT.has(t.id + '|' + t.text)) { S.todos.push(t); nt++; }
    for (const n of obj.notes || []) if (!haveN.has(n.id + '|' + n.title + '|' + n.body)) { S.notes.push(n); nn++; }
    S.notes.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    save();
    if (box) box.value = '';
    askAlert(nt + nn ? 'Brought back ' + nt + ' to-do' + (nt === 1 ? '' : 's') + ' and ' + nn + ' note' + (nn === 1 ? '' : 's') + '. Nothing else was changed.' : 'That backup had no notes or to-dos that are missing here.');
  } catch (e) {
    askAlert('That code could not be read: ' + (e.message || 'unknown problem') + '. Paste the whole code, including PL1: at the start and ~ at the end.');
  }
  render();
}

/* ---------- linking ---------- */

async function checkLink() {
  ui.linkMsg = 'Checking…'; render();
  try {
    const st = await linkApi('/status');
    ui.linkItems = st.items || [];
    if (!ui.linkItems.length) {
      S.settings.linked = false; save();
      ui.linkMsg = 'Connected to your server. No bank is linked yet, so tap link a bank.';
    } else {
      ui.linkMsg = 'Connected. ' + ui.linkItems.length + (ui.linkItems.length === 1 ? ' bank' : ' banks') + ' linked.';
      if (S.useSampleData) {
        askConfirm('Your server has a linked bank. Clear the sample data and bring in your real accounts?', 'clear & sync', async () => {
          startFresh(); S.settings.linked = true; save();
          ui.linkMsg = 'Syncing…'; render();
          await doSync(); ui.linkMsg = syncError || ('Synced. ' + syncInfo); render();
        });
      } else if (!S.settings.linked) {
        S.settings.linked = true; save();
        doSync().then(() => { ui.linkMsg = syncError || ('Synced. ' + syncInfo); render(); });
      }
    }
  } catch (e) { ui.linkMsg = e.message; }
  render();
}

function loadPlaid() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the bank window from Plaid. Check your connection.'));
    document.head.appendChild(s);
  });
}

const PLAID_TOKEN_KEY = 'pocketledger.linktoken';
function plaidHandlers(update) {
  return {
    onSuccess: async (publicToken, meta) => {
      ui.linkMsg = 'Saving…'; render();
      try {
        if (!update) await linkApi('/exchange', { public_token: publicToken, institution: meta && meta.institution && meta.institution.name });
        try { localStorage.removeItem(PLAID_TOKEN_KEY); } catch (e) { /* ignore */ }
        S.settings.linked = true;
        if (!S.settings.countFrom) S.settings.countFrom = firstOfMonthISO();
        save();
        ui.linkMsg = 'Linked. Fetching your transactions…'; render();
        await doSync();
        const st = await linkApi('/status').catch(() => null);
        if (st) ui.linkItems = st.items;
        ui.linkMsg = syncError ? syncError : 'Linked. ' + syncInfo;
      } catch (e) { ui.linkMsg = e.message; }
      ui.tab = 'settings'; render();
    },
    onExit: err => { if (err) ui.linkMsg = err.display_message || err.error_message || 'Linking stopped.'; else ui.linkMsg = 'Linking cancelled.'; render(); },
  };
}

async function openPlaid(itemId) {
  ui.linkMsg = 'Opening the bank window…'; render();
  try {
    const r = await linkApi('/link-token', itemId ? { item_id: itemId } : {});
    try { localStorage.setItem(PLAID_TOKEN_KEY, r.link_token); } catch (e) { /* ignore */ }
    await loadPlaid();
    Plaid.create(Object.assign({ token: r.link_token }, plaidHandlers(!!itemId))).open();
  } catch (e) { ui.linkMsg = e.message; render(); }
}

/* Banks that use OAuth send you back here with ?oauth_state_id=…; pick the flow up where it left off. */
async function resumePlaid() {
  let token = null;
  try { token = localStorage.getItem(PLAID_TOKEN_KEY); } catch (e) { /* ignore */ }
  if (!token) return;
  ui.tab = 'settings'; ui.linkMsg = 'Finishing your bank link…'; render();
  try {
    await loadPlaid();
    Plaid.create(Object.assign({ token, receivedRedirectUri: location.href }, plaidHandlers())).open();
  } catch (e) { ui.linkMsg = e.message; render(); }
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

  // settings
  openSettings: () => {
    if (ui.tab !== 'settings') ui.prevTab = ui.tab; ui.tab = 'settings'; ui.resetScroll = true;
    if (linkConfigured() && !ui.linkItems) linkApi('/status').then(st => { ui.linkItems = st.items || []; if (ui.tab === 'settings') renderWhenIdle(); }).catch(() => {});
  },
  closeSettings: () => { ui.tab = ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'review'; ui.resetScroll = true; },
  setTheme: d => { S.settings.theme = d.pot; save(); applySettings(); },
  setAccent: d => { S.settings.accent = d.pot; save(); applySettings(); },
  setSize: d => { S.settings.textSize = +d.pot; save(); applySettings(); },
  setMotion: d => { S.settings.motion = d.pot; save(); applySettings(); },
  reloadApp: () => { location.reload(); return false; },
  clearTx: () => askConfirm('Remove all transactions and pot history, and set every pot to $0? Your settings, income sources, expenses, to-dos and notes stay.', 'clear', () => {
    startFresh(); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {}; ui.linkMsg = 'Transactions cleared.';
  }, true),
  eraseAll: () => askConfirm('Erase everything stored on this phone? Back up first. This cannot be undone.', 'erase', () => {
    eraseEverything(); setLink({}); ui.linkItems = null; ui.linkMsg = ''; ui.tab = 'review'; applySettings(); doSync();
  }, true),
  checkLink: () => { checkLink(); return false; },
  linkBank: () => {
    if (S.useSampleData) askConfirm('Linking real accounts clears the sample data first. Continue?', 'continue', () => { startFresh(); openPlaid(); });
    else { openPlaid(); return false; }
  },
  openHist: () => { ui.tab = 'ihist'; ui.resetScroll = true; ui.xref = null; },
  pickHist: () => { const f = $('histFile'); if (f) f.click(); return false; },
  importHist: () => {
    const box = $('histText');
    try {
      const r = importIncomeHistory(box ? box.value : '');
      ui.xref = null;
      askAlert('Read ' + r.added + ' payments from ' + r.years.join(', ') + '.' + (r.skipped ? ' ' + r.skipped + ' lines were skipped because they had no month or amount.' : ''));
    } catch (e) { askAlert(e.message); }
  },
  crossRef: () => { ui.xref = crossReference(false); },
  applyXref: () => { const r = crossReference(true); ui.xref = crossReference(false); askAlert('Counted ' + r.newlyMatched + ' deposit' + (r.newlyMatched === 1 ? '' : 's') + ' and learned the bank text. Check your sources on the Income tab.'); },
  setupSources: () => {
    const todo = incomeSummary().filter(o => o.recent && o.kind !== 'one-off' && !S.incomeSources.some(x => x.name.toLowerCase() === o.name.toLowerCase()));
    askConfirm('Add these as income sources?\n' + todo.map(o => '• ' + o.name + (o.kind === 'regular' ? ' — about ' + usd(Math.round(o.monthlyAvg)) + ' a month' : ' — varies, added by hand')).join('\n'), 'add them', () => {
      const made = applyIncomeSuggestions(); askAlert('Added: ' + made.join(', ') + '. Fine-tune amounts under Income → Edit income sources.');
    });
  },
  clearHist: () => askConfirm('Remove your income history from this phone? Your income sources and deposits stay.', 'remove', () => { S.incomeHistory = []; ui.xref = null; save(); }, true),
  chooseAccts: d => { openPlaid(d.id); return false; },
  syncTop: () => { autoSync(true); return false; },
  toggleAcct: d => { ui.openAcct[d.id] = !ui.openAcct[d.id]; },
  acctActivity: d => { ui.afilter = d.id; ui.tab = 'activity'; ui.resetScroll = true; ui.filter = null; ui.search = ''; },
  clearAfilter: () => { ui.afilter = null; },
  syncNow: () => { ui.linkMsg = 'Syncing…'; doSync().then(() => { ui.linkMsg = syncError ? syncError : 'Synced. ' + syncInfo; render(); }); },
  unlinkItem: d => askConfirm('Unlink this bank? Your history in the app stays; no new purchases will arrive.', 'unlink', async () => {
    try {
      await linkApi('/unlink', { item_id: d.id });
      const st = await linkApi('/status'); ui.linkItems = st.items;
      if (!st.items.length) S.settings.linked = false;
      save(); ui.linkMsg = 'Unlinked.';
    } catch (e) { ui.linkMsg = e.message; }
    render();
  }, true),

  // in-app pickers and dialogs
  openSel: d => { ui.picker = { field: d.field, id: d.id }; },
  closePick: () => { ui.picker = null; },
  choose: d => { const p = ui.picker; ui.picker = null; if (p) handleField({ dataset: { change: p.field, id: p.id }, type: 'select', value: d.v }, true); },
  dlgCancel: () => { ui.dialog = null; },
  dlgOk: () => { const f = ui.dialog && ui.dialog.onOk; ui.dialog = null; if (f) f(); },

  // pots
  racct: d => { ui.racct = d.id; },
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
    askConfirm('Delete this pot? Purchases sorted into it go back to Review, and its history is removed.', 'delete', () => {
      deletePot(d.id); ui.modal = null; ui.tab = 'home';
    }, true);
  },
  moveMoney: d => {
    const to = S.pots.find(p => p.id !== d.id);
    ui.modal = { type: 'move', from: d.id, to: to ? to.id : d.id, amount: 0 };
  },
  doMove: () => {
    const m = ui.modal;
    if (!moveMoney(m.from, m.to, m.amount)) { askAlert('Pick two different pots and an amount above $0.'); return; }
    ui.modal = null;
  },
  undoLog: d => undoLog(d.id),
  toggleSelectMode: () => { ui.selectMode = !ui.selectMode; ui.selected = {}; },
  toggleSel: d => { if (ui.selected[d.id]) delete ui.selected[d.id]; else ui.selected[d.id] = true; },
  bulkMove: () => {
    const target = pickDef('bulkTarget', '').current;
    Object.keys(ui.selected).forEach(id => assign(id, target === 'none' ? null : target));
    ui.selected = {}; ui.selectMode = false;
  },

  // adding by hand
  addTx: () => { ui.modal = { type: 'addTx', kind: 'purchase', amount: 0, name: '', pot: potById(S.settings.defaultPot) ? S.settings.defaultPot : 'spending' }; },
  txKind: d => { ui.modal.kind = d.pot; },
  txPot: d => { ui.modal.pot = d.pot; },
  saveTx: () => {
    const m = ui.modal;
    if (!addManualTx(m.kind, m.amount, m.name, m.kind === 'purchase' && m.pot !== 'none' ? m.pot : null)) { askAlert('Enter an amount above $0 and a name.'); return; }
    ui.modal = null;
  },
  startFresh: () => {
    askConfirm('Remove the sample transactions and start with empty pots? Your income sources, expenses, to-dos and notes stay.', 'start fresh', () => {
      startFresh(); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {};
    }, true);
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
  editEarn: d => { const r = budgetCalc().rows.find(x => x.sourceId === d.id); delete ui.resetEarn[d.id]; ui.budgetInputs[d.id] = r ? r.amount : 0; },
  resetEarn: d => { delete ui.budgetInputs[d.id]; ui.resetEarn[d.id] = true; },
  applyBudget: () => { applyBudget(budgetCalc().rows); ui.budgetInputs = {}; ui.resetEarn = {}; },
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
  delNote: d => askConfirm('Delete this note?', 'delete', () => { deleteNote(d.id); ui.modal = null; }, true),

  // backup
  export: () => { exportData(); return false; },
  shareCode: () => { shareCode(); return false; },
  copyCode: () => { copyCode(); return false; },
  restoreCode: () => { restoreCode(); return false; },
  restoreNotes: () => { restoreNotesOnly(); return false; },
  import: () => { const f = $('importFile'); if (f) f.click(); return false; },
};

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('scrim')) {
    const layer = e.target.dataset.layer;
    if (layer === 'dialog') ui.dialog = null; else if (layer === 'picker') ui.picker = null; else closeModal();
    render(); return;
  }
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
    case 'rsearch':
      ui.rsearch = v;
      setHTMLIfChanged($('rvList'), reviewListHTML());
      return;
    case 'psearch':
      ui.psearch = v;
      setHTMLIfChanged($('todoList'), todoListHTML());
      setHTMLIfChanged($('noteList'), noteListHTML());
      return;
    // budget
    case 'earnInput': ui.budgetInputs[d.id] = num(v); patchBudget(); return;
    case 'savePct': S.savingsPercent = Math.min(Math.max(num(v), 0), 100); save(); patchBudget(); return;
    case 'fixedName': { const e = find(S.fixedExpenses); if (e) { e.name = v; save(); } return; }
    case 'fixedAmt': { const e = find(S.fixedExpenses); if (e) { e.amount = num(v); save(); patchBudget(); } return; }
    case 'roundMode': S.roundMode = v; save(); return;
    case 'checkMonth': if (final) { ui.checkMonth = v; ui.actual = null; render(); } return;
    case 'actual': ui.actual = v === '' ? null : num(v); patchCheck(); return;
    case 'adjTarget': ui.adjTarget = v; return;
    case 'bulkTarget': ui.bulkTarget = v; return;
    case 'defaultPot': S.settings.defaultPot = v; save(); return;
    case 'backupDays': S.settings.backupDays = +v; save(); return;
    case 'profileName': S.settings.name = v.trim().slice(0, 30); save(); if (final) render(); return;
    case 'countFrom': S.settings.countFrom = v || null; save(); return;
    case 'linkUrl': setLink(Object.assign(getLink(), { url: v.trim() })); return;
    case 'linkPass': setLink(Object.assign(getLink(), { passphrase: v.trim() })); return;
    // income sources
    case 'srcName': { const s = find(S.incomeSources); if (s) { s.name = v; save(); } return; }
    case 'srcAmt': { const s = find(S.incomeSources); if (s) { s.expectedAmount = num(v); save(); } return; }
    case 'srcKey': { const s = find(S.incomeSources); if (s) { s.matchKeyword = v.toUpperCase(); save(); } return; }
    case 'srcVar': { const s = find(S.incomeSources); if (s) { s.variable = v; if (v) s.expectedAmount = 0; save(); render(); } return; }
    // categories & extra income
    case 'setcat': if (final) { setCategory(d.id, v); render(); } return;
    case 'extraLabel': m.label = v; return;
    case 'txAmount': m.amount = num(v); return;
    case 'txName': m.name = v; return;
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
    case 'histFiles':
      if (final && el.files && el.files.length) {
        Promise.all([...el.files].map(f => f.text())).then(texts => {
          try { const r = importIncomeHistory(texts.join('\n')); ui.xref = null; askAlert('Read ' + r.added + ' payments from ' + r.years.join(', ') + '.'); }
          catch (err) { askAlert(err.message); }
          render();
        });
      }
      return;
    case 'import':
      if (final && el.files && el.files[0]) {
        el.files[0].text().then(text => {
          try {
            const obj = JSON.parse(text);
            askConfirm('Replace everything on this phone with this file?', 'restore', () => { replaceState(obj); ui.budgetInputs = {}; ui.actual = null; }, true);
          } catch (err) { askAlert('That file could not be imported.'); }
          render();
        });
      }
      return;
  }
}

document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.live) handleField(e.target, false); });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.change) handleField(e.target, true); });

/* ---------- start ---------- */

/* Back/forward swipes move between the screens you visited in the app instead of leaving to GitHub. */
const navState = () => ({ pl: 'app', tab: ui.tab, potId: ui.tab === 'pot' ? ui.potId : null });
let popping = false;
function syncHistory() {
  if (popping) return;
  const cur = history.state, n = navState();
  if (!cur || cur.pl !== 'app' || cur.tab !== n.tab || cur.potId !== n.potId) history.pushState(n, '');
}
try { history.replaceState({ pl: 'base' }, ''); history.pushState(navState(), ''); } catch (e) { /* ignore */ }
window.addEventListener('popstate', e => {
  const st = e.state;
  if (!st || st.pl !== 'app' || ui.modal || ui.picker || ui.dialog) {   // the very first entry, or a pop-up is open: stay in the app
    const hadPopup = !!(ui.modal || ui.picker || ui.dialog);
    if (ui.dialog) ui.dialog = null; else if (ui.picker) ui.picker = null; else if (ui.modal) closeModal();
    if (hadPopup) render();
    try { history.pushState(navState(), ''); } catch (err) { /* ignore */ }
    return;
  }
  popping = true;
  ui.tab = st.tab; ui.potId = st.potId; ui.selectMode = false; ui.selected = {}; ui.resetScroll = true;
  render();
  popping = false;
});

function applySettings() {
  const st = S.settings, root = document.documentElement;
  const theme = st.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'charcoal') : st.theme;
  root.dataset.theme = theme; root.dataset.accent = st.accent; root.dataset.motion = st.motion;
  root.style.setProperty('--ts', st.textSize);
  const cs = getComputedStyle(root);
  const read = (n, f) => { const v = cs.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : f; };
  SAGE = read('--sage', SAGE); DIM = read('--fg-dim', DIM);
  Object.keys(tintCache).forEach(k => delete tintCache[k]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = read('--bg', '#1b1a16');
}
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.settings.theme === 'auto') { applySettings(); render(); } }); } catch (e) { /* older browsers */ }

/* Drag a pop-up down to close it. Starts from the handle/header, or from anywhere when scrolled to the top. */
let drag = null;
const layerClose = layer => { if (layer === 'picker') ui.picker = null; else if (layer === 'dialog') ui.dialog = null; else closeModal(); };
document.addEventListener('touchstart', e => {
  const sheet = e.target.closest && e.target.closest('.sheet');
  if (!sheet || e.touches.length !== 1 || e.target.closest('input, textarea')) { drag = null; return; }
  const fromHead = !!e.target.closest('.grab, .sheet-head');
  if (!fromHead && sheet.scrollTop > 0) { drag = null; return; }
  drag = { sheet, scrim: sheet.parentElement, layer: sheet.parentElement.dataset.layer, y0: e.touches[0].clientY, t0: performance.now(), dy: 0, active: false, fromHead };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!drag) return;
  const dy = e.touches[0].clientY - drag.y0;
  if (!drag.active) {
    if (dy > 8 && (drag.fromHead || drag.sheet.scrollTop <= 0)) { drag.active = true; drag.sheet.style.transition = 'none'; drag.scrim.style.transition = 'none'; }
    else { if (dy < -8) drag = null; return; }
  }
  if (e.cancelable) e.preventDefault();
  drag.dy = Math.max(dy, 0);
  drag.sheet.style.transform = `translateY(${drag.dy}px)`;
  drag.scrim.style.background = `rgba(8, 8, 6, ${(0.7 * (1 - Math.min(drag.dy / drag.sheet.offsetHeight, 1))).toFixed(3)})`;
}, { passive: false });
function endDrag() {
  if (!drag) return;
  const g = drag; drag = null;
  if (!g.active) return;
  const v = g.dy / Math.max(performance.now() - g.t0, 1);
  if (g.dy > Math.min(130, g.sheet.offsetHeight * 0.3) || v > 0.7) {
    g.sheet.style.transition = 'transform .22s cubic-bezier(.4, 0, 1, 1)';
    g.sheet.style.transform = 'translateY(100%)';
    g.scrim.style.transition = 'background .22s';
    g.scrim.style.background = 'rgba(8, 8, 6, 0)';
    setTimeout(() => { ui.skipGhost[g.layer] = true; layerClose(g.layer); render(); }, 200);
  } else {
    g.sheet.style.transition = 'transform .4s cubic-bezier(.34, 1.56, .64, 1)';
    g.sheet.style.transform = '';
    g.scrim.style.transition = 'background .3s';
    g.scrim.style.background = '';
    setTimeout(() => { g.sheet.style.transition = ''; g.scrim.style.transition = ''; }, 420);
  }
}
document.addEventListener('touchend', endDrag);
document.addEventListener('touchcancel', endDrag);

// No pinch or double-tap zoom.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());

applySettings();
render();
if (/oauth_state_id=/.test(location.search)) resumePlaid(); else if (linkConfigured()) autoSync(true); else doSync();
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync(); });
window.addEventListener('pageshow', e => { if (e.persisted) autoSync(); });
window.addEventListener('online', () => autoSync(true));
setInterval(() => { if (!document.hidden) autoSync(); }, 5 * 60 * 1000);

// Ask the browser to keep this app's data even when storage is tight.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
