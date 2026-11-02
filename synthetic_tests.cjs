const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/novara_smart_money_ai.mjs', 'utf8');
function ok(c,m){if(!c)throw new Error(m);console.log('PASS | '+m)}
function extract(name){const a=src.indexOf(`function ${name}(`);if(a<0)throw Error('missing '+name);const body=src.indexOf('{',src.indexOf(')',a));let depth=0;for(let i=body;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)return src.slice(a,i+1)}throw Error('unterminated '+name)}
function ema(values,period){if(!values.length)return 0;const k=2/(period+1);let v=values[0];for(let i=1;i<values.length;i++)v=values[i]*k+v*(1-k);return v}
const sandbox={Math,ema,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),n:(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,PREDICTIVE_HORIZON_MINUTES:[15,60]};
vm.createContext(sandbox);vm.runInContext(extract('pctChange')+'\n'+extract('emaSpread')+'\n'+extract('predictNextMove'),sandbox);
function candles(direction){let p=100;const a=[];for(let i=0;i<100;i++){const o=p;p*=direction==='UP'?1.0018:direction==='DOWN'?0.9982:1+(i%2?0.00005:-0.00005);a.push({o,h:Math.max(o,p)*1.0005,l:Math.min(o,p)*0.9995,c:p,v:100+(i%7)*4})}return a}
const up15=candles('UP'),up1h=candles('UP');
const up=sandbox.predictNextMove({c15:up15,c1h:up1h,mid:up15.at(-1).c,flow:{delta:.35},imbalance:.25,oiChange:.8,fundingPct:0,vwap15:up15.at(-1).c*.998});
ok(up.direction==='LONG'&&up.conviction>=61,'rising multi-horizon price + positive flow/book predicts LONG with material conviction');
const dn15=candles('DOWN'),dn1h=candles('DOWN');
const dn=sandbox.predictNextMove({c15:dn15,c1h:dn1h,mid:dn15.at(-1).c,flow:{delta:-.35},imbalance:-.25,oiChange:.8,fundingPct:0,vwap15:dn15.at(-1).c*1.002});
ok(dn.direction==='SHORT'&&dn.conviction>=61,'falling multi-horizon price + negative flow/book predicts SHORT with material conviction');
const flat15=candles('FLAT'),flat1h=candles('FLAT');
const flat=sandbox.predictNextMove({c15:flat15,c1h:flat1h,mid:flat15.at(-1).c,flow:{delta:0},imbalance:0,oiChange:0,fundingPct:0,vwap15:flat15.at(-1).c});
ok(flat.edgeGap<12,'flat/no-edge synthetic market remains below directional edge threshold');
ok(src.includes("const VERSION = 'NOVARA-SMART-MONEY-AI-V2.20.0-PROBABILISTIC-NEXT-MOVE-ENGINE'"),'version tag V2.20.0 present');
ok(src.includes("const CLEAN_START_ID = 'NOVARA-V2.14.0-ENTRY-SIDE-BTC-GATE-REPAIR-COHORT-2026-10-30'"),'existing paper cohort marker preserved');
ok(src.includes('historical reaction-memory gates DISABLED')&&!src.includes('await refreshGlobalReactionMemory(state, eligible)'),'legacy global reaction-memory scan is not executed');
ok(src.includes('prediction.direction !== s.side')&&src.includes('PREDICTIVE_MIN_CONVICTION'),'predictive direction and conviction gate enforced');
ok(src.includes('predictive: s.predictive || null'),'prediction metadata stored with paper trades');
console.log('ALL V2.20 SYNTHETIC TESTS PASSED');
