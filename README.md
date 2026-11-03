# PocketLedger (web app)

A personal budgeting app that runs in your iPhone's browser and installs to the home screen. No build step. Starts with sample data so you can try everything.

## Install on your iPhone
This repo is published with GitHub Pages. Open your site's address in **Safari**, then **Share → Add to Home Screen**. Every change pushed to `main` goes live automatically; close and reopen the app to pick it up.

## How it works
- **Home:** your pots (Spending, Savings, plus any you add with "＋ Add pot or goal"). Tap a pot to open its page: balance, goal progress, money in, money out. Tap a transaction to edit it, or use **Select** to move several at once.
- **Review:** new purchases. Tap a pot to deduct from it. Purchases are rounded when deducted (nearest dollar by default; change it on the Budget tab).
- **Income:** regular sources are matched automatically by bank text. A source marked "varies month to month" (like freelance) has no expected amount. Use ＋ to count any other deposit as extra income.
- **Budget (always manual):** enter this month's earnings per source, constant expenses, and the savings percentage, then tap Apply. Updating a month replaces its numbers so nothing double counts.
- **Month-end check:** compares what you deducted (rounded) with what you really spent, optionally against your real money, and lets you add or take the difference from a pot or split it across all pots.
- **Budget history:** tap a month to see its earnings, expenses, savings, adjustments and every transaction involved.
- **To-do:** a money to-do list and notes.

## Your data and backups
Everything is stored in the browser on your phone; the web address only serves the app. Export a backup weekly and at the end of each month (Budget → Backup → Export; on iPhone it opens the share sheet so you can Save to Files). The Home screen shows a reminder after 7 days without one. Backups can be restored with Import.

## Files
`data.js` holds the logic (categories, simplifier, pots, budget, month-end check). `app.js` is the interface. `style.css`, `index.html`, `sw.js` (offline), `manifest.webmanifest`.

## Later
- **Real bank connection:** replace `accountProvider` in `data.js` with one that calls your own small server, which talks to Plaid (Plaid keys must never live in the app).
- **Credit score:** make `creditProvider.fetchLatest()` return `{ score, bureau, date }` and set `FEATURES.creditScore = true`.
