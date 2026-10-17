// CadTech ASCII DXF roof-plan importer.
// Converts 2D roof + truss layout lines into 3D top-chord axes using a roof pitch.
const hypot=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function pairs(text){const ls=text.replace(/\r/g,'').split('\n'),out=[];for(let i=0;i+1<ls.length;i+=2)out.push([Number(ls[i].trim()),ls[i+1].trim()]);return out;}
export function inspectDXF(text){
 const ps=pairs(text),layers=new Set(),entities=[];let insunits=0,inEnt=false,i=0;
 for(;i<ps.length;i++){
  const [c,v]=ps[i];
  if(c===9&&v==='$INSUNITS'&&ps[i+1]?.[0]===70)insunits=Number(ps[++i][1]);
  if(c===0&&v==='SECTION'&&ps[i+1]?.[0]===2&&ps[i+1][1]==='ENTITIES'){inEnt=true;i++;continue;}
  if(inEnt&&c===0&&v==='ENDSEC'){inEnt=false;continue;}
  if(!inEnt||c!==0||!['LINE','LWPOLYLINE','POLYLINE'].includes(v))continue;
  const type=v,rec=[];let j=i+1;for(;j<ps.length&&ps[j][0]!==0;j++)rec.push(ps[j]);i=j-1;
  const get=(code,def='')=>rec.find(x=>x[0]===code)?.[1]??def,layer=get(8,'0');layers.add(layer);
  if(type==='LINE'){
   const a=[Number(get(10,0)),Number(get(20,0))],b=[Number(get(11,0)),Number(get(21,0))];
   if(a.every(Number.isFinite)&&b.every(Number.isFinite)&&hypot(a,b)>1e-8)entities.push({type,layer,points:[a,b],closed:false});
  }else if(type==='POLYLINE'){
   const pts=[];const flags=Number(get(70,0));let k=j;
   while(k<ps.length){
    if(ps[k][0]===0){
     const entName=ps[k][1];
     if(entName==='SEQEND'){k++;break;}
     if(entName==='VERTEX'){
      let vx=null,vy=null;k++;
      while(k<ps.length&&ps[k][0]!==0){
       if(ps[k][0]===10)vx=Number(ps[k][1]);
       else if(ps[k][0]===20)vy=Number(ps[k][1]);
       k++;
      }
      if(vx!==null&&vy!==null&&Number.isFinite(vx)&&Number.isFinite(vy))pts.push([vx,vy]);
      continue;
     }
     if(entName!=='VERTEX')break;
    }
    k++;
   }
   i=k-1;
   if(pts.length>=2)entities.push({type,layer,points:pts,closed:Boolean(flags&1)});
  }else{
   const pts=[];let x=null;for(const [cc,vv] of rec){if(cc===10){if(x!==null)pts.push([x,0]);x=Number(vv);}else if(cc===20&&x!==null){pts.push([x,Number(vv)]);x=null;}}
   if(x!==null)pts.push([x,0]);const flags=Number(get(70,0));if(pts.length>=2)entities.push({type,layer,points:pts,closed:Boolean(flags&1)});
  }
 }
 return {layers:[...layers].sort(),entities,insunits};
}
export function dxfUnitScale(code,override='auto'){
 if(override!=='auto')return Number(override);
 return ({1:.0254,2:.3048,4:.001,5:.01,6:1,14:.1})[Number(code)]||.001;
}
function segmentsOf(e){const s=[];for(let i=1;i<e.points.length;i++)s.push([e.points[i-1],e.points[i]]);if(e.closed&&e.points.length>2)s.push([e.points.at(-1),e.points[0]]);return s;}
function pointSegDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;if(d<1e-15)return hypot(p,a);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function intersect(a,b,c,d){const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-10)return null;const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;return t>-1e-8&&t<1+1e-8&&u>-1e-8&&u<1+1e-8?t:null;}
function area(poly){let s=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)s+=(poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1]);return Math.abs(s)/2;}
function pointInPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]+1e-30)+a[0]))inside=!inside;}return inside;}
function dedupe(vals,tol=1e-5){vals.sort((a,b)=>a-b);return vals.filter((v,i)=>i===0||v-vals[i-1]>tol);}
export function parseRoofDXF(text, opts = {}) {
 const {
  roofLayer: reqRoof = 'ROOF',
  trussLayer: reqTruss = 'TRUSSES',
  pitchDeg: pDeg,
  angleDeg,
  roofAngle,
  unit: uOpt,
  units,
  cadUnits,
  sample = 0.45
 } = opts;
 const pitchVal = Number(pDeg ?? angleDeg ?? roofAngle ?? 22.5);
 const unitVal = uOpt ?? units ?? cadUnits ?? 'auto';

 const info = inspectDXF(text);
 const scale = dxfUnitScale(info.insunits, unitVal);
 const sameLayer = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

 if (!info.entities.length) throw Error('DXF file contains no LINE or LWPOLYLINE drawing entities.');

 let roof = info.entities.filter(e => sameLayer(e.layer, reqRoof));
 let actualRoofLayer = reqRoof;
 if (!roof.length) {
  const roofMatch = info.layers.find(l => /roof|outline|boundary|wall/i.test(l)) || info.layers[0];
  if (roofMatch) {
   roof = info.entities.filter(e => sameLayer(e.layer, roofMatch));
   actualRoofLayer = roofMatch;
  }
 }
 if (!roof.length) roof = info.entities;

 let layout = info.entities.filter(e => sameLayer(e.layer, reqTruss));
 let actualTrussLayer = reqTruss;
 if (!layout.length) {
  const trussMatch = info.layers.find(l => !sameLayer(l, actualRoofLayer) && /truss|wall|frame|layout|0/i.test(l))
    || info.layers.find(l => !sameLayer(l, actualRoofLayer))
    || info.layers[0];
  if (trussMatch) {
   layout = info.entities.filter(e => sameLayer(e.layer, trussMatch));
   actualTrussLayer = trussMatch;
  }
 }
 if (!layout.length) layout = info.entities;

 let closed = roof.filter(e => e.closed && e.points.length >= 3);
 if (!closed.length) {
  closed = info.entities.filter(e => e.closed && e.points.length >= 3);
 }

 let boundary = [];
 if (closed.length) {
  boundary = [...closed].sort((a, b) => area(b.points) - area(a.points))[0].points.map(p => p.map(x => x * scale));
 } else {
  const allPts = info.entities.flatMap(e => e.points);
  if (!allPts.length) throw Error('No valid coordinate points found in DXF entities.');
  const xs = allPts.map(p => p[0] * scale), ys = allPts.map(p => p[1] * scale);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  boundary = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
 }

 const roofSegs = roof.flatMap(segmentsOf).map(s => s.map(p => p.map(x => x * scale)));
 const boundSegs = [];
 for (let i = 0; i < boundary.length; i++) boundSegs.push([boundary[i], boundary[(i + 1) % boundary.length]]);

 const pitch = Math.tan(Number(pitchVal) * Math.PI / 180);
 if (!Number.isFinite(pitch) || pitch <= 0 || pitch > 5) throw Error('Roof angle must be between 1° and about 78°.');

 const axes = [];
 let sourceId = 0;
 const height = p => Math.min(...boundSegs.map(([a, b]) => pointSegDist(p, a, b))) * pitch;

 for (const ent of layout) {
  for (const [aa, bb] of segmentsOf(ent)) {
   const a = aa.map(x => x * scale), b = bb.map(x => x * scale), L = hypot(a, b);
   if (L < .05) continue;
   const ts = [0, 1];
   for (const [c, d] of roofSegs) {
    const t = intersect(a, b, c, d);
    if (t !== null) ts.push(t);
   }
   const n = Math.max(1, Math.ceil(L / sample));
   for (let k = 1; k < n; k++) ts.push(k / n);
   const tt = dedupe(ts, Math.max(1e-6, .002 / L));
   const pts = tt.map(t => {
    const p = mix(a, b, t);
    return [p[0], p[1], pointInPoly(p, boundary) ? height(p) : 0];
   });
   const keep = [pts[0]];
   for (let k = 1; k < pts.length - 1; k++) {
    const p0 = keep.at(-1), p = pts[k], p1 = pts[k + 1];
    const v1 = [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]];
    const v2 = [p1[0] - p[0], p1[1] - p[1], p1[2] - p[2]];
    const c = Math.hypot(v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]);
    if (c > 1e-4 * Math.max(1, L)) keep.push(p);
   }
   keep.push(pts.at(-1));
   for (let k = 1; k < keep.length; k++) {
    const A = keep[k - 1], B = keep[k];
    if (Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) > .02) {
     axes.push({ name: `CAD-${++sourceId}`, a: A, b: B, source: sourceId, cad: true });
    }
   }
  }
 }

 if (!axes.length) throw Error('No usable truss layout lines could be reconstructed from the DXF file.');

 const all = axes.flatMap(x => [x.a, x.b]);
 const min = [0, 1, 2].map(i => Math.min(...all.map(p => p[i])));
 const max = [0, 1, 2].map(i => Math.max(...all.map(p => p[i])));
 const origin = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
 const centered = axes.map(a => ({ ...a, a: a.a.map((x, i) => x - origin[i]), b: a.b.map((x, i) => x - origin[i]) }));

 return {
  axes: centered,
  meshes: [],
  origin,
  bounds: max.map((x, i) => x - min[i]),
  cad: {
   roofLayer: actualRoofLayer,
   trussLayer: actualTrussLayer,
   pitchDeg: Number(pitchVal),
   unitScale: scale,
   insunits: info.insunits,
   roofEntityCount: roof.length,
   trussEntityCount: layout.length,
   generatedAxisCount: centered.length,
   boundary: boundary.map(p => [p[0] - origin[0], p[1] - origin[1], 0])
  }
 };
}
