// CadTech whole-building framing extension: floor trusses, EWP/I-joists/LVL, wall panels and load-path ledger.
const FT=.3048, PSF=47.88025898, KIP=4.448221615;
export const EWP_TYPES={
 'I-Joist 9-1/2':{depthIn:9.5,weightPlf:2.2},'I-Joist 11-7/8':{depthIn:11.875,weightPlf:2.5},'I-Joist 14':{depthIn:14,weightPlf:2.9},'I-Joist 16':{depthIn:16,weightPlf:3.2},
 'LVL 1-3/4x9-1/2':{depthIn:9.5,widthIn:1.75,weightPlf:3.8},'LVL 1-3/4x11-7/8':{depthIn:11.875,widthIn:1.75,weightPlf:4.7},'LVL 1-3/4x14':{depthIn:14,widthIn:1.75,weightPlf:5.5},'LVL 1-3/4x16':{depthIn:16,widthIn:1.75,weightPlf:6.3},'LVL 1-3/4x18':{depthIn:18,widthIn:1.75,weightPlf:7.1},
 'LSL 1-3/4x11-7/8':{depthIn:11.875,widthIn:1.75,weightPlf:4.8},'PSL 3-1/2x11-7/8':{depthIn:11.875,widthIn:3.5,weightPlf:9.6},'Glulam 3-1/8x12':{depthIn:12,widthIn:3.125,weightPlf:8.5},'Rim Board 1-1/8x11-7/8':{depthIn:11.875,widthIn:1.125,weightPlf:3.2}
};
const n=v=>Number(v)||0, round=v=>Math.round(v*1000)/1000;
export function buildWholeBuilding(o={}){
 const width=n(o.widthFt)||30,length=n(o.lengthFt)||25,levels=Math.max(1,Math.min(6,Math.round(n(o.levels)||2))),spacing=Math.max(0.5,n(o.spacingFt)||1.333),wallH=Math.max(6,n(o.wallHeightFt)||8),studSpacing=Math.max(0.5,n(o.studSpacingFt)||1.333);
 const floorSystem=o.floorSystem||'Floor truss', ewp=o.ewpType||'I-Joist 11-7/8', orientation=o.orientation==='length'?'length':'width';
 const span=orientation==='width'?width:length, run=orientation==='width'?length:width, count=Math.floor(run/spacing)+1;
 const floors=[]; for(let level=2;level<=levels;level++){const members=[];for(let i=0;i<count;i++){const pos=Math.min(run,i*spacing);members.push({id:`F${level}-${i+1}`,kind:floorSystem,section:floorSystem==='Floor truss'?`${n(o.floorDepthIn)||16} in floor truss`:ewp,spanFt:round(span),positionFt:round(pos),status:'REVIEW'});}floors.push({level,spanFt:span,runFt:run,members});}
 const walls=[]; const perimeter=[['N',width],['S',width],['E',length],['W',length]];for(let level=1;level<=levels;level++)for(const [side,len] of perimeter){const studs=Math.floor(len/studSpacing)+1;walls.push({id:`W${level}-${side}`,level,side,lengthFt:len,heightFt:wallH,studSize:o.studSize||'2x6',studs,openings:[],status:'REVIEW'});}
 const beams=[]; if(o.addCenterBeam){const beamLen=orientation==='width'?length:width;beams.push({id:'B1',kind:'LVL',section:o.lvlType||'LVL 1-3/4x14',plies:Math.max(1,Math.round(n(o.lvlPlies)||2)),lengthFt:beamLen,status:'DESIGN REQUIRED'});}
 return {version:1,levels,widthFt:width,lengthFt:length,floorSystem,ewpType:ewp,orientation,spacingFt:spacing,wallHeightFt:wallH,studSpacingFt:studSpacing,floors,walls,beams,loads:null};
}
export function transferWholeBuildingLoads(model,roofAssembly,o={}){
 const floorDead=n(o.floorDead)||15,floorLive=n(o.floorLive)||40,wallDead=n(o.wallDead)||10,roofReactionFactor=Math.max(0,n(o.roofReactionFactor)||1);
 const roofReactions=(roofAssembly?.trusses||[]).reduce((s,t)=>s+(t.analysis?.reactions||[]).reduce((a,r)=>a+Math.max(0,n(r.Ry??r.y??r)),0),0)*roofReactionFactor;
 const floorArea=model.widthFt*model.lengthFt, floorGravity=(floorDead+floorLive)*floorArea*PSF/1000;
 const wallGravity=model.walls.reduce((s,w)=>s+w.lengthFt*w.heightFt*wallDead*PSF/1000,0);
 const levels=[]; let cumulative=roofReactions;for(let level=model.levels;level>=1;level--){if(level>=2)cumulative+=floorGravity;const wl=model.walls.filter(w=>w.level===level).reduce((s,w)=>s+w.lengthFt*w.heightFt*wallDead*PSF/1000,0);cumulative+=wl;levels.push({level,roofInputKN:round(level===model.levels?roofReactions:0),floorInputKN:round(level>=2?floorGravity:0),wallInputKN:round(wl),cumulativeToLevelBelowKN:round(cumulative),status:'LOAD PATH ONLY'});}
 const foundationKN=round(cumulative); model.loads={inputs:{floorDeadPsf:floorDead,floorLivePsf:floorLive,wallDeadPsf:wallDead},roofReactionsKN:round(roofReactions),floorGravityPerLevelKN:round(floorGravity),wallGravityKN:round(wallGravity),levels,foundationKN,status:'DESIGN REQUIRED',note:'Gravity load-path ledger only. Connections, openings, point-load distribution, diaphragm/shear, lateral/wind/seismic and foundation capacity are not solved.'};return model.loads;
}
export function wholeBuildingTakeoff(model){
 const rows=[];for(const f of model.floors)for(const m of f.members)rows.push({category:'Floor framing',level:f.level,id:m.id,type:m.kind,section:m.section,qty:1,length_ft:m.spanFt});for(const w of model.walls)rows.push({category:'Wall panel',level:w.level,id:w.id,type:'Stud wall',section:w.studSize,qty:w.studs,length_ft:w.heightFt});for(const b of model.beams)rows.push({category:'EWP/LVL',level:'—',id:b.id,type:b.kind,section:b.section,qty:b.plies,length_ft:b.lengthFt});return rows;
}
export function wholeBuildingCSV(model){const rows=wholeBuildingTakeoff(model),cols=['category','level','id','type','section','qty','length_ft'];return [cols.join(','),...rows.map(r=>cols.map(c=>r[c]).join(','))].join('\n');}
export function loadPathCSV(model){const rows=model.loads?.levels||[],cols=['level','roofInputKN','floorInputKN','wallInputKN','cumulativeToLevelBelowKN','status'];return [cols.join(','),...rows.map(r=>cols.map(c=>r[c]).join(','))].join('\n');}


export function validateWholeBuildingIntegration(model,roofAssembly){
 const issues=[],checks=[];
 const roofCount=roofAssembly?.trusses?.length||0;
 checks.push({system:'Roof',ok:roofCount>0,detail:roofCount?`${roofCount} roof trusses connected to building model`:'No generated roof assembly'});
 const expectedFloors=Math.max(0,(model?.levels||1)-1),floorLevels=model?.floors?.length||0;
 checks.push({system:'Floors',ok:floorLevels===expectedFloors,detail:`${floorLevels}/${expectedFloors} framed floor levels`});
 const expectedWalls=(model?.levels||1)*4,wallCount=model?.walls?.length||0;
 checks.push({system:'Walls',ok:wallCount>=expectedWalls,detail:`${wallCount} perimeter wall panels across ${model?.levels||0} storeys`});
 const hasLedger=!!model?.loads?.levels?.length;
 checks.push({system:'Gravity load path',ok:hasLedger,detail:hasLedger?`Roof/floor/wall ledger reaches foundation: ${model.loads.foundationKN} kN`:'Run whole-building load path'});
 const pointCount=model?.pointLoads?.length||0,red=model?.alignment?.red||0;
 checks.push({system:'Point-load tracing',ok:pointCount===0||red===0,detail:pointCount?`${pointCount} roof reaction paths traced; ${red} unsupported`:'Run point-load/alignment trace'});
 if(!roofCount)issues.push('Roof assembly is missing.');
 if(floorLevels!==expectedFloors)issues.push('Floor-storey count does not match building storeys.');
 if(wallCount<expectedWalls)issues.push('Perimeter wall framing is incomplete.');
 if(!hasLedger)issues.push('Whole-building gravity load transfer has not been calculated.');
 if(red)issues.push(`${red} vertical load paths are unsupported.`);
 if(model?.importSummary){checks.unshift({system:'Imported building',ok:true,detail:`${model.importSummary.format} ${model.importSummary.recognition}: ${model.importSummary.walls} wall segments, ${model.importSummary.openings} openings, ${model.importSummary.floorOpenings} floor openings`});for(const w of (model.importWarnings||[]))issues.push(w);}
 const status=issues.length?'REVIEW / DESIGN REQUIRED':'CONNECTED / REVIEW';
 model.integration={status,checks,issues,note:'CadTech roof, floor and wall data are linked for schedules and approximate gravity/load-path tracing. Exact XY bearing alignment, stiffness distribution, lateral/shear/diaphragm transfer, connection design and manufacturer-specific EWP/LVL capacities require validated engineering data/solver checks.'};
 return model.integration;
}
