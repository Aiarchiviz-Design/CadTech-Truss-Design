// V9.9 regression: trusses whose end lands on the side of a perpendicular truss must be cut flush (have a connection), not pass through it.
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {memberSolid} from './connection-geometry.js';
const txt=fs.readFileSync(new URL('./TRUSSES.dxf',import.meta.url),'utf8');
const asm=assembleRoof(parseRoofDXF(txt,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),{heel:.25,panel:1.2});
const by=Object.fromEntries(asm.trusses.map(t=>[t.id,t]));
for(const id of ['FJ12','FJ13','FJ14','FJ15','FJ16']){
  if(!by[id].connections.some(c=>c.to==='SJ17'))throw Error(id+' must connect flush to side jack SJ17');
}
if(!by.SD05.connections.length)throw Error('SD05 stepdown ends must be flush to the front jacks');
for(const t of asm.trusses)if(t.connections.length>2)throw Error(t.id+' has more than two end connections');
// V9.9.1: a side jack that CARRIES front jacks must not be cut by them (SJ17 keeps its end on common C07),
// and a jack that stops short of a perpendicular truss is extended to it (SJ14 -> FJ17).
if(by.SJ17.connections.some(c=>/^FJ/.test(c.to)))throw Error('SJ17 (receiver) must not be cut by the front jacks that land on it');
if(!by.SJ17.connections.some(c=>c.to==='C07'))throw Error('SJ17 must connect to common C07');
if(!by.SJ14.connections.some(c=>c.to==='FJ17'))throw Error('SJ14 must be extended to and connect with FJ17');
// V9.9.2: the end stud at a flush cut keeps its FULL width (it used to be cut to a ~25 mm sliver by the receiver face)
let studs=0;
for(const t of asm.trusses){
  if(!t.connections.length)continue;
  for(const m of t.members){
    if(m.role!=='web'||Math.hypot(m.a[0]-m.b[0],m.a[1]-m.b[1])>.02)continue;          // vertical stud
    const hit=t.connections.some(c=>Math.hypot(c.point[0]-m.a[0],c.point[1]-m.a[1])<.12);if(!hit)continue;   // at a flush cut
    const sol=memberSolid(t,m,asm);if(sol.hidden)throw Error(t.id+' end stud vanished');
    const xs=sol.outline.map(q=>q[0]),w=Math.max(...xs)-Math.min(...xs),need=(Number(m.section?.[1])||.09)*.97;
    if(w<need)throw Error(`${t.id}: end stud only ${(w*1000).toFixed(0)} mm wide, needs ${(need*1000).toFixed(0)} mm`);studs++;
  }
}
if(studs<10)throw Error('expected many flush end studs, found '+studs);
console.log('V9.9 end-to-side flush connections PASS ('+studs+' full-width end studs)');
