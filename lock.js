/* PocketLedger app lock. Plain JavaScript, loaded after app.js.
   What it is: a screen lock in front of the app, opened with a passcode or (when this device offers it) Face ID / Touch ID.
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
  const c = lockCfg() || { delay: 60, cred: null };
  c.salt = b64(salt); c.iter = iter; c.hash = await hashPass(pass, salt, iter);
  saveLockCfg(c);
}
async function checkPasscode(pass) {
  const c = lockCfg();
  if (!c || !c.hash) return true;
  return (await hashPass(pass, unb64(c.salt), c.iter)) === c.hash;
}

/* ---------- Face ID / Touch ID through the device's built-in passkey check ---------- */
async function bioAvailable() {
  try { return !!(window.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
}
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), rp: { name: 'PocketLedger' }, user: { id: rand(16), name: 'pocketledger', displayName: 'PocketLedger' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000, attestation: 'none' } });
  return b64(cred.rawId);
}
async function bioVerify(id) {
  await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000 } });
  return true;
}

/* ---------- the full-screen box that asks for a passcode ---------- */
let overlay = null;

/* opts: title, sub, fields [{ph}], ok, cancel, bio, forgot, check(values) -> error text or '' (may be async). Resolves to the values, or null if cancelled. */
function askPass(opts) {
  return new Promise(resolve => {
    if (overlay) overlay.remove();
    const el = document.createElement('div');
    el.id = 'lockov';
    const mk = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
    const box = mk('div', 'lock-box');
    box.appendChild(mk('h1', '', opts.title));
    if (opts.sub) box.appendChild(mk('div', 'muted small lock-sub', opts.sub));
    const inputs = (opts.fields || []).map(f => {
      const i = mk('input'); i.type = 'password'; i.placeholder = f.ph || ''; i.autocomplete = 'off'; i.setAttribute('autocapitalize', 'off'); i.setAttribute('autocorrect', 'off'); i.spellcheck = false;
      box.appendChild(i); return i;
    });
    const err = mk('div', 'err', ''); box.appendChild(err);
    const row = mk('div', 'btn-row');
    const okBtn = mk('button', 'btn primary', opts.ok || 'ok');
    row.appendChild(okBtn);
    let bioBtn = null;
    if (opts.bio) { bioBtn = mk('button', 'btn', 'use Face ID'); row.appendChild(bioBtn); }
    if (opts.cancel) { const c = mk('button', 'btn', 'cancel'); c.onclick = () => done(null); row.appendChild(c); }
    box.appendChild(row);
    if (opts.forgot) { const f = mk('button', 'link small danger', 'Forgot it? Erase this device and start over'); f.onclick = opts.forgot; box.appendChild(f); }
    el.appendChild(box);
    document.body.appendChild(el);
    overlay = el;
    if (inputs[0]) setTimeout(() => inputs[0].focus(), 50);

    let fails = 0, wait = 0;
    function done(v) { if (overlay === el) overlay = null; el.remove(); resolve(v); }
    async function submit() {
      if (wait > Date.now()) { err.textContent = 'Too many tries. Wait ' + Math.ceil((wait - Date.now()) / 1000) + ' seconds.'; return; }
      const vals = inputs.map(i => i.value);
      const msg = opts.check ? await opts.check(vals) : '';
      if (msg) {
        err.textContent = msg; inputs.forEach(i => { i.value = ''; });
        if (opts.limit && ++fails >= 5) { wait = Date.now() + 30000; fails = 0; }
        if (inputs[0]) inputs[0].focus();
        return;
      }
      done(vals);
    }
    okBtn.onclick = submit;
    inputs.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
    if (bioBtn) {
      const tryBio = async () => { try { await bioVerify(lockCfg().cred); done(['bio']); } catch (e) { err.textContent = 'Face ID didn\'t work. Use your passcode.'; } };
      bioBtn.onclick = tryBio;
      if (opts.autoBio) setTimeout(tryBio, 250);
    }
  });
}

/* ---------- locking and unlocking ---------- */
let locked = false;
async function lockNow(autoBio) {
  if (!lockOn() || locked) return;
  locked = true; root.dataset.locked = '1';
  const c = lockCfg();
  const nm = (typeof S !== 'undefined' && S.settings && S.settings.name || '').trim();
  const res = await askPass({ title: 'locked', sub: nm ? 'Welcome back, ' + nm + '.' : 'Enter your passcode.', fields: [{ ph: 'passcode' }], ok: 'unlock', bio: !!c.cred, autoBio: autoBio !== false && !!c.cred, limit: true,
    check: async v => (await checkPasscode(v[0])) ? '' : 'That isn\'t it.', forgot: () => forgotFlow() });
  if (res) { locked = false; delete root.dataset.locked; }
}
function forgotFlow() {
  askPass({ title: 'erase', sub: 'The passcode can\'t be recovered. This erases everything on this device so you can start over (restore a backup afterwards). Type ERASE to confirm.',
    fields: [{ ph: 'ERASE' }], ok: 'erase', cancel: true, check: v => v[0] === 'ERASE' ? '' : 'Type ERASE in capitals.' }).then(res => {
    if (!res) { locked = false; lockNow(false); return; }
    try { localStorage.removeItem('pocketledger.v1'); localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
}

/* ask for the passcode (or Face ID) before a sensitive step */
async function authenticate(title) {
  if (!lockOn()) return true;
  const c = lockCfg();
  const res = await askPass({ title: title || 'confirm', sub: 'Enter your passcode to continue.', fields: [{ ph: 'passcode' }], ok: 'continue', cancel: true, bio: !!c.cred, limit: true,
    check: async v => (await checkPasscode(v[0])) ? '' : 'That isn\'t it.' });
  return !!res;
}

async function lockSetup() {
  const res = await askPass({ title: 'passcode', sub: 'Choose a passcode, at least 4 characters. It can\'t be recovered: if you forget it, the only way back in is to erase this device and restore a backup.',
    fields: [{ ph: 'new passcode' }, { ph: 'type it again' }], ok: 'save', cancel: true,
    check: v => v[0].length < 4 ? 'Use at least 4 characters.' : v[0] !== v[1] ? 'They don\'t match.' : '' });
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
async function bioToggle() {
  const c = lockCfg(); if (!c) return;
  if (c.cred) { c.cred = null; saveLockCfg(c); render(); return; }
  try { c.cred = await bioRegister(); saveLockCfg(c); } catch (e) { if (typeof askAlert === 'function') { askAlert('Face ID could not be turned on here. Make sure Face ID is set up on your phone and the app was opened from the home screen.'); render(); } return; }
  render();
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
['export', 'shareCode', 'copyCode', 'restoreCode', 'restoreNotes', 'eraseAll', 'clearTx', 'stmtPrint', 'stmtShare', 'stmtCsv'].forEach(n => {
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
  lockNow: () => { lockNow(false); return false; },
  bioToggle: () => { bioToggle(); return false; },
  bioToggleSeg: d => { if ((d.pot === 'on') !== !!(lockCfg() || {}).cred) bioToggle(); return false; },
  setHide: d => { S.settings.hideAmounts = d.pot === 'on'; save(); applySettings(); },
  setSens: d => { S.settings.lockSensitive = d.pot === 'on'; save(); },
});

bioAvailable().then(v => { ui.bioAvail = v; if (ui.tab === 'settings') render(); });
let skipLock = false;   // the app reloads itself once after a new budget (see "make it rain"); that shouldn't ask for the passcode again
try { skipLock = sessionStorage.getItem('pl.skiplock') === '1'; sessionStorage.removeItem('pl.skiplock'); } catch (e) { /* ignore */ }
if (lockOn() && !skipLock) lockNow();
else delete root.dataset.locked;
