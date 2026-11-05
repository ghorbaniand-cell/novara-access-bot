import fs from 'node:fs/promises';
import path from 'node:path';

// NOVARA SHADOW FORECAST — isolated research runner.
// READ-ONLY: no orders, no Telegram, no signal routing, never opens or edits the production state.
const API = (process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info').trim();
const OUT_DIR = process.env.NOVARA_SHADOW_DIR || 'production/shadow';
const STATE_FILE = path.join(OUT_DIR, 'novara_shadow_state.json');
const INTERVAL_MS = { '15m': 900_000, '1h': 3_600_000 };
const REQUEST_GAP_MS = Math.max(200, Number(process.env.NOVARA_SHADOW_REQUEST_GAP_MS || 300));
const TIMEOUT_MS = Math.max(3000, Number(process.env.NOVARA_SHADOW_TIMEOUT_MS || 12000));
const MAX_RETRIES = Math.max(0, Math.min(4, Number(process.env.NOVARA_SHADOW_RETRIES || 3)));
const DEAD_BAND_PCT = Math.max(0.03, Number(process.env.NOVARA_SHADOW_DEADBAND_PCT || 0.10));
const MAX_LATE_MIN = { 15: 7, 60: 12 };
const MAX_AGE_MIN = Math.max(10, Number(process.env.NOVARA_SHADOW_MAX_FEATURE_AGE_MIN || 45));
const WORKERS = Math.max(1, Math.min(8, Number(process.env.NOVARA_SHADOW_WORKERS || 4)));
const MAX_MARKETS = Math.max(0, Number(process.env.NOVARA_SHADOW_MAX_MARKETS || 0)); // 0 = all active perps
const RETAIN_DAYS = 45;
let nextRequestAt = 0;
let gate = Promise.resolve();
const now = () => Date.now();
const num = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pctChange = (a, b) => a > 0 && b > 0 ? (b / a - 1) * 100 : 0;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

async function pace() {
  const slot = gate.then(async () => {
    const wait = Math.max(0, nextRequestAt - now());
    if (wait) await new Promise(r => setTimeout(r, wait));
    nextRequestAt = now() + REQUEST_GAP_MS;
  });
  gate = slot.catch(() => {});
  await slot;
}
async function info(body, label) {
  let last;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const raw = await res.text();
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = num(res.headers.get('retry-after')) * 1000;
        await new Promise(r => setTimeout(r, Math.max(retryAfter, 1500 * (2 ** attempt))));
        last = new Error(`${label}: HTTP 429`); continue;
      }
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${raw.slice(0, 120)}`);
      return JSON.parse(raw);
    } catch (e) { last = e; if (attempt >= MAX_RETRIES || String(e.message).includes('HTTP 429')) throw e; }
    finally { clearTimeout(timer); }
  }
  throw last || new Error(`${label}: failed`);
}
async function loadState() {
  try {
    const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    if (s?.schema === 1 && Array.isArray(s.forecasts)) return s;
  } catch {}
  return { schema: 1, project: 'NOVARA_SHADOW_FORECAST', createdAt: now(), forecasts: [], cycles: [], errors: { lastCycle: 0 } };
}
async function saveState(state) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await fs.rename(tmp, STATE_FILE);
}
function parseCompleted(raw, interval) {
  const t = now(), ms = INTERVAL_MS[interval];
  return (Array.isArray(raw) ? raw : []).map(c => ({ t: num(c.t), T: num(c.T), o: num(c.o), h: num(c.h), l: num(c.l), c: num(c.c), v: num(c.v), n: num(c.n) }))
    .filter(c => c.t > 0 && c.c > 0 && (c.T ? c.T < t : c.t + ms <= t)).sort((a, b) => a.t - b.t);
}
function ema(xs, period) {
  if (!xs.length) return 0;
  const k = 2 / (period + 1); let out = xs[0];
  for (let i = 1; i < xs.length; i++) out = xs[i] * k + out * (1 - k);
  return out;
}
function emaSpread(xs, fast = 8, slow = 21) {
  const a = ema(xs, fast), b = ema(xs, slow);
  return b > 0 ? (a / b - 1) * 100 : 0;
}
function vwap(rows) {
  const a = rows.slice(-32); let pv = 0, vol = 0;
  for (const c of a) { const typical = (c.h + c.l + c.c) / 3; pv += typical * c.v; vol += c.v; }
  return vol > 0 ? pv / vol : 0;
}
function bookImbalance(book) {
  const bids = (book?.levels?.[0] || []).slice(0, 10).reduce((s, x) => s + num(x.sz) * num(x.px), 0);
  const asks = (book?.levels?.[1] || []).slice(0, 10).reduce((s, x) => s + num(x.sz) * num(x.px), 0);
  return bids + asks > 0 ? (bids - asks) / (bids + asks) : null;
}
function tradeDelta(trades) {
  let buy = 0, sell = 0, newest = 0, oldest = Infinity;
  for (const t of Array.isArray(trades) ? trades : []) {
    const usd = Math.abs(num(t.sz) * num(t.px));
    if (String(t.side).toUpperCase() === 'B') buy += usd;
    else if (String(t.side).toUpperCase() === 'A') sell += usd;
    const ts = num(t.time); if (ts) { newest = Math.max(newest, ts); oldest = Math.min(oldest, ts); }
  }
  const total = buy + sell;
  return { delta: total ? (buy - sell) / total : null, buyUsd: buy, sellUsd: sell, totalUsd: total, oldestTradeAt: Number.isFinite(oldest) ? oldest : null, newestTradeAt: newest || null, count: Array.isArray(trades) ? trades.length : 0 };
}
function scoreForecast({ c15, c1h, mark, flow, imbalance, oiChange, fundingPct }) {
  const a = c15.map(x => x.c), b = c1h.map(x => x.c);
  const last15 = c15.at(-1), last1h = c1h.at(-1);
  const r15 = pctChange(a.at(-2), a.at(-1));
  const r30 = pctChange(a.at(-3), a.at(-1));
  const r60 = pctChange(a.at(-5), a.at(-1));
  const r120 = pctChange(a.at(-9), a.at(-1));
  const r1h = pctChange(b.at(-2), b.at(-1));
  const r4h = pctChange(b.at(-5), b.at(-1));
  const accel = r30 - 2 * r15;
  const trend15 = emaSpread(a.slice(-48), 8, 21);
  const trend1h = emaSpread(b.slice(-48), 8, 21);
  const vwap15 = vwap(c15);
  const vwapGap = mark > 0 && vwap15 > 0 ? (mark / vwap15 - 1) * 100 : 0;
  const body = last15 && last15.h > last15.l ? (last15.c - last15.o) / (last15.h - last15.l) : 0;
  const range = last15 && last15.c > 0 ? (last15.h - last15.l) / last15.c * 100 : 0;
  const z = (x, scale) => clamp(x / scale, -1, 1);
  // Same transparent weighted family as V2.22, but missing features are omitted (not silently treated as zero evidence).
  const parts = {
    momentum15: z(r15, .45) * .08, momentum30: z(r30, .75) * .13,
    momentum60: z(r60, 1.15) * .13, momentum120: z(r120, 1.8) * .08,
    momentum1h: z(r1h, .9) * .10, momentum4h: z(r4h, 1.8) * .08,
    acceleration: z(accel, .45) * .09, trend15: z(trend15, .55) * .08,
    trend1h: z(trend1h, 1.0) * .08,
    vwap: z(vwapGap, .8) * .025, candlePressure: z(body, 1) * .025,
    fundingCrowding: fundingPct > .08 ? -.015 : fundingPct < -.08 ? .015 : 0,
  };
  if (Number.isFinite(flow?.delta)) parts.tradeFlow = z(flow.delta, .35) * .07;
  if (Number.isFinite(imbalance)) parts.orderBook = z(imbalance, .35) * .04;
  if (Number.isFinite(oiChange)) parts.openInterest = z(oiChange, 1.2) * Math.sign(r30 || r15 || 1) * .025;
  let raw = Object.values(parts).reduce((x, y) => x + y, 0);
  const whipsawPenalty = range > 1.8 && Math.abs(r15) < range * .12 ? .035 : 0;
  raw = clamp(raw * (1 - whipsawPenalty), -.35, .35);
  const direction = Math.abs(raw) < .035 ? 'NEUTRAL' : raw > 0 ? 'LONG' : 'SHORT';
  return { direction, rawScore: Number(raw.toFixed(6)), strengthIndex: Math.round(50 + Math.abs(raw) / .35 * 35), featureCount: Object.keys(parts).length, components: parts,
    diagnostics: { r15, r30, r60, r120, r1h, r4h, acceleration: accel, trend15, trend1h, vwapGap, candleBody: body, range, whipsawPenalty } };
}
function baselineDirection(rows, horizon) {
  const closes = rows.map(x => x.c);
  const change = horizon === 15 ? pctChange(closes.at(-2), closes.at(-1)) : pctChange(closes.at(-2), closes.at(-1));
  return Math.abs(change) < DEAD_BAND_PCT / 2 ? 'NEUTRAL' : change > 0 ? 'LONG' : 'SHORT';
}
async function fetchAssetFeatures(asset) {
  const [raw15, raw1h, book, trades] = await Promise.all([
    info({ type: 'candleSnapshot', req: { coin: asset.coin, interval: '15m', startTime: now() - 7 * 86400_000, endTime: now() } }, `${asset.coin} 15m`),
    info({ type: 'candleSnapshot', req: { coin: asset.coin, interval: '1h', startTime: now() - 14 * 86400_000, endTime: now() } }, `${asset.coin} 1h`),
    info({ type: 'l2Book', coin: asset.coin }, `${asset.coin} l2Book`).catch(() => null),
    info({ type: 'recentTrades', coin: asset.coin }, `${asset.coin} recentTrades`).catch(() => []),
  ]);
  const fetchedAt = now();
  const c15 = parseCompleted(raw15, '15m'), c1h = parseCompleted(raw1h, '1h');
  if (c15.length < 60 || c1h.length < 60) return { coin: asset.coin, skipped: 'insufficient_completed_candles', c15: c15.length, c1h: c1h.length, fetchedAt };
  const flow = tradeDelta(trades);
  return { coin: asset.coin, c15, c1h, flow, imbalance: bookImbalance(book), bookAvailable: Boolean(book?.levels?.[0]?.length && book?.levels?.[1]?.length), fetchedAt,
    last15CloseAt: c15.at(-1).T || c15.at(-1).t + INTERVAL_MS['15m'], last1hCloseAt: c1h.at(-1).T || c1h.at(-1).t + INTERVAL_MS['1h'],
    flowTradeAgeMs: flow.newestTradeAt ? Math.max(0, fetchedAt - flow.newestTradeAt) : null };
}
async function pool(items, worker) {
  const out = new Array(items.length); let cursor = 0;
  const runners = Array.from({ length: Math.min(WORKERS, items.length) }, async () => {
    while (true) { const i = cursor++; if (i >= items.length) return; try { out[i] = await worker(items[i]); } catch (e) { out[i] = { coin: items[i].coin, error: String(e?.message || e) }; } }
  });
  await Promise.all(runners); return out;
}
function evaluate(state, mids, observedAt) {
  let resolved = 0, expired = 0;
  for (const f of state.forecasts) {
    const h = f.horizonMinutes; if (f.outcome || f.expired) continue;
    const target = f.forecastAt + h * 60_000, deadline = target + MAX_LATE_MIN[h] * 60_000;
    if (observedAt < target) continue;
    if (observedAt > deadline) { f.expired = { at: observedAt, reason: 'outside_evaluation_window' }; expired++; continue; }
    const px = num(mids[f.coin]); if (!(px > 0) || !(f.referencePrice > 0)) continue;
    const ret = (px / f.referencePrice - 1) * 100;
    const observed = Math.abs(ret) <= DEAD_BAND_PCT ? 'FLAT' : ret > 0 ? 'LONG' : 'SHORT';
    const directionalHit = f.modelDirection !== 'NEUTRAL' && observed !== 'FLAT' && f.modelDirection === observed;
    const baselineHit = f.baselineDirection !== 'NEUTRAL' && observed !== 'FLAT' && f.baselineDirection === observed;
    f.outcome = { observedAt, observedPrice: px, returnPct: Number(ret.toFixed(6)), observed, directionalHit, baselineHit,
      modelClassHit: f.modelDirection === observed, baselineClassHit: f.baselineDirection === observed, elapsedMinutes: Number(((observedAt - f.forecastAt) / 60000).toFixed(2)) };
    resolved++;
  }
  return { resolved, expired };
}
function metrics(state, h) {
  const rows = state.forecasts.filter(f => f.horizonMinutes === h && f.outcome && !f.expired);
  const directional = rows.filter(f => f.modelDirection !== 'NEUTRAL' && f.outcome.observed !== 'FLAT');
  const baseDirectional = rows.filter(f => f.baselineDirection !== 'NEUTRAL' && f.outcome.observed !== 'FLAT');
  const hit = xs => xs.length ? Number((xs.filter(f => f.outcome.directionalHit ?? f.outcome.baselineHit).length / xs.length * 100).toFixed(2)) : null;
  const modelHits = directional.filter(f => f.outcome.directionalHit).length;
  const baselineHits = baseDirectional.filter(f => f.outcome.baselineHit).length;
  const classAcc = key => rows.length ? Number((rows.filter(f => f.outcome[key]).length / rows.length * 100).toFixed(2)) : null;
  const observedCounts = { LONG: 0, SHORT: 0, FLAT: 0 };
  for (const f of rows) observedCounts[f.outcome.observed]++;
  const alwaysLong = rows.length ? Number((rows.filter(f => f.outcome.observed === 'LONG').length / rows.length * 100).toFixed(2)) : null;
  return { n: rows.length, directionalN: directional.length, directionalAccuracyPct: directional.length ? Number((modelHits / directional.length * 100).toFixed(2)) : null,
    baselineDirectionalN: baseDirectional.length, baselineDirectionalAccuracyPct: baseDirectional.length ? Number((baselineHits / baseDirectional.length * 100).toFixed(2)) : null,
    modelThreeClassAccuracyPct: classAcc('modelClassHit'), baselineThreeClassAccuracyPct: classAcc('baselineClassHit'),
    alwaysLongThreeClassAccuracyPct: alwaysLong, observedCounts,
    modelNeutralPct: rows.length ? Number((rows.filter(f => f.modelDirection === 'NEUTRAL').length / rows.length * 100).toFixed(2)) : null,
    expired: state.forecasts.filter(f => f.horizonMinutes === h && f.expired).length };
}
async function main() {
  const started = now();
  const state = await loadState();
  const metaCtx = await info({ type: 'metaAndAssetCtxs' }, 'metaAndAssetCtxs');
  const meta = metaCtx?.[0], contexts = metaCtx?.[1];
  if (!Array.isArray(meta?.universe) || !Array.isArray(contexts)) throw new Error('Unexpected metaAndAssetCtxs schema');
  let assets = meta.universe.map((u, i) => ({ coin: String(u.name || ''), mark: num(contexts[i]?.markPx || contexts[i]?.midPx), dayVolume: num(contexts[i]?.dayNtlVlm), fundingPct: num(contexts[i]?.funding) * 100, oi: num(contexts[i]?.openInterest), delisted: Boolean(u.isDelisted) }))
    .filter(x => x.coin && x.mark > 0 && !x.delisted).sort((a, b) => b.dayVolume - a.dayVolume);
  const universeCount = assets.length;
  if (MAX_MARKETS > 0) assets = assets.slice(0, MAX_MARKETS);
  console.log(`[SHADOW] START activePerps=${universeCount} scanned=${assets.length} maxMarkets=${MAX_MARKETS || 'ALL'} workers=${WORKERS} requestGap=${REQUEST_GAP_MS}ms`);
  const featureRows = await pool(assets, fetchAssetFeatures);
  const mids = await info({ type: 'allMids' }, 'allMids');
  const observedAt = now();
  const evalResult = evaluate(state, mids || {}, observedAt);
  state.lastMarketContext ||= {};
  const previous = state.lastMarketContext;
  let created15 = 0, created60 = 0, skipped = 0, failed = 0, stale = 0;
  const addForecast = (row, asset, mark, horizon, direction, baseline, prediction) => {
    state.forecasts.push({ id: `${row.coin}|${horizon}|${observedAt}`, coin: row.coin, horizonMinutes: horizon, forecastAt: observedAt, referencePrice: mark,
      priceSource: 'allMids_after_feature_collection', featureFetchedAt: row.fetchedAt, featureAgeMs: observedAt - row.fetchedAt,
      lastCompleted15mCloseAt: row.last15CloseAt, lastCompleted1hCloseAt: row.last1hCloseAt,
      orderBookAvailable: row.bookAvailable, orderBookSnapshotImbalance: row.imbalance, recentTrades: row.flow,
      modelDirection: direction, modelRawScore: prediction.rawScore, modelStrengthIndex: prediction.strengthIndex,
      baselineDirection: baseline, components: prediction.components, diagnostics: prediction.diagnostics,
      fundingPct: asset.fundingPct, dayVolumeUsd: asset.dayVolume, openInterest: asset.oi,
      dataQuality: { completed15mBars: row.c15.length, completed1hBars: row.c1h.length, featuresAgeWithinLimit: observedAt - row.fetchedAt <= MAX_AGE_MIN * 60_000,
        orderBookSnapshotOnly: true, recentTradesWindowIsExchangeResponse: true } });
    if (horizon === 15) created15++; else created60++;
  };
  for (const row of featureRows) {
    if (row.error) { failed++; continue; }
    if (row.skipped) { skipped++; continue; }
    const asset = assets.find(a => a.coin === row.coin); const mark = num(mids?.[row.coin]);
    if (!(mark > 0)) { skipped++; continue; }
    const age = observedAt - row.fetchedAt;
    if (age > MAX_AGE_MIN * 60_000) { stale++; continue; }
    const prev = previous[row.coin];
    const oiChange = prev?.oi > 0 ? (asset.oi / prev.oi - 1) * 100 : null;
    const prediction = scoreForecast({ c15: row.c15, c1h: row.c1h, mark, flow: row.flow, imbalance: row.imbalance, oiChange, fundingPct: asset.fundingPct });
    const alignedQuarter = Math.floor(observedAt / (15 * 60_000));
    const alignedHour = Math.floor(observedAt / (60 * 60_000));
    const last15 = row.c15.at(-1), last1h = row.c1h.at(-1);
    const base15 = baselineDirection([row.c15.at(-2), last15], 15);
    const base60 = baselineDirection([row.c1h.at(-2), last1h], 60);
    // A 15m forecast is issued once per 15m bucket; 60m only once per clock-hour to avoid overlapping hourly targets.
    if (state.lastForecastBucket15 !== alignedQuarter) addForecast(row, asset, mark, 15, prediction.direction, base15, prediction);
    if (state.lastForecastBucket60 !== alignedHour) addForecast(row, asset, mark, 60, prediction.direction, base60, prediction);
    state.lastMarketContext[row.coin] = { oi: asset.oi, at: observedAt };
  }
  state.lastForecastBucket15 = Math.floor(observedAt / (15 * 60_000));
  state.lastForecastBucket60 = Math.floor(observedAt / (60 * 60_000));
  const cutoff = observedAt - RETAIN_DAYS * 86400_000;
  state.forecasts = state.forecasts.filter(f => f.forecastAt >= cutoff).slice(-200000);
  state.cycles.push({ at: observedAt, universeCount, scanned: assets.length, featureSuccess: featureRows.filter(x => !x.error && !x.skipped).length,
    failed, skipped, stale, created15, created60, evaluated: evalResult, durationMs: now() - started });
  state.cycles = state.cycles.slice(-5000);
  const m15 = metrics(state, 15), m60 = metrics(state, 60);
  state.lastRunAt = observedAt;
  await saveState(state);
  await fs.writeFile(path.join(OUT_DIR, 'scorecard.json'), JSON.stringify({ at: observedAt, universeCount, scanned: assets.length, featureSuccess: featureRows.filter(x => !x.error && !x.skipped).length, failed, skipped, stale, created15, created60, evaluated: evalResult, horizons: { 15: m15, 60: m60 } }, null, 2) + '\n');
  console.log(`[SHADOW][CYCLE] featureOK=${featureRows.filter(x => !x.error && !x.skipped).length}/${assets.length} failed=${failed} skipped=${skipped} stale=${stale} new15m=${created15} new60m=${created60} evaluated=${evalResult.resolved} expired=${evalResult.expired} runtime=${((now() - started) / 1000).toFixed(1)}s`);
  console.log(`[SHADOW][SCORECARD] 15m ${JSON.stringify(m15)}`);
  console.log(`[SHADOW][SCORECARD] 60m ${JSON.stringify(m60)}`);
  console.log(`[SHADOW][SAFETY] noOrders=true noTelegram=true productionStateTouched=false deadband=±${DEAD_BAND_PCT}% featureAgeMax=${MAX_AGE_MIN}m`);
}
main().catch(e => { console.error(`[SHADOW][FATAL] ${e?.stack || e}`); process.exitCode = 1; });
