/* PocketLedger data layer: categories, simplifier, mock provider, state, pots, income, budget.
   No DOM access here, so the logic can be tested on its own. */

const FEATURES = {
  // Credit score is deliberately off for now. To enable: implement creditProvider.fetchLatest()
  // (below), then set this to true. The Home screen card is already built.
  creditScore: false,
};

const CATS = {
  food:          { title: 'Food & Drink',   color: '#f97316', icon: '🍴' },
  groceries:     { title: 'Groceries',      color: '#22c55e', icon: '🛒' },
  gas:           { title: 'Gas',            color: '#eab308', icon: '⛽' },
  videoCamera:   { title: 'Video & Camera', color: '#a855f7', icon: '📷', taxDeductible: true },
  bills:         { title: 'Bills',          color: '#3b82f6', icon: '⚡' },
  shopping:      { title: 'Shopping',       color: '#ec4899', icon: '🛍️' },
  entertainment: { title: 'Entertainment',  color: '#14b8a6', icon: '🎬' },
  health:        { title: 'Health',         color: '#ef4444', icon: '💊' },
  income:        { title: 'Income',         color: '#10b981', icon: '💵' },
  transfer:      { title: 'Transfer',       color: '#6366f1', icon: '🔁' },
  other:         { title: 'Other',          color: '#9ca3af', icon: '❔' },
};

const POTS = { spending: 'Spending', savings: 'Savings' };

/* ---------- helpers ---------- */

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function usd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function monthKey(d) {
  d = new Date(d);
  const m = d.getMonth() + 1;
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m);
}

function sameMonth(a, b) { return monthKey(a) === monthKey(b); }

/* ---------- transaction simplifier ---------- */
/* Turns "SQ *BLUE BOTTLE COFFEE 0231 ORLANDO FL" into "Coffee" + a 0..1 confidence.
   Known merchant = rule's own score (0.6-0.97); unknown = 0.35; recategorized by you = 0.99.
   When you add Plaid later you can use its merchant name and category confidence instead. */

const RULES = [
  [['WAWA'], 'Fuel or snacks at Wawa', 'gas', 0.72],
  [['SHELL', 'CHEVRON', 'EXXON', 'SUNOCO', 'RACETRAC'], 'Gas station fill-up', 'gas', 0.93],
  [['PUBLIX'], 'Groceries at Publix', 'groceries', 0.97],
  [['WALMART', 'WAL-MART'], 'Shopping at Walmart', 'shopping', 0.7],
  [['TARGET'], 'Shopping at Target', 'shopping', 0.7],
  [['ALDI', 'KROGER', 'TRADER JOE', 'WHOLE FOODS'], 'Grocery run', 'groceries', 0.94],
  [['CHICK-FIL-A', 'MCDONALD', 'WENDY', 'BURGER KING', 'TACO BELL', 'CHIPOTLE'], 'Fast food', 'food', 0.95],
  [['BLUE BOTTLE', 'STARBUCKS', 'DUNKIN'], 'Coffee', 'food', 0.94],
  [['TACO'], 'Meal at a taco spot', 'food', 0.8],
  [['DOORDASH', 'UBER EATS', 'GRUBHUB'], 'Food delivery', 'food', 0.95],
  [['ADORAMA', 'B&H', 'BHPHOTO', 'BEST BUY'], 'Camera / video gear', 'videoCamera', 0.9],
  [['ADOBE'], 'Adobe subscription (editing software)', 'videoCamera', 0.92],
  [['SPOTIFY'], 'Spotify subscription', 'entertainment', 0.97],
  [['NETFLIX', 'HULU', 'DISNEY PLUS', 'DISNEYPLUS', 'HBO'], 'Streaming subscription', 'entertainment', 0.96],
  [['AMZN', 'AMAZON'], 'Amazon order', 'shopping', 0.75],
  [['DUKE ENERGY', 'FPL', 'TECO'], 'Electric bill', 'bills', 0.97],
  [['VERIZON', 'AT&T', 'T-MOBILE', 'TMOBILE'], 'Phone bill', 'bills', 0.95],
  [['CVS', 'WALGREENS'], 'Pharmacy', 'health', 0.88],
  [['PAYROLL', 'DIRECT DEP'], 'Paycheck', 'income', 0.9],
  [['FREELANCE'], 'Freelance payment', 'income', 0.85],
  [['VENMO', 'ZELLE', 'CASH APP'], 'Person-to-person payment', 'transfer', 0.6],
];

function cleaned(raw) {
  let s = String(raw).toUpperCase();
  for (const n of ['SQ *', 'TST*', 'TST *', 'PAYPAL *', 'CHECKCARD', 'POS DEBIT', 'PURCHASE', 'DEBIT CARD', 'ACH DEPOSIT']) {
    s = s.split(n).join(' ');
  }
  return s.split(/[^A-Z]+/).filter(t => t.length >= 2).slice(0, 3)
    .map(t => t[0] + t.slice(1).toLowerCase()).join(' ');
}

function merchantKey(raw) {
  const c = cleaned(raw).toUpperCase();
  return c || String(raw).toUpperCase();
}

function simplify(rawName, amount, learned) {
  const upper = String(rawName).toUpperCase();
  let result;
  const rule = RULES.find(r => r[0].some(k => upper.includes(k)));
  if (rule) {
    result = { phrase: rule[1], category: rule[2], confidence: rule[3] };
  } else {
    const name = cleaned(rawName);
    const phrase = !name ? 'Unrecognized transaction' : (amount > 0 ? 'Deposit from ' + name : 'Purchase at ' + name);
    result = { phrase, category: amount > 0 ? 'income' : 'other', confidence: 0.35 };
  }
  const key = merchantKey(rawName);
  if (learned && learned[key]) result = { phrase: result.phrase, category: learned[key], confidence: 0.99 };
  return result;
}

/* ---------- providers (swap these for Plaid / CSV later) ---------- */

const accountProvider = {
  async fetchAccounts() {
    return [
      { id: 'acct-chk', name: 'Everyday Checking', institution: 'Sample Bank', kind: 'checking', balance: 3184.52 },
      { id: 'acct-cc', name: 'Rewards Card', institution: 'Sample Bank', kind: 'credit', balance: -412.38 },
    ];
  },
  async fetchTransactions() {
    // [month, day, hour, minute, bank description, amount, account]
    const rows = [
      [11, 3, 9, 40, 'ZELLE FROM J SMITH', 20.0, 'acct-chk'],
      [11, 3, 8, 12, 'WAWA 8071 ORLANDO FL', -42.18, 'acct-cc'],
      [11, 2, 15, 42, 'ADORAMA CAMERA NY', -189.99, 'acct-cc'],
      [11, 2, 12, 31, 'CHICK-FIL-A #01234', -11.47, 'acct-cc'],
      [11, 1, 9, 5, 'ADOBE *CREATIVE CLOUD', -59.99, 'acct-cc'],
      [11, 1, 9, 0, 'SPOTIFY USA', -11.99, 'acct-cc'],
      [10, 31, 18, 20, 'PUBLIX #1488 WINTER PARK FL', -87.32, 'acct-chk'],
      [10, 30, 7, 0, 'SCHOOL DISTRICT PAYROLL', 1250.0, 'acct-chk'],
      [10, 30, 20, 11, 'VENMO CASHOUT', 45.0, 'acct-chk'],
      [10, 29, 13, 55, 'SQ *BLUE BOTTLE COFFEE', -6.75, 'acct-cc'],
      [10, 28, 17, 30, 'SHELL OIL 57444', -38.5, 'acct-cc'],
      [10, 27, 11, 10, 'B&H PHOTO VIDEO 800-606-6969', -312.4, 'acct-cc'],
      [10, 25, 19, 45, 'NETFLIX.COM', -15.49, 'acct-cc'],
      [10, 24, 10, 2, 'ACH DEPOSIT FREELANCE EDIT LLC', 600.0, 'acct-chk'],
      [10, 23, 14, 12, 'AMZN MKTP US*2K4XY91', -23.18, 'acct-cc'],
      [10, 22, 12, 40, 'TST* LOCAL TACO SHOP', -14.2, 'acct-cc'],
      [10, 20, 8, 0, 'DUKE ENERGY', -96.12, 'acct-chk'],
      [10, 16, 7, 0, 'SCHOOL DISTRICT PAYROLL', 1250.0, 'acct-chk'],
      [10, 15, 16, 20, 'CVS/PHARMACY #4411', -18.9, 'acct-cc'],
      [10, 14, 21, 15, 'XYZ HOLDINGS 4412', -27.0, 'acct-cc'],
    ];
    return rows.map((r, i) => ({
      id: 'mock-' + i,
      accountID: r[6],
      rawName: r[4],
      date: new Date(2026, r[0] - 1, r[1], r[2], r[3]).toISOString(),
      amount: r[5],
    }));
  },
};

const creditProvider = {
  async fetchLatest() { return null; }, // { score: 742, bureau: 'Equifax', date: ISO } when implemented
};

/* ---------- state & persistence ---------- */

const STORAGE_KEY = 'pocketledger.v1';

function defaultState() {
  return {
    accounts: [],
    transactions: [],
    incomeSources: [
      { id: uid(), name: 'Full-time job', expectedAmount: 2500, matchKeyword: 'PAYROLL' },
      { id: uid(), name: 'Freelance', expectedAmount: 600, matchKeyword: 'FREELANCE' },
    ],
    fixedExpenses: [
      { id: uid(), name: 'Rent', amount: 900 },
      { id: uid(), name: 'Phone', amount: 55 },
      { id: uid(), name: 'Insurance', amount: 120 },
    ],
    spendingPot: 0,
    savingsPot: 0,
    savingsGoalName: 'Savings goal',
    savingsGoalTarget: 5000,
    budgetRuns: [],
    learned: {},
    autoRunBudget: true,
    lastSync: null,
    creditScore: null,
  };
}

let S = loadState();

function loadState() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return defaultState();
}

let lastSaveError = null;
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    lastSaveError = null;
  } catch (e) {
    lastSaveError = e.message || 'Could not save';
  }
}

function replaceState(obj) {
  S = Object.assign(defaultState(), obj);
  save();
}

/* ---------- sync ---------- */

let syncError = null;

async function sync() {
  try {
    S.accounts = await accountProvider.fetchAccounts();
    const raw = await accountProvider.fetchTransactions();
    ingest(raw);
    if (FEATURES.creditScore) S.creditScore = await creditProvider.fetchLatest();
    S.lastSync = new Date().toISOString();
    syncError = null;
    runMonthlyBudgetIfNeeded();
  } catch (e) {
    syncError = e.message || String(e);
  }
  save();
}

function matchingSource(rawName) {
  const upper = String(rawName).toUpperCase();
  return S.incomeSources.find(s => s.matchKeyword && upper.includes(s.matchKeyword.toUpperCase()));
}

function ingest(raws) {
  const known = new Set(S.transactions.map(t => t.id));
  for (const r of raws) {
    if (known.has(r.id)) continue;
    const s = simplify(r.rawName, r.amount, S.learned);
    const tx = {
      id: r.id, accountID: r.accountID, rawName: r.rawName, date: r.date, amount: r.amount,
      simpleName: s.phrase, confidence: s.confidence, category: s.category, userConfirmed: false,
      pot: null, isIgnored: false, incomeSourceID: null, extraIncomeLabel: null, extraIncomePot: null,
    };
    if (r.amount > 0) {
      const src = matchingSource(r.rawName);
      if (src) { tx.incomeSourceID = src.id; tx.category = 'income'; }
    }
    S.transactions.push(tx);
  }
  S.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function rematchIncomeSources() {
  for (const t of S.transactions) {
    if (t.amount > 0 && !t.extraIncomeLabel) {
      const src = matchingSource(t.rawName);
      t.incomeSourceID = src ? src.id : null;
    }
  }
  save();
}

/* ---------- lookups ---------- */

const txById = id => S.transactions.find(t => t.id === id);
const isExpense = t => t.amount < 0;
const needsReview = t => isExpense(t) && !t.pot && !t.isIgnored;
const isIncomeCounted = t => !!(t.incomeSourceID || t.extraIncomeLabel);
const pending = () => S.transactions.filter(needsReview);
const recentlyReviewed = () => S.transactions.filter(t => isExpense(t) && (t.pot || t.isIgnored)).slice(0, 6);
const accountName = id => (S.accounts.find(a => a.id === id) || {}).name || 'Unknown account';
const sourceName = id => id ? (S.incomeSources.find(s => s.id === id) || {}).name : null;

/* ---------- pots ---------- */

const round2 = n => Math.round((n || 0) * 100) / 100;

function adjust(pot, delta) {
  if (pot === 'spending') S.spendingPot = round2(S.spendingPot + delta);
  else if (pot === 'savings') S.savingsPot = round2(S.savingsPot + delta);
}

/* Deduct an expense from a pot (or pass null to send it back to Review).
   Re-assigning refunds the old pot first, so balances never double count. */
function assign(id, pot) {
  const t = txById(id);
  if (!t || !isExpense(t)) return;
  const amt = Math.abs(t.amount);
  if (t.pot) adjust(t.pot, amt);
  if (pot) adjust(pot, -amt);
  t.pot = pot || null;
  t.isIgnored = false;
  save();
}

function ignoreTx(id) {
  const t = txById(id);
  if (!t) return;
  if (isExpense(t) && t.pot) adjust(t.pot, Math.abs(t.amount));
  t.pot = null;
  t.isIgnored = true;
  save();
}

/* ---------- categories ---------- */

function setCategory(id, category) {
  const t = txById(id);
  if (!t) return;
  const key = merchantKey(t.rawName);
  S.learned[key] = category;
  for (const x of S.transactions) {
    if (merchantKey(x.rawName) === key) { x.category = category; x.userConfirmed = true; }
  }
  save();
}

/* ---------- income ---------- */

function markExtraIncome(id, label, pot) {
  const t = txById(id);
  if (!t || t.amount <= 0 || isIncomeCounted(t)) return;
  t.extraIncomeLabel = label;
  t.extraIncomePot = pot;
  adjust(pot, t.amount);
  save();
}

function removeExtraIncome(id) {
  const t = txById(id);
  if (!t || !t.extraIncomePot) return;
  adjust(t.extraIncomePot, -t.amount);
  t.extraIncomeLabel = null;
  t.extraIncomePot = null;
  save();
}

const inMonth = d => S.transactions.filter(t => sameMonth(t.date, d));
const countedIncome = d => inMonth(d).filter(isIncomeCounted);
const receivedFrom = (src, d) => inMonth(d).filter(t => t.incomeSourceID === src.id).reduce((a, t) => a + t.amount, 0);
const totalEarnings = d => countedIncome(d).reduce((a, t) => a + t.amount, 0);
const spentIn = d => inMonth(d)
  .filter(t => isExpense(t) && !t.isIgnored && t.category !== 'transfer')
  .reduce((a, t) => a + Math.abs(t.amount), 0);
const taxDeductibleTotal = year => S.transactions
  .filter(t => isExpense(t) && CATS[t.category].taxDeductible && new Date(t.date).getFullYear() === year)
  .reduce((a, t) => a + Math.abs(t.amount), 0);

/* ---------- monthly budget ---------- */

const expectedMonthlyEarnings = () => S.incomeSources.reduce((a, s) => a + (s.expectedAmount || 0), 0);
const fixedTotal = () => S.fixedExpenses.reduce((a, e) => a + (e.amount || 0), 0);
const runFor = d => S.budgetRuns.find(r => r.monthKey === monthKey(d));

/* Earnings minus constant expenses goes into the Spending pot.
   Running it again for the same month only applies the difference. */
function applyBudget(earnings, date) {
  date = date || new Date();
  const key = monthKey(date);
  const leftover = earnings - fixedTotal();
  const run = { monthKey: key, earnings, fixedTotal: fixedTotal(), leftover, ranAt: new Date().toISOString() };
  const i = S.budgetRuns.findIndex(r => r.monthKey === key);
  if (i >= 0) {
    S.spendingPot = round2(S.spendingPot + leftover - S.budgetRuns[i].leftover);
    S.budgetRuns[i] = run;
  } else {
    S.spendingPot = round2(S.spendingPot + leftover);
    S.budgetRuns.unshift(run);
  }
  save();
}

function runMonthlyBudgetIfNeeded() {
  if (!S.autoRunBudget || S.incomeSources.length === 0 || runFor(new Date())) return;
  applyBudget(expectedMonthlyEarnings());
}
