# Setting up bank linking, step by step

**What you're building:** a small private server that sits between your phone and Plaid (the service that connects to banks). Your bank access and Plaid keys live on that server only, never in the app and never on GitHub. It's free, you do it all in a web browser, and nothing needs to be installed.

**Time:** about 30 minutes the first time. **Cost:** $0 (Plaid's free Trial plan, Cloudflare's free plan).

**Do it from a computer.** It's much easier with a keyboard and two browser tabs. A second tab or a note-taking app helps for keeping the values you copy.

> Before you start, open a private note (Notes app, Notepad, not a file in this repository) with these six headings. You'll fill them in as you go:
>
> 1. Plaid client_id:
> 2. Plaid Sandbox secret:
> 3. Passphrase (you'll make this up):
> 4. Worker address:
> 5. Plaid Production secret (later):
>
> **Never paste any of these into GitHub, an issue, a commit, or a chat with anyone.**

The screens of Plaid and Cloudflare change from time to time. If a button is labeled a little differently than written here, look for the closest match. Each part ends with a **checkpoint** so you know it worked before moving on.

---

## Part 1. Plaid (about 10 minutes)

Plaid is the company banks already trust to share data. You'll use fake "Sandbox" banks first so nothing real is at risk.

1. Open **dashboard.plaid.com/signup**.
2. Create an account with your email. When it asks what you're building or who you are, choose the **Personal use** option if one is shown. Accept the terms.
3. Check your email and confirm the address if Plaid asks.
4. In the dashboard, open **Developers → Keys** (direct address: dashboard.plaid.com/developers/keys).
5. You'll see two things:
   - **client_id**: the same in every environment. Copy it into your note.
   - **Secret**: there's one per environment (Sandbox, Production). Copy the **Sandbox** secret into your note. (Use the "show" or eye button if it's hidden.)

**Checkpoint:** your note has a client_id and a Sandbox secret. Both are long strings of letters and numbers.

Notes:
- Plaid's free **Trial plan** allows real banks with up to **10 linked connections** and is meant to be approved automatically for personal projects. You'll only need the Production secret in Part 5.
- Sandbox is free forever and uses pretend banks.

---

## Part 2. Cloudflare Worker (about 10 minutes)

A "Worker" is a tiny program Cloudflare runs for you. You already have a Cloudflare account from your website, so sign in at **dash.cloudflare.com**.

### 2a. Create the Worker
1. In the left menu click **Workers & Pages**.
2. Click **Create** (or **Create application**), then choose **Create Worker** / **Start with Hello World**.
3. Name it `pocketledger-link` and click **Deploy**. (It deploys a sample first; that's fine.)
4. When it says deployed, click **Edit code**.

### 2b. Put the server code in
1. In the code editor you'll see a few lines of sample code. Click inside it, press **Ctrl+A** (Cmd+A on Mac) to select everything, and delete it.
2. In a new tab open your repository on GitHub: **github.com/marvelelijah/pocketledger**, then the **server** folder, then **worker.js**.
3. Click the **Copy raw file** button (two overlapping squares, top right of the code).
4. Go back to Cloudflare and paste (**Ctrl+V**) into the empty editor.
5. Click **Deploy** (top right). Confirm if asked.

**Checkpoint:** copy the Worker's address (it looks like `https://pocketledger-link.SOMETHING.workers.dev`; it's shown on the Worker's page and near the editor's preview). Save it as "Worker address" in your note. Open it in a browser tab. You should see:

```
{"error":"Wrong passphrase."}
```

That message is *good*. It means the server is running and refusing strangers. If you see a Cloudflare error page or a blank page instead, the code wasn't pasted completely: repeat 2b.

### 2c. Create the storage the server uses
This is where it remembers which banks are linked.
1. Left menu: **Storage & Databases → Workers KV** (the page may just be called **KV**).
2. Click **Create instance** (or **Create a namespace**).
3. Name it `pocketledger` and click **Create**.

### 2d. Connect the storage to the Worker
1. Go back to **Workers & Pages** and click your `pocketledger-link` Worker.
2. Find **Bindings**. (It's a tab on the Worker, or listed under **Settings**.)
3. Click **Add binding**, choose **KV namespace**.
4. In **Variable name** type exactly: `LEDGER` (capital letters).
5. In the namespace drop-down pick `pocketledger`, then click **Add binding** / **Save**.

> The name `LEDGER` must match exactly. The code looks for that word.

### 2e. Add your secrets and settings
1. On the Worker, open **Settings → Variables and Secrets**.
2. Click **Add** and fill each of these in. For the first three, set **Type** to **Secret**:

| Name | Type | Value |
|---|---|---|
| `PLAID_CLIENT_ID` | Secret | your Plaid client_id |
| `PLAID_SECRET` | Secret | your Plaid **Sandbox** secret |
| `APP_PASSPHRASE` | Secret | a long passphrase you invent, like four unrelated words plus a number: `lantern-orbit-pickle-meadow-4827`. Put it in your note. |
| `PLAID_ENV` | Text | `sandbox` |
| `ALLOWED_ORIGIN` | Text | `https://elijahhalford.com` (your site uses a custom domain, so the app lives here, not at github.io) |

3. Click **Deploy** (or **Save and deploy**) after adding them. Variables only take effect once deployed.

**Checkpoint:** the list shows five names. The secrets show as hidden dots; that's normal.

Tips: names are case-sensitive; paste values with no extra spaces; the passphrase has no special rules but avoid spaces to keep it easy to type on your phone.

---

## Part 3. Connect the app and link a practice bank (about 5 minutes)

Do this on your **phone**, in the Ledgend app.

1. Tap the **profile button** (top right) → scroll to **Bank accounts**.
2. Under **Your link server**, paste the **Worker address** into the first box and your **passphrase** into the second box.
   (Tip: email or AirDrop the two values to yourself from your computer's note rather than retyping them.)
3. Tap **check connection**. You should see:
   *"Connected to your server. No bank is linked yet, so tap link a bank."*
4. Tap **link a bank**. The app asks to clear the sample data; say continue.
5. Plaid's window opens. Pick any bank, then sign in with:
   - Username: `user_good`
   - Password: `pass_good`
   - If it asks for a code: `1234`
6. Select the accounts, continue, and finish. The app shows *"Linked. Fetching your transactions…"*

**Checkpoint:** Settings → Bank accounts shows status **linked**, and Activity shows fake purchases. The fake accounts show under Home → Accounts.

About the fake data: Sandbox purchases are dated mostly in the past month. The app only sends purchases on or after **Count purchases from** (default: the 1st of this month) to Review. Older ones appear in Activity as history. That's expected.

If nothing appears right away, wait a minute and tap **sync now**. Banks sometimes take a moment to prepare history.

---

## Part 4. Clean up the practice data

Before using a real bank, remove the pretend one so fake purchases don't mix with real ones.

1. Settings → Bank accounts → **check connection** → tap **unlink** next to the practice bank.
2. Settings → **This phone** → **clear transactions**. (Your settings, income sources, expenses, to-dos and notes stay.)

---

## Part 5. Link your real bank (about 15 minutes)

1. **Get the Production secret.** In Plaid's dashboard, go to **Developers → Keys**. If a Production secret is shown, copy it into your note. If you see a button like **Request Production access** or **Migrate to Production**, click it and fill in the short form: this is a personal budgeting app just for you, using the Transactions product, US banks. Plaid may take a few days to approve. (I couldn't see Plaid's current screens, so follow what the dashboard shows. The Trial plan is meant to be quick and automatic for personal projects.)
2. **Switch the Worker.** Cloudflare → your Worker → Settings → Variables and Secrets:
   - Edit `PLAID_SECRET`: paste the **Production** secret.
   - Edit `PLAID_ENV`: change `sandbox` to `production`.
   - **Deploy**.
3. **If your bank uses OAuth** (Chase, Bank of America, Wells Fargo and many others send you to their own site or app to approve), set this up first:
   - Plaid dashboard → **Developers → API** → **Allowed redirect URIs** → add `https://elijahhalford.com/pocketledger/` (including the final slash) and save.
   - Cloudflare Worker → Variables and Secrets → add Text variable `REDIRECT_URI` = `https://elijahhalford.com/pocketledger/` → **Deploy**.
4. **Link from Safari, not the home-screen app.** On iPhone, the home-screen app and Safari keep separate storage, and OAuth banks bounce you between apps. So for the first link:
   - Open **elijahhalford.com/pocketledger** in **Safari**.
   - Profile → Settings → Bank accounts. Enter the Worker address and passphrase, then **check connection**, then **link a bank**, and pick your real bank.
   - Sign in on the bank's page. Plaid brings you back to the app and finishes.
5. **Open your home-screen app.** Enter the Worker address and passphrase again (it stores them separately from Safari), tap **check connection**. It finds the linked bank and syncs.
6. **Choose where to start counting.** Set **Count purchases from** to the day you want your pots to begin (for example the 1st of this month) **before** the first real sync if you can. Earlier purchases stay as history.

**Checkpoint:** your real balances show on Home, and new purchases appear on Review.

---

## When something goes wrong

| What you see | What it means / what to do |
|---|---|
| "Wrong passphrase." | The passphrase in the app doesn't exactly match the `APP_PASSPHRASE` secret. Retype both. Check for stray spaces. |
| "Your server is there, but it is refusing this app." | `ALLOWED_ORIGIN` doesn't match the app's address. It must be exactly `https://elijahhalford.com` (no slash at the end, no `/pocketledger`). Fix it in Cloudflare and Deploy. |
| "Could not reach your server." | The Worker address is wrong or has a typo, or your phone is offline. Paste the address into a browser: you should get `{"error":"Wrong passphrase."}`. |
| The address opens a Cloudflare error page | The code wasn't pasted fully or wasn't deployed. Redo Part 2b. |
| "The server answered 500" or a message about `LEDGER` or `get` | The KV binding is missing or misnamed. Redo Part 2d, exactly `LEDGER`. |
| A Plaid message such as "invalid client_id" or "invalid secret" | Wrong value saved. Re-copy from Developers → Keys. Sandbox secret with `PLAID_ENV=sandbox`; Production secret with `PLAID_ENV=production`. They must match. |
| Plaid window won't open | Check your connection. Plaid's window loads from the internet. |
| Linked, but no purchases | Wait a minute, then **sync now**. Older purchases appear in Activity, not Review: see **Count purchases from**. |
| A bank sends you to its site and then shows a blank page | OAuth setup (Part 5 step 3) is missing, or you started from the home-screen app. Use Safari. |
| A purchase shows twice or changes | Banks first post a "pending" purchase and later replace it. The app keeps your pot choice when it swaps. |

## Safety, in plain words
- The app is **read-only**. It can see purchases and balances; it cannot move money.
- You sign in to your bank inside Plaid's window. Ledgend never sees your bank password.
- Your Plaid secret and your bank's access key live only in your Cloudflare account.
- The server answers only requests that carry your passphrase and come from your site.
- The server address and passphrase are stored only on your phone and are left out of backups.
- To cut the connection at any time: tap **unlink** in the app, or delete the Worker in Cloudflare, or remove the connection in Plaid's dashboard.
- If your passphrase ever leaks: change `APP_PASSPHRASE` in Cloudflare and enter the new one in the app.

## Deploying from GitHub (optional)

`wrangler.jsonc` sits at the top of the repository and points at `server/worker.js`. In Cloudflare: your Worker → Settings → Builds → connect `marvelelijah/pocketledger`, branch `main`, deploy command `npx wrangler deploy`, and leave the root directory empty. Every push then redeploys the Worker, and the values in `wrangler.jsonc` (not secrets) are applied.

## Daily cloud backups

The app sends one **encrypted** backup a day to this Worker, which keeps the last 14 days in the same KV namespace as the bank links. The phone encrypts it (AES-256-GCM, key derived from your passphrase) before sending, so the stored text is unreadable scrambled data. Needs `server/worker.js` version `2026-11-06 b` or newer: redeploy it (or let the GitHub connection redeploy it) after pulling this update.

- **Find them:** Cloudflare dashboard → **Storage & databases → Workers KV** → your `pocketledger` namespace → **KV Pairs**. The keys starting with `backup:` are the backups, one per day.
- **Restore after a wipe:** open the app, paste your connection code (*Settings → Bank accounts*), then *Settings → Backup & restore → Cloud backup → restore* on a day.
- **If you change `APP_PASSPHRASE`,** older cloud backups can't be unlocked with the new one, so make a fresh backup (*back up now*) right after changing it.
- Turn it off any time under *Cloud backup* in the app. The Worker itself holds your passphrase, so this protects against a lost phone and a stranger browsing KV, not against someone with full control of your Cloudflare account.
