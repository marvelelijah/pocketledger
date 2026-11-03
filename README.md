# PocketLedger (web app)

A personal budgeting app that runs in your iPhone's browser and installs to the home screen. No build step. Starts with sample data so you can try everything.

**Live app: https://marvelelijah.github.io/pocketledger/**

## Install on your iPhone
This repo is published with GitHub Pages. Open the live app link above in **Safari**, then **Share → Add to Home Screen**. Every change pushed to `main` goes live automatically; close and reopen the app to pick it up.

## How it works
- **Review (opens first):** a bar at the top shows how much of this month's spending money is left. Tap **＋ Purchase** when you buy something, then tap a pot to deduct from it. Purchases are rounded when deducted (nearest dollar by default; change it in the Budget tab's Month-end check).
- **Look:** a terminal style borrowed from elijahhalford.com (IBM Plex Mono, outlined sections, lowercase labels) on warm charcoal and cream. Emoji are tinted to their category color. Pop-ups, menus and confirmations are all inside the app, and any sheet can be dragged down to close.
- **Home:** your pots (Spending, Savings, plus any you add with "＋ Add pot or goal"). Tap a pot to open its page: balance, goal progress, money in, money out. Tap a transaction to edit it, or use **Select** to move several at once.
- **Income:** regular sources are matched automatically by bank text. A source marked "varies month to month" (like freelance) has no expected amount. Use ＋ to count any other deposit as extra income.
- **Budget (always manual):** this month's income deposits are listed under each source and totaled for you (tap Edit only to fix a difference). Then set constant expenses and the savings percentage and tap Apply. Updating a month replaces its numbers so nothing double counts. 
- **Month-end check:** compares what you deducted (rounded) with what you really spent, optionally against your real money, and lets you add or take the difference from a pot or split it across all pots.
- **Budget history:** tap a month to see its earnings, expenses, savings, adjustments and every transaction involved.
- **To-do:** a money to-do list and notes.

## Your data and backups
Everything you enter is stored in the browser on your phone. The web address only serves the app's code, and this repository contains no real financial data (only made-up sample transactions).
- **Email myself a backup code** (Settings → Backup & restore): opens the share sheet; choose Mail and send it to yourself. To restore after your data is erased, paste the whole email into "Restore from code". A web page can't send email by itself, so this is one tap each time. The Review screen reminds you after 7 days.
- **Save file / Import file** and **Copy code** work too.
- **Start fresh:** the sample data is clearly labeled on Review; "Clear sample data & start fresh" removes it so only your own purchases remain.

## Keeping it private
- This repo is public so GitHub Pages can serve it for free. Anyone can read the code, but not your data.
- **Never commit** a backup file or code, or an API key. `.gitignore` blocks the usual backup file names.
- Don't paste a backup code into issues, commits or anywhere public. It contains your financial data.
- If you want the code itself hidden too, make the repo private and host the same files on a private-friendly host such as Netlify or Cloudflare Pages.
- The page asks search engines not to index it (`noindex`), which is a courtesy, not security.

## Files
`server/worker.js` is the optional bank-link server. `data.js` holds the logic (categories, simplifier, pots, budget, month-end check). `app.js` is the interface. `style.css`, `index.html`, `sw.js` (offline), `manifest.webmanifest`.

## Linking real bank accounts
Profile button → Settings → Bank accounts. It talks to your own private Cloudflare Worker (`server/worker.js`) which holds the Plaid keys; follow the step-by-step guide in `server/README.md`. Until then the app runs on sample data or hand-entered purchases.

## Settings
The profile button (top right) opens Settings: theme (auto, charcoal, black, paper), accent color, text size, animations, default pot, backup reminder, bank linking, backup & restore, and erase.

## Later
- **Credit score:** make `creditProvider.fetchLatest()` return `{ score, bureau, date }` and set `FEATURES.creditScore = true`.
