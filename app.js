/* PocketLedger UI. Plain JavaScript, no build step. */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const modalRoot = document.getElementById('modal-root');

const TAB_KEYS = ['review', 'home', 'activity', 'budget'];
const ui = {
  tab: (S.settings && TAB_KEYS.includes(S.settings.startTab)) ? S.settings.startTab : 'review', prevTab: 'review', linkMsg: '', linkItems: null, modal: null, newCat: { title: '', icon: '', deduct: false }, picker: null, dialog: null, skipGhost: {}, bulkTarget: null, filter: null, search: '', rsearch: '', racct: 'all', openAcct: {}, afilter: null, xref: null, syncing: false, resetScroll: false,
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
let SAGE = '#62bcc6', DIM = '#9ab8bc';
let ACC = {};   // the theme's accent colors as hex
const tintCache = {};
function tintFilter(hex) {
  if (tintCache[hex]) return tintCache[hex];
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
  if (dl < 0.04) return (tintCache[hex] = `grayscale(1) brightness(${(0.55 + l * 0.9).toFixed(2)})`);   // gray themes (Mono) keep emoji gray too
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
  const label = tag || (t.pot ? potName(t.pot) : (t.isIgnored ? (t.ignoredWhy || 'Ignored') : ''));
  const check = opts.check === undefined || opts.check === null ? '' : `<div class="check">${opts.check ? '✓' : ''}</div>`;
  return `<div class="tx" data-action="${opts.action || 'open'}" data-id="${esc(t.id)}">
    ${check}
    <div class="ic" style="color:${c.color};border-color:${c.color}55;background:${c.color}14">${emo(c.icon, c.color)}</div>
    <div class="mid">
      <div class="t1">${esc(t.simpleName)}</div>
      <div class="when">${fmtShort(t.date)}</div>
    </div>
    <div class="right">
      <div class="amt ${t.amount > 0 ? 'pos' : ''}">${usd(t.amount)}</div>
      <div class="meta">${label ? esc(label) : ''} ${badge(t)}</div>
      ${RB[t.id] !== undefined ? `<div class="bal">bal ${usd(RB[t.id])}</div>` : ''}
    </div>
  </div>`;
}


/* Collapsible windows: native <details>, remembered between visits. */
const dOpen = (k, def) => { const v = (S.settings.coll || {})[k]; return (v === undefined ? def : v === 'open') ? 'open' : ''; };
const CD = (k, title, def, right, cls) => `<details class="card coll ${cls || ''}" data-k="${k}" ${dOpen(k, def)}><summary><h2>${title}</h2>${right ? `<span class="coll-r">${right}</span>` : ''}</summary><div class="coll-body">`;
const CE = '</div></details>';

let RB = {};
const emptyBox = (title, text) => `<div class="empty"><b>${title}</b>${text}</div>`;
const numInput = (v, attrs, style) => `<input type="number" inputmode="decimal" step="any" value="${r2(v)}" ${style ? `style="${style}"` : ''} ${attrs}>`;

/* ---------- home ---------- */

function potCard(p) {
  const raw = p.target > 0 ? Math.max(p.balance / p.target, 0) : null, pct = raw === null ? null : Math.min(raw, 1);
  return `<div class="card pot" data-action="openPot" data-id="${esc(p.id)}">
    <div class="muted small">${emo(p.icon)} ${esc(p.name)}</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}" ${counted('pot-' + p.id, p.balance)}>${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar">${fill('pot-' + p.id, pct * 100)}</div><div class="muted small">${Math.round(raw * 100)}% of ${usd(p.target)} goal</div>`}
  </div>`;
}

function backupBanner() {
  return backupDue() ? `<div class="card banner"><b>Time for a backup</b>
    <div class="small">${S.lastExport ? daysSinceBackup() + ' days since your last backup.' : 'You haven\'t backed up yet.'} Your data lives only on this device.</div>
    <button class="btn full" style="margin-top:8px" data-action="shareCode">Email myself a backup code</button></div>` : '';
}

const refreshBtn = extra => `<span class="hdr-r"><button class="link" data-action="refresh">${ui.syncing ? 'Syncing…' : 'Refresh'}</button>${extra || ''}</span>`;

function homeView() {
  const now = new Date();
  return `
  <div class="row"><h1>Dashboard</h1>${refreshBtn()}</div>

  ${(() => { const nk = newStatementKey(); return nk ? `<div class="card tappable notice" data-action="openStatement" data-id="${nk}"><div class="row"><b>${emo('📄')} ${esc(monthLabel(nk))} statement is ready</b><button class="link" data-action="dismissStatement" data-id="${nk}" aria-label="Dismiss">✕</button></div><div class="muted small">Spending habits, goal progress and every transaction. Tap to open, then save as PDF or share.</div></div>` : ''; })()}
  ${spendMain()}
  <div class="grid2">${S.pots.filter(p => p.id !== 'spending').map(potCard).join('')}<button class="btn dashed addtile" data-action="addPot">＋ Add pot or goal</button></div>

  <div class="grid3" style="margin-top:12px">
    <div class="card tappable" data-action="tab" data-tab="budget"><div class="muted small">Earned</div><div class="stat pos" ${counted('earned', totalEarnings(now))}>${usd(totalEarnings(now))}</div></div>
    <div class="card tappable" data-action="openPot" data-id="spending"><div class="muted small">Spent</div><div class="stat" ${counted('spent', spentIn(now))}>${usd(spentIn(now))}</div></div>
    <div class="card tappable" data-action="openDeduct"><div class="muted small">Deductible</div><div class="stat" style="color:var(--sage)" ${counted('deduct', taxDeductibleTotal(now.getFullYear()))}>${usd(taxDeductibleTotal(now.getFullYear()))}</div></div>
  </div>


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
      ${all.length > 8 ? `<button class="link small" data-action="acctActivity" data-id="${esc(a.id)}">see all ${all.length} in Activity</button>` : ''}
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
  const all = potEntries(p.id), entries = all.filter(e => e.kind !== 'round');   // rounding still counts in the totals, it just isn't listed
  const ins = entries.filter(e => e.amount > 0);
  const outs = entries.filter(e => e.amount < 0);
  const sum = list => r2(list.reduce((a, e) => a + e.amount, 0));
  const sumAll = f => r2(all.filter(f).reduce((a, e) => a + e.amount, 0));
  const raw = p.target > 0 ? Math.max(p.balance / p.target, 0) : null, pct = raw === null ? null : Math.min(raw, 1);
  const nSel = Object.keys(ui.selected).length;
  const others = S.pots.filter(x => x.id !== p.id);

  return `
  <div class="row"><button class="link" data-action="tab" data-tab="home">‹ Dashboard</button>
    <button class="link" data-action="editPot" data-id="${esc(p.id)}">Edit</button></div>
  <h1>${emo(p.icon)} ${esc(p.name)}</h1>

  <div class="card">
    <div class="muted small">Balance</div>
    <div class="big ${p.balance < 0 ? 'neg' : ''}" style="font-size:34px" ${counted('potpage-' + p.id, p.balance)}>${usd(p.balance)}</div>
    ${pct === null ? '' : `<div class="bar">${fill('pot-' + p.id, pct * 100)}</div>
      <div class="muted small">${Math.round(raw * 100)}% of ${usd(p.target)} goal</div>`}
    <div class="btn-row"><button class="btn" data-action="moveMoney" data-id="${esc(p.id)}">Move money</button></div>
  </div>
  ${p.id === 'spending' ? (() => { const L = spendingLevel(); return `<div class="card"><h2>This month</h2>
    <div class="field"><span>Available to spend</span>${numInput(L.available, 'data-change="spendAvail"', 'width:130px')}</div>
    <div class="field"><span class="muted">Spent so far</span><span>${usd(L.spent)}</span></div>
    <div class="muted small">Change the available amount if your starting number is off. Spending left adjusts to match, and you can undo it below.</div></div>`; })() : ''}

  <div class="row" style="margin:14px 4px 6px"><div class="day" style="margin:0">Money in · ${signed(sumAll(e => e.amount > 0))}</div></div>
  <div class="card">${ins.length ? ins.map(potEntryRow).join('') : '<div class="muted">Nothing has come in yet.</div>'}</div>

  <div class="row" style="margin:14px 4px 6px"><div class="day" style="margin:0">Money out · ${signed(sumAll(e => e.amount < 0))}</div>
    ${outs.some(e => e.kind === 'tx') ? `<button class="link small" data-action="toggleSelectMode">${ui.selectMode ? 'Cancel' : 'Select'}</button>` : ''}</div>
  <div class="card">${outs.length ? outs.map(potEntryRow).join('') : '<div class="muted">Nothing has come out yet.</div>'}</div>
  <div class="muted small" style="margin:0 4px">Tap a transaction to edit its category or pot.</div>

  ${ui.selectMode && nSel ? `<div class="selbar"><span><b>${nSel}</b> selected</span>
    ${selBtn('bulkTarget', '', 'flex:1')}
    <button class="btn primary" data-action="bulkMove">Move</button></div>` : ''}`;
}

/* ---------- activity ---------- */

/* Every word typed must match something. Words can be a name, merchant, category, pot, account, amount, or a date/time:
   "kroger", "gas october", "tue", "2:30 pm", "evening", "11/4", "yesterday", "this week", "last month",
   ">50", "<20", "10-40" (amounts), "income", "unsorted", "sorted". */
function txMatches(t, query) {
  let qs = String(query || '').toLowerCase().replace(/\$/g, '').replace(/\b(this|last) (week|month|year)\b/g, '@$1$2').trim();
  const words = qs.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const d = new Date(t.date), now = new Date(), abs = Math.abs(t.amount);
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day0(now) - day0(d)) / 864e5);
  const h = d.getHours();
  const period = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  const weekStart = day0(now); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const sameMonth = (x, y) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const hay = [
    t.rawName, t.simpleName, t.merchant || '', (CATS[t.category] || {}).title || '', t.pot ? potName(t.pot) : '', accountTitle(t.accountID),
    t.isIgnored ? 'ignored not a spend ' + (t.ignoredWhy || '') : '', t.amount > 0 ? 'income deposit' : 'purchase expense spend',
    t.pot || t.isIgnored || t.amount > 0 ? 'sorted' : 'unsorted pending review',
    abs.toFixed(2), String(Math.round(abs)),
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short' }), d.toLocaleDateString('en-US'), d.toISOString().slice(0, 10),
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), period,
  ].join(' ').toLowerCase();
  return words.every(w => {
    let m;
    if (w === 'today') return days === 0;
    if (w === 'yesterday') return days === 1;
    if (w === '@thisweek') return day0(d) >= weekStart;
    if (w === '@lastweek') { const s = new Date(weekStart); s.setDate(s.getDate() - 7); return day0(d) >= s && day0(d) < weekStart; }
    if (w === '@thismonth') return sameMonth(d, now);
    if (w === '@lastmonth') return sameMonth(d, lastMonth);
    if (w === '@thisyear') return d.getFullYear() === now.getFullYear();
    if (w === '@lastyear') return d.getFullYear() === now.getFullYear() - 1;
    if ((m = w.match(/^(>=|<=|>|<)(\d+(?:\.\d+)?)$/))) { const n = +m[2]; return m[1] === '>' ? abs > n : m[1] === '<' ? abs < n : m[1] === '>=' ? abs >= n : abs <= n; }
    if ((m = w.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)) && !/^\d{4}-/.test(w)) return abs >= +m[1] && abs <= +m[2];
    return hay.includes(w);
  });
}
const searchBox = (id, value, change, ph) =>
  `<input id="${id}" type="search" placeholder="${ph}" value="${esc(value)}" data-change="${change}" data-live="1" autocapitalize="off" autocorrect="off" spellcheck="false" style="margin-bottom:10px">`;

function activityListHTML() {
  const list = S.transactions.filter(t => (!ui.afilter || t.accountID === ui.afilter) && (!ui.filter || t.category === ui.filter) && txMatches(t, ui.search));
  if (!list.length) return emptyBox('No transactions', 'Try a different search or category.');
  let html = '', lastDay = '', open = false;
  const lim = ui.actLimit || 60;
  for (const t of list.slice(0, lim)) {
    const day = new Date(t.date).toDateString();
    if (day !== lastDay) {
      if (open) html += '</div>';
      html += `<div class="day">${new Date(t.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div><div class="card">`;
      lastDay = day; open = true;
    }
    html += txRow(t, incomeTag(t));
  }
  return html + (open ? '</div>' : '') + (list.length > lim ? `<button class="btn full" data-action="moreAct">show more (${list.length - lim})</button>` : '');
}

function activityView() {
  const chip = (key, label, color, icon) => {
    const on = key === null ? !ui.filter : ui.filter === key;
    return `<button class="chip" data-action="filter" data-cat="${key || ''}"
      style="${on ? `background:${color};color:var(--bg);border-color:${color}` : `color:${color};border-color:${color}55`}">${icon ? (on ? emoDark(icon) : emo(icon, color)) + ' ' : ''}${label}</button>`;
  };
  return `<div class="row"><h1>Activity</h1>${refreshBtn()}</div>
  ${searchBox('search', ui.search, 'search', 'Name, date, time, category, $…')}
  <div class="chips">
    ${chip(null, 'All', SAGE, '')}
    ${Object.entries(CATS).map(([k, c]) => chip(k, c.title, c.color, c.icon)).join('')}
  </div>
  ${ui.afilter ? `<div class="row" style="margin-bottom:8px"><span class="muted small">Showing only ${esc(accountTitle(ui.afilter))}</span><button class="link small" data-action="clearAfilter">show all ✕</button></div>` : ''}
  <div id="actList">${activityListHTML()}</div>`;
}

/* ---------- review ---------- */

/* Spending stays pinned at the top; every other pot and goal is stacked right under it. */
/* Pots take turns being each accent color of the theme. */
const potColorHex = i => ACC[['sky', 'rose', 'terra', 'amber', 'green'][i % 5]] || SAGE;
const potColor = i => `var(--acc-${['sky', 'rose', 'terra', 'amber', 'green'][i % 5].replace('green', 'sage')})`;

function spendMain() {
  const L = spendingLevel(), p = potById('spending');
  const pc = L.pct;
  const color = pc == null ? 'var(--accent)' : pc > 0.5 ? 'var(--accent)' : pc > 0.2 ? 'var(--orange)' : 'var(--red)';
  const main = `<div class="card spendbar" data-action="openPot" data-id="spending">
    <div class="row"><span class="muted small">${emo(p.icon)} ${esc(p.name)} left</span>
      <span class="small muted">${L.available > 0 ? Math.round((pc || 0) * 100) + '% left' : ''}</span></div>
    <div class="row"><div class="big ${L.left < 0 ? 'neg' : ''}" ${counted('spend', L.left)}>${usd(L.left)}</div>
      ${L.available > 0 ? `<div class="muted small" style="text-align:right">of ${usd(L.available)}<br>${usd(L.spent)} spent</div>` : '<div class="muted small" style="text-align:right">Apply this month\'s budget<br>to see your level</div>'}</div>
    ${pc == null ? '' : `<div class="bar thick">${fill('spend', pc * 100, 'background:' + color)}</div>`}
  </div>`;
  return main;
}
function potStrip() {
  const main = spendMain();
  const others = S.pots.filter(x => x.id !== 'spending').map((x, i) => {
    const raw = x.target > 0 ? Math.max(x.balance / x.target, 0) : null, g = raw === null ? null : Math.min(raw, 1);
    return `<div class="card spendbar prow" data-action="openPot" data-id="${esc(x.id)}">
      <div class="pn">${emo(x.icon, potColorHex(i))}<span class="ptxt">${esc(x.name)}</span></div>
      <div class="pa"><b class="${x.balance < 0 ? 'neg' : ''}" ${counted('pot-' + x.id, x.balance)}>${usd(x.balance)}</b>${raw == null ? '' : `<span class="muted small">${Math.round(raw * 100)}%</span>`}</div>
      ${g == null ? '' : `<div class="bar">${fill('pot-' + x.id, g * 100, 'background:' + potColor(i))}</div>`}
    </div>`;
  }).join('');
  return `<div class="stick-ph"></div><div class="stick">${main}${others ? `<div class="prows">${others}</div>` : ''}</div>`;
}

const KIND_LABEL = { checking: 'checking', credit: 'credit card', savings: 'savings', loan: 'loan', investment: 'investment' };
const accountTitle = id => {
  if (id === 'manual') return 'Added by hand';
  const a = accountById(id);
  if (a) return (a.institution ? a.institution + ' · ' : '') + a.name;
  const t = S.transactions.find(x => x.accountID === id && x.acctLabel);
  return t ? t.acctLabel : 'Older account';
};

function assignButtons(t) {
  const first = accountDefaultPot(t.accountID);
  const ordered = [...S.pots.filter(p => p.id === first), ...S.pots.filter(p => p.id !== first)];
  return ordered.map(pot => `<button class="btn ${pot.id === first ? 'pick' : ''}" data-action="assign" data-id="${esc(t.id)}" data-pot="${esc(pot.id)}">${emo(pot.icon)} ${esc(pot.name)}</button>`).join('');
}

function reviewItem(t) {
  return `<div class="rv">
    ${txRow(t)}
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
  return `${groups || (q || only ? '' : '<div class="allclear" aria-label="All sorted">✓</div>')}
  ${rec.length ? `<div class="day">${q || only ? 'Sorted' : 'Recently sorted'}</div><div class="card">${rec.map(t => txRow(t)).join('')}</div>` : ''}`;
}

function reviewChips() {
  const ids = reviewAccounts();
  if (ids.length < 2) return '';
  const chip = (id, label) => `<button class="chip ${((ui.racct || 'all') === id) ? 'on' : ''}" data-action="racct" data-id="${esc(id)}">${esc(label)}</button>`;
  return `<div class="chips" style="margin-bottom:8px">${chip('all', 'All accounts')}${ids.map(id => chip(id, accountTitle(id).replace(/^.*· /, ''))).join('')}</div>`;
}

function reviewView() {
  const q = ui.rsearch.trim();
  return `${potStrip()}
  <div class="row"><h1>Review</h1>${refreshBtn('<button class="link plusbtn" data-action="addTx" aria-label="Add purchase">＋</button>')}</div>
  ${backupBanner()}
  ${S.useSampleData ? `<div class="card banner"><b>You're looking at sample data</b>
    <div class="small">Nothing here is real. When you're ready, clear it and start with your own purchases.</div>
    <button class="btn full" style="margin-top:8px" data-action="startFresh">Clear sample data &amp; start fresh</button></div>` : ''}
  ${searchBox('rsearch', ui.rsearch, 'rsearch', 'Name, date, time, category, $…')}
  ${q ? '' : reviewChips()}
  ${!q && pending().length > 1 ? `<button class="link small" style="margin-bottom:8px" data-action="clearReview">Mark all ${pending().length} sorted</button>` : ''}
  <div id="rvList">${reviewListHTML()}</div>`;
}

/* ---------- income ---------- */

/* ---------- income history ---------- */

const histMonth = i => { const n = MONTH_NAMES[i % 12]; return n[0].toUpperCase() + n.slice(1, 3) + ' ' + Math.floor(i / 12); };

function histImportCard(first) {
  return `<div class="card"><h2>${first ? 'Bring in your money-made lists' : 'Add or update records'}</h2>
    <div class="muted small" style="margin-bottom:8px">Paste the text of your lists (one or several years at once), or choose the files. Lines look like <b>$1,809.24 Employer</b> under a month name, with <b>MONEY MADE 2026</b> above them. Pasting a year again replaces that year, so nothing doubles. This stays on this device and is never part of the app's code.</div>
    <textarea id="histText" rows="6" placeholder="MONEY MADE 2026&#10;OCTOBER&#10;$1,809.24 Employer"></textarea>
    <div class="btn-row"><button class="btn primary" data-action="importHist">Read pasted text</button><button class="btn" data-action="pickHist">Choose files</button></div>
    <input type="file" id="histFile" accept=".txt,text/plain" multiple hidden data-change="histFiles">
  </div>`;
}

const medianOf = a => { const v = a.slice().sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; };

function incomeHistoryView() {
  const back = `<div class="row"><button class="link" data-action="tab" data-tab="budget">‹ budget</button></div>`;
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
      : '<div class="muted small" style="margin-top:8px">Your current income sources are all set up. Edit them any time on the Budget tab.</div>'}
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
  <button class="link small danger" data-action="clearHist">Remove my income history from this device</button>`;
}

/* ---------- budget ---------- */


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

/* "At this rate you reach the goal in …", plus what a few more percent would do, so the link between percent and date is visible. */
function etaHTML(pot, earn, pct) {
  const e = goalEta(pot, earn * pct / 100);
  if (!e) return '';
  if (e.done) return '✓ Goal already reached';
  if (e.never) return 'Set a percent to see when you would reach ' + usd(pot.target);
  const mo = n => n + (n === 1 ? ' month' : ' months');
  let s = 'At this rate: <b>' + e.label + '</b> (' + mo(e.months) + ')';
  if (earn > 0 && pct < 100) {
    const more = goalEta(pot, earn * (pct + 5) / 100);
    if (more && more.months < e.months) s += '<br>' + (pct + 5) + '%: ' + more.label + ' (' + mo(e.months - more.months) + ' sooner)';
  }
  return s;
}

const totalBreak = c => 'Bills ' + usd(c.fixed) + ' + savings ' + usd(c.save) + (c.potSum ? ' + pots ' + usd(c.potSum) : '');
function budgetCalc() {
  const rows = earningAmounts();
  const earn = r2(rows.reduce((a, r) => a + r.amount, 0));
  const fixed = r2(fixedTotal());
  const pct = S.savingsPercent || 0;
  const save = r2(earn * pct / 100);
  const shares = S.pots.filter(p => !p.core).map(p => ({ id: p.id, amount: r2(earn * (p.percent || 0) / 100) }));
  const potSum = r2(shares.reduce((x, y) => x + y.amount, 0));
  return { rows, earn, fixed, pct, save, shares, potSum, total: r2(fixed + save + potSum), left: r2(earn - fixed - save - shares.reduce((a, x) => a + x.amount, 0)) };
}

function discHTML(d) {
  if (Math.abs(d) < 0.005) return '<div class="pos" style="padding:6px 0"><b>✓ Everything lines up</b></div>';
  return `<div style="padding:6px 0">${d > 0 ? 'You have' : "You're missing"} <b class="${d > 0 ? 'pos' : 'neg'}">${usd(Math.abs(d))}</b> ${d > 0 ? 'extra' : 'compared to your pots'}.</div>
    <button class="btn primary full" data-action="redistribute">${d > 0 ? 'Add' : 'Take'} ${usd(Math.abs(d))} ${d > 0 ? 'to' : 'from'} the pot below</button>`;
}

const checkKeys = () => [...new Set([monthKey(new Date()), ...S.budgetRuns.map(r => r.monthKey)])].sort().reverse();

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
    ${line('Expenses', '− ' + usd(run.fixedTotal))}
    ${run.savingsAmount ? line('Savings (' + run.savingsPercent + '%)', '− ' + usd(run.savingsAmount) + ' → Savings') : ''}
    ${(run.potShares || []).map(x => line(esc(x.name) + ' (' + x.percent + '%)', '− ' + usd(x.amount) + ' → ' + esc(x.name))).join('')}
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
  return `${CD('b-hist', 'Budget history', false)}
    ${S.budgetRuns.map(r => {
      const open = !!ui.openRuns[r.monthKey];
      return `<div class="hist">
        <div class="row hist-head" data-action="toggleRun" data-key="${r.monthKey}">
          <b>${monthLabel(r.monthKey)}</b>
          <span><b class="${r.leftover < 0 ? 'neg' : 'pos'}">${signed(r.leftover)}</b> <span class="muted">${open ? '▾' : '▸'}</span></span>
        </div>
        ${open ? historyDetail(r) : ''}
      </div>`;
    }).join('')}${CE}`;
}

function budgetView() {
  const now = new Date();
  const run = runFor(now);
  const c = budgetCalc();
  const extra = countedIncome(now).filter(t => t.extraIncomeLabel);
    const total = totalEarnings(now);
  return `<div class="row"><h1>Budget</h1>${refreshBtn('<button class="link plusbtn" data-action="addExtra" aria-label="Add extra income">＋</button>')}</div>
  <div class="card row"><b style="font-size:17px">${monthName(now)}</b>
    <span class="badge ${run ? 'b-hi' : 'b-mid'}">${run ? 'Applied' : 'Not applied yet'}</span></div>

  ${CD('i-src', 'Income', true)}
    ${S.incomeSources.map(s => {
      const got = receivedFrom(s, now), avg = sourceMonthlyAverage(s);
      const avgTxt = avg ? `<span class="muted small">avg ${usd(avg)}/mo</span>` : '';
      if (s.variable) {
        return `<div style="padding:6px 0"><div class="row"><b>${esc(s.name || 'Unnamed source')}</b><b>${usd(got)}</b></div>
          <div class="row"><span class="muted small">varies</span>${avgTxt}</div></div>`;
      }
      const pct = s.expectedAmount > 0 ? Math.min(got / s.expectedAmount, 1) : 0;
      return `<div style="padding:6px 0">
        <div class="row"><b>${esc(s.name || 'Unnamed source')}</b><b>${usd(got)}</b></div>
        <div class="bar">${fill('src-' + s.id, pct * 100)}</div>
        <div class="row"><span class="muted small">of ${usd(s.expectedAmount)}</span>${avgTxt}</div></div>`;
    }).join('') || '<div class="muted">No income sources yet.</div>'}
    <div class="btn-row"><button class="btn" data-action="editSources">✎ Edit sources</button></div>
    <div class="card tappable" style="margin:14px 0 0" data-action="openHist"><div class="row"><span>${emo('📈')} Income history</span><span class="muted">›</span></div></div>
  ${CE}

  ${CD('b-earn', 'Earnings', true)}
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
    }).join('') || '<div class="muted">Add an income source above.</div>'}
    ${extra.length ? `<div class="day">Extra income · already in your pots</div>${extra.map(t => txRow(t, incomeTag(t))).join('')}` : ''}
    <div class="field" style="border-top:1px solid var(--line);margin-top:6px"><span><b>Earnings to budget</b></span><b id="earn-total">${usd(c.earn)}</b></div>
  ${CE}

  ${CD('b-fixed', 'Expenses', true)}
    ${S.fixedExpenses.map(e => `<div class="field">
      <input class="wide" placeholder="Name" value="${esc(e.name)}" data-change="fixedName" data-id="${e.id}" data-live="1">
      ${numInput(e.amount, `data-change="fixedAmt" data-id="${e.id}" data-live="1"`, 'width:100px')}
      <button class="link" data-action="fixedDel" data-id="${e.id}" aria-label="Remove">✕</button></div>
      <input class="small-in" placeholder="bank text that identifies it (optional)" value="${esc(e.matchKeyword || '')}" autocapitalize="characters" autocorrect="off" data-change="fixedKey" data-id="${e.id}" data-live="1">`).join('')}
    <div class="btn-row" style="margin-top:6px"><button class="btn" data-action="fixedAdd">＋ Add expense</button><button class="btn" data-action="pasteExpenses">Paste a list</button></div>
    <div class="field"><span>${emo('💰')} Savings %</span>
      <span class="pctbox">${numInput(S.savingsPercent, 'data-change="savePct" data-live="1"', 'width:70px')} %</span></div>
    <div class="muted small">That's <b id="save-amt">${usd(c.save)}</b> set aside for Savings this month.</div>
    <div class="muted small" id="eta-savings">${etaHTML(potById('savings'), c.earn, S.savingsPercent || 0)}</div>
    ${c.shares.map(x => { const p = potById(x.id), sug = suggestedPercent(p, c.earn); return `<div class="field" style="margin-top:10px"><span>${emo(p.icon)} ${esc(p.name)} %</span>
      <span class="pctbox">${numInput(p.percent || 0, `data-change="potPct" data-id="${esc(p.id)}" data-live="1"`, 'width:70px')} %</span></div>
    <div class="muted small">That's <b id="pot-amt-${esc(p.id)}">${usd(x.amount)}</b> set aside for ${esc(p.name)} this month.${sug && sug !== (p.percent || 0) ? ` Suggested: <button class="link small" data-action="usePotPct" data-id="${esc(p.id)}" data-v="${sug}">${sug}%</button>${p.target > 0 ? ' to reach your goal in about a year' : ''}` : ''}</div>
    <div class="muted small" id="eta-${esc(p.id)}">${etaHTML(p, c.earn, p.percent || 0)}</div>`; }).join('')}
    <div class="field"><span><b>Total expenses</b></span><b id="fixed-total">${usd(c.total)}</b></div>
    <div class="muted small" id="fixed-break">${totalBreak(c)}</div>
  ${CE}

  ${CD('b-result', 'Result', true)}
    <div class="field"><span><b>Added to Spending</b></span><b id="res-left" class="${c.left < 0 ? 'neg' : 'pos'}">${usd(c.left)}</b></div>
    <div class="field"><span><b>Added to Savings</b></span><b id="res-save" class="pos">${usd(c.save)}</b></div>
    ${c.shares.filter(x => x.amount).map(x => `<div class="field"><span><b>Added to ${esc(potName(x.id))}</b></span><b id="res-pot-${esc(x.id)}" class="pos">${usd(x.amount)}</b></div>`).join('')}
    <button class="btn ${run ? '' : 'primary'} full" style="margin-top:10px" data-action="applyBudget">${run ? 'Update ' + now.toLocaleString('en-US', { month: 'long' }) + '…' : 'Apply ' + now.toLocaleString('en-US', { month: 'long' }) + ' budget…'}</button>
    ${S.budgetUndo && S.budgetUndo.monthKey === monthKey(now) ? '<button class="btn full" style="margin-top:8px" data-action="undoBudget">↩ Undo the last ' + (S.budgetUndo.prevRun ? 'update' : 'apply') + '</button>' : ''}
  ${CE}

  ${historyCard()}

  ${CD('b-stmt', 'Statements', false)}
    ${statementKeys().map(k => { const st = monthStatement(k); return `<button class="link full stmt-row" data-action="openStatement" data-id="${k}"><span>${esc(st.label)}${st.partial ? ' · so far' : ''}</span><span class="muted small nowrap">›</span></button>`; }).join('') || '<div class="muted">Statements appear once you have a month of purchases.</div>'}
  ${CE}`;
}

function backupCard() {
  return `${CD('s-backup', 'Backup &amp; restore', false)}
    <div class="muted small" style="margin-bottom:8px">${S.lastExport ? 'Last backup: ' + fmtShort(S.lastExport) + '.' : 'No backup yet.'} Your data lives only on this device, so keep a copy somewhere private.</div>
    <button class="btn primary full" data-action="shareCode">Email myself a backup code</button>
    <div class="muted small" style="margin:6px 0 10px">Opens the share sheet. Choose Mail and send it to yourself. It can't send by itself; a web page has no way to email on its own.</div>
    <div class="btn-row"><button class="btn" data-action="copyCode">Copy code</button><button class="btn" data-action="export">Save file</button></div>
    <div class="day">Restore</div>
    <textarea id="restoreText" rows="3" placeholder="Paste your backup code (or the whole email) here"></textarea>
    <div class="btn-row"><button class="btn" data-action="restoreCode">Restore from code</button></div>
    <div class="muted small" style="margin-top:8px">Restoring replaces everything on this device. The code contains your financial data, so keep that email private and never post it online.</div>
  ${CE}`;
}

/* Only touch the DOM when the content changed, so a tap on a button isn't lost when a text field blurs. */
function setHTMLIfChanged(el, html) {
  if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

function patchBudget() {
  const c = budgetCalc();
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('earn-total', usd(c.earn));
  set('fixed-total', usd(c.total));
  set('fixed-break', totalBreak(c));
  set('save-amt', usd(c.save));
  const eta = (id, p, pct) => { const el = $(id); if (el && p) el.innerHTML = etaHTML(p, c.earn, pct); };
  eta('eta-savings', potById('savings'), S.savingsPercent || 0);
  c.shares.forEach(x => eta('eta-' + x.id, potById(x.id), (potById(x.id) || {}).percent || 0));
  set('res-left', usd(c.left));
  set('res-save', usd(c.save));
  c.shares.forEach(x => { set('pot-amt-' + x.id, usd(x.amount)); set('res-pot-' + x.id, usd(x.amount)); });
  const l = $('res-left');
  if (l) l.className = c.left < 0 ? 'neg' : 'pos';
}

function patchCheck() {
  setHTMLIfChanged($('disc-box'), discHTML(discrepancy(ui.checkMonth, ui.actual)));
  const t = $('pots-total');
  if (t) t.textContent = usd(potsTotal());
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
  const handle = DEMO ? 'demo@pocketledger' : (nm.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'you') + '@pocketledger';
  return `<div class="topbar"><span class="prompt">${esc(handle)}${DEMO ? '<span class="demo-tag">DEMO</span>' : ''}${syncLabel() ? `<button class="syncstat" id="syncStat" data-action="syncTop">${esc(syncLabel())}</button>` : ''}</span>
    <button class="profile" data-action="openSettings" aria-label="Settings">${nm ? '<b>' + esc(nm[0].toUpperCase()) + '</b>' : emo('👤')}</button></div>`;
}

/* WCAG 2.x contrast: nudge a colour lighter or darker until it reads on the current background. */
const lumOf = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function readableOn(hex, bgs, dark) {
  let [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let n = 0; n < 40 && !bgs.every(bg => ratio('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''), bg) >= 4.5); n++) {
    const t = dark ? 255 : 0; r += (t - r) * 0.08; g += (t - g) * 0.08; b += (t - b) * 0.08; [r, g, b] = [r, g, b].map(Math.round);
  }
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
const PALETTES = [['harbor', 'Harbor', '#7fccd7', '#ffb347'], ['dune', 'Dune', '#dc9e7a', '#5cceeb'], ['graphite', 'Graphite', '#97a5bf', '#ffbc47'], ['plum', 'Plum', '#c888d7', '#ff997a']];
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const themeKey = () => { const m = S.settings.mode; return m === 'light' ? 'light' : m === 'auto' ? (darkQuery && !darkQuery.matches ? 'light' : 'dark') : 'dark'; };
/* Theme and light/dark changes cross-fade the whole screen (View Transitions) instead of snapping. */
function themeFade() {
  const go = () => { applySettings(); render(); };
  if (document.startViewTransition && !motionOff()) { try { document.startViewTransition(go); return; } catch (e) { /* fall through */ } }
  go();
}
if (darkQuery) darkQuery.addEventListener('change', () => { if (S.settings.mode === 'auto') themeFade(); });

function linkStatus() {
  if (S.settings.linked) return ['linked', 'b-hi'];
  if (S.useSampleData) return ['sample data', 'b-mid'];
  return ['not linked', 'b-mid'];
}

const APP_VERSION = '2026-11-06 p';

const LINKED_ROW = (i, mine) => {
  const prob = bankProblems.find(p => p.startsWith(i.institution + ':'));
  return `<div class="linked">
    <div class="linked-name">${esc(i.institution)}</div>
    <div class="muted small linked-accts">${mine.length ? mine.length + ' account' + (mine.length === 1 ? '' : 's') + ': ' + mine.map(a => esc(a.name.replace(/ ··\d+$/, ''))).join(', ') : 'no accounts yet. Tap choose accounts.'}</div>
    ${prob ? `<div class="err">${esc(prob)}</div>` : ''}
    <div class="btn-row"><button class="btn" data-action="chooseAccts" data-id="${esc(i.item_id)}">choose accounts</button><button class="btn danger" data-action="unlinkItem" data-id="${esc(i.item_id)}">unlink</button></div>
  </div>`;
};

function settingsView() {
  const st = S.settings, link = getLink();
  const [statusText, statusCls] = linkStatus();
  const standalone = window.navigator.standalone === true;
  const demoCard = DEMO
    ? `${CD('s-demo','Demo mode is on',true,'','demo-card')}<div class="muted small">Everything here is made up. Your real data is safe and hidden.</div>
        <div class="btn-row"><button class="btn primary" data-action="demoOff">exit demo</button><button class="btn" data-action="demoReset">reset demo</button></div>${CE}`
    : `${CD('s-demo','Demo mode',false)}<div class="muted small">Show the app with made-up numbers.</div>
        <div class="btn-row"><button class="btn" data-action="demoOn">start demo</button></div>${CE}`;
  const bank = DEMO ? '' : `
  ${CD('s-bank','Bank accounts',false)}
    <div class="row"><span>Status</span><span class="badge ${statusCls}">${statusText}</span></div>
    ${ui.linkMsg ? `<div class="small" style="margin-top:8px">${esc(ui.linkMsg)}</div>` : (syncDetail ? `<div class="muted small" style="margin-top:8px">${esc(syncDetail)}</div>` : '')}
    ${linkConfigured() ? `<div class="btn-row" style="margin-top:8px"><button class="btn" data-action="copyConn">copy connection code</button></div>` : `<div class="stack" style="margin-top:8px"><textarea id="connText" rows="2" placeholder="Paste a connection code here (starts with PLC1:)"></textarea><button class="btn primary" data-action="useConn">use connection code</button></div>`}
    <details class="info" data-k="linkedit" ${!linkConfigured() || ui.linkEdit ? 'open' : ''}><summary>${linkConfigured() ? 'Show address and passphrase' : 'Or type the address and passphrase'}</summary><div class="stack" style="margin-top:8px">
      <input id="linkUrl" placeholder="Link server address" value="${esc(link.url || '')}" data-change="linkUrl" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
      <input id="linkPass" type="password" placeholder="passphrase" value="${esc(link.passphrase || '')}" data-change="linkPass" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">
    </div></details>
    <div class="btn-row">
      <button class="btn" data-action="checkLink">check connection</button>
      <button class="btn primary" data-action="linkBank">link a bank</button>
      ${S.settings.linked ? '<button class="btn" data-action="syncNow">sync now</button>' : ''}
    </div>
    ${ui.linkItems && ui.linkItems.length ? `<div class="day">Linked</div>${ui.linkItems.map(i => { const mine = S.accounts.filter(a => a.itemId === i.item_id || (!a.itemId && a.institution === i.institution)); return LINKED_ROW(i, mine); }).join('')}` : ''}
    <details class="info"><summary>Good to know</summary>
      <div class="muted small">
      • Read-only: it can see balances and purchases, never move money.<br>
      • Your bank password goes to Plaid's window, never to this app.<br>
      • Keys live on your private server, not in the app or on GitHub.<br>
      • Some banks (Chase) need the first link done in Safari${standalone ? ' (you are in the home-screen app now)' : ''}.<br>
      • Setup steps: <b>server/README.md</b>.
      </div></details>
  ${CE}`;
  return `<div class="row"><button class="link" data-action="closeSettings">‹ back</button></div>
  <h1>Settings</h1>
  ${DEMO ? '' : ''}
  ${CD('s-you','You',false)}
    <div class="field"><span>Name</span><input class="wide" placeholder="optional" value="${esc(st.name)}" data-change="profileName" autocomplete="off" style="text-align:right"></div>
    <div class="field"><span>Open on</span>${selBtn('startTab', '')}</div>
    <div class="field"><span>New purchases come out of</span>${selBtn('defaultPot', '')}</div>
    <div class="field"><span>Round spending</span>${selBtn('roundMode', '')}</div>
    <div class="field"><span>Backup reminder</span>${selBtn('backupDays', '')}</div>
  ${CE}

  ${CD('s-sec','Security',false)}
    ${lockOn() ? `
    <div class="field"><span>Passcode</span><button class="link" data-action="lockChange">change</button></div>
    <div class="field"><span>Lock after leaving</span>${selBtn('lockDelay', '')}</div>
    <div class="muted small" style="margin:12px 0 6px">Passcode for backup, restore, erase &amp; statements</div>
    ${seg([['on', 'On'], ['off', 'Off']], st.lockSensitive ? 'on' : 'off', 'setSens')}
    <div class="btn-row"><button class="btn" data-action="lockNow">lock now</button><button class="btn danger" data-action="lockOff">turn off lock</button></div>`
    : `<div class="muted small" style="margin-bottom:8px">Ask for a passcode each time the app opens.</div>
    <div class="btn-row"><button class="btn primary" data-action="lockSetup">set up app lock</button></div>`}
    <details class="info"><summary>Good to know</summary><div class="muted small">
      • The lock keeps people out of the app. Your data is not encrypted on the phone, so keep your phone's own passcode on too.<br>
      • Forgot the passcode? It can't be recovered: erase this device and restore a backup.<br>
      • Backups never include the passcode.</div></details>
  ${CE}

  ${CD('s-cats','Categories',false)}
    <div class="muted small" style="margin-bottom:8px">Add your own categories. Mark one tax deductible and its purchases count toward the Deductible total.</div>
    ${(S.customCats || []).map(c => `<div class="field"><span>${emo(c.icon, (CATS[c.id] || {}).color)} ${esc(c.title)}</span><span class="hdr-r"><button class="chip ${c.deduct ? 'on' : ''}" data-action="catDed" data-id="${esc(c.id)}">${c.deduct ? 'deductible' : 'not deductible'}</button><button class="link danger small" data-action="catDel" data-id="${esc(c.id)}">delete</button></span></div>`).join('') || '<div class="muted small">None yet.</div>'}
    <div class="muted small" style="margin:12px 0 6px">New category</div>
    <div class="field"><span>Name</span><input class="wide" placeholder="e.g. Equipment" value="${esc(ui.newCat.title)}" data-change="newCatTitle" data-live="1" autocomplete="off" style="text-align:right"></div>
    <div class="field"><span>Emoji</span><input class="wide" placeholder="🏷️" value="${esc(ui.newCat.icon)}" data-change="newCatIcon" data-live="1" autocomplete="off" style="text-align:right"></div>
    <div class="emojipick">${CAT_EMOJIS.map(e => `<button class="chip ${ui.newCat.icon === e ? 'on' : ''}" data-action="catPickEmoji" data-pot="${e}">${e}</button>`).join('')}</div>
    ${seg([['yes', 'Tax deductible'], ['no', 'Not deductible']], ui.newCat.deduct ? 'yes' : 'no', 'catNewDed')}
    <div class="btn-row"><button class="btn primary" data-action="catAdd">add category</button></div>
  ${CE}

  ${CD('s-look','Appearance',false)}
    <div class="muted small" style="margin:0 0 6px">Mode</div>
    ${seg([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']], st.mode || 'dark', 'setMode')}
    <div class="muted small" style="margin:12px 0 6px">Colors</div>
    <div class="themes">${PALETTES.map(([k, n, c1, c2]) => `<button class="theme ${(st.palette || 'harbor') === k ? 'on' : ''}" data-action="setPalette" data-pot="${k}"><span class="dots"><i style="background:${c1}"></i><i style="background:${c2}"></i></span>${n}</button>`).join('')}</div>
    <div class="muted small" style="margin:12px 0 6px">Text size</div>
    ${seg([['1', 'A'], ['1.12', 'A+'], ['1.25', 'A++']], String(st.textSize), 'setSize')}
    <div class="muted small" style="margin:12px 0 6px">Animations</div>
    ${seg([['auto', 'on'], ['off', 'off']], st.motion, 'setMotion')}
  ${CE}
  ${bank}
  ${demoCard}

  ${CD('s-phone','This device',false)}
    <div class="field"><span>Haptics</span></div>
    ${seg([['on', 'on'], ['off', 'off']], S.settings.haptics === false ? 'off' : 'on', 'setHaptics')}
    <div class="btn-row"><button class="btn" data-action="showTour">show the tour again</button></div>
    <div class="btn-row"><button class="btn" data-action="reloadApp">reload app</button>${DEMO ? '' : '<button class="btn" data-action="clearTx">clear transactions</button>'}</div>
    ${DEMO ? '' : '<div class="btn-row"><button class="btn danger" data-action="eraseAll">erase all data</button></div>'}
    <div class="muted small" style="margin-top:8px">Version ${APP_VERSION}</div>
  ${CE}

  ${backupCard()}`;
}

const VIEWS = { ihist: incomeHistoryView, settings: settingsView, home: homeView, pot: potView, activity: activityView, review: reviewView, budget: budgetView };

/* ---------- modals ---------- */

function sheet(title, inner, doneAction) {
  return `<div class="scrim" data-layer="sheet"><div class="sheet">
    <div class="grab"></div>
    <div class="sheet-head"><b>${title}</b><button class="link" data-action="${doneAction || 'close'}">Done</button></div>
    ${inner}</div></div>`;
}

function seg(options, current, action, extra) {
  return `<div class="seg ${options.length > 3 ? 'many' : ''}" data-sg="${esc(action + (extra || ''))}"><i class="ind"></i>${options.map(([val, label]) =>
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
        : `<button class="link nowrap" data-action="ignore" data-id="${esc(t.id)}">Not a spend</button>`}
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
      <div class="cp" data-copy="${esc(t.simpleName)}" style="font-weight:700;margin-top:4px">${esc(t.simpleName)}</div>
      <span class="pill" style="color:${c.color};border-color:${c.color}">${emo(c.icon, c.color)} ${c.title}</span>
    </div>
    <div class="card"><h2>Original</h2>
      <div class="field"><span class="muted">Bank description</span><div class="mono cp" data-copy="${esc(t.rawName)}" style="max-width:62%">${esc(t.rawName)}</div></div>
      <div class="field"><span class="muted">Date &amp; time</span><div class="cp" data-copy="${esc(fmtFull(t.date))}" style="text-align:right">${fmtFull(t.date)}</div></div>
      <div class="field"><span class="muted">Account</span><div>${esc(accountName(t.accountID))}</div></div>
      ${String(t.id).startsWith('man-') ? `<button class="btn full" style="margin-top:8px" data-action="editTx" data-id="${esc(t.id)}">Edit</button>` : ''}
    </div>
    <div class="card"><h2>How it was read</h2>
      <div class="field"><span class="muted">Simplified as</span><div class="cp" data-copy="${esc(t.simpleName)}" style="text-align:right">${esc(t.simpleName)}</div></div>
      <div class="row"><span class="muted">Confidence</span>${badge(t)}</div>
      <div class="bar">${fill('conf-' + t.id, t.userConfirmed ? 100 : bar)}</div>
      ${t.why ? `<div class="muted small" style="margin-bottom:6px">${esc(t.why)}.</div>` : ''}
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
  const ed = !!m.editId;
  return sheet(ed ? 'Edit entry' : buy ? 'Add a purchase' : 'Add a deposit', `
    <div class="card stack">
      ${seg([['purchase', 'Purchase'], ['deposit', 'Deposit']], m.kind, 'txKind')}
      <div class="field"><span>Amount</span><input type="number" inputmode="decimal" step="any" placeholder="0.00" value="${m.amount || ''}" data-change="txAmount" data-live="1" style="width:130px"></div>
      <input placeholder="${buy ? 'Where? (e.g. Kroger, gas, coffee)' : 'From? (e.g. payroll, tips)'}" value="${esc(m.name)}" data-change="txName" data-live="1">
      ${buy ? `<div class="muted small">Deduct from…</div>${seg([...potOptions(), ['none', 'Decide later']], m.pot, 'txPot')}` : '<div class="muted small">Deposits whose text matches an income source are counted automatically.</div>'}
      ${ed ? `<div class="field"><span>Date</span><input type="date" value="${esc(m.date || '')}" data-change="txDate" data-live="1" style="width:150px"></div>` : ''}
    </div>
    <button class="btn primary full" data-action="saveTx">${ed ? 'Save' : 'Add ' + (buy ? 'purchase' : 'deposit')}</button>
    ${ed ? `<button class="btn danger full" data-action="deleteTx" data-id="${esc(m.editId)}">Delete entry</button>` : ''}`);
}

function extraModal() {
  const m = ui.modal;
  m.sel = m.sel || {};
  const cands = S.transactions.filter(t => t.amount > 0 && !t.extraIncomeLabel);   // includes job deposits
  const n = Object.keys(m.sel).length;
  return sheet('Extra income', `
    <div class="muted small" style="margin:0 2px 8px">Tap the deposits to count. You can pick several.</div>
    <div class="card">${cands.length ? cands.map(t => txRow(t, incomeTag(t), { action: 'pickExtra', check: !!m.sel[t.id] })).join('') : '<div class="muted">No deposits yet.</div>'}</div>
    ${(() => { const mv = Object.keys(m.sel).map(txById).filter(t => t && t.incomeSourceID); return mv.length ? `<div class="muted small" style="margin:0 2px 8px">${mv.length === 1 ? 'This deposit currently counts as ' + esc(sourceName(mv[0].incomeSourceID)) : mv.length + ' of these currently count as a job\'s pay'}. Making ${mv.length === 1 ? 'it' : 'them'} extra income moves ${mv.length === 1 ? 'it' : 'them'} out of that job's budget earnings.</div>` : ''; })()}
    <div class="sheet-foot">
      <div class="field"><span class="muted">What was it?</span>${selBtn('extraLabel', '', '', 'width:150px')}</div>
      ${seg(potOptions(), m.pot, 'extraPot')}
      <button class="btn primary full" style="margin-top:8px" data-action="saveExtra" ${n ? '' : 'disabled'}>Add${n > 1 ? ' ' + n + ' deposits' : ''}</button>
    </div>`);
}

function sourcesModal() {
  return sheet('Income sources', `
    ${S.incomeSources.map(s => `<div class="card stack">
      <input placeholder="Name (e.g. Full-time job)" value="${esc(s.name)}" data-change="srcName" data-id="${s.id}" data-live="1">
      <label class="field"><span>Varies each month</span>
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
    case 'roundMode': return { title: 'Round spending', options: [['nearest', 'Nearest ' + currencySymbol()], ['off', 'Exact cents']], current: S.roundMode === 'off' ? 'off' : 'nearest' }
    case 'lockDelay': return { title: 'Lock after leaving', options: [['0', 'Right away'], ['60', '1 minute'], ['300', '5 minutes'], ['900', '15 minutes']], current: String((lockCfg() || {}).delay ?? 60) };
    case 'currency': return { title: 'Currency', options: [['auto', 'Automatic (' + deviceCurrency() + ')'], ...CURRENCIES.map(c => [c[0], c[0] + ' · ' + c[1]])], current: S.settings.currency || 'auto' };
    case 'adjTarget': return { title: 'Put it in', options: [...pots(), ['all', 'Split across all pots']], current: ui.adjTarget };
    case 'setcat': { const t = txById(id); return { title: 'Category', options: Object.entries(CATS).map(([k, v]) => [k, emo(v.icon, v.color) + ' ' + v.title]), current: t && t.category }; }
    case 'extraLabel': return { title: 'What was it?', options: ['Tips', 'Gift', 'Refund', 'Side gig', 'Other'].map(l => [l, l]), current: m && m.label };
    case 'potIcon': return { title: 'Icon', grid: true, options: POT_ICONS.map(i => [i, emo(i)]), current: m && m.fields && m.fields.icon };
    case 'moveFrom': return { title: 'Move from', options: pots(), current: m && m.from };
    case 'moveTo': return { title: 'Move to', options: pots(), current: m && m.to };
    case 'startTab': return { title: 'Open on', options: TABS.map(t => [t[0], t[2]]), current: TAB_KEYS.includes(S.settings.startTab) ? S.settings.startTab : 'review' };
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
  return `<div class="scrim" data-layer="picker"><div class="sheet small ${d.grid ? 'nogscroll' : ''}">
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
    ${d.word ? `<div class="muted small" style="margin-top:10px">Type <b>${esc(d.word)}</b> to continue</div><input id="dlgType" class="small-in" data-change="dlgType" data-live="1" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" style="margin-top:6px">` : ''}
    <div class="btn-row">${d.cancel === false ? '' : '<button class="btn" data-action="dlgCancel">cancel</button>'}
      <button id="dlgOkBtn" class="btn ${d.danger ? 'danger' : 'primary'}" data-action="dlgOk" ${d.word ? 'disabled' : ''}>${esc(d.ok || 'ok')}</button></div>
  </div></div>`;
}

const localDay = iso => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const askConfirm = (message, ok, onOk, danger) => { ui.dialog = { message, ok, onOk, danger }; };
/* For changes that can't be undone: the button stays off until the word is typed. */
const askType = (message, word, ok, onOk) => { ui.dialog = { message, ok, onOk, danger: true, word, typed: '' }; };
const askAlert = (message, title) => { ui.dialog = { message, title, cancel: false, ok: 'ok' }; };

function pasteOutHTML() {
  const r = parseExpenseList((ui.modal && ui.modal.text) || '');
  return `<div class="card"><h2>What I read</h2>
      ${r.items.length ? r.items.map(i => `<div class="row small" style="padding:3px 0"><span>${esc(i.name)}</span><b>${usd(i.amount)}</b></div>`).join('') + `<div class="row" style="padding-top:6px;border-top:1px solid var(--line);margin-top:6px"><b>Total</b><b>${usd(r.items.reduce((a, i) => a + i.amount, 0))}</b></div>` : '<div class="muted small">Nothing yet.</div>'}
      ${r.pct != null ? `<div class="muted small">Savings percentage: ${r.pct}%</div>` : ''}
    </div>
    ${r.items.length ? `<div class="btn-row"><button class="btn primary" data-action="pasteReplace">Replace my list</button><button class="btn" data-action="pasteAdd">Add to my list</button></div>` : ''}`;
}

function pasteExpModal() {
  return sheet('Paste your monthly expenses', `
    <div class="card"><div class="muted small" style="margin-bottom:8px">One expense per line, name then amount. A line like <b>Savings 20%</b> sets your savings percentage. Lines called Total, Spending or Current are skipped.</div>
      <textarea rows="9" placeholder="Rent 450&#10;Car payment 333.72&#10;Savings 20%" data-change="pasteText" data-live="1">${esc(ui.modal.text || '')}</textarea></div>
    <div id="pasteOut">${pasteOutHTML()}</div>`);
}

function deductibleModal() {
  const now = new Date(), year = ui.modal.year || now.getFullYear();
  const cats = Object.entries(CATS).filter(([, c]) => c.taxDeductible).map(([k]) => k);
  const all = S.transactions.filter(t => isExpense(t) && cats.includes(t.category));
  const years = [...new Set(all.map(t => new Date(t.date).getFullYear()).concat(now.getFullYear()))].sort((a, b) => b - a);
  const list = all.filter(t => new Date(t.date).getFullYear() === year);
  const total = list.reduce((a, t) => a + Math.abs(t.amount), 0);
  const byMonth = {};
  for (const t of list) { const k = new Date(t.date).getMonth(); byMonth[k] = (byMonth[k] || 0) + Math.abs(t.amount); }
  const mx = Math.max(1, ...Object.values(byMonth));
  const byName = {};
  for (const t of list) byName[t.simpleName] = (byName[t.simpleName] || 0) + Math.abs(t.amount);
  return sheet('Deductible ' + year, `
    <div class="card"><div class="muted small">Counted in ${year}</div><div class="big" style="color:var(--sage)">${usd(total)}</div>
      <div class="muted small">${list.length} purchase${list.length === 1 ? '' : 's'} in ${cats.map(k => CATS[k].title).join(', ')}. Anything you change to another category stops counting, and anything you move into one starts counting. Purchases you marked "not a spend" still count here.</div>
      ${years.length > 1 ? `<div class="chips" style="margin:8px 0 0">${years.map(y => `<button class="chip ${y === year ? 'on' : ''}" data-action="dedYear" data-id="${y}">${y}</button>`).join('')}</div>` : ''}
    </div>
    ${list.length ? `<div class="card"><h2>By month</h2>${Object.keys(byMonth).sort((a, b) => b - a).map(k => `<div style="padding:4px 0"><div class="row"><span class="muted small">${new Date(year, +k, 1).toLocaleString('en-US', { month: 'long' })}</span><b>${usd(byMonth[k])}</b></div><div class="bar">${fill('ded-' + year + '-' + k, byMonth[k] / mx * 100)}</div></div>`).join('')}</div>
    <div class="card"><h2>By name</h2>${Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="row small" style="padding:3px 0"><span>${esc(n)}</span><b>${usd(v)}</b></div>`).join('')}</div>
    <div class="card"><h2>Every purchase</h2>${list.map(t => txRow(t)).join('')}
      <div class="muted small" style="margin-top:6px">Tap one to see it or change its category.</div></div>`
    : `<div class="card"><div class="muted">Nothing counted yet in ${year}. Purchases categorized as ${cats.map(k => CATS[k].title).join(' or ')} show up here.</div></div>`}`);
}


/* ---------- monthly statements ---------- */

const pctTxt = x => Math.round(x * 100) + '%';
const shortDay = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function deltaTxt(now, before, goodWhenDown) {
  if (!before) return '';
  const d = (now - before) / before, up = d > 0.005, down = d < -0.005;
  if (!up && !down) return '<span class="muted small">same as last month</span>';
  const good = goodWhenDown ? down : up;
  return `<span class="small ${good ? 'pos' : 'neg'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}% vs last month</span>`;
}

function statementModal(key) {
  const st = monthStatement(key);
  const f = (k, v) => `<div class="field"><span class="muted">${k}</span><b>${v}</b></div>`;
  const prevName = monthLabel(st.prev.key).split(' ')[0];
  const habits = [
    f('Spent per day', usd(st.dailyAvg)),
    f('Purchases', st.count + ' · avg ' + usd(st.avgPurchase)),
    f('No-spend days', st.noSpendDays + ' of ' + st.elapsed),
    st.priciestDay ? f('Priciest day', monthName(keyToDate(key)).split(' ')[0] + ' ' + st.priciestDay.day + ' · ' + usd(st.priciestDay.total)) : '',
    st.busiestWeekday ? f('Biggest spending weekday', st.busiestWeekday.name + 's · ' + usd(st.busiestWeekday.total)) : '',
    f('Bills', usd(st.recurring)),
  ].join('');
  const cats = st.byCat.map(c => `<div style="padding:5px 0"><div class="row"><span>${emo(c.icon, c.color)} ${esc(c.title)}</span><b>${usd(c.total)}</b></div>
      <div class="bar">${fill('st-' + key + c.cat, c.pct * 100, 'background:' + c.color)}</div>
      <div class="row"><span class="muted small">${pctTxt(c.pct)} of spending · ${c.count} purchase${c.count === 1 ? '' : 's'}</span>${st.prev.has && c.prev ? `<span class="muted small">${prevName}: ${usd(c.prev)}</span>` : ''}</div></div>`).join('') || '<div class="muted">No spending this month.</div>';
  const budget = st.budget ? `<div class="card"><h2>Budget</h2>
      ${f('Earnings budgeted', usd(st.budget.earnings))}${f('Expenses', usd(st.budget.fixed))}${f('Set aside for savings', usd(st.budget.savings))}${f('Left to spend', usd(st.budget.allowance))}
      ${st.budget.allowance ? `<div class="bar thick">${fill('st-' + key + 'bud', Math.min(st.budget.spentVsAllowance * 100, 100), st.budget.spentVsAllowance > 1 ? 'background:var(--red)' : '')}</div>
      <div class="muted small">Spent ${usd(st.spent)} of ${usd(st.budget.allowance)} (${pctTxt(st.budget.spentVsAllowance)}). ${st.budget.spentVsAllowance > 1 ? 'Over by ' + usd(st.spent - st.budget.allowance) + '.' : usd(st.budget.allowance - st.spent) + ' left.'}</div>` : ''}</div>` : '';
  const goals = st.goals.length ? `<div class="card"><h2>Goals</h2>${st.goals.map(g => `<div style="padding:5px 0"><div class="row"><span>${emo(g.icon)} ${esc(g.name)}</span><b>${usd(g.closing)} <span class="muted small">of ${usd(g.target)}</span></b></div>
      <div class="bar">${fill('st-' + key + 'g' + g.id, Math.min(g.pct, 1) * 100)}</div>
      <div class="row"><span class="muted small">${pctTxt(g.pct)} there</span><span class="muted small">${g.change ? (g.change > 0 ? '+' : '−') + usd(Math.abs(g.change)) + ' this month' : 'no change this month'}</span></div></div>`).join('')}</div>` : '';
  const pots = `<div class="card"><h2>Pots at month end</h2>${st.pots.map(p => `<div class="field"><span>${emo(p.icon)} ${esc(p.name)}</span><span><b>${usd(p.closing)}</b> <span class="muted small">${p.change ? (p.change > 0 ? '+' : '−') + usd(Math.abs(p.change)) : ''}</span></span></div>`).join('')}</div>`;
  const accts = st.accounts.length ? `<div class="card"><h2>Accounts <span class="muted small">(balances today)</span></h2>${st.accounts.map(a => `<div class="field"><span>${esc(a.name)}${a.mask ? ' <span class="muted small">··' + esc(a.mask) + '</span>' : ''}</span><b class="${a.owed ? 'neg' : ''}">${a.owed ? '−' : ''}${usd(Math.abs(a.balance))}</b></div>`).join('')}</div>` : '';
  const txList = st.txs.map(t => `<div class="field"><span style="min-width:0"><span class="muted small">${shortDay(t.date)}</span> ${esc(t.name)}<br><span class="muted small">${esc((CATS[t.category] || CATS.other).title)} · ${esc(t.account)}${t.raw && t.raw !== t.name ? '<br>Original: ' + esc(t.raw) : ''}</span></span><b class="${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '−'}${usd(Math.abs(t.amount))}</b></div>`).join('');
  return sheet(esc(st.label) + (st.partial ? ' · so far' : ''), `
    <div class="btn-row" style="margin-bottom:12px"><button class="btn primary" data-action="stmtPrint">save as PDF</button><button class="btn" data-action="stmtShare">share</button><button class="btn" data-action="stmtCsv">CSV</button></div>
    <div class="card"><h2>Summary</h2>
      ${f('Income', '<span class="pos">' + usd(st.income) + '</span>')}
      ${f('Spent', usd(st.spent))}
      ${st.invested ? f('Saved &amp; invested', usd(st.invested)) : ''}
      ${f('Kept', usd(st.kept))}
      ${st.savingsRate != null ? f('Kept of income', pctTxt(Math.max(st.savingsRate, 0))) : ''}
      ${st.prev.has ? `<div style="margin-top:4px">${deltaTxt(st.spent, st.prev.spent, true)}${st.prev.income ? ' · ' + deltaTxt(st.income, st.prev.income, false) : ''}</div>` : ''}
      ${st.partial ? '<div class="muted small" style="margin-top:6px">This month isn\'t over yet; numbers are as of today.</div>' : ''}
    </div>
    <div class="card"><h2>Spending habits</h2>${habits}</div>
    <div class="card"><h2>Where it went</h2>${cats}</div>
    ${st.merchants.length ? `<div class="card"><h2>Top places</h2>${st.merchants.map(m => `<div class="field"><span>${esc(m.name)} <span class="muted small">×${m.count}</span></span><b>${usd(m.total)}</b></div>`).join('')}</div>` : ''}
    ${st.largest.length ? `<div class="card"><h2>Largest purchases</h2>${st.largest.map(m => `<div class="field"><span><span class="muted small">${shortDay(m.date)}</span> ${esc(m.name)}</span><b>${usd(m.amount)}</b></div>`).join('')}</div>` : ''}
    ${budget}${goals}${pots}
    ${st.incomeBy.length ? `<div class="card"><h2>Income</h2>${st.incomeBy.map(i => `<div class="field"><span>${esc(i.name)}</span><b class="pos">${usd(i.total)}</b></div>`).join('')}</div>` : ''}
    ${accts}
    <div class="card"><h2>All transactions <span class="muted small">(${st.txs.length})</span></h2>${txList || '<div class="muted">Nothing this month.</div>'}</div>`);
}

/* A plain, printable version of the statement: black on white, one file, nothing loaded from the internet. */

function statementDoc(st) {
  const m = x => usd(x);
  const sec = (t, body) => `<h2>${esc(t)}</h2>${body}`;
  const tbl = (rows, head) => `<table>${head ? '<tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>' : ''}${rows.map(r => '<tr>' + r.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('') + '</tr>').join('')}</table>`;
  const habits = [['Spent per day', m(st.dailyAvg)], ['Purchases', st.count + ' (average ' + m(st.avgPurchase) + ')'], ['No-spend days', st.noSpendDays + ' of ' + st.elapsed],
    ...(st.priciestDay ? [['Priciest day', 'day ' + st.priciestDay.day + ': ' + m(st.priciestDay.total)]] : []), ...(st.busiestWeekday ? [['Biggest spending weekday', st.busiestWeekday.name + 's: ' + m(st.busiestWeekday.total)]] : []), ['Bills', m(st.recurring)]];
  const pc = (a, b) => b ? ` (${a >= b ? '+' : '−'}${Math.abs(Math.round((a - b) / b * 100))}% vs last month)` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PocketLedger statement ${esc(st.label)}</title>
<style>@page{margin:16mm}body{font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#111;background:#fff;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #111;padding-bottom:3px;text-transform:lowercase}
table{width:100%;border-collapse:collapse}td,th{padding:3px 6px 3px 0;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}td.r,th:last-child{text-align:right}.bar{height:6px;background:#e5e5e5}.bar i{display:block;height:100%;background:#111}.muted{color:#666}.big td{font-size:15px}tr{break-inside:avoid}</style></head><body>
<h1>PocketLedger statement</h1><div class="muted">${esc(st.label)}${st.partial ? ' (so far)' : ''} · made ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
${sec('Summary', tbl([['Income', m(st.income)], ['Spent', m(st.spent)], ...(st.invested ? [['Saved & invested', m(st.invested)]] : []), ['Kept (income − spent)', m(st.kept)], ...(st.savingsRate != null ? [['Kept of income', pctTxt(Math.max(st.savingsRate, 0))]] : []), ...(st.prev.has ? [['Spending change', (st.prev.spent ? pc(st.spent, st.prev.spent).replace(/^ \(|\)$/g, '') : 'n/a')]] : [])]))}
${sec('Spending habits', tbl(habits))}
${sec('Where it went', tbl(st.byCat.map(c => [esc(c.title) + `<div class="bar"><i style="width:${Math.round(c.pct * 100)}%"></i></div>`, m(c.total) + ' · ' + pctTxt(c.pct)]), ['Category', 'Amount']))}
${st.merchants.length ? sec('Top places', tbl(st.merchants.map(x => [esc(x.name) + ' ×' + x.count, m(x.total)]))) : ''}
${st.largest.length ? sec('Largest purchases', tbl(st.largest.map(x => [shortDay(x.date) + ' ' + esc(x.name), m(x.amount)]))) : ''}
${st.budget ? sec('Budget', tbl([['Earnings budgeted', m(st.budget.earnings)], ['Expenses', m(st.budget.fixed)], ['Set aside for savings', m(st.budget.savings)], ['Left to spend', m(st.budget.allowance)], ['Spent', m(st.spent) + (st.budget.allowance ? ' (' + pctTxt(st.budget.spentVsAllowance) + ' of it)' : '')]])) : ''}
${st.goals.length ? sec('Goals', tbl(st.goals.map(g => [esc(g.name) + `<div class="bar"><i style="width:${Math.round(Math.min(g.pct, 1) * 100)}%"></i></div>`, m(g.closing) + ' of ' + m(g.target) + ' · ' + pctTxt(g.pct) + (g.change ? ' · ' + (g.change > 0 ? '+' : '−') + m(Math.abs(g.change)) + ' this month' : '')]))) : ''}
${sec('Pots at month end', tbl(st.pots.map(p => [esc(p.name), m(p.closing) + (p.change ? ' (' + (p.change > 0 ? '+' : '−') + m(Math.abs(p.change)) + ')' : '')])))}
${st.incomeBy.length ? sec('Income', tbl(st.incomeBy.map(i => [esc(i.name), m(i.total)]))) : ''}
${st.accounts.length ? sec('Accounts (balances today)', tbl(st.accounts.map(a => [esc(a.name) + (a.mask ? ' ··' + esc(a.mask) : ''), (a.owed ? '−' : '') + m(Math.abs(a.balance))]))) : ''}
${sec('Transactions (' + st.txs.length + ')', tbl(st.txs.map(t => [shortDay(t.date) + ' ' + esc(t.name) + `<div class="muted">${esc((CATS[t.category] || CATS.other).title)} · ${esc(t.account)}${t.raw && t.raw !== t.name ? ' · Original: ' + esc(t.raw) : ''}</div>`, (t.amount > 0 ? '+' : '−') + m(Math.abs(t.amount))])))}
<p class="muted" style="margin-top:24px">Made on your device by PocketLedger. Nothing was sent anywhere.</p></body></html>`;
}

function statementCsv(st) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return ['Date,Description,Original name,Category,Account,Amount,Pot,Note', ...st.txs.map(t => [t.date.slice(0, 10), q(t.name), q(t.raw), q((CATS[t.category] || CATS.other).title), q(t.account), t.amount.toFixed(2), q(t.pot), q(t.note)].join(','))].join('\n');
}

async function shareFile(name, type, content, title) {
  try {
    const file = new File([content], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* A real PDF, written by hand on this device (Courier, Letter size). No print dialog and nothing loaded from the internet,
   so "save as PDF" works the same in Safari, from the home screen, and on a computer. */

function statementPdf(st) {
  const COLS = 96, m = x => usd(x);
  const lines = [];                                   // { t: text, b: bold }
  const add = (t, b) => lines.push({ t: String(t), b: !!b });
  const gap = () => add('');
  const head = t => { gap(); add(t.toUpperCase(), true); add('-'.repeat(COLS)); };
  const wrap = (txt, w, ind) => {
    const out = []; let cur = '';
    for (const word of String(txt).split(/\s+/)) {
      let wd = word;
      while (wd.length > w) { if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
      if (!cur) cur = wd; else if ((cur + ' ' + wd).length <= w) cur += ' ' + wd; else { out.push(cur); cur = wd; }
    }
    if (cur) out.push(cur);
    return out.map((x, i) => (i ? ind : '') + x);
  };
  const row = (l, r, ind) => {
    l = String(l); r = String(r);
    const room = COLS - r.length - 2 - (ind || 0);
    const parts = wrap(l, Math.max(room, 12), '');
    parts.forEach((p, i) => {
      const pad = ' '.repeat(ind || 0);
      if (i < parts.length - 1) add(pad + p);
      else { const dots = Math.max(2, COLS - (ind || 0) - p.length - r.length); add(pad + p + ' ' + '.'.repeat(dots - 2) + ' ' + r); }
    });
  };
  const bar = p => { const n = Math.round(Math.max(0, Math.min(1, p)) * 20); return '[' + '#'.repeat(n) + '.'.repeat(20 - n) + ']'; };
  const sgn = v => (v > 0 ? '+' : '-') + m(Math.abs(v));

  add('POCKETLEDGER STATEMENT', true);
  add(st.label + (st.partial ? ' (so far)' : '') + '  |  made ' + new Date().toLocaleDateString('en-US', { dateStyle: 'long' }));

  head('Summary');
  row('Income', m(st.income)); row('Spent', m(st.spent));
  if (st.invested) row('Saved & invested', m(st.invested));
  row('Kept (income - spent)', m(st.kept));
  if (st.savingsRate != null) row('Kept of income', pctTxt(Math.max(st.savingsRate, 0)));

  head('Spending habits');
  row('Spent per day', m(st.dailyAvg)); row('Purchases', st.count + ' (average ' + m(st.avgPurchase) + ')'); row('No-spend days', st.noSpendDays + ' of ' + st.elapsed);
  if (st.priciestDay) row('Priciest day', 'day ' + st.priciestDay.day + ': ' + m(st.priciestDay.total));
  if (st.busiestWeekday) row('Biggest spending weekday', st.busiestWeekday.name + 's: ' + m(st.busiestWeekday.total));
  row('Bills', m(st.recurring));

  head('Where it went');
  st.byCat.forEach(c => { row(c.title, m(c.total) + '  ' + pctTxt(c.pct)); add('   ' + bar(c.pct)); });

  if (st.merchants.length) { head('Top places'); st.merchants.forEach(x => row(x.name + ' x' + x.count, m(x.total))); }
  if (st.largest.length) { head('Largest purchases'); st.largest.forEach(x => row(shortDay(x.date) + ' ' + x.name, m(x.amount))); }
  if (st.budget) {
    head('Budget');
    row('Earnings budgeted', m(st.budget.earnings)); row('Expenses', m(st.budget.fixed)); row('Set aside for savings', m(st.budget.savings)); row('Left to spend', m(st.budget.allowance));
    row('Spent', m(st.spent) + (st.budget.allowance ? ' (' + pctTxt(st.budget.spentVsAllowance) + ' of it)' : ''));
  }
  if (st.goals.length) {
    head('Goals');
    st.goals.forEach(g => { row(g.name, m(g.closing) + ' of ' + m(g.target) + '  ' + pctTxt(g.pct)); add('   ' + bar(g.pct) + (g.change ? '  ' + sgn(g.change) + ' this month' : '')); });
  }
  head('Pots at month end');
  st.pots.forEach(p => row(p.name, m(p.closing) + (p.change ? ' (' + sgn(p.change) + ')' : '')));
  if (st.incomeBy.length) { head('Income'); st.incomeBy.forEach(i => row(i.name, m(i.total))); }
  if (st.accounts.length) { head('Accounts (balances today)'); st.accounts.forEach(a => row(a.name + (a.mask ? ' ..' + a.mask : ''), (a.owed ? '-' : '') + m(Math.abs(a.balance)))); }

  head('Transactions (' + st.txs.length + ')');
  st.txs.forEach(t => {
    row(shortDay(t.date) + '  ' + t.name, sgn(t.amount));
    wrap((CATS[t.category] || CATS.other).title + ' | ' + t.account + (t.raw && t.raw !== t.name ? ' | Original: ' + t.raw : ''), COLS - 6, '').forEach(x => add('      ' + x));
  });
  gap(); add('Made on your device by PocketLedger. Nothing was sent anywhere.');

  /* ---- bytes ---- */
  const hex = s => {
    let o = '';
    for (const ch of s.normalize('NFKD')) {
      let c = ch.charCodeAt(0);
      if (c === 0xA0) c = 32;
      else if (c === 0x2212 || c === 0x2013 || c === 0x2014) c = 45;
      else if (c === 0xB7 || c === 0x2022) c = 124;
      else if (c === 0x2019 || c === 0x2018) c = 39;
      else if (c === 0x201C || c === 0x201D) c = 34;
      else if (c === 0x20AC) c = 0x80;
      else if (c === 0xA3 || c === 0xA5) c = c;
      else if (c < 32 || c > 126) { if (c >= 0x300 && c <= 0x36F) continue; c = 63; }
      if (c === 63 && ch !== '?') { if (/\p{Extended_Pictographic}|‍|️/u.test(ch)) continue; }
      o += (c < 16 ? '0' : '') + c.toString(16);
    }
    return o;
  };
  const PER = 62, pages = [];
  for (let i = 0; i < lines.length; i += PER) pages.push(lines.slice(i, i + PER));
  const objs = [];                                    // index = object number - 1
  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>';
  const kids = [];
  pages.forEach((pg, pi) => {
    const n = objs.length + 1;
    let s = 'BT\n9 TL\n40 744 Td\n';
    pg.forEach(l => { s += '/' + (l.b ? 'F2' : 'F1') + ' 9 Tf\n<' + hex(l.t) + '> Tj T*\n'; });
    s += 'ET\n';
    s += 'BT\n/F1 8 Tf\n40 24 Td\n<' + hex('PocketLedger statement ' + st.label + '   page ' + (pi + 1) + ' of ' + pages.length) + '> Tj\nET\n';
    objs[n - 1] = '<< /Length ' + s.length + ' >>\nstream\n' + s + 'endstream';
    objs[n] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + n + ' 0 R >>';
    kids.push((n + 1) + ' 0 R');
  });
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
function printStatement(key) {
  const st = monthStatement(key);
  shareFile('pocketledger-statement-' + key + '.pdf', 'application/pdf', statementPdf(st), 'PocketLedger statement');
}

function modalHTML() {
  const m = ui.modal;
  switch (m.type) {
    case 'tx': return txModal(m.id);
    case 'extra': return extraModal();
    case 'addTx': return addTxModal();
    case 'sources': return sourcesModal();
    case 'potEdit': return potEditModal();
    case 'move': return moveModal();
    case 'pasteExp': return pasteExpModal();
    case 'deductible': return deductibleModal();
    case 'statement': return statementModal(m.key);
  }
  return '';
}

/* ---------- render ---------- */

const TABS = [['review', '📥', 'Review'], ['home', '🏠', 'Dashboard'], ['activity', '📋', 'Activity'], ['budget', '📊', 'Budget']];

let lastTab = null;
const tabIndex = k => Math.max(TABS.findIndex(t => t[0] === (k === 'pot' ? 'home' : k === 'ihist' ? 'budget' : k)), 0);

/* ---------- motion helpers ---------- */
const motionOff = () => S.settings.motion === 'off' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* The highlight in a row of buttons slides from the old choice to the new one. */
const segPrev = {}, segAnim = {};
const liveSegs = () => [...app.querySelectorAll('.seg[data-sg]'), ...modalRoot.querySelectorAll('.seg[data-sg]')];
function captureSegs() {
  liveSegs().forEach(sg => {
    const on = sg.querySelector('button.on');
    if (on && on.offsetWidth) segPrev[sg.dataset.sg] = { l: on.offsetLeft, t: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  });
}
function placeSegs(animate) {
  liveSegs().forEach(sg => {
    const ind = sg.querySelector(':scope > i.ind'), on = sg.querySelector('button.on');
    if (!ind || !on || !on.offsetWidth) return;
    const to = { l: on.offsetLeft, t: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const key = sg.dataset.sg, a = segAnim[key];
    const sameBox = (p, q) => p.l === q.l && p.t === q.t && p.w === q.w;
    let from = animate && !motionOff() ? segPrev[key] : null;
    const midSlide = a && Date.now() - a.at < 450 && sameBox(a.to, to);
    if (midSlide && !motionOff()) from = a.from;   // re-rendered while sliding: carry on from where the slide began
    const set = p => { ind.style.width = p.w + 'px'; ind.style.height = p.h + 'px'; ind.style.transform = `translate(${p.l}px, ${p.t}px)`; };
    ind.classList.remove('go');
    set(from || to);
    sg.classList.add('ready');
    if (from && !sameBox(from, to)) { void ind.offsetWidth; ind.classList.add('go'); set(to); if (!midSlide) segAnim[key] = { from, to, at: Date.now() }; }
    segPrev[sg.dataset.sg] = to;
  });
}
window.addEventListener('resize', () => placeSegs(false));

/* Updates the tab bar in place, so its icons aren't torn down and redrawn (that was the flicker). */
function updateTabbar(active, tabChanged, n) {
  if (tabbar.children.length !== TABS.length) tabbar.innerHTML = TABS.map(([k]) => `<button data-action="tab" data-tab="${k}"></button>`).join('');
  TABS.forEach(([k, icon, label], i) => {
    const b = tabbar.children[i], on = active === k, pip = k === 'review' ? n : 0;
    const sig = icon + '|' + label + '|' + pip;
    if (b.dataset.sig !== sig) { b.dataset.sig = sig; b.innerHTML = `<span class="i">${emo(icon, on ? SAGE : DIM)}</span>${label}${pip ? `<span class="pip">${pip}</span>` : ''}`; }
    const em = b.querySelector('.emo'), f = tintFilter(on ? SAGE : DIM);
    if (em && em.style.filter !== f) em.style.filter = f;
    b.classList.toggle('on', on);
    b.classList.remove('pop');
    if (on && tabChanged) { void b.offsetWidth; b.classList.add('pop'); }
  });
}

/* The pots at the top of Review are pinned (position: fixed, so scrolling never moves them); a spacer in the page keeps the rest of the content below them. */
/* The name/settings bar is a fixed block that reaches up behind the status bar (same glass as the tab bar), so iOS's blur sits on that block's own color.
   Its height is shared as --hdr-h so the page and the pinned pots start just below it. */
function layoutHdr() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  document.documentElement.style.setProperty('--hdr-h', hdr.offsetHeight + 'px');
  layoutStick();
}
try { const h = document.getElementById('hdr'); if (h && window.ResizeObserver) new ResizeObserver(layoutHdr).observe(h); } catch (e) { /* ignore */ }
function layoutStick() {
  const st = document.querySelector('.stick'), ph = document.querySelector('.stick-ph');
  if (!st || !ph) return;
  const top = parseFloat(getComputedStyle(st).top) || 0;
  const docTop = ph.getBoundingClientRect().top + window.scrollY;
  ph.style.height = Math.max(0, top + st.offsetHeight - docTop + 6) + 'px';
}
window.addEventListener('resize', layoutHdr);
function render() {
  RB = runningBalances();
  captureSegs();
  const y = window.scrollY;
  const oldSheet = modalRoot.querySelector('.sheet');
  const sheetY = oldSheet ? oldSheet.scrollTop : 0;
  const tabChanged = ui.tab !== lastTab;

  const hdr = document.getElementById('hdr');
  if (hdr) { hdr.innerHTML = ui.tab === 'settings' ? '' : topbar(); hdr.classList.toggle('bare', ui.tab === 'settings'); }
  app.innerHTML = VIEWS[ui.tab]();
  // remember what the live-patched areas currently show (see setHTMLIfChanged)
  if ($('disc-box')) $('disc-box').__html = discHTML(discrepancy(ui.checkMonth, ui.actual));
  if ($('actList')) $('actList').__html = activityListHTML();
  const n = pending().length;
  const active = ui.tab === 'pot' ? 'home' : ui.tab === 'ihist' ? 'budget' : ui.tab;
  updateTabbar(active, tabChanged, n);

  // pop-ups: fade/slide in when they appear, vanish when they go
  const now = [ui.modal && 'sheet', ui.picker && 'picker', ui.dialog && 'dialog'].filter(Boolean);
  const beforeNames = [...modalRoot.children].filter(el => el.dataset && el.dataset.layer).map(el => el.dataset.layer);
  ui.skipGhost = {};
  modalRoot.innerHTML = (ui.modal ? modalHTML() : '') + (ui.picker ? pickerHTML() : '') + (ui.dialog ? dialogHTML() : '');
  [...modalRoot.children].forEach(el => { if (!beforeNames.includes(el.dataset.layer)) el.classList.add('in'); });
  document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file])').forEach(i => i.setAttribute('enterkeyhint', 'done'));
  layoutHdr();
  syncHistory();
  document.body.style.overflow = now.length ? 'hidden' : '';

  window.scrollTo(0, ui.resetScroll ? 0 : y);
  ui.resetScroll = false;
  const newSheet = modalRoot.querySelector('.sheet');
  if (newSheet && oldSheet) newSheet.scrollTop = sheetY;

  placeSegs(true);
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
    const from = reduce || entering ? w : (barState[k] != null ? barState[k] : w);
    barState[k] = w;
    el.style.transition = 'none';
    el.style.transform = 'scaleX(' + from / 100 + ')';
  });
  void document.body.offsetWidth;
  bars.forEach(el => { el.style.transition = ''; el.style.transform = 'scaleX(' + el.dataset.w / 100 + ')'; });

  const jobs = [];
  document.querySelectorAll('[data-count]').forEach(el => {
    const k = el.dataset.count, to = +el.dataset.val;
    let from = numState[k];
    if (from == null || entering) from = to;
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
  await refreshBank();
  await sync();
  ui.syncing = false; render();
  if (refreshOk) setTimeout(() => autoSync(true), 12000);   // the bank answers a few seconds after being asked
}

function closeModal() {
  if (ui.modal && ui.modal.type === 'sources') rematchIncomeSources();
  ui.modal = ui.modal && ui.modal.back ? ui.modal.back : null;   // a purchase opened from the Deductible list goes back to it
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

/* A separate, tiny code that holds only the server address and passphrase, for keeping in a password manager. Never part of a backup. */
const connCode = () => { const l = getLink(); return 'PLC1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: l.url || '', p: l.passphrase || '' })))) + '~'; };
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.k === 'linkedit') ui.linkEdit = d.open; }, true);
async function copyConn() {
  const code = connCode();
  try { await navigator.clipboard.writeText(code); askAlert('Connection code copied. Keep it in your password manager, not in the same email as a backup.'); }
  catch (e) { ui.dialog = { title: 'Copy this connection code', message: 'Press and hold in the box, choose Select All, then Copy.', code, cancel: false, ok: 'done' }; }
  render();
}
function useConn() {
  const box = $('connText'), m = /PLC1:([A-Za-z0-9+\/=]+)/.exec(box ? box.value : '');
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (!/^https:\/\//i.test(o.u || '') || !o.p) throw new Error('bad');
    setLink({ url: o.u.trim(), passphrase: String(o.p).trim() });
    ui.linkMsg = 'Connection saved.';
    if (box) box.value = '';
    render();
    if (S.settings.linked) doSync();
  } catch (e) { askAlert('That connection code could not be read. Paste the whole code, starting with PLC1: and ending with ~.'); render(); }
}

async function restoreCode() {
  const box = $('restoreText');
  try {
    const obj = await decodeBackup(box ? box.value : '');
    askType('Replace everything on this device with this backup?', 'RESTORE', 'restore backup', () => {
      replaceState(obj); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {}; ui.actual = null;
      askAlert('Backup restored.');
    });
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
    ui.serverVersion = st.version || '';
    if (!ui.linkItems.length) {
      S.settings.linked = false; save();
      ui.linkMsg = 'Connected to your server. No bank is linked yet, so tap link a bank.';
    } else {
      ui.linkMsg = 'Connected. ' + ui.linkItems.length + (ui.linkItems.length === 1 ? ' bank' : ' banks') + ' linked.' + (ui.serverVersion ? ' Server version ' + ui.serverVersion + '.' : ' Server version unknown (older file).');
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
  demoOn: () => askConfirm('Start the demo? It shows made-up numbers. Your real data stays safe and comes back when you exit.', 'start demo', () => { try { localStorage.removeItem(TOUR_KEY); } catch (e) { /* ignore */ } setDemo(true); location.reload(); }),
  setHaptics: d => { S.settings.haptics = d.pot === 'on'; save(); applySettings(); if (d.pot === 'on') haptic(); },
  showTour: () => { tourShow(0); return false; },
  demoOff: () => { setDemo(false); location.reload(); },
  demoReset: () => askConfirm('Reset the demo to its starting made-up data?', 'reset', () => { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } location.reload(); }, true),
  tab: d => { ui.tab = d.tab; ui.resetScroll = true; ui.selectMode = false; ui.selected = {}; },
  open: d => { ui.modal = { type: 'tx', id: d.id, back: ui.modal && ui.modal.type === 'deductible' ? { type: 'deductible', year: ui.modal.year } : null }; },
  close: () => closeModal(),
  closeSources: () => closeModal(),
  assign: d => assign(d.id, d.pot === 'none' ? null : d.pot),
  ignore: d => ignoreTx(d.id),
  editTx: d => { const t = txById(d.id); if (!t) return; const e = S.potLog.find(x => x.kind === 'tx' && x.txId === t.id);
    ui.modal = { type: 'addTx', editId: t.id, kind: t.amount > 0 ? 'deposit' : 'purchase', amount: Math.abs(t.amount), name: t.rawName, pot: (e && e.potId) || 'none', date: localDay(t.date), back: { type: 'tx', id: t.id } }; },
  deleteTx: d => askConfirm('Delete this entry?', 'delete', () => { removeTx(d.id); save(); ui.modal = null; render(); }, true),
  filter: d => { ui.actLimit = 60; ui.filter = (ui.filter === d.cat || !d.cat) ? null : d.cat; },
  refresh: () => { doSync(); return false; },

  // settings
  openSettings: () => {
    if (ui.tab !== 'settings') ui.prevTab = ui.tab; ui.tab = 'settings'; ui.resetScroll = true;
    if (linkConfigured() && !ui.linkItems) linkApi('/status').then(st => { ui.linkItems = st.items || []; if (ui.tab === 'settings') renderWhenIdle(); }).catch(() => {});
  },
  closeSettings: () => { ui.tab = ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'review'; ui.resetScroll = true; },
  setPalette: d => { S.settings.palette = d.pot; save(); themeFade(); return false; },
  setMode: d => { S.settings.mode = d.pot; save(); themeFade(); return false; },
  catPickEmoji: d => { ui.newCat.icon = d.pot; },
  catNewDed: d => { ui.newCat.deduct = d.pot === 'yes'; },
  catAdd: () => {
    const n = ui.newCat;
    if (!n.title.trim()) { askAlert('Give the category a name first.'); return; }
    if (!addCategory(n.title, n.icon, n.deduct)) { askAlert('You already have a category with that name.'); return; }
    ui.newCat = { title: '', icon: '', deduct: false }; applySettings();
  },
  catDed: d => { const c = (S.customCats || []).find(x => x.id === d.id); if (c) { setCategoryDeduct(d.id, !c.deduct); applySettings(); } },
  catDel: d => { const c = (S.customCats || []).find(x => x.id === d.id); if (!c) return;
    const n = S.transactions.filter(t => t.category === d.id).length;
    askConfirm('Delete ' + c.title + '?' + (n ? ' Its ' + n + ' purchase' + (n === 1 ? '' : 's') + ' will move to Other.' : ''), 'delete', () => { removeCategory(d.id); applySettings(); render(); }, true); },
  setSize: d => { S.settings.textSize = +d.pot; save(); applySettings(); },
  setMotion: d => { S.settings.motion = d.pot; save(); applySettings(); },
  reloadApp: () => { location.reload(); return false; },
  clearTx: () => askType('Remove all transactions and pot history, and set every pot to $0? Settings, income sources, expenses and notes stay. ' + (S.lastExport ? 'Last backup: ' + fmtShort(S.lastExport) + '.' : 'You have no backup yet.'), 'CLEAR', 'clear transactions', () => {
    startFresh(); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {}; ui.linkMsg = 'Transactions cleared.';
  }),
  eraseAll: () => askType('Erase everything stored on this device? This cannot be undone. ' + (S.lastExport ? 'Last backup: ' + fmtShort(S.lastExport) + '.' : 'You have no backup yet.'), 'ERASE', 'erase everything', () => {
    eraseEverything(); setLink({}); ui.linkItems = null; ui.linkMsg = ''; ui.tab = 'review'; applySettings(); doSync();
  }),
  checkLink: () => { checkLink(); return false; },
  linkBank: () => {
    if (S.useSampleData) askConfirm('Linking real accounts clears the sample data first. Continue?', 'continue', () => { startFresh(); openPlaid(); });
    else { openPlaid(); return false; }
  },
  openStatement: d => { ui.modal = { type: 'statement', key: d.id }; markStatementSeen(d.id); },
  dismissStatement: d => { markStatementSeen(d.id); },
  stmtPrint: () => { if (ui.modal && ui.modal.key) printStatement(ui.modal.key); },
  stmtShare: () => { const k = ui.modal && ui.modal.key; if (k) shareFile('pocketledger-statement-' + k + '.html', 'text/html', statementDoc(monthStatement(k)), 'PocketLedger statement ' + k); },
  stmtCsv: () => { const k = ui.modal && ui.modal.key; if (k) shareFile('pocketledger-statement-' + k + '.csv', 'text/csv', statementCsv(monthStatement(k)), 'PocketLedger statement ' + k); },
  openDeduct: () => { ui.modal = { type: 'deductible', year: new Date().getFullYear() }; },
  dedYear: d => { ui.modal.year = +d.id; },
  pasteExpenses: () => { ui.modal = { type: 'pasteExp', text: '' }; },
  pasteReplace: () => askConfirm('Replace your list of monthly expenses with these?', 'replace', () => { applyExpenseList(parseExpenseList(ui.modal.text), 'replace'); ui.modal = null; ui.budgetInputs = ui.budgetInputs || {}; }, true),
  pasteAdd: () => { applyExpenseList(parseExpenseList(ui.modal.text), 'add'); ui.modal = null; },
  clearReview: () => {
    const n = pending().length;
    if (!n) return;
    askConfirm('Mark all ' + n + ' waiting purchases as already sorted? They stay in Activity but never come out of a pot.', 'mark all', () => { ignoreAllPending(); ui.xref = ui.xref; });
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
  clearHist: () => askConfirm('Remove your income history from this device? Your income sources and deposits stay.', 'remove', () => { S.incomeHistory = []; ui.xref = null; save(); }, true),
  chooseAccts: d => { openPlaid(d.id); return false; },
  syncTop: () => { autoSync(true); return false; },
  toggleAcct: d => { ui.openAcct[d.id] = !ui.openAcct[d.id]; },
  acctActivity: d => { ui.afilter = d.id; ui.tab = 'activity'; ui.resetScroll = true; ui.filter = null; ui.search = ''; },
  moreAct: () => { ui.actLimit = (ui.actLimit || 60) + 60; },
  clearAfilter: () => { ui.afilter = null; },
  syncNow: () => { ui.linkMsg = 'Syncing…'; doSync().then(() => { ui.linkMsg = syncError ? syncError : 'Synced. ' + syncInfo; render(); }); },
  unlinkItem: d => askConfirm('Unlink this bank? Your history in the app stays; no new purchases will arrive.', 'unlink', async () => {
    try {
      const gone = (ui.linkItems || []).find(i => i.item_id === d.id);
      await linkApi('/unlink', { item_id: d.id });
      forgetBankAccounts(d.id, gone && gone.institution);
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
  dlgOk: () => { const d = ui.dialog; if (!d || (d.word && String(d.typed || '').trim().toUpperCase() !== d.word)) return false; ui.dialog = null; if (d.onOk) d.onOk(); },

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
    if (m.editId) {
      if (!updateManualTx(m.editId, { kind: m.kind, amount: m.amount, name: m.name, potId: m.kind === 'purchase' && m.pot !== 'none' ? m.pot : null, date: m.date })) { askAlert('Enter an amount above $0 and a name.'); return; }
      ui.modal = { type: 'tx', id: m.editId }; return;
    }
    if (!addManualTx(m.kind, m.amount, m.name, m.kind === 'purchase' && m.pot !== 'none' ? m.pot : null)) { askAlert('Enter an amount above $0 and a name.'); return; }
    ui.modal = null;
  },
  startFresh: () => {
    askConfirm('Remove the sample transactions and start with empty pots? Your income sources, expenses, to-dos and notes stay.', 'start fresh', () => {
      startFresh(); ui.budgetInputs = {}; ui.editEarn = {}; ui.resetEarn = {};
    }, true);
  },

  // income
  addExtra: d => { ui.modal = { type: 'extra', sel: d.id ? { [d.id]: true } : {}, label: 'Tips', pot: 'spending' }; },
  pickExtra: d => { const s = ui.modal.sel; if (s[d.id]) delete s[d.id]; else s[d.id] = true; },
  extraPot: d => { ui.modal.pot = d.pot; },
  saveExtra: () => { Object.keys(ui.modal.sel).forEach(id => markExtraIncome(id, ui.modal.label, ui.modal.pot)); ui.modal = null; },
  removeExtra: d => removeExtraIncome(d.id),
  editSources: () => { ui.modal = { type: 'sources' }; },
  srcAdd: () => { S.incomeSources.push({ id: uid(), name: '', expectedAmount: 0, variable: false, matchKeyword: '' }); save(); },
  srcDel: d => { S.incomeSources = S.incomeSources.filter(s => s.id !== d.id); save(); },

  // budget
  usePotPct: d => { const p = potById(d.id); if (p) { p.percent = +d.v; save(); } },
  fixedAdd: () => { S.fixedExpenses.push({ id: uid(), name: '', amount: 0 }); save(); },
  fixedDel: d => { S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== d.id); save(); },
  editEarn: d => { const r = budgetCalc().rows.find(x => x.sourceId === d.id); delete ui.resetEarn[d.id]; ui.budgetInputs[d.id] = r ? r.amount : 0; },
  resetEarn: d => { delete ui.budgetInputs[d.id]; ui.resetEarn[d.id] = true; },
  applyBudget: () => {
    const c = budgetCalc(), run = runFor(new Date()), mo = new Date().toLocaleString('en-US', { month: 'long' });
    const msg = run
      ? `${mo} is already applied (Spending +${usd(run.leftover)}, Savings +${usd(run.savingsAmount)}). Updating replaces that with Spending +${usd(c.left)} and Savings +${usd(c.save)}. You can undo it right after.`
      : `Add ${usd(c.left)} to Spending and ${usd(c.save)} to Savings${c.shares.filter(x => x.amount).map(x => ', ' + usd(x.amount) + ' to ' + potName(x.id)).join('')} for ${mo}?`;
    askConfirm(msg, run ? 'update' : 'apply', () => {
      applyBudget(c.rows); ui.budgetInputs = {}; ui.resetEarn = {}; ui.tab = 'home';
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      render(); window.scrollTo(0, 0);
      if (navigator.webdriver) { rainArm(); showRainMsg(); return; }
      /* iOS keeps an "Undo Typing" history for everything typed on the page, and a shake would offer it. A fresh page has none, so the app reloads
         (the budget is already saved) and then waits for the shake. */
      try { sessionStorage.setItem('pl.rain', '1'); sessionStorage.setItem('pl.skiplock', '1'); } catch (e) { /* ignore */ }
      rainPermission().then(() => location.reload());
    });
  },
  undoBudget: () => askConfirm('Put this month\'s budget back the way it was before the last change?', 'undo', () => { undoBudget(); render(); }),
  toggleRun: d => { ui.openRuns[d.key] = !ui.openRuns[d.key]; },


  // backup
  export: () => { exportData(); return false; },
  shareCode: () => { shareCode(); return false; },
  copyCode: () => { copyCode(); return false; },
  restoreCode: () => { restoreCode(); return false; },
  copyConn: () => { copyConn(); return false; },
  useConn: () => { useConn(); return false; },
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
  if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file)$/.test(e.target.type)) { e.preventDefault(); e.target.blur(); return; }   // Enter finishes whatever is being typed
});

/* Keeps only emoji (the first two), dropping letters, numbers and symbols. */
function emojiOnly(s) {
  const m = String(s || '').match(/\p{Extended_Pictographic}(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic})*/gu) || [];
  return m.slice(0, 2).join('');
}
function handleField(el, final) {
  const d = el.dataset;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const find = list => list.find(x => x.id === d.id);
  const m = ui.modal;
  switch (d.change) {
    case 'search':
      ui.search = v; ui.actLimit = 60;
      setHTMLIfChanged($('actList'), activityListHTML());
      return;
    case 'rsearch':
      ui.rsearch = v;
      setHTMLIfChanged($('rvList'), reviewListHTML());
      return;
    // budget
    case 'earnInput': ui.budgetInputs[d.id] = num(v); patchBudget(); return;
    case 'potPct': { const p = potById(el.dataset.id); if (p) { p.percent = Math.min(Math.max(num(v), 0), 100); save(); patchBudget(); } return; }
    case 'savePct': S.savingsPercent = Math.min(Math.max(num(v), 0), 100); save(); patchBudget(); return;
    case 'fixedKey': { const e = find(S.fixedExpenses); if (e) { e.matchKeyword = v.toUpperCase().trim(); save(); } return; }
    case 'pasteText': ui.modal.text = v; setHTMLIfChanged($('pasteOut'), pasteOutHTML()); return;
    case 'fixedName': { const e = find(S.fixedExpenses); if (e) { e.name = v; save(); } return; }
    case 'fixedAmt': { const e = find(S.fixedExpenses); if (e) { e.amount = num(v); save(); patchBudget(); } return; }
    case 'roundMode': S.roundMode = v; save(); return;
    case 'currency': S.settings.currency = v; save(); return;
    case 'lockDelay': setLockDelay(v); return;
    case 'checkMonth': if (final) { ui.checkMonth = v; ui.actual = null; render(); } return;
    case 'actual': ui.actual = v === '' ? null : num(v); patchCheck(); return;
    case 'adjTarget': ui.adjTarget = v; return;
    case 'bulkTarget': ui.bulkTarget = v; return;
    case 'startTab': S.settings.startTab = v; save(); return;
    case 'defaultPot': S.settings.defaultPot = v; save(); return;
    case 'backupDays': S.settings.backupDays = +v; save(); return;
    case 'newCatTitle': ui.newCat.title = v; return;
    case 'newCatIcon': { const e = emojiOnly(v); if (el.value !== e) el.value = e; ui.newCat.icon = e; return; }
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
    case 'txDate': m.date = v; return;
    case 'spendAvail': if (final) { setSpendingAvailable(num(v)); render(); } return;
    case 'dlgType': { const d = ui.dialog; if (d) { d.typed = v; const b = $('dlgOkBtn'); if (b) b.disabled = v.trim().toUpperCase() !== d.word; } return; }
    // pots
    case 'potName': m.fields.name = v; return;
    case 'potIcon': m.fields.icon = v; return;
    case 'potBalance': m.fields.balance = num(v); return;
    case 'potTarget': m.fields.target = num(v); return;
    case 'moveFrom': m.from = v; return;
    case 'moveTo': m.to = v; return;
    case 'moveAmount': m.amount = num(v); return;
    case 'histFiles':
      if (final && el.files && el.files.length) {
        Promise.all([...el.files].map(f => f.text())).then(texts => {
          try { const r = importIncomeHistory(texts.join('\n')); ui.xref = null; askAlert('Read ' + r.added + ' payments from ' + r.years.join(', ') + '.'); }
          catch (err) { askAlert(err.message); }
          render();
        });
      }
      return;
  }
}

document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.live) handleField(e.target, false); });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.change) handleField(e.target, true); });

/* ---------- start ---------- */

/* No back/forward between screens: swiping back never leaves or reshuffles the app. It only closes an open pop-up. */
const navState = () => ({ pl: 'app' });
function syncHistory() { /* intentionally empty: screens are reached only through the tab bar and the page itself */ }
try { history.replaceState({ pl: 'base' }, ''); history.pushState(navState(), ''); } catch (e) { /* ignore */ }
/* Home-screen app: the edge swipe that would go "back" (or out of the app) is swallowed. Extra history entries
   are kept so there is never anywhere to go back to, and touches that start at the very edge don't begin the gesture. */
const STANDALONE = (window.navigator && window.navigator.standalone === true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
if (STANDALONE) {
  document.documentElement.dataset.standalone = '1';
  let edge = false;
  const EDGE = 28, atEdge = t => t && (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE);
  document.addEventListener('touchstart', e => { edge = atEdge(e.touches[0]); if (edge && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (edge && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchend', () => { edge = false; }, true);
  try { for (let i = 0; i < 6; i++) history.pushState(navState(), ''); } catch (e) { /* ignore */ }
}
/* ---------- make it rain ----------
   After a new budget is applied: shake the phone and every color slowly spins through the rainbow while dollar bills fall.
   Shaking needs the phone's motion sensor; iPhone asks permission once, when you tap the button. */
const rain = { on: false, last: 0, hue: 0, raf: 0, prev: 0, spawn: 0, lx: null, ly: null, lz: null, bg: '', timer: 0 };
function rainListen() {
  window.removeEventListener('devicemotion', rainMotion); window.addEventListener('devicemotion', rainMotion);
  clearTimeout(rain.timer); rain.timer = setTimeout(() => window.removeEventListener('devicemotion', rainMotion), 25000);
}
/* Asks for motion access where the phone requires it (must be called from a tap). Resolves to true when shaking can be heard. */
function rainPermission() {
  try {
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')
      return DeviceMotionEvent.requestPermission().then(r => r === 'granted').catch(() => false);
  } catch (e) { /* no motion sensor */ }
  return Promise.resolve(true);
}
function rainArm() { rainPermission().then(ok => { if (ok) rainListen(); }); }
function rainMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a) return;
  const x = a.x || 0, y = a.y || 0, z = a.z || 0;
  if (rain.lx != null && Math.abs(x - rain.lx) + Math.abs(y - rain.ly) + Math.abs(z - rain.lz) > 22) rainShake();
  rain.lx = x; rain.ly = y; rain.lz = z;
}
function hueShift(hex, deg) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  h = (h + deg + 360) % 360;
  const f = k => { const q = (k + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function showRainMsg() {
  hideRainMsg();
  const m = document.createElement('div');
  m.id = 'rainmsg'; m.className = 'card'; m.textContent = 'Make it rain!';
  m.addEventListener('click', () => rainArm());
  document.body.appendChild(m);
  setTimeout(hideRainMsg, 25000);
}
function hideRainMsg() { const m = document.getElementById('rainmsg'); if (m) m.remove(); }
/* Shaking a phone with a text box open makes iOS offer "Undo Typing". Close the text box (and any pop-up) and go to the top of the Dashboard first. */
function shakeReset() {
  const ae = document.activeElement;
  if (ae && ae !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
  if (ui.modal || ui.picker || ui.dialog || ui.tab !== 'home') { ui.modal = null; ui.picker = null; ui.dialog = null; ui.tab = 'home'; render(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function rainShake() {
  shakeReset();
  if (motionOff()) return;
  hideRainMsg();
  rain.last = performance.now();
  if (rain.on) return;
  rain.on = true; rain.prev = 0; rain.hue = 0;
  const rs = document.documentElement;
  rain.bg = (getComputedStyle(rs).getPropertyValue('--bg') || '').trim();
  rs.classList.add('rain');
  rain.raf = requestAnimationFrame(rainFrame);
}
function dropBills(n) {
  let box = document.getElementById('rain');
  if (!box) { box = document.createElement('div'); box.id = 'rain'; document.body.appendChild(box); }
  for (let i = 0; i < n && box.children.length < 70; i++) {
    const b = document.createElement('span');
    b.className = 'bill'; b.textContent = Math.random() < .7 ? '💵' : '💸';
    const dur = 2.4 + Math.random() * 2;
    b.style.cssText = `left:${Math.random() * 96}%;font-size:${22 + Math.random() * 20}px;animation-duration:${dur}s;--dx:${(Math.random() - .5) * 90}px;--rot:${(Math.random() - .5) * 540}deg`;
    b.addEventListener('animationend', () => b.remove());
    box.appendChild(b);
  }
}
function rainFrame(t) {
  const dt = rain.prev ? Math.min(t - rain.prev, 50) : 16; rain.prev = t;
  const rs = document.documentElement, shaking = performance.now() - rain.last < 700;
  const next = rain.hue + dt * 0.2;                      // 200 degrees a second
  if (shaking) {
    rain.hue = next; rain.spawn += dt;
    while (rain.spawn > 110) { rain.spawn -= 110; dropBills(3); }
  } else if (Math.floor(next / 360) > Math.floor(rain.hue / 360)) {   // shaking stopped: finish the turn, then rest
    rs.classList.remove('rain'); rs.style.removeProperty('--hue'); rs.style.removeProperty('--bg');
    rain.on = false; rain.raf = 0; rain.hue = 0; return;
  } else rain.hue = next;
  const deg = rain.hue % 360;
  rs.style.setProperty('--hue', deg + 'deg');
  if (/^#[0-9a-f]{6}$/i.test(rain.bg)) rs.style.setProperty('--bg', hueShift(rain.bg, deg));
  rain.raf = requestAnimationFrame(rainFrame);
}

/* ---------- haptics ----------
   iPhone (iOS 17.4+) plays a tap when a real finger toggles an <input type="checkbox" switch>. So, as in the ios-haptics library
   (github.com/tijnjh/ios-haptics, MIT, by tijn), every button gets an invisible label with a hidden switch laid over it.
   Other phones just buzz on click. */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function hapticTrigger(el) {
  if (!el || !IS_IOS || el.querySelector(':scope > [data-haptic-trigger]')) return;
  const label = document.createElement('label');
  label.setAttribute('data-haptic-trigger', ''); label.setAttribute('aria-hidden', 'true');
  Object.assign(label.style, { position: 'absolute', inset: '0', touchAction: 'manipulation' });
  label.style.setProperty('-webkit-tap-highlight-color', 'transparent');
  const sw = document.createElement('input');
  sw.type = 'checkbox'; sw.setAttribute('switch', ''); sw.tabIndex = -1;
  Object.assign(sw.style, { position: 'absolute', width: '1px', height: '1px', margin: '0', visibility: 'hidden' });
  sw.addEventListener('click', ev => ev.stopPropagation());   // the label re-sends its click to the switch; don't count it twice
  label.append(sw);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.insertAdjacentElement('beforeend', label);
}
const HAPTIC_SEL = 'button, summary, [data-action]:not(input):not(select):not(textarea):not(label)';
let hapticQueued = false;
function hapticSweep() {
  hapticQueued = false;
  if (!IS_IOS) return;
  document.querySelectorAll(HAPTIC_SEL).forEach(hapticTrigger);
}
if (IS_IOS) {
  const queue = () => { if (!hapticQueued) { hapticQueued = true; requestAnimationFrame(hapticSweep); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
} else if (navigator.vibrate) {
  document.addEventListener('click', e => {
    if (S.settings.haptics !== false && e.target.closest && e.target.closest(HAPTIC_SEL)) navigator.vibrate(8);
  }, true);
}
/* A <summary> won't open its details when the click lands on the overlay (interactive content), so open it by hand. */
document.addEventListener('click', e => {
  const trig = e.target.closest && e.target.closest('[data-haptic-trigger]');
  const sum = trig && trig.parentElement;
  if (!sum || sum.tagName !== 'SUMMARY' || !sum.parentElement || sum.parentElement.classList.contains('coll') || sum.parentElement.classList.contains('info')) return;
  sum.parentElement.open = !sum.parentElement.open;
});
function haptic() { if (!IS_IOS && S.settings.haptics !== false && navigator.vibrate) navigator.vibrate(8); }

/* ---------- opening title and the first-run tour ---------- */
const TOUR_KEY = 'pocketledger.tour';
const tourSeen = () => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { return true; } };
const TOUR = [
  { i: '👋', t: 'Hi, I\'m PocketLedger', p: 'Your pocket-sized money buddy. This quick tour takes about a minute, and I promise there\'s no quiz at the end.' },
  { i: '🔗', t: 'Link your accounts', p: 'Tap the round initial at the top right to open Settings, then Bank accounts. Enter your link server address and passphrase, tap "check connection", then "link a bank" and choose which accounts to share. It\'s read-only, so I can look but never move money. Not ready? Add purchases by hand with the + button.' },
  { i: '📥', t: 'Review', p: 'New purchases from your bank land here, like mail. Tap a pot (Spending, Savings, whatever you\'ve made) to sort each one, or say "not a spend" for things like moving your own money.' },
  { i: '🧠', t: 'I learn as you go', p: 'Tell me once that QuikTrip is gas and I\'ll remember it. The more you sort, the smarter I get, and the fewer taps you need.' },
  { i: '🏠', t: 'Dashboard', p: 'Your spending bar and every pot at a glance. Goals show how far along they are, and if you overshoot, they happily say 200%.' },
  { i: '🧾', t: 'Activity', p: 'Every purchase, searchable. Try words like "gas october" or ">50". Tap any purchase to fix its name, category or pot.' },
  { i: '📊', t: 'Budget', p: 'Once a month, line up your earnings, your expenses and how much to save, then apply the budget. It also shows when each goal would be reached, so nudging a percent up is satisfying.' },
  { i: '📄', t: 'Statements', p: 'When a month ends, it gets a statement with the original bank names, ready to save as a PDF. Tax-deductible categories are totaled for you, and you can make your own in Settings.' },
  { i: '🔒', t: 'Yours alone', p: 'Your numbers live on this phone, not on a server. Turn on the app lock in Settings, and back up now and then, because I can\'t recover what I never had.' },
  { i: '📳', t: 'One last thing', p: 'When you finish a new budget there\'s a surprise that needs your phone\'s motion sensor. Allow it now and it\'s ready. For the best experience, add me to your Home Screen from the share menu.', last: true },
];
let tourStep = 0;
function tourHTML() {
  const s = TOUR[tourStep], n = TOUR.length;
  return `<div class="tour-card">
    <div class="tour-top"><span class="muted small">${tourStep + 1} / ${n}</span><button class="link small" data-tour="skip">skip tour</button></div>
    <div class="tour-emoji">${s.i}</div>
    <h2>${esc(s.t)}</h2>
    <div class="tour-text">${esc(s.p)}</div>
    ${s.last ? '<div class="btn-row"><button class="btn" data-tour="motion">allow motion</button></div><div class="muted small" id="tourMotion"></div>' : ''}
    <div class="tour-dots">${TOUR.map((_, k) => `<i class="${k === tourStep ? 'on' : ''}"></i>`).join('')}</div>
    <div class="btn-row">${tourStep ? '<button class="btn" data-tour="back">back</button>' : ''}<button class="btn primary" data-tour="next">${s.last ? 'let\'s go' : 'next'}</button></div>
  </div>`;
}
function tourShow(step) {
  tourStep = step || 0;
  let el = document.getElementById('tour');
  if (!el) { el = document.createElement('div'); el.id = 'tour'; document.body.appendChild(el); el.addEventListener('click', tourClick); }
  el.innerHTML = tourHTML();
}
function tourEnd() {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
  const el = document.getElementById('tour'); if (el) el.remove();
}
function tourClick(e) {
  const b = e.target.closest('[data-tour]'); if (!b) return;
  const k = b.dataset.tour;
  if (k === 'skip') tourEnd();
  else if (k === 'back') tourShow(tourStep - 1);
  else if (k === 'next') { if (tourStep >= TOUR.length - 1) tourEnd(); else tourShow(tourStep + 1); }
  else if (k === 'motion') {
    const note = document.getElementById('tourMotion');
    try {
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')
        DeviceMotionEvent.requestPermission().then(r => { if (note) note.textContent = r === 'granted' ? 'Motion allowed. Nice.' : 'No problem. You can still tap "make it rain!" later to allow it.'; }).catch(() => { if (note) note.textContent = 'Couldn\'t ask here. You\'ll be asked later.'; });
      else if (note) note.textContent = 'This device doesn\'t need a permission for it.';
    } catch (x) { /* ignore */ }
  }
}
function showSplash() {
  if (navigator.webdriver) { const sp = document.getElementById('splash'); if (sp) sp.remove(); return; }   // automated test browsers skip the opening screens
  let again = false;
  try { again = !!sessionStorage.getItem('pl.splash'); sessionStorage.setItem('pl.splash', '1'); } catch (e) { /* still show it */ }
  if (again) { const sp = document.getElementById('splash'); if (sp) sp.remove(); if (!tourSeen() && !document.documentElement.dataset.locked) setTimeout(() => tourShow(0), 300); return; }
  let el = document.getElementById('splash');
  if (!el) { el = document.createElement('div'); el.id = 'splash'; el.innerHTML = '<div><h1>Pocket Ledger</h1><div class="by">by Elijah Halford</div></div>'; document.body.appendChild(el); }
  // the tour is built underneath the title, so the title fades straight into it
  setTimeout(() => { if (!tourSeen() && !document.documentElement.dataset.locked) tourShow(0); }, 1100);
  setTimeout(() => el.classList.add('out'), 1300);
  setTimeout(() => el.remove(), 1900);
}
showSplash();

/* The on-screen keyboard shrinks the visible area; pop-ups follow it so what you type stays in view. */
if (window.visualViewport) {
  const vv = window.visualViewport, rs = document.documentElement.style;
  const fit = () => { rs.setProperty('--vvh', vv.height + 'px'); rs.setProperty('--vvt', vv.offsetTop + 'px'); };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
}
document.addEventListener('focusin', e => {
  if (!e.target.closest || !e.target.closest('.sheet')) return;
  setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 350);
});
window.addEventListener('popstate', () => {
  const hadPopup = !!(ui.modal || ui.picker || ui.dialog);
  if (ui.dialog) ui.dialog = null; else if (ui.picker) ui.picker = null; else if (ui.modal) closeModal();
  try { history.pushState(navState(), ''); } catch (err) { /* ignore */ }
  if (hadPopup) render();
});

function applySettings() {
  const st = S.settings, root = document.documentElement;
  const theme = themeKey();
  if (DEMO) { root.dataset.demo = '1'; document.title = 'PocketLedger · DEMO'; }
  root.dataset.theme = theme; root.dataset.palette = PALETTES.some(p => p[0] === st.palette) ? st.palette : 'harbor'; root.dataset.motion = st.motion; root.dataset.haptics = st.haptics === false ? 'off' : 'on';
  root.style.setProperty('--ts', st.textSize);
  depthSchedule();
  const cs = getComputedStyle(root);
  const read = (n, f) => { const v = cs.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : f; };
  SAGE = read('--sage', SAGE); DIM = read('--fg-dim', DIM);
  const bgHex = read('--bg', '#0d1b1e'), raiseHex = read('--raise', bgHex), dark = lumOf(bgHex) < 0.4;
  ACC = { sage: SAGE, terra: read('--acc-terra', SAGE), amber: read('--acc-amber', SAGE), sky: read('--acc-sky', SAGE), rose: read('--acc-rose', SAGE), green: read('--green', SAGE), red: read('--red', SAGE), fg: read('--fg', '#ffffff'), dim: DIM };
  // Category colors are built from the theme's own accents (and blends of them), so every theme looks like itself.
  const CAT_MIX = { food: ['terra'], groceries: ['green'], gas: ['amber'], bills: ['sage'], shopping: ['rose'], entertainment: ['sky', 'rose'],
    health: ['red'], income: ['green', 'fg'], transfer: ['sky', 'dim'], finance: ['sage', 'green'], other: ['dim'] };
  const CUSTOM_MIX = ['sky', 'amber', 'rose', 'terra', 'green', 'sage'];
  let customN = 0;
  for (const [k, c] of Object.entries(CATS)) {
    const m = CAT_MIX[k] || (c.custom ? [CUSTOM_MIX[customN++ % CUSTOM_MIX.length]] : ['dim']);
    c.color = readableOn(m.length > 1 ? mixHex(ACC[m[0]], ACC[m[1]], 0.5) : ACC[m[0]], [bgHex, raiseHex], dark);
  }
  Object.keys(tintCache).forEach(k => delete tintCache[k]);
  root.dataset.tone = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = read('--bg', '#0d1b1e');
}

/* Tilt needs the phone's motion permission once; ask on the first tap (iOS only shows the question after a tap). */
try {
  if (!localStorage.getItem('pl.motionAsked') && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')
    document.addEventListener('pointerup', () => { try { localStorage.setItem('pl.motionAsked', '1'); } catch (e) { /* ignore */ } rainPermission(); }, { once: true });
} catch (e) { /* ignore */ }
/* ---------- depth motion ----------
   The colored glow behind the cards is two layers that drift at different speeds as you scroll (parallax), and shift a little as you
   tilt the phone (or move the mouse); the light on each card's edge turns with the tilt. Off with Animations off. */
const depth = { tx: 0, ty: 0, cx: 0, cy: 0, base: null, raf: 0, ang: 0, last: '' };
const depthAllowed = () => !motionOff();
function depthFrame() {
  depth.raf = 0;
  const root = document.documentElement;
  if (!depthAllowed()) {
    if (depth.last !== 'off') { ['--p1x', '--p1y', '--p2x', '--p2y', '--tilt-a'].forEach(k => root.style.removeProperty(k)); depth.last = 'off'; depth.ang = 0; }
    return;
  }
  depth.cx += (depth.tx - depth.cx) * 0.14; depth.cy += (depth.ty - depth.cy) * 0.14;
  const y = Math.max(window.scrollY || 0, 0), st = root.style;
  st.setProperty('--p1x', (-depth.cx * 44).toFixed(1) + 'px'); st.setProperty('--p1y', (-120 * Math.tanh(y * 0.11 / 120) - depth.cy * 44).toFixed(1) + 'px');   // drift eases to a stop so the glow never leaves the screen
  st.setProperty('--p2x', (-depth.cx * 90).toFixed(1) + 'px'); st.setProperty('--p2y', (-170 * Math.tanh(y * 0.28 / 170) - depth.cy * 80).toFixed(1) + 'px');
  const ang = Math.round(depth.cx * 14);
  if (ang !== depth.ang) { depth.ang = ang; st.setProperty('--tilt-a', ang + 'deg'); }
  depth.last = 'on';
  if (Math.abs(depth.tx - depth.cx) > 0.002 || Math.abs(depth.ty - depth.cy) > 0.002) depthSchedule();
}
function depthSchedule() { if (!depth.raf) depth.raf = requestAnimationFrame(depthFrame); }
window.addEventListener('scroll', depthSchedule, { passive: true });
window.addEventListener('deviceorientation', e => {
  if (e.beta == null || e.gamma == null) return;
  if (!depth.base) depth.base = { b: e.beta, g: e.gamma };
  depth.base.b += (e.beta - depth.base.b) * 0.02; depth.base.g += (e.gamma - depth.base.g) * 0.02;   // re-centres slowly, so however you hold it becomes "level"
  depth.tx = Math.max(-1, Math.min(1, (e.gamma - depth.base.g) / 20)); depth.ty = Math.max(-1, Math.min(1, (e.beta - depth.base.b) / 20));
  depthSchedule();
}, { passive: true });
if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches)
  window.addEventListener('pointermove', e => { depth.tx = (e.clientX / innerWidth - 0.5) * 2; depth.ty = (e.clientY / innerHeight - 0.5) * 2; depthSchedule(); }, { passive: true });

/* Drag a pop-up down to close it. Starts from the handle/header, or from anywhere when scrolled to the top. */
let drag = null;
const layerClose = layer => { if (layer === 'picker') ui.picker = null; else if (layer === 'dialog') ui.dialog = null; else closeModal(); };
document.addEventListener('touchstart', e => {
  const sheet = e.target.closest && e.target.closest('.sheet');
  if (!sheet || e.touches.length !== 1 || e.target.closest('input, textarea')) { drag = null; return; }
  const fromHead = !!e.target.closest('.grab, .sheet-head');
  // From the body, a drag counts only when the pop-up is scrolled to the top and nothing is selected;
  // the move handler then also requires a clear downward swipe and not a press-and-hold.
  if (!fromHead && (sheet.scrollTop > 0 || String(getSelection ? getSelection() : '').length)) { drag = null; return; }
  drag = { sheet, scrim: sheet.parentElement, layer: sheet.parentElement.dataset.layer, y0: e.touches[0].clientY, x0: e.touches[0].clientX, t0: performance.now(), dy: 0, active: false, fromHead };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!drag) return;
  if (!drag.active && String(getSelection ? getSelection() : '').length) { drag = null; return; }
  const dy = e.touches[0].clientY - drag.y0;
  if (!drag.active) {
    const dx = Math.abs(e.touches[0].clientX - drag.x0);
    if (!drag.fromHead && performance.now() - drag.t0 > 600 && dy < 6) { drag = null; return; }   // press-and-hold = text selection
    if (dy > 10 && dx < dy * 0.7 && (drag.fromHead || drag.sheet.scrollTop <= 0)) { drag.active = true; drag.sheet.style.transition = 'none'; drag.scrim.style.transition = 'none'; }
    else { if (dy < -8 || dx > 14 + Math.max(dy, 0)) drag = null; return; }
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

/* Tap a bank description, date or simplified name to copy it (for searching in the app). Nothing else in the app is selectable. */
let copiedTimer = 0;
document.addEventListener('click', async e => {
  const el = e.target.closest && e.target.closest('.cp[data-copy]');
  if (!el) return;
  const text = el.dataset.copy;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (err) {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e2) { /* nothing to do */ }
  }
  let t = document.getElementById('copied');
  if (!t) { t = document.createElement('div'); t.id = 'copied'; t.className = 'card'; document.body.appendChild(t); }
  t.textContent = ok ? 'Copied' : 'Couldn\u2019t copy';
  t.classList.add('on'); el.classList.add('flash');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { t.classList.remove('on'); el.classList.remove('flash'); }, 1100);
});

/* Windows open and close without re-laying-out every frame: the page snaps to its final layout and everything below is slid
   into place with a transform (FLIP), while the window itself is revealed or hidden with a clip. Nothing is re-measured mid-animation. */
document.addEventListener('click', e => {
  const sum = e.target.closest && e.target.closest('details.coll > summary, details.info > summary');
  if (!sum) return;
  const d = sum.parentElement;
  if (!e.target.closest('[data-haptic-trigger]')) e.preventDefault();   // cancelling a tap on the haptic label would cancel its tap feedback too
  if (d._busy) return;
  if (motionOff() || !d.animate) { d.open = !d.open; return; }
  const opening = !d.open;
  /* The window whose glass has to follow: the dropdown itself, or for a small "Good to know" toggle the window it sits in. */
  const chrome = d.classList.contains('coll') ? d : d.closest('details.coll');
  const before = d.getBoundingClientRect().height, chromeBefore = chrome ? chrome.getBoundingClientRect().height : 0;
  const follow = [];
  for (let n = d; n && n.id !== 'app' && n !== document.body; n = n.parentElement) for (let m = n.nextElementSibling; m; m = m.nextElementSibling) follow.push(m);
  const cs = getComputedStyle(d);
  const padB = parseFloat(cs.paddingBottom) || 0;
  let closedH, delta;
  if (opening) { closedH = before; d.open = true; delta = d.getBoundingClientRect().height - before; }
  else { const sy = window.scrollY; d.open = false; closedH = d.getBoundingClientRect().height; d.open = true; window.scrollTo(0, sy); delta = before - closedH; }   // measure the real closed height, no guessing (and keep the scroll the browser would otherwise clamp)
  if (delta < 2) { d.open = opening; return; }
  d._busy = true;
  const opt = { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' };
  const sign = opening ? -1 : 0, to = opening ? 0 : -1;
  const anims = follow.map(m => m.animate([{ transform: `translateY(${sign * delta}px)` }, { transform: `translateY(${to * delta}px)` }], opt));
  /* the window's own glass (background, edge, shadow) is drawn by a stand-in that grows or shrinks, so its rounded corners and shadow stay right the whole way */
  const shell = document.createElement('div');
  if (chrome) {
    const bw = parseFloat(getComputedStyle(chrome).borderTopWidth) || 0;
    const h0 = chromeBefore, h1 = chromeBefore + (opening ? delta : -delta);
    shell.className = 'card flipshell';
    shell.style.cssText = `top:${-bw}px;left:${-bw}px;right:${-bw}px;`;
    chrome.insertBefore(shell, chrome.firstChild);
    chrome.classList.add('flipping');
    anims.push(shell.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], opt));
  }
  const body = d.querySelector(':scope > .coll-body') || sum.nextElementSibling;
  const cut = Math.max(0, delta - (d === chrome ? padB : 0)), hide = `inset(-12px -12px ${cut}px -12px)`, show = 'inset(-12px -12px 0px -12px)';
  if (body) anims.push(body.animate([{ clipPath: opening ? hide : show }, { clipPath: opening ? show : hide }], opt));
  // closing a window that was keeping the page long: glide the scroll up instead of letting the page snap at the end
  let scrollAnim = 0;
  if (!opening) {
    const maxNow = document.documentElement.scrollHeight - window.innerHeight, maxNew = Math.max(0, maxNow - delta), y0 = window.scrollY;
    if (y0 > maxNew + 1) {
      const t0 = performance.now(), ease = t => 1 - Math.pow(1 - t, 4);
      const step = now => { const t = Math.min(1, (now - t0) / 260); window.scrollTo(0, y0 + (maxNew - y0) * ease(t)); if (t < 1) scrollAnim = requestAnimationFrame(step); };
      scrollAnim = requestAnimationFrame(step);
    }
  }
  let timer = 0;
  const finish = () => {
    clearTimeout(timer);
    if (!d._busy || d._anims !== anims) return; d._busy = false;
    cancelAnimationFrame(scrollAnim);
    if (!opening) d.open = false;
    if (chrome) { chrome.style.transition = 'none'; chrome.classList.remove('flipping'); shell.remove(); }   // hand the glass back with no fade, so there is no seam
    anims.forEach(x => x.cancel());
    if (chrome) { void chrome.offsetHeight; requestAnimationFrame(() => { chrome.style.transition = ''; }); }
  };
  d._anims = anims;
  anims[anims.length - 1].onfinish = finish;
  timer = setTimeout(finish, 600);
});
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d && d.open) setTimeout(() => placeSegs(false), 0);
  if (!d || !d.dataset || !d.dataset.k) return;
  S.settings.coll = S.settings.coll || {};
  const v = d.open ? 'open' : 'shut';
  if (S.settings.coll[d.dataset.k] !== v) { S.settings.coll[d.dataset.k] = v; save(); }
}, true);
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el && el.type === 'search') setTimeout(() => { try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (err) { /* ignore */ } }, 250);
});

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

try {
  if (sessionStorage.getItem('pl.rain') === '1') {
    sessionStorage.removeItem('pl.rain');
    ui.tab = 'home'; render(); rainListen(); showRainMsg();
  }
} catch (e) { /* ignore */ }

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
