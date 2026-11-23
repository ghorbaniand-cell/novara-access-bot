// NOVARA channel engine: confirmed pivots only; no future candle data is used.
const num = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function regression(points) {
  if (points.length < 2) return null;
  const mx=points.reduce((s,p)=>s+p.x,0)/points.length, my=points.reduce((s,p)=>s+p.y,0)/points.length;
  const den=points.reduce((s,p)=>s+(p.x-mx)**2,0);
  if (!den) return null;
  const slope=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/den;
  const intercept=my-slope*mx;
  const ssTot=points.reduce((s,p)=>s+(p.y-my)**2,0);
  const ssRes=points.reduce((s,p)=>s+(p.y-(intercept+slope*p.x))**2,0);
  return {slope,intercept,r2:ssTot>0?1-ssRes/ssTot:1};
}
function pivots(candles, side, left=2, right=2) {
  const out=[];
  for(let i=left;i<candles.length-right;i++) {
    const v=side==='high'?candles[i].h:candles[i].l;
    let ok=true;
    for(let j=i-left;j<=i+right;j++) if(j!==i && (side==='high'?candles[j].h>=v:candles[j].l<=v)){ok=false;break;}
    if(ok) out.push({x:i,y:v});
  }
  return out;
}
export function detectParallelChannel({c1h,c15,atr1h,atr15,mid,volRatio=0,flowDelta=0,imbalance=0}) {
  if(!Array.isArray(c1h)||c1h.length<35||!Array.isArray(c15)||c15.length<3||!(mid>0)) return null;
  const bars=c1h.slice(-90), offset=c1h.length-bars.length;
  const highs=pivots(bars,'high').map(p=>({...p,x:p.x+offset})).slice(-8);
  const lows=pivots(bars,'low').map(p=>({...p,x:p.x+offset})).slice(-8);
  if(highs.length<2||lows.length<2) return null;
  const hi=regression(highs), lo=regression(lows); if(!hi||!lo) return null;
  const lastX=c1h.length-1, upper=hi.intercept+hi.slope*lastX, lower=lo.intercept+lo.slope*lastX;
  const width=upper-lower, a1=Math.max(num(atr1h),mid*.002);
  if(!(width>1.8*a1&&width<mid*.15)) return null;
  const slopeGap=Math.abs(hi.slope-lo.slope);
  if(slopeGap>Math.max(a1*.10,Math.abs((hi.slope+lo.slope)/2)*.65)) return null;
  const meanSlope=(hi.slope+lo.slope)/2;
  const totalMove=Math.abs(meanSlope)*Math.min(60,bars.length);
  if(totalMove<a1*.65) return null;
  const type=meanSlope>0?'ASCENDING':'DESCENDING';
  const tol=Math.max(a1*.55,mid*.0025);
  const touchCount=(pts,fit)=>pts.filter(p=>Math.abs(p.y-(fit.intercept+fit.slope*p.x))<=tol).length;
  const upperTouches=touchCount(highs,hi), lowerTouches=touchCount(lows,lo);
  if(upperTouches<2||lowerTouches<2||Math.min(hi.r2,lo.r2)<.45) return null;
  const upperNow=upper, lowerNow=lower, last=c15.at(-1), prev=c15.at(-2);
  const a15=Math.max(num(atr15),mid*.001);
  const candleRange=Math.max(0,last.h-last.l), bodyFrac=candleRange>0?Math.abs(last.c-last.o)/candleRange:0;
  const bullish=last.c>last.o, bearish=last.c<last.o;
  const alignedFlowLong=flowDelta>.06||imbalance>.08, alignedFlowShort=flowDelta<-.06||imbalance<-.08;
  const volOk=num(volRatio)>=1.05;
  const lowerTouch=last.l<=lowerNow+a15*.45 && last.c>lowerNow+a15*.05 && bullish && bodyFrac>=.25;
  const upperReject=last.h>=upperNow-a15*.45 && last.c<upperNow-a15*.05 && bearish && bodyFrac>=.25;
  const lowerBreak=last.c<lowerNow-a15*.25 && prev.c>=lowerNow-a15*.10 && bearish && bodyFrac>=.55 && (volOk||alignedFlowShort);
  const upperBreak=last.c>upperNow+a15*.25 && prev.c<=upperNow+a15*.10 && bullish && bodyFrac>=.55 && (volOk||alignedFlowLong);
  let side=null, setup=null, triggerLevel=null, confirmation='';
  if(type==='ASCENDING'&&lowerBreak){side='SHORT';setup='CHANNEL_BREAKDOWN';triggerLevel=lowerNow;confirmation='15m close below lower rail + volume/order-flow confirmation';}
  else if(type==='ASCENDING'&&lowerTouch&&(alignedFlowLong||volOk)){side='LONG';setup='CHANNEL_BOUNCE';triggerLevel=lowerNow;confirmation='15m lower-rail rejection and bullish reclaim + flow/volume';}
  else if(type==='DESCENDING'&&upperBreak){side='LONG';setup='CHANNEL_BREAKOUT';triggerLevel=upperNow;confirmation='15m close above upper rail + volume/order-flow confirmation';}
  else if(type==='DESCENDING'&&upperReject&&(alignedFlowShort||volOk)){side='SHORT';setup='CHANNEL_REJECTION';triggerLevel=upperNow;confirmation='15m upper-rail rejection and bearish reclaim + flow/volume';}
  if(!side) return {channel:{type,upper:upperNow,lower:lowerNow,slope:meanSlope,upperTouches,lowerTouches,r2:Math.min(hi.r2,lo.r2),width},signal:null};
  return {channel:{type,upper:upperNow,lower:lowerNow,slope:meanSlope,upperTouches,lowerTouches,r2:Math.min(hi.r2,lo.r2),width},signal:{side,setup,triggerLevel,confirmation,volOk,flowAligned:side==='LONG'?alignedFlowLong:alignedFlowShort}};
}
