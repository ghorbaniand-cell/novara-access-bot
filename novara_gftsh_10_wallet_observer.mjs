import fs from 'node:fs/promises';
import path from 'node:path';

/*
 * GFTSH — TOKEN SHORT-WALLET LIVE FUTURES OBSERVER
 * READ ONLY | NO ORDERS | NO AUTO-COPY
 *
 * Scans 28 selected Hyperliquid perpetual-futures accounts every 5 minutes.
 * Alerts:
 *  1) A newly opened position detected in recent fills (independent of entry distance).
 *  2) Any currently open position whose mark is within the configured entry band
 *     (default 1.00%), once per observed position lifecycle.
 *
 * Same-side adds/averages are not treated as new entries. Telegram delivery is
 * deduplicated only after Telegram confirms the send succeeded.
 *
 * The added public-ranking wallets are research candidates for manual review,
 * not endorsements or automated-copy targets.
 */

const VERSION = 'GFTSH-28W-LIVE-OBSERVER-V3.28.0-VIP-24H-DAILY-PERFORMANCE-REPORT';
const API = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info';
const TG_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
// Optional NOVARA destinations; legacy Telegram destination remains unchanged.
const NOVARA_FREE_CHAT = process.env.NOVARA_FREE_CHAT_ID || '';
const NOVARA_VIP_CHAT = process.env.NOVARA_VIP_CHAT_ID || '';
const NOVARA_FREE_DAILY_LIMIT = Math.max(0, Number(process.env.NOVARA_FREE_DAILY_LIMIT || 5));
const NOVARA_VIP_DAILY_LIMIT = Math.max(0, Number(process.env.NOVARA_VIP_DAILY_LIMIT || 100));
const NOVARA_STATE_FILE = process.env.NOVARA_PUBLISH_STATE_FILE || 'production/state/novara_publish_state.json';
const MODEL_SL_PCT = Math.max(0.01, Number(process.env.GFTSH_MODEL_SL_PCT || 0.5));
const MODEL_TP_R = Math.max(0.1, Number(process.env.GFTSH_MODEL_TP_R || 2));
const TELEGRAM_MIN_GAP_MS = Math.max(1000, Number(process.env.NOVARA_TELEGRAM_MIN_GAP_MS || 3200));

const SCAN_INTERVAL_MIN = Math.max(1, Number(process.env.GFTSH_SCAN_INTERVAL_MIN || 5));
const LOOKBACK_MIN = Math.max(5, Number(process.env.GFTSH_LOOKBACK_MIN || 20));
const ENTRY_BAND_PCT = Math.max(0.01, Number(process.env.GFTSH_ENTRY_BAND_PCT || 1.0));
const REQUEST_GAP_MS = Math.max(100, Number(process.env.GFTSH_REQUEST_GAP_MS || 250));
const TIMEOUT_MS = Math.max(3000, Number(process.env.GFTSH_REQUEST_TIMEOUT_MS || 15000));
const RETRIES = Math.max(1, Number(process.env.GFTSH_RETRIES || 3));
const RETRY_BASE_MS = Math.max(200, Number(process.env.GFTSH_RETRY_BASE_MS || 500));
const MIN_ALERT_NOTIONAL = Math.max(0, Number(process.env.GFTSH_MIN_ALERT_NOTIONAL_USD || 50));
const TELEGRAM_MAX = Math.max(1000, Number(process.env.GFTSH_TELEGRAM_MAX_CHARS || 3800));
const SEND_STARTUP_STATUS = String(process.env.GFTSH_SEND_STARTUP_STATUS || 'true').toLowerCase() !== 'false';

const STATE_FILE = process.env.GFTSH_WATCH_STATE_FILE || 'production/state/gftsh_10_wallet_observer.json';
const TG_STATE_FILE = process.env.GFTSH_WATCH_TELEGRAM_STATE_FILE || 'production/state/gftsh_10_wallet_telegram.json';

const DEFAULT_WALLETS = [
  ['⭐ Trader 1 ⭐', '0xe2823659be02e0f48a4660e4da008b5e1abfdf29'],
  ['⭐ Trader 2 ⭐', '0x909eb3d5ff0ac0df12c81f8495860cfccf1e7ea9'],
  ['⭐ Trader 3 ⭐', '0x8efa981f60384083496148b55361a83edc268295'],
  ['⭐ Trader 4 ⭐', '0x8bae3527e5a33fa0cf184f37bc112d071463ab6d'],
  ['⭐ Trader 5 ⭐', '0x53f8f390fd4f70941c5d160a964f6893c8dbceff'],
  ['⭐ Trader 6 ⭐', '0xf9faba57a81d1575d3e506dd3eafe7db6f2a3275'],
  ['⭐ Trader 7 ⭐', '0xc0b2a1ce425d0cd8bc321c445fa6ae0eaed2e688'],
  ['⭐ Trader 8 ⭐', '0xce508465b243216fcf372d3146fd62e8f7a7b8e2'],
  ['⭐ Trader 9 ⭐', '0xfdbaa5eee7cdf45eec3a71a672065a67191fda7a'],
  ['⭐ Trader 10 ⭐', '0x3dd462347e7b42b5a3ea15132b677a4978af7a81'],
  ['⭐ Trader 11 ⭐', '0x88250cf2f6402e856bc85fc65095e4a48bb12cb7'],
  ['⭐ Trader 12 ⭐', '0x0c1f6941fdcde9488dfd36ca16fed6b3bc49672b'],
  ['⭐ Trader 13 ⭐', '0xf179326c91d7233ae833d668c5d44c6a7d472161'],
  ['⭐ Trader 14 ⭐', '0xe5731d975d84c7222ebfd0ce8239f04ea3164e55'],
  ['⭐ Trader 15 ⭐', '0x19f5c3bc2e0978d9a1da389d7d4cfe33cd770fe9'],
  ['⭐ Trader 16 ⭐', '0x36ac01de9bc76c0d744b38c3e13a0538d55c7568'],
  ['⭐ Trader 17 ⭐', '0xbd334a55db91617545e8d1b09941e036ad8e4200'],
  ['⭐ Trader 18 ⭐', '0x767f6dcea7e1d520a3b7ac251b30178a79eb2ab0'],
  ['⭐ Trader 19 ⭐', '0xe31501c472d557bfa145ce105d325fb2dd4cb867'],
  ['⭐ Trader 20 ⭐ — PONS short candidate — large open short; reported PONS realized PnL', '0x936cf4fb95c30ce83f658b5bbb247e4bb381bb0f'],
  ['⭐ Trader 21 ⭐ — PONS short candidate — profitable open short', '0xd4c1f7e8d876c4749228d515473d36f919583d1d'],
  ['⭐ Trader 22 ⭐ — STRK short candidate — large profitable open short', '0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05'],
  ['⭐ Trader 23 ⭐ — STRK short candidate — profitable open short', '0x7717a7a245d9f950e586822b8c9b46863ed7bd7e'],
  ['⭐ Trader 24 ⭐', '0x1081e214bd6f0137234b92432d9b6033b88965b7'],
  ['⭐ Trader 25 ⭐ — recent-activity research candidate', '0x4bafc8eca50fc3208fb2520a2a49980768ec60f6'],
  ['⭐ Trader 26 ⭐ — high reported win rate / +$956k all-time PnL / positive reported open uPnL; verify current live positions', '0xd142479997958a4fefd1f8d5373b31ce36987d73'],
  ['Trader 27', '0x736850ee773ac6170fcaeda596514269b863ee56'],
  ['Trader 28', '0xde0e9b1a35322a809165d09f0490cca3fa7562e5'],
];

function parseWallets() {
  const raw = String(process.env.GFTSH_WATCH_WALLETS || '').trim();
  const source = raw
    ? raw.split(',').map(x => x.trim()).filter(Boolean).map((item, i) => {
        const [label, address] = item.includes('|')
          ? item.split('|').map(x => x.trim())
          : [`Trader #${i + 1}`, item];
        return [label || `Trader #${i + 1}`, address];
      })
    : DEFAULT_WALLETS;

  const seen = new Set();
  const out = [];
  for (const [label, address] of source) {
    const normalized = String(address || '').toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push([label || `Trader #${out.length + 1}`, normalized]);
  }
  if (out.length !== 28) {
    throw new Error(`Expected exactly 28 unique valid wallet addresses; got ${out.length}. Check GFTSH_WATCH_WALLETS.`);
  }
  return out;
}

const WALLETS = parseWallets();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const short = address => `${address.slice(0, 8)}…${address.slice(-6)}`;

function fmtPx(value) {
  const n = num(value);
  if (!(n > 0)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(6);
  if (n >= 0.0001) return n.toFixed(8);
  return n.toExponential(5);
}
function fmtPct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : '—';
}
function fmtLev(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(n >= 10 ? 1 : 2)}x` : 'Not provided';
}
function modelLevels(entryValue, side) {
  const entry = num(entryValue);
  const slDistance = entry * MODEL_SL_PCT / 100;
  const tpDistance = slDistance * MODEL_TP_R;
  return {
    sl: side === 'LONG' ? entry - slDistance : entry + slDistance,
    tp: side === 'LONG' ? entry + tpDistance : entry - tpDistance,
    slPct: MODEL_SL_PCT, tpPct: MODEL_SL_PCT * MODEL_TP_R
  };
}
function signedMovePct(entry, exit, side) {
  if (!(num(entry) > 0) || !(num(exit) > 0)) return 0;
  return ((num(exit) - num(entry)) / num(entry)) * (side === 'LONG' ? 100 : -100);
}
function estimatedPnl(notionalValue, entry, exit, side) {
  return num(notionalValue) * signedMovePct(entry, exit, side) / 100;
}
function notional(fill) {
  return Math.abs(num(fill?.sz) * num(fill?.px));
}
function fillKey(fill) {
  return String(fill?.tid ?? `${fill?.coin}|${fill?.time}|${fill?.oid}|${fill?.px}|${fill?.sz}|${fill?.dir}`);
}
function postPositionFromFill(fill) {
  const before = num(fill?.startPosition);
  const size = Math.abs(num(fill?.sz));
  const dir = String(fill?.dir || '').toLowerCase();
  if (dir.includes('open long')) return before + size;
  if (dir.includes('open short')) return before - size;
  if (dir.includes('close long')) return before - size;
  if (dir.includes('close short')) return before + size;
  if (dir.includes('buy')) return before + size;
  if (dir.includes('sell')) return before - size;
  return before;
}
function isNewPositionFill(fill) {
  const before = num(fill?.startPosition);
  const after = postPositionFromFill(fill);
  if (Math.abs(after) < 1e-12) return false;
  // Flat -> non-flat is a new position. A side flip is also a new lifecycle.
  if (Math.abs(before) < 1e-12) return true;
  if (Math.sign(before) !== Math.sign(after)) return true;
  // Same-side non-flat -> larger same-side position is an add/average, not a new entry.
  return false;
}
function sideFromFill(fill) {
  const dir = String(fill?.dir || '').toLowerCase();
  if (dir.includes('open short') || dir.includes('close short')) return 'SHORT';
  if (dir.includes('open long') || dir.includes('close long')) return 'LONG';
  const after = postPositionFromFill(fill);
  if (after > 0) return 'LONG';
  if (after < 0) return 'SHORT';
  return dir.includes('sell') ? 'SHORT' : 'LONG';
}

let requestGate = Promise.resolve();
let nextRequestAt = 0;
async function pace() {
  requestGate = requestGate.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + REQUEST_GAP_MS;
  });
  return requestGate;
}
async function postInfo(body, label) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const bodyText = await response.text();
      if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${bodyText.slice(0, 180)}`);
      return JSON.parse(bodyText);
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(RETRY_BASE_MS * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`${label}: failed`);
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
function extractPositions(state) {
  const rows = Array.isArray(state?.assetPositions) ? state.assetPositions : [];
  return rows.map(row => {
    const p = row?.position || row || {};
    const szi = num(p.szi);
    return {
      coin: String(p.coin || ''),
      szi,
      side: szi > 0 ? 'LONG' : szi < 0 ? 'SHORT' : 'FLAT',
      entry: num(p.entryPx),
      positionValue: Math.abs(num(p.positionValue)),
      unrealizedPnl: num(p.unrealizedPnl),
      leverage: num(p?.leverage?.value) || num(p?.leverage?.leverage) || num(p?.leverage)
    };
  }).filter(p => p.coin && p.side !== 'FLAT');
}
function findPosition(positions, coin, side) {
  return positions.find(p => p.coin === coin && p.side === side) || null;
}
async function fetchCurrentState(address) {
  return postInfo({ type: 'clearinghouseState', user: address }, `state:${short(address)}`);
}
async function fetchFills(address, startTime, endTime) {
  const rows = await postInfo({
    type: 'userFillsByTime', user: address, startTime, endTime, aggregateByTime: false
  }, `fills:${short(address)}`);
  return Array.isArray(rows) ? rows : [];
}
async function fetchMids() {
  return postInfo({ type: 'allMids' }, 'allMids');
}

function formatAlert(a) {
  const icon = a.side === 'LONG' ? '🟢' : '🔴';
  const levels = modelLevels(a.entry, a.side);
  return [
    '🐋 GFTSH | SMART-MONEY OBSERVER',
    '━━━━━━━━━━━━━━━━━━',
    `${icon} ${a.coin} · ${a.side}`,
    `👤 Wallet: ${a.trader}`,
    `⚡ Leverage: ${fmtLev(a.leverage)}`,
    `📍 Entry: ${fmtPx(a.entry)}`,
    `💹 Current price: ${fmtPx(a.current)}`,
    `📏 Distance from entry: ${fmtPct(a.distancePct)}`,
    `💰 Signal notional: $${num(a.notional).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    `🎯 Model TP: ${fmtPx(levels.tp)} (+${fmtPct(levels.tpPct)})`,
    `🛑 Model SL: ${fmtPx(levels.sl)} (-${fmtPct(levels.slPct)})`,
    `🕒 Fill time: ${a.fillTime ? new Date(a.fillTime).toISOString() : 'not available'}`,
    '⚠️ TP/SL are simulated NOVARA levels, not the trader’s verified orders.',
    '🛡️ READ-ONLY · NO ORDERS · NO AUTO-COPY'
  ].join('\n');
}

function formatNovaraAlert(a, tier = 'VIP') {
  const icon = a.side === 'LONG' ? '🟢' : '🔴';
  const entry = num(a.entry);
  const levels = modelLevels(entry, a.side);
  const move = signedMovePct(entry, a.current, a.side);
  const leverage = num(a.leverage);
  const eventEn = a.alertType === 'NEW_ENTRY'
    ? 'New position entry detected'
    : 'Existing position near entry zone';
  const eventAr = a.alertType === 'NEW_ENTRY'
    ? 'تم رصد دخول مركز جديد'
    : 'مركز قائم بالقرب من منطقة الدخول';
  const titleEn = tier === 'FREE' ? 'NOVARA | MARKET SIGNAL' : 'NOVARA | PREMIUM SIGNAL';
  const titleAr = tier === 'FREE' ? 'NOVARA | إشارة السوق' : 'NOVARA | إشارة مميزة';
  const sideAr = a.side === 'LONG' ? 'شراء (LONG)' : 'بيع (SHORT)';

  // Keep customer-facing posts clean: never expose internal trader labels or wallet details.
  // English section first, followed by a complete Arabic section.
  return [
    `🔷 ${titleEn}`,
    '',
    `${icon} ${a.coin} — ${a.side}`,
    '━━━━━━━━━━━━━━━━━━',
    '📊 MARKET SETUP',
    `Entry Reference: ${fmtPx(entry)}`,
    `Current Market Price: ${fmtPx(a.current)}`,
    `Move vs. Entry: ${fmtPct(move)}`,
    `Observed Leverage: ${fmtLev(leverage)}`,
    `Signal Event: ${eventEn}`,
    '━━━━━━━━━━━━━━━━━━',
    '🎯 NOVARA REFERENCE LEVELS',
    `Target 1 (illustrative): ${fmtPx(levels.tp)}`,
    `Invalidation Level (illustrative): ${fmtPx(levels.sl)}`,
    '',
    '🔎 SIGNAL INSIGHT',
    'Market activity indicates a position was opened or observed near its entry zone. These are NOVARA reference calculations, not verified trader-set orders.',
    '',
    '🛡 RISK DISCLOSURE',
    'Market information only; not an executed trade or a guarantee of results. Leverage increases both potential gains and losses.',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `🔷 ${titleAr}`,
    '',
    `${icon} ${a.coin} — ${sideAr}`,
    '📊 بيانات السوق',
    `سعر الدخول المرجعي: ${fmtPx(entry)}`,
    `السعر الحالي: ${fmtPx(a.current)}`,
    `التغير مقابل الدخول: ${fmtPct(move)}`,
    `الرافعة المالية المرصودة: ${fmtLev(leverage)}`,
    `الحدث: ${eventAr}`,
    '━━━━━━━━━━━━━━━━━━',
    '🎯 المستويات المرجعية من NOVARA',
    `الهدف الأول (تقديري): ${fmtPx(levels.tp)}`,
    `مستوى إبطال الفكرة (تقديري): ${fmtPx(levels.sl)}`,
    '',
    '🔎 قراءة الإشارة',
    'تشير بيانات السوق إلى رصد مركز جديد أو مركز قائم بالقرب من منطقة الدخول. هذه حسابات مرجعية من NOVARA وليست أوامر مؤكدة للمتداول.',
    '',
    '🛡️ تنويه المخاطر',
    'هذه معلومات سوقية وليست صفقة منفذة أو ضماناً للربح. الرافعة المالية تزيد الأرباح والخسائر المحتملة.',
    '',
    'NOVARA — Clarity. Discipline. Transparency.'
  ].join('\n');
}

function formatOutcomeMessage(trade) {
  const isWin = trade.status === 'TP_HIT';
  const icon = isWin ? '✅🏆' : '🛑🔻';
  const raw = signedMovePct(trade.entry, trade.exitPrice, trade.side);
  const leveragedRoi = num(trade.leverage) > 0 ? raw * num(trade.leverage) : null;
  const pnl = estimatedPnl(trade.notional, trade.entry, trade.exitPrice, trade.side);
  const outcomeEn = isWin ? 'TAKE PROFIT REACHED' : 'INVALIDATION / STOP LEVEL REACHED';
  const outcomeAr = isWin ? 'تم الوصول إلى الهدف' : 'تم الوصول إلى مستوى الإبطال / وقف الخسارة';
  const sideEn = trade.side === 'LONG' ? 'LONG' : 'SHORT';
  const sideAr = trade.side === 'LONG' ? 'شراء (LONG)' : 'بيع (SHORT)';
  const roiEn = leveragedRoi === null ? '—' : `${leveragedRoi >= 0 ? '+' : ''}${fmtPct(leveragedRoi)}`;
  const pnlEn = `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
  return [
    '🔷 NOVARA | SIGNAL UPDATE',
    '',
    `${icon} ${trade.coin} — ${sideEn}`,
    `Result: ${outcomeEn}`,
    `Entry Reference: ${fmtPx(trade.entry)}`,
    `Observed Exit Price: ${fmtPx(trade.exitPrice)}`,
    `Target 1: ${fmtPx(trade.tp)}`,
    `Invalidation Level: ${fmtPx(trade.sl)}`,
    `Observed Leverage: ${fmtLev(trade.leverage)}`,
    `Estimated ROI on margin: ${roiEn}`,
    `Estimated gross P/L: ${pnlEn}`,
    '',
    'This update is based on monitored market prices and illustrative NOVARA levels. It does not represent an executed trade. Fees and funding are excluded.',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '🔷 NOVARA | تحديث الإشارة',
    '',
    `${icon} ${trade.coin} — ${sideAr}`,
    `النتيجة: ${outcomeAr}`,
    `سعر الدخول المرجعي: ${fmtPx(trade.entry)}`,
    `سعر الخروج المرصود: ${fmtPx(trade.exitPrice)}`,
    `الهدف الأول: ${fmtPx(trade.tp)}`,
    `مستوى الإبطال: ${fmtPx(trade.sl)}`,
    `الرافعة المالية المرصودة: ${fmtLev(trade.leverage)}`,
    `العائد التقديري على الهامش: ${roiEn}`,
    `الربح/الخسارة الإجمالية التقديرية: ${pnlEn}`,
    '',
    'يعتمد هذا التحديث على أسعار السوق المرصودة ومستويات NOVARA التقديرية، ولا يمثل صفقة منفذة. الرسوم والتمويل غير مشمولين.',
    '',
    'NOVARA — Clarity. Discipline. Transparency.'
  ].join('\n');
}

function vipSignalRecords(novaraState) {
  const vipChat = String(NOVARA_VIP_CHAT || '');
  if (!vipChat) return [];
  const records = [
    ...(Array.isArray(novaraState.openTrades) ? novaraState.openTrades : []),
    ...(Array.isArray(novaraState.pendingOutcomes) ? novaraState.pendingOutcomes : []),
    ...(Array.isArray(novaraState.completedOutcomes) ? novaraState.completedOutcomes : [])
  ];
  const unique = new Map();
  for (const trade of records) {
    const destinations = Array.isArray(trade.destinations) ? trade.destinations.map(String) : [];
    if (!destinations.includes(vipChat)) continue;
    if (!trade.key || !(num(trade.signalAt) > 0) || !(num(trade.entry) > 0)) continue;
    unique.set(String(trade.key), trade);
  }
  return [...unique.values()];
}

function dailyReportSnapshot(novaraState, mids, now) {
  const windowStart = now - 24 * 60 * 60 * 1000;
  const allVip = vipSignalRecords(novaraState);
  const rows = allVip
    .filter(t => num(t.signalAt) >= windowStart && num(t.signalAt) <= now)
    .map(t => {
      const status = t.status || 'OPEN';
      const mark = num(mids?.[t.coin]);
      const exit = status === 'TP_HIT' || status === 'SL_HIT' ? num(t.exitPrice) : mark;
      const priceMovePct = exit > 0 ? signedMovePct(t.entry, exit, t.side) : null;
      const roi = priceMovePct !== null && num(t.leverage) > 0 ? priceMovePct * num(t.leverage) : null;
      const signalTime = new Date(num(t.signalAt)).toISOString().slice(5, 16).replace('T', ' ');
      return {
        key: String(t.key), signalAt: num(t.signalAt), time: `${signalTime} UTC`,
        coin: String(t.coin || '—'), side: String(t.side || '—'), leverage: num(t.leverage),
        status, roi, mark, entry: num(t.entry), tp: num(t.tp), sl: num(t.sl)
      };
    })
    .sort((a, b) => a.signalAt - b.signalAt);

  const wins = rows.filter(r => r.status === 'TP_HIT').length;
  const losses = rows.filter(r => r.status === 'SL_HIT').length;
  const active = rows.filter(r => r.status === 'OPEN' || !['TP_HIT', 'SL_HIT'].includes(r.status)).length;
  const resolved = wins + losses;
  const winRate = resolved ? `${(wins / resolved * 100).toFixed(2)}%` : 'N/A (no resolved signals)';
  const averageResolvedRoi = rows.filter(r => ['TP_HIT', 'SL_HIT'].includes(r.status) && r.roi !== null);
  const avgRoi = averageResolvedRoi.length
    ? `${(averageResolvedRoi.reduce((sum, r) => sum + r.roi, 0) / averageResolvedRoi.length) >= 0 ? '+' : ''}${(averageResolvedRoi.reduce((sum, r) => sum + r.roi, 0) / averageResolvedRoi.length).toFixed(2)}%`
    : 'N/A';

  const english = [
    '🔷 NOVARA | DAILY VIP PERFORMANCE REPORT',
    '━━━━━━━━━━━━━━━━━━',
    'Reporting window: Last 24 hours (UTC)',
    `VIP signals published: ${rows.length}`,
    `🎯 Target reached: ${wins}`,
    `🛑 Invalidation reached: ${losses}`,
    `⏳ Active / unresolved: ${active}`,
    `📊 Resolved signals: ${resolved}`,
    `🏆 Win rate (resolved signals only): ${winRate}`,
    `📈 Average estimated ROI of resolved signals: ${avgRoi}`,
    '━━━━━━━━━━━━━━━━━━',
    '📋 VIP SIGNAL LOG',
    'Time UTC | Symbol | Side | Leverage | Result | Est. ROI',
    ...rows.map(r => {
      const side = r.side === 'LONG' ? 'LONG' : 'SHORT';
      const leverage = r.leverage > 0 ? `${r.leverage.toFixed(r.leverage >= 10 ? 1 : 2)}x` : 'N/A';
      const result = r.status === 'TP_HIT' ? 'TARGET' : r.status === 'SL_HIT' ? 'INVALIDATION' : 'ACTIVE';
      const roi = r.roi === null ? 'N/A' : `${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(2)}%`;
      return `${r.time} | ${r.coin} | ${side} | ${leverage} | ${result} | ${roi}`;
    }),
    '━━━━━━━━━━━━━━━━━━',
    'This is a daily, reference-based performance report. Results may differ tomorrow or in the following days as market conditions change. No signal or strategy is guaranteed to win.',
    'Targets and invalidation levels are illustrative NOVARA levels, not proof of executed trades. Active-signal ROI is a market-price snapshot; resolved ROI uses the reference level. Fees and funding are excluded.',
    'Our team works continuously to analyze the market and strive to deliver high-quality signals at the most appropriate times possible. Always manage risk responsibly; leverage magnifies gains and losses.',
    'NOVARA — Clarity. Discipline. Transparency.'
  ].join('\n');

  const arabic = [
    '🔷 NOVARA | التقرير اليومي لأداء VIP',
    '━━━━━━━━━━━━━━━━━━',
    'الفترة: آخر 24 ساعة (بتوقيت UTC)',
    `إجمالي إشارات VIP المنشورة: ${rows.length}`,
    `🎯 إشارات وصلت إلى الهدف: ${wins}`,
    `🛑 إشارات وصلت إلى مستوى الإبطال: ${losses}`,
    `⏳ إشارات نشطة / لم تُحسم: ${active}`,
    `📊 الإشارات المحسومة: ${resolved}`,
    `🏆 نسبة النجاح (للإشارات المحسومة فقط): ${winRate}`,
    `📈 متوسط العائد التقديري للإشارات المحسومة: ${avgRoi}`,
    '━━━━━━━━━━━━━━━━━━',
    '📋 سجل إشارات VIP',
    'الوقت UTC | العملة | الاتجاه | الرافعة | النتيجة | العائد التقديري',
    ...rows.map(r => {
      const side = r.side === 'LONG' ? 'شراء' : 'بيع';
      const leverage = r.leverage > 0 ? `${r.leverage.toFixed(r.leverage >= 10 ? 1 : 2)}x` : 'غير متاح';
      const result = r.status === 'TP_HIT' ? 'الهدف' : r.status === 'SL_HIT' ? 'الإبطال' : 'نشطة';
      const roi = r.roi === null ? 'غير متاح' : `${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(2)}%`;
      return `${r.time} | ${r.coin} | ${side} | ${leverage} | ${result} | ${roi}`;
    }),
    '━━━━━━━━━━━━━━━━━━',
    'هذا تقرير أداء يومي استناداً إلى مستويات مرجعية وأسعار السوق المرصودة. قد تختلف النتائج غداً أو في الأيام التالية مع تغير ظروف السوق. لا توجد إشارة أو استراتيجية مضمونة النجاح.',
    'الأهداف ومستويات الإبطال هي مستويات تقديرية من NOVARA، ولا تثبت تنفيذ صفقات فعلية. العائد للإشارات النشطة هو لقطة تقديرية وفق السعر الحالي، أما الإشارات المحسومة فيُحسب عائدها وفق المستوى المرجعي. الرسوم والتمويل غير مشمولين.',
    'يعمل فريقنا باستمرار على تحليل السوق ويسعى إلى تقديم إشارات عالية الجودة في الأوقات المناسبة قدر الإمكان. احرصوا دائماً على إدارة المخاطر بمسؤولية، فالرافعة المالية تضاعف الأرباح والخسائر.',
    'NOVARA — الوضوح. الانضباط. الشفافية.'
  ].join('\n');

  return { createdAt: now, windowStart, rowsCount: rows.length, english, arabic };
}

function splitTelegramText(message, maxChars = Math.max(1000, TELEGRAM_MAX - 100)) {
  const chunks = [];
  let chunk = '';
  for (const line of String(message).split('\n')) {
    if (line.length > maxChars) {
      if (chunk) chunks.push(chunk), chunk = '';
      for (let i = 0; i < line.length; i += maxChars) chunks.push(line.slice(i, i + maxChars));
      continue;
    }
    const candidate = chunk ? `${chunk}\n${line}` : line;
    if (candidate.length > maxChars && chunk) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks : [''];
}

async function deliverDailyReports(novaraState, mids, now) {
  const destinations = [...new Set([NOVARA_FREE_CHAT, NOVARA_VIP_CHAT].filter(Boolean))];
  if (!destinations.length) return;
  if (!novaraState.dailyReportLastSentAt || typeof novaraState.dailyReportLastSentAt !== 'object') novaraState.dailyReportLastSentAt = {};
  if (!novaraState.dailyReportProgress || typeof novaraState.dailyReportProgress !== 'object') novaraState.dailyReportProgress = {};

  let snapshot = novaraState.dailyReportSnapshot || null;
  const due = destinations.filter(chatId => {
    const last = num(novaraState.dailyReportLastSentAt[chatId]);
    const progress = novaraState.dailyReportProgress[chatId];
    return (progress && snapshot && progress.reportId === snapshot.reportId) || !last || now - last >= 24 * 60 * 60 * 1000;
  });
  if (!snapshot && due.length) {
    const history = vipSignalRecords(novaraState);
    // Avoid an empty first-ever report; after at least one VIP signal exists, report even if the latest 24h window has zero signals.
    if (!history.length) return;
    const content = dailyReportSnapshot(novaraState, mids, now);
    snapshot = {
      reportId: String(now), createdAt: now, windowStart: content.windowStart,
      rowsCount: content.rowsCount, destinations: due,
      englishChunks: splitTelegramText(content.english),
      arabicChunks: splitTelegramText(content.arabic)
    };
    novaraState.dailyReportSnapshot = snapshot;
    for (const chatId of due) novaraState.dailyReportProgress[chatId] = { reportId: snapshot.reportId, nextChunk: 0 };
    await writeJson(NOVARA_STATE_FILE, novaraState);
  }
  if (!snapshot) return;

  const snapshotDestinations = Array.isArray(snapshot.destinations) ? snapshot.destinations : [];
  const chunks = [...(snapshot.englishChunks || []), ...(snapshot.arabicChunks || [])];
  for (const chatId of snapshotDestinations) {
    const progress = novaraState.dailyReportProgress[chatId];
    if (!progress || progress.reportId !== snapshot.reportId) continue;
    while (num(progress.nextChunk) < chunks.length) {
      const index = num(progress.nextChunk);
      try {
        const result = await sendTelegram(chunks[index], chatId);
        if (!result.sent) {
          console.warn(`[NOVARA][DAILY-REPORT-SKIPPED] chat=${chatId}: ${result.reason}`);
          break;
        }
        progress.nextChunk = index + 1;
        novaraState.dailyReportProgress[chatId] = progress;
        await writeJson(NOVARA_STATE_FILE, novaraState);
      } catch (error) {
        console.error(`[NOVARA][DAILY-REPORT-ERROR] chat=${chatId} chunk=${index + 1}/${chunks.length}: ${error?.message || error}`);
        break;
      }
    }
    if (num(progress.nextChunk) >= chunks.length) {
      novaraState.dailyReportLastSentAt[chatId] = now;
      delete novaraState.dailyReportProgress[chatId];
      await writeJson(NOVARA_STATE_FILE, novaraState);
    }
  }

  const allSnapshotDestinationsDone = snapshotDestinations.every(chatId =>
    !novaraState.dailyReportProgress[chatId] && num(novaraState.dailyReportLastSentAt[chatId]) >= num(snapshot.createdAt)
  );
  if (allSnapshotDestinationsDone) {
    delete novaraState.dailyReportSnapshot;
    await writeJson(NOVARA_STATE_FILE, novaraState);
  }
}

let nextTelegramSendAt = 0;
async function sendTelegram(message, chatId = TG_CHAT) {
  if (!TG_TOKEN || !chatId) {
    return { sent: false, reason: !TG_TOKEN ? 'telegram_token_not_configured' : 'telegram_chat_not_configured' };
  }
  const text = message.length > TELEGRAM_MAX
    ? `${message.slice(0, TELEGRAM_MAX - 60)}\n\n⚠️ Message truncated.`
    : message;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = Math.max(0, nextTelegramSendAt - Date.now());
    if (wait) await sleep(wait);
    nextTelegramSendAt = Date.now() + TELEGRAM_MIN_GAP_MS;
    const response = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
    const responseText = await response.text();
    let data = {};
    try { data = JSON.parse(responseText); } catch {}
    if (response.ok && data.ok) return { sent: true };
    const retryAfter = num(data?.parameters?.retry_after);
    if ((response.status === 429 || data?.error_code === 429) && attempt < 4) {
      const waitMs = Math.max(retryAfter * 1000, TELEGRAM_MIN_GAP_MS);
      console.warn(`[TELEGRAM][RATE-LIMIT] waiting ${Math.ceil(waitMs / 1000)}s before retry (${attempt}/3).`);
      await sleep(waitMs + 250);
      nextTelegramSendAt = Date.now() + TELEGRAM_MIN_GAP_MS;
      continue;
    }
    throw new Error(`Telegram HTTP ${response.status}: ${responseText.slice(0, 200)}`);
  }
  throw new Error('Telegram send failed after retry attempts.');
}
async function sendStartupStatus() {
  if (!SEND_STARTUP_STATUS) return;
  await sendTelegram([
    '👁️ GFTSH — 28 WALLET OBSERVER',
    '━━━━━━━━━━━━━━━━━━',
    '📡 Status: WATCHING',
    `👥 Wallets: ${WALLETS.length}`,
    `⏱ Scan interval: ${SCAN_INTERVAL_MIN} minutes`,
    `📐 Existing-position entry band: ${ENTRY_BAND_PCT.toFixed(2)}%`,
    '📚 Market: Hyperliquid Perpetual Futures',
    '🛡 Mode: READ-ONLY',
    '❌ Orders: DISABLED',
    '❌ Auto-copy: DISABLED'
  ].join('\n'));
}

async function main() {
  const startedAt = Date.now();
  const now = Date.now();
  const startTime = Math.max(0, now - LOOKBACK_MIN * 60_000);
  console.log(`\n${VERSION}`);
  console.log('READ-ONLY | NO ORDERS | NO AUTO-COPY | FUTURES ONLY');
  console.log(`Watching ${WALLETS.length} wallets every ${SCAN_INTERVAL_MIN} minutes; entry band ${ENTRY_BAND_PCT.toFixed(2)}%.`);

  const state = await readJson(STATE_FILE, {
    version: VERSION, initialized: false, lastScanAt: 0, wallets: {},
    alertedOpenPositionKeys: [], alertedNewEntryFillKeys: []
  });
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Observer state JSON must be an object.');
  if (!state.wallets || typeof state.wallets !== 'object' || Array.isArray(state.wallets)) state.wallets = {};
  if (!Array.isArray(state.alertedOpenPositionKeys)) state.alertedOpenPositionKeys = [];
  if (!Array.isArray(state.alertedNewEntryFillKeys)) state.alertedNewEntryFillKeys = [];

  // Prevent overlapping scheduled/manual runs from producing duplicate Telegram alerts.
  const lastScanAt = num(state.lastScanAt);
  const age = Date.now() - lastScanAt;
  if (lastScanAt && age >= 0 && age < 2 * 60_000) {
    console.log(`[SCHEDULE-GUARD] Previous scan was ${Math.round(age / 1000)}s ago; skipping duplicate invocation.`);
    return;
  }

  const [mids, tgState, novaraState] = await Promise.all([
    fetchMids(),
    readJson(TG_STATE_FILE, { initialized: false, lastStartupAt: 0, lastCycleAt: 0 }),
    readJson(NOVARA_STATE_FILE, { date: '', freeSent: 0, vipSent: 0, sentKeys: [], openTrades: [], pendingOutcomes: [], completedOutcomes: [], dailyReportLastSentAt: {}, dailyReportProgress: {} })
  ]);
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  if (novaraState.date !== todayUtc) {
    novaraState.date = todayUtc;
    novaraState.freeSent = 0;
    novaraState.vipSent = 0;
    novaraState.sentKeys = [];
  }
  if (!Array.isArray(novaraState.sentKeys)) novaraState.sentKeys = [];
  if (!Array.isArray(novaraState.openTrades)) novaraState.openTrades = [];
  if (!Array.isArray(novaraState.pendingOutcomes)) novaraState.pendingOutcomes = [];
  if (!Array.isArray(novaraState.completedOutcomes)) novaraState.completedOutcomes = [];
  if (!novaraState.dailyReportLastSentAt || typeof novaraState.dailyReportLastSentAt !== 'object') novaraState.dailyReportLastSentAt = {};
  if (!novaraState.dailyReportProgress || typeof novaraState.dailyReportProgress !== 'object') novaraState.dailyReportProgress = {};
  const openDedupe = new Set(state.alertedOpenPositionKeys.map(String));
  const fillDedupe = new Set(state.alertedNewEntryFillKeys.map(String));
  const alerts = [];
  let outcomesDetected = 0, outcomesSent = 0, outcomeErrors = 0;
  const disabledDestinations = new Set();

  // Track model TP/SL outcomes for previously published NOVARA signals.
  // These are paper-tracked reference trades, never real orders.
  for (const trade of novaraState.openTrades) {
    if (trade.status !== 'OPEN') continue;
    const mark = num(mids?.[trade.coin]);
    if (!(mark > 0)) continue;
    let status = null;
    if (trade.side === 'LONG') {
      if (mark >= num(trade.tp)) status = 'TP_HIT';
      else if (mark <= num(trade.sl)) status = 'SL_HIT';
    } else {
      if (mark <= num(trade.tp)) status = 'TP_HIT';
      else if (mark >= num(trade.sl)) status = 'SL_HIT';
    }
    if (!status) continue;
    trade.status = status;
    trade.exitPrice = status === 'TP_HIT' ? num(trade.tp) : num(trade.sl);
    trade.observedPrice = mark;
    trade.resolvedAt = now;
    trade.pendingDestinations = Array.isArray(trade.destinations) ? [...trade.destinations] : [];
    novaraState.pendingOutcomes.push(trade);
    outcomesDetected++;
  }
  novaraState.openTrades = novaraState.openTrades.filter(t => t.status === 'OPEN');
  await writeJson(NOVARA_STATE_FILE, novaraState);

  for (const trade of novaraState.pendingOutcomes) {
    const originalDestinations = [...(trade.pendingDestinations || [])];
    const remaining = [];
    for (let i = 0; i < originalDestinations.length; i++) {
      const destination = originalDestinations[i];
      if (disabledDestinations.has(destination)) {
        remaining.push(destination);
        continue;
      }
      try {
        const result = await sendTelegram(formatOutcomeMessage(trade), destination);
        if (result.sent) outcomesSent++;
        else remaining.push(destination);
      } catch (error) {
        remaining.push(destination);
        outcomeErrors++;
        if (String(error?.message || error).includes('HTTP 403') && String(error?.message || error).toLowerCase().includes('not a member')) {
          disabledDestinations.add(destination);
        }
        console.error(`[OUTCOME][ERROR] ${trade.coin} ${trade.status}: ${error?.message || error}`);
      }
      trade.pendingDestinations = [...remaining, ...originalDestinations.slice(i + 1)];
      // Persist after each destination so a later failure cannot resend a confirmed result.
      await writeJson(NOVARA_STATE_FILE, novaraState);
    }
    trade.pendingDestinations = remaining;
  }
  const stillPending = [];
  for (const trade of novaraState.pendingOutcomes) {
    if ((trade.pendingDestinations || []).length) stillPending.push(trade);
    else novaraState.completedOutcomes.push({
      key: trade.key, coin: trade.coin, side: trade.side, status: trade.status,
      entry: trade.entry, tp: trade.tp, sl: trade.sl, exitPrice: trade.exitPrice,
      leverage: trade.leverage, notional: trade.notional, signalAt: trade.signalAt,
      resolvedAt: trade.resolvedAt, destinations: Array.isArray(trade.destinations) ? [...trade.destinations] : [],
      alertType: trade.alertType
    });
  }
  novaraState.pendingOutcomes = stillPending;
  novaraState.completedOutcomes = novaraState.completedOutcomes.slice(-1000);
  await writeJson(NOVARA_STATE_FILE, novaraState);

  let walletsSucceeded = 0, walletErrors = 0, positionsChecked = 0;
  let inBand = 0, outsideBand = 0, alreadyAlerted = 0, averagingIgnored = 0;
  let alertSendErrors = 0, alertsSent = 0, newEntryCount = 0;

  for (const [trader, address] of WALLETS) {
    try {
      const [currentState, fills] = await Promise.all([
        fetchCurrentState(address),
        fetchFills(address, startTime, now)
      ]);
      const positions = extractPositions(currentState);
      const sortedFills = fills.slice().sort((a, b) => num(a.time) - num(b.time));
      const currentKeys = new Set();
      const newEntrySidesThisCycle = new Set();

      // New entry fill alerts: a flat-to-open transition / explicit Open Long/Short fill.
      for (const fill of sortedFills) {
        const before = num(fill?.startPosition);
        const after = postPositionFromFill(fill);
        if (Math.abs(before) > 1e-12 && Math.abs(after) > Math.abs(before) && Math.sign(before) === Math.sign(after)) {
          averagingIgnored++;
        }
        if (!isNewPositionFill(fill)) continue;
        const fillTime = num(fill?.time);
        if (!(fillTime >= startTime && fillTime <= now)) continue;
        const coin = String(fill?.coin || '');
        const side = sideFromFill(fill);
        const entry = num(fill?.px);
        const fillNotional = notional(fill);
        if (!coin || !(entry > 0) || fillNotional < MIN_ALERT_NOTIONAL) continue;
        const eventKey = `${address}|fill|${fillKey(fill)}`;
        newEntrySidesThisCycle.add(`${coin}|${side}`);
        if (fillDedupe.has(eventKey)) continue;
        const livePos = findPosition(positions, coin, side);
        const mark = num(mids?.[coin]);
        alerts.push({
          alertType: 'NEW_ENTRY', trader, address, coin, side, entry, current: mark,
          leverage: num(livePos?.leverage), distancePct: mark > 0 ? Math.abs((mark - entry) / entry) * 100 : null,
          notional: fillNotional, fillTime, fillKey: eventKey
        });
        newEntryCount++;
      }

      // Open positions: alert once per position lifecycle when mark is within 1% (configurable).
      for (const position of positions) {
        const { coin, side, entry } = position;
        const lifecycleKey = `${address}|${coin}|${side}`;
        currentKeys.add(lifecycleKey);
        const mark = num(mids?.[coin]);
        if (!(mark > 0 && entry > 0)) continue;
        const distancePct = Math.abs((mark - entry) / entry) * 100;
        if (distancePct >= ENTRY_BAND_PCT) {
          outsideBand++;
          continue;
        }
        inBand++;
        // Avoid sending a second near-entry alert for the same newly opened position in this cycle.
        if (newEntrySidesThisCycle.has(`${coin}|${side}`)) continue;
        if (openDedupe.has(lifecycleKey)) {
          alreadyAlerted++;
          continue;
        }
        if (num(position.positionValue) < MIN_ALERT_NOTIONAL) continue;
        alerts.push({
          alertType: 'OPEN_BAND', trader, address, coin, side, entry, current: mark,
          leverage: num(position.leverage), distancePct, notional: num(position.positionValue),
          fillTime: null, fillKey: lifecycleKey
        });
      }

      // Remove lifecycle dedupe only when a closed position is observed.
      for (const key of [...openDedupe]) {
        if (key.startsWith(`${address}|`) && !currentKeys.has(key)) openDedupe.delete(key);
      }
      state.wallets[address] = {
        trader, address, checkedAt: now, positions, recentFillCount: fills.length
      };
      positionsChecked += positions.length;
      walletsSucceeded++;
    } catch (error) {
      walletErrors++;
      console.error(`[WATCH][ERROR] ${trader} ${short(address)}: ${error?.message || error}`);
    }
  }

  // First-run startup message.
  if (!tgState.initialized) {
    try {
      await sendStartupStatus();
      tgState.initialized = true;
      tgState.lastStartupAt = now;
    } catch (error) {
      console.error(`[TELEGRAM][STARTUP-ERROR] ${error?.message || error}`);
    }
  }

  // Publish independently to the legacy observer chat, NOVARA VIP, and NOVARA Free.
  // A missing/failed legacy destination must never block customer-channel publication.
  for (const alert of alerts) {
    let deliveredAnywhere = false;
    try {
      const legacyResult = await sendTelegram(formatAlert(alert), TG_CHAT);
      if (legacyResult.sent) {
        deliveredAnywhere = true;
      } else {
        console.warn(`[TELEGRAM][LEGACY-SKIPPED] ${alert.coin}: ${legacyResult.reason}`);
      }
    } catch (error) {
      console.error(`[TELEGRAM][LEGACY-ERROR] ${alert.trader} ${alert.coin}: ${error?.message || error}`);
    }

    const novaraKey = `${todayUtc}|${alert.fillKey}`;
    if (!novaraState.sentKeys.includes(novaraKey)) {
      let novaraDelivered = false;
      const deliveredDestinations = [];

      if (NOVARA_VIP_CHAT && novaraState.vipSent < NOVARA_VIP_DAILY_LIMIT && !disabledDestinations.has(NOVARA_VIP_CHAT)) {
        try {
          const vipMessage = formatNovaraAlert(alert, 'VIP');
          const result = await sendTelegram(vipMessage, NOVARA_VIP_CHAT);
          if (result.sent) {
            novaraState.vipSent++;
            novaraDelivered = true;
            deliveredAnywhere = true;
            deliveredDestinations.push(NOVARA_VIP_CHAT);
          } else {
            console.warn(`[NOVARA][VIP-SKIPPED] ${alert.coin}: ${result.reason}`);
          }
        } catch (error) {
          if (String(error?.message || error).includes('HTTP 403') && String(error?.message || error).toLowerCase().includes('not a member')) disabledDestinations.add(NOVARA_VIP_CHAT);
          console.error(`[NOVARA][VIP-ERROR] ${alert.coin}: ${error?.message || error}`);
        }
      } else if (!NOVARA_VIP_CHAT) {
        console.warn('[NOVARA][VIP-SKIPPED] NOVARA_VIP_CHAT_ID is not configured.');
      }

      if (NOVARA_FREE_CHAT && novaraState.freeSent < NOVARA_FREE_DAILY_LIMIT && !disabledDestinations.has(NOVARA_FREE_CHAT)) {
        try {
          const freeMessage = formatNovaraAlert(alert, 'FREE');
          const result = await sendTelegram(freeMessage, NOVARA_FREE_CHAT);
          if (result.sent) {
            novaraState.freeSent++;
            novaraDelivered = true;
            deliveredAnywhere = true;
            deliveredDestinations.push(NOVARA_FREE_CHAT);
          } else {
            console.warn(`[NOVARA][FREE-SKIPPED] ${alert.coin}: ${result.reason}`);
          }
        } catch (error) {
          if (String(error?.message || error).includes('HTTP 403') && String(error?.message || error).toLowerCase().includes('not a member')) disabledDestinations.add(NOVARA_FREE_CHAT);
          console.error(`[NOVARA][FREE-ERROR] ${alert.coin}: ${error?.message || error}`);
        }
      } else if (!NOVARA_FREE_CHAT) {
        console.warn('[NOVARA][FREE-SKIPPED] NOVARA_FREE_CHAT_ID is not configured.');
      }

      // Only mark the NOVARA event published after at least one customer destination confirms it.
      // If both sends fail, leave it eligible for retry on a later scan.
      if (novaraDelivered) {
        novaraState.sentKeys.push(novaraKey);
        novaraState.sentKeys = novaraState.sentKeys.slice(-5000);
        if (!novaraState.openTrades.some(t => t.key === novaraKey) && num(alert.entry) > 0) {
          const levels = modelLevels(alert.entry, alert.side);
          novaraState.openTrades.push({
            key: novaraKey, coin: alert.coin, side: alert.side, trader: alert.trader,
            entry: num(alert.entry), tp: levels.tp, sl: levels.sl,
            leverage: num(alert.leverage), notional: num(alert.notional),
            signalAt: now, status: 'OPEN', destinations: [...new Set(deliveredDestinations)],
            alertType: alert.alertType
          });
        }
      }
      await writeJson(NOVARA_STATE_FILE, novaraState);
    } else {
      // Already published to at least one NOVARA destination earlier today.
      // The observer's legacy alert can still be delivered independently.
      if (TG_CHAT && TG_TOKEN) deliveredAnywhere = true;
    }

    if (!deliveredAnywhere) {
      alertSendErrors++;
      console.error(`[DELIVERY][FAILED] ${alert.trader} ${alert.coin}: no configured destination confirmed delivery; will not persist alert dedupe.`);
      continue;
    }

    // Persist observer dedupe only after at least one Telegram destination confirms delivery.
    if (alert.alertType === 'NEW_ENTRY') {
      fillDedupe.add(alert.fillKey);
      state.alertedNewEntryFillKeys = [...fillDedupe].slice(-12000);
    } else {
      openDedupe.add(alert.fillKey);
      state.alertedOpenPositionKeys = [...openDedupe].slice(-6000);
    }
    alertsSent++;
    await writeJson(STATE_FILE, state);
  }

  // Publish the rolling 24-hour report of ALL VIP-delivered signals to both public and VIP channels.
  // English chunks are sent first, followed by the complete Arabic translation; progress persists across runs.
  try { await deliverDailyReports(novaraState, mids, now); }
  catch (error) { console.error(`[NOVARA][DAILY-REPORT-ERROR] ${error?.message || error}`); }
  await writeJson(NOVARA_STATE_FILE, novaraState);

  state.version = VERSION;
  state.initialized = true;
  state.lastScanAt = now;
  state.lastRuntimeMs = Date.now() - startedAt;
  state.lastAlerts = alerts.map(a => ({
    alertType: a.alertType, trader: a.trader, address: a.address, coin: a.coin, side: a.side,
    entry: a.entry, current: a.current, distancePct: a.distancePct, fillTime: a.fillTime
  }));
  state.alertedOpenPositionKeys = [...openDedupe].slice(-6000);
  state.alertedNewEntryFillKeys = [...fillDedupe].slice(-12000);
  await writeJson(STATE_FILE, state);

  const runtimeSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const cycleMessage = [
    '👁️ GFTSH — 28 WALLET OBSERVER',
    '━━━━━━━━━━━━━━━━━━',
    '📡 Status: WATCHING',
    `👥 Wallets checked successfully: ${walletsSucceeded}/${WALLETS.length}`,
    `⏱ Scan interval: ${SCAN_INTERVAL_MIN} minutes`,
    '',
    `🆕 New-entry signals found: ${newEntryCount}`,
    `🔔 Telegram alerts sent: ${alertsSent}`,
    `🏁 TP/SL outcomes detected: ${outcomesDetected}`,
    `📣 Outcome messages sent: ${outcomesSent}`,
    `⚠️ Outcome delivery errors: ${outcomeErrors}`,
    `🔁 Already alerted in current lifecycle: ${alreadyAlerted}`,
    `⚠️ Alert delivery errors: ${alertSendErrors}`,
    `🎯 Open positions inside ${ENTRY_BAND_PCT.toFixed(2)}% band: ${inBand}`,
    `📊 Open positions checked: ${positionsChecked}`,
    `🔄 Averaging/add fills ignored: ${averagingIgnored}`,
    `📏 Open positions outside ${ENTRY_BAND_PCT.toFixed(2)}% band: ${outsideBand}`,
    `❌ Wallet/API errors: ${walletErrors}`,
    '',
    `🕐 Cycle: ${new Date(now).toISOString()}`,
    `⚙️ Runtime: ${runtimeSec}s`,
    '',
    'Alerts: every detected new entry + open positions within the entry band.',
    '🛡 READ-ONLY | NO ORDERS | NO AUTO-COPY'
  ].join('\n');
  try { await sendTelegram(cycleMessage); }
  catch (error) { console.error(`[TELEGRAM][CYCLE-ERROR] ${error?.message || error}`); }

  tgState.lastCycleAt = now;
  tgState.lastCycleAlerts = alertsSent;
  tgState.lastCycleAlertSendErrors = alertSendErrors;
  tgState.lastCycleErrors = walletErrors;
  await writeJson(TG_STATE_FILE, tgState);

  console.log(`[CYCLE] wallets=${walletsSucceeded}/${WALLETS.length} positions=${positionsChecked} newEntries=${newEntryCount} inBand=${inBand} sent=${alertsSent} alreadyAlerted=${alreadyAlerted} alertErrors=${alertSendErrors} outcomesDetected=${outcomesDetected} outcomesSent=${outcomesSent} outcomeErrors=${outcomeErrors} openPaperTrades=${novaraState.openTrades.length} averagingIgnored=${averagingIgnored} outsideBand=${outsideBand} errors=${walletErrors} runtime=${runtimeSec}s`);
}

main().catch(error => {
  console.error(`[FATAL] ${error?.stack || error}`);
  process.exitCode = 1;
});
