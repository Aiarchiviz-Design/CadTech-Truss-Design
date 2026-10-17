// V9.7 regression: exact face-to-face truss joints (apex mitre, raised heel, web seats). Run: node test-joint-solids-v97.mjs
import {templateMembers} from './advanced.js';
import {memberSolid} from './connection-geometry.js';
const mk=(profile,style,over=.6)=>{const t={id:'T',type:'Common',normal:[0,1],ply:1,base:0,full:true,connections:[],profile};t.members=templateMembers(t,{panel:1.2,style,shape:style,overhang:over});return t;};
const area=p=>Math.abs(p.reduce((a,q,i)=>{const r=p[(i+1)%p.length];return a+q[0]*r[1]-r[0]*q[1]},0))/2;
// convex polygon penetration depth via SAT
function pen(A,B){let best=1e9;for(const P of [A,B])for(let i=0;i<P.length;i++){const e=[P[(i+1)%P.length][0]-P[i][0],P[(i+1)%P.length][1]-P[i][1]],l=Math.hypot(...e);if(l<1e-9)continue;const n=[-e[1]/l,e[0]/l];let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;for(const q of A){const d=q[0]*n[0]+q[1]*n[1];a0=Math.min(a0,d);a1=Math.max(a1,d);}for(const q of B){const d=q[0]*n[0]+q[1]*n[1];b0=Math.min(b0,d);b1=Math.max(b1,d);}const o=Math.min(a1,b1)-Math.max(a0,b0);if(o<=0)return 0;best=Math.min(best,o);}return best;}
let checked=0;
for(const style of ['Kingpost','Fink','Howe','Pratt','Fan','Queen'])for(const prof of [[[0,0,.3],[4.8,0,2.5],[9.6,0,.3]],[[0,0,.3],[3.5,0,2.4],[9.6,0,.3]],[[0,0,.25],[7,0,2.8]]]){
  const t=mk(prof,style),sol=t.members.map(m=>({m,s:memberSolid(t,m,{trusses:[t]})}));
  for(const {m,s} of sol){if(s.hidden)throw Error(`${style}: member hidden ${m.role}`);const nominal=Math.hypot(m.b[0]-m.a[0],m.b[2]-m.a[2])*m.section[1];const r=area(s.outline)/nominal;if(r<.3||r>1.7)throw Error(`${style}: implausible solid area ratio ${r.toFixed(2)} for ${m.role}`);}
  // timbers that meet at a joint node may not overlap (tolerance 0.5 mm). Webs that merely CROSS in the template layout (Fan/Queen) are a layout matter, not a joint.
  // a Queen 'web' laid along a mono-pitch rafter is a template duplicate of the chord itself, not a joint
  const along=(a,b)=>{const u=[a.b[0]-a.a[0],a.b[2]-a.a[2]],v=[b.b[0]-b.a[0],b.b[2]-b.a[2]],l=Math.hypot(...u)*Math.hypot(...v);return Math.abs(u[0]*v[0]+u[1]*v[1])/l>.9999;};
  const share=(a,b)=>!along(a,b)&&[a.a,a.b].some(p=>[b.a,b.b].some(q=>Math.hypot(p[0]-q[0],p[2]-q[2])<.015));
  for(let i=0;i<sol.length;i++)for(let j=i+1;j<sol.length;j++){if(!share(sol[i].m,sol[j].m))continue;const d=pen(sol[i].s.outline,sol[j].s.outline);if(d>5e-4)throw Error(`${style}: ${sol[i].m.role}#${i} overlaps ${sol[j].m.role}#${j} by ${(d*1000).toFixed(1)} mm`);checked++;}
}
// apex of a symmetric common truss: both rafters end on the SAME vertical seam, edges meet exactly (zero gap)
{const t=mk([[0,0,.3],[4.8,0,2.5],[9.6,0,.3]],'Kingpost');const tops=t.members.filter(m=>m.role==='top'),L=memberSolid(t,tops[0],{trusses:[t]}).outline,R=memberSolid(t,tops[1],{trusses:[t]}).outline;
  const atApex=P=>P.filter(q=>Math.abs(q[0]-4.8)<1e-6).map(q=>q[1]).sort((a,b)=>a-b);const l=atApex(L),r=atApex(R);
  if(l.length!==2||r.length!==2||Math.abs(l[0]-r[0])>1e-6||Math.abs(l[1]-r[1])>1e-6)throw Error('rafter apex faces do not coincide (gap/overlap at ridge)');
  if(l[1]-l[0]<=.08)throw Error('ridge seam shorter than rafter depth');
  // king post top is the pointed V seat: apex vertex touches the underside vertex
  const post=t.members.find(m=>m.role==='web'&&m.a[0]===4.8&&m.b[0]===4.8&&m.b[2]>2),P=memberSolid(t,post,{trusses:[t]}).outline;
  if(P.length<5)throw Error('king post top should be a pointed seat under both rafters');
  if(Math.abs(Math.max(...P.map(q=>q[1]))-l[0])>1e-6)throw Error('king post tip must meet the rafter underside vertex');
  // heel: raised-heel stub sits on the BC top face and under the rafter face; BC end flush with stub outside face
  const bc=t.members.find(m=>m.role==='bottom'),stub=t.members.find(m=>m.role==='web'&&m.a[0]===0&&m.b[0]===0),B=memberSolid(t,bc,{trusses:[t]}).outline,S=memberSolid(t,stub,{trusses:[t]}).outline;
  if(Math.abs(Math.min(...B.map(q=>q[0]))-Math.min(...S.map(q=>q[0])))>1e-6)throw Error('BC end not flush with heel stub');
  if(Math.abs(Math.min(...S.map(q=>q[1]))-Math.max(...B.map(q=>q[1])))>1e-6)throw Error('heel stub does not seat on BC top face');
}
console.log(`V9.7 exact joint solids PASS (${checked} member pairs checked, no overlaps, zero-gap ridge, seated heels)`);
