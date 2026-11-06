/* Ledgend app lock. Plain JavaScript, loaded after app.js.
   What it is: a screen lock in front of the app, opened with a numeric passcode on an on-screen number pad.
   What it is not: encryption. Your data still sits in this browser's storage; the lock keeps people who pick up
   your phone out of the app, and your phone's own passcode is what protects the storage itself.
   The passcode is never stored, only a salted PBKDF2 hash of it, in its own storage key that is left out of backups. */

const LOCK_KEY = 'pocketledger.lock';
const root = document.documentElement;

const lockCfg = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || null; } catch (e) { return null; } };
const saveLockCfg = c => { try { if (c) localStorage.setItem(LOCK_KEY, JSON.stringify(c)); else localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ } };
const lockOn = () => !!(lockCfg() && lockCfg().hash);

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function hashPass(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function setPasscode(pass) {
  const salt = rand(16), iter = 150000;
  const c = lockCfg() || { delay: 60 };
  c.salt = b64(salt); c.iter = iter; c.hash = await hashPass(pass, salt, iter);
  saveLockCfg(c);
}
async function checkPasscode(pass) {
  const c = lockCfg();
  if (!c || !c.hash) return true;
  return (await hashPass(pass, unb64(c.salt), c.iter)) === c.hash;
}

/* ---------- the full-screen box that asks for a passcode ---------- */
let overlay = null;

/* opts: title, sub, fields [{ph}], ok, cancel, forgot, check(values) -> error text or '' (may be async). Resolves to the values, or null if cancelled.
   Passcodes are digits only, typed on an on-screen number pad (no keyboard). With no fields it is just a confirm box. */
function askPass(opts) {
  return new Promise(resolve => {
    if (overlay) overlay.remove();
    const el = document.createElement('div');
    el.id = 'lockov';
    const mk = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
    const box = mk('div', 'lock-box');
    box.appendChild(mk('h1', '', opts.title));
    if (opts.sub) box.appendChild(mk('div', 'muted small lock-sub', opts.sub));
    const fields = opts.fields || [];
    const vals = fields.map(() => '');
    let cur = 0;
    const slots = fields.map((f, n) => {
      const w = mk('div', 'pin-field'); w.appendChild(mk('div', 'muted small', f.ph || ''));
      const dots = mk('div', 'pin-dots'); w.appendChild(dots);
      w.onclick = () => { cur = n; paint(); };
      box.appendChild(w); return { w, dots };
    });
    const err = mk('div', 'err', ''); box.appendChild(err);
    const okBtn = mk('button', 'btn primary', opts.ok || 'ok');
    const paint = () => {
      slots.forEach((s, n) => {
        s.w.classList.toggle('on', n === cur);
        s.dots.textContent = vals[n].length ? '\u25CF '.repeat(vals[n].length).trim() : '\u00A0';
      });
      okBtn.textContent = cur < fields.length - 1 ? 'next' : (opts.ok || 'ok');
    };
    if (fields.length) {
      const pad = mk('div', 'numpad');
      const key = (label, fn, cls) => { const k = mk('button', 'btn key' + (cls ? ' ' + cls : ''), label); k.type = 'button'; k.addEventListener('pointerdown', ev => { ev.preventDefault(); err.textContent = ''; fn(); paint(); }); k.addEventListener('click', ev => ev.preventDefault()); return k; };
      '123456789'.split('').forEach(n => pad.appendChild(key(n, () => { if (vals[cur].length < 12) vals[cur] += n; })));
      pad.appendChild(mk('span'));
      pad.appendChild(key('0', () => { if (vals[cur].length < 12) vals[cur] += '0'; }));
      pad.appendChild(key('\u232B', () => { vals[cur] = vals[cur].slice(0, -1); }, 'del'));
      box.appendChild(pad);
    }
    const row = mk('div', 'btn-row');
    row.appendChild(okBtn);
    if (opts.cancel) { const c = mk('button', 'btn', 'cancel'); c.onclick = () => done(null); row.appendChild(c); }
    box.appendChild(row);
    if (opts.forgot) { const f = mk('button', 'link small danger', 'Forgot it? Erase this device and start over'); f.onclick = opts.forgot; box.appendChild(f); }
    el.appendChild(box);
    document.body.appendChild(el);
    overlay = el;
    paint();

    let fails = 0, wait = 0;
    function done(v) { if (overlay === el) overlay = null; el.remove(); resolve(v); }
    async function submit() {
      if (cur < fields.length - 1) { cur++; paint(); return; }
      if (wait > Date.now()) { err.textContent = 'Too many tries. Wait ' + Math.ceil((wait - Date.now()) / 1000) + ' seconds.'; return; }
      const msg = opts.check ? await opts.check(vals.slice()) : '';
      if (msg) {
        err.textContent = msg; vals.fill(''); cur = 0; paint();
        if (opts.limit && ++fails >= 5) { wait = Date.now() + 30000; fails = 0; }
        return;
      }
      done(vals.slice());
    }
    okBtn.onclick = submit;
  });
}

/* ---------- locking and unlocking ---------- */
let locked = false;
async function lockNow() {
  if (!lockOn() || locked) return;
  locked = true; root.dataset.locked = '1';
  const nm = (typeof S !== 'undefined' && S.settings && S.settings.name || '').trim();
  const res = await askPass({ title: 'locked', sub: nm ? 'Welcome back, ' + nm + '.' : 'Enter your passcode.', fields: [{ ph: 'passcode' }], ok: 'unlock', limit: true,
    check: async v => (await checkPasscode(v[0])) ? '' : 'That isn\'t it.', forgot: () => forgotFlow() });
  if (res) { locked = false; delete root.dataset.locked; }
}
function forgotFlow() {
  askPass({ title: 'erase', sub: 'The passcode can\'t be recovered. This erases everything on this device so you can start over (restore a backup afterwards). Tap erase to confirm.',
    fields: [], ok: 'erase', cancel: true }).then(res => {
    if (!res) { locked = false; lockNow(); return; }
    try { localStorage.removeItem('pocketledger.v1'); localStorage.removeItem('pocketledger.simple.v1'); localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
}

/* ask for the passcode before a sensitive step */
async function authenticate(title) {
  if (!lockOn()) return true;
  const res = await askPass({ title: title || 'confirm', sub: 'Enter your passcode to continue.', fields: [{ ph: 'passcode' }], ok: 'continue', cancel: true, limit: true,
    check: async v => (await checkPasscode(v[0])) ? '' : 'That isn\'t it.' });
  return !!res;
}

async function lockSetup() {
  const res = await askPass({ title: 'passcode', sub: 'Choose a passcode of 4 to 12 digits. It can\'t be recovered: if you forget it, the only way back in is to erase this device and restore a backup.',
    fields: [{ ph: 'new passcode' }, { ph: 'type it again' }], ok: 'save', cancel: true,
    check: v => v[0].length < 4 ? 'Use at least 4 digits.' : v[0] !== v[1] ? 'They don\'t match.' : '' });
  if (!res) return;
  await setPasscode(res[0]);
  render();
}
async function lockChange() {
  if (!(await authenticate('current passcode'))) return;
  await lockSetup();
}
async function lockOff() {
  if (!(await authenticate('turn off lock'))) return;
  saveLockCfg(null); S.settings.lockSensitive = false; save(); delete root.dataset.locked; render();
}
function setLockDelay(v) { const c = lockCfg(); if (c) { c.delay = +v; saveLockCfg(c); } }

/* Lock again when the app has been away longer than the chosen time. */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  const c = lockCfg();
  if (!c || !c.hash) return;
  if (document.hidden) { hiddenAt = Date.now(); if (c.delay === 0 && !locked) { locked = false; root.dataset.locked = '1'; } return; }
  if (!locked && hiddenAt && Date.now() - hiddenAt >= (c.delay || 0) * 1000) lockNow();
  else if (!locked) delete root.dataset.locked;
});

/* Sensitive steps (backup, restore, erase) ask for the passcode first when you turned that on. */
['export', 'shareCode', 'copyCode', 'restoreCode', 'abCopy', 'abRestore', 'cloudNow', 'cloudRestore', 'eraseAll', 'clearTx', 'stmtPrint', 'stmtShare', 'stmtCsv'].forEach(n => {
  const orig = ACTIONS[n];
  if (!orig) return;
  ACTIONS[n] = (d, el) => {
    if (!lockOn() || !S.settings.lockSensitive) return orig(d, el);
    authenticate().then(ok => { if (ok) { const r = orig(d, el); if (r !== false) render(); } });
    return false;
  };
});
Object.assign(ACTIONS, {
  lockSetup: () => { lockSetup(); return false; },
  lockChange: () => { lockChange(); return false; },
  lockOff: () => { lockOff(); return false; },
  lockNow: () => { lockNow(); return false; },
  setSens: d => { S.settings.lockSensitive = d.pot === 'on'; save(); },
});

let skipLock = false;   // the app reloads itself once after a new budget (see "make it rain"); that shouldn't ask for the passcode again
try { skipLock = sessionStorage.getItem('pl.skiplock') === '1'; sessionStorage.removeItem('pl.skiplock'); } catch (e) { /* ignore */ }
if (lockOn() && !skipLock) lockNow();
else delete root.dataset.locked;
