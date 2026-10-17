const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
export function axisFromPoints(points,name){
 if(points.length<2)return null;const mean=[0,1,2].map(i=>points.reduce((s,p)=>s+p[i],0)/points.length),C=Array.from({length:3},()=>[0,0,0]);for(const p of points)for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]+=(p[i]-mean[i])*(p[j]-mean[j]);
 let v=[1,.517,.231];for(let k=0;k<40;k++){const w=C.map(r=>r.reduce((s,x,i)=>s+x*v[i],0)),l=Math.hypot(...w);if(l<1e-12)return null;v=w.map(x=>x/l);}
 const ts=points.map(p=>p.reduce((s,x,i)=>s+(x-mean[i])*v[i],0)),lo=Math.min(...ts),hi=Math.max(...ts);if(hi-lo<.2)return null;
 const cross=Math.sqrt(points.reduce((s,p,i)=>s+Math.max(0,p.reduce((z,x,j)=>z+(x-mean[j])**2,0)-ts[i]**2),0)/points.length);if(cross/(hi-lo)>.16)return null;
 const a=mean.map((x,i)=>x+lo*v[i]),b=mean.map((x,i)=>x+hi*v[i]);return {name,a,b,length:hi-lo};
}
export function parseOBJ(text,scale=1,yUp=false){
 const vertices=[],parent=[],used=new Set(),lineAxes=[],groupOf=new Map();let lineCount=0,group=0;
 function root(x){while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;}function union(a,b){parent[root(a)]=root(b);}
 for(const line of text.split(/\r?\n/)){const s=line.split('#')[0].trim().split(/\s+/);if(s[0]==='o'||s[0]==='g'){group++;}else if(s[0]==='v'){if(vertices.length>300000)throw Error('OBJ is too dense. Export a simplified rafter-only model.');const p=s.slice(1,4).map(Number);if(p.length!==3||p.some(x=>!Number.isFinite(x)))throw Error('Invalid OBJ vertex.');vertices.push((yUp?[p[0],-p[2],p[1]]:p).map(x=>x*scale));parent.push(parent.length);}else if(s[0]==='f'||s[0]==='l'){const ids=s.slice(1).map(x=>Number(x.split('/')[0])).map(x=>x<0?vertices.length+x:x-1);if(ids.length<2||ids.some(x=>!Number.isInteger(x)||x<0||x>=vertices.length))throw Error('OBJ contains an invalid vertex reference.');if(s[0]==='l'){for(let j=1;j<ids.length;j++){const a=axisFromPoints([vertices[ids[j-1]],vertices[ids[j]]],`Line ${lineAxes.length+1}`);if(a)lineAxes.push(a);}}else for(const id of ids){used.add(id);groupOf.set(id,group);union(ids[0],id);}lineCount++;}}
 if(!lineCount)throw Error('OBJ needs faces or line segments, not only vertices.');
 // Weld identical positions across separate faces so common ArchiCAD face exports connect.
 const weld=new Map();for(const id of used){const key=groupOf.get(id)+'/'+vertices[id].map(x=>Math.round(x*1e6)).join(',');if(weld.has(key))union(id,weld.get(key));else weld.set(key,id);}
 const groups=new Map();for(const id of used){const k=root(id);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(vertices[id]);}
 const solidAxes=[...groups.values()].map((p,i)=>axisFromPoints(p,`Rafter ${i+1}`)).filter(Boolean);return {axes:[...solidAxes,...lineAxes],skipped:groups.size-solidAxes.length};
}
export async function parseIFC(buffer,progress){
 const W=await import('./vendor/web-ifc-api.js'),api=new W.IfcAPI();api.SetWasmPath(new URL('./vendor/',import.meta.url).href,true);await api.Init();let id;
 try{id=api.OpenModel(new Uint8Array(buffer),{COORDINATE_TO_ORIGIN:true});if(id<0)throw Error('The IFC reader could not open this model.');const axes=[];let skipped=0,count=0;
 api.StreamAllMeshes(id,mesh=>{count++;if(count>5000)throw Error('Too many IFC elements. Export rafters only (maximum 5,000).');const points=[];for(let j=0;j<mesh.geometries.size();j++){const placed=mesh.geometries.get(j),g=api.GetGeometry(id,placed.geometryExpressID),v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),m=placed.flatTransformation;const stride=Math.max(1,Math.ceil(v.length/6/6000));for(let i=0;i<v.length;i+=6*stride){const x=v[i],y=v[i+1],z=v[i+2],q=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];points.push([q[0],-q[2],q[1]]);}g.delete();}
 const data=api.GetLine(id,mesh.expressID),name=data?.Name?.value||`IFC #${mesh.expressID}`,a=axisFromPoints(points,name);if(a)axes.push(a);else skipped++;});progress?.(axes.length);return {axes,skipped};
 }finally{if(id!==undefined&&id>=0)api.CloseModel(id);api.Dispose?.();}}
export function pairRafters(axes,tolerance=.35){
 const candidates=[];axes.forEach((r,i)=>{const [low,high]=r.a[2]<r.b[2]?[r.a,r.b]:[r.b,r.a];if(high[2]-low[2]>.15)candidates.push({i,low,high,r});});const options=[];
 for(let a=0;a<candidates.length;a++)for(let b=a+1;b<candidates.length;b++){const A=candidates[a],B=candidates[b],ridge=A.high.map((x,i)=>(x+B.high[i])/2);if(dist(A.high,B.high)>tolerance||Math.abs(A.low[2]-B.low[2])>.15)continue;const dx=B.low[0]-A.low[0],dy=B.low[1]-A.low[1],span=Math.hypot(dx,dy);if(span<2||span>40)continue;const apex=((ridge[0]-A.low[0])*dx+(ridge[1]-A.low[1])*dy)/span,offset=Math.abs((ridge[0]-A.low[0])*dy-(ridge[1]-A.low[1])*dx)/span,rise=ridge[2]-(A.low[2]+B.low[2])/2;if(offset>.15||apex<.2||apex>span-.2||rise<.3)continue;options.push({a:A.i,b:B.i,left:A.low,right:B.low,ridge,span,rise,apex,score:dist(A.high,B.high)+offset});}
 options.sort((a,b)=>a.score-b.score);const used=new Set(),pairs=[];for(const p of options){if(used.has(p.a)||used.has(p.b))continue;used.add(p.a);used.add(p.b);pairs.push({...p,id:`T${String(pairs.length+1).padStart(2,'0')}`});}return {pairs,unpaired:axes.length-used.size};
}
