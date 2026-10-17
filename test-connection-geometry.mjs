import {solidMemberEnds} from './connection-geometry.js';
const receiver={id:'G01',normal:[1,0],ply:1,members:[{section:[.045,.15]}]};
const jack={id:'SJ01',connections:[{to:'G01',point:[0,0,1]}]};
const m={a:[-1,0,0],b:[0,0,1]};
const r=solidMemberEnds(jack,m,{trusses:[jack,receiver]},0);
if(!r.trimmed) throw Error('expected trim');
if(!(r.b[0] < 0 && r.b[0] > -.05)) throw Error('unexpected receiver-face setback '+JSON.stringify(r));
console.log('connection face trim OK',r.setback.toFixed(5));
