const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/novara_smart_money_ai.mjs', 'utf8');
function ok(condition, message) { if (!condition) throw new Error(message); console.log('PASS | ' + message); }
function extractTopLevelFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const end = src.indexOf('\n}', start);
  if (end < 0) throw new Error(`unterminated function ${name}`);
  return src.slice(start, end + 2);
}
const sandbox = {
  Math,
  n: (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d,
  clamp: (x,a,b) => Math.max(a,Math.min(b,x)),
  GLOBAL_HIST_NEAR_PCT_15M: 0.25,
  GLOBAL_HIST_NEAR_PCT_1H: 0.50,
  PAPER_ROUND_TRIP_COST_PCT: 0.16,
  atr: () => 0.10,
  buildHistoricalLevelMap: () => [{price:100,role:'SUPPORT_ORIGIN',zonePct:0.1}],
};
vm.createContext(sandbox);
vm.runInContext(extractTopLevelFunction('globalReactionContext') + '\n' + extractTopLevelFunction('applyGlobalReactionEvidence') + '\n' + extractTopLevelFunction('walkForwardReactionBacktest'), sandbox);
const supportLevel={price:100,zonePct:0.1,role:'SUPPORT',supportSuccessRate:75,resistanceSuccessRate:10,interactions:8,strength:70};
const resistanceLevel={price:105,zonePct:0.1,role:'RESISTANCE',supportSuccessRate:5,resistanceSuccessRate:80,interactions:9,strength:80};
let ctx=sandbox.globalReactionContext({levels:[supportLevel,resistanceLevel],recentCandles:[]},100.1,'15m',[
 {o:100.10,h:100.40,l:99.95,c:100.30},{o:100.05,h:100.25,l:99.98,c:100.12}
]);
ok(ctx.state==='HISTORICAL_SUPPORT_BOUNCE' && ctx.bias==='LONG','repeated historical support plus current completed-candle reclaim produces LONG evidence');
ctx=sandbox.globalReactionContext({levels:[supportLevel,resistanceLevel],recentCandles:[]},104.9,'15m',[
 {o:104.95,h:105.10,l:104.70,c:104.80},{o:104.90,h:105.08,l:104.75,c:104.82}
]);
ok(ctx.state==='HISTORICAL_RESISTANCE_REJECTION' && ctx.bias==='SHORT','repeated historical resistance plus current completed-candle rejection produces SHORT evidence');
ctx=sandbox.globalReactionContext({levels:[supportLevel],recentCandles:[]},99.7,'1h',[
 {o:99.8,h:99.9,l:99.5,c:99.7},{o:99.7,h:99.8,l:99.4,c:99.6}
]);
ok(ctx.state==='SUPPORT_BROKEN_CONFIRMED' && ctx.bias==='SHORT','two completed closes below former support confirm role reversal to resistance');
const synthetic=[];
for(let i=0;i<820;i++){
  const t=1700000000000+i*900000;
  const signal=(i>=480&&(i-480)%24===0);
  synthetic.push(signal?{t,o:100.10,h:100.30,l:99.90,c:100.20,T:t+899999}: {t,o:100.20,h:101.00,l:100.05,c:100.70,T:t+899999});
}
const wf=sandbox.walkForwardReactionBacktest(synthetic,'15m');
ok(wf.samples>0 && wf.avgNetR>0 && wf.method==='WALK_FORWARD_PAST_LEVELS_ONLY','walk-forward backtest uses past-only levels and subtracts round-trip costs');
const evidence=sandbox.applyGlobalReactionEvidence({side:'LONG'},
 {available:true,timeframe:'15m',state:'SUPPORT_BROKEN_CONFIRMED',bias:'SHORT'},
 {available:true,timeframe:'1h',state:'SUPPORT_BROKEN_CONFIRMED',bias:'SHORT'});
ok(evidence.blocked===true && evidence.adjustment<0,'conflicting 15m and 1h historical reaction memory blocks opposite-side candidate');
const required=[
 'fetchHyperliquidHistory','refreshGlobalReactionMemory','globalReactionContext','applyGlobalReactionEvidence','walkForwardReactionBacktest',
 'GLOBAL-HISTORY][NOT-READY','Persist paper and global historical memory','globalReactionMemory'
];
for(const token of required) ok(src.includes(token) || fs.readFileSync(__dirname+'/.github/workflows/novara_smart_money_ai.yml','utf8').includes(token),`static invariant present: ${token}`);
ok(src.includes("const VERSION = 'NOVARA-SMART-MONEY-AI-V2.19.0-GLOBAL-HISTORICAL-REACTION-MEMORY'"),'version tag is V2.19.0');
ok(src.includes("const CLEAN_START_ID = 'NOVARA-V2.14.0-ENTRY-SIDE-BTC-GATE-REPAIR-COHORT-2026-10-30'"),'existing paper cohort clean-start marker preserved');
console.log('ALL SYNTHETIC TESTS PASSED');
