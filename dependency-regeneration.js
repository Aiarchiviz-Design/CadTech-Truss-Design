// CadTech dependency regeneration coordinator.
// Geometry coordination only; engineering pass/fail remains owned by the analysis engines.
import {applyWallOpenings,addFloorOpenings,tracePointLoads} from './whole-building-pro.js';
import {buildDependencyGraph,exactLoadPathReview,runClashQA,assignHardware,serviceQA} from './building-intelligence.js';
const now=()=>new Date().toISOString();
export function markDirty(model,ids=[],reason='property edit'){
 model.dirty=model.dirty||{}; for(const id of ids)model.dirty[id]={reason,time:now()};
 model.regeneration=model.regeneration||{revision:0,history:[]}; return Object.keys(model.dirty);
}
export function regenerateAffected(model,roof,seedIds=[],opt={}){
 const started=now(), touched=new Set(seedIds), g=model.relationshipGraph;
 if(g){let changed=true;while(changed){changed=false;for(const e of g.edges||[]){if(touched.has(e.from)&&!touched.has(e.to)){touched.add(e.to);changed=true;}if(['bears-on','truss-to-truss'].includes(e.relation)&&touched.has(e.to)&&!touched.has(e.from)){touched.add(e.from);changed=true;}}}}
 const wallIds=[...touched].filter(id=>(model.walls||[]).some(w=>w.id===id));
 const floorLevels=new Set(); for(const id of touched){const m=String(id).match(/(?:FLOOR-L|F)(\d+)/i);if(m)floorLevels.add(Number(m[1]));}
 // Reframe walls while preserving their existing openings.
 if(wallIds.length){const openings=[];for(const w of model.walls||[])for(const o of w.openings||[])openings.push({...o,level:w.level,side:w.side});applyWallOpenings(model,openings);}
 // Reframe floor detailing while preserving openings.
 if(floorLevels.size){const openings=[];for(const f of model.floors||[])for(const o of f.openings||[])openings.push({...o,level:f.level});addFloorOpenings(model,openings);}
 // Always refresh support/load relationships after a structural property edit.
 tracePointLoads(model,roof); exactLoadPathReview(model,roof); buildDependencyGraph(model,roof); runClashQA(model,roof);
 if(model.hardware)assignHardware(model); if(model.serviceZones?.length)serviceQA(model);
 model.regeneration=model.regeneration||{revision:0,history:[]}; model.regeneration.revision++;
 const rec={revision:model.regeneration.revision,started,finished:now(),seed:[...seedIds],touched:[...touched],wallsReframed:wallIds.length,floorLevels:[...floorLevels],qa:model.qa?.status||'REVIEW'};
 model.regeneration.history.push(rec); model.dirty={}; return rec;
}
export function regenerationCSV(model){return ['Revision,Started,Finished,Seed,Touched,Walls reframed,Floor levels,QA',...(model.regeneration?.history||[]).map(r=>[r.revision,r.started,r.finished,r.seed.join(';'),r.touched.join(';'),r.wallsReframed,r.floorLevels.join(';'),r.qa].map(csv).join(','))].join('\r\n');}
function csv(v){const s=String(v??'');return /[,"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
