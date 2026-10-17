import {axisFromPoints} from './importer.js';
export const typeColors={Common:'#bfe96e',Stepdown:'#54caba',Girder:'#ffba67','Front jack':'#66afff','Side jack':'#b9a0ff','Hip carrier':'#ee91b9',Mono:'#66afff',Unclassified:'#c4ced7',Fink:'#bfe96e',Howe:'#54caba',Pratt:'#38bdf8',Scissors:'#f59e0b',Attic:'#a855f7',KingPost:'#ec4899',QueenPost:'#10b981',Warren:'#06b6d4',Monopitch:'#66afff'};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],len=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
export function parseRoofOBJ(text,scale=.0254,up='Z'){
 const vertices=[],groups=[];let group=null;
 const start=name=>{group={name,faces:[],lines:[]};groups.push(group)};
 for(const line of text.split(/\r?\n/)){const s=line.split('#')[0].trim().split(/\s+/);if(s[0]==='v'){const p=s.slice(1,4).map(Number);if(p.length!==3||p.some(x=>!Number.isFinite(x)))throw Error('Invalid OBJ vertex');if(vertices.length>300000)throw Error('Model exceeds 300,000 vertices.');vertices.push((up==='Y'?[p[0],-p[2],p[1]]:p).map(x=>x*scale));}else if(s[0]==='g'||s[0]==='o')start(s.slice(1).join(' '));else if(s[0]==='f'||s[0]==='l'){if(!group)start('Object');const ids=s.slice(1).map(x=>Number(x.split('/')[0])).map(i=>i<0?vertices.length+i:i-1);if(ids.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw Error('Invalid OBJ face index');group[s[0]==='f'?'faces':'lines'].push(ids);}}
 if(!vertices.length)throw Error('No geometry in this file.');const min=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i]))),origin=[(min[0]+max[0])/2,(min[1]+max[1])/2,min[2]];vertices.forEach(p=>p.forEach((_,i)=>p[i]-=origin[i]));const axes=[],meshes=[];
 for(const [gi,g] of groups.entries()){
 const ids=[...new Set(g.faces.flat())],points=ids.map(i=>vertices[i]),axis=axisFromPoints(points,g.name);if(axis){axis.source=gi;axis.name=`R${String(axes.length+1).padStart(3,'0')}`;axes.push(axis);}
 const triangles=[];for(const f of g.faces)for(let j=1;j<f.length-1;j++)triangles.push(vertices[f[0]],vertices[f[j]],vertices[f[j+1]]);if(triangles.length)meshes.push({name:g.name,positions:triangles.flat(),kind:axis?'rafter':'surface'});
 for(const l of g.lines)for(let j=1;j<l.length;j++){const a=axisFromPoints([vertices[l[j-1]],vertices[l[j]]],g.name);if(a)axes.push({...a,source:gi,name:`R${String(axes.length+1).padStart(3,'0')}`});}
 }if(!axes.length)throw Error('No straight rafter objects detected.');return {axes,meshes,origin,bounds:max.map((x,i)=>x-min[i]),groups:groups.length};
}
export function fromIFCAxes(axes){const pts=axes.flatMap(a=>[a.a,a.b]),min=[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))),origin=[(min[0]+max[0])/2,(min[1]+max[1])/2,min[2]];return {axes:axes.map(a=>({...a,a:a.a.map((x,i)=>x-origin[i]),b:a.b.map((x,i)=>x-origin[i])})),meshes:[],origin,bounds:max.map((x,i)=>x-min[i])};}
export function assembleRoof(source,{tolerance=.09,heel=.25,panel=1.2,inferHips=true}={}){
 const planes=[],unassigned=[];
 for(let i=0;i<source.axes.length;i++){
 const r=source.axes[i],d=[r.b[0]-r.a[0],r.b[1]-r.a[1]],L=Math.hypot(...d);if(L<.12){unassigned.push(i);continue;}let u=d.map(x=>x/L);if(u[0]<-.01||Math.abs(u[0])<.01&&u[1]<0)u=u.map(x=>-x);const normal=[-u[1],u[0]],offset=dot(r.a,normal);let pl=planes.find(p=>dot(p.u,u)>.998&&Math.abs(p.offset-offset)<.035);if(!pl){pl={u,normal,offset,segments:[]};planes.push(pl);}let a=r.a,b=r.b;if(dot(a,pl.u)>dot(b,pl.u))[a,b]=[b,a];pl.segments.push({a,b,i,start:dot(a,pl.u),end:dot(b,pl.u)});
 }
 const trusses=[];
 for(const pl of planes){pl.segments.sort((a,b)=>a.start-b.start);let chain=[];const finish=()=>{
 if(!chain.length)return;let pts=chain.flatMap(s=>[s.a,s.b]).sort((a,b)=>dot(a,pl.u)-dot(b,pl.u)),profile=[];for(const p of pts){const last=profile.at(-1);if(last&&Math.abs(dot(p,pl.u)-dot(last,pl.u))<tolerance&&Math.abs(p[2]-last[2])<tolerance)profile[profile.length-1]=mix(last,p,.5);else profile.push([...p]);}
 if(profile.length>=2){const flat=chain.some(s=>Math.abs(s.a[2]-s.b[2])<.04),peak=Math.max(...profile.map(p=>p[2])),ends=Math.max(profile[0][2],profile.at(-1)[2]),full=chain.length>1&&peak-ends>.15&&Math.abs(profile[0][2]-profile.at(-1)[2])<.12;
 trusses.push({profile,sources:chain.map(s=>s.i),u:pl.u,normal:pl.normal,type:full?(flat?'Stepdown':'Common'):'Mono',full,proposed:false});}chain=[];};
 let end=-Infinity;for(const s of pl.segments){if(chain.length&&s.start>end+tolerance){finish();end=-Infinity;}chain.push(s);end=Math.max(end,s.end);}finish();}
 const full=trusses.filter(t=>t.full),primary=full.length?full.reduce((a,b)=>len(a.profile[0],a.profile.at(-1))>len(b.profile[0],b.profile.at(-1))?a:b).u:planes.sort((a,b)=>b.segments.length-a.segments.length)[0]?.u||[0,1];
 for(const t of trusses)if(!t.full){const alignment=Math.abs(dot(t.u,primary));t.type=alignment>.95?'Side jack':alignment<.1?'Front jack':'Hip carrier';}
 // A girder is a candidate only if another rafter terminates on its top profile.
 for(const t of full.filter(t=>t.type==='Stepdown')){t.carriedSources=[];for(const j of trusses.filter(j=>!j.full)){const high=j.profile.reduce((a,b)=>a[2]>b[2]?a:b);if(distanceToProfile(high,t.profile)<tolerance*1.5)t.carriedSources.push(...j.sources);}if(t.carriedSources.length)t.type='Girder';}
 const hips=[];
 if(inferHips)for(const g of full.filter(t=>t.type==='Girder')){
 const highest=Math.max(...g.profile.map(p=>p[2])),plateau=g.profile.filter(p=>Math.abs(p[2]-highest)<.04);if(plateau.length<2)continue;
 const outward=[-g.u[1],g.u[0]],mid=mix(g.profile[0],g.profile.at(-1),.5),sgn=dot(mid,outward)>=0?1:-1;const out=outward.map(x=>x*sgn),endCandidates=source.axes.flatMap(a=>[a.a,a.b]),far=Math.max(...endCandidates.map(p=>dot(p,out))),at=dot(mid,out),run=far-at;
 if(run<.2)continue;for(const peak of [plateau[0],plateau.at(-1)]){const near=g.profile.reduce((a,b)=>len(a,peak)<len(b,peak)?a:b);const side=dot(peak,g.u)>dot(mid,g.u)?1:-1;const edge=g.profile[side>0?g.profile.length-1:0],corner=[mid[0]+out[0]*run+g.u[0]*(dot(edge,g.u)-dot(mid,g.u)),mid[1]+out[1]*run+g.u[1]*(dot(edge,g.u)-dot(mid,g.u)),edge[2]];
 if(!source.axes.some(a=>distanceToProfile(peak,[a.a,a.b])<tolerance&&distanceToProfile(corner,[a.a,a.b])<tolerance)){const d=[peak[0]-corner[0],peak[1]-corner[1]],l=Math.hypot(...d);hips.push({profile:[corner,peak],sources:[],u:d.map(x=>x/l),normal:[-d[1]/l,d[0]/l],type:'Hip carrier',full:false,proposed:true});}}
 }
 trusses.push(...hips);autoFitSideConnections(trusses,tolerance);const lowEnds=trusses.filter(t=>t.full).flatMap(t=>[t.profile[0][2],t.profile.at(-1)[2]]);const base=(lowEnds.length?Math.min(...lowEnds):Math.min(...source.axes.flatMap(a=>[a.a[2],a.b[2]])))-heel;
 // V9.9.1: a jack/mono whose raised end stops SHORT of a perpendicular truss (source roof plane ends a little early) is
 // extended along its own slope to that truss, so it connects instead of floating.  Max 1.5 m, and only when the slope
 // reaches the receiver within 200 mm in height.
 {const MAXEXT=1.5,notParallel=(a,b)=>Math.abs(dot(a.u,b.u))<=.94;
  for(const t of trusses){
   if(t.full||t.profile.length<2)continue;
   for(const atStart of [false,true]){
    const P=t.profile,e=atStart?P[0]:P.at(-1),n=atStart?P[1]:P.at(-2);
    if(e[2]-base<heel+.1)continue;   // eave end (sits on the wall plate): nothing to connect to
    if(trusses.some(r=>r!==t&&notParallel(t,r)&&distanceToProfile(e,r.profile)<tolerance*1.8))continue;   // already touching
    const dxy=Math.hypot(e[0]-n[0],e[1]-n[1]);if(dxy<1e-6)continue;
    const dir=[(e[0]-n[0])/dxy,(e[1]-n[1])/dxy],slope=(e[2]-n[2])/dxy;
    let best=null;
    for(const r of trusses){
     if(r===t||!notParallel(t,r))continue;
     const hit=profilePlanIntersection([e,[e[0]+dir[0]*MAXEXT,e[1]+dir[1]*MAXEXT,e[2]]],r.profile);
     if(!hit)continue;
     const d=Math.hypot(hit[0]-e[0],hit[1]-e[1]);if(d<1e-4||d>MAXEXT)continue;
     const cp=closestPointProfile([hit[0],hit[1],e[2]+slope*d],r.profile);
     if(Math.abs(cp.point[2]-(e[2]+slope*d))>.20)continue;
     if(!best||d<best.d)best={d,pt:[hit[0],hit[1],cp.point[2]]};
    }
    if(best){if(atStart)P.unshift(best.pt);else P.push(best.pt);t.extendedEnd=Math.round(best.d*1000);}
   }
  }}
 const counters={};trusses.sort((a,b)=>Number(b.full)-Number(a.full)||a.profile[0][0]-b.profile[0][0]||a.profile[0][1]-b.profile[0][1]);
 for(const t of trusses){const code={Common:'C',Stepdown:'SD',Girder:'G','Front jack':'FJ','Side jack':'SJ','Hip carrier':'HC'}[t.type]||'T';t.id=code+String(counters[code]=(counters[code]||0)+1).padStart(2,'0');t.base=base;t.heel=heel;t.members=frameProfile(t.profile,base,panel);t.span=Math.hypot(t.profile.at(-1)[0]-t.profile[0][0],t.profile.at(-1)[1]-t.profile[0][1]);t.height=Math.max(...t.profile.map(p=>p[2]))-base;t.ply=t.type==='Girder'?2:1;t.review=t.type==='Girder'?'Girder loads, ply count and connections unverified':t.proposed?'Inferred missing hip carrier — review location':t.connectionAdjusted?`Side connection auto-fitted ${Math.round(t.connectionGapBefore*1000)} mm to ${t.connectionTarget}; verify hanger/bearing detail`:'Geometry generated — not structurally verified';}
 for(const t of trusses){
  t.connections=[];
  if(!t.full){
   const high=t.profile.reduce((a,b)=>a[2]>b[2]?a:b);
   // Normal receiver search for jack high ends.
   for(const other of trusses){if(other===t||!['Girder','Hip carrier'].includes(other.type))continue;const gap=distanceToProfile(high,other.profile);if(gap<tolerance*1.8)t.connections.push({to:other.id,gap,point:high,kind:'high-end'});}
   // Side jacks can terminate on the SIDE FACE of a front jack/collector.  This is a
   // plan crossing, not a high-point connection, so the older high-end-only search missed it.
   if(t.type==='Side jack'){
    for(const other of trusses){
     if(other===t||!['Front jack','Girder','Hip carrier'].includes(other.type))continue;
     const hit=profilePlanIntersection(t.profile,other.profile);
     if(!hit)continue;
     // V9.9.1: if the OTHER truss ends on this one (and this one does not end on it) this truss is the receiver -
     // it must run past the junction, otherwise it is cut short and no longer reaches its own supports.
     const endOn=(x,y)=>[x.profile[0],x.profile.at(-1)].some(e=>distanceToProfile(e,y.profile)<tolerance*1.8);
     if(endOn(other,t)&&!endOn(t,other))continue;
     // Keep the eave/outboard side of the purple side jack. Lowest endpoint wins; if level,
     // the endpoint farther from the centred model origin is the eave-side endpoint.
     const e0=t.profile[0],e1=t.profile.at(-1);
     let keep=e0[2]<e1[2]-.01?e0:e1[2]<e0[2]-.01?e1:(Math.hypot(e0[0],e0[1])>=Math.hypot(e1[0],e1[1])?e0:e1);
     // V9.9: if that end is the one touching the receiver it cannot say which side to keep -> use the far end.
     const nrm=other.normal||[0,1],dd=q=>Math.abs((q[0]-hit[0])*nrm[0]+(q[1]-hit[1])*nrm[1]);
     if(dd(keep)<.05)keep=dd(e0)>=dd(e1)?e0:e1;
     t.connections.push({to:other.id,gap:0,point:hit,keepPoint:[...keep],kind:'side-flush'});
    }
   }
  }
 }
 // V9.9: ANY truss whose profile END lands on the side of a non-parallel truss (front jack on a side jack, stepdown on a
 // front jack, hip carrier on a side jack, jack low end on a common...) is cut flush to that truss's near face instead of
 // running through it.  Corner contacts (both ends meet) are hips/valleys and are left alone.
 const planD=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 for(const t of trusses){
  for(const e of [t.profile[0],t.profile.at(-1)]){
   for(const r of trusses){
    if(r===t||Math.abs(dot(t.u||[1,0],r.u||[0,1]))>.94||t.connections.some(c=>c.to===r.id))continue;
    const cp=closestPointProfile(e,r.profile);
    if(!cp.point||cp.distance>tolerance*1.8)continue;
    if(Math.min(planD(cp.point,r.profile[0]),planD(cp.point,r.profile.at(-1)))<.25)continue;
    const nrm=r.normal||[0,1],dd=q=>Math.abs((q[0]-cp.point[0])*nrm[0]+(q[1]-cp.point[1])*nrm[1]);
    const keep=t.profile.reduce((a,b)=>dd(b)>dd(a)?b:a);
    if(dd(keep)<.15)continue;
    t.connections.push({to:r.id,gap:cp.distance,point:[...cp.point],keepPoint:[...keep],kind:'end-flush'});
   }
  }
 }
 const PRI={'side-flush':0,'high-end':1,'end-flush':2};
 for(const t of trusses){const keep=[];for(const c of t.connections.sort((a,b)=>(PRI[a.kind]-PRI[b.kind])||a.gap-b.gap)){if(keep.length>=2)break;if(keep.some(k=>k.to===c.to||planD(k.point,c.point)<.3))continue;keep.push(c);}t.connections=keep;}
 // V9.9.3: where two eaves meet (re-entrant corner, eave end against another truss) the overhang tails would cross each other
 // or run through the neighbouring truss. For every eave end record what its tail would hit, along the end direction in plan:
 //   t.eaveHits[0|1] = [{kind:'body'|'tail', d, rd?, rf?, r}]  (d = plan distance to the hit; for 'tail' rd = the OTHER truss's tail distance)
 // advanced.js templateMembers() drops the overhang at that end when the hit lies within the tail length.
 {const MAXT=3,planFactor=(t,dir)=>t.type==='Hip carrier'?1/Math.max(Math.abs(dir[0]),Math.abs(dir[1]),.35):1;
  const lowStart=t=>t.profile[0][2]<t.profile.at(-1)[2];
  const rays=[];
  for(const t of trusses){const P=t.profile;if(P.length<2){t.eaveHits={0:[],1:[]};continue;}t.eaveHits={0:[],1:[]};
   for(const k of [0,1]){
    if(!t.full&&(k===0)!==lowStart(t))continue;             // jacks only carry an overhang on their LOW end
    const e=k?P.at(-1):P[0],n=k?P.at(-2):P[1],dx=e[0]-n[0],dy=e[1]-n[1],run=Math.hypot(dx,dy);if(run<1e-6)continue;
    const dir=[dx/run,dy/run];rays.push({t,k,e,dir,pf:planFactor(t,dir),slope:(e[2]-n[2])/run});(t.eavePf??=[1,1])[k]=planFactor(t,dir);}}
  const solve=(e,d,f,g)=>{const den=d[0]*g[1]-d[1]*g[0];if(Math.abs(den)<1e-9)return null;const w=[f[0]-e[0],f[1]-e[1]];return [(w[0]*g[1]-w[1]*g[0])/den,(w[0]*d[1]-w[1]*d[0])/den];};
  for(const A of rays){
   for(const R of trusses){
    if(R===A.t)continue;
    for(let i=1;i<R.profile.length;i++){
     const a=R.profile[i-1],b=R.profile[i],g=[b[0]-a[0],b[1]-a[1]],r=solve(A.e,A.dir,a,g);if(!r)continue;
     const [d,v]=r;if(d<-.03||d>MAXT||v<-.01||v>1.01)continue;
     const zR=a[2]+(b[2]-a[2])*v,zA=A.e[2]+A.slope*Math.max(d,0);
     if(zA>zR+.05)continue;                                  // tail passes above the other truss
     A.t.eaveHits[A.k].push({kind:'body',d:Math.max(d,0),r:R.id});
    }
   }
   for(const B of rays){
    if(B.t===A.t)continue;
    const r=solve(A.e,A.dir,B.e,B.dir);if(!r)continue;
    const [d1,d2]=r;if(d1<-.03||d2<-.03||d1>MAXT||d2>MAXT)continue;
    if(Math.abs((A.e[2]+A.slope*Math.max(d1,0))-(B.e[2]+B.slope*Math.max(d2,0)))>.3)continue;   // different heights: no clash
    A.t.eaveHits[A.k].push({kind:'tail',d:Math.max(d1,0),rd:Math.max(d2,0),rpf:B.pf,r:B.t.id});
   }
  }}
 return {trusses,base,unassigned,sourceAxisCount:source.axes.length,covered:new Set(trusses.flatMap(t=>t.sources)).size,counts:Object.fromEntries(Object.keys(typeColors).map(k=>[k,trusses.filter(t=>t.type===k).length]).filter(([,v])=>v)),inferred:hips.length};
}

function closestPointProfile(p,profile){let best={distance:Infinity,point:null};for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i],ab=b.map((x,j)=>x-a[j]),den=ab.reduce((q,x)=>q+x*x,0);if(den<1e-12)continue;const u=Math.max(0,Math.min(1,p.reduce((q,x,j)=>q+(x-a[j])*ab[j],0)/den)),q=mix(a,b,u),d=len(p,q);if(d<best.distance)best={distance:d,point:q};}return best;}
function autoFitSideConnections(trusses,tolerance){/* Repair small imported drafting misses at jack-to-girder / hip-carrier side connections. Source geometry remains authoritative outside the repair envelope. */for(const t of trusses){if(t.full||t.type==='Hip carrier')continue;let hi=0;for(let i=1;i<t.profile.length;i++)if(t.profile[i][2]>t.profile[hi][2])hi=i;const p=t.profile[hi];let best=null;for(const r of trusses){if(r===t||!['Girder','Hip carrier'].includes(r.type))continue;const hit=closestPointProfile(p,r.profile);if(!best||hit.distance<best.distance)best={...hit,to:r};}const maxSnap=Math.min(.35,Math.max(tolerance*4,.12));if(best&&best.distance<=maxSnap){t.connectionAdjusted=best.distance>.003;t.connectionOriginal=t.connectionAdjusted?[...p]:null;t.profile[hi]=[...best.point];t.connectionTarget=best.to.id;t.connectionGapBefore=best.distance;}}}

function profilePlanIntersection(aProf,bProf){
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 for(let i=1;i<aProf.length;i++)for(let j=1;j<bProf.length;j++){
  const a=aProf[i-1],b=aProf[i],c=bProf[j-1],d=bProf[j];
  const r=[b[0]-a[0],b[1]-a[1]],q=[d[0]-c[0],d[1]-c[1]],den=cross(r,q);
  if(Math.abs(den)<1e-8)continue;
  const ca=[c[0]-a[0],c[1]-a[1]],u=cross(ca,q)/den,v=cross(ca,r)/den;
  if(u<-.01||u>1.01||v<-.01||v>1.01)continue;
  const za=a[2]+(b[2]-a[2])*u,zb=c[2]+(d[2]-c[2])*v;
  // The truss planes may cross at different chord elevations; the receiver face is still
  // valid for side termination. Use the incoming truss elevation at the plan crossing.
  return [a[0]+r[0]*u,a[1]+r[1]*u,za];
 }
 return null;
}

export function distanceToProfile(p,profile){let best=Infinity;for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i],ab=b.map((x,j)=>x-a[j]),den=ab.reduce((s,x)=>s+x*x,0),t=Math.max(0,Math.min(1,p.reduce((s,x,j)=>s+(x-a[j])*ab[j],0)/den));best=Math.min(best,len(p,mix(a,b,t)));}return best;}
export function frameProfile(profile,base,panel=1.2){
 // Fabrication-style truss envelope. Top chord keeps the complete imported roof
 // profile (including eave tails), but the bottom chord and webs exist only between
 // the two heel intersections where the top-chord centreline crosses the BC level.
 const top=[];for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/panel));if(i===1)top.push([...a]);for(let j=1;j<=n;j++)top.push(mix(a,b,j/n));}
 const crossings=[];for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i],da=a[2]-base,db=b[2]-base;if(Math.abs(da)<1e-7)crossings.push([...a]);if(da*db<0||Math.abs(db)<1e-7){const den=b[2]-a[2];if(Math.abs(den)>1e-9){const t=(base-a[2])/den;if(t>=0&&t<=1)crossings.push(mix(a,b,t));}}}
 const uniq=[];for(const p of crossings)if(!uniq.some(q=>len(p,q)<.005))uniq.push(p);
 let h0=uniq[0]||[...top[0]],h1=uniq.at(-1)||[...top.at(-1)];
 const axis=[profile.at(-1)[0]-profile[0][0],profile.at(-1)[1]-profile[0][1]],AL=Math.hypot(...axis)||1,u=axis.map(x=>x/AL),sc=p=>(p[0]-profile[0][0])*u[0]+(p[1]-profile[0][1])*u[1];if(sc(h0)>sc(h1))[h0,h1]=[h1,h0];const s0=sc(h0),s1=sc(h1);
 const inner=[h0,...top.filter(p=>sc(p)>s0+.005&&sc(p)<s1-.005),h1].sort((a,b)=>sc(a)-sc(b));
 const members=[],add=(a,b,role)=>{if(len(a,b)>.01)members.push({a:[...a],b:[...b],role,length:len(a,b),section:role==='web'?[.045,.09]:[.045,.15]});};
 // TC is the controlling roof envelope, including intentional eave overhangs.
 for(let i=0;i<top.length-1;i++)add(top[i],top[i+1],'top');
 
 const bottom=inner.map(p=>[p[0],p[1],base]);for(let i=0;i<bottom.length-1;i++)add(bottom[i],bottom[i+1],'bottom');
 // Webs are infill between the two chord envelopes. No web is generated outside a heel.
 for(let i=0;i<inner.length;i++)add(bottom[i],inner[i],'web');
 for(let i=0;i<inner.length-1;i++)add(i%2?bottom[i]:inner[i],i%2?inner[i+1]:bottom[i+1],'web');
 return members;
}
