import {memberCutProfile,memberJointType} from './connection-geometry.js';
const bc={role:'bottom',section:[.045,.09],a:[0,0,0],b:[10,0,0]};
const tl={role:'top',section:[.045,.14],a:[-.6,0,-.25],b:[5,0,3]};
const tr={role:'top',section:[.045,.14],a:[5,0,3],b:[10.6,0,-.25]};
const vl={role:'web',section:[.045,.09],a:[0,0,0],b:[2.2,0,1.43]};
const vr={role:'web',section:[.045,.09],a:[7.8,0,1.43],b:[10,0,0]};
const king={role:'web',section:[.045,.09],a:[5,0,0],b:[5,0,3]};
const t={normal:[0,1],members:[bc,tl,tr,vl,vr,king]};
for(const tc of [tl,tr]){const c=memberCutProfile(t,tc);const x=tc===tl?c.end:c.start;if(!x||x.kind!=='PEAK_MITER')throw Error('peak miter missing');if(!(Math.min(x.minus,x.plus)<0&&Math.max(x.minus,x.plus)>0))throw Error('ridge miter must straddle apex for zero-gap seam');}
const b=memberCutProfile(t,bc);if(!b.start||!b.end)throw Error('BC heel must be face-cut to top chord');
const kc=memberCutProfile(t,king);if(!kc.start||!kc.end)throw Error('king post must be face-fit at both ends');
console.log('V9.6 zero-gap ridge, face-cut heels and web seating: PASS');
