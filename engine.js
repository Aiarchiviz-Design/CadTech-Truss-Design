// Units: mm, N, MPa internally; m, kPa at the interface.
export const catalog=[];
for(const d of [90,150,200,250,300])for(const t of [1.2,1.6,2,2.5,3]){
 const b=d<200?45:60,l=15,A=t*(d+2*b+2*l),cx=(2*b*t*b/2+2*l*t*b)/A;
 const Iy=d*t**3/12+d*t*cx**2+2*(t*b**3/12+b*t*(b/2-cx)**2)+2*(l*t**3/12+l*t*(b-cx)**2);
 const Ix=t*d**3/12+2*(b*t**3/12+b*t*(d/2)**2)+2*(t*l**3/12+l*t*(d/2-l/2)**2);
 catalog.push({name:`C${d} × ${b} × ${l} × ${t}`,d,b,l,t,A,I:Math.min(Ix,Iy),Ix,Iy,kgm:A*.00785});
}catalog.sort((a,b)=>a.A-b.A);
export function geometry(span,rise,apex,n,pattern,extras=[]){
 const nodes=[],bottom=[],top=[];
 // Include the original ridge exactly: split equal panel counts on each slope.
 const xs=Array.from({length:n+1},(_,i)=>i<=n/2?apex*i/(n/2):apex+(span-apex)*(i-n/2)/(n/2));
 for(let i=0;i<=n;i++){bottom[i]=nodes.length;nodes.push([xs[i]*1000,0]);}
 top[0]=bottom[0];top[n]=bottom[n];for(let i=1;i<n;i++){top[i]=nodes.length;nodes.push([xs[i]*1000,rise*1000*(xs[i]<=apex?xs[i]/apex:(span-xs[i])/(span-apex))]);}
 const members=[],add=(a,b,role)=>{const L=Math.hypot(nodes[b][0]-nodes[a][0],nodes[b][1]-nodes[a][1]);members.push({a,b,role,L,id:`${role==='top'?'TC':role==='bottom'?'BC':'W'}${String(members.filter(m=>m.role===role).length+1).padStart(2,'0')}`})};
 for(let i=0;i<n;i++){add(top[i],top[i+1],'top');add(bottom[i],bottom[i+1],'bottom');}
 for(let i=1;i<n;i++)add(bottom[i],top[i],'web');
 for(let i=1;i<n-1;i++){const down=(i<n/2)===(pattern==='Pratt');add(down?top[i]:bottom[i],down?bottom[i+1]:top[i+1],'web');}
 const supports=[0,...extras.map(i=>bottom[i]),bottom[n]],fixed=[0,...supports.map(i=>2*i+1)];
 return {nodes,members,top,bottom,xs,supports,fixed,n,pattern,span,rise,apex};
}
function solve(K,F){const n=F.length,A=K.map((r,i)=>[...r,F[i]]);for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;if(Math.abs(A[p][k])<1e-8)throw Error('Unstable truss: stiffness matrix is singular.');[A[k],A[p]]=[A[p],A[k]];for(let i=k+1;i<n;i++){const f=A[i][k]/A[k][k];for(let j=k+1;j<=n;j++)A[i][j]-=f*A[k][j];A[i][k]=0;}}const u=Array(n).fill(0);for(let i=n-1;i>=0;i--){let v=A[i][n];for(let j=i+1;j<n;j++)v-=A[i][j]*u[j];u[i]=v/A[i][i];}return u;}
export function analyze(g,sections,pressure,deadFactor=1,points=[]){
 const size=g.nodes.length*2,K=Array.from({length:size},()=>Array(size).fill(0)),F=Array(size).fill(0),E=sections.top.E||200000;
 for(let i=0;i<g.top.length;i++){const trib=((g.xs[i]- (g.xs[i-1]??g.xs[i]))+((g.xs[i+1]??g.xs[i])-g.xs[i]))/2;F[g.top[i]*2+1]-=pressure*trib*1000;}
 // V9.9.8: concentrated loads (e.g. reactions of jacks framing into a girder): x in m along the truss, P in N (downward +),
 // shared linearly between the two top-chord nodes that bracket x.
 for(const pt of points||[]){const P=Number(pt.P)||0;if(!P)continue;const xs=g.xs;let i=0;while(i<xs.length-2&&xs[i+1]<pt.x)i++;
  if(pt.x<=xs[0]){F[g.top[0]*2+1]-=P;continue;}if(pt.x>=xs.at(-1)){F[g.top.at(-1)*2+1]-=P;continue;}
  const s=(pt.x-xs[i])/Math.max(xs[i+1]-xs[i],1e-9);F[g.top[i]*2+1]-=P*(1-s);F[g.top[i+1]*2+1]-=P*s;}
 const vectors=g.members.map(m=>{const s=sections[m.role],a=g.nodes[m.a],b=g.nodes[m.b],c=(b[0]-a[0])/m.L,h=(b[1]-a[1])/m.L,v=[-c,-h,c,h],ids=[m.a*2,m.a*2+1,m.b*2,m.b*2+1];for(let i=0;i<4;i++)for(let j=0;j<4;j++)K[ids[i]][ids[j]]+=E*s.A/m.L*v[i]*v[j];const w=s.kgm*m.L/1000*9.80665*deadFactor/2;F[m.a*2+1]-=w;F[m.b*2+1]-=w;return {v,ids};});
 const free=Array.from({length:size},(_,i)=>i).filter(i=>!g.fixed.includes(i)),sol=solve(free.map(i=>free.map(j=>K[i][j])),free.map(i=>F[i])),u=Array(size).fill(0);free.forEach((k,i)=>u[k]=sol[i]);
 const forces=g.members.map((m,i)=>E*sections[m.role].A/m.L*vectors[i].v.reduce((s,v,j)=>s+v*u[vectors[i].ids[j]],0));
 const reactions=g.supports.map(node=>({node,x:g.nodes[node][0]/1000,vertical:K[node*2+1].reduce((s,v,j)=>s+v*u[j],0)-F[node*2+1]}));
 return {u,forces,reactions,deflection:Math.max(...g.nodes.map((_,i)=>Math.abs(u[2*i+1]))),totalVertical:F.filter((_,i)=>i%2).reduce((a,b)=>a+b,0)};
}
export function validate(p){for(const [k,min,max] of [['span',2,40],['rise',.3,10],['spacing',.1,6],['fy',100,600],['dead',0,20],['live',0,20],['wind',0,20],['fd',.1,3],['fl',.1,3],['fw',.1,3],['fs',0,2],['limit',100,1000]])if(!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error(`${k}: enter a number between ${min} and ${max}.`);if(!(p.apex>0&&p.apex<p.span))throw Error('Ridge must lie between the two eaves.');if(!['auto','Pratt','Howe'].includes(p.layout)||!['propose','ends','allowed'].includes(p.bearings))throw Error('Invalid layout or bearing strategy.');if((p.eligible||[]).some(x=>!Number.isFinite(x)||x<=0||x>=p.span))throw Error('Eligible bearings must be inside the span.');}
function sizeStudy(g,p){
 const idx={top:0,bottom:0,web:0};let last;
 for(let iter=0;iter<catalog.length*3+3;iter++){
 const sections=Object.fromEntries(Object.keys(idx).map(k=>[k,catalog[idx[k]]])),cases=[{name:'Gravity',q:(p.fd*p.dead+p.fl*p.live)*p.spacing,d:p.fd},{name:'Uplift',q:(p.fs*p.dead-p.fw*p.wind)*p.spacing,d:p.fs},{name:'Service gravity',q:(p.dead+p.live)*p.spacing,d:1},{name:'Service uplift',q:(p.dead-p.wind)*p.spacing,d:1}].map(c=>({...c,...analyze(g,sections,c.q,c.d)}));
 const members=g.members.map((m,i)=>{const s=sections[m.role],yieldCap=s.A*p.fy,euler=Math.PI**2*200000*s.I/m.L**2;let ratio=0,force=0,governing='';for(const c of cases.slice(0,2)){let f=c.forces[i],r=Math.abs(f)/(f<0?Math.min(yieldCap,euler):yieldCap);if(r>=ratio){ratio=r;force=f;governing=c.name;}}return {...m,section:s,ratio,force,governing,yieldCap,euler};});
 const deflection=Math.max(cases[2].deflection,cases[3].deflection),maxRatio=Math.max(...members.map(m=>m.ratio)),mass=members.reduce((s,m)=>s+m.L/1000*m.section.kgm,0),pass=maxRatio<=1&&deflection<=p.span*1000/p.limit;
 last={...g,members,sections,cases,maxRatio,deflection,mass,pass,params:p};if(pass)return last;
 const needs=new Set(members.filter(m=>m.ratio>1).map(m=>m.role));if(deflection>p.span*1000/p.limit)Object.keys(idx).forEach(k=>needs.add(k));let changed=false;for(const k of needs)if(idx[k]<catalog.length-1){idx[k]++;changed=true;}if(!changed)return last;
 }return last;
}
function combos(a,k,start=0,acc=[],out=[]){if(!k){out.push(acc);return out;}for(let i=start;i<=a.length-k;i++)combos(a,k-1,i+1,[...acc,a[i]],out);return out;}
export async function optimize(p,progress=()=>{}){
 validate(p);let trials=0,bestFail=null;const patterns=p.layout==='auto'?['Pratt','Howe']:[p.layout];
 for(let count=0;count<=(p.bearings==='ends'?0:3);count++){
 let best=null;
 for(const n of [4,6,8,10,12]){
 const base=geometry(p.span,p.rise,p.apex,n,'Pratt'),eligible=Array.from({length:n-1},(_,i)=>i+1).filter(i=>p.bearings==='propose'||(p.eligible||[]).some(x=>Math.abs(x-base.xs[i])<.01));
 for(const extra of combos(eligible,count))for(const pattern of patterns){const r=sizeStudy(geometry(p.span,p.rise,p.apex,n,pattern,extra),p);trials++;if(r.pass&&(!best||r.mass<best.mass))best=r;if(!bestFail||r.maxRatio<bestFail.maxRatio)bestFail=r;}
 progress({count,trials});await new Promise(r=>setTimeout(r,0));
 }if(best)return {...best,trials,bearingSearch:count+2};
 }return {...bestFail,trials,bearingSearch:Math.min(5,(bestFail?.supports.length||2)),pass:false};
}
