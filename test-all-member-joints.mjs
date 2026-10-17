import {memberCutProfile,solidMemberEnds} from './connection-geometry.js';
const sec=[.038,.089];
const m=(role,a,b)=>({role,a,b,section:sec});
// Representative Fink-like truss: BC, two TCs, vertical + diagonals.
const members=[
 m('bottom',[0,0,0],[8,0,0]),
 m('top',[0,0,0],[4,0,2.4]), m('top',[4,0,2.4],[8,0,0]),
 m('web',[4,0,0],[4,0,2.4]), m('web',[2,0,0],[4,0,2.4]), m('web',[6,0,0],[4,0,2.4])
];
const t={id:'T1',normal:[0,1,0],ply:1,members,connections:[]};
const a={trusses:[t]};
for(const x of members){const e=solidMemberEnds(t,x,a);if(e.hidden)throw Error('member hidden');
 if(Math.hypot(...e.a.map((v,i)=>v-x.a[i]))>1e-8||Math.hypot(...e.b.map((v,i)=>v-x.b[i]))>1e-8)throw Error('internal joint centreline was shortened');}
const bc=memberCutProfile(t,members[0]); if(!bc.start||!bc.end)throw Error('BC heel must be sawn to the rafter face');
const leftTC=memberCutProfile(t,members[1]), rightTC=memberCutProfile(t,members[2]);
if(!leftTC.end&&!rightTC.start)throw Error('peak butt cut missing');
const vert=memberCutProfile(t,members[3]); if(!vert.start||!vert.end)throw Error('vertical web chord-face cuts missing');
const diag=memberCutProfile(t,members[4]); if(!diag.start||!diag.end)throw Error('diagonal web chord-face cuts missing');
for(const c of [bc.start,bc.end,leftTC.start,leftTC.end,rightTC.start,rightTC.end,vert.start,vert.end,diag.start,diag.end].filter(Boolean)){
 for(const v of [c.minus,c.plus]) if(!Number.isFinite(v)||Math.abs(v)>.5)throw Error('invalid cut '+v);
}
console.log('all member joint cuts OK');
