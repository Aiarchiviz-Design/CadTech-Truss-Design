// V9.9.8 regression: auto-design -> every truss ends PASS or FAIL (never "DESIGN REQUIRED" / "REVIEW"); jack reactions are applied to the girders.
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {analyzeAssemblyTruss} from './advanced.js';
import {autoDesignAssembly} from './autodesign.js';
const txt=fs.readFileSync(new URL('./TRUSSES.dxf',import.meta.url),'utf8');
const BASE={material:'timber',dead:10,roofLive:20,snow:0,wind:20,bottomLive:10,construction:20,special:0,trib:2,allow:875,fy:300,limit:360,supports:'auto',bearingLength:89,bearingCapacity:4,holdDownCapacity:0,plateCapacity:0,braceLength:2400,plateUnitCost:1.5,memberLaborCost:.5,codeProfile:'CUSTOM',woodGrade:'DFL-No2',revision:'A'};
const fresh=()=>assembleRoof(parseRoofDXF(txt,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),{heel:.25,panel:1.2});
const design=(over={})=>{const asm=fresh(),p={...BASE,...over},res=autoDesignAssembly(asm,p,{optionsFor:()=>({panel:1.2,shape:'Fink',overhang:.6})});return {asm,res,p};};
const D=25.4,depth=t=>Object.values(t.analysis.sections||{}).reduce((s,x)=>s+(x?.d||0),0);

// 1 default loads: everything passes, statuses are only PASS / FAIL
const {asm,res}=design();
if(res.fail!==0||res.pass!==asm.trusses.length)throw Error(`default loads: ${res.pass} pass / ${res.fail} fail: ${JSON.stringify(res.failures).slice(0,300)}`);
for(const t of asm.trusses){if(!['PASS','FAIL'].includes(t.analysis.status))throw Error(t.id+' status '+t.analysis.status);
  for(const [k,c] of Object.entries(t.engineering.checks))if(!['PASS','FAIL'].includes(c.status))throw Error(`${t.id} ${k}: ${c.status}`);
  if(!t.design||t.design.result!=='PASS')throw Error(t.id+' has no design result');}

// 2 jack reactions are applied to the girder / carrier as nodal loads and increase its reactions
const carriers=asm.trusses.filter(t=>t.engineering.transfersIn.length);
if(carriers.length<5)throw Error('expected several trusses carrying other trusses, found '+carriers.length);
for(const t of carriers){
  if(t.engineering.transfersIn.some(x=>!x.applied))throw Error(t.id+': transferred loads not applied');
  const caseName='D',sumIn=t.engineering.transfersIn.reduce((s,x)=>s+(x.cases[caseName]||0),0),rs=t.analysis.reactions.find(c=>c.case===caseName).reactions.reduce((s,r)=>s+r.force,0);
  if(!(rs>=sumIn-1e-6))throw Error(`${t.id}: reactions ${rs.toFixed(2)} kN < transferred ${sumIn.toFixed(2)} kN`);
}

// 3 point-load mechanics: equilibrium and linear sharing
{const t=fresh().trusses.find(x=>x.id==='C01'),p={...BASE,supports:'ends'};
 const run=loads=>analyzeAssemblyTruss(t,p,{panel:1.2,shape:'Fink',overhang:0,styles:['Fink'],loads,minPly:2,maxPly:2}).analysis;
 const a0=run([]),name=a0.loadCases[0].name,a1=run([{from:'X',x:t.span/2,cases:{[name]:2}}]);
 const tot=a=>a.loadCases.find(c=>c.name===name).totalVertical_kN;
 if(Math.abs((tot(a1)-tot(a0))+2)>1e-6)throw Error('point load not applied once');
 const r=a=>a.reactions.find(c=>c.case===name).reactions,a2=run([{from:'X',x:t.span/4,cases:{[name]:4}}]),d=r(a2).map((x,i)=>x.force-r(a0)[i].force);
 if(Math.abs(d[0]-3)>.05||Math.abs(d[1]-1)>.05)throw Error('load not shared 3:1 between supports: '+d);}

// 4 heavier load never gives a lighter design
{const {asm:heavy}=design({snow:40});
 for(const t of heavy.trusses){const b=asm.trusses.find(x=>x.id===t.id);
  if((t.analysis.ply||1)*depth(t)<(b.analysis.ply||1)*depth(b)-1e-6)throw Error(`${t.id}: heavier load gave a lighter design`);}}

// 5 impossible loads report FAIL with a reason (no vague status)
{const {asm:bad,res:r}=design({snow:150,supports:'ends'});
 if(!(r.fail>0))throw Error('extreme load should leave some trusses failing');
 for(const t of bad.trusses){if(t.analysis.status==='FAIL'&&!(t.design.failures.length))throw Error(t.id+' FAIL without a reason');if(/DESIGN REQUIRED|REVIEW/.test(t.analysis.status))throw Error(t.id+' vague status');}}

// 6 entered capacities are honoured: too small -> FAIL with reason, enough -> PASS
{const {asm:a1}=design({plateCapacity:3});const f=a1.trusses.filter(t=>t.engineering.checks.connections.status==='FAIL');
 if(!f.length||!f.every(t=>t.design.result==='FAIL'&&t.design.failures.some(x=>/plate capacity/.test(x))))throw Error('small entered plate capacity must FAIL with a reason');
 const {res:r2}=design({plateCapacity:500,holdDownCapacity:50});if(r2.fail!==0)throw Error('large entered capacities must pass');
 const {asm:a3}=design({holdDownCapacity:1});const h=a3.trusses.filter(t=>t.engineering.checks.uplift.perBearing>1);if(!h.length)throw Error('small hold-down capacity should need several hold-downs');}

// 7 stable: designing an already designed roof changes nothing
{const {asm:a2,res:r2}=design();for(const t of a2.trusses){const b=asm.trusses.find(x=>x.id===t.id);if(t.analysis.ply!==b.analysis.ply||Math.abs(depth(t)-depth(b))>1e-9)throw Error(t.id+' design not repeatable');}}
console.log(`V9.9.8 auto-design PASS (${asm.trusses.length} trusses all PASS, ${carriers.length} carry other trusses, FAIL reporting + entered capacities verified)`);
