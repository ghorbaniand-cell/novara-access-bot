import assert from 'node:assert/strict';
import { detectParallelChannel } from './novara_channel_engine.mjs';
const c1h=[];
for(let i=0;i<100;i++){
  const center=100+i*.18+Math.sin(i*Math.PI/8)*3;
  c1h.push({o:center-.1,c:center,h:center+5,l:center-5,v:1000});
}
const lower=92+99*.18, upper=108+99*.18;
const base={c1h,atr1h:2,atr15:0.8,mid:100+99*.18,volRatio:1.4,flowDelta:.15,imbalance:.12};
const mk15=(o,h,l,c,po=0,pc=null)=>{const p=pc??c-.1;return [{o:p,h:p+.2,l:p-.2,c:p,v:100},{o:p,h:p+.2,l:p-.2,c:p,v:100},{o,h,l,c,v:180}]};
let r=detectParallelChannel({...base,c15:mk15(lower+.2,lower+1,lower-.1,lower+.7)});
assert.equal(r?.channel?.type,'ASCENDING');
assert.equal(r?.signal?.setup,'CHANNEL_BOUNCE');
// A confirmed breakdown requires a close below the rail, bearish body and participation.
r=detectParallelChannel({...base,c15:mk15(lower+.2,lower+.2,lower-1.2,lower-1,0,lower+.3)});
assert.equal(r?.signal?.setup,'CHANNEL_BREAKDOWN');
// An upper rejection on a descending channel.
const down=[];
for(let i=0;i<100;i++){const center=130-i*.18+Math.sin(i*Math.PI/8)*3;down.push({o:center+.1,c:center,h:center+5,l:center-5,v:1000});}
const dupper=138-99*.18;
r=detectParallelChannel({...base,c1h:down,mid:130-99*.18,c15:mk15(dupper+.2,dupper+0.1,dupper-1,dupper-.7)});
assert.equal(r?.channel?.type,'DESCENDING');
assert.equal(r?.signal?.setup,'CHANNEL_REJECTION');
// A breakout close above the descending upper rail with volume/flow.
r=detectParallelChannel({...base,c1h:down,mid:130-99*.18,c15:mk15(dupper-.2,dupper+1.2,dupper-.2,dupper+1,0,dupper-.3)});
assert.equal(r?.signal?.setup,'CHANNEL_BREAKOUT');
// Wick-only / low-volume fake breakout must not create a trade signal.
r=detectParallelChannel({...base,c1h:down,mid:130-99*.18,volRatio:.7,flowDelta:0,imbalance:0,c15:mk15(dupper-.2,dupper+1.5,dupper-.2,dupper+.05,0,dupper-.3)});
assert.equal(r?.signal,null);
const flat=[]; for(let i=0;i<100;i++){const x=100+Math.sin(i*Math.PI/8)*3;flat.push({o:x-.1,c:x,h:x+5,l:x-5,v:1000});}
r=detectParallelChannel({...base,c1h:flat,mid:100,c15:mk15(100,101,99,100.5)});
assert.equal(r,null);
console.log('NOVARA channel tests passed: ascending bounce/breakdown, descending rejection/breakout, fakeout rejection.');
