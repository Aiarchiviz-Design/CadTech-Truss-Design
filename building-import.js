// CadTech whole-building import intelligence. Geometry recognition only; engineering remains in whole-building solvers.
const FT=.3048;
const N=v=>Number(v)||0;
const layerClass=name=>{const s=String(name||'').toUpperCase();if(/DOOR|DR[-_ ]/.test(s))return'door';if(/WINDOW|WND|WIN[-_ ]/.test(s))return'window';if(/STAIR|VOID|OPENING|SHAFT/.test(s))return'floorOpening';if(/BEAM|LVL|GIRDER/.test(s))return'beam';if(/POST|COLUMN|COL[-_ ]/.test(s))return'post';if(/FLOOR|SLAB|DECK|EDGE/.test(s))return'floor';if(/WALL|A-WALL|PARTITION|EXTERIOR|INTERIOR|STRUCTURAL/.test(s))return'wall';if(/ROOF|TRUSS|RAFTER|RIDGE|HIP|VALLEY/.test(s))return'roof';return'other';};
function dxfUnits(text,override){if(override&&override!=='auto')return Number(override);const m=text.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/);return({1:.0254,2:.3048,4:.001,5:.01,6:1}[m?.[1]]||.0254);}
function pairs(text){const a=text.split(/\r?\n/),out=[];for(let i=0;i+1<a.length;i+=2)out.push([a[i].trim(),a[i+1].trim()]);return out;}
function closePoints(points,tol=1e-5){if(points.length>2&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<tol)return points.slice(0,-1);return points;}
function isAxisAlignedRectangle(e){if(e.type!=='LWPOLYLINE'||!e.closed)return false;const p=closePoints(e.pts);if(p.length!==4)return false;const xs=[...new Set(p.map(q=>Math.round(q[0]*1e5)/1e5))],ys=[...new Set(p.map(q=>Math.round(q[1]*1e5)/1e5))];if(xs.length!==2||ys.length!==2)return false;return p.every((q,i)=>{const n=p[(i+1)%p.length];return Math.abs(q[0]-n[0])<1e-5||Math.abs(q[1]-n[1])<1e-5;});}
function pointInPolygon2D(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]+1e-30)+a[0]))inside=!inside;}return inside;}
/** CAD-driven schematic framing. Coordinates are metres; Z is vertical. */
export function generateFramingFromCAD(dxfEntities,{unitsM=1,joistSpacingM=0.4064,studSpacingM=0.4064,wallHeightM=2.4384,wallSection='AUTO',floorSection='2x10'}={}){
 const same=(e,l)=>{const layerName=String(e.layer||'').trim().toUpperCase();return l==='WALL'?layerName.includes('WALL'):layerName===l;};
 const wallSizes={'2x4':{along:.0381,depth:.0889},'2x6':{along:.0381,depth:.1397},'2x8':{along:.0381,depth:.18415}},floorSizes={'2x10':{depth:.23495,width:.0381,shape:'solid'},'2x12':{depth:.28575,width:.0381,shape:'solid'},'I-Joist 9-1/2':{depth:.2413,width:.0635,shape:'I'},'I-Joist 11-7/8':{depth:.301625,width:.0635,shape:'I'},'I-Joist 14':{depth:.3556,width:.0635,shape:'I'}};
 const floorSize=floorSizes[floorSection]||floorSizes['2x10'];
 const floors=[],walls=[];let floorCount=0,wallCount=0;
 for(const e of dxfEntities||[]){ console.log('e:',e);
  if(same(e,'FLOOR')&&e.type==='LWPOLYLINE'&&e.closed&&e.pts?.length>=4){
   const poly=closePoints(e.pts),xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),width=maxX-minX,length=maxY-minY;
   if(width<=0||length<=0)continue;
   // Generate joists only inside the actual FLOOR polygon. Intersect each joist axis
   // with every polygon edge and pair the crossing points, so concave footprints and
   // wall recesses create short segments instead of joists projecting past the walls.
   const alongX=width>=length,step=Math.max(.1,joistSpacingM),lo=alongX?minY:minX,hi=alongX?maxY:maxX;
   const lineIntervals=(pos)=>{const cuts=[];for(let i=0,j=poly.length-1;i<poly.length;j=i++){
     const p=poly[j],q=poly[i],u=alongX?p[1]:p[0],v=alongX?q[1]:q[0],target=pos;
     if((u<=target&&v>target)||(v<=target&&u>target)){const t=(target-u)/(v-u),cross=alongX?p[0]+t*(q[0]-p[0]):p[1]+t*(q[1]-p[1]);cuts.push(cross);}
    }
    cuts.sort((a,b)=>a-b);const out=[];for(let k=0;k+1<cuts.length;k+=2){if(cuts[k+1]-cuts[k]>.05)out.push([cuts[k],cuts[k+1]]);}return out;};
   for(let pos=lo+step/2;pos<hi-step/4;pos+=step){for(const [start,end] of lineIntervals(pos)){
     // The floor joist top face is the wall bottom-plate bearing plane.
     const a=alongX?[start,pos,-floorSize.depth/2]:[pos,start,-floorSize.depth/2],b=alongX?[end,pos,-floorSize.depth/2]:[pos,end,-floorSize.depth/2];
     floors.push({id:`CAD-FJ-${++floorCount}`,type:'floor-joist',layer:e.layer,a,b,section:floorSection in floorSizes?floorSection:'2x10',shape:floorSize.shape,widthM:floorSize.width,depthM:floorSize.depth,spacingM:step,status:'REVIEW'});
   }}
  }
  if(same(e,'WALL')&&e.pts?.length>=2){
   const p=closePoints(e.pts),segments=[];
   // Closed rectangular WALL polylines remain one isolated wall assembly, matching the requested workflow.
   if(isAxisAlignedRectangle(e)){
    const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=maxX-minX,dy=maxY-minY;
    const alongX=dx>=dy,start=alongX?[minX,(minY+maxY)/2]:[(minX+maxX)/2,minY],end=alongX?[maxX,(minY+maxY)/2]:[(minX+maxX)/2,maxY];segments.push({start,end,bounds:{minX,maxX,minY,maxY}});
   } else {
    // Architectural CAD commonly represents walls as open polylines or individual LINE entities.
    for(let i=1;i<p.length;i++){const start=p[i-1],end=p[i];if(Math.hypot(end[0]-start[0],end[1]-start[1])>.05){segments.push({start,end,bounds:{minX:Math.min(start[0],end[0]),maxX:Math.max(start[0],end[0]),minY:Math.min(start[1],end[1]),maxY:Math.max(start[1],end[1])}});}}
   }
   for(const seg of segments){const {start,end,bounds}=seg,len=Math.hypot(end[0]-start[0],end[1]-start[1]),step=Math.max(.1,studSpacingM),spanX=bounds.maxX-bounds.minX,spanY=bounds.maxY-bounds.minY,measuredDepth=Math.min(spanX>1e-4?spanX:Infinity,spanY>1e-4?spanY:Infinity),hasCadDepth=Number.isFinite(measuredDepth)&&measuredDepth>.025&&measuredDepth<len*.25,cadDepth=hasCadDepth?measuredDepth:Infinity;if(len<=.05)continue;const requested=String(wallSection||'AUTO'),nominal=Object.entries(wallSizes).sort((a,b)=>Math.abs(a[1].depth-cadDepth)-Math.abs(b[1].depth-cadDepth))[0],fit=hasCadDepth?(nominal?.[0]||'2x4'):'2x4',section=hasCadDepth?fit:(wallSizes[requested]?requested:'2x4'),baseSize=wallSizes[section],size={along:baseSize.along,depth:hasCadDepth?cadDepth:baseSize.depth},half=size.along/2,first=half,last=Math.max(first,len-half),ux=(end[0]-start[0])/len,uy=(end[1]-start[1])/len,pointAt=x=>[start[0]+ux*x,start[1]+uy*x],zBottom=size.along,zTop=wallHeightM-size.along*2,wallId=++wallCount;
    const plate=(id,z,a=0,b=len)=>({id,a:[...pointAt(a),z],b:[...pointAt(b),z],section,widthM:size.depth,depthM:size.along});
    const vertical=(id,x,z0=zBottom,z1=zTop,role='stud')=>{const p=pointAt(x);return{id,a:[...p,z0],b:[...p,z1],section,role,widthM:size.along,depthM:size.depth};};
    const horizontal=(id,a,b,z,role)=>({id,a:[...pointAt(a),z],b:[...pointAt(b),z],section,role,widthM:size.depth,depthM:size.along});
    // Match closed door/window outlines on their CAD layers to this wall. Their plan
    // extents define opening width; sill/head elevations use conventional defaults
    // because a 2D plan does not contain those vertical dimensions.
    const openings=(dxfEntities||[]).filter(o=>o.closed&&(o.kind==='door'||o.kind==='window')&&o.pts?.length>=3).map(o=>{
      const cx=o.pts.reduce((s,p)=>s+p[0],0)/o.pts.length,cy=o.pts.reduce((s,p)=>s+p[1],0)/o.pts.length,centerAlong=(cx-start[0])*ux+(cy-start[1])*uy,perp=Math.abs((cx-start[0])*(-uy)+(cy-start[1])*ux),projections=o.pts.map(p=>(p[0]-cx)*ux+(p[1]-cy)*uy),width=Math.max(...projections)-Math.min(...projections);
      return{entity:o,centerAlong,perp,width};
    }).filter(o=>o.width>.45&&o.perp<=(hasCadDepth?Math.max(.18,cadDepth/2+.08):.18)&&o.centerAlong>=-o.width/2&&o.centerAlong<=len+o.width/2).map(o=>{
      const door=o.entity.kind==='door',w=Math.min(o.width,len),a=Math.max(half,o.centerAlong-w/2),b=Math.min(len-half,o.centerAlong+w/2),sill=door?0:.9144,head=Math.min(wallHeightM-size.along*3,sill+(door?2.032:1.2192));
      return{type:door?'door':'window',a,b,sill,head};
    }).filter(o=>o.b-o.a>.45);
    const openingAt=x=>openings.find(o=>x>o.a+half*.35&&x<o.b-half*.35);
    const studs=[],studPositions=[];let studIndex=0;
    for(let x=first;x<=last+.001;x+=step)studPositions.push(Math.min(x,last));
    if(!studPositions.length)studPositions.push(len/2);if(last-studPositions.at(-1)>.05)studPositions.push(last);
    for(const pos of studPositions)if(!openingAt(pos))studs.push(vertical(`CAD-WS-${wallId}-${++studIndex}`,pos));
    
    for(const [oi,o] of openings.entries()){
      // King studs run full height; paired trimmers support the header. Header/sill
      // and cripple studs complete the rough opening shown in the reference images.
      for(const [side,x] of [['L',o.a],['R',o.b]]){
        studs.push(vertical(`CAD-WK-${wallId}-${oi}-${side}`,x));
        studs.push(vertical(`CAD-WT-${wallId}-${oi}-${side}`,x,zBottom,o.head-size.along,'trimmer'));
      }
      studs.push(horizontal(`CAD-WH-${wallId}-${oi}`,o.a,o.b,o.head-size.along/2,'header'));
      if(o.type==='window')studs.push(horizontal(`CAD-WIS-${wallId}-${oi}`,o.a,o.b,o.sill-size.along/2,'sill'));
      for(let x=o.a+step;x<o.b-half*.5;x+=step){if(o.head<wallHeightM-size.along*3)studs.push(vertical(`CAD-WC-${wallId}-${oi}-U-${++studIndex}`,x,o.head,wallHeightM-size.along*2,'cripple'));if(o.type==='window'&&o.sill>size.along*2)studs.push(vertical(`CAD-WC-${wallId}-${oi}-L-${++studIndex}`,x,size.along,o.sill-size.along,'cripple'));}
    }
    const bottomPlates=openings.filter(o=>o.type==='door').reduce((parts,o)=>parts.flatMap(p=>{const a=Math.max(p[0],o.a),b=Math.min(p[1],o.b);return b<=a?[[p[0],p[1]]]:[[p[0],a],[b,p[1]]].filter(q=>q[1]-q[0]>.05);}),[[0,len]]).map((p,i)=>plate(`CAD-WB-${wallId}-${i+1}`,size.along/2,p[0],p[1]));
    // Broad stud faces follow the wall run; the narrow dimension passes through it.
    walls.push({id:`CAD-WA-${wallId}`,type:'wall-assembly',layer:e.layer,bounds,footprint:{minX:bounds.minX,maxX:bounds.maxX,minY:bounds.minY,maxY:bounds.maxY},cadThicknessM:hasCadDepth?cadDepth:null,start,end,section,sectionWidthM:size.along,sectionDepthM:size.depth,bottomPlate:bottomPlates[0]||plate(`CAD-WB-${wallId}`,size.along/2),bottomPlates,topPlates:[plate(`CAD-WT-${wallId}-1`,wallHeightM-size.along/2),plate(`CAD-WT-${wallId}-2`,wallHeightM-size.along*1.5)],studs,openings,spacingM:step,heightM:wallHeightM,status:'REVIEW'});
   }
 }
}
 // At CAD wall intersections, add the extra corner/intersection studs used to
 // fasten the intersecting wall and extend the top-plate laps across the joint.
 const pointLine=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1,t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2,q=Math.max(0,Math.min(1,t));return{t,x:a[0]+q*dx,y:a[1]+q*dy,d:Math.hypot(p[0]-a[0]-q*dx,p[1]-a[1]-q*dy),dx,dy,l:Math.sqrt(l2)};};
 for(const w of walls){const length=Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]),u=[(w.end[0]-w.start[0])/length,(w.end[1]-w.start[1])/length],ends=[{p:w.start,atStart:true},{p:w.end,atStart:false}];
  for(const {p,atStart} of ends){const joint=walls.some(o=>o!==w&&(()=>{const q=pointLine(p,o.start,o.end);return q.d<=Math.max(.09,(w.sectionDepthM+o.sectionDepthM)/2)&&q.t>=-.01&&q.t<=1.01;})());if(!joint)continue;
   const offset=w.sectionDepthM+w.sectionWidthM/2,pos=atStart?offset:length-offset;if(pos>w.sectionWidthM/2&&pos<length-w.sectionWidthM/2){const xy=[w.start[0]+u[0]*pos,w.start[1]+u[1]*pos];w.studs.push({id:`${w.id}-corner-${atStart?'A':'B'}`,a:[...xy,w.sectionWidthM],b:[...xy,w.heightM-w.sectionWidthM*2],section:w.section,role:'corner',widthM:w.sectionWidthM,depthM:w.sectionDepthM});}
  }
 }
 return {floorJoists:[],wallAssemblies:walls,sections:{wall:[...new Set(walls.map(w=>w.section))].join(' / ')||wallSection,floor:floorSection},counts:{floorJoists:0,wallAssemblies:walls.length,wallStuds:walls.reduce((n,w)=>n+w.studs.length,0)},units:'metres',status:'TIMBER MEMBER GEOMETRY — structural design verification required'};
}
export function parseBuildingDXF(text,unitOverride='auto',origin=null){
 const u=dxfUnits(text,unitOverride),p=pairs(text),ents=[];let cur=null;
 const flush=()=>{if(cur)ents.push(cur);cur=null;};
 for(const [c,v] of p){if(c==='0'&&['LINE','LWPOLYLINE','POLYLINE'].includes(v)){flush();cur={type:v,layer:'0',pts:[],x:null};continue;}if(c==='0'&&cur){flush();continue;}if(!cur)continue;if(c==='8')cur.layer=v;if(c==='70')cur.closed=(Number(v)&1)!==0;if(c==='10'){cur.x=N(v)*u;}if(c==='20'&&cur.x!==null){cur.pts.push([cur.x,N(v)*u]);cur.x=null;}if(c==='11')cur.x2=N(v)*u;if(c==='21'&&cur.x2!==undefined){cur.pts.push([cur.x2,N(v)*u]);delete cur.x2;}}
 flush();
 const applyOrigin=p=>origin?[p[0]-origin[0],p[1]-origin[1]]:p;
 const items=ents.filter(e=>e.pts.length>=2).map(e=>({...e,pts:e.pts.map(applyOrigin),closed:!!e.closed,kind:layerClass(e.layer)}));
 const all=items.flatMap(e=>e.pts);if(!all.length)throw Error('No usable LINE/LWPOLYLINE building geometry found in DXF.');
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),bbox={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};bbox.width=bbox.maxX-bbox.minX;bbox.length=bbox.maxY-bbox.minY;
 const walls=items.filter(e=>e.kind==='wall').flatMap((e,ei)=>e.pts.slice(1).map((b,i)=>({id:`DW${ei+1}-${i+1}`,a:e.pts[i],b,layer:e.layer}))).filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>.2);
 const openings=items.filter(e=>e.kind==='door'||e.kind==='window').map((e,i)=>{const q=e.pts,c=[q.reduce((s,p)=>s+p[0],0)/q.length,q.reduce((s,p)=>s+p[1],0)/q.length],span=Math.max(...q.map(a=>Math.hypot(a[0]-c[0],a[1]-c[1])))*2;return{id:`O${i+1}`,type:e.kind==='door'?'Door':'Window',x:c[0],y:c[1],widthFt:Math.max(2,span/FT),heightFt:e.kind==='door'?6.67:4,sillFt:e.kind==='door'?0:3,layer:e.layer};});
 const floorOpenings=items.filter(e=>e.kind==='floorOpening').map((e,i)=>{const xx=e.pts.map(p=>p[0]),yy=e.pts.map(p=>p[1]);return{id:`FO${i+1}`,type:'Opening',xFt:(Math.min(...xx)-bbox.minX)/FT,yFt:(Math.min(...yy)-bbox.minY)/FT,widthFt:(Math.max(...xx)-Math.min(...xx))/FT,lengthFt:(Math.max(...yy)-Math.min(...yy))/FT};});
 const floorPolygons=items.filter(e=>e.layer.trim().toUpperCase()==='FLOOR'&&e.type==='LWPOLYLINE'&&e.closed&&e.pts.length>=4).map((e,i)=>({id:`FP${i+1}`,layer:e.layer,points:e.pts}));
 const wallRectangles=items.filter(e=>e.layer.trim().toUpperCase()==='WALL'&&isAxisAlignedRectangle(e)).map((e,i)=>({id:`WR${i+1}`,layer:e.layer,points:e.pts}));
 const result={format:'DXF',unitsM:u,bbox,walls,openings,floorOpenings,beams:items.filter(e=>e.kind==='beam'),posts:items.filter(e=>e.kind==='post'),floors:items.filter(e=>e.kind==='floor'),roof:items.filter(e=>e.kind==='roof'),layers:[...new Set(items.map(e=>e.layer))],recognition:'layer-aware',dxfEntities:items,floorPolygons,wallRectangles};
 result.cadFraming=generateFramingFromCAD(items,{unitsM:u});
  if(!result.cadFraming.wallAssemblies||result.cadFraming.wallAssemblies.length===0){
    result.cadFraming=generateEnvelopeWallFraming(bbox.width,bbox.length);
  }
 return result;
}
export function parseBuildingOBJ(text,scale=.0254,yUp=false){const verts=[];for(const line of text.split(/\r?\n/)){const s=line.trim().split(/\s+/);if(s[0]==='v'){const p=s.slice(1,4).map(Number);if(p.every(Number.isFinite)){const q=yUp?[p[0],-p[2],p[1]]:p;verts.push(q.map(x=>x*scale));}}}if(verts.length<4)throw Error('OBJ has insufficient geometry.');const xs=verts.map(p=>p[0]),ys=verts.map(p=>p[1]),zs=verts.map(p=>p[2]),bbox={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),minZ:Math.min(...zs),maxZ:Math.max(...zs)};bbox.width=bbox.maxX-bbox.minX;bbox.length=bbox.maxY-bbox.minY;return{format:'OBJ',bbox,walls:[],openings:[],floorOpenings:[],beams:[],posts:[],floors:[],roof:[],layers:[],recognition:'envelope-only',note:'OBJ has no reliable semantic wall/door/floor identities. CadTech uses its envelope and requires review/correction.'};}
export function mapImportedOpenings(imported,levels=1){if(!imported?.bbox)return[];const b=imported.bbox,tol=Math.max(.35,Math.min(b.width,b.length)*.05);return(imported.openings||[]).map(o=>{const d={W:Math.abs(o.x-b.minX),E:Math.abs(o.x-b.maxX),S:Math.abs(o.y-b.minY),N:Math.abs(o.y-b.maxY)},side=Object.entries(d).sort((a,b)=>a[1]-b[1])[0];return{...o,level:1,side:side[0],offsetFt:(side[0]==='N'||side[0]==='S'?(o.x-b.minX):(o.y-b.minY))/FT,status:side[1]<=tol?'AUTO-MAPPED':'REVIEW'};});}
export function importSummary(g){return{format:g.format,recognition:g.recognition,widthFt:g.bbox?.width/FT,lengthFt:g.bbox?.length/FT,walls:g.walls?.length||0,openings:g.openings?.length||0,floorOpenings:g.floorOpenings?.length||0,beams:g.beams?.length||0,posts:g.posts?.length||0,roofEntities:g.roof?.length||0,layers:g.layers||[],floorPolygons:g.floorPolygons?.length||0,wallRectangles:g.wallRectangles?.length||0,generatedFloorJoists:g.cadFraming?.counts?.floorJoists||0,generatedWallAssemblies:g.cadFraming?.counts?.wallAssemblies||0,generatedWallStuds:g.cadFraming?.counts?.wallStuds||0,note:g.note||''};}

export function generateEnvelopeWallFraming(widthM,lengthM,wallHeightM=2.4384,wallSection='2x6'){
  const wallSizes={'2x4':{along:.0381,depth:.0889},'2x6':{along:.0381,depth:.1397},'2x8':{along:.0381,depth:.18415}};
  const baseSize=wallSizes[wallSection]||wallSizes['2x6'];
  const walls=[];
  const makeWall=(id,start,end,len)=>{
    const step=0.4064;
    const first=baseSize.along/2,last=Math.max(first,len-baseSize.along/2);
    const ux=(end[0]-start[0])/len,uy=(end[1]-start[1])/len;
    const pointAt=x=>[start[0]+ux*x,start[1]+uy*x];
    const zBottom=baseSize.along,zTop=wallHeightM-baseSize.along*2;
    const plate=(pid,z,a=0,b=len)=>({id:pid,a:[...pointAt(a),z],b:[...pointAt(b),z],section:wallSection,widthM:baseSize.depth,depthM:baseSize.along,flat:true});
    const vertical=(vid,x)=>{const p=pointAt(x);return{id:vid,a:[...p,zBottom],b:[...p,zTop],section:wallSection,role:'stud',widthM:baseSize.along,depthM:baseSize.depth};};
    const studs=[];let studIndex=0;
    for(let x=first;x<=last+.001;x+=step){
      studs.push(vertical(`${id}-S-${++studIndex}`,Math.min(x,last)));
    }
    return{
      id,
      type:'wall-assembly',
      layer:'WALL',
      bounds:{minX:Math.min(start[0],end[0]),maxX:Math.max(start[0],end[0]),minY:Math.min(start[1],end[1]),maxY:Math.max(start[1],end[1])},
      start,end,
      section:wallSection,
      sectionWidthM:baseSize.along,
      sectionDepthM:baseSize.depth,
      bottomPlate:plate(`${id}-BP`,baseSize.along/2),
      bottomPlates:[plate(`${id}-BP`,baseSize.along/2)],
      topPlates:[plate(`${id}-TP1`,wallHeightM-baseSize.along/2),plate(`${id}-TP2`,wallHeightM-baseSize.along*1.5)],
      studs,
      openings:[],
      spacingM:step,
      heightM:wallHeightM,
      status:'AUTO-ENVELOPE'
    };
  };
  walls.push(makeWall('ENV-WA-N',[0,lengthM,0],[widthM,lengthM,0],widthM));
  walls.push(makeWall('ENV-WA-S',[0,0,0],[widthM,0,0],widthM));
  walls.push(makeWall('ENV-WA-W',[0,0,0],[0,lengthM,0],lengthM));
  walls.push(makeWall('ENV-WA-E',[widthM,0,0],[widthM,lengthM,0],lengthM));

  return{wallAssemblies:walls,floorJoists:[],counts:{wallAssemblies:walls.length,wallStuds:walls.reduce((n,w)=>n+w.studs.length,0)}};
}
