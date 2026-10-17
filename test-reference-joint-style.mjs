import {memberCutProfile,memberJointType} from './connection-geometry.js';
const sec=[.045,.15], websec=[.045,.09];
const bottom={role:'bottom',a:[0,0,0],b:[8,0,0],section:sec};
const tl={role:'top',a:[0,0,0],b:[4,0,2.4],section:sec};
const tr={role:'top',a:[4,0,2.4],b:[8,0,0],section:sec};
const w1={role:'web',a:[2,0,0],b:[4,0,2.4],section:websec};
const w2={role:'web',a:[6,0,0],b:[4,0,2.4],section:websec};
const t={normal:[0,1,0],members:[bottom,tl,tr,w1,w2]};
if(memberJointType(t,tl,tl.b)!=='PEAK'||memberJointType(t,tr,tr.a)!=='PEAK') throw Error('peak classification');
for(const tc of [tl,tr]){const c=memberCutProfile(t,tc);const p=tc===tl?c.end:c.start;if(!p||p.kind!=='PEAK_MITER')throw Error('missing shared apex miter');if(!(p.minus*p.plus<=0))throw Error('apex cut must straddle analytical node');}
for(const w of [w1,w2]){const c=memberCutProfile(t,w);if(!c.start||!c.end)throw Error('web must be fitted between BC and TC faces');}
console.log('reference-style envelope/web/apex joints OK');
