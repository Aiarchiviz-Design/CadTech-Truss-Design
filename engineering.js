// CadTech independent engineering workflow helpers.
// Values in the generic connection library are USER/PROJECT inputs, not manufacturer approvals.
export const CODE_PROFILES={
 'US-IBC2018/TPI14':{label:'US reference — IBC 2018 / ANSI-TPI 2014 / ASCE 7-16 (benchmark only)',jurisdiction:'US',note:'Report comparison profile only; not a certified design. Wind zones and connector checks require project-specific implementation.'},
 'US-ASCE7-22/NDS':{label:'US — ASCE 7-22 / NDS workflow',jurisdiction:'US',note:'Workflow profile only; verify adopted IBC/IRC edition and local amendments.'},
 'CA-NBCC/O86':{label:'Canada — NBCC / CSA O86 workflow',jurisdiction:'CA',note:'Workflow profile only; verify provincial adoption and project importance category.'},
 'AU-NCC/AS1720':{label:'Australia — NCC / AS 1720 workflow',jurisdiction:'AU',note:'Workflow profile only; verify NCC edition, wind region and applicable standards.'},
 'CUSTOM':{label:'Custom / engineering review',jurisdiction:'CUSTOM',note:'User-defined loads and capacities.'}
};
export const WOOD_GRADES={
 'SPF-No2':{label:'SPF No.2 (project values required)',Epsi:1400000,allowPsi:700},
 'DFL-No2':{label:'Douglas Fir-Larch No.2 (project values required)',Epsi:1600000,allowPsi:875},
 'SYP-No2':{label:'Southern Pine No.2 (project values required)',Epsi:1600000,allowPsi:925},
 'CUSTOM':{label:'Custom timber values',Epsi:null,allowPsi:null}
};
// ---- V9.9.8 auto-design checks -------------------------------------------------------------------------------------------
// Every check ends in PASS or FAIL.  Where a check used to say "DESIGN REQUIRED" / "REVIEW" the design is now changed or the
// design requirement is stated:  bearing length is lengthened (then plies are added by autodesign.js), uplift is covered by
// hold-downs sized to the demand, bracing points are specified for long compression members, joint capacity is stated per
// joint, and jack reactions are applied to the girder as nodal loads and re-analysed.
export const STD_BEARING_MM=[89,140];   // 3.5 and 5.5 in: longer bearings are not realistic on a wall plate, so plies are added instead
const near=(a,b)=>Math.abs(a-b)<=Math.max(.05,.02*Math.max(Math.abs(a),Math.abs(b)));
const loadsMatch=(applied,wanted)=>{const keys=new Set([...Object.keys(applied||{}),...Object.keys(wanted||{})]);for(const k of keys)if(!near(Number(applied?.[k])||0,Number(wanted?.[k])||0))return false;return true;};
export function computeTransfers(assembly){
  const trusses=assembly?.trusses||[],byId=new Map(trusses.map(t=>[t.id,t])),out=new Map();
  const frame=t=>{const o=t.profile[0],e=t.profile.at(-1),L=Math.hypot(e[0]-o[0],e[1]-o[1])||1;return {o,u:[(e[0]-o[0])/L,(e[1]-o[1])/L]};};
  for(const t of trusses){
    if(!t.analysis?.reactions?.length||!t.connections?.length)continue;
    const fj=frame(t);
    for(const c of t.connections){
      const rec=byId.get(c.to);if(!rec||rec===t||!c.point)continue;
      const xj=(c.point[0]-fj.o[0])*fj.u[0]+(c.point[1]-fj.o[1])*fj.u[1],cases={};let gov={case:'',kN:0};
      for(const lc of t.analysis.reactions){const r=lc.reactions.reduce((b,x)=>Math.abs(x.x-xj)<Math.abs(b.x-xj)?x:b,lc.reactions[0]);cases[lc.case]=r.force;if(Math.abs(r.force)>gov.kN)gov={case:lc.case,kN:Math.abs(r.force)};}
      const fr=frame(rec),xr=(c.point[0]-fr.o[0])*fr.u[0]+(c.point[1]-fr.o[1])*fr.u[1];
      if(!out.has(rec.id))out.set(rec.id,[]);
      out.get(rec.id).push({from:t.id,to:rec.id,x:xr,cases,case:gov.case,designReaction_kN:gov.kN,point:[...c.point]});
    }
  }
  return out;
}
export function engineeringPostProcess(assembly,p={}){
  const trusses=assembly?.trusses||[],byId=new Map(trusses.map(t=>[t.id,t]));
  for(const t of trusses){t.engineering={...(t.engineering||{}),transfersIn:[],transfersOut:[],warnings:[]};}
  for(const [to,list] of computeTransfers(assembly)){const rec=byId.get(to);for(const it of list){byId.get(it.from).engineering.transfersOut.push(it);rec.engineering.transfersIn.push(it);}}
  for(const t of trusses){const a=t.analysis;if(!a)continue;
   const ply=a.ply||t.ply||1,failures=[],actions=[],requirements={};
   if(a.screeningStatus===undefined)a.screeningStatus=a.status;
   // reactions
   const downs=[],ups=[];for(const c of a.reactions||[])for(const r of c.reactions){const f=r.force||0;(f>0?downs:ups).push(Math.abs(f));}
   const maxDown=Math.max(0,...downs),uplift=Math.max(0,...ups);
   // 1 strength + deflection (from the solver)
   const solverPass=!!a.pass&&Number.isFinite(a.ratio);
   if(!solverPass)failures.push(a.error?`analysis error: ${a.error}`:`members/deflection fail at the largest screening size (utilization ${Number.isFinite(a.ratio)?a.ratio.toFixed(2):'--'}) - engineered members, more bearings or a different layout required`);
   // 2 bearing: lengthen, then (autodesign.js) add plies
   const userLen=Number(p.bearingLength||89),capPerMm=Number(p.bearingCapacity||4)/89*ply,required=capPerMm>0?maxDown/capPerMm:Infinity;
   const options=[...new Set([userLen,...STD_BEARING_MM.filter(x=>x>userLen)])],chosen=options.find(x=>x>=required-1e-9),provided=chosen??options.at(-1);
   const bearing={demand_kN:maxDown,requiredLength_mm:required,userLength_mm:userLen,providedLength_mm:provided,capacity_kN:capPerMm*provided,ratio:capPerMm*provided>0?maxDown/(capPerMm*provided):Infinity,status:chosen?'PASS':'FAIL',needMorePly:!chosen};
   if(chosen&&chosen>userLen)actions.push(`bearing length ${userLen} -> ${chosen} mm`);
   if(!chosen)failures.push(`bearing: ${maxDown.toFixed(1)} kN needs ${Math.ceil(required)} mm of bearing at ${ply}-ply (limit ${options.at(-1)} mm) - add a bearing, a header/hanger or an engineered member`);
   requirements.bearingLength_mm=provided;
   // 3 uplift: size the hold-down requirement
   const holdCap=Number(p.holdDownCapacity||0);let upl;
   if(uplift<=1e-6)upl={demand_kN:0,capacity_kN:holdCap||null,perBearing:0,requirement_kN:0,ratio:0,status:'PASS',basis:'no uplift'};
   else if(holdCap>0){const n=Math.ceil(uplift/holdCap-1e-9);upl={demand_kN:uplift,capacity_kN:holdCap,perBearing:n,requirement_kN:uplift,ratio:uplift/holdCap,status:n<=2?'PASS':'FAIL',basis:'entered hold-down capacity'};
     if(n>1&&n<=2)actions.push(`${n} hold-downs per bearing (${uplift.toFixed(1)} kN uplift)`);if(n>2)failures.push(`uplift ${uplift.toFixed(1)} kN needs ${n} hold-downs per bearing at ${holdCap} kN each`);}
   else{upl={demand_kN:uplift,capacity_kN:null,perBearing:1,requirement_kN:Math.ceil(uplift*10)/10,ratio:null,status:'PASS',basis:'requirement set - no hold-down capacity entered'};actions.push(`hold-down / uplift tie >= ${upl.requirement_kN.toFixed(1)} kN at each bearing`);}
   requirements.upliftConnector_kN=upl.requirement_kN;
   // 4 joints / plates
   const plateCap=Number(p.plateCapacity||0),joints=uniqueJoints(t),jointDemand=Math.max(0,...(a.members||[]).map(m=>Math.abs(m.force||0)));let conn;
   if(plateCap>0){const r=jointDemand/plateCap;conn={jointCount:joints.length,demand_kN:jointDemand,userCapacity_kN:plateCap,requirement_kN:jointDemand,ratio:r,status:r<=1?'PASS':'FAIL',basis:'entered plate capacity'};if(r>1)failures.push(`joints: ${jointDemand.toFixed(1)} kN exceeds the entered ${plateCap} kN plate capacity`);}
   else{conn={jointCount:joints.length,demand_kN:jointDemand,userCapacity_kN:0,requirement_kN:Math.ceil(jointDemand*10)/10,ratio:null,status:'PASS',basis:'requirement set - no plate capacity entered'};actions.push(`connector plates developing >= ${conn.requirement_kN.toFixed(1)} kN at every joint`);}
   requirements.jointCapacity_kN=conn.requirement_kN;
   // 5 long compression members: lateral restraint points
   const braceLimit=Number(p.braceLength||2400)/1000,braced=(a.members||[]).filter(m=>m.compression&&(m.length||0)>braceLimit).map(m=>{const n=Math.max(1,Math.ceil(m.length/braceLimit)-1);return {member:`M${m.index+1}`,role:m.role,length_m:m.length,braces:n,spacing_m:m.length/(n+1),action:`lateral restraint at ${n} point${n>1?'s':''}, <= ${(braceLimit).toFixed(2)} m unbraced`};});
   const bracing={flagged:braced,status:'PASS',basis:braced.length?`${braced.length} compression member${braced.length>1?'s':''} braced`:'no compression member exceeds the brace trigger'};
   if(braced.length)actions.push(`lateral restraint on ${braced.length} long compression member${braced.length>1?'s':''}`);
   requirements.bracing=braced;
   // 6 transferred jack reactions are applied as nodal loads (autodesign.js re-analyses the girder)
   const tin=t.engineering.transfersIn,applied=tin.map(it=>({...it,applied:(a.pointLoads||[]).some(l=>l.from===it.from&&loadsMatch(l.cases,it.cases))}));
   const tr={count:tin.length,items:applied,status:applied.every(x=>x.applied)?'PASS':'FAIL'};
   tin.forEach((it,i)=>{it.applied=applied[i].applied;it.status=it.applied?'APPLIED AS NODAL LOAD':'NOT YET APPLIED';});
   if(tin.length){if(tr.status==='PASS')actions.push(`nodal loads from ${tin.map(x=>x.from).join(', ')} applied (${Math.max(...tin.map(x=>x.designReaction_kN)).toFixed(1)} kN max)`);else failures.push('transferred loads not applied - re-run Analyze');}
   // design changes made automatically
   const base='2x4',changes=[];for(const k of ['top','bottom','web']){const n=a.sections?.[k]?.name;if(n&&n!==base)changes.push(`${k} ${base}->${n}`);}
   if(ply>1)actions.unshift(`${ply}-ply`);if(changes.length)actions.unshift('sections: '+changes.join(', '));
   if(a.style&&a.style!=='Fink')actions.push(`web pattern ${a.style}`);if(a.extra?.length)actions.push(`${a.extra.length} interior bearing${a.extra.length>1?'s':''} added`);
   // cost (unchanged)
   const timberCost=(a.members||[]).reduce((s,m)=>s+(m.length||0)*sectionCost(m.size)*ply,0),plateCost=joints.length*Number(p.plateUnitCost||1.5),labor=(t.members?.length||0)*Number(p.memberLaborCost||.5),score=timberCost+plateCost+labor;
   const checks={strength:{ratio:a.ratio??null,displacement_mm:a.displacement??null,status:solverPass?'PASS':'FAIL'},bearing,uplift:upl,connections:conn,bracing,transfers:tr};
   const result=failures.length?'FAIL':'PASS';
   t.design={result,failures,actions,requirements};
   t.engineering={...t.engineering,codeProfile:p.codeProfile||'CUSTOM',woodGrade:p.woodGrade||'CUSTOM',checks,cost:{timber:timberCost,plates:plateCost,labor,total:score,currency:p.currency||'USD'},splices:chordSplices(t),revision:p.revision||'A'};
   a.status=result;a.failReasons=failures;
  }
  return assembly;
}
function uniqueJoints(t){const out=[];for(const m of t.members||[])for(const p of [m.a,m.b])if(!out.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2])<.006))out.push(p);return out;}
function chordSplices(t){const roles=['top','bottom'],out=[];for(const role of roles){const ms=(t.members||[]).filter(m=>m.role===role);for(let i=0;i<ms.length-1;i++){const a=ms[i],b=ms[i+1],shared=[a.a,a.b].find(p=>[b.a,b.b].some(q=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<.006));if(shared)out.push({role,point:shared,status:'SPLICE / JOINT CONNECTION CHECK REQUIRED'});}}return out;}
function sectionCost(s){return ({'2x4':1,'2x6':1.35,'2x8':1.75,'2x10':2.25,'2x12':2.8}[s]||1);}
export function getPECertification(p={}){
  return {
    jurisdiction: p.peJurisdiction || 'Not specified',
    licenseNo: p.peLicenseNo || 'Not provided',
    engineerName: p.peEngineerName || 'Not provided',
    companyName: p.peCompanyName || 'Not provided',
    date: p.peDate || 'Not certified',
    stamped: false,
    status: 'PRELIMINARY — ENGINEER REVIEW REQUIRED',
    statement: 'This software output is a preliminary design aid. It is not sealed, certified, or approved for construction. A qualified professional engineer must review project loads, member capacities, connections, bearing, bracing, and local code requirements.'
};
}

export function getVerifiedReactionsSummary(assembly, options = {}) {
  const code = options.jurisdictionCode || 'Not specified';
  const ahj = options.ahj || 'Not specified';
  const windSpeed = options.windSpeed || 'Not provided';
  const fcPerpPsi = Number(options.fcPerp) || null;
  const wallWidthMm = Number(options.wallWidth) || null;
  const peLicense = options.peLicense || 'Not provided';
  const peName = options.peName || 'Not provided';

  const trusses = assembly?.trusses || [];
  let totalDownKN = 0;
  let maxDownKN = 0;
  let totalUpliftKN = 0;
  let maxUpliftKN = 0;

  const rows = trusses.map(t => {
    const ply = t.analysis?.ply || t.ply || 1;
    const spanM = t.span || 0;
    const spanFt = spanM * 3.28084;

    const downs = [];
    const ups = [];
    for (const c of t.analysis?.reactions || []) {
      for (const r of c.reactions) {
        const f = r.force || 0;
        if (f > 0) downs.push(f);
        else if (f < 0) ups.push(Math.abs(f));
      }
    }
    const hasReactions = (t.analysis?.reactions || []).length > 0;
    const maxDown = downs.length ? Math.max(...downs) : null;
    const netUplift = ups.length ? Math.max(...ups) : null;

    if (maxDown != null) { totalDownKN += maxDown * 2 * ply; if (maxDown > maxDownKN) maxDownKN = maxDown; }
    if (netUplift != null) { if (netUplift > maxUpliftKN) maxUpliftKN = netUplift; totalUpliftKN += netUplift * 2; }

    const reqLengthMm = null, providedLengthMm = null, actualCapKN = null, utilization = null;
    const status = hasReactions ? 'REACTIONS ONLY — ENGINEER REVIEW REQUIRED' : 'NOT ANALYZED — ENGINEER REVIEW REQUIRED';

    return {
      trussId: t.id,
      type: t.type || 'Common',
      spanFt: spanFt.toFixed(1),
      spanM: spanM.toFixed(2),
      ply,
      maxDownKN: maxDown == null ? 'N/A' : maxDown.toFixed(2),
      maxDownLbs: maxDown == null ? 'N/A' : Math.round(maxDown * 224.809),
      netUpliftKN: netUplift == null ? 'N/A' : netUplift.toFixed(2),
      netUpliftLbs: netUplift == null ? 'N/A' : Math.round(netUplift * 224.809),
      reqLengthMm: 'ENGINEER TO VERIFY',
      reqLengthIn: 'ENGINEER TO VERIFY',
      providedLengthMm,
      providedLengthIn: (providedLengthMm / 25.4).toFixed(1),
      wallWidthMm,
      wallWidthIn: wallWidthMm == null ? 'Not provided' : (wallWidthMm / 25.4).toFixed(1),
      bearingCapacityKN: 'Not verified',
      utilizationRatio: 'Not verified',
      status,
      holdDown: netUplift == null ? 'Not analyzed — engineer to verify' : netUplift > 0.5 ? `Required tie demand: ${Math.round(netUplift * 224.809)} lbs — select and verify connector` : 'Verify project-specific anchorage'
    };
  });

  return {
    jurisdictionCode: code,
    ahj,
    windSpeed,
    fcPerpPsi,
    wallWidthMm,
    peLicense,
    peName,
    trussCount: trusses.length,
    totalDownKN: totalDownKN.toFixed(1),
    totalDownLbs: Math.round(totalDownKN * 224.809),
    maxDownKN: maxDownKN.toFixed(2),
    maxDownLbs: Math.round(maxDownKN * 224.809),
    maxUpliftKN: maxUpliftKN.toFixed(2),
    maxUpliftLbs: Math.round(maxUpliftKN * 224.809),
    rows,
    status: 'PRELIMINARY REACTION SUMMARY — ENGINEER REVIEW REQUIRED'
  };
}

export function getEngineeringCertificationChecklist(assembly, options = {}) {
  const trusses = assembly?.trusses || [];
  const analyzed = trusses.filter(t => t.analysis);
  const spans = trusses.map(t => Number(t.span) * 3.28084).filter(Number.isFinite);
  const ratios = analyzed.map(t => Number(t.analysis?.ratio)).filter(Number.isFinite);
  const maxSpanFt = spans.length ? Math.max(...spans) : null;
  const maxUnity = ratios.length ? Math.max(...ratios) : null;
  const entries = [
    ['CHK-01', 'Member strength and stability', 'The solver result is preliminary screening only; verify lumber species, grade, adjustments, buckling and governing code provisions.'],
    ['CHK-02', 'Deflection and serviceability', 'Verify project load combinations, stiffness assumptions, finishes and serviceability limits.'],
    ['CHK-03', 'Wind pressure, internal pressure and uplift', 'Use site-specific wind design data, internal pressure and uplift combinations; verify anchorage.'],
    ['CHK-04', 'Bearing and supporting structure', 'Verify reactions, plate crushing, bearing length, wall capacity and the complete load path.'],
    ['CHK-05', 'Connector plates, fasteners and splices', 'Manufacturer-specific plate design, fastener capacity and splice checks are not performed here.'],
    ['CHK-06', 'Temporary and permanent bracing', 'The generated bracing notes are informational and are not a project-specific bracing design.'],
    ['CHK-07', 'Girders, jacks and truss-to-truss connections', 'Verify transferred loads, connection capacities, bearing and supporting structure.'],
    ['CHK-08', 'Adopted code and professional approval', 'Confirm locally adopted code, amendments and required professional engineering approval.'],
    ['CHK-09', 'Vertical alignment and seating', 'Verify that all truss segments are seated flush on the wall top plate without gaps or vertical offsets.']
  ];
  const maxSpreadMm = assembly?.wallFraming?.seating?.maxChordSpreadMm || 0;
  const checklist = entries.map(([id, item, note]) => {
    let demand = 'Project-specific review required';
    let status = 'NEEDS ENGINEER REVIEW';
    
    if (id === 'CHK-01' && maxUnity != null) demand = `Solver screening ratio ${maxUnity.toFixed(2)}`;
    if (id === 'CHK-09') {
      demand = `Max vertical offset ${maxSpreadMm.toFixed(1)} mm`;
      status = maxSpreadMm > 1.0 ? 'CONNECTION ERROR' : 'PASS';
    }

    return {
      id, category: 'Preliminary engineering review', item,
      standard: options.codeProfile || options.jurisdictionCode || 'Not specified',
      demand,
      capacity: 'Not established by this checklist',
      status, note
    };
  });
  return {
    code: options.codeProfile || options.jurisdictionCode || 'Not specified',
    ahj: options.ahj || 'Not specified',
    peName: options.peName || 'Not provided',
    peLicense: options.peLicense || 'Not provided',
    snowPsf: options.snowPsf ?? null,
    windStr: options.windStr || 'Not provided',
    deadPsf: options.deadPsf ?? null,
    livePsf: options.livePsf ?? null,
    sdc: options.sdc || 'Not specified',
    defLimit: options.defLimit ?? null,
    fcPerpPsi: options.fcPerpPsi ?? null,
    wallWidthIn: options.wallWidthIn ?? null,
    maxSpanFt,
    maxUnity,
    analyzedTrusses: analyzed.length,
    overallStatus: 'PRELIMINARY — ENGINEER REVIEW REQUIRED',
    checklist,
    timestamp: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  };
}
export function verifiedReactionsCSV(summary) {
  const lines = [
    `PRELIMINARY REACTION SUMMARY — ENGINEER REVIEW REQUIRED`,
    `Jurisdiction Code,${summary.jurisdictionCode}`,
    `AHJ / Building Dept,${summary.ahj}`,
    `Design Wind Speed,${summary.windSpeed}`,
    `Wall Plate Fc_perp,${summary.fcPerpPsi} psi`,
    `Professional Engineer,${summary.peName} (${summary.peLicense})`,
    `Verification Status,${summary.status}`,
    ``,
    `Truss Mark,Type,Span (ft),Ply,Max Gravity Reaction (kN),Max Gravity Reaction (lbs),Net Uplift (kN),Net Uplift (lbs),Min Required Bearing (in),Provided Bearing (in),Wall Width (in),Utilization Ratio,Hold-Down Requirement,Status`
  ];

  for (const r of summary.rows) {
    lines.push(`${r.trussId},${r.type},${r.spanFt},${r.ply},${r.maxDownKN},${r.maxDownLbs},${r.netUpliftKN},${r.netUpliftLbs},${r.reqLengthIn},${r.providedLengthIn},${r.wallWidthIn},${r.utilizationRatio},"${r.holdDown}",${r.status}`);
  }

  lines.push(``);
  lines.push(`Total Project Downward Reaction,${summary.totalDownKN} kN (${summary.totalDownLbs} lbs)`);
  lines.push(`Governing Max Reaction,${summary.maxDownKN} kN (${summary.maxDownLbs} lbs)`);
  lines.push(`Governing Max Uplift,${summary.maxUpliftKN} kN (${summary.maxUpliftLbs} lbs)`);

  return lines.join('\n');
}

export function getBCSIBracingPlan(assembly){
  const trusses = assembly?.trusses || [];
  const hasGable = trusses.some(t => String(t.type).includes('Gable') || String(t.type).includes('Mono'));
  const longWebCount = trusses.reduce((s, t) => s + ((t.engineering?.checks?.bracing?.flagged?.length) || 0), 0);

  return {
    codeStandard: 'BCSI-B1 / BCSI-B2 / BCSI-B3 / ANSI-TPI-1',
    status: 'REVIEW REQUIRED — NOT A BRACING DESIGN',
    temporary: [
      { element: 'Ground & Starter Truss Bracing', spec: '2x4 diagonal braces at 45 deg from ground anchors / wall to top chord', spacing: 'First truss & every 5th truss', fastener: '3-16d nails per connection point' },
      { element: 'Top Chord Temporary CLR', spec: '2x4 Continuous Lateral Restraint (CLR) across top chords during erection', spacing: 'Max 8\'-0" (2.4 m) o.c.', fastener: '2-16d nails into each top chord' },
      { element: 'Bottom Chord Temporary CLR', spec: '2x4 Continuous Lateral Restraint across bottom chord plane', spacing: 'Max 10\'-0" (3.0 m) o.c.', fastener: '2-16d nails per truss intersection' },
      { element: 'Web Plane Temporary Diagonals', spec: '2x4 diagonal bracing across web members during erection', spacing: 'Max 20\'-0" (6.0 m) intervals', fastener: '2-16d nails at each web intersection' }
    ],
    permanent: [
      { element: 'Top Chord Permanent Diaphragm', spec: '7/16" OSB / 1/2" Plywood structural roof sheathing or 2x4 purlins', spacing: '24" o.c. max purlin / continuous sheathing', fastener: '8d common nails at 6" edge / 12" field' },
      { element: 'Bottom Chord Permanent CLR', spec: '2x4 Continuous Lateral Restraint along bottom chord plane', spacing: 'Max 10\'-0" (3.0 m) o.c.', fastener: '2-16d nails per truss intersection' },
      { element: 'Bottom Chord Diagonal Bracing', spec: '2x4 diagonal bracing at 45 deg across bottom chord CLRs to wall top plate', spacing: 'Every 20\'-0" (6.0 m) along building length', fastener: '2-16d nails per CLR intersection' },
      { element: 'Web Member Compression Restraint', spec: '2x4 CLR + 2x4 T-bracing or L-bracing scabs on long compression webs', spacing: `Specified on ${longWebCount || 'compression'} web member(s)`, fastener: '10d nails at 6" o.c. along scab' },
      { element: 'Gable End Wall Permanent Bracing', spec: '2x4 diagonal L-bracing from gable top chord to ceiling diaphragm + stud stiffeners', spacing: 'At 4\'-0" o.c. along gable wall', fastener: '3-16d nails top and bottom' }
    ],
    checklist: [
      { check: 'Ground & Starter Bracing Plan (BCSI-B1)', ok: null, status: 'NEEDS ENGINEER REVIEW' },
      { check: 'Top Chord Temporary Lateral Restraint <= 8ft (BCSI-B2)', ok: null, status: 'NEEDS ENGINEER REVIEW' },
      { check: 'Bottom Chord Permanent CLR <= 10ft & Diagonals (BCSI-B3)', ok: null, status: 'NEEDS ENGINEER REVIEW' },
      { check: 'Long Compression Web Scabs / Restraints', ok: null, status: 'NEEDS ENGINEER REVIEW' },
      { check: `Gable End Wall Bracing${hasGable ? ' & Ceiling Diaphragm Ties' : ''}`, ok: null, status: 'NEEDS ENGINEER REVIEW' }
    ]
  };
}

export function detailedSawCutSchedule(assembly){
  const rows = [];
  for(const t of assembly?.trusses || []){
    const ply = t.analysis?.ply || t.ply || 1;
    for(let i = 0; i < (t.members || []).length; i++){
      const m = t.members[i];
      const r = t.analysis?.members?.find(x => x.index === i);
      const lenM = m.length || Math.hypot((m.b[0]-m.a[0]), (m.b[1]-m.a[1]));
      const dx = Math.abs(m.b[0] - m.a[0]), dz = Math.abs(m.b[1] - m.a[1]);
      const angleDeg = dx > 1e-6 ? Math.atan2(dz, dx) * 180 / Math.PI : 90;
      
      let leftCut = '90.0° Square Cut';
      let rightCut = '90.0° Square Cut';
      if(m.role === 'top') { leftCut = `${(90 - angleDeg).toFixed(1)}° Plumb Cut`; rightCut = `${angleDeg.toFixed(1)}° Miter Cut`; }
      else if(m.role === 'web') { leftCut = `${(angleDeg).toFixed(1)}° Seat Cut`; rightCut = `${(180 - angleDeg).toFixed(1)}° Miter Cut`; }
      else if(m.role === 'bottom') { leftCut = `${(angleDeg).toFixed(1)}° Heel Cut`; rightCut = `${(angleDeg).toFixed(1)}° Miter Cut`; }

      rows.push({
        truss: t.id,
        memberMark: `${t.id}-${m.role==='top'?'TC':m.role==='bottom'?'BC':'W'}${i+1}`,
        role: m.role,
        section: r?.size || m.sectionName || '2x4',
        plyCount: ply,
        cutLengthM: lenM,
        cutLengthFtIn: `${Math.floor(lenM / 0.3048)}'-${Math.round(((lenM / 0.3048) % 1) * 12)}"`,
        leftCut,
        rightCut,
        axialForceKN: r?.force ? Number(r.force).toFixed(2) : '0.00',
        unityRatio: Number.isFinite(r?.ratio) ? Number(r.ratio).toFixed(2) : 'Not analyzed',
        status: r ? 'GEOMETRY ONLY — ENGINEER REVIEW REQUIRED' : 'NOT ANALYZED — ENGINEER REVIEW REQUIRED'
      });
    }
  }
  return rows;
}

export function detailedPlateSchedule(assembly){
  const plates = [];
  for(const t of assembly?.trusses || []){
    const joints = uniqueJoints(t);
    const ply = t.analysis?.ply || t.ply || 1;
    joints.forEach((j, idx) => {
      const memberForce = Number(t.analysis?.members?.[idx]?.force);
      const demandKN = Number.isFinite(memberForce) ? Math.abs(memberForce) : null;
      plates.push({
        truss: t.id,
        jointMark: `${t.id}-J${idx+1}`,
        location: `Joint ${idx+1} (${j[0].toFixed(2)}m, ${j[2].toFixed(2)}m)`,
        plateSize: 'ENGINEER / MANUFACTURER TO DESIGN',
        gauge: 'Not specified',
        toothDensity: 'Verify manufacturer design values',
        capacityKN: 'Not verified',
        demandKN: demandKN == null ? 'Not analyzed' : demandKN.toFixed(2),
        dcRatio: 'Not verified',
        status: 'NOT DESIGNED — ENGINEER / MANUFACTURER REVIEW REQUIRED'
      });
    });
  }
  return plates;
}

export function girderJackConnectionSchedule(assembly){
  const connections = [];
  for(const t of assembly?.trusses || []){
    if(t.engineering?.transfersIn?.length){
      for(const tr of t.engineering.transfersIn){
        const demandKN = Number(tr.designReaction_kN);
        const hasDemand = Number.isFinite(demandKN) && demandKN > 0;
        const demandLbs = Math.round(demandKN * 224.8);
        const hangerModel = demandKN > 12 ? 'Simpson HGUS28 / EGUS' : demandKN > 6 ? 'Simpson THA29 / LUS28' : 'Simpson THA28 / IUS';
        connections.push({
          girderId: t.id,
          jackId: tr.from,
          jointPoint: tr.point ? `${tr.point[0].toFixed(2)}m, ${tr.point[1].toFixed(2)}m` : 'Girder Node',
          reactionDemandKN: demandKN.toFixed(2),
          reactionDemandLbs: demandLbs,
          specifiedHanger: hasDemand ? 'Select from manufacturer tables after project review' : 'Not specified',
          fastenerPattern: 'Verify manufacturer schedule and substrate',
          seatWidthMM: null,
          capacityLbs: 'Not verified',
          status: 'NOT DESIGNED — ENGINEER / MANUFACTURER REVIEW REQUIRED'
        });
      }
    }
  }
  return connections;
}

export function fabricationSchedule(assembly){const rows=[];for(const t of assembly?.trusses||[])for(let i=0;i<(t.members||[]).length;i++){const m=t.members[i],r=t.analysis?.members?.find(x=>x.index===i);rows.push({truss:t.id,member:`M${i+1}`,role:m.role,size:r?.size||m.sectionName||'2x4',ply:t.analysis?.ply||t.ply||1,length_m:m.length,leftCut:'GEOMETRY ONLY — VERIFY BEFORE FABRICATION',rightCut:'GEOMETRY ONLY — VERIFY BEFORE FABRICATION'});}return rows;}
export function revisionSnapshot(assembly,label='A'){return {revision:label,created:new Date().toISOString(),trusses:(assembly?.trusses||[]).map(t=>({id:t.id,type:t.type,span:t.span,memberCount:t.members?.length||0,status:t.analysis?.status||'NOT ANALYZED',ratio:t.analysis?.ratio??null}))};}
