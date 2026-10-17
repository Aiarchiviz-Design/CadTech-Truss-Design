// V9.9.3 regression: no overhang tail may cross another truss or another truss's tail (where two eaves meet there is no overhang),
// while ordinary eaves keep their overhang. Run: node test-eave-clash-v99.mjs
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {templateMembers} from './advanced.js';
const txt=fs.readFileSync(new URL('./TRUSSES.dxf',import.meta.url),'utf8');
const asm=assembleRoof(parseRoofDXF(txt,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),{heel:.25,panel:1.2});
const OH=.6;let tails=[],full=0;
for(const t of asm.trusses){
  full+=templateMembers({...t,eaveHits:{0:[],1:[]}},{panel:1.2,overhang:OH}).filter(m=>m.role==='overhang').length;
  t.members=templateMembers(t,{panel:1.2,overhang:OH});
  for(const m of t.members)if(m.role==='overhang')tails.push({id:t.id,a:m.a,b:m.b});
}
if(full-tails.length<8)throw Error('eave intersections should lose their overhang (dropped '+(full-tails.length)+')');
if(tails.length<full*.7)throw Error('ordinary eaves must keep their overhang');
const seg=(p,q,r,s)=>{const d=[q[0]-p[0],q[1]-p[1]],e=[s[0]-r[0],s[1]-r[1]],den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)<1e-9)return false;const w=[r[0]-p[0],r[1]-p[1]],u=(w[0]*e[1]-w[1]*e[0])/den,v=(w[0]*d[1]-w[1]*d[0])/den;return u>.02&&u<.98&&v>.02&&v<.98;};
for(let i=0;i<tails.length;i++)for(let j=i+1;j<tails.length;j++)
  if(tails[i].id!==tails[j].id&&seg(tails[i].a,tails[i].b,tails[j].a,tails[j].b))throw Error(`overhang tails of ${tails[i].id} and ${tails[j].id} cross`);
for(const T of tails)for(const r of asm.trusses){if(r.id===T.id)continue;
  for(let k=1;k<r.profile.length;k++)if(seg(T.a,T.b,r.profile[k-1],r.profile[k])){
    const v=(T.a[2]+T.b[2])/2,z=(r.profile[k-1][2]+r.profile[k][2])/2;if(v<=z+.05)throw Error(`overhang of ${T.id} runs through truss ${r.id}`);}}
console.log(`V9.9.3 eave intersections: ${full-tails.length} overhangs removed, ${tails.length} kept, none crossing PASS`);
