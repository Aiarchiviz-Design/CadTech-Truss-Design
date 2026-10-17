// CadTech EWP framing module. Geometry/schedules only; capacities require validated manufacturer data.
const R=v=>Math.round(Number(v)*1000)/1000;
export const EWP_CATALOG={
 'I-Joist 9-1/2':{family:'I-Joist',depthIn:9.5,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375},
 'I-Joist 11-7/8':{family:'I-Joist',depthIn:11.875,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375},
 'I-Joist 14':{family:'I-Joist',depthIn:14,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375},
 'I-Joist 16':{family:'I-Joist',depthIn:16,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375},
 'LVL 1-3/4x9-1/2':{family:'LVL',widthIn:1.75,depthIn:9.5},'LVL 1-3/4x11-7/8':{family:'LVL',widthIn:1.75,depthIn:11.875},
 'LVL 1-3/4x14':{family:'LVL',widthIn:1.75,depthIn:14},'LVL 1-3/4x16':{family:'LVL',widthIn:1.75,depthIn:16},'LVL 1-3/4x18':{family:'LVL',widthIn:1.75,depthIn:18},
 'LSL 1-3/4x11-7/8':{family:'LSL',widthIn:1.75,depthIn:11.875},'PSL 3-1/2x11-7/8':{family:'PSL',widthIn:3.5,depthIn:11.875},
 'Glulam 3-1/8x12':{family:'Glulam',widthIn:3.125,depthIn:12},'Rim Board 1-1/8x11-7/8':{family:'Rim Board',widthIn:1.125,depthIn:11.875}
};
const cat=s=>EWP_CATALOG[s]||{family:String(s||'EWP'),depthIn:11.875,widthIn:1.75};
export function applyEWPFraming(model,opt={}){
 if(!model)return model; const section=opt.section||model.ewpType||'I-Joist 11-7/8',p=cat(section),blocking=Number(opt.blockingSpacingFt)||8;
 model.ewp={version:1,section,manufacturer:opt.manufacturer||'Generic / unverified',capacityStatus:'DESIGN REQUIRED',note:'Geometry and coordination only. Span, hole, bearing and connection capacities require validated manufacturer product data.'};
 for(const f of model.floors||[]){
  f.ewpSystem={section,family:p.family,depthIn:p.depthIn,manufacturer:model.ewp.manufacturer,status:'DESIGN REQUIRED'};
  for(const m of f.members||[]){if(m.kind==='I-Joist'||String(m.section).startsWith('I-Joist')){m.kind='I-Joist';m.section=section;m.profile={shape:'I',depthIn:p.depthIn,flangeWidthIn:p.flangeWidthIn||2.5,flangeDepthIn:p.flangeDepthIn||1.375,webIn:p.webIn||.375};m.bearing={minIn:1.75,status:'VERIFY PRODUCT'};m.holes={policy:'MANUFACTURER DATA REQUIRED',zones:[]};m.webStiffeners={left:'AUTO/VERIFY',right:'AUTO/VERIFY'};m.status='DESIGN REQUIRED';}}
  f.rim={section:opt.rimSection||`Rim Board 1-1/8x${p.depthIn||11.875}`,perimeterFt:R(2*(model.widthFt+model.lengthFt)),status:'VERIFY PRODUCT'};
  f.blocking={spacingFt:blocking,rows:Math.max(1,Math.floor((f.spanFt||0)/blocking)),type:'I-joist blocking / rim closure',status:'COORDINATION'};
  f.squashBlocks=(f.openingFraming||[]).map((x,i)=>({id:`F${f.level}-SB${i+1}`,at:x.opening,qty:4,status:'VERIFY REACTION / PRODUCT'}));
  f.hangers=(f.openingFraming||[]).map((x,i)=>({id:`F${f.level}-H${i+1}`,at:x.opening,type:'Joist/header hanger',status:'MANUFACTURER SELECTION REQUIRED'}));
 }
 for(const b of model.beams||[]){const q=cat(b.section);b.ewp={family:q.family,widthIn:q.widthIn,depthIn:q.depthIn,plies:b.plies||1,status:'DESIGN REQUIRED'};}
 return model;
}
export function ewpScheduleCSV(model){const h=['level','id','family','section','span_ft','depth_in','flange_width_in','web_in','bearing','holes','status'],rows=[];for(const f of model?.floors||[])for(const m of f.members||[]){const p=m.profile||cat(m.section);rows.push([f.level,m.id,m.kind,m.section,m.spanFt,p.depthIn||'',p.flangeWidthIn||'',p.webIn||'',m.bearing?.minIn||'',m.holes?.policy||'',m.status||'']);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
export function ewpAccessoriesCSV(model){const h=['level','category','id','section_or_type','qty','status'],rows=[];for(const f of model?.floors||[]){if(f.rim)rows.push([f.level,'Rim board',`F${f.level}-RIM`,f.rim.section,1,f.rim.status]);if(f.blocking)rows.push([f.level,'Blocking',`F${f.level}-BLK`,f.blocking.type,f.blocking.rows,f.blocking.status]);for(const s of f.squashBlocks||[])rows.push([f.level,'Squash blocks',s.id,s.at,s.qty,s.status]);for(const x of f.hangers||[])rows.push([f.level,'Hanger',x.id,x.type,1,x.status]);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
export function ewpSectionSVG(section='I-Joist 11-7/8') {const p=cat(section);if(p.family!=='I-Joist')return `<svg viewBox="0 0 260 180"><rect x="95" y="20" width="70" height="140" fill="#d7aa62" stroke="#684d25"/><text x="130" y="172" text-anchor="middle" font-size="12">${section}</text></svg>`;return `<svg viewBox="0 0 260 180"><rect x="65" y="20" width="130" height="20" rx="3" fill="#d7aa62"/><rect x="124" y="40" width="12" height="100" fill="#b9824d"/><rect x="65" y="140" width="130" height="20" rx="3" fill="#d7aa62"/><text x="130" y="174" text-anchor="middle" font-size="12">${section} · physical I profile</text></svg>`;}

// EWP Floor Framing PRO: coordinated geometry/detailing records. Manufacturer capacities remain unverified.
export function applyEWPPro(model,opt={}){
 applyEWPFraming(model,opt); if(!model)return model;
 const spacing=Math.max(.5,Number(opt.spacingFt)||Number(model.spacingFt)||1.333), cant=Math.max(0,Number(opt.cantileverFt)||0);
 for(const f of model.floors||[]){
  f.pro={version:2,mode:'EWP Floor Framing PRO',joistDirection:model.orientation||'width',spacingFt:spacing,cantileverFt:cant,status:'COORDINATED / DESIGN REQUIRED'};
  const openings=f.openings||[]; f.proOpeningFrames=[];
  for(const o of openings){f.proOpeningFrames.push({opening:o.id,type:o.type||'Opening',headers:2,trimmers:2,headerSection:opt.headerSection||'LVL 1-3/4x11-7/8',headerPlies:Math.max(1,Number(opt.headerPlies)||2),hanger:'MANUFACTURER SELECTION REQUIRED',status:'DESIGN REQUIRED'});}
  f.supportLines=[];
  f.supportLines.push({id:`F${f.level}-SUP-A`,type:'Bearing wall/rim',atFt:0,status:'VERIFY BEARING'});
  f.supportLines.push({id:`F${f.level}-SUP-B`,type:'Bearing wall/rim',atFt:f.spanFt,status:'VERIFY BEARING'});
  for(const b of model.beams||[])f.supportLines.push({id:`F${f.level}-${b.id}`,type:b.kind||'EWP beam',section:b.section,atFt:R(f.spanFt/2),status:'DESIGN REQUIRED'});
  f.blockingRows=Array.from({length:f.blocking?.rows||0},(_,i)=>({id:`F${f.level}-BLK${i+1}`,atFt:R((i+1)*f.spanFt/((f.blocking?.rows||0)+1)),type:'Full-depth blocking / approved I-joist blocking',status:'VERIFY PRODUCT'}));
  for(const m of f.members||[]){m.cantileverFt=cant;m.supports=f.supportLines.map(s=>s.id);m.reactions={left:'CALCULATE / VERIFY',right:'CALCULATE / VERIFY'};m.serviceZones={holes:'MANUFACTURER HOLE CHART REQUIRED',notches:'NOT PERMITTED UNLESS PRODUCT DATA ALLOWS'};m.coordinationStatus='COORDINATED';}
  f.loadPath=(f.members||[]).map(m=>({source:m.id,to:(model.beams?.[0]?.id||`W${Math.max(1,f.level-1)}-BEARING`),then:`Level ${Math.max(1,f.level-1)} wall/post`,foundation:'FOUNDATION ENDPOINT',status:'LOAD PATH / DESIGN REQUIRED'}));
 }
 model.ewp.pro=true; model.ewp.proVersion=2; model.ewp.proNote='Automatic floor framing coordination: joists, rims, support lines, openings, headers/trimmers, blocking, cantilevers and load-path records. Product capacities require validated manufacturer data.';
 return model;
}
export function ewpProCSV(model){const h=['level','member','section','span_ft','spacing_ft','cantilever_ft','supports','load_path','status'],rows=[];for(const f of model?.floors||[])for(const m of f.members||[]){const lp=(f.loadPath||[]).find(x=>x.source===m.id);rows.push([f.level,m.id,m.section,m.spanFt,f.pro?.spacingFt||'',m.cantileverFt||0,(m.supports||[]).join(' > '),lp?`${lp.to} > ${lp.then} > ${lp.foundation}`:'',m.status||'DESIGN REQUIRED']);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// v3 coordinated framing geometry: rebuilds floor members around rectangular openings.
const between=(v,a,b)=>v>=Math.min(a,b)-1e-6&&v<=Math.max(a,b)+1e-6;
const seg=(id,base,a,b,axis,pos)=>({...base,id,segment:true,startFt:R(a),endFt:R(b),spanFt:R(Math.max(0,b-a)),axis,positionFt:R(pos)});
export function regenerateEWPFloor(model,opt={}){
 applyEWPPro(model,opt); if(!model)return model;
 const spacing=Math.max(.5,Number(opt.spacingFt)||Number(model.spacingFt)||1.333), minSeg=.25;
 for(const f of model.floors||[]){
  const acrossWidth=(model.orientation||'width')==='width', span=f.spanFt, run=f.runFt;
  const openings=(f.openings||[]).map((o,i)=>{const w=Math.max(1,Number(o.widthFt)||4),l=Math.max(1,Number(o.lengthFt)||10);let x=Number(o.xFt),y=Number(o.yFt);if(!Number.isFinite(x)||x===0)x=Math.max(0,(model.widthFt-w)/2);if(!Number.isFinite(y)||y===0)y=Math.max(0,(model.lengthFt-l)/2);return {...o,id:o.id||`F${f.level}-O${i+1}`,xFt:R(x),yFt:R(y),widthFt:w,lengthFt:l};});
  const base=(f.members||[])[0]||{kind:'I-Joist',section:opt.section||model.ewpType||'I-Joist 11-7/8',status:'DESIGN REQUIRED'};
  const members=[], cutJoists=[], headers=[], trimmers=[]; let idx=0;
  for(let p=0;p<=run+1e-6;p+=spacing){const pos=Math.min(run,p),cuts=[];for(const o of openings){const cross0=acrossWidth?o.yFt:o.xFt,cross1=cross0+(acrossWidth?o.lengthFt:o.widthFt);if(!between(pos,cross0,cross1))continue;const a=acrossWidth?o.xFt:o.yFt,b=a+(acrossWidth?o.widthFt:o.lengthFt);cuts.push([Math.max(0,a),Math.min(span,b),o.id]);}cuts.sort((a,b)=>a[0]-b[0]);let cur=0;for(const [a,b,oid] of cuts){if(a-cur>=minSeg)members.push(seg(`F${f.level}-J${++idx}A`,base,cur,a,acrossWidth?'X':'Y',pos));cutJoists.push({opening:oid,positionFt:R(pos),cutStartFt:R(a),cutEndFt:R(b)});cur=Math.max(cur,b);}if(span-cur>=minSeg)members.push(seg(`F${f.level}-J${++idx}`,base,cur,span,acrossWidth?'X':'Y',pos));}
  for(const o of openings){const along0=acrossWidth?o.xFt:o.yFt,along1=along0+(acrossWidth?o.widthFt:o.lengthFt),cross0=acrossWidth?o.yFt:o.xFt,cross1=cross0+(acrossWidth?o.lengthFt:o.widthFt);const hs=opt.headerSection||'LVL 1-3/4x11-7/8',plies=Math.max(1,Number(opt.headerPlies)||2);headers.push({id:`${o.id}-H1`,opening:o.id,kind:'Opening header',section:hs,plies,axis:acrossWidth?'Y':'X',positionFt:R(along0),startFt:R(cross0-spacing),endFt:R(cross1+spacing),status:'DESIGN REQUIRED'},{id:`${o.id}-H2`,opening:o.id,kind:'Opening header',section:hs,plies,axis:acrossWidth?'Y':'X',positionFt:R(along1),startFt:R(cross0-spacing),endFt:R(cross1+spacing),status:'DESIGN REQUIRED'});trimmers.push({id:`${o.id}-T1`,opening:o.id,kind:'Double trimmer',section:base.section,plies:2,axis:acrossWidth?'X':'Y',positionFt:R(Math.max(0,cross0-spacing)),startFt:R(along0),endFt:R(along1),status:'DESIGN REQUIRED'},{id:`${o.id}-T2`,opening:o.id,kind:'Double trimmer',section:base.section,plies:2,axis:acrossWidth?'X':'Y',positionFt:R(Math.min(run,cross1+spacing)),startFt:R(along0),endFt:R(along1),status:'DESIGN REQUIRED'});}
  f.openings=openings;f.members=members;f.cutJoists=cutJoists;f.headers=headers;f.trimmers=trimmers;f.framingMembers=[...members,...headers,...trimmers];
  f.rimMembers=[{id:`F${f.level}-RIM-N`,side:'N',section:f.rim?.section},{id:`F${f.level}-RIM-S`,side:'S',section:f.rim?.section},{id:`F${f.level}-RIM-E`,side:'E',section:f.rim?.section},{id:`F${f.level}-RIM-W`,side:'W',section:f.rim?.section}];
  f.regeneration={version:3,memberCount:f.framingMembers.length,cutJoists:cutJoists.length,openingFrames:headers.length+trimmers.length,status:'COORDINATED / DESIGN REQUIRED'};
 }
 model.ewp.proVersion=3;model.ewp.lastRegeneration='EWP coordinated floor geometry v3';return model;
}
export function ewpGeometryCSV(model){const h=['level','id','kind','section','axis','position_ft','start_ft','end_ft','span_ft','plies','status'],rows=[];for(const f of model?.floors||[])for(const m of f.framingMembers||f.members||[])rows.push([f.level,m.id,m.kind,m.section,m.axis||'',m.positionFt??'',m.startFt??0,m.endFt??m.spanFt,m.spanFt??R((m.endFt||0)-(m.startFt||0)),m.plies||1,m.status||'DESIGN REQUIRED']);return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// v4 production coordination: tributary loads, reactions, accessory demand, QA and take-off.
export function coordinateEWPFloorV4(model,opt={}){
 regenerateEWPFloor(model,opt); if(!model)return model;
 const dead=Math.max(0,Number(opt.deadPsf)||15), live=Math.max(0,Number(opt.livePsf)||40);
 for(const f of model.floors||[]){
  const spacing=Number(f.pro?.spacingFt)||Number(opt.spacingFt)||1.333;
  const q=(dead+live)*spacing; // plf on typical joist; preliminary load-path demand only
  f.ewpLoads={deadPsf:dead,livePsf:live,totalPsf:R(dead+live),status:'PRELIMINARY DEMAND / PRODUCT DESIGN REQUIRED'};
  for(const m of f.members||[]){
   const L=Math.max(0,Number(m.spanFt)||Math.abs((m.endFt||0)-(m.startFt||0)));
   const total=q*L, reaction=total/2;
   m.demand={uniformPlf:R(q),totalLb:R(total),leftReactionLb:R(reaction),rightReactionLb:R(reaction),basis:'simple-span tributary demand',status:'VERIFY WITH PRODUCT DESIGN'};
   m.bearingDemand={leftLb:R(reaction),rightLb:R(reaction),requiredBearingIn:'PRODUCT DATA REQUIRED'};
  }
  f.accessoryDemand=[];
  for(const h of f.headers||[])f.accessoryDemand.push({id:`${h.id}-HANGER-A`,at:h.id,type:'Header/trimmer hanger',qty:1,status:'MANUFACTURER SELECTION REQUIRED'},{id:`${h.id}-HANGER-B`,at:h.id,type:'Header/trimmer hanger',qty:1,status:'MANUFACTURER SELECTION REQUIRED'});
  for(const t of f.trimmers||[])f.accessoryDemand.push({id:`${t.id}-PACK`,at:t.id,type:'Trimmer ply fastening',qty:t.plies||2,status:'CONNECTION DESIGN REQUIRED'});
  for(const b of f.blockingRows||[])f.accessoryDemand.push({id:`${b.id}-BLOCK`,at:b.id,type:'Blocking row',qty:Math.max(1,Math.ceil((f.runFt||0)/spacing)),status:'VERIFY PRODUCT DETAIL'});
  f.qa=[];
  for(const o of f.openings||[]){if(o.xFt<0||o.yFt<0||o.xFt+o.widthFt>(model.widthFt||0)+1e-6||o.yFt+o.lengthFt>(model.lengthFt||0)+1e-6)f.qa.push({severity:'RED',object:o.id,issue:'Opening extends outside floor boundary'});}
  for(const m of f.members||[]){if((m.spanFt||0)<.25)f.qa.push({severity:'RED',object:m.id,issue:'Very short joist segment'});if(!m.section)f.qa.push({severity:'RED',object:m.id,issue:'Missing EWP section'});}
  if(!f.qa.length)f.qa.push({severity:'GREEN',object:`Floor ${f.level}`,issue:'No geometry coordination errors detected; structural/product checks still required'});
  f.production={version:4,joists:(f.members||[]).length,headers:(f.headers||[]).length,trimmers:(f.trimmers||[]).length,rims:(f.rimMembers||[]).length,accessories:f.accessoryDemand.length,status:'COORDINATED / DESIGN REQUIRED'};
 }
 model.ewp.proVersion=4;model.ewp.lastRegeneration='EWP production coordination v4';return model;
}
export function ewpReactionCSV(model){const h=['level','member','section','uniform_plf','total_load_lb','left_reaction_lb','right_reaction_lb','bearing_status'],rows=[];for(const f of model?.floors||[])for(const m of f.members||[]){const d=m.demand||{};rows.push([f.level,m.id,m.section,d.uniformPlf??'',d.totalLb??'',d.leftReactionLb??'',d.rightReactionLb??'',m.bearingDemand?.requiredBearingIn||'PRODUCT DATA REQUIRED']);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
export function ewpTakeoffCSV(model){const h=['level','category','section','qty','total_length_ft','status'],rows=[];for(const f of model?.floors||[]){const groups=new Map();for(const m of f.framingMembers||[]){const k=`${m.kind}|${m.section}`;const g=groups.get(k)||{kind:m.kind,section:m.section,qty:0,len:0,status:m.status||'DESIGN REQUIRED'};g.qty++;g.len+=Number(m.spanFt)||Math.max(0,Number(m.endFt)-Number(m.startFt));groups.set(k,g);}for(const g of groups.values())rows.push([f.level,g.kind,g.section,g.qty,R(g.len),g.status]);if(f.rim)rows.push([f.level,'Rim board',f.rim.section,4,f.rim.perimeterFt||'',f.rim.status]);for(const a of f.accessoryDemand||[])rows.push([f.level,a.type,a.at,a.qty,'',a.status]);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
export function ewpQACSV(model){const h=['level','severity','object','issue'],rows=[];for(const f of model?.floors||[])for(const q of f.qa||[])rows.push([f.level,q.severity,q.object,q.issue]);return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// v5 product-data framework + service/hole coordination. Generic catalog never implies structural approval.
export const EWP_PRODUCT_LIBRARY={
 'Generic I-Joist 11-7/8':{family:'I-Joist',depthIn:11.875,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375,validated:false,source:'Generic geometry only'},
 'Generic I-Joist 14':{family:'I-Joist',depthIn:14,flangeWidthIn:2.5,flangeDepthIn:1.375,webIn:.375,validated:false,source:'Generic geometry only'},
 'Generic LVL 1-3/4x11-7/8':{family:'LVL',widthIn:1.75,depthIn:11.875,validated:false,source:'Generic geometry only'},
 'Generic LVL 1-3/4x14':{family:'LVL',widthIn:1.75,depthIn:14,validated:false,source:'Generic geometry only'}
};
export function registerEWPProduct(model,name,data={}){if(!model)return model;model.ewpProductLibrary=model.ewpProductLibrary||{};model.ewpProductLibrary[name]={...data,name,validated:data.validated===true};return model;}
const prod=(model,name)=>model?.ewpProductLibrary?.[name]||EWP_PRODUCT_LIBRARY[name]||null;
export function coordinateEWPV5(model,opt={}){
 coordinateEWPFloorV4(model,opt);if(!model)return model;
 const productName=opt.productName||'Generic I-Joist 11-7/8',p=prod(model,productName),services=Array.isArray(opt.services)?opt.services:[];
 model.ewp.productSelection={name:productName,validated:!!p?.validated,source:p?.source||'No product dataset',status:p?.validated?'PRODUCT DATA LOADED':'DESIGN REQUIRED'};
 for(const f of model.floors||[]){
  f.serviceChecks=[];f.productChecks=[];
  for(const m of f.members||[]){
   m.product={name:productName,validated:!!p?.validated,status:p?.validated?'CHECK AGAINST PRODUCT DATA':'DESIGN REQUIRED'};
   const L=Number(m.spanFt)||0,minBear=Number(p?.minBearingIn);
   m.productChecks={span:{actualFt:R(L),limitFt:Number.isFinite(Number(p?.maxSpanFt))?Number(p.maxSpanFt):null,status:p?.validated&&Number.isFinite(Number(p?.maxSpanFt))?(L<=Number(p.maxSpanFt)?'PASS':'FAIL'):'DESIGN REQUIRED'},bearing:{demandIn:m.bearing?.minIn||1.75,minimumIn:Number.isFinite(minBear)?minBear:null,status:p?.validated&&Number.isFinite(minBear)?((m.bearing?.minIn||1.75)>=minBear?'PASS':'FAIL'):'DESIGN REQUIRED'},holes:{status:p?.validated&&p?.holeRules?'CHECKABLE':'PRODUCT HOLE CHART REQUIRED'}};
   f.productChecks.push({member:m.id,...m.productChecks});
  }
  for(const s of services){const x=Number(s.xFt)||0,y=Number(s.yFt)||0,d=Number(s.diameterIn)||Number(s.heightIn)||0;for(const m of f.members||[]){const pos=Number(m.positionFt)||0,axis=m.axis||'X',cross=axis==='X'?y:x,along=axis==='X'?x:y;if(Math.abs(cross-pos)>(Number(opt.serviceToleranceFt)||.25))continue;const a=Number(m.startFt)||0,b=Number(m.endFt)||Number(m.spanFt)||0;if(!between(along,a,b))continue;let status='PRODUCT HOLE CHART REQUIRED',reason='No validated hole-zone data loaded';if(p?.validated&&p.holeRules){const edgeIn=Math.min(Math.abs(along-a),Math.abs(b-along))*12;const ok=d<=Number(p.holeRules.maxDiameterIn||0)&&edgeIn>=Number(p.holeRules.minEndDistanceIn||Infinity);status=ok?'PASS':'FAIL';reason=ok?'Within loaded product hole rule':'Outside loaded product hole rule';}f.serviceChecks.push({service:s.id||'SERVICE',member:m.id,diameterIn:d,alongFt:R(along),status,reason});}}
  f.v5={version:5,product:productName,productValidated:!!p?.validated,serviceChecks:f.serviceChecks.length,status:p?.validated?'PRODUCT RULES ACTIVE':'DESIGN REQUIRED'};
 }
 model.ewp.proVersion=5;model.ewp.lastRegeneration='EWP product + service coordination v5';return model;
}
export function ewpProductCheckCSV(model){const h=['level','member','product','product_validated','span_ft','span_limit_ft','span_status','bearing_demand_in','bearing_min_in','bearing_status','hole_status'],rows=[];for(const f of model?.floors||[])for(const m of f.members||[]){const c=m.productChecks||{};rows.push([f.level,m.id,m.product?.name||'',m.product?.validated?'YES':'NO',c.span?.actualFt??'',c.span?.limitFt??'',c.span?.status||'DESIGN REQUIRED',c.bearing?.demandIn??'',c.bearing?.minimumIn??'',c.bearing?.status||'DESIGN REQUIRED',c.holes?.status||'PRODUCT HOLE CHART REQUIRED']);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
export function ewpServiceCheckCSV(model){const h=['level','service','member','diameter_in','along_ft','status','reason'],rows=[];for(const f of model?.floors||[])for(const s of f.serviceChecks||[])rows.push([f.level,s.service,s.member,s.diameterIn,s.alongFt,s.status,s.reason]);return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// V6 graphical EWP editor + physical 3D framing records.
export function buildEWPV6Editor(model,opt={}){
 coordinateEWPV5(model,opt); if(!model)return model;
 const selected=opt.selectedId||model.ewp?.editor?.selectedId||'';
 model.ewp.editor={version:6,selectedId:selected,mode:'GRAPHICAL EWP FLOOR EDITOR',status:'ACTIVE'};
 for(const f of model.floors||[]){
  f.ewp3D=[];
  for(const m of f.framingMembers||f.members||[]){
   const p=m.profile||cat(m.section); const L=Number(m.spanFt)||Math.max(0,Number(m.endFt||0)-Number(m.startFt||0));
   const base={id:m.id,level:f.level,kind:m.kind,section:m.section,lengthFt:R(L),axis:m.axis||'x',positionFt:Number(m.positionFt)||0,startFt:Number(m.startFt)||0,endFt:Number(m.endFt)||L,status:m.status||'DESIGN REQUIRED'};
   if(p.family==='I-Joist') f.ewp3D.push({...base,shape:'I',depthIn:p.depthIn,flangeWidthIn:p.flangeWidthIn,flangeThicknessIn:p.flangeThicknessIn||1.5,webIn:p.webIn});
   else f.ewp3D.push({...base,shape:'RECT',widthIn:(p.widthIn||1.75)*(m.plies||1),depthIn:p.depthIn||11.875,plies:m.plies||1});
  }
 }
 model.ewp.proVersion=6;model.ewp.lastRegeneration='EWP graphical editor + physical 3D records v6';return model;
}
export function ewpEditorObjects(model,level=1){const f=(model?.floors||[]).find(x=>Number(x.level)===Number(level));return (f?.framingMembers||f?.members||[]).map(m=>({id:m.id,kind:m.kind,section:m.section,spanFt:m.spanFt||R((m.endFt||0)-(m.startFt||0)),axis:m.axis||'',positionFt:m.positionFt??'',plies:m.plies||1,status:m.status||'DESIGN REQUIRED'}));}
export function updateEWPMemberV6(model,id,patch={}){for(const f of model?.floors||[]){const m=(f.framingMembers||f.members||[]).find(x=>x.id===id);if(!m)continue;if(patch.section&&EWP_CATALOG[patch.section]){m.section=patch.section;m.profile=cat(patch.section);}if(Number.isFinite(Number(patch.plies)))m.plies=Math.max(1,Math.min(6,Number(patch.plies)));if(Number.isFinite(Number(patch.positionFt)))m.positionFt=Number(patch.positionFt);if(Number.isFinite(Number(patch.startFt)))m.startFt=Number(patch.startFt);if(Number.isFinite(Number(patch.endFt)))m.endFt=Number(patch.endFt);m.spanFt=R(Math.max(0,(m.endFt??m.spanFt)-(m.startFt??0)));m.status='DESIGN REQUIRED';model.ewp=model.ewp||{};model.ewp.editor={...(model.ewp.editor||{}),selectedId:id,lastEdit:new Date().toISOString()};return {ok:true,level:f.level,member:m};}return {ok:false,message:'EWP member not found'};}
export function ewp3DCSV(model){const h=['level','id','kind','section','shape','axis','position_ft','start_ft','end_ft','length_ft','width_or_flange_in','depth_in','web_in','status'],rows=[];for(const f of model?.floors||[])for(const m of f.ewp3D||[])rows.push([f.level,m.id,m.kind,m.section,m.shape,m.axis,m.positionFt,m.startFt,m.endFt,m.lengthFt,m.shape==='I'?m.flangeWidthIn:m.widthIn,m.depthIn,m.webIn||'',m.status]);return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// V7 CAD-like floor framing editor. Geometry coordination only; structural capacities remain product-data dependent.
const floorAt=(model,level)=> (model?.floors||[]).find(f=>Number(f.level)===Number(level));
const memberArray=f=>f?(f.framingMembers||(f.framingMembers=[...(f.members||[])])):[];
const uid=(prefix,arr)=>{let n=1;while(arr.some(x=>x.id===`${prefix}${n}`))n++;return `${prefix}${n}`;};
export function buildEWPV7CAD(model,opt={}){
 buildEWPV6Editor(model,opt);if(!model)return model;model.ewp.editor={...(model.ewp.editor||{}),version:7,mode:'CAD FLOOR FRAMING EDITOR'};
 for(const f of model.floors||[]){memberArray(f);f.v7={version:7,dirty:false,lastAction:'build',status:'COORDINATED / DESIGN REQUIRED'};}
 model.ewp.proVersion=7;model.ewp.lastRegeneration='EWP CAD floor framing editor v7';return model;
}
export function addEWPMemberV7(model,level,opt={}){const f=floorAt(model,level);if(!f)return {ok:false,message:'Floor level not found'};const a=memberArray(f),kind=opt.kind||'I-Joist',axis=(opt.axis||'X').toUpperCase(),section=opt.section||'I-Joist 11-7/8',start=Number(opt.startFt)||0,end=Number.isFinite(Number(opt.endFt))?Number(opt.endFt):(f.spanFt||10),pos=Number(opt.positionFt)||0,id=uid(`F${f.level}-${kind==='Beam'?'B':'J'}V7-`,a),m={id,kind:kind==='Beam'?'EWP Beam':'I-Joist',section,axis,positionFt:R(pos),startFt:R(Math.min(start,end)),endFt:R(Math.max(start,end)),spanFt:R(Math.abs(end-start)),plies:Math.max(1,Number(opt.plies)||1),profile:cat(section),status:'DESIGN REQUIRED',editorCreated:true};a.push(m);f.v7={version:7,dirty:true,lastAction:`add ${id}`};return {ok:true,member:m};}
export function deleteEWPMemberV7(model,id){for(const f of model?.floors||[]){const a=memberArray(f),i=a.findIndex(x=>x.id===id);if(i>=0){a.splice(i,1);f.v7={version:7,dirty:true,lastAction:`delete ${id}`};return {ok:true,level:f.level};}}return {ok:false,message:'Member not found'};}
export function moveEWPMemberV7(model,id,deltaFt=0){for(const f of model?.floors||[]){const m=memberArray(f).find(x=>x.id===id);if(m){m.positionFt=R((Number(m.positionFt)||0)+(Number(deltaFt)||0));f.v7={version:7,dirty:true,lastAction:`move ${id}`};return {ok:true,member:m};}}return {ok:false,message:'Member not found'};}
export function addEWPOpeningV7(model,level,opt={}){const f=floorAt(model,level);if(!f)return {ok:false,message:'Floor level not found'};f.openings=f.openings||[];const id=uid(`F${f.level}-OV7-`,f.openings),o={id,type:opt.type||'Floor opening',xFt:R(Number(opt.xFt)||0),yFt:R(Number(opt.yFt)||0),widthFt:R(Math.max(.5,Number(opt.widthFt)||4)),lengthFt:R(Math.max(.5,Number(opt.lengthFt)||8)),editorCreated:true};f.openings.push(o);f.v7={version:7,dirty:true,lastAction:`opening ${id}`};return {ok:true,opening:o};}
export function addEWPSupportV7(model,level,opt={}){const f=floorAt(model,level);if(!f)return {ok:false,message:'Floor level not found'};f.manualSupportLines=f.manualSupportLines||[];const id=uid(`F${f.level}-SUPV7-`,f.manualSupportLines),s={id,type:opt.type||'Beam/support',axis:(opt.axis||'Y').toUpperCase(),positionFt:R(Number(opt.positionFt)||0),section:opt.section||'LVL 1-3/4x11-7/8',plies:Math.max(1,Number(opt.plies)||2),status:'DESIGN REQUIRED'};f.manualSupportLines.push(s);f.v7={version:7,dirty:true,lastAction:`support ${id}`};return {ok:true,support:s};}
export function regenerateAffectedEWPV7(model,level,opt={}){const f=floorAt(model,level);if(!f)return {ok:false,message:'Floor level not found'};const manual=[...memberArray(f).filter(x=>x.editorCreated)],opens=[...(f.openings||[])],supports=[...(f.manualSupportLines||[])];regenerateEWPFloor(model,opt);const nf=floorAt(model,level);nf.openings=opens;regenerateEWPFloor(model,opt);const rf=floorAt(model,level),a=memberArray(rf);for(const m of manual)if(!a.some(x=>x.id===m.id))a.push(m);rf.manualSupportLines=supports;rf.supportLines=[...(rf.supportLines||[]),...supports];rf.v7={version:7,dirty:false,lastAction:'affected regeneration',regeneratedMembers:a.length,openingCount:opens.length};buildEWPV6Editor(model,opt);model.ewp.editor={...(model.ewp.editor||{}),version:7,mode:'CAD FLOOR FRAMING EDITOR'};model.ewp.proVersion=7;return {ok:true,level:Number(level),members:a.length,openings:opens.length,supports:supports.length};}
export function ewpV7PlanSVG(model,level=1,selected=''){const f=floorAt(model,level);if(!f)return '<svg viewBox="0 0 900 500"><text x="20" y="40" fill="white">Floor not found</text></svg>';const W=Number(model.widthFt)||40,L=Number(model.lengthFt)||30,s=Math.min(820/Math.max(W,1),420/Math.max(L,1)),ox=40,oy=450;const xy=(x,y)=>[R(ox+x*s),R(oy-y*s)],lines=[];lines.push(`<rect x="${ox}" y="${oy-L*s}" width="${W*s}" height="${L*s}" fill="none" stroke="#90a4ae" stroke-width="2"/>`);for(const m of memberArray(f)){const axis=(m.axis||'X').toUpperCase(),p=Number(m.positionFt)||0,a=Number(m.startFt)||0,b=Number(m.endFt??m.spanFt)||0;const A=axis==='X'?xy(a,p):xy(p,a),B=axis==='X'?xy(b,p):xy(p,b),sel=m.id===selected;lines.push(`<line data-ewp-id="${m.id}" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${sel?'#ffca28':(String(m.kind).includes('Beam')?'#ef9a9a':'#d7aa62')}" stroke-width="${sel?6:3}" style="cursor:pointer"><title>${m.id} · ${m.section}</title></line>`);}for(const o of f.openings||[]){const A=xy(o.xFt,o.yFt+o.lengthFt);lines.push(`<rect x="${A[0]}" y="${A[1]}" width="${o.widthFt*s}" height="${o.lengthFt*s}" fill="#111b22" stroke="#ff8a65" stroke-width="2" stroke-dasharray="6 4"><title>${o.id}</title></rect>`);}for(const q of f.manualSupportLines||[]){const p=Number(q.positionFt)||0,A=q.axis==='X'?xy(0,p):xy(p,0),B=q.axis==='X'?xy(W,p):xy(p,L);lines.push(`<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#81d4fa" stroke-width="5" stroke-dasharray="10 4"><title>${q.id} · ${q.section}</title></line>`);}return `<svg viewBox="0 0 900 500" style="width:100%;height:500px;background:#101820;touch-action:none">${lines.join('')}<text x="40" y="485" fill="#cfd8dc" font-size="12">V7 CAD Floor Editor · click member to select · drag perpendicular to move · openings orange · supports blue</text></svg>`;}

// V8 intelligent imported-floor recognition + automatic framing proposal.
const ft8=m=>Number(m||0)/.3048;
const line8=e=>{const p=e?.pts||[];if(p.length<2)return null;return {a:[ft8(p[0][0]),ft8(p[0][1])],b:[ft8(p[p.length-1][0]),ft8(p[p.length-1][1])],layer:e.layer||''};};
const axis8=l=>Math.abs(l.b[0]-l.a[0])>=Math.abs(l.b[1]-l.a[1])?'X':'Y';
const len8=l=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]);
export function recognizeImportedFloorV8(imported,opt={}){
 if(!imported?.bbox)return {ok:false,status:'REVIEW',issues:['No imported building geometry available']};
 const W=ft8(imported.bbox.width),L=ft8(imported.bbox.length),walls=(imported.walls||[]).map(w=>({a:[ft8(w.a[0]-imported.bbox.minX),ft8(w.a[1]-imported.bbox.minY)],b:[ft8(w.b[0]-imported.bbox.minX),ft8(w.b[1]-imported.bbox.minY)],layer:w.layer||'WALL'}));
 const beams=(imported.beams||[]).map(line8).filter(Boolean).map(x=>({...x,a:[x.a[0]-ft8(imported.bbox.minX),x.a[1]-ft8(imported.bbox.minY)],b:[x.b[0]-ft8(imported.bbox.minX),x.b[1]-ft8(imported.bbox.minY)]}));
 const floorLines=(imported.floors||[]).map(line8).filter(Boolean);
 const longWalls=walls.filter(len8).sort((a,b)=>len8(b)-len8(a));
 const xSupport=longWalls.filter(x=>axis8(x)==='Y').length+beams.filter(x=>axis8(x)==='Y').length;
 const ySupport=longWalls.filter(x=>axis8(x)==='X').length+beams.filter(x=>axis8(x)==='X').length;
 let orientation=opt.orientation&&opt.orientation!=='auto'?opt.orientation:(W<=L?'width':'length');
 if(xSupport>=2&&ySupport>=2){const xSpan=W/Math.max(1,xSupport-1),ySpan=L/Math.max(1,ySupport-1);orientation=xSpan<=ySpan?'width':'length';}
 const issues=[];if(!walls.length)issues.push('No WALL-layer bearing geometry recognized; using imported envelope.');if(!floorLines.length)issues.push('No FLOOR/SLAB/DECK layer recognized; envelope used as floor boundary.');if(!beams.length)issues.push('No imported BEAM/LVL/GIRDER lines recognized.');
 return {ok:true,version:8,widthFt:R(W),lengthFt:R(L),orientation,joistAxis:orientation==='width'?'X':'Y',walls,beams,floorOpenings:[...(imported.floorOpenings||[])],confidence:walls.length>=4?'HIGH':walls.length?'MEDIUM':'LOW',issues,status:issues.length?'REVIEW':'AUTO-RECOGNIZED'};
}
export function autoFrameImportedFloorV8(model,imported,opt={}){
 const rec=recognizeImportedFloorV8(imported,opt);if(!rec.ok)return rec;
 if(!model)return {ok:false,status:'REVIEW',issues:['Whole-building model must exist before auto framing.']};
 model.widthFt=rec.widthFt||model.widthFt;model.lengthFt=rec.lengthFt||model.lengthFt;model.orientation=rec.orientation;model.spacingFt=Math.max(.5,Number(opt.spacingFt)||Number(model.spacingFt)||1.333);
 const level=Math.max(1,Number(opt.level)||1),f=floorAt(model,level);if(!f)return {ok:false,status:'REVIEW',issues:[`Floor level ${level} not found`]};
 f.spanFt=rec.orientation==='width'?model.widthFt:model.lengthFt;f.runFt=rec.orientation==='width'?model.lengthFt:model.widthFt;f.openings=(rec.floorOpenings||[]).map((o,i)=>({...o,id:o.id||`F${level}-IMP-O${i+1}`}));
 f.importedSupportLines=(rec.beams||[]).map((b,i)=>({id:`F${level}-IMP-S${i+1}`,type:'Imported beam/support',axis:axis8(b),positionFt:R(axis8(b)==='X'?(b.a[1]+b.b[1])/2:(b.a[0]+b.b[0])/2),section:opt.beamSection||'LVL 1-3/4x11-7/8',plies:Math.max(1,Number(opt.beamPlies)||2),sourceLayer:b.layer,status:'DESIGN REQUIRED'}));
 f.manualSupportLines=[...(f.manualSupportLines||[]),...f.importedSupportLines.filter(s=>!(f.manualSupportLines||[]).some(x=>x.id===s.id))];
 regenerateEWPFloor(model,{...opt,spacingFt:model.spacingFt});const rf=floorAt(model,level);rf.manualSupportLines=f.manualSupportLines;rf.supportLines=[...(rf.supportLines||[]),...f.importedSupportLines];rf.v8={version:8,recognition:rec,proposalStatus:'REVIEW BEFORE STRUCTURAL DESIGN',sourceFormat:imported.format,autoJoistDirection:rec.joistAxis,confidence:rec.confidence};
 buildEWPV7CAD(model,opt);model.ewp.proVersion=8;model.ewp.lastRegeneration='EWP intelligent imported floor auto framing v8';return {ok:true,level,orientation:rec.orientation,joistAxis:rec.joistAxis,members:(rf.framingMembers||[]).length,openings:(rf.openings||[]).length,supports:(rf.importedSupportLines||[]).length,confidence:rec.confidence,issues:rec.issues,status:'REVIEW BEFORE STRUCTURAL DESIGN'};
}
export function ewpV8RecognitionCSV(model){const h=['level','source','confidence','joist_axis','orientation','imported_supports','openings','status','issues'],rows=[];for(const f of model?.floors||[])if(f.v8){const r=f.v8.recognition||{};rows.push([f.level,f.v8.sourceFormat||'',f.v8.confidence||'',f.v8.autoJoistDirection||'',r.orientation||'',(f.importedSupportLines||[]).length,(f.openings||[]).length,f.v8.proposalStatus||'',(r.issues||[]).join(' | ')]);}return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}

// V9 wall-driven multi-zone EWP framing. Exterior walls define envelope; interior walls are candidate bearings.
const mid9=l=>[(l.a[0]+l.b[0])/2,(l.a[1]+l.b[1])/2];
const near9=(a,b,t=.65)=>Math.abs(a-b)<=t;
function classifyWallsV9(rec){const W=rec.widthFt,L=rec.lengthFt;return (rec.walls||[]).map((w,i)=>{const m=mid9(w),ax=axis8(w),outer=ax==='X'?(near9(m[1],0)||near9(m[1],L)):(near9(m[0],0)||near9(m[0],W));return {...w,id:`W9-${i+1}`,axis:ax,wallClass:outer?'OUTER':'INNER',bearingCandidate:outer||!/NON.?BEARING|PARTITION|NBR/i.test(w.layer||'')};});}
function supportPositionsV9(rec,axis){const perp=axis==='X'?'Y':'X',limit=axis==='X'?rec.widthFt:rec.lengthFt,vals=[0,limit];for(const w of rec.wallsV9||[]){if(!w.bearingCandidate||w.axis!==perp)continue;const m=mid9(w);vals.push(perp==='Y'?m[0]:m[1]);}for(const b of rec.beams||[]){if(axis8(b)!==perp)continue;const m=mid9(b);vals.push(perp==='Y'?m[0]:m[1]);}return [...new Set(vals.map(x=>R(Math.max(0,Math.min(limit,x)))) )].sort((a,b)=>a-b).filter((x,i,a)=>!i||x-a[i-1]>.25);}
export function recognizeWallDrivenFloorV9(imported,opt={}){const base=recognizeImportedFloorV8(imported,opt);if(!base.ok)return base;base.version=9;base.wallsV9=classifyWallsV9(base);const outer=base.wallsV9.filter(w=>w.wallClass==='OUTER'),inner=base.wallsV9.filter(w=>w.wallClass==='INNER'),bearingInner=inner.filter(w=>w.bearingCandidate);const sx=supportPositionsV9(base,'X'),sy=supportPositionsV9(base,'Y'),maxX=Math.max(...sx.slice(1).map((x,i)=>x-sx[i]),base.widthFt),maxY=Math.max(...sy.slice(1).map((y,i)=>y-sy[i]),base.lengthFt);base.joistAxis=opt.orientation&&opt.orientation!=='auto'?(opt.orientation==='width'?'X':'Y'):(maxX<=maxY?'X':'Y');base.orientation=base.joistAxis==='X'?'width':'length';base.supportPositions=supportPositionsV9(base,base.joistAxis);base.zones=base.supportPositions.slice(0,-1).map((p,i)=>({id:`Z${i+1}`,axis:base.joistAxis,startFt:p,endFt:base.supportPositions[i+1],spanFt:R(base.supportPositions[i+1]-p),leftSupport:i===0?'OUTER WALL':'INNER WALL / BEAM',rightSupport:i===base.supportPositions.length-2?'OUTER WALL':'INNER WALL / BEAM',status:'REVIEW'}));base.outerWalls=outer.length;base.innerWalls=inner.length;base.innerBearingCandidates=bearingInner.length;base.issues=[...(base.issues||[])];if(inner.length&&!bearingInner.length)base.issues.push('Interior walls found, but none are confirmed bearing walls; review support classification.');base.status='WALL-DRIVEN REVIEW';return base;}
export function autoFrameWallDrivenV9(model,imported,opt={}){const rec=recognizeWallDrivenFloorV9(imported,opt);if(!rec.ok)return rec;if(!model)return {ok:false,issues:['Whole-building model required']};const level=Math.max(1,Number(opt.level)||1),f=floorAt(model,level);if(!f)return {ok:false,issues:[`Floor level ${level} not found`]};model.widthFt=rec.widthFt;model.lengthFt=rec.lengthFt;model.orientation=rec.orientation;model.spacingFt=Math.max(.5,Number(opt.spacingFt)||model.spacingFt||1.333);f.spanFt=rec.joistAxis==='X'?rec.widthFt:rec.lengthFt;f.runFt=rec.joistAxis==='X'?rec.lengthFt:rec.widthFt;f.openings=(rec.floorOpenings||[]).map((o,i)=>({...o,id:o.id||`F${level}-V9-O${i+1}`}));regenerateEWPFloor(model,{...opt,spacingFt:model.spacingFt});const rf=floorAt(model,level),arr=memberArray(rf);const joists=arr.filter(m=>String(m.kind).includes('Joist'));for(const j of joists){const pos=Number(j.positionFt)||0;const zone=rec.zones.find(z=>pos>=z.startFt-.01&&pos<=z.endFt+.01);if(zone){j.zoneId=zone.id;j.wallDriven=true;}}rf.wallSupportLines=rec.wallsV9.filter(w=>w.bearingCandidate).map(w=>({id:w.id,type:w.wallClass==='OUTER'?'Exterior bearing wall':'Interior bearing candidate',axis:w.axis,positionFt:R(w.axis==='X'?mid9(w)[1]:mid9(w)[0]),sourceLayer:w.layer,status:w.wallClass==='OUTER'?'ENVELOPE SUPPORT':'REVIEW BEARING'}));rf.supportLines=[...(rf.supportLines||[]),...rf.wallSupportLines];rf.v9={version:9,recognition:rec,zones:rec.zones,outerWalls:rec.outerWalls,innerWalls:rec.innerWalls,bearingCandidates:rec.innerBearingCandidates,status:'WALL-DRIVEN / REVIEW BEARING CLASSIFICATION'};buildEWPV7CAD(model,opt);model.ewp.proVersion=9;model.ewp.lastRegeneration='EWP wall-driven multi-zone floor framing v9';return {ok:true,level,joistAxis:rec.joistAxis,zones:rec.zones.length,outerWalls:rec.outerWalls,innerWalls:rec.innerWalls,bearingCandidates:rec.innerBearingCandidates,members:arr.length,status:rf.v9.status,issues:rec.issues};}
export function ewpV9WallZoneCSV(model){const h=['level','zone','joist_axis','start_ft','end_ft','span_ft','left_support','right_support','outer_walls','inner_walls','bearing_candidates','status'],rows=[];for(const f of model?.floors||[])if(f.v9)for(const z of f.v9.zones||[])rows.push([f.level,z.id,z.axis,z.startFt,z.endFt,z.spanFt,z.leftSupport,z.rightSupport,f.v9.outerWalls,f.v9.innerWalls,f.v9.bearingCandidates,z.status]);return [h.join(','),...rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\n');}
