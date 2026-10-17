// V9.8 regression: (1) overhang top face == top-chord top face after resizing; (2) deep rafter heel is sawn, no sliver stub. Run: node test-joint-solids-v98.mjs
import {templateMembers} from './advanced.js';
import {memberSolid} from './connection-geometry.js';
const prof=[[0,0,.25],[4.8,0,2.5],[9.6,0,.25]]; // 250 mm raised heel (app default)
const mk=(topD,topB=.0381)=>{const t={id:'T',type:'Common',normal:[0,1],ply:1,base:0,full:true,connections:[],profile:prof};t.members=templateMembers(t,{panel:1.2,style:'Fink',shape:'Fink',overhang:.6});
  for(const m of t.members)if(m.role==='top')m.section=[topB,topD];return t;}; // NOTE: overhang deliberately left at the default 2x4 (the old bug)
const solid=(t,m)=>memberSolid(t,m,{trusses:[t]});
// (1) top faces coincide at the overhang/top-chord joint, and thickness follows the chord
for(const D of [.1397,.1842,.2857]){
  const t=mk(D,.0445),top=t.members.find(m=>m.role==='top'),oh=t.members.find(m=>m.role==='overhang');
  const T=solid(t,top).outline,O=solid(t,oh).outline;
  const edge=P=>{const n=[top.b[0]-top.a[0],top.b[2]-top.a[2]],l=Math.hypot(...n),u=[n[0]/l,n[1]/l],v=[-u[1],u[0]];return Math.max(...P.map(q=>q[0]*v[0]+q[1]*v[1]));}; // highest offset across the chord axis
  if(Math.abs(edge(T)-edge(O))>1e-6)throw Error(`overhang top face differs from top chord by ${(Math.abs(edge(T)-edge(O))*1000).toFixed(2)} mm (2x${D})`);
  const so=solid(t,oh);if(Math.abs((so.hi-so.lo)-.0445)>1e-9)throw Error('overhang thickness must follow the top chord');
}
// (2) deep rafter: stub dropped, BC sawn flush to the rafter underside (no sliver hook); normal rafter keeps its stub
for(const [D,expectStub] of [[.0889,true],[.1397,true],[.2349,false],[.2857,false]]){
  const t=mk(D),stub=t.members.find(m=>m.role==='web'&&m.a[0]===0&&m.b[0]===0),bc=t.members.find(m=>m.role==='bottom');
  const S=solid(t,stub);if(expectStub===S.hidden)throw Error(`2x${D}: heel stub ${S.hidden?'missing':'should have been replaced by a sawn heel'}`);
  if(!expectStub){const B=solid(t,bc).outline,r=t.members.find(m=>m.role==='top');
    // BC top-left vertex must lie on the rafter underside line
    const u=[r.b[0]-r.a[0],r.b[2]-r.a[2]],l=Math.hypot(...u),n=[-u[1]/l,u[0]/l],c=[r.a[0],r.a[2]],off=q=>(q[0]-c[0])*n[0]+(q[1]-c[1])*n[1];
    const hit=B.filter(q=>Math.abs(off(q)+D/2)<1e-6);if(hit.length<2)throw Error(`2x${D}: bottom chord end not sawn to rafter underside`);}
}
console.log('V9.8 overhang alignment + shallow-heel regression PASS');
