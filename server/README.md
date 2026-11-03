# Link server (Cloudflare Worker)

A web page can't safely hold bank keys, so a tiny private server sits between the app and Plaid.
`worker.js` is that server. It contains **no secrets**; your keys are stored as Cloudflare secrets.
Everything below is done in a browser, nothing to install.

## 1. Plaid (free Trial plan)
1. Sign up at dashboard.plaid.com/signup and choose **Personal use**.
2. Developers → Keys: copy your **client_id** and the **Sandbox** secret (fake banks, for practice).

## 2. Cloudflare
1. dash.cloudflare.com → Workers & Pages → Create → **Worker**. Name it `pocketledger-link`, deploy the sample, then **Edit code**.
2. Delete the sample, paste all of `server/worker.js`, **Deploy**.
3. Storage & Databases → KV → create a namespace called `pocketledger`.
4. Back on the Worker → Settings → Bindings → Add → KV namespace → variable name **`LEDGER`**, pick `pocketledger`.
5. Settings → Variables and Secrets. Add as **Secrets**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `APP_PASSPHRASE` (make up a long random passphrase).
   Add as **Text**: `PLAID_ENV` = `sandbox`, and `ALLOWED_ORIGIN` = `https://marvelelijah.github.io`.
6. Copy the Worker's address (looks like `https://pocketledger-link.YOURNAME.workers.dev`).

## 3. The app
Profile button → Settings → Bank accounts: paste the address and passphrase, tap **check connection**, then **link a bank**.
In Sandbox, pick any bank and sign in with `user_good` / `pass_good`.

## 4. Real banks
In Plaid, get your Production secret, then change the Worker's `PLAID_SECRET` to it and `PLAID_ENV` to `production`. Unlink the sandbox bank in the app and link your real one.
For banks that use OAuth (Chase and others): in Plaid's dashboard add `https://marvelelijah.github.io/pocketledger/` under allowed redirect URIs, and add a Text variable `REDIRECT_URI` with the same address. Do the first link in Safari rather than the home-screen app.

## Safety
- The Worker only answers requests carrying your passphrase, and only allows your site's origin.
- Bank access tokens never leave the Worker. The app only receives purchases and balances.
- Never put these secrets in the repository or paste them in chat.
