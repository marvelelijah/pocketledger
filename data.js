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
/* Turns "SQ *CORNER COFFEE CO 0231 ANYTOWN" into a short noun-style name ("Corner Coffee") and a category, with a 0..1 confidence.
   Three sources are cross-checked: a list of common merchants, common words in the name, and (when linked) the bank's own
   merchant name and category. When they agree, confidence goes up; when they disagree, it goes down. Your own corrections win (0.99). */

/* [keywords found in the bank text, display name, category, confidence] */
const MERCHANTS = [
  // gas
  [['RACETRAC'], 'RaceTrac', 'gas', 0.93], [['QUIKTRIP'], 'QuikTrip', 'gas', 0.9], [['CIRCLE K'], 'Circle K', 'gas', 0.9],
  [['SHELL OIL', 'SHELL SERVICE', 'SHELL '], 'Shell', 'gas', 0.93], [['CHEVRON'], 'Chevron', 'gas', 0.95], [['EXXON'], 'Exxon', 'gas', 0.95],
  [['MOBIL '], 'Mobil', 'gas', 0.9], [['SUNOCO'], 'Sunoco', 'gas', 0.95], [['WAWA'], 'Wawa', 'gas', 0.85], [['MURPHY USA', 'MURPHY EXPRESS'], 'Murphy USA', 'gas', 0.93],
  [['SPEEDWAY'], 'Speedway', 'gas', 0.9], [['7-ELEVEN', '7 ELEVEN', '7-11'], '7-Eleven', 'gas', 0.7], [['BP#', 'BP PRODUCTS', 'BP OIL'], 'BP', 'gas', 0.92],
  [['SAMS FUEL', 'COSTCO GAS', 'COSTCO FUEL'], 'Fuel', 'gas', 0.9],
  // groceries
  [['PUBLIX'], 'Publix', 'groceries', 0.97], [['KROGER'], 'Kroger', 'groceries', 0.95], [['ALDI'], 'Aldi', 'groceries', 0.95], [['TRADER JOE'], "Trader Joe's", 'groceries', 0.95],
  [['WHOLE FOODS', 'WHOLEFDS'], 'Whole Foods', 'groceries', 0.95], [['WINN-DIXIE', 'WINN DIXIE'], 'Winn-Dixie', 'groceries', 0.95], [['SPROUTS'], 'Sprouts', 'groceries', 0.93],
  [['FOOD LION'], 'Food Lion', 'groceries', 0.95], [['SAFEWAY'], 'Safeway', 'groceries', 0.95], [['LIDL'], 'Lidl', 'groceries', 0.95], [['HARRIS TEETER'], 'Harris Teeter', 'groceries', 0.95],
  [['INSTACART'], 'Instacart', 'groceries', 0.85], [['COSTCO WHSE', 'COSTCO WHOLESALE'], 'Costco', 'groceries', 0.75], [["SAM'S CLUB", 'SAMS CLUB', 'SAMSCLUB'], "Sam's Club", 'groceries', 0.75],
  // restaurants and coffee
  [['CHICK-FIL-A', 'CHICK FIL A', 'CHICKFILA'], 'Chick-fil-A', 'food', 0.97], [['MCDONALD'], "McDonald's", 'food', 0.97], [['WENDY'], "Wendy's", 'food', 0.96], [['BURGER KING'], 'Burger King', 'food', 0.97],
  [['TACO BELL'], 'Taco Bell', 'food', 0.97], [['CHIPOTLE'], 'Chipotle', 'food', 0.97], [['SUBWAY'], 'Subway', 'food', 0.9], [['PANERA'], 'Panera', 'food', 0.95], [['STARBUCKS'], 'Starbucks', 'food', 0.97],
  [['DUNKIN'], 'Dunkin', 'food', 0.96], [['DOMINO'], "Domino's", 'food', 0.97], [['PIZZA HUT'], 'Pizza Hut', 'food', 0.97], [['PAPA JOHN'], "Papa John's", 'food', 0.97], [['KFC'], 'KFC', 'food', 0.95],
  [['POPEYES'], 'Popeyes', 'food', 0.97], [['ARBY'], "Arby's", 'food', 0.96], [['SONIC DRIVE'], 'Sonic', 'food', 0.95], [['WAFFLE HOUSE'], 'Waffle House', 'food', 0.97], [['CRACKER BARREL'], 'Cracker Barrel', 'food', 0.97],
  [['IHOP'], 'IHOP', 'food', 0.95], [['DENNY'], "Denny's", 'food', 0.95], [['OUTBACK'], 'Outback', 'food', 0.95], [['OLIVE GARDEN'], 'Olive Garden', 'food', 0.97], [['APPLEBEE'], "Applebee's", 'food', 0.97],
  [['FIVE GUYS'], 'Five Guys', 'food', 0.97], [['JERSEY MIKE'], "Jersey Mike's", 'food', 0.97], [['FIREHOUSE SUBS'], 'Firehouse Subs', 'food', 0.97], [['PANDA EXPRESS'], 'Panda Express', 'food', 0.97],
  [['WINGSTOP'], 'Wingstop', 'food', 0.97], [['ZAXBY'], "Zaxby's", 'food', 0.97], [['DAIRY QUEEN'], 'Dairy Queen', 'food', 0.97], [['KRISPY KREME'], 'Krispy Kreme', 'food', 0.97], [['7 BREW'], '7 Brew', 'food', 0.95],
  [['DOORDASH'], 'DoorDash', 'food', 0.95], [['UBER EATS', 'UBEREATS'], 'Uber Eats', 'food', 0.96], [['GRUBHUB'], 'Grubhub', 'food', 0.96],
  // video and camera work (counted as tax-deductible)
  [['ADORAMA'], 'Adorama', 'videoCamera', 0.93], [['B&H', 'BHPHOTO', 'B AND H PHOTO'], 'B&H Photo', 'videoCamera', 0.93], [['ADOBE'], 'Adobe', 'videoCamera', 0.93],
  [['BLACKMAGIC', 'DAVINCI'], 'Blackmagic', 'videoCamera', 0.9], [['FRAME.IO', 'FRAMEIO'], 'Frame.io', 'videoCamera', 0.9], [['ENVATO', 'MOTION ARRAY', 'ARTLIST', 'EPIDEMIC SOUND'], 'Stock media', 'videoCamera', 0.88],
  [['LENSRENTALS', 'BORROWLENSES'], 'Lens rental', 'videoCamera', 0.9], [['KEH CAMERA', 'MPB.COM'], 'Used camera gear', 'videoCamera', 0.9], [['PEAK DESIGN', 'GOPRO', 'DJI ', 'NIKON', 'CANON USA'], 'Camera gear', 'videoCamera', 0.85],
  [['BEST BUY'], 'Best Buy', 'videoCamera', 0.6],
  // shopping
  [['WALMART', 'WAL-MART', 'WM SUPERCENTER'], 'Walmart', 'shopping', 0.75], [['TARGET '], 'Target', 'shopping', 0.78], [['AMAZON', 'AMZN'], 'Amazon', 'shopping', 0.8], [['DOLLAR GENERAL'], 'Dollar General', 'shopping', 0.9],
  [['DOLLAR TREE'], 'Dollar Tree', 'shopping', 0.92], [['HOME DEPOT'], 'Home Depot', 'shopping', 0.93], [["LOWE'S", 'LOWES '], "Lowe's", 'shopping', 0.93], [['TJ MAXX', 'TJMAXX'], 'TJ Maxx', 'shopping', 0.93],
  [['ROSS STORES', 'ROSS DRESS'], 'Ross', 'shopping', 0.93], [['KOHL'], "Kohl's", 'shopping', 0.93], [['OLD NAVY'], 'Old Navy', 'shopping', 0.95], [['IKEA'], 'IKEA', 'shopping', 0.95], [['ETSY'], 'Etsy', 'shopping', 0.9],
  [['EBAY'], 'eBay', 'shopping', 0.9], [['TEMU'], 'Temu', 'shopping', 0.9], [['SHEIN'], 'Shein', 'shopping', 0.9], [['HARBOR FREIGHT'], 'Harbor Freight', 'shopping', 0.93], [['MICHAELS'], 'Michaels', 'shopping', 0.9],
  // subscriptions and entertainment
  [['SPOTIFY'], 'Spotify', 'entertainment', 0.97], [['NETFLIX'], 'Netflix', 'entertainment', 0.97], [['HULU'], 'Hulu', 'entertainment', 0.97], [['DISNEY PLUS', 'DISNEYPLUS'], 'Disney+', 'entertainment', 0.97],
  [['HBO', 'MAX.COM'], 'Max', 'entertainment', 0.9], [['YOUTUBE'], 'YouTube', 'entertainment', 0.9], [['PEACOCK'], 'Peacock', 'entertainment', 0.95], [['PARAMOUNT'], 'Paramount+', 'entertainment', 0.95],
  [['AMC '], 'AMC', 'entertainment', 0.9], [['REGAL CINEMA', 'REGAL '], 'Regal', 'entertainment', 0.92], [['TICKETMASTER'], 'Ticketmaster', 'entertainment', 0.95], [['STEAMGAMES', 'STEAMPOWERED', 'STEAM PURCHASE', 'PLAYSTATION', 'XBOX', 'NINTENDO'], 'Games', 'entertainment', 0.92],
  [['TWITCH'], 'Twitch', 'entertainment', 0.9], [['PATREON'], 'Patreon', 'entertainment', 0.9], [['DUOLINGO'], 'Duolingo', 'bills', 0.92],
  // bills
  [['NORDVPN', 'NORD VPN', 'NORDSEC'], 'NordVPN', 'bills', 0.95], [['ANTHROPIC', 'CLAUDE.AI'], 'Claude', 'bills', 0.93], [['MINT MOBILE'], 'Mint Mobile', 'bills', 0.97], [['VERIZON'], 'Verizon', 'bills', 0.96],
  [['AT&T', 'ATT*'], 'AT&T', 'bills', 0.95], [['T-MOBILE', 'TMOBILE'], 'T-Mobile', 'bills', 0.96], [['SPECTRUM'], 'Spectrum', 'bills', 0.95], [['XFINITY', 'COMCAST'], 'Xfinity', 'bills', 0.95],
  [['FPL ', 'FLA POWER', 'FLORIDA POWER'], 'FPL', 'bills', 0.97], [['DUKE ENERGY'], 'Duke Energy', 'bills', 0.97], [['TECO'], 'TECO', 'bills', 0.95], [['POWER CO', 'ELECTRIC'], 'Electric', 'bills', 0.93],
  [['GEICO'], 'GEICO', 'bills', 0.97], [['PROGRESSIVE'], 'Progressive', 'bills', 0.95], [['STATE FARM'], 'State Farm', 'bills', 0.97], [['ALLSTATE'], 'Allstate', 'bills', 0.97], [['FARM BUREAU'], 'Farm Bureau', 'bills', 0.95],
  [['APPLE.COM/BILL', 'APPLE.COM BILL', 'ITUNES', 'ICLOUD'], 'Apple', 'bills', 0.85], [['GOOGLE *', 'GOOGLE STORAGE', 'GOOGLE ONE'], 'Google', 'bills', 0.8],
  [['MAINTENANCE FEE', 'SERVICE FEE', 'MONTHLY FEE', 'OVERDRAFT', 'ATM FEE', 'FOREIGN TRANSACTION FEE', 'NSF FEE'], 'Bank fee', 'bills', 0.95],
  // health
  [['CVS'], 'CVS', 'health', 0.9], [['WALGREENS'], 'Walgreens', 'health', 0.9], [['RITE AID'], 'Rite Aid', 'health', 0.92], [['LABCORP', 'QUEST DIAG'], 'Lab', 'health', 0.9],
  // money in
  [['PAYROLL', 'DIRECT DEP'], 'Paycheck', 'income', 0.9], [['INTEREST PAID', 'INTEREST PAYMENT', 'INTEREST EARNED', 'DIVIDEND'], 'Interest', 'income', 0.92], [['FREELANCE'], 'Freelance', 'income', 0.85],
  // moving money between your own accounts: not a spend
  [['PAYMENT THANK YOU', 'AUTOPAY', 'AUTO PAY', 'E-PAYMENT', 'EPAYMENT', 'ONLINE PAYMENT', 'CARD PAYMENT', 'CRCARDPMT', 'CREDIT CARD PMT', 'CC PAYMENT', 'DISCOVER E-PAY'], 'Card payment', 'transfer', 0.9, true],
  [['ONLINE TRANSFER', 'ONLINE XFER', 'TRANSFER TO', 'TRANSFER FROM', 'XFER TO', 'XFER FROM', 'ACCT TRANSFER', 'ACCOUNT TRANSFER', 'MOBILE TRANSFER'], 'Transfer', 'transfer', 0.88, true],
  [['VENMO', 'ZELLE', 'CASH APP', 'PAYPAL INST'], 'Person-to-person', 'transfer', 0.6],
];

/* Common words when the exact name isn't known. */
const WORD_RULES = [
  [['COFFEE', 'CAFE', 'ESPRESSO', 'BAKERY', 'DONUT'], 'food', 0.82], [['TACO', 'PIZZA', 'GRILL', 'BURGER', 'BBQ', 'SUSHI', 'DINER', 'KITCHEN', 'WINGS', 'DELI', 'RESTAURANT', 'BISTRO', 'TAVERN', 'PUB ', 'BREWING', 'STEAKHOUSE'], 'food', 0.8],
  [['FUEL', 'PETRO', 'GAS STATION', 'GASOLINE'], 'gas', 0.8], [['MARKET', 'GROCER', 'SUPERMARKET'], 'groceries', 0.7],
  [['CAMERA', 'PHOTO', 'VIDEO', 'LENS', 'FILM'], 'videoCamera', 0.7], [['PHARMACY', 'DENTAL', 'DENTIST', 'MEDICAL', 'CLINIC', 'URGENT CARE', 'HOSPITAL', 'OPTICAL', 'VISION'], 'health', 0.82],
  [['INSURANCE'], 'bills', 0.8], [['WATER UTIL', 'WATER DEPT', 'UTILITIES', 'UTILITY'], 'bills', 0.85], [['CINEMA', 'THEATER', 'THEATRE', 'CONCERT', 'ARCADE'], 'entertainment', 0.8],
];

/* The bank's own categories (Plaid) mapped to ours. */
const PFC_MAP = { INCOME: 'income', TRANSFER_IN: 'transfer', TRANSFER_OUT: 'transfer', LOAN_PAYMENTS: 'bills', BANK_FEES: 'bills', ENTERTAINMENT: 'entertainment',
  FOOD_AND_DRINK: 'food', GENERAL_MERCHANDISE: 'shopping', HOME_IMPROVEMENT: 'shopping', MEDICAL: 'health', PERSONAL_CARE: 'health', GENERAL_SERVICES: 'bills',
  GOVERNMENT_AND_NON_PROFIT: 'other', TRANSPORTATION: 'other', TRAVEL: 'other', RENT_AND_UTILITIES: 'bills' };
const PFC_CONF = { VERY_HIGH: 0.95, HIGH: 0.88, MEDIUM: 0.7, LOW: 0.5, UNKNOWN: 0.35 };
const REFINES = { videoCamera: 'shopping', groceries: 'food' };   // our narrower category sits inside the bank's broader one

function bankCategory(pfc) {
  if (!pfc || !pfc.p) return null;
  let cat = PFC_MAP[pfc.p] || 'other';
  const d = String(pfc.d || '');
  if (d === 'FOOD_AND_DRINK_GROCERIES') cat = 'groceries';
  if (d === 'TRANSPORTATION_GAS') cat = 'gas';
  const own = d === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' || /ACCOUNT_TRANSFER$/.test(d);
  if (own) cat = 'transfer';
  return { cat, conf: PFC_CONF[pfc.c] || 0.5, own, label: (CATS[cat] || CATS.other).title.toLowerCase() };
}

const NOISE_WORDS = new Set(['PURCHASE', 'POS', 'DEBIT', 'CARD', 'CHECKCARD', 'CKCD', 'RECURRING', 'PAYMENT', 'THE', 'INC', 'LLC', 'LTD', 'CORP', 'AUTHORIZED', 'ON', 'WWW', 'COM', 'HTTPS', 'VISA', 'ACH', 'WEB', 'ID', 'PPD', 'CCD', 'NO', 'REF', 'FL', 'GA', 'AL', 'TX', 'NC', 'SC', 'CA', 'NY']);

/* A tidy name from messy bank text: "SQ *CORNER COFFEE CO 0231 ORLANDO FL" -> "Corner Coffee". */
function prettyName(raw) {
  let up = String(raw || '').toUpperCase();
  for (const n of ['SQ *', 'SQ*', 'TST*', 'TST *', 'PAYPAL *', 'PP*', 'CHECKCARD', 'CHECK CARD', 'POS DEBIT', 'DEBIT CARD PURCHASE', 'PURCHASE AUTHORIZED ON', 'ACH DEPOSIT', 'ACH DEBIT', 'ACH CREDIT', 'RECURRING PAYMENT', 'AMZN MKTP US', 'VISA DIRECT']) up = up.split(n).join(' ');
  up = up.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ').replace(/[#*]\s*\d+/g, ' ').replace(/\b[A-Z]*\d[A-Z0-9]*\b/g, ' ').replace(/\bX{2,}\d*\b/g, ' ');
  const toks = up.split(/[^A-Z&'.-]+/).map(t => t.replace(/^[.'-]+|[.'-]+$/g, '')).filter(t => t.length >= 2 && !NOISE_WORDS.has(t));
  return toks.slice(0, 3).map(t => t[0] + t.slice(1).toLowerCase()).join(' ');
}

/* Older, simpler cleanup. Kept only so categories you already taught the app keep matching. */
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

/* hint (optional, from the bank): { merchant, pfc: { p, d, c } }.  Returns { phrase, category, confidence, why, auto }. */
function simplify(rawName, amount, learned, hint) {
  hint = hint || {};
  const upper = String(rawName).toUpperCase() + ' ';
  const known = MERCHANTS.find(m => m[0].some(k => upper.includes(k)));
  const word = !known && WORD_RULES.find(w => w[0].some(k => upper.includes(k)));
  const bank = bankCategory(hint.pfc);
  const own = hint.merchant ? String(hint.merchant).trim() : '';
  const name = own || prettyName(rawName);
  let phrase, category, confidence, why, auto = false;

  if (known || word) {
    category = known ? known[2] : word[1];
    confidence = known ? known[3] : word[2];
    phrase = known ? known[1] : (name || (CATS[category] || CATS.other).title);
    auto = !!(known && known[4]);
    why = known ? 'A merchant the app knows' : 'The name has a common word in it';
    if (bank) {
      const agree = bank.cat === category || REFINES[category] === bank.cat;
      if (agree) { confidence = Math.min(0.99, Math.max(confidence, bank.conf) + 0.04); why += '; your bank agrees'; }
      else { confidence = Math.max(0.5, confidence - 0.1); why += '; your bank files it under ' + bank.label; }
    }
  } else if (bank && bank.cat !== 'other') {
    category = bank.cat; confidence = Math.min(0.9, bank.conf); phrase = name || (CATS[category] || CATS.other).title;
    auto = bank.own && amount < 0 && bank.conf >= 0.7;
    why = 'From your bank\'s category';
  } else {
    category = amount > 0 ? 'income' : 'other';
    confidence = name ? (bank ? 0.45 : 0.4) : 0.3;
    phrase = name || (amount > 0 ? 'Deposit' : 'Unrecognized');
    why = name ? 'An unfamiliar name' : 'No readable name';
  }
  if (known && known[4] && bank && bank.own) auto = true;

  const key = merchantKey(rawName);
  if (learned && learned[key]) { category = learned[key]; confidence = 0.99; why = 'You set this category'; auto = false; }
  return { phrase, category, confidence, why, auto };
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
      [11, 3, 9, 40, 'ZELLE FROM SAMPLE PERSON', 20.0, 'acct-chk'],
      [11, 3, 8, 12, 'QUIKTRIP 8071 ANYTOWN', -42.18, 'acct-cc'],
      [11, 2, 15, 42, 'SAMPLE CAMERA SHOP', -189.99, 'acct-cc'],
      [11, 2, 12, 31, 'CHICK-FIL-A #01234', -11.47, 'acct-cc'],
      [11, 1, 9, 5, 'ADOBE *CREATIVE CLOUD', -59.99, 'acct-cc'],
      [11, 1, 9, 0, 'SPOTIFY USA', -11.99, 'acct-cc'],
      [10, 31, 18, 20, 'KROGER #1488 ANYTOWN', -87.32, 'acct-chk'],
      [10, 30, 7, 0, 'ACME CORP PAYROLL', 1250.0, 'acct-chk'],
      [10, 30, 20, 11, 'VENMO CASHOUT', 45.0, 'acct-chk'],
      [10, 29, 13, 55, 'SQ *CORNER COFFEE CO', -6.75, 'acct-cc'],
      [10, 28, 17, 30, 'SHELL OIL 57444', -38.5, 'acct-cc'],
      [10, 27, 11, 10, 'SAMPLE PHOTO VIDEO 555-0100', -312.4, 'acct-cc'],
      [10, 25, 19, 45, 'NETFLIX.COM', -15.49, 'acct-cc'],
      [10, 24, 10, 2, 'ACH DEPOSIT FREELANCE CLIENT LLC', 600.0, 'acct-chk'],
      [10, 23, 14, 12, 'AMZN MKTP US*2K4XY91', -23.18, 'acct-cc'],
      [10, 22, 12, 40, 'TST* LOCAL TACO SHOP', -14.2, 'acct-cc'],
      [10, 20, 8, 0, 'ANYTOWN POWER CO', -96.12, 'acct-chk'],
      [10, 16, 7, 0, 'ACME CORP PAYROLL', 1250.0, 'acct-chk'],
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

const STORAGE_KEY = 'pocketledger.v1';   // key name kept so existing data is found and migrated
const STATE_VERSION = 2;
const POT_ICONS = ['💳', '🏦', '🎯', '✈️', '🏠', '🚗', '📷', '🎁', '🛟', '🎓'];
/* Pots saved while the app briefly used plain symbols get their emoji back. */
const ICON_UPGRADE = { '◈': '💳', '◆': '🏦', '◎': '🎯', '➤': '✈️', '⌂': '🏠', '◭': '🚗', '◉': '📷', '✧': '🎁', '◍': '🛟', '✦': '🎓' };

const round2 = n => Math.round((n || 0) * 100) / 100;

function defaultState() {
  return {
    version: STATE_VERSION,
    namesV: 2,
    created: new Date().toISOString(),
    accounts: [],
    transactions: [],
    incomeHistory: [],   // what you were paid in past months, pasted in by you (never stored in the code)
    incomeSources: [
      // variable = no expected amount (e.g. freelance: some months nothing)
      { id: uid(), name: 'Full-time job', expectedAmount: 2500, variable: false, matchKeyword: 'PAYROLL' },
      { id: uid(), name: 'Freelance', expectedAmount: 0, variable: true, matchKeyword: 'FREELANCE' },
    ],
    fixedExpenses: [
      { id: uid(), name: 'Rent', amount: 900 },
      { id: uid(), name: 'Phone', amount: 55 },
      { id: uid(), name: 'Insurance', amount: 120 },
    ],
    useSampleData: true,  // false once you start with your own purchases (nothing fake is added)
    settings: {
      name: '',            // only shown on this phone
      theme: 'charcoal',   // auto | charcoal | black | paper
      accent: 'sage',      // sage | terra | amber | sky | rose
      textSize: 1,
      motion: 'auto',      // auto | off
      backupDays: 7,       // 0 = no reminder
      defaultPot: 'spending',
      linked: false,       // true once real bank accounts are linked (see server/README.md)
      countFrom: null,     // YYYY-MM-DD: purchases before this day are kept as history, not sent to Review
    },
    savingsPercent: 10,   // % of the month's earnings set aside for the Savings pot
    pots: [
      { id: 'spending', name: 'Spending', icon: '💳', balance: 0, target: null, core: true },
      { id: 'savings', name: 'Savings', icon: '🏦', balance: 0, target: 5000, core: true },
    ],
    potLog: [],           // every movement in or out of a pot
    roundMode: 'nearest', // how spending is rounded when deducted from a pot: 'off' | 'nearest' | 'up'
    budgetRuns: [],
    adjustments: [],      // month-end redistributions
    learned: {},
    todos: [],
    notes: [],
    lastSync: null,
    lastExport: null,
    creditScore: null,
  };
}

let S = loadState();

function loadState() {
  let raw = null;
  try { raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null; } catch (e) { /* ignore */ }
  if (!raw) return defaultState();
  try { return migrate(JSON.parse(raw)); } catch (e) { return defaultState(); }
}

/* Brings data saved by the first version of the app up to date. */
function migrate(old) {
  const s = Object.assign(defaultState(), old);
  s.settings = Object.assign({}, defaultState().settings, old.settings || {});
  for (const p of s.pots || []) if (ICON_UPGRADE[p.icon]) p.icon = ICON_UPGRADE[p.icon];
  if (old.namesV !== 2) {                                   // older transactions get the newer, verb-free names and cross-checked confidence
    for (const t of s.transactions || []) {
      if (t.userConfirmed) continue;
      const r = simplify(t.rawName, t.amount, s.learned || {}, { merchant: t.merchant, pfc: t.pfc });
      t.simpleName = r.phrase; t.confidence = r.confidence; t.why = r.why;
      if (!t.incomeSourceID && !t.extraIncomeLabel) t.category = r.category;
    }
    s.namesV = 2;
  }
  if (old.version >= STATE_VERSION) return s;

  s.created = old.created || new Date().toISOString();
  s.pots = defaultState().pots;
  s.potLog = [];
  s.adjustments = [];
  s.todos = old.todos || [];
  s.notes = old.notes || [];
  const sp = s.pots.find(p => p.id === 'spending');
  const sv = s.pots.find(p => p.id === 'savings');
  sp.balance = round2(old.spendingPot);
  sv.balance = round2(old.savingsPot);
  if (old.savingsGoalTarget != null) sv.target = old.savingsGoalTarget;

  for (const src of s.incomeSources) {
    if (src.variable === undefined) src.variable = String(src.matchKeyword || '').toUpperCase() === 'FREELANCE';
    if (src.variable) src.expectedAmount = 0;
  }

  const entries = [];
  const add = (potId, amount, label, kind, extra) =>
    entries.push(Object.assign({ id: uid(), potId, date: new Date().toISOString(), amount: round2(amount), label, kind }, extra || {}));
  for (const t of s.transactions) {
    if (t.pot && t.amount < 0) add(t.pot, t.amount, t.simpleName, 'tx', { txId: t.id, date: t.date, exact: Math.abs(t.amount) });
    if (t.extraIncomeLabel && t.extraIncomePot) add(t.extraIncomePot, t.amount, t.extraIncomeLabel, 'extra', { txId: t.id, date: t.date });
  }
  for (const r of s.budgetRuns) {
    add('spending', r.leftover, 'Budget leftover', 'budget', { monthKey: r.monthKey, date: r.ranAt });
    r.earningsBreakdown = r.earningsBreakdown || [];
    r.fixedItems = r.fixedItems || [];
    r.savingsPercent = r.savingsPercent || 0;
    r.savingsAmount = r.savingsAmount || 0;
  }
  for (const pot of s.pots) {
    const sum = entries.filter(e => e.potId === pot.id).reduce((a, e) => a + e.amount, 0);
    const residual = round2(pot.balance - sum);
    if (Math.abs(residual) >= 0.005) add(pot.id, residual, 'Opening balance', 'manual');
  }
  s.potLog = entries;

  delete s.spendingPot; delete s.savingsPot; delete s.savingsGoalName; delete s.savingsGoalTarget; delete s.autoRunBudget;
  s.version = STATE_VERSION;
  return s;
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
  S = migrate(obj);
  save();
}

/* ---------- sync ---------- */

let syncError = null;

async function sync() {
  if (S.settings.linked && linkConfigured()) return syncLinked();
  if (!S.useSampleData) { syncError = null; return; }   // own-data mode: purchases are added by hand (or a real provider later)
  try {
    S.accounts = await accountProvider.fetchAccounts();
    const raw = await accountProvider.fetchTransactions();
    ingest(raw);
    if (FEATURES.creditScore) S.creditScore = await creditProvider.fetchLatest();
    S.lastSync = new Date().toISOString();
    syncError = null;
  } catch (e) {
    syncError = e.message || String(e);
  }
  save();
}

function matchingSource(rawName) {
  const upper = String(rawName).toUpperCase();
  return S.incomeSources.find(s => s.matchKeyword && upper.includes(s.matchKeyword.toUpperCase()));
}

/* A bank line that matches one of your fixed monthly expenses (by the bank text you gave it). */
function fixedMatch(rawName) {
  const up = String(rawName).toUpperCase();
  return S.fixedExpenses.find(e => e.matchKeyword && up.includes(String(e.matchKeyword).toUpperCase()));
}

function ingest(raws, opts) {
  opts = opts || {};
  const known = new Set(S.transactions.map(t => t.id));
  for (const r of raws) {
    if (known.has(r.id)) continue;
    const s = simplify(r.rawName, r.amount, S.learned, { merchant: r.merchant, pfc: r.pfc });
    const tx = {
      id: r.id, accountID: r.accountID, rawName: r.rawName, date: r.date, amount: r.amount,
      simpleName: s.phrase, confidence: s.confidence, category: s.category, why: s.why, userConfirmed: false,
      merchant: r.merchant || '', pfc: r.pfc || null,
      pot: null, isIgnored: false, ignoredWhy: null, incomeSourceID: null, extraIncomeLabel: null, extraIncomePot: null,
    };
    if (r.amount < 0) {
      const fx = fixedMatch(r.rawName);
      if (opts.countFrom && new Date(r.date) < opts.countFrom) { tx.isIgnored = true; tx.ignoredWhy = 'Before start date'; }
      else if (fx) { tx.isIgnored = true; tx.ignoredWhy = 'Fixed expense'; tx.simpleName = fx.name || tx.simpleName; tx.category = 'bills'; tx.confidence = 0.98; tx.why = 'Matches your fixed expense'; }
      else if (s.auto) { tx.isIgnored = true; tx.ignoredWhy = 'Between your accounts'; }
    }
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
const accountName = id => id === 'manual' ? 'Added by hand' : ((S.accounts.find(a => a.id === id) || {}).name || 'Earlier link (account removed)');
const accountById = id => S.accounts.find(a => a.id === id);
/* Savings accounts send their purchases/fees to the Savings pot by default; everything else to your default pot. */
function accountDefaultPot(accountID) {
  const a = accountById(accountID);
  if (a && a.kind === 'savings' && potById('savings')) return 'savings';
  return potById(S.settings.defaultPot) ? S.settings.defaultPot : 'spending';
}
const KIND_RANK = { manual: 0, checking: 1, credit: 2, savings: 3, loan: 4, investment: 5 };
const accountRank = id => id === 'manual' ? 0 : (KIND_RANK[(accountById(id) || {}).kind] || 6);
const sourceName = id => id ? (S.incomeSources.find(s => s.id === id) || {}).name : null;

/* ---------- pots (every change goes through the log, so each pot can show what came in and out) ---------- */

const potById = id => S.pots.find(p => p.id === id);
const potName = id => (potById(id) || {}).name || 'Unknown pot';
const potsTotal = () => round2(S.pots.reduce((a, p) => a + p.balance, 0));

function logEntry(potId, amount, label, kind, extra) {
  const pot = potById(potId);
  if (!pot) return null;
  amount = round2(amount);
  const e = Object.assign({ id: uid(), potId, date: new Date().toISOString(), amount, label, kind }, extra || {});
  S.potLog.push(e);
  pot.balance = round2(pot.balance + amount);
  return e;
}

function removeLogs(pred) {
  const keep = [];
  for (const e of S.potLog) {
    if (pred(e)) {
      const pot = potById(e.potId);
      if (pot) pot.balance = round2(pot.balance - e.amount);
    } else keep.push(e);
  }
  S.potLog = keep;
}

const potEntries = potId => S.potLog.filter(e => e.potId === potId).sort((a, b) => new Date(b.date) - new Date(a.date));

/* How much a purchase takes out of a pot. Rounding means the pot may differ from the exact amount by cents;
   the month-end check shows and redistributes that difference. */
function deduction(amount) {
  const a = Math.abs(amount);
  if (S.roundMode === 'nearest') return Math.round(a);
  if (S.roundMode === 'up') return Math.ceil(a - 1e-9);
  return round2(a);
}

/* Deduct an expense from a pot (or pass null to send it back to Review). Re-assigning moves it cleanly. */
function assign(id, potId) {
  const t = txById(id);
  if (!t || !isExpense(t)) return;
  removeLogs(e => e.kind === 'tx' && e.txId === id);
  t.pot = null;
  if (potId && potById(potId)) {
    logEntry(potId, -deduction(t.amount), t.simpleName, 'tx', { txId: id, date: t.date, exact: Math.abs(t.amount) });
    t.pot = potId;
  }
  t.isIgnored = false;
  save();
}

function ignoreTx(id, why) {
  const t = txById(id);
  if (!t) return;
  removeLogs(e => e.kind === 'tx' && e.txId === id);
  t.pot = null;
  t.isIgnored = true;
  t.ignoredWhy = why || 'Not a spend';
  save();
}

/* Everything waiting in Review becomes "already sorted": it stays in Activity but never comes out of a pot. */
function ignoreAllPending() {
  const list = pending();
  for (const t of list) { t.pot = null; t.isIgnored = true; t.ignoredWhy = 'Already sorted'; }
  save();
  return list.length;
}

/* Transactions whose account is gone (a bank was unlinked and linked again, so the account got a new id) are matched to the same
   purchase under the new account. Their sorting carries over and the stale copy is removed. */
function healOrphans() {
  const have = new Set(S.accounts.map(a => a.id));
  const orphans = S.transactions.filter(t => t.accountID !== 'manual' && !have.has(t.accountID));
  if (!orphans.length) return 0;
  const norm = n => String(n).toUpperCase().replace(/[^A-Z]/g, '');
  let fixed = 0;
  for (const o of orphans) {
    const near = S.transactions.find(t => t !== o && have.has(t.accountID) && Math.abs(t.amount - o.amount) < 0.005 && norm(t.rawName) === norm(o.rawName)
      && Math.abs(new Date(t.date) - new Date(o.date)) < 3 * 864e5);
    if (!near) continue;
    const pot = o.pot, ign = o.isIgnored, why = o.ignoredWhy;
    removeTx(o.id);
    if (pot && !near.pot && !near.isIgnored) assign(near.id, pot);
    else if (ign && !near.pot && !near.isIgnored) ignoreTx(near.id, why);
    fixed++;
  }
  if (fixed) save();
  return fixed;
}

function addPot(name, icon, balance, target) {
  const pot = { id: uid(), name: name || 'New pot', icon: icon || '🎯', balance: 0, target: target > 0 ? target : null, core: false };
  S.pots.push(pot);
  if (balance) logEntry(pot.id, balance, 'Starting balance', 'manual');
  save();
  return pot.id;
}

function updatePot(id, fields) {
  const pot = potById(id);
  if (!pot) return;
  Object.assign(pot, fields);
  save();
}

/* Set a pot's balance by hand; the difference is recorded as a manual entry. */
function setPotBalance(id, newBalance) {
  const pot = potById(id);
  if (!pot) return;
  const diff = round2(newBalance - pot.balance);
  if (diff) logEntry(id, diff, 'Manual adjustment', 'manual');
  save();
}

function deletePot(id) {
  const pot = potById(id);
  if (!pot || pot.core) return;
  for (const t of S.transactions) {
    if (t.pot === id) t.pot = null;                       // back to Review
    if (t.extraIncomePot === id) { t.extraIncomeLabel = null; t.extraIncomePot = null; }
  }
  S.potLog = S.potLog.filter(e => e.potId !== id);
  S.pots = S.pots.filter(p => p.id !== id);
  save();
}

function moveMoney(fromId, toId, amount) {
  amount = round2(amount);
  if (!(amount > 0) || fromId === toId || !potById(fromId) || !potById(toId)) return false;
  const transferId = uid();
  logEntry(fromId, -amount, 'Moved to ' + potName(toId), 'transfer', { transferId });
  logEntry(toId, amount, 'Moved from ' + potName(fromId), 'transfer', { transferId });
  save();
  return true;
}

function undoLog(entryId) {
  const e = S.potLog.find(x => x.id === entryId);
  if (!e || !['manual', 'transfer'].includes(e.kind)) return;
  if (e.kind === 'transfer' && e.transferId) removeLogs(x => x.transferId === e.transferId);
  else removeLogs(x => x.id === entryId);
  save();
}

/* ---------- your own data: add purchases by hand, clear the sample data ---------- */

/* kind: 'purchase' | 'deposit'. potId (purchases only): deduct straight away, or null to decide in Review. */
function addManualTx(kind, amount, name, potId, date) {
  amount = round2(Math.abs(amount));
  name = String(name || '').trim();
  if (!(amount > 0) || !name) return null;
  const signedAmt = kind === 'deposit' ? amount : -amount;
  const s = simplify(name, signedAmt, S.learned);
  const tx = {
    id: 'man-' + uid(), accountID: 'manual', rawName: name, date: (date || new Date()).toISOString(), amount: signedAmt,
    simpleName: s.phrase, confidence: s.confidence, category: s.category, userConfirmed: false,
    pot: null, isIgnored: false, incomeSourceID: null, extraIncomeLabel: null, extraIncomePot: null,
  };
  if (signedAmt > 0) {
    const src = matchingSource(name);
    if (src) { tx.incomeSourceID = src.id; tx.category = 'income'; }
  }
  S.transactions.push(tx);
  S.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (signedAmt < 0 && potId && potById(potId)) assign(tx.id, potId);
  save();
  return tx.id;
}

/* Removes the sample transactions and starts every pot at $0. Your income sources, expenses, to-dos and notes stay. */
function startFresh() {
  S.useSampleData = false;
  S.accounts = [];
  S.transactions = [];
  S.potLog = [];
  S.budgetRuns = [];
  S.adjustments = [];
  S.learned = {};
  S.lastSync = null;
  for (const p of S.pots) p.balance = 0;
  save();
}

/* The spending bar on Review: how much of this month's spending money is left.
   available = what the pot held at the start of the month + everything that came in since. */
function spendingLevel(now) {
  const pot = potById('spending');
  const key = monthKey(now || new Date());
  const month = S.potLog.filter(e => e.potId === 'spending' && monthKey(e.date) === key);
  const net = round2(month.reduce((a, e) => a + e.amount, 0));
  const inflow = round2(month.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0));
  const available = round2(pot.balance - net + inflow);
  const left = pot.balance;
  const spent = round2(Math.max(available - left, 0));
  const pct = available > 0 ? Math.min(Math.max(left / available, 0), 1) : null;
  return { left, available, spent, pct };
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

function markExtraIncome(id, label, potId) {
  const t = txById(id);
  if (!t || t.amount <= 0 || t.extraIncomeLabel || !potById(potId)) return;
  t.prevSourceID = t.incomeSourceID || null;   // remembered so removing the extra income puts it back with its job
  t.incomeSourceID = null;
  t.extraIncomeLabel = label;
  t.extraIncomePot = potId;
  logEntry(potId, t.amount, 'Extra income: ' + label, 'extra', { txId: id, date: t.date });
  save();
}

function removeExtraIncome(id) {
  const t = txById(id);
  if (!t || !t.extraIncomePot) return;
  removeLogs(e => e.kind === 'extra' && e.txId === id);
  t.extraIncomeLabel = null;
  t.extraIncomePot = null;
  const back = t.prevSourceID && S.incomeSources.some(s => s.id === t.prevSourceID) ? t.prevSourceID : null;
  delete t.prevSourceID;
  const src = back ? null : matchingSource(t.rawName);
  t.incomeSourceID = back || (src ? src.id : null);
  save();
}

const monthTxs = key => S.transactions.filter(t => monthKey(t.date) === key);
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

/* ---------- monthly budget (always applied by you, never automatically) ---------- */

/* Only income with a fixed expected amount; variable income (like freelance) is added by hand each month. */
const expectedMonthlyEarnings = () => S.incomeSources.filter(s => !s.variable).reduce((a, s) => a + (s.expectedAmount || 0), 0);
const fixedTotal = () => S.fixedExpenses.reduce((a, e) => a + (e.amount || 0), 0);
const runFor = d => S.budgetRuns.find(r => r.monthKey === monthKey(d));
const runByKey = key => S.budgetRuns.find(r => r.monthKey === key);

/* breakdown = [{ sourceId, name, amount }] — the earnings you decided to budget this month.
   Leftover after constant expenses and the savings percentage goes to Spending; the savings share goes to Savings.
   Applying again for the same month replaces the earlier entries, so nothing is counted twice. */
function applyBudget(breakdown, date) {
  date = date || new Date();
  const key = monthKey(date);
  const earnings = round2(breakdown.reduce((a, b) => a + (b.amount || 0), 0));
  const fixed = round2(fixedTotal());
  const pct = S.savingsPercent || 0;
  const savingsAmount = round2(earnings * pct / 100);
  const leftover = round2(earnings - fixed - savingsAmount);

  removeLogs(e => e.kind === 'budget' && e.monthKey === key);
  logEntry('spending', leftover, 'Budget: left for spending', 'budget', { monthKey: key });
  if (savingsAmount) logEntry('savings', savingsAmount, 'Budget: savings (' + pct + '% of earnings)', 'budget', { monthKey: key });

  const run = {
    monthKey: key, earnings, fixedTotal: fixed, savingsPercent: pct, savingsAmount, leftover,
    earningsBreakdown: breakdown.map(b => ({ sourceId: b.sourceId, name: b.name, amount: round2(b.amount), edited: !!b.edited })),
    fixedItems: S.fixedExpenses.map(e => ({ name: e.name, amount: round2(e.amount) })),
    ranAt: new Date().toISOString(),
  };
  const i = S.budgetRuns.findIndex(r => r.monthKey === key);
  if (i >= 0) S.budgetRuns[i] = run; else S.budgetRuns.push(run);
  S.budgetRuns.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  save();
  return run;
}

/* ---------- month-end check: find and redistribute small discrepancies ---------- */

/* Rounding: what was exactly spent from pots this month vs what was deducted. */
function roundingStats(key) {
  let exact = 0, deducted = 0;
  for (const e of S.potLog) {
    if (e.kind === 'tx' && monthKey(e.date) === key) { exact += e.exact; deducted += -e.amount; }
  }
  exact = round2(exact); deducted = round2(deducted);
  // positive = you deducted more than you really spent, so you have that much extra in real life
  return { exact, deducted, diff: round2(deducted - exact) };
}

const adjustedTotal = key => round2(S.adjustments.filter(a => a.monthKey === key).reduce((a, x) => a + x.amount, 0));

/* actual = what you really have for the pots (or null). Positive result = extra money, negative = missing. */
function discrepancy(key, actual) {
  if (actual != null && !isNaN(actual)) return round2(actual - potsTotal());
  return round2(roundingStats(key).diff - adjustedTotal(key));
}

/* Put the discrepancy into one pot, or split it evenly across all pots (target = 'all'). */
function redistribute(key, amount, target) {
  const cents = Math.round(amount * 100);
  if (!cents) return false;
  const targets = target === 'all' ? S.pots.map(p => p.id) : [target];
  if (!targets.length || targets.some(id => !potById(id))) return false;
  const base = Math.trunc(cents / targets.length);
  const rem = cents - base * targets.length;
  targets.forEach((id, i) => logEntry(id, (base + (i === 0 ? rem : 0)) / 100, 'Month-end adjustment (' + key + ')', 'adjust', { monthKey: key }));
  S.adjustments.push({ id: uid(), monthKey: key, date: new Date().toISOString(), amount: round2(cents / 100), target });
  save();
  return true;
}

/* ---------- income history: your own "money made" records ---------- */

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/* Reads text like:  MONEY MADE 2026 / OCTOBER / $1,809.24 Employer / $461.75 (Side gig) …
   Returns { entries: [{year, month, amount, source, note}], skipped } and changes nothing. */
function parseMoneyMade(text) {
  const entries = [], names = {}; let year = null, month = null, skipped = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = /^MONEY\s+MADE\b\s*[:\-–]?\s*\(?(\d{4})?\)?/i.exec(line);
    if (m) { year = m[1] ? +m[1] : null; month = null; continue; }
    if (/^(19|20)\d\d$/.test(line)) { year = +line; month = null; continue; }
    m = /^([A-Za-z]{3,9})\.?:?$/.exec(line);
    if (m) {
      const i = MONTH_NAMES.findIndex(n => n === m[1].toLowerCase() || (m[1].length === 3 && n.startsWith(m[1].toLowerCase())));
      if (i >= 0) { month = i + 1; continue; }
    }
    m = /^\$\s*([\d,]+(?:\.\d+)?)\s*(.*)$/.exec(line);
    if (m) {
      if (!year || !month) { skipped++; continue; }
      const parts = m[2].replace(/^\(|\)$/g, '').trim().split(/\s+[-–—]\s+/);
      const label = (parts[0] || '').replace(/\s+/g, ' ').trim() || 'Unknown';
      const key = label.toLowerCase();
      if (!names[key]) names[key] = label;
      entries.push({ year, month, amount: round2(parseFloat(m[1].replace(/,/g, ''))), source: names[key], note: parts.slice(1).join(' - ').trim() });
      continue;
    }
    skipped++;
  }
  return { entries, skipped };
}

/* Replaces whatever you had for the same years, so pasting a file again never doubles it up. */
function importIncomeHistory(text) {
  const r = parseMoneyMade(text);
  if (!r.entries.length) throw new Error('I could not find any amounts. Each line should look like "$1,809.24 Employer" under a month name.');
  const years = [...new Set(r.entries.map(e => e.year))].sort();
  S.incomeHistory = S.incomeHistory.filter(h => !years.includes(h.year))
    .concat(r.entries.map(e => Object.assign({ id: 'ih-' + uid(), txId: null }, e)));
  S.incomeHistory.sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  save();
  return { added: r.entries.length, years, skipped: r.skipped };
}

const monthIdx = (y, m) => y * 12 + (m - 1);

/* One row per source: how often, how much, is it still paying, and what kind of income it looks like. */
function incomeSummary(now) {
  now = now || new Date();
  const cur = monthIdx(now.getFullYear(), now.getMonth() + 1);
  const by = {};
  for (const h of S.incomeHistory) {
    const k = h.source.toLowerCase(), i = monthIdx(h.year, h.month);
    const o = by[k] || (by[k] = { name: h.source, n: 0, total: 0, first: i, last: i, amounts: [], months: {}, years: {} });
    o.n++; o.total += h.amount; o.first = Math.min(o.first, i); o.last = Math.max(o.last, i); o.amounts.push(h.amount);
    o.months[i] = (o.months[i] || 0) + h.amount; o.years[h.year] = (o.years[h.year] || 0) + h.amount;
  }
  return Object.values(by).map(o => {
    const avg = o.total / o.n;
    const sd = Math.sqrt(o.amounts.reduce((a, x) => a + (x - avg) * (x - avg), 0) / o.n);
    const cv = avg ? sd / avg : 0;
    const done = Object.keys(o.months).map(Number).filter(i => i < cur).sort((a, b) => b - a).slice(0, 6);   // finished months only
    // the middle month, not the average: one big month (an extra paycheck, a bonus) shouldn't set your budget
    const vals = done.map(i => o.months[i]).sort((x, y) => x - y);
    const monthlyAvg = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : o.total;
    return Object.assign(o, {
      avg: round2(avg), cv, recent: o.last >= cur - 2, monthlyAvg: round2(monthlyAvg),
      kind: o.n <= 2 ? 'one-off' : (cv < 0.25 && o.n >= 4 ? 'regular' : 'varies'),
    });
  }).sort((a, b) => (b.recent - a.recent) || (b.last - a.last) || (b.total - a.total));
}

function incomeYearTotals() {
  const t = {};
  for (const h of S.incomeHistory) t[h.year] = round2((t[h.year] || 0) + h.amount);
  return t;
}

/* Total per calendar month, newest first. */
function incomeMonthTotals(count) {
  const t = {};
  for (const h of S.incomeHistory) t[monthIdx(h.year, h.month)] = round2((t[monthIdx(h.year, h.month)] || 0) + h.amount);
  return Object.keys(t).map(Number).sort((a, b) => b - a).slice(0, count || 12).map(i => ({ idx: i, year: Math.floor(i / 12), month: i % 12 + 1, total: t[i] }));
}

const GENERIC_WORDS = new Set(['ACH', 'DEPOSIT', 'CREDIT', 'DIRECT', 'TRANSFER', 'PPD', 'WEB', 'ONLINE', 'PAYMENT', 'FROM', 'THE', 'INC', 'LLC', 'CORP', 'MOBILE', 'CHECK', 'DEP', 'PMT', 'PAYMENTS', 'ID']);

/* Looks for the bank deposit that matches each record (same amount, same or neighbouring month).
   apply = false just reports. apply = true remembers the match, sets up sources and their bank-text keywords, and counts the deposits. */
function crossReference(apply) {
  const used = new Set(S.incomeHistory.filter(h => h.txId && txById(h.txId)).map(h => h.txId));
  const taken = new Set(), matched = [];
  const deposits = S.transactions.filter(t => t.amount > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const t of deposits) {
    if (used.has(t.id)) continue;
    const d = new Date(t.date), i = monthIdx(d.getFullYear(), d.getMonth() + 1);
    const h = S.incomeHistory.find(x => !x.txId && !taken.has(x.id) && Math.abs(x.amount - t.amount) < 0.005 && Math.abs(monthIdx(x.year, x.month) - i) <= 1);
    if (h) { taken.add(h.id); matched.push({ tx: t, h }); }
  }
  const alreadyHere = S.incomeHistory.filter(h => h.txId && txById(h.txId)).map(h => ({ tx: txById(h.txId), h }));
  const all = alreadyHere.concat(matched);
  const matchedTx = new Set(all.map(m => m.tx.id));

  // which months does the bank data cover? records inside that window with no deposit are worth a look
  const idxs = S.transactions.map(t => { const d = new Date(t.date); return monthIdx(d.getFullYear(), d.getMonth() + 1); });
  const lo = idxs.length ? Math.min(...idxs) : null, hi = idxs.length ? Math.max(...idxs) : null;
  const matchedIds = new Set(all.map(m => m.h.id));
  const missing = lo == null ? [] : S.incomeHistory.filter(h => !matchedIds.has(h.id) && monthIdx(h.year, h.month) > lo && monthIdx(h.year, h.month) <= hi);
  const unmatched = deposits.filter(t => !matchedTx.has(t.id) && !t.incomeSourceID && !t.extraIncomeLabel);

  // a bank-text keyword per source: the source's own name if it appears in the deposits, else a word they all share
  const keywords = {};
  const groups = {};
  for (const m of all) (groups[m.h.source.toLowerCase()] = groups[m.h.source.toLowerCase()] || { name: m.h.source, list: [] }).list.push(m);
  for (const g of Object.values(groups)) {
    const up = g.list.map(m => String(m.tx.rawName).toUpperCase());
    const own = g.name.toUpperCase();
    if (up.every(r => r.includes(own))) { keywords[g.name] = own; continue; }
    const counts = {};
    for (const r of up) for (const w of new Set(r.split(/[^A-Z0-9]+/).filter(w => w.length >= 4 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w)))) counts[w] = (counts[w] || 0) + 1;
    const best = Object.entries(counts).filter(([, c]) => c >= Math.max(2, Math.ceil(up.length * 0.6))).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    keywords[g.name] = best ? best[0] : '';
  }

  if (apply) {
    for (const m of matched) m.h.txId = m.tx.id;
    const sums = incomeSummary();
    for (const g of Object.values(groups)) {
      const info = sums.find(x => x.name === g.name);
      let src = S.incomeSources.find(x => x.name.toLowerCase() === g.name.toLowerCase());
      if (!src) {
        src = { id: uid(), name: g.name, expectedAmount: info && info.kind === 'regular' ? Math.round(info.monthlyAvg) : 0, variable: !(info && info.kind === 'regular'), matchKeyword: '' };
        S.incomeSources.push(src);
        dropStarterSources();
      }
      if (!src.matchKeyword || ['PAYROLL', 'FREELANCE'].includes(src.matchKeyword)) src.matchKeyword = keywords[g.name] || src.matchKeyword;
    }
    rematchIncomeSources();
  }
  return { matched: all, newlyMatched: matched.length, unmatched, missing, keywords };
}

/* The two example sources every new install starts with, if you never changed them. */
const isStarterSource = x =>
  (x.name === 'Full-time job' && x.matchKeyword === 'PAYROLL' && x.expectedAmount === 2500 && !x.variable) ||
  (x.name === 'Freelance' && x.matchKeyword === 'FREELANCE' && x.variable);
const dropStarterSources = () => { S.incomeSources = S.incomeSources.filter(x => !isStarterSource(x)); };

/* Creates income sources for everyone who is still paying you. Regular pay gets an expected monthly amount; the rest are "varies". */
function applyIncomeSuggestions() {
  const made = [];
  for (const o of incomeSummary()) {
    if (!o.recent || o.kind === 'one-off') continue;
    if (S.incomeSources.find(x => x.name.toLowerCase() === o.name.toLowerCase())) continue;
    S.incomeSources.push({ id: uid(), name: o.name, expectedAmount: o.kind === 'regular' ? Math.round(o.monthlyAvg) : 0, variable: o.kind !== 'regular', matchKeyword: '' });
    made.push(o.name);
  }
  if (made.length) dropStarterSources();
  rematchIncomeSources();
  save();
  return made;
}

/* ---------- paste in your monthly expenses ---------- */

/* Reads lines like "Rent 450", "Car payment  333.72" or "Savings 20%" (copied from a spreadsheet works too). */
function parseExpenseList(text) {
  const items = []; let pct = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.*?)[\s:=,$]*\$?\s*([\d,]+(?:\.\d+)?)\s*(%?)\s*$/.exec(line);
    if (!m) continue;
    const name = m[1].replace(/[\s:=,$\-–]+$/, '').trim(), val = parseFloat(m[2].replace(/,/g, ''));
    if (!name || isNaN(val) || /^(total|spending|current|what|cost)\b/i.test(name)) continue;
    if (/^savings\b/i.test(name)) { if (m[3] === '%') pct = val; continue; }
    items.push({ name, amount: round2(val) });
  }
  return { items, pct };
}

const GENERIC_EXPENSE_WORDS = new Set(['RENT', 'CAR', 'PHONE', 'INSURANCE', 'SAVINGS', 'UTILITIES', 'INTERNET', 'WATER', 'ELECTRIC', 'GAS', 'LOAN', 'BILL', 'BILLS']);
/* The bank text that identifies an expense: its first word when that's distinctive ("Mint Mobile" -> MINT). You can edit it. */
function guessExpenseKeyword(name) {
  const w = String(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)[0] || '';
  return w.length >= 4 && !GENERIC_EXPENSE_WORDS.has(w) ? w : '';
}

/* mode: 'replace' swaps your list; 'add' keeps what you have and adds the new names. */
function applyExpenseList(parsed, mode) {
  const make = i => ({ id: uid(), name: i.name, amount: i.amount, matchKeyword: guessExpenseKeyword(i.name) });
  if (mode === 'replace') S.fixedExpenses = parsed.items.map(make);
  else for (const i of parsed.items) if (!S.fixedExpenses.some(e => e.name.toLowerCase() === i.name.toLowerCase())) S.fixedExpenses.push(make(i));
  if (parsed.pct != null) S.savingsPercent = Math.min(Math.max(parsed.pct, 0), 100);
  save();
}

/* ---------- to-do list & notes ---------- */

function addTodo(text) {
  text = String(text || '').trim();
  if (!text) return;
  S.todos.unshift({ id: uid(), text, done: false, created: new Date().toISOString() });
  save();
}
function toggleTodo(id) { const t = S.todos.find(x => x.id === id); if (t) { t.done = !t.done; save(); } }
function deleteTodo(id) { S.todos = S.todos.filter(t => t.id !== id); save(); }
function clearDoneTodos() { S.todos = S.todos.filter(t => !t.done); save(); }

function addNote() {
  const n = { id: uid(), title: '', body: '', updated: new Date().toISOString() };
  S.notes.unshift(n);
  save();
  return n.id;
}
function updateNote(id, fields) { const n = S.notes.find(x => x.id === id); if (n) { Object.assign(n, fields, { updated: new Date().toISOString() }); save(); } }
function deleteNote(id) { S.notes = S.notes.filter(n => n.id !== id); save(); }

/* ---------- backup reminder ---------- */

function daysSinceBackup() {
  const ref = S.lastExport || S.created;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
}
const backupDue = () => S.settings.backupDays > 0 && daysSinceBackup() >= S.settings.backupDays;

/* ---------- backup code (text you can email to yourself and paste back in) ---------- */
/* Format: "PL1:" + base64(gzip(json)) + "~"   ("PL0:" = same without compression where the browser can't gzip). */

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipeBytes(bytes, stream) {
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}

async function encodeBackup(state) {
  const raw = new TextEncoder().encode(JSON.stringify(state || S));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'PL1:' + bytesToB64(await pipeBytes(raw, new CompressionStream('gzip'))) + '~'; } catch (e) { /* fall through */ }
  }
  return 'PL0:' + bytesToB64(raw) + '~';
}

/* Accepts a whole email: finds the code inside it, ignoring line breaks. Returns the parsed state or throws. */
async function decodeBackup(text) {
  const m = /(PL[01]):([A-Za-z0-9+\/=\s]+)~/.exec(String(text));
  if (!m) throw new Error('No backup code found');
  const bytes = b64ToBytes(m[2].replace(/\s+/g, ''));
  let raw = bytes;
  if (m[1] === 'PL1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes');
    raw = await pipeBytes(bytes, new DecompressionStream('gzip'));
  }
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.pots)) throw new Error('Not a PocketLedger backup');
  return obj;
}

/* ---------- real bank accounts (through your own link server, see server/README.md) ---------- */
/* The server address and passphrase live in their own storage key, so they are never in a backup or backup code. */

const LINK_KEY = 'pocketledger.link';
function getLink() { try { return JSON.parse(localStorage.getItem(LINK_KEY)) || {}; } catch (e) { return {}; } }
function setLink(obj) { try { localStorage.setItem(LINK_KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ } }
const linkConfigured = () => { const l = getLink(); return !!(l.url && l.passphrase); };

async function linkApi(path, body) {
  const l = getLink();
  if (!l.url || !l.passphrase) throw new Error('Add your server address and passphrase first.');
  if (!/^https:\/\//i.test(l.url)) throw new Error('The server address must start with https://');
  let res;
  try {
    res = await fetch(l.url.replace(/\/+$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + l.passphrase }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // A failed fetch can mean "no such server" or "the server refused this app's address (CORS)". Tell them apart.
    let reachable = false;
    try { await fetch(l.url.replace(/\/+$/, '') + '/status', { mode: 'no-cors' }); reachable = true; } catch (e2) { /* really unreachable */ }
    throw new Error(reachable
      ? 'Your server is there, but it is refusing this app. In Cloudflare open your Worker, then Settings, then Variables and Secrets, and set ALLOWED_ORIGIN to exactly ' + location.origin + ' (no slash at the end). Deploy, then try again.'
      : 'Could not reach your server. Check the address. Opening it in a browser should show {"error":"Wrong passphrase."}.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not json */ }
  if (!res.ok) throw new Error((data && data.error) || 'The server answered ' + res.status);
  return data;
}

function removeTx(id) {
  removeLogs(e => e.txId === id);
  S.transactions = S.transactions.filter(t => t.id !== id);
}

const firstOfMonthISO = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01'; };

/* Updates accounts one by one instead of replacing the whole list, so a bank that has trouble on one sync keeps the accounts it had. */
function mergeAccounts(res) {
  const fresh = res.accounts || [];
  if (!fresh.length) return;
  const failed = new Set(res.failed || []), seen = new Set(fresh.map(a => a.itemId).filter(Boolean));
  const keep = S.accounts.filter(o => !fresh.some(a => a.id === o.id) && (!o.itemId || failed.has(o.itemId) || !seen.has(o.itemId)));
  S.accounts = fresh.concat(keep.filter(o => String(o.id).startsWith('plaid-')));
}

/* Forget one bank's accounts (history stays). */
function forgetBankAccounts(itemId, institution) {
  S.accounts = S.accounts.filter(a => !(a.itemId === itemId || (!a.itemId && institution && a.institution === institution)));
}

/* res = { accounts, added, modified, removed } from the server */
function ingestLinked(res) {
  mergeAccounts(res);
  if (!S.settings.countFrom) S.settings.countFrom = firstOfMonthISO();
  const from = new Date(S.settings.countFrom + 'T00:00:00');
  const norm = t => ({ id: t.id, accountID: t.accountID, rawName: t.rawName, amount: round2(t.amount), date: new Date(t.date).toISOString(), merchant: t.merchant || '', pfc: t.pfc || null });
  for (const t of res.added || []) {
    const old = t.pendingId && txById(t.pendingId);
    if (old) {                                   // the bank replaced a pending purchase with the posted one: keep your sorting
      const pot = old.pot, ign = old.isIgnored;
      removeTx(old.id);
      ingest([norm(t)], { countFrom: from });
      const nt = txById(t.id);
      if (nt && pot) assign(nt.id, pot); else if (nt && ign) ignoreTx(nt.id);
    } else ingest([norm(t)], { countFrom: from });
  }
  for (const t of res.modified || []) {
    const x = txById(t.id), n = norm(t);
    if (!x) { ingest([n], { countFrom: from }); continue; }
    x.amount = n.amount; x.date = n.date; x.rawName = n.rawName;
    if (x.pot) assign(x.id, x.pot);              // re-deduct if the amount changed
  }
  for (const id of res.removed || []) removeTx(id);
  S.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  healOrphans();
  save();
}

let syncInfo = '', bankProblems = [];
async function syncLinked() {
  try {
    let res, guard = 0, got = 0, accts = 0, older = 0;
    const cutoff = new Date((S.settings.countFrom || firstOfMonthISO()) + 'T00:00:00');
    do {
      res = await linkApi('/sync'); ingestLinked(res); guard++;
      got += (res.added || []).length; if (res.accounts && res.accounts.length) accts = res.accounts.length;
      older += (res.added || []).filter(t => new Date(t.date) < cutoff).length;
    } while (res.more && guard < 6);
    S.lastSync = new Date().toISOString();
    bankProblems = (res.problems || []).slice();
    syncError = (res.problems && res.problems.length) ? res.problems.join(' ') : null;
    syncInfo = accts + ' account' + (accts === 1 ? '' : 's') + ', ' + got + ' new purchase' + (got === 1 ? '' : 's') + ' from the bank'
      + (older ? ' (' + older + ' older than ' + S.settings.countFrom + ', kept in Activity as history only)' : '')
      + (got === 0 ? '. Banks often take a few minutes to send history after linking, so tap sync now again shortly.' : '.');
  } catch (e) { syncError = e.message || String(e); }
  save();
}

/* Wipe everything on this phone (not your server), back to a fresh install. */
function eraseEverything() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  S = defaultState();
  save();
}
