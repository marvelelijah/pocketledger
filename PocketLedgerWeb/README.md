# PocketLedger (web app)

A personal budgeting app that runs in your iPhone's browser and installs to the home screen. No Mac, no Apple developer fee, no build step. It starts with sample data so you can try everything right away.

## Try it on your Windows PC first
In this folder, run `python -m http.server 8000` (or any static server) and open http://localhost:8000. Or just double-click `index.html`; everything works except offline caching.

## Put it on your iPhone (free)
Pick one host. All three have free tiers for static sites, and you only upload this folder's files:

- **Netlify Drop:** go to app.netlify.com/drop and drag the whole folder onto the page. You get a web address immediately.
- **Cloudflare Pages:** create a project, choose "Direct Upload", and upload the folder.
- **GitHub Pages:** create a repository, upload the files, then turn on Pages in the repository settings.

Then on your iPhone: open the address in **Safari**, tap **Share → Add to Home Screen**. It opens full screen like a normal app and works offline after the first visit.

To update the app later, upload the changed files to the same project; it picks them up the next time you open it.

## Your data
- Everything is stored in the browser on your phone. The web address only serves the app, never your data.
- iOS can clear a web app's storage if you don't open it for a long time. Use **Budget → Backup → Export** now and then, and **Import** to restore.
- Data on your phone and your PC are separate.

## Where things are
| Wishlist item | Where |
|---|---|
| 1. Account monitoring, simple names + confidence | Home and Activity tabs; `simplify()` in `data.js` |
| 2. Choose Spending or Savings per transaction | Review tab |
| 3. Automatic income + manual extra income | Income tab (＋ adds extra income; "Edit income sources" sets the match text) |
| 4. First-of-month budget | Budget tab |
| 5. Color-coded categories | `CATS` in `data.js` (video & camera is also totaled as tax-deductible) |
| 6. Original name + time on every transaction | every row, and the detail sheet when you tap one |
| Credit score (later) | `FEATURES.creditScore = false` in `data.js`, plus `creditProvider` and the Home card |

The sample income sources (PAYROLL, FREELANCE) and fixed expenses (rent, phone, insurance) are placeholders. Edit them in the app.

## Connecting a real bank later
Replace `accountProvider` in `data.js` with one that calls your own small server, which talks to Plaid (Plaid's keys must never live in the app). Plaid's Trial plan is free with real data for up to 10 connections. That step also needs a login so only you can use the server.

## Credit score later
There's no free official consumer credit-score API. When you pick a source, make `creditProvider.fetchLatest()` return `{ score, bureau, date }` and set `FEATURES.creditScore = true`.
