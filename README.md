# ~/ledgend

*Ledger + legend.* A personal budgeting app that runs in your iPhone's browser and installs to the home screen. It sorts your spending, learns how you categorize things, and keeps every number on your own phone. No build step, no accounts, no tracking.

**Live app: https://elijahhalford.com/pocketledger/** (the address and repository keep the original name `pocketledger`, so existing installs, data and bank links keep working)

## Install
Open the live link in **Safari**, then **Share → Add to Home Screen**. The repository is served by GitHub Pages and every push to `main` goes live; close and reopen the app to pick up a new version (Settings shows the version at the bottom). To change the home-screen icon, delete the app and add it again, since iOS only reads the icon when it is added.

The app starts with made-up sample data so you can try everything. *Review → Clear sample data & start fresh* removes it.

## It learns as you use it
Ledgend gets better at sorting your money the more you use it, and everything it learns stays on your device.

- **Your categories win, and spread.** When you set a category on a transaction, the app remembers it for that merchant, applies it to every matching purchase (past and future) and treats it as certain. The transaction detail says "You set this category".
- **Names and confidence are cross-checked.** Each purchase is read three ways: a list of common merchants, common words in the bank text, and (when linked) the bank's own merchant name and category. When they agree, confidence goes up; when they disagree, it goes down. The detail screen explains why it was read that way. Names are plain nouns ("Kroger", "Corner Coffee"), never "Purchase at…".
- **Income sources learn their bank text.** *Income → Income history* cross-checks your own records against deposits in your bank to learn which bank text belongs to which employer, creates the income sources, and sets their keywords, so future deposits are matched automatically. Sources marked "varies" (like freelance) are tracked without an expected amount.
- **Fixed expenses recognize themselves.** Each constant expense gets a bank-text keyword (guessed from its name, editable). Matching charges skip Review and are marked "Fixed expense".
- **Skips Review by itself.** Card payments and transfers between your own accounts are recognized and kept in Activity, marked "Between your accounts".
- **Account-aware suggestions.** Every account is reviewed on its own, and a savings account suggests the Savings pot first.
- **Goal projections.** Each goal shows the month it would be reached at the current percentage, and what a few more percent would change. Goals show their real percent (a $700 pot with a $350 goal reads 200%).
- **Pending purchases keep your sorting.** When a bank replaces a pending purchase with the posted one, even without linking them (gas stations often do), your sorting moves to the posted purchase instead of sending it back to Review. A pending purchase's price can be edited (*Edit amount* in its detail) until the bank posts the final one.
- **Auto-sync.** With a linked bank, the app syncs on open, when you return to it, when the phone reconnects, and every few minutes while open.

Nothing is sent anywhere to learn: the rules live in the app's storage on your phone, travel only inside your own backup code, and are cleared by *Clear sample data & start fresh* or *Erase*.

## What's in the app
- **Review** (opens first): pinned pots at the top, then each account's new purchases to sort into a pot. Search by name, amount, date, category or pot. "Mark all as sorted" clears the list when you've caught up elsewhere.
- **Dashboard:** your pots (Spending, Savings, and any you add), accounts grouped by bank, and totals for Earned, Spent and Deductible. Tap a pot for its balance, goal progress and every transaction in and out.
- **Activity:** every transaction by day, searchable. Entries you add by hand can be edited or deleted.
- **Budget:** income sources and this month's deposits, earnings, constant expenses, savings and goal percentages, and the result. *Apply* asks first and can be undone; updating a month replaces its numbers so nothing double counts. *Paste a list* reads expenses from text. Budget history lists each past month, and **Statements** shows a monthly report (income, spending habits, categories vs last month, top places, budget vs actual, goals, accounts and every transaction) you can save as a PDF, share or export as CSV. Statements are built on the device.
- **Categories:** built-in plus your own. Pot, goal and category icons come from one popup of finance-relevant emojis in groups (money, bills, food, travel, shopping and more), drawn in the theme's single color.
- **Simple mode:** the colored button at the bottom of Settings opens a bare-bones budget that simplifies the experience of Ledgend. It runs beside the full app and never changes it (its own storage, its own pots). The top bar and tabs stay, Settings hides categories, bank accounts and demo mode, and *exit simple mode* is at the bottom of Settings. The first-run tour asks which way you want to start. Tap a pot to open a number pad and subtract what you spent or add to it; Savings (type what you've put away with + add) and any extra pots you add work the same way, each with its own percentage bar. A budget tab takes the month's earnings and a list of expenses and shows what goes to savings and spending. History lists every entry; tap one to name it.
- **Make it rain:** applying a new budget ends with a "Make it rain!" button; shake the phone and dollar bills fall.

## Look and feel
Four palettes (Harbor, Dune, Graphite, Plum), each in light, dark or auto, with a "deep glass" finish: frosted cards with a colored edge that wraps each window, soft shadows, and a slowly drifting glow behind everything that also shifts as you scroll and tilt the phone. Windows open and close with a smooth slide; every button reacts to a tap and gives a small haptic. Every text and button color pairing is at least 4.5:1 (WCAG 2.x), and dark mode is checked against the brightest point of its glow. Text size and an Animations switch are in Settings.

## Your data and privacy
Everything you enter lives in the browser on your phone. The web address serves only the app's code, and this repository contains no real financial data, only made-up samples.
- **Backup:** (includes Simple mode) a backup is also saved on the phone automatically every day (the last 7 days, under *Automatic backups*); those stay on the phone only, so they cover a mistake, not a lost phone. With your link server connected, an encrypted copy also goes to your own Cloudflare Worker every day (14 days kept; see `server/README.md`), so a wiped phone can be restored. *Settings → Backup & restore* can email you a backup code (opens the share sheet), copy it, or save a file. A reminder appears after 7 days. To restore, paste the whole code under "Restore from code".
- **App lock (optional):** a numeric passcode on an on-screen number pad, auto-lock delay, and an option to ask for the passcode before backup, restore, erase and statement export. The passcode is stored only as a salted hash and is never in backups. The lock keeps people out of the app; it does not encrypt stored data, so keep your phone's own passcode on.
- **Demo mode:** shows the app with entirely made-up data; your real data and bank link are never read in demo mode.
- **Never commit** a backup file or code, an API key or a connection code. `.gitignore` blocks the usual backup names. Don't paste a backup code anywhere public: it contains your financial data.
- The repo is public so GitHub Pages can serve it for free. If you want the code hidden too, make it private and host the same files on a private-friendly host. The page asks search engines not to index it, which is a courtesy, not security.

## Linking real bank accounts (optional)
*Settings → Bank accounts*. The app talks to your own private Cloudflare Worker (`server/worker.js`), which holds the Plaid keys; follow the step-by-step guide in [`server/README.md`](server/README.md). A **connection code** (*copy connection code*) carries only your server address and passphrase, so a new or restored device needs one paste; keep it in a password manager. It is never part of a backup. Until you link, the app runs on sample data or hand-entered purchases.

## Files
| File | What it is |
| --- | --- |
| `index.html`, `style.css` | The page and all styling (palettes, glass, motion) |
| `emoji.js` | The finance-relevant emoji, in groups, for the icon pickers |
| `data.js` | Logic with no screen code: categories, name simplifier, learning, pots, income, budget, statements |
| `app.js` | The screens and interactions |
| `simple.js` | Simple mode: the separate mini-budget |
| `lock.js` | The optional app lock and number pad |
| `sw.js`, `manifest.webmanifest`, `ledgend-icon-*.png` | Offline support and home-screen install |
| `server/` | The optional bank-link Worker and its setup guide |
