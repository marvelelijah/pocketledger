/* PocketLedger link server: a tiny Cloudflare Worker that sits between your phone and Plaid.
   Your Plaid secret and your bank access tokens live ONLY here (as Cloudflare secrets / KV),
   never in the app and never on GitHub. Setup steps are in server/README.md.

   Needed settings (Worker > Settings):
     Secrets:  PLAID_CLIENT_ID, PLAID_SECRET, APP_PASSPHRASE
     Variable: PLAID_ENV   = sandbox  (later: production)
     Variable: ALLOWED_ORIGIN = https://elijahhalford.com   (comma-separate more than one)
     Optional variable: REDIRECT_URI = https://elijahhalford.com/pocketledger/   (needed for Chase and other OAuth banks)
     KV namespace binding named: LEDGER
*/

const PLAID = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };

export default {
  async fetch(req, env) {
    // Tolerate a trailing slash or a path in the setting (https://site.github.io/ or .../pocketledger/)
    const norm = s => { try { return new URL(s.trim()).origin; } catch (e) { return s.trim().replace(/\/+$/, ''); } };
    const allowed = String(env.ALLOWED_ORIGIN || 'https://elijahhalford.com').split(',').map(norm);
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (!(await authorized(req, env))) return json({ error: 'Wrong passphrase.' }, 401, cors);
      const url = new URL(req.url);
      const route = req.method + ' ' + url.pathname;
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

      if (route === 'GET /status') {
        const items = await getItems(env);
        return json({ items: items.map(i => ({ item_id: i.item_id, institution: i.institution })) }, 200, cors);
      }
      if (route === 'POST /link-token') return json(await linkToken(env), 200, cors);
      if (route === 'POST /exchange') return json(await exchange(env, body), 200, cors);
      if (route === 'GET /sync') return json(await sync(env), 200, cors);
      if (route === 'POST /unlink') return json(await unlink(env, body), 200, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, e.status || 500, cors);
    }
  },
};

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });

async function authorized(req, env) {
  const given = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.APP_PASSPHRASE || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(env.APP_PASSPHRASE)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function plaid(env, path, body) {
  const base = PLAID[env.PLAID_ENV || 'sandbox'];
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID, 'PLAID-SECRET': env.PLAID_SECRET },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_message || data.error_code || 'Plaid error ' + res.status);
    err.code = data.error_code; err.status = 502;
    throw err;
  }
  return data;
}

const getItems = async env => (await env.LEDGER.get('items', { type: 'json' })) || [];
const putItems = (env, items) => env.LEDGER.put('items', JSON.stringify(items));

async function linkToken(env) {
  const req = {
    client_name: 'PocketLedger',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: 'me' },
    products: ['transactions'],
    transactions: { days_requested: 60 },
  };
  if (env.REDIRECT_URI) req.redirect_uri = env.REDIRECT_URI;
  const r = await plaid(env, '/link/token/create', req);
  return { link_token: r.link_token };
}

async function exchange(env, body) {
  if (!body.public_token) throw Object.assign(new Error('Missing public_token'), { status: 400 });
  const r = await plaid(env, '/item/public_token/exchange', { public_token: body.public_token });
  const items = await getItems(env);
  items.push({ item_id: r.item_id, access_token: r.access_token, institution: String(body.institution || 'Bank').slice(0, 80), cursor: null });
  await putItems(env, items);
  return { item_id: r.item_id };
}

const isoDate = t => t.authorized_datetime || t.datetime || ((t.authorized_date || t.date) + 'T12:00:00');

/* Money out is positive in Plaid; the app uses negative for spending. */
const mapTx = t => ({
  id: 'plaid-' + t.transaction_id,
  accountID: 'plaid-' + t.account_id,
  rawName: t.original_description || t.name || t.merchant_name || '',
  date: isoDate(t),
  amount: -t.amount,
  pending: !!t.pending,
  pendingId: t.pending_transaction_id ? 'plaid-' + t.pending_transaction_id : null,
});

const mapAccount = (a, institution) => ({
  id: 'plaid-' + a.account_id,
  name: a.name + (a.mask ? ' ··' + a.mask : ''),
  institution,
  kind: a.type === 'credit' ? 'credit' : 'checking',
  balance: a.type === 'credit' ? -(a.balances.current || 0) : (a.balances.available != null ? a.balances.available : (a.balances.current || 0)),
});

/* Pulls what's new since last time. If a bank has a lot of history, `more` is true and the app asks again. */
async function sync(env) {
  const items = await getItems(env);
  const out = { accounts: [], added: [], modified: [], removed: [], more: false };
  for (const item of items) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let cursor = item.cursor || undefined, pages = 0, more = false;
      const added = [], modified = [], removed = [];
      let accounts = [];
      try {
        do {
          const r = await plaid(env, '/transactions/sync', {
            access_token: item.access_token, cursor, count: 500, options: { include_original_description: true },
          });
          added.push(...r.added.map(mapTx)); modified.push(...r.modified.map(mapTx)); removed.push(...r.removed.map(x => 'plaid-' + x.transaction_id));
          if (r.accounts && r.accounts.length) accounts = r.accounts;
          cursor = r.next_cursor; more = r.has_more; pages++;
        } while (more && pages < 6);
      } catch (e) {
        if (e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt === 0) continue;   // restart from the saved cursor
        throw e;
      }
      item.cursor = cursor;
      out.added.push(...added); out.modified.push(...modified); out.removed.push(...removed);
      out.accounts.push(...accounts.map(a => mapAccount(a, item.institution)));
      out.more = out.more || more;
      break;
    }
  }
  await putItems(env, items);
  return out;
}

async function unlink(env, body) {
  const items = await getItems(env);
  const item = items.find(i => i.item_id === body.item_id);
  if (!item) throw Object.assign(new Error('That bank is not linked.'), { status: 404 });
  try { await plaid(env, '/item/remove', { access_token: item.access_token }); } catch (e) { /* already gone at Plaid: still forget it here */ }
  await putItems(env, items.filter(i => i.item_id !== body.item_id));
  return { ok: true };
}
