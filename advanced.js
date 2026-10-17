import {catalog,analyze} from './engine.js';
export const SHAPES=['Kingpost','Simple Fink','Queen','Fink','Howe','Fan','Modified Queen','Double Fink','Double Howe','Common','Gable','Dual Ridge','Scissor','Hip Scissor','Mono Scissor','Mono','Dropped Mono Gable','Dual Ridge Mono','Cathedral','Hip Cathedral','Mono Cathedral','Symmetrical Cathedral','Non-Symmetrical Cathedral','Cambered','Cambered Hip','Cathedral Tray','Dual Pitch','California Hip','California Hip Cathedral','California Hip Tray','California Mono Hip','California Hip Scissor','California Hip Studio Vault','California Hip Cambered','Tall Bearing Cathedral','Tall Bearing','Polynesian','Polynesian Hip','Porch','Stepdown Hip','Mono Stepdown Hip','Stepdown Hip 2','Studio Vault','Attic','Attic Hip','Gambrel','Gambrel Attic','Flat','Sloping Flat','Parallel Chord Scissor','Parallel Chord Mono','Parapet','Sloping Parapet',"Mac's Parapet",'Tray','Hip Tray','Common Coffer','Hip Coffer','Scissor with Offset Bearing','Cathedral with Offset Bearing','Cape','Common with Offset Bearing','Hip with Offset Bearing','Bow','Barrel','Bow Barrel','Common Cap','Hip Cap','Mono Cap','Mono Hip Cap','Inverted'];
export const WEB_STYLES=['Fink','Howe','Pratt','Fan','Warren','Queen','Kingpost'];
export function shapeWeb(s){return WEB_STYLES.find(w=>s.toLowerCase().includes(w.toLowerCase()))||'Fink';}
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),lerp=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
// V9.9.3: no overhang where two eaves meet. The tail is skipped when, within its own length, it would run into another truss
// or cross the tail of another truss (re-entrant eave corner / eave end against a perpendicular truss).
function eaveClash(t,end,overhang){
  const hits=t?.eaveHits?.[end]||[],own=overhang*(t?.eavePf?.[end]||1),M=.05;
  return hits.some(h=>h.kind==='body'?h.d<=own+M:h.d<=own+M&&h.rd<=overhang*(h.rpf||1)+M);
}
export function templateMembers(t,{panel=1.2,style='Fink',shape='Fink',overhang=0}={}){
 const top=[];for(let i=1;i<t.profile.length;i++){const a=t.profile[i-1],b=t.profile[i],n=style==='Kingpost'?1:Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/panel));if(i===1)top.push(a);for(let j=1;j<=n;j++)top.push(lerp(a,b,j/n));}
 const crossings=[];for(let i=1;i<t.profile.length;i++){const a=t.profile[i-1],b=t.profile[i],da=a[2]-t.base,db=b[2]-t.base;if(Math.abs(da)<1e-7)crossings.push([...a]);if(da*db<0||Math.abs(db)<1e-7){const den=b[2]-a[2];if(Math.abs(den)>1e-9){const frac=(t.base-a[2])/den;if(frac>=0&&frac<=1)crossings.push(lerp(a,b,frac));}}}
 const uniq=[];for(const p of crossings)if(!uniq.some(q=>distance(p,q)<.005))uniq.push(p);
 let innerTop=top;
 if(uniq.length>=2){
   let h0=[...uniq[0]], h1=[...uniq.at(-1)];
   const axis=[top.at(-1)[0]-top[0][0],top.at(-1)[1]-top[0][1]], L=Math.hypot(...axis)||1, u=[axis[0]/L,axis[1]/L];
   const sc=p=>(p[0]-top[0][0])*u[0]+(p[1]-top[0][1])*u[1];
   if(sc(h0)>sc(h1))[h0,h1]=[h1,h0];
   const s0=sc(h0),s1=sc(h1);
   if(s1-s0>.01){
     innerTop=[h0,...top.filter(p=>{const s=sc(p);return s>s0+.005&&s<s1-.005;}),h1];
   }
 }
 const bot=innerTop.map(p=>[p[0],p[1],t.base]),ms=[],seen=new Set(),add=(a,b,role)=>{const L=distance(a,b);if(L<.005)return;const k=[a.map(x=>x.toFixed(5)).join(','),b.map(x=>x.toFixed(5)).join(',')].sort().join('/');if(seen.has(k))return;seen.add(k);ms.push({a:[...a],b:[...b],role,length:L,section:[.0381,.0889],sectionName:'2x4',material:'timber',thickness:.0381});};
 for(let i=0;i<top.length-1;i++)add(top[i],top[i+1],'top');
 const bn=bot.length-1,bmid=Math.floor(bn/2);
 for(let i=0;i<bn;i++){add(bot[i],bot[i+1],'bottom');let down=style==='Howe'?i>=bn/2:style==='Pratt'?i<bn/2:style==='Fink'?Math.floor(i/2)%2===0:i%2===0;add(down?innerTop[i]:bot[i],down?bot[i+1]:innerTop[i+1],'web');}
 for(let i=0;i<=bn;i++)add(bot[i],innerTop[i],'web');
 if(style==='Fan')for(let i=1;i<bn;i++)add(bot[bmid],innerTop[i],'web');
 if(style==='Queen'&&bn>=3)add(innerTop[Math.floor(bn/3)],innerTop[Math.ceil(2*bn/3)],'web');
 if(overhang>0){const ends=t.full?[0,top.length-1]:[top[0][2]<top.at(-1)[2]?0:top.length-1];for(const i of ends){const inner=top[i===0?1:top.length-2],p=top[i],vx=p[0]-inner[0],vy=p[1]-inner[1],run=Math.hypot(vx,vy);if(run>.001&&!eaveClash(t,i===0?0:1,overhang)){const planFactor=t.type==='Hip carrier'?1/Math.max(Math.abs(vx/run),Math.abs(vy/run),.35):1,tail=overhang*planFactor;add(p,p.map((x,k)=>x+(x-inner[k])*tail/run),'overhang');}}}
 return ms;
}
export const woodCatalog=[3.5,5.5,7.25,9.25,11.25].map((d,i)=>{const b=38.1,h=d*25.4,A=b*h;return {name:['2x4','2x6','2x8','2x10','2x12'][i],A,I:h*b**3/12,kgm:A*.0005,E:1600000*.006894757,b,d:h};});
export const MEMBER_SIZE_LADDER = [
 {size:0,ply:1},{size:0,ply:2},{size:1,ply:1},{size:1,ply:2},{size:1,ply:3},
 {size:2,ply:1},{size:2,ply:2},{size:2,ply:3},{size:3,ply:1},{size:3,ply:2},{size:3,ply:3},
 {size:4,ply:1},{size:4,ply:2},{size:4,ply:3},{size:4,ply:4},{size:4,ply:5}
];

import {analyzeAssemblyTruss} from './advanced-features.js';
export {analyzeAssemblyTruss};
export function parametricRoof(p) {
  const w = p.width || 9.144, l = p.length || 7.62;
  return {
    axes: [{ a: [0,0,0], b: [w,0,2] }],
    bounds: [w, l],
    meshes: []
  };
}
export function dxfSegments(text) {
  return [];
}
export function exportDXF(assembly) {
  return '';
}
