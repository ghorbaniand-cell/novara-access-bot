import fs from 'node:fs/promises';
import path from 'node:path';

const VERSION = 'NOVARA-MEME-HUNTER-V2.0.2-EVENT-FIRST-FORMATTED-VALUES';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const STATE_FILE = path.join(ROOT, process.env.NOVARA_STATE_FILE || 'data/meme_hunter_state.json');
const CFG = {
  telegramToken: process.env.TELEGRAM_TOKEN || '',
  chatId: process.env.NOVARA_CHAT_ID || '',
  rpc: (process.env.SOLANA_RPC_URL || '').trim() || 'https://api.mainnet-beta.solana.com',
  pumpKey: (process.env.PUMPPORTAL_API_KEY || '').trim(),
  listenMs: Math.min(255000, Math.max(10000, Number(process.env.HUNTER_LISTEN_MS || 250000))),
  scanLimit: Math.max(10, Math.min(500, Number(process.env.HUNTER_SCAN_LIMIT || 100))),
  maxProfiles: Math.max(10, Math.min(500, Number(process.env.HUNTER_PROFILE_LIMIT || 100))),
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const esc = v => String(v ?? '—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const short = v => v ? `${String(v).slice(0,6)}…${String(v).slice(-5)}` : '—';
function formatEventTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'نامشخص';
  const fmt = (timeZone) => new Intl.DateTimeFormat('en-GB', {
    timeZone, day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).format(date);
  return `${fmt('Europe/Berlin')} (Europe/Berlin) | ${fmt('UTC')} UTC`;
}
function formatVirtualSol(value) {
  const n = num(value);
  if (n === null) return 'نامشخص';
  // Pump launch feeds report vSolInBondingCurve in lamports (1 SOL = 1e9 lamports).
  const sol = n / 1e9;
  return `${sol.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:4})} SOL`;
}

async function loadState() {
  try { const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); return { seen: s.seen || {}, events: s.events || {}, stats: s.stats || {}, lastRun: s.lastRun || null }; }
  catch { return { seen: {}, events: {}, stats: {}, lastRun: null }; }
}
async function saveState(s) { await fs.mkdir(path.dirname(STATE_FILE), {recursive:true}); await fs.writeFile(STATE_FILE, JSON.stringify(s,null,2)+'\n'); }
async function fetchJson(url, options={}, timeout=12000) {
  const c = new AbortController(); const t = setTimeout(()=>c.abort(),timeout);
  try { const r = await fetch(url,{...options,signal:c.signal,headers:{accept:'application/json',...(options.headers||{})}}); if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return await r.json(); }
  finally { clearTimeout(t); }
}
async function telegram(text) {
  if (!CFG.telegramToken || !CFG.chatId) { console.warn('[TELEGRAM_DISABLED] TELEGRAM_TOKEN or NOVARA_CHAT_ID missing'); return false; }
  const j = await fetchJson(`https://api.telegram.org/bot${CFG.telegramToken}/sendMessage`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:CFG.chatId,text,parse_mode:'HTML',disable_web_page_preview:true})});
  if(!j.ok) throw new Error(j.description || 'Telegram send failed'); return true;
}
function buildBirth(e) {
  return [
    '🟠 <b>NOVARA — TOKEN BIRTH DETECTED</b>', '━━━━━━━━━━━━━━━━━━',
    `<b>${esc(e.name)} ($${esc(e.symbol)})</b>`,
    '<b>وضعیت:</b> رویداد ایجاد توکن از فید لانچ دریافت شد؛ هنوز عرضه/استخر DEX تأیید نشده است.',
    `<b>شبکه:</b> Solana`, `<b>Mint:</b> <code>${esc(e.mint)}</code>`,
    `<b>سازنده:</b> <code>${esc(e.creator)}</code>`,
    `<b>زمان دریافت رویداد:</b> ${formatEventTime(e.eventAt)}`,
    `<b>Virtual SOL (گزارش فید):</b> ${formatVirtualSol(e.virtualSol)}`,
    `<b>Market cap SOL (گزارش فید):</b> ${e.marketCapSol == null ? 'نامشخص' : `${num(e.marketCapSol).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:4})} SOL`}`,
    `<b>منبع:</b> ${esc(e.source)}`,
    e.signature ? `<b>Signature:</b> <code>${esc(e.signature)}</code>` : '',
    '', 'ℹ️ این هشدار به تعداد خریداران، حجم معاملات، نقدینگی یا امتیاز وابسته نیست. اطلاعات امنیتی و امکان فروش هنوز بررسی نشده‌اند.',
    'فقط پایش و اطلاع‌رسانی؛ بدون خرید، امضا یا سفارش.'
  ].filter(Boolean).join('\n');
}
function buildPool(p, eventType='NEW_DEX_POOL') {
  const age = p.poolCreatedAt ? `${Math.max(0,(Date.now()-p.poolCreatedAt)/60000).toFixed(1)} دقیقه (زمان اعلام‌شده توسط indexer)` : 'نامشخص';
  return [
    eventType==='MIGRATION_CONFIRMED' ? '🟣 <b>NOVARA — DEX MIGRATION CONFIRMED</b>' : '🟢 <b>NOVARA — NEW DEX POOL DETECTED</b>',
    '━━━━━━━━━━━━━━━━━━', `<b>${esc(p.name)} ($${esc(p.symbol)})</b>`,
    `<b>شبکه:</b> Solana`, `<b>Mint:</b> <code>${esc(p.mint)}</code>`,
    `<b>DEX:</b> ${esc(p.dex || 'نامشخص')}`, `<b>Pool:</b> <code>${esc(p.pool || 'نامشخص')}</code>`,
    `<b>سن Pool:</b> ${age}`, `<b>نقدینگی فعلی:</b> ${p.liquidityUsd==null?'نامشخص':`$${p.liquidityUsd.toLocaleString('en-US',{maximumFractionDigits:0})}`}`,
    `<b>قیمت:</b> ${p.priceUsd==null?'نامشخص':`$${p.priceUsd}`}`,
    `<b>حجم ۲۴ساعت:</b> ${p.volume24h==null?'نامشخص':`$${p.volume24h.toLocaleString('en-US',{maximumFractionDigits:0})}`}`,
    `<b>منبع:</b> ${esc(p.source)}`, p.url ? `🔎 <a href="${esc(p.url)}">مشاهده استخر</a>` : '',
    '', 'ℹ️ هشدار تشکیل استخر است؛ برای ارسال آن حداقل نقدینگی، تعداد خریدار، حجم ۱۵دقیقه‌ای، سن Mint یا امتیاز لازم نیست. اطلاعات امنیتی/فروش‌پذیری جداگانه بررسی می‌شوند.',
    'فقط پایش و اطلاع‌رسانی؛ بدون خرید، امضا یا سفارش.'
  ].filter(Boolean).join('\n');
}
async function collectLaunchEvents() {
  const provider = CFG.pumpKey ? 'PUMPPORTAL' : 'PUMPDEV_FREE';
  const endpoint = CFG.pumpKey ? `wss://pumpportal.fun/api/data?api-key=${encodeURIComponent(CFG.pumpKey)}` : 'wss://pumpdev.io/ws';
  if(typeof WebSocket === 'undefined') return {events:[],status:'WEBSOCKET_UNAVAILABLE',provider};
  return new Promise(resolve => {
    const events=[]; let done=false, ws, timer;
    const finish = status => { if(done)return; done=true; clearTimeout(timer); try{ws?.close();}catch{} resolve({events,status,provider}); };
    try {
      ws = new WebSocket(endpoint);
      timer = setTimeout(()=>finish('LISTEN_WINDOW_COMPLETE'), CFG.listenMs);
      ws.addEventListener('open',()=>{
        ws.send(JSON.stringify({method:'subscribeNewToken'}));
        if(CFG.pumpKey) ws.send(JSON.stringify({method:'subscribeMigration'}));
        console.log(`[LAUNCH_FEED_OPEN] provider=${provider} listen=${CFG.listenMs}ms`);
      });
      ws.addEventListener('message',ev=>{
        try {
          const d=JSON.parse(String(ev.data||''));
          const mint=String(d.mint||d.tokenAddress||d.token_address||'').trim(); if(!mint)return;
          const typ=String(d.txType||d.type||'').toLowerCase();
          const migration=typ.includes('migrat')||Boolean(d.pool||d.poolAddress||d.pool_address);
          events.push({kind:migration?'MIGRATION_EVENT':'TOKEN_BIRTH',mint,name:String(d.name||'Unknown').slice(0,80),symbol:String(d.symbol||'UNKNOWN').slice(0,24),creator:d.traderPublicKey||d.creator||d.user||null,uri:d.uri||null,virtualSol:num(d.vSolInBondingCurve),marketCapSol:num(d.marketCapSol),signature:d.signature||null,source:provider,eventAt:Date.now(),reportedPool:d.pool||d.poolAddress||d.pool_address||null});
        } catch {}
      });
      ws.addEventListener('error',()=>finish('SOCKET_ERROR'));
      ws.addEventListener('close',()=>finish('SOCKET_CLOSED'));
    } catch(e) { finish(`CONNECT_ERROR:${e.message}`); }
  });
}
async function discoverPools() {
  const out=[], errors=[];
  try {
    const j=await fetchJson('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token,quote_token&page=1',{headers:{accept:'application/json;version=20230302'}});
    const included=new Map((j.included||[]).map(x=>[x.id,x.attributes||{}]));
    for(const row of j.data||[]) {
      const a=row.attributes||{}, rel=row.relationships||{};
      const b=included.get(rel.base_token?.data?.id)||{}, q=included.get(rel.quote_token?.data?.id)||{};
      const quoteSet=new Set(['SOL','WSOL','USDC','USDT','WETH','ETH','WBTC']);
      const baseQuote=quoteSet.has(String(b.symbol||'').toUpperCase()); const target=baseQuote&&q.address?q:b; const quote=target===b?q:b;
      const mint=String(target.address||target.token_address||'').trim(); if(!mint)continue;
      out.push({kind:'DEX_POOL',mint,name:target.name||'Unknown',symbol:target.symbol||'UNKNOWN',pool:a.address||row.id?.split('_').slice(1).join('_')||null,dex:a.dex_id||'GeckoTerminal',poolCreatedAt:a.pool_created_at?Date.parse(a.pool_created_at):null,liquidityUsd:num(a.reserve_in_usd),priceUsd:num(a.base_token_price_usd),volume24h:num(a.volume_usd?.h24),source:'GECKOTERMINAL_NEW_POOLS',url:`https://www.geckoterminal.com/solana/pools/${a.address||''}`});
    }
  } catch(e) { errors.push(`GeckoTerminal: ${e.message}`); }
  try {
    const profiles=await fetchJson('https://api.dexscreener.com/token-profiles/latest/v1');
    for(const p of (Array.isArray(profiles)?profiles:[]).slice(0,CFG.maxProfiles)) if(String(p.chainId||'').toLowerCase()==='solana'&&p.tokenAddress) out.push({kind:'TOKEN_PROFILE',mint:p.tokenAddress,name:String(p.description||'New token profile').slice(0,80),symbol:'UNKNOWN',source:'DEXSCREENER_LATEST_PROFILE',url:p.url||''});
  } catch(e) { errors.push(`DexScreener profiles: ${e.message}`); }
  return {items:out,errors};
}
async function lookupPool(mint) {
  try {
    const pairs=await fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`);
    const rows=(Array.isArray(pairs)?pairs:[]).filter(p=>String(p.chainId).toLowerCase()==='solana').sort((a,b)=>(num(b.liquidity?.usd)||0)-(num(a.liquidity?.usd)||0));
    const p=rows[0]; if(!p)return null;
    const isBase=String(p.baseToken?.address||'').toLowerCase()===mint.toLowerCase(); const token=isBase?p.baseToken:p.quoteToken;
    return {kind:'DEX_POOL',mint,name:token?.name||'Unknown',symbol:token?.symbol||'UNKNOWN',pool:p.pairAddress||null,dex:p.dexId||'Unknown',poolCreatedAt:num(p.pairCreatedAt),liquidityUsd:num(p.liquidity?.usd),priceUsd:num(p.priceUsd),volume24h:num(p.volume?.h24),source:'DEXSCREENER_TOKEN_PAIRS',url:p.url||''};
  } catch(e) { console.warn(`[PAIR_LOOKUP_ERROR] mint=${short(mint)} ${e.message}`); return null; }
}
async function processEvent(e,state,stats) {
  const prior=state.events[e.mint]||{};
  if(e.kind==='TOKEN_BIRTH') {
    state.events[e.mint]={...prior,mint:e.mint,name:e.name,symbol:e.symbol,creator:e.creator,firstEventAt:prior.firstEventAt||e.eventAt,source:e.source,launchEvent:e};
    if(!prior.birthAlertedAt) {
      const sent=await telegram(buildBirth(e));
      if(sent){state.events[e.mint].birthAlertedAt=Date.now();stats.birthAlerts++;}
      console.log(`[TOKEN_BIRTH] mint=${short(e.mint)} sent=${sent} provider=${e.source}`);
    }
  } else if(e.kind==='MIGRATION_EVENT') {
    state.events[e.mint]={...prior,mint:e.mint,name:e.name,symbol:e.symbol,migrationSeenAt:prior.migrationSeenAt||Date.now(),reportedPool:e.reportedPool||null,source:e.source};
    console.log(`[MIGRATION_EVENT] mint=${short(e.mint)} pool=${e.reportedPool||'not-provided'} — awaiting independent DEX pool verification`);
  }
}
async function main() {
  const started=Date.now(),state=await loadState();
  const stats={birthAlerts:0,poolAlerts:0,profilesSeen:0,poolsSeen:0,errors:0};
  console.log(`${VERSION} START | READ-ONLY / NO ORDERS / NO AUTO-BUY`);
  console.log(`[CONFIG] listen=${CFG.listenMs}ms scanLimit=${CFG.scanLimit} source=${CFG.pumpKey?'PumpPortal':'PumpDev public feed'}`);
  const feed=await collectLaunchEvents(); console.log(`[LAUNCH_FEED_END] provider=${feed.provider} status=${feed.status} events=${feed.events.length}`);
  for(const e of feed.events) { try{await processEvent(e,state,stats);}catch(err){stats.errors++;console.error(`[EVENT_ERROR] ${err.message}`);} }
  const discovered=await discoverPools(); stats.errors+=discovered.errors.length;
  const candidates=new Map();
  for(const x of discovered.items) { if(x.kind==='DEX_POOL') candidates.set(x.mint,{...candidates.get(x.mint),...x}); else {stats.profilesSeen++; const prior=candidates.get(x.mint)||{}; candidates.set(x.mint,{...prior,...x});} }
  // Retry undelivered birth alerts and recheck recent birth/migration candidates.
  for(const [mint,ev] of Object.entries(state.events)) {
    if(!ev.birthAlertedAt && ev.launchEvent && Date.now()-Number(ev.firstEventAt||0)<60*60*1000) {
      try { const sent=await telegram(buildBirth(ev.launchEvent)); if(sent){ev.birthAlertedAt=Date.now();stats.birthAlerts++;} }
      catch(err) { stats.errors++; console.error(`[BIRTH_RETRY_ERROR] ${short(mint)} ${err.message}`); }
    }
    if(!ev.poolAlertedAt && Date.now()-Number(ev.firstEventAt||ev.migrationSeenAt||0)<60*60*1000 && !candidates.has(mint)) candidates.set(mint,{kind:'PENDING_LAUNCH',mint,name:ev.name||'Unknown',symbol:ev.symbol||'UNKNOWN',source:'PERSISTED_LAUNCH_LEDGER'});
  }
  let scanned=0;
  for(const item of [...candidates.values()].slice(0,CFG.scanLimit)) {
    scanned++; const prior=state.events[item.mint]||{};
    try {
      let pool=item.kind==='DEX_POOL'?item:await lookupPool(item.mint);
      if(!pool?.pool) { console.log(`[CANDIDATE_PENDING] ${item.symbol||'UNKNOWN'} mint=${short(item.mint)} pool=NOT_VERIFIED source=${item.source}`); continue; }
      stats.poolsSeen++;
      const migrationConfirmed=Boolean(prior.migrationSeenAt||item.kind==='PENDING_LAUNCH');
      if(!prior.poolAlertedAt) {
        const sent=await telegram(buildPool(pool,migrationConfirmed?'MIGRATION_CONFIRMED':'NEW_DEX_POOL'));
        if(sent){state.events[item.mint]={...prior,mint:item.mint,name:pool.name,symbol:pool.symbol,pool:pool.pool,poolAlertedAt:Date.now(),poolSource:pool.source,poolCreatedAt:pool.poolCreatedAt||null};stats.poolAlerts++;}
        console.log(`[DEX_POOL_ALERT] mint=${short(item.mint)} pool=${short(pool.pool)} sent=${sent} liquidity=${pool.liquidityUsd??'UNKNOWN'} source=${pool.source}`);
      }
    } catch(e) {stats.errors++;console.error(`[POOL_CANDIDATE_ERROR] ${short(item.mint)} ${e.message}`);}
    await sleep(120);
  }
  state.stats.runs=Number(state.stats.runs||0)+1; state.stats.birthAlerts=Number(state.stats.birthAlerts||0)+stats.birthAlerts; state.stats.poolAlerts=Number(state.stats.poolAlerts||0)+stats.poolAlerts; state.lastRun=new Date().toISOString();
  // Keep the event ledger bounded while retaining recent launch/pool lifecycle state.
  const cutoff=Date.now()-7*24*60*60*1000;
  for(const [mint,v] of Object.entries(state.events)) if(Number(v.poolAlertedAt||v.birthAlertedAt||v.migrationSeenAt||v.firstEventAt||0)<cutoff) delete state.events[mint];
  await saveState(state);
  console.log(`${VERSION} END | feedEvents=${feed.events.length} profiles=${stats.profilesSeen} poolCandidates=${discovered.items.filter(x=>x.kind==='DEX_POOL').length} scanned=${scanned} birthAlerts=${stats.birthAlerts} poolAlerts=${stats.poolAlerts} errors=${stats.errors} elapsed=${Math.round((Date.now()-started)/1000)}s`);
  for(const e of discovered.errors) console.log(`[DISCOVERY_WARNING] ${e}`);
}
if(process.env.HUNTER_SELF_TEST==='1') {
  const assert=(await import('node:assert/strict')).default;
  assert.equal(num(null),0); assert.equal(num('12.5'),12.5); assert.equal(num('bad'),null);
  const birth=buildBirth({name:'Test',symbol:'TST',mint:'mint',eventAt:Date.now(),source:'TEST'});
  assert.ok(birth.includes('TOKEN BIRTH DETECTED'));
  assert.ok(birth.includes('Europe/Berlin'));
  assert.equal(formatVirtualSol(30000000000), '30.00 SOL');
  assert.ok(birth.includes('تعداد خریداران'));
  const pool=buildPool({name:'Test',symbol:'TST',mint:'mint',pool:'pool',source:'TEST',liquidityUsd:0});
  assert.ok(pool.includes('NEW DEX POOL DETECTED'));
  assert.ok(pool.includes('حداقل نقدینگی'));
  assert.ok(!pool.includes('شرط لازم'));
  console.log('SELF_TEST_OK');
} else main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
