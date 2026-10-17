import {solidMemberEnds,memberCutProfile} from './connection-geometry.js';
// V9.8: heel raised to 300 mm so the 150 mm rafter still leaves >=100 mm for a stub (shallower heels are sawn, see test-joint-solids-v98).
// Raised heel: analytical nodes stay fixed; physical solid receives chord-face cuts.
const top={a:[0,0,.30],b:[1,0,1],role:'top',section:[.045,.15]};
const bottom={a:[0,0,0],b:[2,0,0],role:'bottom',section:[.045,.15]};
const heelWeb={a:[0,0,0],b:[0,0,.30],role:'web',section:[.045,.09]};
const t={id:'C01',normal:[0,1],ply:1,members:[top,bottom,heelWeb],connections:[]};const A={trusses:[t]};
for(const m of [top,bottom,heelWeb]){const e=solidMemberEnds(t,m,A);if(Math.hypot(...e.a.map((v,i)=>v-m.a[i]))>1e-8||Math.hypot(...e.b.map((v,i)=>v-m.b[i]))>1e-8)throw Error('analytical node moved');}
const wc=memberCutProfile(t,heelWeb);if(!wc.start||!wc.end)throw Error('heel web face cuts missing');
console.log('heel/chord/web manufacturing cuts OK',wc.start.minus,wc.start.plus,wc.end.minus,wc.end.plus);
