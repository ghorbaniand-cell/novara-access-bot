import fs from 'node:fs/promises';
import path from 'node:path';

const VERSION = 'NOVARA-MEME-HUNTER-V2.1.0-REPUTATION-GROWTH-FILTER';
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
  minDevScore: Math.max(15, Math.min(35, Number(process.env.HUNTER_MIN_DEV_SCORE || 22))),
  minPoolScore: Math.max(50, Math.min(100, Number(process.env.HUNTER_MIN_POOL_SCORE || 70))),
  maxDevChecksPerRun: Math.max(1, Math.min(20, Number(process.env.HUNTER_MAX_DEV_CHECKS_PER_RUN || 15))),
  maxDevChecksPerDay: Math.max(30, Math.min(250, Number(process.env.HUNTER_MAX_DEV_CHECKS_PER_DAY || 200))),
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
  try { const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); return { seen: s.seen || {}, events: s.events || {}, stats: s.stats || {}, devCache: s.devCache || {}, devApi: s.devApi || {}, lastRun: s.lastRun || null }; }
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
function buildBirth(e, dev) {
  return [
    '🟠 <b>NOVARA — TOKEN BIRTH DETECTED</b>', '━━━━━━━━━━━━━━━━━━',
    `<b>${esc(e.name)} ($${esc(e.symbol)})</b>`,
    '<b>وضعیت:</b> رویداد ایجاد توکن از فید لانچ دریافت شد؛ هنوز عرضه/استخر DEX تأیید نشده است.',
    `<b>شبکه:</b> Solana`, `<b>Mint:</b> <code>${esc(e.mint)}</code>`,
    `<b>سازنده:</b> <code>${esc(e.creator)}</code>`,
    `<b>زمان دریافت رویداد:</b> ${formatEventTime(e.eventAt)}`,
    `<b>Virtual SOL (گزارش فید):</b> ${formatVirtualSol(e.virtualSol)}`,
    `<b>Market cap SOL (گزارش فید):</b> ${e.marketCapSol == null ? 'نامشخص' : `${num(e.marketCapSol).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:4})} SOL`}`,
    `<b>اعتبار سازنده:</b> ${dev.score}/35 | لانچ قبلی: ${dev.launches} | نرخ Graduation: ${dev.graduationRate == null ? 'نامشخص' : `${(dev.graduationRate*100).toFixed(1)}%`}`,
    `<b>منبع ارزیابی سازنده:</b> pumpdata.fun | داده تاریخی؛ تضمین‌کننده رشد نیست`,
    `<b>منبع:</b> ${esc(e.source)}`,
    e.signature ? `<b>Signature:</b> <code>${esc(e.signature)}</code>` : '',
    '', 'ℹ️ این پیام فقط پس از عبور سابقه سازنده از فیلتر اولیه ارسال شده است؛ تقاضا، امنیت و امکان فروش هنوز تأیید نشده‌اند.',
    'فقط پایش و اطلاع‌رسانی؛ بدون خرید، امضا یا سفارش.'
  ].filter(Boolean).join('\n');
}
function buildPool(p, eventType='NEW_DEX_POOL', quality={}) {
  const age = p.poolCreatedAt ? `${Math.max(0,(Date.now()-p.poolCreatedAt)/60000).toFixed(1)} دقیقه (زمان اعلام‌شده توسط indexer)` : 'نامشخص';
  return [
    eventType==='MIGRATION_CONFIRMED' ? '🟣 <b>NOVARA — DEX MIGRATION CONFIRMED</b>' : '🟢 <b>NOVARA — NEW DEX POOL DETECTED</b>',
    '━━━━━━━━━━━━━━━━━━', `<b>${esc(p.name)} ($${esc(p.symbol)})</b>`,
    `<b>شبکه:</b> Solana`, `<b>Mint:</b> <code>${esc(p.mint)}</code>`,
    `<b>DEX:</b> ${esc(p.dex || 'نامشخص')}`, `<b>Pool:</b> <code>${esc(p.pool || 'نامشخص')}</code>`,
    `<b>سن Pool:</b> ${age}`, `<b>نقدینگی فعلی:</b> ${p.liquidityUsd==null?'نامشخص':`$${p.liquidityUsd.toLocaleString('en-US',{maximumFractionDigits:0})}`}`,
    `<b>قیمت:</b> ${p.priceUsd==null?'نامشخص':`$${p.priceUsd}`}`,
    `<b>حجم ۲۴ساعت:</b> ${p.volume24h==null?'نامشخص':`$${p.volume24h.toLocaleString('en-US',{maximumFractionDigits:0})}`}`,
    `<b>امتیاز کیفیت:</b> ${quality.score ?? '—'}/100 | سابقه سازنده: ${quality.devScore ?? '—'}/35`,
    `<b>خریداران/فروشندگان ۲۴ساعت:</b> ${p.buys24h ?? 'نامشخص'} / ${p.sells24h ?? 'نامشخص'}`,
    `<b>منبع:</b> ${esc(p.source)}`, p.url ? `🔎 <a href="${esc(p.url)}">مشاهده استخر</a>` : '',
    '', 'ℹ️ این استخر از فیلتر کیفیت اولیه عبور کرده؛ امتیاز، پیش‌بینی قطعی رشد یا تضمین فروش‌پذیری نیست. بررسی امنیتی مستقل همچنان لازم است.',
    'فقط پایش و اطلاع‌رسانی؛ بدون خرید، امضا یا سفارش.'
  ].filter(Boolean).join('\n');
}
function scoreDeveloper(data) {
  const r=data?.record||{}, w=data?.last_90_days||{};
  const launches=Number(r.launches ?? 0), grads=Number(r.graduations ?? 0);
  const measured=Number(w.launches_measured ?? 0);
  if (!Number.isFinite(launches) || launches < 1 || !Number.isFinite(grads)) return {verified:false,score:0,launches,graduationRate:null,reason:'NO_VERIFIABLE_HISTORY'};
  const rate=Number.isFinite(Number(r.graduation_rate)) ? Number(r.graduation_rate) : (launches ? grads/launches : 0);
  const doubled=Number(w.doubled ?? 0), tenX=Number(w.ten_x ?? 0), held=Number(w.held_2x ?? 0), dead=Number(w.dead_next_day ?? 0);
  const denom=Math.max(1,measured);
  const performance=(Math.min(1,rate/0.35)*15) + (Math.min(1,(doubled+tenX)/denom/0.35)*8) + (Math.min(1,held/denom/0.12)*7);
  const sample=Math.min(1,Math.log1p(measured)/Math.log1p(30))*5;
  const deadPenalty=Math.min(10,(dead/denom)*12);
  const score=Math.max(0,Math.min(35,Math.round(performance+sample-deadPenalty)));
  return {verified:true,score,launches,graduations:grads,graduationRate:rate,measured,doubled,tenX,held,dead,asOf:data?.as_of||data?.data_as_of||null,reason:'HISTORICAL_DEPLOYER_RECORD'};
}
async function getDeveloperRecord(address,state,stats) {
  if(!address) return {verified:false,score:0,reason:'CREATOR_MISSING'};
  const now=Date.now(), cached=state.devCache?.[address];
  if(cached && now-Number(cached.checkedAt||0)<7*24*60*60*1000) return cached.result;
  const day=new Date().toISOString().slice(0,10);
  state.devApi ||= {day,calls:0};
  if(state.devApi.day!==day) state.devApi={day,calls:0};
  if(Number(state.devApi.calls||0)>=CFG.maxDevChecksPerDay || Number(stats.devChecks||0)>=CFG.maxDevChecksPerRun) return {verified:false,score:0,reason:'DAILY_OR_RUN_BUDGET'};
  try {
    state.devApi.calls=Number(state.devApi.calls||0)+1; stats.devChecks=(stats.devChecks||0)+1;
    const data=await fetchJson(`https://pumpdata.fun/free/deployer/${encodeURIComponent(address)}`,{},10000);
    const result=scoreDeveloper(data);
    state.devCache ||= {}; state.devCache[address]={checkedAt:now,result};
    console.log(`[DEV_REPUTATION] creator=${short(address)} score=${result.score}/35 launches=${result.launches??'unknown'} graduationRate=${result.graduationRate??'unknown'} result=${result.reason}`);
    return result;
  } catch(e) {
    console.warn(`[DEV_REPUTATION_UNAVAILABLE] creator=${short(address)} ${e.message}`);
    return {verified:false,score:0,reason:'API_UNAVAILABLE'};
  }
}
function scorePoolQuality(pool,devScore) {
  const liq=Number(pool.liquidityUsd||0), vol=Number(pool.volume24h||0);
  const buys=Number(pool.buys24h||0), sells=Number(pool.sells24h||0), tx=buys+sells;
  const liqScore=liq>=20000?25:liq>=10000?22:liq>=5000?18:liq>=2500?12:0;
  const volScore=vol>=50000?20:vol>=20000?17:vol>=10000?14:vol>=5000?9:0;
  const activityScore=tx>=200&&buys>sells?20:tx>=80&&buys>sells?16:tx>=30&&buys>=sells?11:0;
  const score=Math.min(100,Math.max(0,Math.round(devScore+liqScore+volScore+activityScore)));
  return {score,devScore,liqScore,volScore,activityScore,buys,sells};
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
    return {kind:'DEX_POOL',mint,name:token?.name||'Unknown',symbol:token?.symbol||'UNKNOWN',pool:p.pairAddress||null,dex:p.dexId||'Unknown',poolCreatedAt:num(p.pairCreatedAt),liquidityUsd:num(p.liquidity?.usd),priceUsd:num(p.priceUsd),volume24h:num(p.volume?.h24),buys24h:num(p.txns?.h24?.buys),sells24h:num(p.txns?.h24?.sells),source:'DEXSCREENER_TOKEN_PAIRS',url:p.url||''};
  } catch(e) { console.warn(`[PAIR_LOOKUP_ERROR] mint=${short(mint)} ${e.message}`); return null; }
}
async function processEvent(e,state,stats) {
  const prior=state.events[e.mint]||{};
  if(e.kind==='TOKEN_BIRTH') {
    state.events[e.mint]={...prior,mint:e.mint,name:e.name,symbol:e.symbol,creator:e.creator,firstEventAt:prior.firstEventAt||e.eventAt,source:e.source,launchEvent:e};
    console.log(`[TOKEN_BIRTH_QUEUED] mint=${short(e.mint)} creator=${short(e.creator)} — pending developer reputation screen`);
  } else if(e.kind==='MIGRATION_EVENT') {
    state.events[e.mint]={...prior,mint:e.mint,name:e.name,symbol:e.symbol,migrationSeenAt:prior.migrationSeenAt||Date.now(),reportedPool:e.reportedPool||null,source:e.source};
    console.log(`[MIGRATION_EVENT] mint=${short(e.mint)} pool=${e.reportedPool||'not-provided'} — awaiting independent DEX pool verification`);
  }
}
async function main() {
  const started=Date.now(),state=await loadState();
  const stats={birthAlerts:0,poolAlerts:0,profilesSeen:0,poolsSeen:0,devChecks:0,devRejected:0,poolRejected:0,errors:0};
  console.log(`${VERSION} START | READ-ONLY / NO ORDERS / NO AUTO-BUY`);
  console.log(`[CONFIG] listen=${CFG.listenMs}ms scanLimit=${CFG.scanLimit} source=${CFG.pumpKey?'PumpPortal':'PumpDev public feed'}`);
  const feed=await collectLaunchEvents(); console.log(`[LAUNCH_FEED_END] provider=${feed.provider} status=${feed.status} events=${feed.events.length}`);
  for(const e of feed.events) { try{await processEvent(e,state,stats);}catch(err){stats.errors++;console.error(`[EVENT_ERROR] ${err.message}`);} }
  const discovered=await discoverPools(); stats.errors+=discovered.errors.length;
  const candidates=new Map();
  for(const x of discovered.items) { if(x.kind==='DEX_POOL') candidates.set(x.mint,{...candidates.get(x.mint),...x}); else {stats.profilesSeen++; const prior=candidates.get(x.mint)||{}; candidates.set(x.mint,{...prior,...x});} }
  // Retry undelivered birth alerts and recheck recent birth/migration candidates.
  for(const [mint,ev] of Object.entries(state.events)) {
    if(!ev.birthAlertedAt && ev.launchEvent && Date.now()-Number(ev.firstEventAt||0)<24*60*60*1000) {
      try {
        const dev=await getDeveloperRecord(ev.creator,state,stats);
        ev.devReputation=dev;
        if(dev.verified && dev.score>=CFG.minDevScore) {
          const sent=await telegram(buildBirth(ev.launchEvent,dev));
          if(sent){ev.birthAlertedAt=Date.now();stats.birthAlerts++;}
          console.log(`[BIRTH_SCREEN] mint=${short(mint)} devScore=${dev.score}/35 eligible=${dev.score>=CFG.minDevScore} sent=${sent}`);
        } else {
          stats.devRejected++;
          console.log(`[BIRTH_FILTERED] mint=${short(mint)} devScore=${dev.score}/35 reason=${dev.reason||'LOW_REPUTATION'}`);
        }
      } catch(err) { stats.errors++; console.error(`[BIRTH_SCREEN_ERROR] ${short(mint)} ${err.message}`); }
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
      const dev=prior.devReputation?.verified ? prior.devReputation : await getDeveloperRecord(prior.creator,state,stats);
      const quality=scorePoolQuality(pool,dev.verified?dev.score:0);
      if(!prior.poolAlertedAt) {
        if(!dev.verified || dev.score<CFG.minDevScore || quality.score<CFG.minPoolScore) {
          stats.poolRejected++;
          console.log(`[POOL_FILTERED] mint=${short(item.mint)} devScore=${dev.score}/35 quality=${quality.score}/100 liquidity=${pool.liquidityUsd??'UNKNOWN'} volume24h=${pool.volume24h??'UNKNOWN'} buys=${quality.buys} sells=${quality.sells} reason=${dev.reason||'QUALITY_BELOW_THRESHOLD'}`);
        } else {
          const sent=await telegram(buildPool(pool,'NEW_DEX_POOL',quality));
          if(sent){state.events[item.mint]={...prior,mint:item.mint,name:pool.name,symbol:pool.symbol,pool:pool.pool,poolAlertedAt:Date.now(),poolSource:pool.source,poolCreatedAt:pool.poolCreatedAt||null,devReputation:dev,poolQuality:quality};stats.poolAlerts++;}
          console.log(`[DEX_POOL_ALERT] mint=${short(item.mint)} pool=${short(pool.pool)} sent=${sent} quality=${quality.score}/100 source=${pool.source}`);
        }
      }
    } catch(e) {stats.errors++;console.error(`[POOL_CANDIDATE_ERROR] ${short(item.mint)} ${e.message}`);}
    await sleep(120);
  }
  state.stats.runs=Number(state.stats.runs||0)+1; state.stats.birthAlerts=Number(state.stats.birthAlerts||0)+stats.birthAlerts; state.stats.poolAlerts=Number(state.stats.poolAlerts||0)+stats.poolAlerts; state.lastRun=new Date().toISOString();
  // Keep the event ledger bounded while retaining recent launch/pool lifecycle state.
  const cutoff=Date.now()-7*24*60*60*1000;
  for(const [mint,v] of Object.entries(state.events)) if(Number(v.poolAlertedAt||v.birthAlertedAt||v.migrationSeenAt||v.firstEventAt||0)<cutoff) delete state.events[mint];
  await saveState(state);
  console.log(`${VERSION} END | feedEvents=${feed.events.length} profiles=${stats.profilesSeen} poolCandidates=${discovered.items.filter(x=>x.kind==='DEX_POOL').length} scanned=${scanned} birthAlerts=${stats.birthAlerts} poolAlerts=${stats.poolAlerts} devChecks=${stats.devChecks} devRejected=${stats.devRejected} poolRejected=${stats.poolRejected} errors=${stats.errors} elapsed=${Math.round((Date.now()-started)/1000)}s`);
  for(const e of discovered.errors) console.log(`[DISCOVERY_WARNING] ${e}`);
}
if(process.env.HUNTER_SELF_TEST==='1') {
  const assert=(await import('node:assert/strict')).default;
  assert.equal(num(null),0); assert.equal(num('12.5'),12.5); assert.equal(num('bad'),null);
  const birth=buildBirth({name:'Test',symbol:'TST',mint:'mint',eventAt:Date.now(),source:'TEST'},{score:25,launches:5,graduationRate:0.4});
  assert.ok(birth.includes('TOKEN BIRTH DETECTED'));
  assert.ok(birth.includes('Europe/Berlin'));
  assert.equal(formatVirtualSol(30000000000), '30.00 SOL');
  assert.ok(birth.includes('اعتبار سازنده'));
  const dev=scoreDeveloper({record:{launches:10,graduations:4,graduation_rate:0.4},last_90_days:{launches_measured:10,doubled:4,ten_x:1,held_2x:2,dead_next_day:1}});
  assert.ok(dev.verified && dev.score>0 && dev.score<=35);
  const q=scorePoolQuality({liquidityUsd:12000,volume24h:25000,buys24h:150,sells24h:40},25);
  assert.ok(q.score>=70);
  assert.ok(birth.includes('تضمین‌کننده رشد نیست')); 
  const pool=buildPool({name:'Test',symbol:'TST',mint:'mint',pool:'pool',source:'TEST',liquidityUsd:0});
  assert.ok(pool.includes('NEW DEX POOL DETECTED'));
  assert.ok(pool.includes('امتیاز کیفیت'));
  assert.ok(pool.includes('تضمین فروش‌پذیری')); 
  console.log('SELF_TEST_OK');
} else main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
