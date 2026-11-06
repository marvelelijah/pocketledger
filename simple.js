/* Simple mode: a small, separate budget that lives beside the full app and never touches it.
   Its own storage key, its own screens. It only borrows the app's look (theme colors, emoji tint, formatters), so it can be lifted into a
   standalone app later: it needs usd(), monthKey(), esc(), emo(), tintFilter(), SAGE and EMOJI_GROUPS, nothing from the app's data. */
(function () {
  'use strict';
  const KEY = 'pocketledger.simple.v1';
  const root = document.documentElement;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const num = s => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sym = () => { try { return currencySymbol(); } catch (e) { return '$'; } };

  /* ---------- data ---------- */
  const fresh = () => ({
    active: false, tab: 'pots',
    pots: [
      { id: 'spend', name: 'Spending', icon: '💸', balance: 0, goal: 0, percent: 0, core: true },
      { id: 'save', name: 'Savings', icon: '🏦', balance: 0, goal: 0, percent: 20, core: true },
    ],
    log: [],                                                    // { id, potId, amount (+ in, - out), name, date, kind: spend | add | set | budget }
    budget: { earned: '', expenses: [], applied: null },        // applied: { key, entries: [log ids] }
  });
  function norm(raw) {
    if (raw && Array.isArray(raw.pots)) {
      const s = Object.assign(fresh(), raw);
      s.budget = Object.assign(fresh().budget, raw.budget || {});
      if (!s.pots.some(p => p.id === 'spend')) s.pots.unshift(fresh().pots[0]);
      if (!s.pots.some(p => p.id === 'save')) s.pots.splice(1, 0, fresh().pots[1]);
      return s;
    }
    return fresh();
  }
  function load() {
    try { return norm(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh(); }   // first run, or storage unavailable
  }
  let D = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* private mode: it just won't persist */ } };
  const pot = id => D.pots.find(p => p.id === id);
  const nowIso = () => new Date().toISOString();
  function addLog(potId, amount, kind, name) {
    const e = { id: uid(), potId, amount: r2(amount), name: name || '', date: nowIso(), kind };
    D.log.unshift(e); return e;
  }

  /* ---------- the plan (budget tab) ---------- */
  function plan() {
    const earned = Math.max(num(D.budget.earned), 0);
    const exp = r2(D.budget.expenses.reduce((a, e) => a + Math.max(num(e.amount), 0), 0));
    const diff = r2(earned - exp), left = Math.max(diff, 0);
    const others = D.pots.filter(p => p.id !== 'spend');
    const shares = others.map(p => ({ id: p.id, pct: Math.max(num(p.percent), 0), amt: r2(left * Math.max(num(p.percent), 0) / 100) }));
    const totalPct = shares.reduce((a, s) => a + s.pct, 0);
    const spend = r2(left - shares.reduce((a, s) => a + s.amt, 0));
    return { earned, exp, diff, left, over: diff < 0, shares, totalPct, spend, spendPct: Math.max(100 - totalPct, 0), bad: totalPct > 100 };
  }
  function applyPlan() {
    const p = plan();
    if (p.bad || p.earned <= 0 || p.over) return false;
    const key = monthKey(new Date());
    if (D.budget.applied) {                                     // applying a month again replaces it, so nothing double counts
      D.log = D.log.filter(e => {
        if (!D.budget.applied.entries.includes(e.id)) return true;
        const pt = pot(e.potId); if (pt) pt.balance = r2(pt.balance - e.amount);
        return false;
      });
    }
    const ids = [];
    const put = (potId, amt) => { if (amt > 0) { pot(potId).balance = r2(pot(potId).balance + amt); ids.push(addLog(potId, amt, 'budget', 'Budget').id); } };
    put('spend', p.spend); p.shares.forEach(s => put(s.id, s.amt));
    pot('spend').goal = Math.max(pot('spend').balance, 0);      // the month's spending money: the bar shows how much of it is left
    D.budget.applied = { key, entries: ids };
    save(); return true;
  }

  /* ---------- screen ---------- */
  const V = { layer: null };   // layer: { type: 'pad'|'entry'|'pot', ... }
  let el = null;
  const barPrev = {};
  const money = n => usd(n);
  const tint = () => tintFilter(SAGE);
  const emoS = ch => `<span class="emo" style="filter:${tint()}">${ch}</span>`;
  const when = iso => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };

  function barHTML(key, pct) {
    return `<div class="bar thick"><div data-sbar="${key}" data-w="${Math.round(Math.min(Math.max(pct, 0), 1) * 100)}"></div></div>`;
  }
  function potLabel(p) {
    if (!(p.goal > 0)) return p.id === 'spend' ? 'Run the budget to set this month\'s spending money' : 'No goal set';
    const raw = Math.max(p.balance / p.goal, 0);
    return p.id === 'spend' ? `${Math.round(raw * 100)}% of ${money(p.goal)} left` : `${Math.round(raw * 100)}% of ${money(p.goal)} goal`;
  }
  const pctOf = p => p.goal > 0 ? p.balance / p.goal : 0;

  function potsHTML() {
    const sp = pot('spend');
    const others = D.pots.filter(p => p.id !== 'spend');
    const cells = others.map(p => `<div class="card pot sm-pot" data-sm="pad" data-id="${esc(p.id)}">
        <div class="muted small">${emoS(p.icon)} ${esc(p.name)}</div>
        <div class="big ${p.balance < 0 ? 'neg' : ''}">${money(p.balance)}</div>
        ${barHTML(p.id, pctOf(p))}<div class="muted small">${potLabel(p)}</div></div>`);
    cells.push(`<button class="btn dashed sm-add" data-sm="addpot">+ add pot</button>`);
    const rows = D.log.slice(0, 120).map(e => {
      const p = pot(e.potId) || { icon: '🏷️', name: '' };
      const label = e.name || { spend: 'Spent', add: 'Added', set: 'Balance set', budget: 'Budget' }[e.kind];
      return `<button class="sm-row" data-sm="entry" data-id="${esc(e.id)}"><span class="sm-l"><span class="${e.name ? '' : 'muted'}">${emoS(p.icon)} ${esc(label)}</span><span class="muted small">${when(e.date)}</span></span><b class="${e.amount < 0 ? '' : 'pos'}">${e.amount < 0 ? '−' : '+'}${money(Math.abs(e.amount))}</b></button>`;
    }).join('');
    return `<div class="card pot sm-spend" data-sm="pad" data-id="spend">
        <div class="muted small">${emoS(sp.icon)} ${esc(sp.name)}</div>
        <div class="big ${sp.balance < 0 ? 'neg' : ''}">${money(sp.balance)}</div>
        ${barHTML('spend', pctOf(sp))}<div class="muted small">${potLabel(sp)}</div></div>
      <div class="sm-grid">${cells.join('')}</div>
      <div class="day">History</div>
      ${rows ? `<div class="card sm-hist">${rows}</div><div class="muted small sm-hint">Tap an entry to name it.</div>` : `<div class="empty"><b>Nothing yet</b>Tap Spending and type what you spent.</div>`}`;
  }

  function whyHTML(p) {
    if (p.earned <= 0) return '<div class="sm-why">Start with what you earned this month, then add the bills you pay every month. I\'ll show you how much to save and how much you can spend.</div>';
    if (p.over) return `<div class="sm-why bad"><b>Your expenses are more than you earned.</b> You earned ${money(p.earned)} but your expenses add up to ${money(p.exp)}, so you're ${money(Math.abs(p.diff))} short and nothing is left to save or spend. Check that your earnings are right, or look for an expense you can lower or drop.</div>`;
    if (p.bad) return `<div class="sm-why bad"><b>Those percentages add up to ${r2(p.totalPct)}%.</b> Only 100% of what's left can be shared out, so lower one of them. Spending gets whatever isn't given to a pot.</div>`;
    return '';
  }
  function outHTML() {
    const p = plan();
    const row = (l, v, cls) => `<div class="row sm-line ${cls || ''}"><span>${l}</span><b>${v}</b></div>`;
    const why = whyHTML(p);
    return `${row('Earned', money(p.earned))}${row('Expenses', '−' + money(p.exp))}${row(p.over ? 'Short by' : 'Left after expenses', p.over ? '−' + money(Math.abs(p.diff)) : money(p.left), p.over ? 'neg' : '')}
      ${why}
      ${p.earned > 0 && !p.over && !p.bad ? `<div class="day">Where it goes</div>
      ${p.shares.map(s => { const pt = pot(s.id); return row(`${emoS(pt.icon)} ${esc(pt.name)} · ${r2(s.pct)}%`, '+' + money(s.amt)); }).join('')}
      ${row(`${emoS(pot('spend').icon)} Spending · ${r2(p.spendPct)}%`, '+' + money(p.spend))}` : ''}`;
  }
  function budgetHTML() {
    const b = D.budget;
    const exps = b.expenses.map(e => `<div class="sm-exp"><input placeholder="Expense" value="${esc(e.name)}" data-sin="ename" data-id="${esc(e.id)}" autocapitalize="sentences"><input type="number" inputmode="decimal" step="any" placeholder="0" value="${e.amount === '' ? '' : esc(e.amount)}" data-sin="eamt" data-id="${esc(e.id)}"><button class="link danger nowrap" data-sm="delexp" data-id="${esc(e.id)}">×</button></div>`).join('');
    const pcts = D.pots.filter(p => p.id !== 'spend').map(p => `<div class="sm-exp"><span class="sm-pn">${emoS(p.icon)} ${esc(p.name)}</span><input type="number" inputmode="decimal" step="any" value="${p.percent || ''}" placeholder="0" data-sin="pct" data-id="${esc(p.id)}"><span class="muted">%</span></div>`).join('');
    const ap = b.applied;
    return `<div class="card"><div class="muted small">Total earned this month</div>
        <input class="sm-earned" type="number" inputmode="decimal" step="any" placeholder="0.00" value="${esc(b.earned)}" data-sin="earned"></div>
      <div class="card"><div class="muted small">Expenses</div>
        <div class="stack">${exps || '<div class="muted small">Add rent, bills, subscriptions, anything that comes out every month.</div>'}</div>
        <button class="btn dashed full" style="margin-top:10px" data-sm="addexp">+ add expense</button></div>
      <div class="card"><div class="muted small">Split what's left</div>
        <div class="stack">${pcts}</div><div class="muted small" style="margin-top:6px">Spending gets whatever is left over.</div></div>
      <div class="card"><div id="sm-out">${outHTML()}</div></div>
      <button class="btn primary full" data-sm="applyplan">${ap && ap.key === monthKey(new Date()) ? 'replace this month in my pots' : 'add to my pots'}</button>
      <div class="muted small sm-hint">${ap ? `Last applied ${esc(monthLabel(ap.key))}. Applying again replaces it, nothing double counts.` : 'Adds each amount to its pot and starts the spending bar.'}</div>
      <div class="btn-row" style="margin-top:22px"><button class="btn danger" data-sm="reset">reset simple mode</button></div>`;
  }

  /* sheets */
  function layerHTML() {
    const L = V.layer;
    if (!L) return '';
    if (L.type === 'pad') {
      const p = pot(L.id);
      return `<div class="scrim in" data-sm="scrim"><div class="sheet small smpad"><div class="grab"></div>
        <div class="sheet-head"><b>${emoS(p.icon)} ${esc(p.name)} · ${money(p.balance)}</b><button class="link" data-sm="editpot">edit</button></div>
        <div class="sm-amt" id="sm-amt">${amtText(L.str)}</div>
        <div class="numpad">${'123456789'.split('').map(n => `<button type="button" class="btn key" data-key="${n}">${n}</button>`).join('')}<button type="button" class="btn key" data-key=".">.</button><button type="button" class="btn key" data-key="0">0</button><button type="button" class="btn key del" data-key="del">⌫</button></div>
        <div class="btn-row"><button class="btn" data-sm="plus">+ add</button><button class="btn primary" data-sm="sub">− subtract</button></div></div></div>`;
    }
    if (L.type === 'entry') {
      const e = D.log.find(x => x.id === L.id), p = e && pot(e.potId);
      if (!e) return '';
      return `<div class="scrim in" data-sm="scrim"><div class="sheet small"><div class="grab"></div>
        <div class="sheet-head"><b>Entry</b></div>
        <div class="row"><span>${p ? emoS(p.icon) + ' ' + esc(p.name) : ''}</span><b class="${e.amount < 0 ? '' : 'pos'}">${e.amount < 0 ? '−' : '+'}${money(Math.abs(e.amount))}</b></div>
        <div class="muted small" style="margin:2px 0 10px">${when(e.date)}</div>
        <input id="sm-name" placeholder="Name this (e.g. Lunch)" value="${esc(e.name)}" maxlength="60" autocapitalize="sentences" enterkeyhint="done">
        <div class="btn-row"><button class="btn primary" data-sm="savename">save</button><button class="btn danger" data-sm="undo">undo this entry</button></div></div></div>`;
    }
    if (L.type === 'pot') {
      const core = L.id && pot(L.id) && pot(L.id).core;
      return `<div class="scrim in" data-sm="scrim"><div class="sheet small"><div class="grab"></div>
        <div class="sheet-head"><b>${L.id ? 'Edit pot' : 'New pot'}</b></div>
        <div class="stack">
          <div class="field"><span class="muted">Name</span><input id="sm-pname" value="${esc(L.name)}" placeholder="Name" maxlength="24" data-sin="pname" autocapitalize="words"></div>
          <div class="field"><span class="muted">Icon</span><button class="btn" data-sm="pickicon" style="width:90px">${emoS(L.icon)}</button></div>
          <div class="field"><span class="muted">${L.id === 'spend' ? 'This month\'s amount' : 'Goal (optional)'}</span><input type="number" inputmode="decimal" step="any" placeholder="0" value="${L.goal || ''}" data-sin="pgoal"></div>
        </div>
        <div class="btn-row"><button class="btn primary" data-sm="savepot">save</button>${L.id && !core ? `<button class="btn danger" data-sm="delpot">${L.confirm ? 'tap again to delete' : 'delete pot'}</button>` : ''}</div></div></div>`;
    }
    if (L.type === 'emoji') {
      return `<div class="scrim in" data-sm="scrim"><div class="sheet small emojisheet"><div class="grab"></div>
        <div class="sheet-head"><b>Icon</b></div>
        ${EMOJI_GROUPS.map(([name, list]) => `<div class="day">${esc(name)}</div><div class="optgrid emojigrid" style="filter:${tint()}">${list.split(' ').map(e => `<button class="opt nohap ${e === L.pick.icon ? 'on' : ''}" data-sm="emoji" data-v="${e}">${e}</button>`).join('')}</div>`).join('')}
        </div></div>`;
    }
    return '';
  }
  function amtText(str) {
    const [i, d] = String(str || '').split('.');
    const head = (i || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sym() + head + (str && str.includes('.') ? '.' + (d || '') : '');
  }

  function paintBars() {
    const bars = [...el.querySelectorAll('[data-sbar]')];
    const reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof S !== 'undefined' && S.settings && S.settings.motion === 'off');
    bars.forEach(b => { const k = b.dataset.sbar, w = +b.dataset.w; const from = reduce || barPrev[k] == null ? w : barPrev[k]; barPrev[k] = w; b.style.transition = 'none'; b.style.transform = 'scaleX(' + from / 100 + ')'; });
    void el.offsetWidth;
    bars.forEach(b => { b.style.transition = ''; b.style.transform = 'scaleX(' + b.dataset.w / 100 + ')'; });
  }
  function paintMain(keepScroll) {
    const m = el.querySelector('.sm-main'), y = keepScroll ? m.scrollTop : 0;
    m.innerHTML = `<div class="sm-wrap">${D.tab === 'budget' ? budgetHTML() : potsHTML()}</div>`;
    m.scrollTop = y;
    el.querySelectorAll('.sm-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === D.tab));
    paintBars();
  }
  function paintLayer() {
    const lay = el.querySelector('.sm-layer');
    lay.innerHTML = layerHTML();
    if (V.layer && V.layer.type === 'entry') { const i = $('sm-name'); if (i) setTimeout(() => i.focus(), 60); }
  }

  function build() {
    el = document.createElement('div');
    el.id = 'simple';
    el.innerHTML = `<div class="sm-main"></div>
      <nav class="sm-tabs"><button data-sm="tab" data-tab="pots"><span class="i">${emoS('💸')}</span>spending</button><button data-sm="tab" data-tab="budget"><span class="i">${emoS('🧾')}</span>budget</button></nav>
      <div class="sm-layer"></div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', e => {
      const k = e.target.closest && e.target.closest('[data-key]');
      if (!k || !V.layer || V.layer.type !== 'pad') return;
      e.preventDefault();
      key(k.dataset.key);
    });
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches('input')) return;
      e.preventDefault();
      if (V.layer && V.layer.type === 'entry') act('savename'); else e.target.blur();
    });
  }

  function key(k) {
    const L = V.layer; let s = L.str || '';
    if (k === 'del') s = s.slice(0, -1);
    else if (k === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
    else { const d = s.split('.')[1]; if ((s.includes('.') && d.length >= 2) || s.replace('.', '').length >= 9) return; s = s === '0' ? k : s + k; }
    L.str = s;
    const a = $('sm-amt'); if (a) a.textContent = amtText(s);
  }

  function onInput(e) {
    const t = e.target, f = t.dataset && t.dataset.sin;
    if (!f) return;
    const id = t.dataset.id;
    if (f === 'earned') D.budget.earned = t.value;
    else if (f === 'ename') { const x = D.budget.expenses.find(q => q.id === id); if (x) x.name = t.value; }
    else if (f === 'eamt') { const x = D.budget.expenses.find(q => q.id === id); if (x) x.amount = t.value; }
    else if (f === 'pct') { const x = pot(id); if (x) x.percent = t.value === '' ? 0 : num(t.value); }
    else if (f === 'pname') V.layer.name = t.value;
    else if (f === 'pgoal') V.layer.goal = t.value;
    if (['earned', 'ename', 'eamt', 'pct'].includes(f)) { const o = $('sm-out'); if (o) o.innerHTML = outHTML(); }
    save();
  }

  function act(a, t) {
    const L = V.layer, id = t && t.dataset.id;
    switch (a) {
      case 'tab':
        D.tab = t.dataset.tab; save();
        if (ui.tab === 'settings') { ui.tab = ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'review'; ui.resetScroll = true; render(); }
        paintMain(); return;
      case 'pad': V.layer = { type: 'pad', id, str: '' }; paintLayer(); return;
      case 'close': case 'scrim':
        if (L && L.type === 'emoji') V.layer = L.pick; else if (L && L.type === 'pot' && L.id) V.layer = { type: 'pad', id: L.id, str: '' }; else V.layer = null;
        paintLayer(); return;
      case 'sub': case 'plus': {
        const v = r2(num(L.str)); if (!(v > 0)) return;
        const p = pot(L.id), sign = a === 'sub' ? -1 : 1;
        p.balance = r2(p.balance + sign * v);
        addLog(p.id, sign * v, sign < 0 ? 'spend' : 'add');
        save(); V.layer = null; paintLayer(); paintMain(true); return;
      }
      case 'editpot': { const p = pot(L.id); V.layer = { type: 'pot', id: p.id, name: p.name, icon: p.icon, goal: p.goal || '' }; paintLayer(); return; }
      case 'padback': V.layer = { type: 'pad', id: L.id, str: '' }; paintLayer(); return;
      case 'addpot': V.layer = { type: 'pot', id: null, name: '', icon: '🎯', goal: '' }; paintLayer(); return;
      case 'pickicon': V.layer = { type: 'emoji', pick: L }; paintLayer(); return;
      case 'emoji': { const back = L.pick; back.icon = t.dataset.v; V.layer = back; paintLayer(); return; }
      case 'emojiback': V.layer = L.pick; paintLayer(); return;
      case 'savepot': {
        const name = (L.name || '').trim() || 'New pot', goal = Math.max(r2(num(L.goal)), 0);
        if (L.id) { const p = pot(L.id); p.name = name; p.icon = L.icon; p.goal = goal; }
        else D.pots.push({ id: uid(), name, icon: L.icon, balance: 0, goal, percent: 0, core: false });
        save(); V.layer = null; paintLayer(); paintMain(true); return;
      }
      case 'delpot': {
        if (!L.confirm) { L.confirm = true; paintLayer(); return; }
        D.pots = D.pots.filter(p => p.id !== L.id); D.log = D.log.filter(e => e.potId !== L.id);
        save(); V.layer = null; paintLayer(); paintMain(true); return;
      }
      case 'entry': V.layer = { type: 'entry', id }; paintLayer(); return;
      case 'savename': {
        const e = D.log.find(x => x.id === L.id), i = $('sm-name');
        if (e && i) { e.name = i.value.trim(); save(); }
        V.layer = null; paintLayer(); paintMain(true); return;
      }
      case 'undo': {
        const e = D.log.find(x => x.id === L.id);
        if (e) { const p = pot(e.potId); if (p) p.balance = r2(p.balance - e.amount); D.log = D.log.filter(x => x !== e); save(); }
        V.layer = null; paintLayer(); paintMain(true); return;
      }
      case 'addexp': { const x = { id: uid(), name: '', amount: '' }; D.budget.expenses.push(x); save(); paintMain(true); const i = el.querySelector(`[data-sin="ename"][data-id="${x.id}"]`); if (i) i.focus(); return; }
      case 'delexp': D.budget.expenses = D.budget.expenses.filter(x => x.id !== id); save(); paintMain(true); return;
      case 'applyplan': if (applyPlan()) { D.tab = 'pots'; save(); paintMain(); } else { const o = $('sm-out'); if (o) { o.classList.remove('shake'); void o.offsetWidth; o.classList.add('shake'); o.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } return;
      case 'reset': {
        if (t.dataset.sure) { const tab = D.tab; D = fresh(); D.active = true; D.tab = tab; save(); paintMain(); return; }
        t.dataset.sure = '1'; t.textContent = 'tap again to erase simple mode'; setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'reset simple mode'; } }, 3500); return;
      }
    }
  }
  function onClick(e) {
    const t = e.target.closest && e.target.closest('[data-sm]');
    if (!t) return;
    if (t.dataset.sm === 'scrim' && e.target !== t) return;       // only a tap on the dim area closes a sheet
    act(t.dataset.sm, t);
  }

  /* ---------- open / close ---------- */
  function open() {
    if (!el) build();
    D.active = true; save();
    root.dataset.simple = '1';
    V.layer = null;
    try { if (ui.tab === 'settings') ui.tab = ui.prevTab && ui.prevTab !== 'settings' ? ui.prevTab : 'review'; ui.resetScroll = true; render(); } catch (e) { /* the app redraws itself next time */ }
    paintMain(); paintLayer();
  }
  function close() {
    D.active = false; save();
    delete root.dataset.simple;
    V.layer = null;
    if (el) { el.remove(); el = null; }
    try { render(); } catch (e) { /* the app redraws itself next time */ }
  }
  /* for backups: everything Simple mode holds, and putting it back (staying in or out of simple mode as you are now) */
  function snapshot() { return JSON.parse(JSON.stringify(D)); }
  function restore(data) { const was = D.active; D = norm(data); D.active = was; save(); if (el) { V.layer = null; paintMain(); paintLayer(); } }
  function erase() { D = fresh(); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } delete root.dataset.simple; if (el) { el.remove(); el = null; } }
  window.Simple = { open, close, active: () => !!D.active, snapshot, restore, erase };
  if (D.active) open();
})();
