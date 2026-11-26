import fs from 'node:fs/promises';
import path from 'node:path';

const VERSION = 'NOVARA-MEME-HUNTER-V1.0.0-SOLANA-TON';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const STATE_FILE = path.join(ROOT, process.env.NOVARA_STATE_FILE || 'data/meme_hunter_state.json');
const n = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const int = (k,d) => Math.max(1, Math.floor(n(process.env[k],d)));
const num = (k,d) => Math.max(0,n(process.env[k],d));
const CFG = {
  scanLimit: int('HUNTER_SCAN_LIMIT', 8),
  maxAgeHours: num('HUNTER_MAX_AGE_HOURS', 72),
  minLiquidity: num('HUNTER_MIN_LIQUIDITY_USD', 8000),
  minBuyVolume15m: num('HUNTER_MIN_BUY_VOLUME_15M_USD', 500),
  minBuys24h: int('HUNTER_MIN_BUYS_24H', 8),
  minUniqueBuyers: int('HUNTER_MIN_UNIQUE_BUYERS', 6),
  maxTop10Pct: num('HUNTER_MAX_TOP10_HOLDER_PCT', 55),
  minScore: num('HUNTER_MIN_SCORE', 72),
  alertCooldownHours: num('HUNTER_ALERT_COOLDOWN_HOURS', 6),
  telegramToken: process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
  vipChat: process.env.NOVARA_VIP_CHAT_ID || process.env.VIP_CHAT_ID || '',
  freeChat: process.env.NOVARA_FREE_CHAT_ID || process.env.FREE_CHAT_ID || '',
  solanaRpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  tonApiKey: process.env.TONAPI_KEY || '',
  jupiterApiKey: process.env.JUPITER_API_KEY || '',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a,b) => b > 0 ? a/b*100 : null;
const short = s => !s ? '—' : String(s).length > 13 ? `${String(s).slice(0,6)}…${String(s).slice(-5)}` : String(s);
const usd = v => v == null || !Number.isFinite(Number(v)) ? 'نامشخص' : `$${Number(v).toLocaleString('en-US',{maximumFractionDigits:0})}`;
const fmtPct = v => v == null ? 'نامشخص' : `${Number(v).toFixed(1)}%`;
const ageHours = ts => ts ? Math.max(0,(Date.now()-ts)/3600000) : null;

async function request(url, opts={}, timeout=12000) {
  const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const res=await fetch(url,{...opts,signal:controller.signal,headers:{'accept':'application/json','user-agent':'NOVARA-Meme-Hunter/1.0',...(opts.headers||{})}});
    if(!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}
async function rpc(method, params) {
  const j=await request(CFG.solanaRpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(j.error) throw new Error(j.error.message||'Solana RPC error'); return j.result;
}
async function loadState(){
  try { const s=JSON.parse(await fs.readFile(STATE_FILE,'utf8')); return {tokens:s.tokens||{},stats:s.stats||{runs:0,alerts:0},lastRun:s.lastRun||null}; }
  catch { return {tokens:{},stats:{runs:0,alerts:0},lastRun:null}; }
}
async function saveState(s){ await fs.mkdir(path.dirname(STATE_FILE),{recursive:true}); await fs.writeFile(STATE_FILE,JSON.stringify(s,null,2)+'\n'); }

// Stage 1 — discover freshly-created DEX pools on Solana and TON.
async function discover(){
  const out=[]; const errors=[];
  for(const network of ['solana','ton']){
    try {
      const j=await request(`https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?page=1`,{headers:{accept:'application/json;version=20230302'}});
      const included=new Map((j.included||[]).map(x=>[x.id,x.attributes||{}]));
      for(const p of j.data||[]){
        const a=p.attributes||{}, rel=p.relationships||{};
        const baseId=rel.base_token?.data?.id, quoteId=rel.quote_token?.data?.id;
        const base=included.get(baseId)||{}, quote=included.get(quoteId)||{};
        const tokenAddr=(base.address||base.token_address||'').trim();
        if(!tokenAddr) continue;
        out.push({chain:network,tokenAddress:tokenAddr,poolAddress:a.address||p.id?.split('_').slice(1).join('_'),name:base.name||'Unknown',symbol:base.symbol||'UNKNOWN',quoteSymbol:quote.symbol||'',poolCreatedAt:a.pool_created_at?Date.parse(a.pool_created_at):null,priceUsd:n(a.base_token_price_usd),liquidityUsd:n(a.reserve_in_usd),fdv:n(a.fdv_usd),marketCap:n(a.market_cap_usd),volume24h:n(a.volume_usd?.h24),txns24h:a.transactions?.h24||{},source:'GeckoTerminal new_pools',url:`https://www.geckoterminal.com/${network}/pools/${a.address||''}`});
      }
    } catch(e){ errors.push(`${network} discovery: ${e.message}`); }
  }
  // DexScreener's latest token profiles are an additional discovery feed, not a safety endorsement.
  try {
    const profiles=await request('https://api.dexscreener.com/token-profiles/latest/v1');
    for(const p of Array.isArray(profiles)?profiles:[]){
      if(!['solana','ton'].includes(String(p.chainId||'').toLowerCase())) continue;
      out.push({chain:p.chainId.toLowerCase(),tokenAddress:p.tokenAddress,name:p.description?.slice(0,50)||'New profile',symbol:'—',source:'DEX Screener latest profile',url:p.url||''});
    }
  } catch(e){ errors.push(`DEX Screener discovery: ${e.message}`); }
  const dedup=new Map(); for(const x of out){const k=`${x.chain}:${x.tokenAddress}`; if(!dedup.has(k)) dedup.set(k,x); else Object.assign(dedup.get(k),Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined&&v!=='')));}
  return {tokens:[...dedup.values()].slice(0,CFG.scanLimit*3),errors};
}

async function enrichDex(token){
  try {
    const j=await request(`https://api.dexscreener.com/token-pairs/v1/${token.chain}/${encodeURIComponent(token.tokenAddress)}`);
    const pairs=(Array.isArray(j)?j:[]).sort((a,b)=>n(b.liquidity?.usd)-n(a.liquidity?.usd));
    const p=pairs[0]; if(!p) return token;
    return {...token,name:p.baseToken?.name||token.name,symbol:p.baseToken?.symbol||token.symbol,priceUsd:n(p.priceUsd,token.priceUsd),liquidityUsd:n(p.liquidity?.usd,token.liquidityUsd),fdv:n(p.fdv,token.fdv),marketCap:n(p.marketCap,token.marketCap),volume24h:n(p.volume?.h24,token.volume24h),txns24h:p.txns?.h24||token.txns24h||{},priceChange:p.priceChange||{},pairCreatedAt:p.pairCreatedAt||token.poolCreatedAt,pairAddress:p.pairAddress||token.poolAddress,dexId:p.dexId||'',url:p.url||token.url};
  } catch { return token; }
}

// Stage 2 — infer early buyer activity from recent indexed pool trades.
// This is an evidence sample, not a complete wallet PnL/history database.
async function smartMoney(token){
  const result={trades:[],uniqueBuyers:0,uniqueSellers:0,buyUsd:0,sellUsd:0,earlyWallets:[],coordinationRisk:false,coverage:'UNAVAILABLE'};
  if(!token.poolAddress) return result;
  try {
    const j=await request(`https://api.geckoterminal.com/api/v2/networks/${token.chain}/pools/${encodeURIComponent(token.poolAddress)}/trades?page=1`,{headers:{accept:'application/json;version=20230302'}});
    const trades=(j.data||[]).map(x=>x.attributes||{});
    const cutoff=Date.now()-15*60_000;
    const recent=trades.filter(t=>n(t.block_timestamp?Date.parse(t.block_timestamp):t.timestamp)>cutoff);
    const buys=recent.filter(t=>String(t.kind||'').toLowerCase()==='buy');
    const sells=recent.filter(t=>String(t.kind||'').toLowerCase()==='sell');
    const wallet=t=>t.tx_from||t.from_address||t.trader_address||t.maker||'';
    const buyerSet=new Set(buys.map(wallet).filter(Boolean)), sellerSet=new Set(sells.map(wallet).filter(Boolean));
    result={trades:recent,uniqueBuyers:buyerSet.size,uniqueSellers:sellerSet.size,buyUsd:buys.reduce((a,t)=>a+n(t.volume_in_usd),0),sellUsd:sells.reduce((a,t)=>a+n(t.volume_in_usd),0),earlyWallets:[...buyerSet].slice(0,8),coordinationRisk:detectCoordination(buys,wallet),coverage:'SAMPLED_15M_TRADES'};
  } catch(e){ result.error=e.message; }
  return result;
}
function detectCoordination(buys,walletFn){
  const counts=new Map(); for(const t of buys){const w=walletFn(t); if(w) counts.set(w,(counts.get(w)||0)+1);}
  // Repeated buys from a small set of addresses can be suspicious; never proof of common control.
  return counts.size>=2 && [...counts.values()].filter(v=>v>=3).length>=2;
}

// Stage 3 — chain-specific safety evidence. Unknown is never silently treated as safe.
async function solanaSafety(token){
  const s={mintAuthority:'UNKNOWN',freezeAuthority:'UNKNOWN',top10HolderPct:null,holderCoverage:'UNAVAILABLE',sellability:'NOT_SIMULATED',riskFlags:[]};
  try {
    const [info,supply,largest]=await Promise.all([
      rpc('getAccountInfo',[token.tokenAddress,{encoding:'base64'}]),
      rpc('getTokenSupply',[token.tokenAddress]),
      rpc('getTokenLargestAccounts',[token.tokenAddress]),
    ]);
    if(info?.value?.data?.[0]){
      const b=Buffer.from(info.value.data[0],'base64');
      if(b.length>=82){
        const mintOpt=b.readUInt32LE(0), freezeOpt=b.readUInt32LE(46);
        s.mintAuthority=mintOpt===0?'REVOKED':'ACTIVE'; s.freezeAuthority=freezeOpt===0?'REVOKED':'ACTIVE';
      }
    }
    const total=BigInt(supply?.value?.amount||'0');
    const accounts=largest?.value||[];
    if(total>0n&&accounts.length){const sum=accounts.slice(0,10).reduce((a,x)=>a+BigInt(x.amount||'0'),0n);s.top10HolderPct=Number(sum*1000000n/total)/10000;s.holderCoverage='RPC_TOP10_ACCOUNTS';}
    if(s.mintAuthority==='ACTIVE') s.riskFlags.push('اختیار ضرب توکن هنوز فعال است');
    if(s.freezeAuthority==='ACTIVE') s.riskFlags.push('اختیار فریز هنوز فعال است');
    if(s.top10HolderPct!=null&&s.top10HolderPct>CFG.maxTop10Pct) s.riskFlags.push(`تمرکز ۱۰ هولدر اول ${s.top10HolderPct.toFixed(1)}٪ است`);
  } catch(e){s.error=e.message;s.riskFlags.push('بررسی مستقیم RPC سولانا ناموفق بود');}
  // Optional Jupiter quote-only sellability probe. It does not sign or send a transaction.
  if(CFG.jupiterApiKey){
    try{
      const amount=1000000; // one-million base units; quote is a route probe, not a standard-size slippage guarantee.
      const q=await request(`https://api.jup.ag/swap/v1/quote?inputMint=${encodeURIComponent(token.tokenAddress)}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=300`,{headers:{'x-api-key':CFG.jupiterApiKey}});
      s.sellability=q.outAmount?'ROUTE_QUOTE_AVAILABLE':'NO_ROUTE'; s.sellQuoteImpactPct=n(q.priceImpactPct)*100;
    } catch(e){s.sellability='QUOTE_FAILED';s.sellQuoteError=e.message;}
  }
  return s;
}
async function tonSafety(token){
  const s={mintAuthority:'NOT_APPLICABLE',freezeAuthority:'NOT_APPLICABLE',top10HolderPct:null,holderCoverage:'UNAVAILABLE',sellability:'NOT_SIMULATED',riskFlags:[]};
  if(!CFG.tonApiKey){s.riskFlags.push('برای بررسی هولدرهای TON کلید TONAPI_KEY تنظیم نشده');return s;}
  try{
    const j=await request(`https://tonapi.io/v2/jettons/${encodeURIComponent(token.tokenAddress)}/holders?limit=10`,{headers:{Authorization:`Bearer ${CFG.tonApiKey}`}});
    const holders=j.addresses||j.holders||[]; const total=n(j.total_supply||j.totalSupply);
    if(total>0&&holders.length){const sum=holders.reduce((a,h)=>a+n(h.balance),0);s.top10HolderPct=pct(sum,total);s.holderCoverage='TONAPI_TOP10';}
  }catch(e){s.error=e.message;s.riskFlags.push('دریافت اطلاعات هولدرهای TON ناموفق بود');}
  // STON.fi documents a swap-simulation endpoint, but the required pool/router-specific request body
  // is not safely inferable from generic market data; do not fabricate a simulation request.
  s.riskFlags.push('امکان فروش با شبیه‌سازی واقعی در این نسخه برای TON تأیید نشده');
  return s;
}

// Stage 4 — short-window momentum, buyer/seller balance and liquidity evidence.
function momentum(token,sm,previous){
  const buys=n(token.txns24h?.buys), sells=n(token.txns24h?.sells);
  const bsr=buys+sells?buys/(buys+sells):null;
  const liqDelta=previous?.liquidityUsd>0&&token.liquidityUsd>0?(token.liquidityUsd/previous.liquidityUsd-1)*100:null;
  const netFlow=sm.buyUsd-sm.sellUsd;
  return {buys24h:buys,sells24h:sells,buyerSellerRatio:bsr,buyers15m:sm.uniqueBuyers,sellers15m:sm.uniqueSellers,buyUsd15m:sm.buyUsd,sellUsd15m:sm.sellUsd,netFlow15m:netFlow,liquidityDeltaPct:liqDelta,volume5mEstimate:token.volume24h?token.volume24h/288:null};
}

// Stage 5 — explainable scoring; unknown data earns no safety credit.
function rank(token,sm,safety,mom,age){
  let discovery=0,smart=0,safe=0,flow=0,market=0; const reasons=[],risks=[...(safety.riskFlags||[])];
  if(age!=null&&age<=24) discovery+=10; else if(age!=null&&age<=CFG.maxAgeHours) discovery+=7;
  if(token.source?.includes('new_pools')) discovery+=5;
  if(sm.coverage!=='UNAVAILABLE'){
    smart+=Math.min(12,sm.uniqueBuyers*1.5);
    if(sm.uniqueBuyers>sm.uniqueSellers) smart+=5;
    if(sm.buyUsd>sm.sellUsd) smart+=4;
    if(sm.uniqueBuyers>=CFG.minUniqueBuyers) reasons.push(`${sm.uniqueBuyers} خریدار متمایز در نمونه ۱۵ دقیقه‌ای`);
    if(sm.coordinationRisk){smart-=6;risks.push('الگوی خرید تکراری/هماهنگ مشکوک؛ نیازمند بررسی');}
  } else risks.push('تاریخچه معاملات/کیف‌پول‌ها در دسترس نبود');
  if(safety.mintAuthority==='REVOKED') safe+=7; else if(safety.mintAuthority==='ACTIVE') safe-=10;
  if(safety.freezeAuthority==='REVOKED') safe+=7; else if(safety.freezeAuthority==='ACTIVE') safe-=10;
  if(safety.top10HolderPct!=null){safe+=Math.max(0,12-(safety.top10HolderPct/100*12)); if(safety.top10HolderPct<=CFG.maxTop10Pct) reasons.push(`سهم ۱۰ هولدر اول ${safety.top10HolderPct.toFixed(1)}٪`);}
  else risks.push('تمرکز هولدرها تأیید نشده');
  if(safety.sellability==='ROUTE_QUOTE_AVAILABLE') safe+=8; else if(safety.sellability==='NO_ROUTE'||safety.sellability==='QUOTE_FAILED') safe-=12; else risks.push('فروش‌پذیری با مسیر واقعی تأیید نشده');
  if(token.liquidityUsd>=CFG.minLiquidity) safe+=7; else risks.push(`نقدینگی کمتر از حداقل ${usd(CFG.minLiquidity)}`);
  if(sm.coverage!=='UNAVAILABLE'){
    if(mom.buyers15m>=CFG.minUniqueBuyers) flow+=8;
    if(mom.netFlow15m>0) flow+=7;
    if(mom.buyerSellerRatio!=null&&mom.buyerSellerRatio>=0.60) flow+=5;
  }
  if(mom.liquidityDeltaPct!=null&&mom.liquidityDeltaPct>0) flow+=Math.min(5,mom.liquidityDeltaPct/2);
  if(token.volume24h>=10000) market+=5; if(n(token.txns24h?.buys)>n(token.txns24h?.sells)) market+=4;
  if(token.liquidityUsd>=CFG.minLiquidity) market+=3;
  const raw=discovery+smart+safe+flow+market; const score=Math.max(0,Math.min(100,Math.round(raw)));
  const hardFail=token.liquidityUsd<CFG.minLiquidity || (safety.mintAuthority==='ACTIVE'&&safety.freezeAuthority==='ACTIVE') || safety.sellability==='NO_ROUTE';
  const enoughEvidence=sm.coverage!=='UNAVAILABLE' && safety.top10HolderPct!=null && safety.mintAuthority!=='UNKNOWN' && safety.freezeAuthority!=='UNKNOWN';
  const qualified=!hardFail&&enoughEvidence&&score>=CFG.minScore&&sm.uniqueBuyers>=CFG.minUniqueBuyers&&sm.buyUsd>=CFG.minBuyVolume15m&&mom.buys24h>=CFG.minBuys24h&&sm.buyUsd>sm.sellUsd;
  if(token.liquidityUsd>=CFG.minLiquidity) reasons.push(`نقدینگی استخر ${usd(token.liquidityUsd)}`);
  if(sm.buyUsd>sm.sellUsd) reasons.push(`خالص جریان خرید ۱۵ دقیقه‌ای ${usd(sm.buyUsd-sm.sellUsd)}`);
  if(!enoughEvidence) risks.push('داده‌های ایمنی کافی برای تأیید نهایی موجود نیست');
  return {score,qualified,hardFail,enoughEvidence,components:{discovery:Math.round(discovery),smartMoney:Math.round(smart),safety:Math.round(safe),momentum:Math.round(flow),market:Math.round(market)},reasons,risks};
}

function buildMessage(t,sm,s,m,r,age){
  const chain=t.chain==='solana'?'Solana':'TON';
  const lines=[`🚨 <b>NOVARA MEME HUNTER — ${chain}</b>`,`<b>${esc(t.name)} ($${esc(t.symbol)})</b>`,`━━━━━━━━━━━━━━━━━━`,`<b>امتیاز نهایی:</b> ${r.score}/100 | <b>وضعیت:</b> واجد شرایط اولیه`,`<b>سن استخر:</b> ${age==null?'نامشخص':`${age.toFixed(1)} ساعت`}`,`<b>قیمت:</b> ${t.priceUsd?`$${t.priceUsd}`:'نامشخص'}`,`<b>ارزش بازار/FDV:</b> ${usd(t.marketCap||t.fdv)}`,`<b>نقدینگی استخر:</b> ${usd(t.liquidityUsd)}`,`<b>حجم ۲۴ساعته:</b> ${usd(t.volume24h)}`,`<b>DEX:</b> ${esc(t.dexId||'از منبع Pool Indexer')}`,`<b>قرارداد:</b> <code>${esc(t.tokenAddress)}</code>`,`<b>استخر:</b> <code>${esc(t.poolAddress||'نامشخص')}</code>`,``,`<b>۱) Discovery</b>`,`منبع: ${esc(t.source||'Pool indexer')} | شبکه: ${chain}`,`<b>۲) Smart Money / معاملات ۱۵ دقیقه اخیر</b>`,`خریداران متمایز: ${sm.uniqueBuyers} | فروشندگان متمایز: ${sm.uniqueSellers}`,`خرید: ${usd(sm.buyUsd)} | فروش: ${usd(sm.sellUsd)} | خالص: ${usd(sm.buyUsd-sm.sellUsd)}`,`کیف‌پول‌های نمونه: ${sm.earlyWallets.length?sm.earlyWallets.map(short).join(', '):'داده کافی موجود نیست'}`,`<b>۳) Safety</b>`,`Mint authority: ${s.mintAuthority} | Freeze authority: ${s.freezeAuthority}`,`تمرکز ۱۰ هولدر اول: ${fmtPct(s.top10HolderPct)} | فروش‌پذیری: ${s.sellability}`,`پوشش داده هولدرها: ${s.holderCoverage}`,`<b>۴) Early Momentum</b>`,`خریدار/فروشنده ۲۴ساعته: ${m.buys24h}/${m.sells24h}`,`نسبت خریدار به کل معاملات: ${m.buyerSellerRatio==null?'نامشخص':(m.buyerSellerRatio*100).toFixed(1)+'%'}`,`تغییر نقدینگی از اسکن قبل: ${fmtPct(m.liquidityDeltaPct)}`,`<b>۵) Ranking</b>`,`Discovery ${r.components.discovery} | Smart Money ${r.components.smartMoney} | Safety ${r.components.safety} | Momentum ${r.components.momentum} | Market ${r.components.market}`,`<b>دلایل پذیرش:</b>`,...(r.reasons.length?r.reasons.map(x=>`• ${esc(x)}`):['• —']),`<b>هشدارها و موارد تأییدنشده:</b>`,...(r.risks.length?r.risks.map(x=>`⚠️ ${esc(x)}`):['• مورد مهمی در داده‌های موجود ثبت نشد']),``,`🔎 <a href="${esc(t.url||`https://dexscreener.com/${t.chain}/${t.tokenAddress}`)}">مشاهده بازار</a>`,`⚠️ این پیام سیگنال خرید نیست. فقط نامزد پژوهشی است؛ ریسک راگ/دستکاری و خطای داده همچنان وجود دارد. هیچ معامله‌ای انجام نشده.`];
  return lines.join('\n');
}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
async function sendTelegram(text,chat){
  if(!CFG.telegramToken||!chat) return false;
  const j=await request(`https://api.telegram.org/bot${CFG.telegramToken}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true})});
  if(!j.ok) throw new Error(j.description||'Telegram error'); return true;
}

async function main(){
  const started=Date.now(),state=await loadState(); state.stats.runs++;
  console.log(`${VERSION} START — READ ONLY / NO ORDERS / NO AUTO-BUY`);
  console.log(`Discovery feeds: GeckoTerminal (Solana + TON), DEX Screener profiles; Solana RPC ${CFG.solanaRpc.includes('api.mainnet-beta')?'public fallback':'custom RPC'}`);
  const {tokens,errors}=await discover(); console.log(`Discovered ${tokens.length} unique token candidates`);
  // Alternate chains so a busy Solana feed cannot starve TON discovery.
  const buckets={solana:[],ton:[]}; for(const t of tokens){(buckets[t.chain]||buckets.solana).push(t);}
  const work=[]; while(work.length<CFG.scanLimit&&(buckets.solana.length||buckets.ton.length)){for(const c of ['solana','ton']) if(buckets[c].length&&work.length<CFG.scanLimit) work.push(buckets[c].shift());}
  let checked=0,qualified=0,alerts=0;
  for(const raw of work){
    const key=`${raw.chain}:${raw.tokenAddress}`; const previous=state.tokens[key]||{};
    try{
      const t=await enrichDex(raw); const age=ageHours(t.pairCreatedAt||t.poolCreatedAt);
      if(age!=null&&age>CFG.maxAgeHours) continue;
      const sm=await smartMoney(t);
      const safety=t.chain==='solana'?await solanaSafety(t):await tonSafety(t);
      const mom=momentum(t,sm,previous); const rankResult=rank(t,sm,safety,mom,age); checked++;
      const record={firstSeen:previous.firstSeen||Date.now(),lastSeen:Date.now(),name:t.name,symbol:t.symbol,priceUsd:t.priceUsd,liquidityUsd:t.liquidityUsd,score:rankResult.score,qualified:rankResult.qualified,chain:t.chain,tokenAddress:t.tokenAddress,poolAddress:t.poolAddress,source:t.source,top10HolderPct:safety.top10HolderPct};
      state.tokens[key]={...previous,...record};
      if(rankResult.qualified){qualified++; const lastAlert=n(previous.lastAlertAt); if(Date.now()-lastAlert>CFG.alertCooldownHours*3600000){
        const msg=buildMessage(t,sm,safety,mom,rankResult,age);
        let sent=false; for(const chat of [CFG.vipChat,CFG.freeChat].filter(Boolean)){try{sent=await sendTelegram(msg,chat)||sent;}catch(e){console.error(`Telegram: ${e.message}`);}}
        if(sent){alerts++;state.tokens[key].lastAlertAt=Date.now();state.stats.alerts++;}
      }}
      console.log(`${t.chain} ${t.symbol} score=${rankResult.score} qualified=${rankResult.qualified} buyers15m=${sm.uniqueBuyers} liquidity=${n(t.liquidityUsd)} top10=${safety.top10HolderPct}`);
    }catch(e){console.error(`Candidate ${key}: ${e.message}`);}
    await sleep(250);
  }
  state.lastRun=new Date().toISOString(); await saveState(state);
  console.log(`${VERSION} END | checked=${checked} qualified=${qualified} alerts=${alerts} errors=${errors.length} elapsed=${Math.round((Date.now()-started)/1000)}s`);
  for(const e of errors) console.log(`FEED_WARNING ${e}`);
}
if (process.env.HUNTER_SELF_TEST === '1') {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(detectCoordination([{tx_from:'a'},{tx_from:'a'},{tx_from:'a'},{tx_from:'b'},{tx_from:'b'},{tx_from:'b'}],t=>t.tx_from), true);
  assert.equal(detectCoordination([{tx_from:'a'},{tx_from:'b'}],t=>t.tx_from), false);
  const scored=rank({chain:'solana',liquidityUsd:10000,volume24h:20000,txns24h:{buys:20,sells:5}}, {coverage:'SAMPLED_15M_TRADES',uniqueBuyers:8,uniqueSellers:2,buyUsd:5000,sellUsd:1000,coordinationRisk:false}, {mintAuthority:'REVOKED',freezeAuthority:'REVOKED',top10HolderPct:20,sellability:'ROUTE_QUOTE_AVAILABLE',riskFlags:[]}, {buyers15m:8,netFlow15m:4000,buyerSellerRatio:0.8,liquidityDeltaPct:5,buys24h:20,sells24h:5}, 2);
  assert.equal(scored.qualified, true);
  console.log('SELF_TEST_OK');
} else { main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}); }
