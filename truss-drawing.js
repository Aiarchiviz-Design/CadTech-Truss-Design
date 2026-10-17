// CadTech truss shop-drawing elevation (V9.9.5)
// Lumber is drawn with the SAME cut outlines as the 3D model (flush heel cuts, seated webs, full end studs), connector plates are
// shown at the joints, and dimensions follow the shop-drawing method: panel points, overhang | bearing span | overhang, overall
// width, end heights, member call-outs with section, pitch marker and member marks that tie to the member schedule.
import {trussFrameGeometry} from './connection-geometry.js';
import {boardRuns} from './takeoff.js';

const WOOD='0.96 0.91 0.78',WOOD_EDGE='0.22 0.15 0.07',PLATE='0.86 0.88 0.90',PLATE_EDGE='0.30 0.33 0.37',DIM='0.10 0.12 0.14',BLUE='0.06 0.28 0.46';
const deg=r=>r*180/Math.PI;
const sectionOf=(t,m,i)=>m.sectionName||t.analysis?.members?.find(x=>x.index===i)?.size||'2x4';
const num=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'--';

// ---- board-level member schedule (marks tie to the drawing) ---------------------------------------------------------------
function endAngles(polys,first){
  // cut angle of each end measured from a square cut (0 = square), from the actual cut outline
  const nrm=[-first.u[1],first.u[0]],out=[];
  for(const sign of [-1,1]){
    let best=null;
    for(const poly of polys)poly.forEach((q,i)=>{const t=(q[0]-first.A[0])*first.u[0]+(q[1]-first.A[1])*first.u[1],v=sign*t;if(!best||v>best.v+1e-9)best={v,t,poly,i,q};});
    if(!best){out.push({a:0,q:[0,0]});continue;}
    const n=best.poly.length,nb=[best.poly[(best.i+n-1)%n],best.poly[(best.i+1)%n]].map(p=>({p,v:sign*((p[0]-first.A[0])*first.u[0]+(p[1]-first.A[1])*first.u[1])})).sort((x,y)=>y.v-x.v)[0].p;
    const e=[best.q[0]-nb[0],best.q[1]-nb[1]],dt=e[0]*first.u[0]+e[1]*first.u[1],dn=e[0]*nrm[0]+e[1]*nrm[1];
    out.push({a:Math.hypot(dt,dn)<1e-6?0:deg(Math.atan2(Math.abs(dt),Math.abs(dn))),q:best.q,t:best.t});
  }
  return out;
}
export function trussSchedule(t,assembly,G=trussFrameGeometry(t,assembly)){
  const byIndex=new Map(G.members.map(x=>[x.index,x])),a=t.analysis,counters={top:0,bottom:0,web:0},rows=[];
  for(const {idx,group} of boardRuns(t)){
    const ms=idx.map(i=>byIndex.get(i)).filter(x=>x&&!x.hidden);if(!ms.length)continue;
    const first=ms[0],polys=ms.map(x=>x.outline);let lo=Infinity,hi=-Infinity;
    for(const p of polys)for(const q of p){const s=(q[0]-first.A[0])*first.u[0]+(q[1]-first.A[1])*first.u[1];if(s<lo)lo=s;if(s>hi)hi=s;}
    const [e0,e1]=endAngles(polys,first);
    // end A = left (lower for studs), end B = right (upper)
    const ends=[e0,e1].sort((p,q)=>p.q[0]-q.q[0]||p.q[1]-q.q[1]);
    const res=idx.map(i=>a?.members?.find(x=>x.index===i)).filter(Boolean).sort((p,q)=>(q.ratio||0)-(p.ratio||0))[0];
    counters[group]=(counters[group]||0)+1;
    rows.push({mark:`${group==='top'?'TC':group==='bottom'?'BC':'W'}${counters[group]}`,role:group,idx,members:ms,section:sectionOf(t,t.members[idx[0]],idx[0]),
      ply:Math.max(1,Number(a?.ply||t.ply)||1),cutM:hi-lo,angA:ends[0].a,angB:ends[1].a,force:res?.force,ratio:res?.ratio,governing:res?.governing,
      overhang:idx.some(i=>t.members[i].role==='overhang')});
  }
  return rows;
}

// ---- drawing -------------------------------------------------------------------------------------------------------------
function vertExtent(poly,x){ // [zmin,zmax] of a polygon along the vertical line at x (or null)
  let lo=Infinity,hi=-Infinity;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
    if((a[0]-x)*(b[0]-x)>0)continue;if(Math.abs(b[0]-a[0])<1e-9){lo=Math.min(lo,a[1],b[1]);hi=Math.max(hi,a[1],b[1]);continue;}
    const z=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);lo=Math.min(lo,z);hi=Math.max(hi,z);}
  return hi>lo-1e-12&&Number.isFinite(lo)?[lo,hi]:null;
}
// Height the elevation needs for a given width (flat trusses need far less than tall ones): lets the report keep pages tight.
export function elevationHeight(t,assembly,width,maxH=340,G=trussFrameGeometry(t,assembly)){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const x of G.members)if(!x.hidden)for(const q of x.outline){minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minZ=Math.min(minZ,q[1]);maxZ=Math.max(maxZ,q[1]);}
  if(!(maxX>minX))return maxH;const W=maxX-minX,H=Math.max(maxZ-minZ,.01),sc=Math.min((width-132)/W,(maxH-148)/H);
  return Math.min(maxH,Math.max(200,148+H*sc+10));
}
export function drawTrussElevation(api,t,assembly,rect,opts={}){
  const {c,text,line,dim,dimShort}=api,G=opts.geometry||trussFrameGeometry(t,assembly),rows=opts.schedule||trussSchedule(t,assembly,G);
  const M=G.members.filter(x=>!x.hidden&&x.outline.length>=3);if(!M.length)return null;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const x of M)for(const q of x.outline){if(q[0]<minX)minX=q[0];if(q[0]>maxX)maxX=q[0];if(q[1]<minZ)minZ=q[1];if(q[1]>maxZ)maxZ=q[1];}
  const W=Math.max(maxX-minX,.01),H=Math.max(maxZ-minZ,.01),ML=66,MR=66,MB=92,MT=56;
  const aw=rect.w-ML-MR,ah=rect.h-MB-MT,sc=Math.min(aw/W,ah/H),ox=rect.x+ML+(aw-W*sc)/2,oy=rect.y+MB+(ah-H*sc)/2;
  const P=(x,z)=>[ox+(x-minX)*sc,oy+(z-minZ)*sc],tw=(s,size,bold=false)=>String(s).length*size*(bold?.6:.53);
  const f2=n=>Number(n).toFixed(2);
  const poly=(pts,fill,stroke,w)=>c.push(`${fill} rg ${stroke} RG ${w} w ${pts.map((q,i)=>`${f2(q[0])} ${f2(q[1])} ${i?'l':'m'}`).join(' ')} h B`);
  const arrow=(x,y,ux,uy,len=4.4,w=1.4)=>c.push(`${DIM} rg ${f2(x)} ${f2(y)} m ${f2(x-ux*len-uy*w)} ${f2(y-uy*len+ux*w)} l ${f2(x-ux*len+uy*w)} ${f2(y-uy*len-ux*w)} l h f`);
  const ln=(x1,y1,x2,y2,w=.4,col=DIM)=>line(x1,y1,x2,y2,w,col);

  // 1 lumber -----------------------------------------------------------------------------------------------------------------
  const order={bottom:0,top:1,overhang:1,web:2};
  for(const x of [...M].sort((p,q)=>(order[p.role]??2)-(order[q.role]??2)))poly(x.outline.map(q=>P(q[0],q[1])),WOOD,WOOD_EDGE,.7);

  // 2 joints / connector plates (schematic) ---------------------------------------------------------------------------------
  const nodes=[];const addNode=(p,mi)=>{let n=nodes.find(q=>Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<.008);if(!n){n={p:[p[0],p[1]],ms:new Set()};nodes.push(n);}n.ms.add(mi);};
  M.forEach((x,i)=>{addNode(x.A,i);addNode(x.B,i);});
  const plates=[];
  for(const n of nodes){
    const ms=[...n.ms].map(i=>M[i]);if(ms.length<2)continue;
    const dirs=ms.map(x=>{const o=Math.hypot(x.A[0]-n.p[0],x.A[1]-n.p[1])<.008?x.B:x.A,dx=o[0]-n.p[0],dz=o[1]-n.p[1],L=Math.hypot(dx,dz)||1;return [dx/L,dz/L];});
    if(ms.length===2&&Math.abs(dirs[0][0]*dirs[1][1]-dirs[0][1]*dirs[1][0])<.02&&dirs[0][0]*dirs[1][0]+dirs[0][1]*dirs[1][1]<0)continue;   // continuous chord: no joint
    // plates are smaller than the wood: 78% of the chord depth across the chord, about 1.45 x the chord depth along it
    const chords=ms.filter(x=>x.role==='bottom'||x.role==='top'||x.role==='overhang'),dRef=(chords.length?chords:ms).reduce((m,x)=>Math.max(m,x.d),0);
    const bot=ms.some(x=>x.role==='bottom'),topM=ms.find(x=>x.role==='top'||x.role==='overhang');
    const ang=bot?0:topM?Math.atan2(topM.B[1]-topM.A[1],topM.B[0]-topM.A[0]):0,ca=Math.cos(ang),sa=Math.sin(ang),hw=dRef*1.45*sc/2,hh=dRef*.78*sc/2,cp=P(n.p[0],n.p[1]);
    const R=(u,v)=>[cp[0]+u*ca-v*sa,cp[1]+u*sa+v*ca];
    plates.push({cp,pts:[R(-hw,-hh),R(hw,-hh),R(hw,hh),R(-hw,hh)],ang});
  }
  for(const p of plates){poly(p.pts,PLATE,PLATE_EDGE,.6);
    const [a,b,cc,d]=p.pts,m=(u,v,k)=>[u[0]+(v[0]-u[0])*k,u[1]+(v[1]-u[1])*k];   // fastener grid hint
    for(const k of [.25,.5,.75]){const s1=m(a,b,k),s2=m(d,cc,k);ln(s1[0],s1[1],s2[0],s2[1],.18,'0.62 0.66 0.70');}}

  // 3 dimensions --------------------------------------------------------------------------------------------------------------
  const bottoms=M.filter(x=>x.role==='bottom'),zb=bottoms.length?Math.min(...bottoms.flatMap(x=>x.outline.map(q=>q[1]))):minZ,yBase=P(0,minZ)[1];
  const lowAt=x=>{let z=Infinity;for(const m of M)for(const q of m.outline)if(Math.abs(q[0]-x)<.012&&q[1]<z)z=q[1];return Number.isFinite(z)?z:zb;};
  const dimH=(x1,x2,yL,label,y1,y2,k=0,size=5.8)=>{
    if(x2-x1<.5)return;ln(x1,y1-2,x1,yL-3);ln(x2,y2-2,x2,yL-3);ln(x1,yL,x2,yL,.45);
    if(x2-x1>11){arrow(x1,yL,-1,0);arrow(x2,yL,1,0);}else{ln(x1-3,yL-2,x1+3,yL+2,.6);ln(x2-3,yL-2,x2+3,yL+2,.6);}
    const w=tw(label,size,true);if(w+6<=x2-x1)text(label,(x1+x2)/2-w/2,yL+2.4,size,DIM,'F2');else text(label,(x1+x2)/2-w/2,yL+2.4+(k%2)*(size+.8),size,DIM,'F2');};
  const dimV=(y1,y2,xL,label,x1,x2,side,size=6.2)=>{
    ln(x1+side*2,y1,xL-side*3,y1);ln(x2+side*2,y2,xL-side*3,y2);ln(xL,y1,xL,y2,.45);arrow(xL,y1,0,-1);arrow(xL,y2,0,1);
    const w=tw(label,size,true),ymid=(y1+y2)/2;
    if(w+6<=Math.abs(y2-y1)){const xt=side<0?xL-2.6:xL+2.6+size*.72;
      c.push(`BT /F2 ${size} Tf ${DIM} rg 0 1 -1 0 ${f2(xt)} ${f2(ymid-w/2)} Tm (${String(label).replace(/[\\()]/g,'\\$&')}) Tj ET`);}
    else text(label,side<0?xL-w-4:xL+4,ymid-size*.35,size,DIM,'F2');};
  const nodeXs=(roleFilter)=>[...new Set(nodes.filter(n=>[...n.ms].some(i=>roleFilter(M[i]))).map(n=>Math.round(n.p[0]*1000)/1000))].sort((a,b)=>a-b);
  const bx=nodeXs(x=>x.role==='bottom'),s1=yBase-17,s2=yBase-34,s3=yBase-51;
  if(bx.length>=3)for(let i=0;i<bx.length-1;i++)dimH(P(bx[i],0)[0],P(bx[i+1],0)[0],s1,dim(bx[i+1]-bx[i]),P(bx[i],zb)[1],P(bx[i+1],zb)[1],i);
  const pb=[t.profile[0],t.profile.at(-1)].map(p=>G.project(p)[0]).sort((a,b)=>a-b),b0=Math.max(minX,pb[0]),b1=Math.min(maxX,pb[1]);
  const segs=[[minX,b0],[b0,b1],[b1,maxX]].filter(s=>s[1]-s[0]>.004);
  segs.forEach((s,i)=>dimH(P(s[0],0)[0],P(s[1],0)[0],s2,dim(s[1]-s[0]),P(0,lowAt(s[0]))[1],P(0,lowAt(s[1]))[1],i));
  dimH(P(minX,0)[0],P(maxX,0)[0],s3,'OVERALL  '+dim(maxX-minX),P(0,lowAt(minX))[1],P(0,lowAt(maxX))[1],0,6.8);
  const topAt=x=>{let z=-Infinity;for(const m of M){const e=vertExtent(m.outline,x);if(e&&e[1]>z)z=e[1];}return Number.isFinite(z)?z:maxZ;};
  const yTopLeft=topAt(b0+.001),yTopRight=topAt(b1-.001);
  dimV(P(0,zb)[1],P(0,maxZ)[1],P(minX,0)[0]-34,dim(maxZ-zb),P(minX,0)[0]-3,P(minX,0)[0]-3,-1,6.4);
  if(Math.abs(yTopLeft-maxZ)>.02)dimV(P(0,zb)[1],P(0,yTopLeft)[1],P(minX,0)[0]-13,dim(yTopLeft-zb),P(minX,0)[0]-3,P(minX,0)[0]-3,-1,5.8);
  if(Math.abs(yTopRight-yTopLeft)>.02||Math.abs(yTopRight-maxZ)>.02)dimV(P(0,zb)[1],P(0,yTopRight)[1],P(maxX,0)[0]+16,dim(yTopRight-zb),P(maxX,0)[0]+3,P(maxX,0)[0]+3,1,5.8);

  // 4 member marks --------------------------------------------------------------------------------------------------------------
  for(const r of rows){
    const m=[...r.members].sort((a,b)=>b.L-a.L)[0],k=r.role==='web'?.5:.38,x=m.A[0]+(m.B[0]-m.A[0])*k,z=m.A[1]+(m.B[1]-m.A[1])*k,p=P(x,z);
    c.push(`1 1 1 rg ${DIM} RG .5 w ${f2(p[0]+5.6)} ${f2(p[1])} m ${f2(p[0]+5.6)} ${f2(p[1]+3.1)} ${f2(p[0]+3.1)} ${f2(p[1]+5.6)} ${f2(p[0])} ${f2(p[1]+5.6)} c ${f2(p[0]-3.1)} ${f2(p[1]+5.6)} ${f2(p[0]-5.6)} ${f2(p[1]+3.1)} ${f2(p[0]-5.6)} ${f2(p[1])} c ${f2(p[0]-5.6)} ${f2(p[1]-3.1)} ${f2(p[0]-3.1)} ${f2(p[1]-5.6)} ${f2(p[0])} ${f2(p[1]-5.6)} c ${f2(p[0]+3.1)} ${f2(p[1]-5.6)} ${f2(p[0]+5.6)} ${f2(p[1]-3.1)} ${f2(p[0]+5.6)} ${f2(p[1])} c h B`);
    const w=tw(r.mark,5.2,true);text(r.mark,p[0]-w/2,p[1]-1.9,5.2,DIM,'F2');
  }

  // 5 call-outs (section / plies / grade) ------------------------------------------------------------------------------------------
  const grade=opts.grade?` ${opts.grade}`:'';
  const nearX=(list,fx)=>[...list].sort((a,b)=>Math.abs((a.A[0]+a.B[0])/2-fx)-Math.abs((b.A[0]+b.B[0])/2-fx))[0];
  const group=(g,fx)=>{const rs=rows.filter(r=>r.role===g);if(!rs.length)return null;const secs=[...new Set(rs.map(r=>r.section.toUpperCase()))].join(', ');const ply=Math.max(...rs.map(r=>r.ply));
    const mem=rs.flatMap(r=>r.members).filter(x=>x.L>.25),pick=nearX(mem.length?mem:rs[0].members,minX+W*fx);
    return {label:g==='top'?'TOP CHORD':g==='bottom'?'BOTTOM CHORD':'WEBS',text:`${secs}${grade}${ply>1?`  (${ply}-PLY)`:''}`,target:P((pick.A[0]+pick.B[0])/2,(pick.A[1]+pick.B[1])/2)};};
  {const list=[group('top',.22),group('web',.5),group('bottom',.78)].filter(Boolean).sort((p,q)=>p.target[0]-q.target[0]);
   const yT=rect.y+rect.h-14,right=rect.x+rect.w-MR-40;let cursor=rect.x+4;
   for(const g of list){
     const lw=g.label.length*6.4*.72,w=lw+7+tw(g.text,6.4);
     let x0=Math.max(cursor,Math.min(g.target[0]-12,right-w));if(x0<cursor)x0=cursor;cursor=x0+w+14;
     text(g.label,x0,yT,6.4,BLUE,'F2');text(g.text,x0+lw+7,yT,6.4,DIM,'F1');
     const sx=Math.min(Math.max(g.target[0],x0+3),x0+w-3);ln(sx,yT-2.2,g.target[0],g.target[1],.35,BLUE);
     c.push(`${BLUE} rg ${f2(g.target[0]-1.6)} ${f2(g.target[1]-1.6)} 3.2 3.2 re f`);}}

  // 6 pitch marker ----------------------------------------------------------------------------------------------------------------
  const slopeOf=r=>{const m=r.members[0],dx=Math.abs(m.B[0]-m.A[0]);return dx>1e-6?Math.abs(m.B[1]-m.A[1])/dx*12:0;};
  const sloped=rows.filter(r=>r.role==='top'&&slopeOf(r)>.05).sort((a,b)=>b.cutM-a.cutM)[0];
  let pitchTxt='';
  if(sloped){const rise=slopeOf(sloped);pitchTxt=`${num(rise,2).replace(/\.?0+$/,'')}/12`;
    const bx0=rect.x+rect.w-MR-4,by0=rect.y+rect.h-44,len=30,vz=Math.max(4,Math.min(34,len*rise/12));
    c.push(`1 1 1 rg ${DIM} RG .5 w ${f2(bx0-len)} ${f2(by0)} m ${f2(bx0)} ${f2(by0)} l ${f2(bx0)} ${f2(by0+vz)} l h B`);
    text('12',bx0-len/2-3,by0-8,6.2,DIM,'F2');text(num(rise,2).replace(/\.?0+$/,''),bx0+3,by0+vz/2-2,6.2,DIM,'F2');}

  // 7 title + note ------------------------------------------------------------------------------------------------------------------
  const title=`${t.id}  -  ${String(t.type).toUpperCase()} TRUSS  -  ${dimShort(t.span)} SPAN${pitchTxt?`  -  ${pitchTxt} PITCH`:''}`,size=10.5,tx=rect.x+rect.w/2-tw(title,size,true)/2;
  text(title,tx,rect.y+16,size,DIM,'F2');ln(tx,rect.y+13,tx+tw(title,size,true),rect.y+13,.8);
  text('Members drawn at timber depth with modelled joint cuts. Connector plates are schematic locations only - size, grade and orientation by plate design. Dimensions to nearest 1/16 in.',rect.x+rect.w/2-196,rect.y+3,5.2,'0.35 0.40 0.44','F1');
  return {scale:sc,pitch:pitchTxt};
}
