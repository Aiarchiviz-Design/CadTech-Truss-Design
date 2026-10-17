// V9.9.5 regression: shop-drawing style truss elevation + board-level member schedule. Run: node test-truss-drawing-v99.mjs
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {templateMembers} from './advanced.js';
import {drawTrussElevation,trussSchedule,elevationHeight} from './truss-drawing.js';
import {woodTakeoff} from './takeoff.js';
import {makeReport} from './report.js';
const txt=fs.readFileSync(new URL('./TRUSSES.dxf',import.meta.url),'utf8');
const asm=assembleRoof(parseRoofDXF(txt,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),{heel:.25,panel:1.2});
for(const t of asm.trusses){t.members=templateMembers(t,{panel:1.2,overhang:.6});t.span=t.span||1;t.height=t.height||1;}
const to=woodTakeoff(asm);
const fm=m=>(m*39.37).toFixed(1),dim=m=>fm(m),api=()=>{const c=[];return {c,text:()=>c.push('T'),line:()=>c.push('L'),dim,dimShort:dim};};
let drawn=0;
for(const t of asm.trusses){
  const rows=trussSchedule(t,asm),take=to.rows.filter(r=>r.truss===t.id);
  if(rows.length!==take.length)throw Error(`${t.id}: schedule has ${rows.length} boards, take-off ${take.length}`);
  if(new Set(rows.map(r=>r.mark)).size!==rows.length)throw Error(t.id+': duplicate marks');
  rows.forEach((r,i)=>{if(Math.abs(r.cutM-take[i].cutM)>1e-6)throw Error(`${t.id} ${r.mark}: drawing/schedule length differs from take-off`);
    for(const a of [r.angA,r.angB])if(!(a>=0&&a<90))throw Error(`${t.id} ${r.mark}: cut angle ${a}`);});
  const h=elevationHeight(t,asm,531,340);if(!(h>=200&&h<=340))throw Error(t.id+': drawing height '+h);
  const A=api(),res=drawTrussElevation(A,t,asm,{x:32,y:100,w:531,h},{schedule:rows});
  if(!res||!(res.scale>0)||A.c.length<40)throw Error(t.id+': drawing empty');drawn++;
}
// the full end stud is drawn full width in the schedule too: a vertical web with a flat cut has 0 degree ends
const pdf=Buffer.from(makeReport('T',asm,{trib:2,dead:15,roofLive:20,limit:360,woodGrade:'SPF-No2'},'imperial')).toString('latin1');
for(const need of ['Cut angles A / B','OVERALL','TOP CHORD','SPF NO.2','Marks refer to the elevation'])if(!pdf.includes(need))throw Error('PDF missing: '+need);
console.log(`V9.9.5 truss shop drawings PASS (${drawn} trusses drawn, schedule = take-off boards)`);
