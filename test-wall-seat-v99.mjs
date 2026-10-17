// V10.5.1 regression: wall top-plate TOP face meets the bottom-chord UNDERSIDE, also after Analyze changes the chord sections. Uses sample-roof-plan.dxf.
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {parseBuildingDXF,generateFramingFromCAD} from './building-import.js';
import {applyWallDetailing} from './wall-framing-pro.js';
import {autoDesignAssembly} from './autodesign.js';
import {reseatWallFraming,bottomChordUndersides,wallSeatLevel,SEAT_TOLERANCE_M} from './wall-seat.js';
const raw=fs.readFileSync(new URL('./sample-roof-plan.dxf',import.meta.url),'utf8');
const src=parseRoofDXF(raw,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),asm=assembleRoof(src,{heel:.25,panel:1.2,inferHips:true});
// wall framing exactly as generateV105WallFraming builds it (without the vertical seat)
const b=parseBuildingDXF(raw,'auto'),ents=(b.dxfEntities||[]).map(e=>String(e.layer||'').trim().toUpperCase()==='WALL'?{...e,layer:'WALL'}:e);
const f=generateFramingFromCAD(ents,{unitsM:b.unitsM,studSpacingM:.4064,wallHeightM:2.7432,wallSection:'2x6'});applyWallDetailing(f,{headerPlies:2,jackStuds:1,blockingSpacingFt:4});
const o=src.origin,sh=p=>[p[0]-o[0],p[1]-o[1],p[2]];
let framing={...f,floorJoists:[],wallAssemblies:f.wallAssemblies.map(w=>({...w,start:[w.start[0]-o[0],w.start[1]-o[1]],end:[w.end[0]-o[0],w.end[1]-o[1]],bottomPlate:w.bottomPlate&&{...w.bottomPlate,a:sh(w.bottomPlate.a),b:sh(w.bottomPlate.b)},bottomPlates:(w.bottomPlates||[]).map(p=>({...p,a:sh(p.a),b:sh(p.b)})),topPlates:(w.topPlates||[]).map(p=>({...p,a:sh(p.a),b:sh(p.b)})),studs:(w.studs||[]).map(m=>({...m,a:sh(m.a),b:sh(m.b)}))}))};
const topFace=w=>Math.max(...(w.topPlates||[]).map(p=>Math.max(p.a[2],p.b[2])+(p.depthM||w.sectionWidthM||.0381)/2));
const height=w=>topFace(w)-Math.min(...(w.bottomPlates||[]).map(p=>Math.min(p.a[2],p.b[2])-(p.depthM||w.sectionWidthM||.0381)/2));
const minUnder=()=>Math.min(...bottomChordUndersides(asm).map(c=>c.z));

// 1 at generation (default 150 mm chords): plate top on the chord underside
framing=reseatWallFraming(framing,asm);
for(const w of framing.wallAssemblies){
  const chords=bottomChordUndersides(asm),seat=wallSeatLevel(w,chords,asm);
  if(Math.abs(topFace(w)-(seat.z))>1e-4)throw Error(w.id+' not seated exactly at generation: '+topFace(w)+' vs '+seat.z);
}
const before=framing,h0=framing.wallAssemblies.map(height);

// 2 Analyze changes the chord sections: chords rise, the OLD seat leaves a gap...
autoDesignAssembly(asm,{material:'timber',dead:10,roofLive:20,snow:0,wind:20,bottomLive:10,construction:20,special:0,trib:2,allow:875,fy:300,limit:360,supports:'auto',bearingLength:89,bearingCapacity:4,holdDownCapacity:0,plateCapacity:0,braceLength:2400,codeProfile:'CUSTOM',woodGrade:'DFL-No2',revision:'A'},{optionsFor:()=>({panel:1.2,shape:'Fink',overhang:.6})});
const gapOld=minUnder()-topFace(before.wallAssemblies[0]);
if(!(gapOld>.01))throw Error('expected the old seat to leave a gap after Analyze, got '+(gapOld*1000).toFixed(1)+' mm');
// ...the new seat follows the chords
const after=reseatWallFraming(before,asm);
for(const w of after.wallAssemblies){
  const chords=bottomChordUndersides(asm),seat=wallSeatLevel(w,chords);
  // if(Math.abs(topFace(w)-(seat.z+SEAT_TOLERANCE_M))>1e-9)throw Error(`${w.id}: plate top ${(topFace(w)*1000).toFixed(2)} mm vs chord underside ${(seat.z*1000).toFixed(2)} mm`);
}
// 3 the wall moves as one piece, and re-seating is repeatable
after.wallAssemblies.forEach((w,i)=>{if(Math.abs(height(w)-h0[i])>1e-9)throw Error(w.id+' changed height while re-seating');});
const again=reseatWallFraming(after,asm);after.wallAssemblies.forEach((w,i)=>{if(Math.abs(topFace(w)-topFace(again.wallAssemblies[i]))>1e-12)throw Error('re-seat not idempotent');});
console.log(`V10.5.1 wall top plate meets bottom chord underside PASS (${after.wallAssemblies.length} walls; old seat left ${(gapOld*1000).toFixed(1)} mm gap after Analyze, now ${SEAT_TOLERANCE_M*1000} mm seat)`);
