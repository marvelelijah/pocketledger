# PocketLedger (web app)

A personal budgeting app that runs in your iPhone's browser and installs to the home screen. No build step. Starts with sample data so you can try everything.

**Live app: https://elijahhalford.com/pocketledger/**

## Install on your iPhone
This repo is published with GitHub Pages. Open the live app link above in **Safari**, then **Share → Add to Home Screen**. Every change pushed to `main` goes live automatically; close and reopen the app to pick it up.

## How it works
- **Review (opens first):** a bar at the top shows how much of this month's spending money is left. Tap **＋ Purchase** when you buy something, then tap a pot to deduct from it. Purchases are rounded when deducted (nearest dollar by default; change it in the Budget tab's Month-end check).
- **Theme:** a terminal style borrowed from elijahhalford.com (IBM Plex Mono throughout, outlined sections, lowercase labels), six palettes (Terminal, Tannhauser, Mono, Icedancer, Vice, Unit-01), dark only for now, and sharp or rounded corners. Screens switch instantly; the highlight in button rows slides. Emoji are tinted to their category color. Pop-ups, menus and confirmations are all inside the app, and any sheet can be dragged down to close.
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


## Newer features

- **Review by account:** each bank account gets its own list (a savings-account fee never mixes with checking or cards), with chips to look at one account. A savings account suggests the Savings pot first.
- **Search:** Review, Activity and To-do & Notes all have a search box (name, amount, date, category, pot).
- **Auto-sync:** syncs when the app opens, when you come back to it, when the phone reconnects, and every few minutes while open. The top bar shows the last sync; tap it to retry.
- **Home accounts:** every account your banks send, grouped by bank. Tap one for balances, this month's totals and recent transactions. *Settings → Bank accounts → choose accounts* adds accounts a bank didn't send the first time.
- **Income history:** *Income → Income history* reads your own "money made" lists (paste or choose files), shows year and month totals, which sources are still paying, sets up income sources, and cross-checks deposits in your bank to learn which bank text belongs to which employer. These records live only on your phone; they are never part of this repository.

## Names, confidence and automatic sorting

- **Names are nouns:** "Kroger", "Corner Coffee", "Card payment", never "Purchase at…" or "Deposit from…".
- **Confidence is cross-checked** from three places: a list of common merchants, common words in the name, and (once linked) the bank's own merchant name and category. When they agree confidence goes up; when they disagree it goes down. Categories you set yourself always win. The transaction detail says why it was read that way.
- **Skips Review by itself:** card payments and transfers between your own accounts, and any charge that contains a fixed expense's bank text (Budget → Constant monthly expenses). They stay in Activity, marked "Between your accounts" or "Fixed expense".
- **Review → "mark all as already sorted"** clears everything waiting, for when you've caught up outside the app.
- **Dashboard → Deductible** opens the list of what is being counted, by month and by name. Settings → Categories lets you add your own categories (and mark them tax deductible) or delete them.
- **First run:** a title screen ("~/Pocket Ledger by Elijah Halford"), then a short, skippable tour; Settings → This device → "show the tour again". Buttons give a small haptic tap using the switch trick from the ios-haptics library (switch off under This device). Theme has Home Screen icon looks (Classic, Theme, Inverted, Prompt, Light, Night) that you can save as an image. Defaults are the Vice palette with rounded corners.
- **Make it rain:** applying a new budget opens the Dashboard with a pulsing "make it rain!" text. Shake the phone while the "make it rain!" text is showing (iPhone asks for motion access once, at the end of the tour or when you apply the budget; tap the text to ask again): the colors rotate through the rainbow and dollar bills fall until you stop.
- **Goals** show their real percent, so a pot at $700 with a $350 goal reads 200%. In Budget, each goal shows the month it would be reached at the current percent, and what a few more percent would change.
- **Statements → save as PDF** writes a real PDF on the device and opens the share sheet (Save to Files).
- **Budget → Paste a list** reads your monthly expenses from text (Name, amount per line; "Savings 20%" sets the percentage).

## Screens, demo mode and editing
- One floating button switches screens: it opens an isometric stack of the screens. Swipe or scroll to shuffle, tap the front one to open it. Settings → *Open on* picks the screen the app starts on.
- Settings → *Demo mode* shows the app with entirely made-up data (amber frame and a DEMO tag). Your real data and bank link are never read in demo mode and come back when you exit.
- Entries you add by hand can be edited or deleted from their detail sheet.
- Settings shows the app version at the bottom so you can confirm you are on the latest copy.

## Latest changes
- Four tabs (Review, Dashboard, Activity, Budget). Income sources and this month's deposits live in Budget. Windows in Budget and Settings can be collapsed and stay that way.
- **Monthly statements:** when a month ends, Home shows a notification; Budget > Statements lists every month. Each has income, spending habits (per-day average, no-spend days, priciest day, weekday), categories vs last month, top places, budget vs actual, goal progress, pot balances, accounts and every transaction. Save as PDF, share, or CSV. Built on the device, sent nowhere. The demo has one ready.
- **Security:** optional app lock (passcode, plus Face ID / Touch ID through the device's passkey check), auto-lock delay, passcode before backup/restore/erase/statement export, and hide-amounts. The passcode is stored only as a salted hash and is not in backups. The lock keeps people out of the app; it does not encrypt the stored data.
- **Currency:** follows the phone's region unless you pick one in Settings. Rounding is "Nearest $" (or your currency's symbol) or exact cents.
- **Home-screen app:** solid status-bar strip, safe-area padding, edge swipe-back disabled. Icon: centered green dollar sign.
- A **Finance** category covers Roth IRA, 401(k) and brokerage transfers.
- Review shows Spending and every other pot or goal in a swipeable row. Rounding differences go straight to Spending, so there is no month-end check.
- Applying or updating the monthly budget asks first and can be undone. Erase, clear and restore need a typed word.
- Themes: Terminal (default), Tannhauser, Mono, Icedancer, Vice, Unit-01 (dark). Every text colour is checked to at least 4.5:1 contrast (WCAG 2.x).
