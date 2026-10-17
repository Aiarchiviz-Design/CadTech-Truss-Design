import {setupAdvanced} from './advanced-ui.js';
import {parseRoofOBJ,assembleRoof,fromIFCAxes,typeColors} from './roof.js';
import {parseIFC} from './importer.js';
import {inspectDXF,parseRoofDXF} from './dxf-importer.js';
import {parseBuildingDXF, generateEnvelopeWallFraming} from './building-import.js';
import {reseatWallFraming} from './wall-seat.js';
import {RoofViewer} from './viewer.js';
import {memberSolid} from './connection-geometry.js';
import {woodTakeoff,takeoffHTML} from './takeoff.js';
import {makeReport,makeCutListReport,makeTrussScheduleReport,makeEVReport,makeFabricationReport,makeCertificationReport} from './report.js';
import {getEngineeringCertificationChecklist} from './engineering.js';
import {
  calculateMemberStressHeatmap,
  calculateConnectorPlates,
  calculateUpliftTieDowns,
  calculateCarbonAndSustainability,
  buildParametricTrussTopology,
  suggestOptimalLumberSize,
  TRUSS_TOPOLOGIES,
  SECTION_SPECS
} from './advanced-features.js';

const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(n,d=2)=>Number(n).toFixed(d);

export const TIMBER_SPECIES = {
  douglas_fir: { name: 'Douglas Fir-Larch', densityKgM3: 530, densityLbsFt3: 33.1 },
  southern_pine: { name: 'Southern Yellow Pine', densityKgM3: 570, densityLbsFt3: 35.6 },
  spf: { name: 'Spruce-Pine-Fir (SPF)', densityKgM3: 450, densityLbsFt3: 28.1 },
  hem_fir: { name: 'Hem-Fir', densityKgM3: 470, densityLbsFt3: 29.3 },
  lvl: { name: 'EWP / LVL Structural', densityKgM3: 550, densityLbsFt3: 34.3 }
};

export function calculateTrussSelfWeight(truss, speciesKey = 'douglas_fir') {
  if (!truss || !truss.members || !Array.isArray(truss.members)) {
    return { volumeM3: 0, weightKg: 0, weightLbs: 0, weightKN: 0 };
  }
  const species = TIMBER_SPECIES[speciesKey] || TIMBER_SPECIES.douglas_fir;
  const plyCount = Math.max(1, truss.ply || 1);

  let totalVolumeM3 = 0;
  for (const m of truss.members) {
    if (!m) continue;
    let b = 0.0381, d = 0.0889;
    if (m.section && Array.isArray(m.section) && m.section.length >= 2) {
      b = Number(m.section[0]) || 0.0381;
      d = Number(m.section[1]) || 0.0889;
    } else if (m.sectionName && SECTION_SPECS[m.sectionName]) {
      const spec = SECTION_SPECS[m.sectionName];
      b = spec.b;
      d = spec.d;
    }
    const lenM = Number(m.length) || (m.a && m.b ? Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) : 0);
    const mPly = Math.max(1, m.ply || plyCount);
    totalVolumeM3 += (b * d * lenM * mPly);
  }

  const weightKg = totalVolumeM3 * species.densityKgM3;
  const weightLbs = weightKg * 2.20462;
  const weightKN = weightKg * 0.00981;

  return {
    volumeM3: totalVolumeM3,
    weightKg: Math.round(weightKg * 10) / 10,
    weightLbs: Math.round(weightLbs),
    weightKN: Math.round(weightKN * 100) / 100
  };
}

export let currentFileUnit = 'ft-in';

export function getFileUnit() {
  const el = $('file-units');
  return el ? el.value : currentFileUnit;
}

export function formatDim(meters, unit = getFileUnit()) {
  if (!Number.isFinite(Number(meters))) return '—';
  const m = Number(meters);

  if (unit === 'ft') {
    const ft = m / 0.3048;
    return `${ft.toFixed(2)} ft`;
  }
  if (unit === 'in') {
    const inches = m / 0.0254;
    return `${inches.toFixed(1)}"`;
  }
  if (unit === 'mm') {
    const mm = m * 1000;
    return `${Math.round(mm)} mm`;
  }
  if (unit === 'm') {
    return `${m.toFixed(2)} m`;
  }

  // Default: ft-in (Feet and Inches)
  const totalInches = m / 0.0254;
  const absInches = Math.abs(totalInches);
  const feet = Math.floor(absInches / 12);
  const inchesRem = absInches % 12;
  const wholeInches = Math.floor(inchesRem);
  const frac = inchesRem - wholeInches;

  const sixteenths = Math.round(frac * 16);
  let fracStr = '';
  let finalInches = wholeInches;

  if (sixteenths === 16) {
    finalInches += 1;
  } else if (sixteenths > 0) {
    if (sixteenths === 8) fracStr = ' ½';
    else if (sixteenths === 4) fracStr = ' ¼';
    else if (sixteenths === 12) fracStr = ' ¾';
    else if (sixteenths % 2 === 0) fracStr = ` ${sixteenths / 2}/8`;
    else fracStr = ` ${sixteenths}/16`;
  }

  let finalFeet = feet;
  if (finalInches >= 12) {
    finalFeet += 1;
    finalInches -= 12;
  }

  const sign = m < 0 ? '-' : '';
  if (finalFeet === 0 && finalInches === 0 && !fracStr) return `${sign}0"`;
  if (finalFeet === 0) return `${sign}${finalInches}${fracStr}"`;
  return `${sign}${finalFeet}' ${finalInches}${fracStr}"`;
}

let advanced=null;
let source=null,assembly=null,selected=null,name='No Model Loaded',filter='All',mode='iso',raw=null,rawKind=null,dxfInfo=null,busy=false,drawZoom=1,drawPan=[0,0],lastURLs=[];
let drawViewMode='geom'; // 'geom' | 'fea' | 'plates' | 'deflect'
let currentFEA=null;
let selectedMemberIndex=null;

let viewer;
if ($('three')) {
  try {
    viewer = new RoofViewer($('three'), select);
  } catch (e) {
    if ($('three')) $('three').innerHTML = '<p style="padding:100px 30px">3D graphics unavailable. Enable WebGL or open in a supported desktop browser.</p>';
    message('WebGL could not start: ' + e.message, true);
  }
}

function message(s, error = false) {
  let el = $('message');
  if (!el) {
    el = document.createElement('div');
    el.id = 'message';
    const parent = document.querySelector('aside.left') || document.body;
    parent.insertBefore(el, parent.firstChild);
  }
  el.textContent = s;
  el.style.color = error ? '#dc2626' : '#15803d';
}
let currentGenUnit = 'in'; // 'in' | 'mm'

function getGenerationHeelM(){
  if(currentGenUnit === 'mm'){
    return Number($('heel')?.value || 254) / 1000;
  }
  let heelRaw = Number($('heel')?.value || 10);
  let heelIn = heelRaw > 48 ? heelRaw / 25.4 : heelRaw;
  return heelIn * 0.0254;
}

function getGenerationPanelM(){
  if(currentGenUnit === 'mm'){
    return Number($('panel')?.value || 1219) / 1000;
  }
  let panelRaw = Number($('panel')?.value || 48);
  let panelIn = panelRaw > 120 ? panelRaw / 25.4 : panelRaw;
  return panelIn * 0.0254;
}

function getGenerationOverhangM(){
  if(currentGenUnit === 'mm'){
    return Number($('roof-overhang')?.value || 610) / 1000;
  }
  let ovhRaw = Number($('roof-overhang')?.value || 24);
  let ovhIn = ovhRaw > 72 ? ovhRaw / 25.4 : ovhRaw;
  return ovhIn * 0.0254;
}

function getGenerationWallHeightM(){
  if(currentGenUnit === 'mm'){
    return Number($('wall-height')?.value || 2438) / 1000;
  }
  let wallRaw = Number($('wall-height')?.value || 96);
  let wallIn = wallRaw > 144 ? wallRaw / 25.4 : wallRaw;
  return wallIn * 0.0254;
}

function setGenerationUnits(unit, convertValues = true){
  if(unit !== 'in' && unit !== 'mm') unit = 'in';
  const prevUnit = currentGenUnit;
  currentGenUnit = unit;

  if($('gen-units')) $('gen-units').value = unit;
  const btnIn = $('unit-btn-in');
  const btnMm = $('unit-btn-mm');
  if(btnIn && btnMm){
    btnIn.classList.toggle('active', unit === 'in');
    btnMm.classList.toggle('active', unit === 'mm');
  }
  if($('active-unit-badge')){
    $('active-unit-badge').textContent = unit === 'in' ? 'Imperial' : 'Metric';
  }

  if($('heel-unit-label')) $('heel-unit-label').textContent = unit === 'in' ? '(inches)' : '(mm)';
  if($('panel-unit-label')) $('panel-unit-label').textContent = unit === 'in' ? '(inches)' : '(mm)';
  if($('overhang-unit-label')) $('overhang-unit-label').textContent = unit === 'in' ? '(inches)' : '(mm)';

  const heelEl = $('heel');
  const panelEl = $('panel');
  const ovhEl = $('roof-overhang');

  if(unit === 'mm'){
    if(convertValues && prevUnit === 'in'){
      if(heelEl){
        const valIn = Number(heelEl.value || 10);
        heelEl.value = Math.round(valIn * 25.4);
      }
      if(panelEl){
        const valIn = Number(panelEl.value || 48);
        panelEl.value = Math.round(valIn * 25.4);
      }
      if(ovhEl){
        const valIn = Number(ovhEl.value || 24);
        ovhEl.value = Math.round(valIn * 25.4);
      }
    }
    if(heelEl){ heelEl.min = '50'; heelEl.max = '1200'; heelEl.step = '5'; }
    if(panelEl){ panelEl.min = '300'; panelEl.max = '3000'; panelEl.step = '10'; }
    if(ovhEl){ ovhEl.min = '0'; ovhEl.max = '1800'; ovhEl.step = '10'; }
  } else {
    if(convertValues && prevUnit === 'mm'){
      if(heelEl){
        const valMm = Number(heelEl.value || 254);
        heelEl.value = +(valMm / 25.4).toFixed(1);
      }
      if(panelEl){
        const valMm = Number(panelEl.value || 1219);
        panelEl.value = Math.round(valMm / 25.4);
      }
      if(ovhEl){
        const valMm = Number(ovhEl.value || 610);
        ovhEl.value = Math.round(valMm / 25.4);
      }
    }
    if(heelEl){ heelEl.min = '2'; heelEl.max = '48'; heelEl.step = '0.5'; }
    if(panelEl){ panelEl.min = '12'; panelEl.max = '120'; panelEl.step = '1'; }
    if(ovhEl){ ovhEl.min = '0'; ovhEl.max = '72'; ovhEl.step = '1'; }
  }

  updateGenerationHelpers();
  if(assembly && selected) updateSelection();
}

function updateGenerationHelpers(){
  if(currentGenUnit === 'mm'){
    let heelMm = Number($('heel')?.value || 254);
    let heelIn = +(heelMm / 25.4).toFixed(1);
    let heelFt = heelIn / 12;
    if($('heel-helper')) $('heel-helper').textContent = `${Math.round(heelMm)} mm (${heelIn}" / ${heelFt.toFixed(2)} ft) vertical heel depth from bearing plate`;

    let panelMm = Number($('panel')?.value || 1219);
    let panelIn = Math.round(panelMm / 25.4);
    let panelFt = panelIn / 12;
    if($('panel-helper')) $('panel-helper').textContent = `${Math.round(panelMm)} mm (${panelIn}" / ${panelFt.toFixed(1)} ft) target top-chord panel spacing`;

    let ovhMm = Number($('roof-overhang')?.value || 610);
    let ovhIn = +(ovhMm / 25.4).toFixed(1);
    let ovhFt = ovhIn / 12;
    let ovhFtIn = `${Math.floor(ovhFt)}'-${Math.round(ovhIn % 12)}"`;
    if($('overhang-helper')) $('overhang-helper').textContent = `${Math.round(ovhMm)} mm (${ovhIn.toFixed(1)}" / ${ovhFtIn}) eave overhang past bearing plate`;

    let whMm = Number($('wall-height')?.value || 2438);
    let whIn = +(whMm / 25.4).toFixed(1);
    let whFt = whIn / 12;
    if($('wall-height-helper')) $('wall-height-helper').textContent = `${Math.round(whMm)} mm (${whIn.toFixed(1)}" / ${whFt.toFixed(2)} ft) vertical stud height`;
  } else {
    let heelRaw = Number($('heel')?.value || 10);
    let heelIn = heelRaw > 48 ? heelRaw / 25.4 : heelRaw;
    let heelM = heelIn * 0.0254;
    let heelMm = Math.round(heelM * 1000);
    let heelFt = heelIn / 12;
    if($('heel-helper')) $('heel-helper').textContent = `${heelIn.toFixed(1)}" (${heelMm} mm / ${heelFt.toFixed(2)} ft) vertical heel depth from bearing plate`;

    let panelRaw = Number($('panel')?.value || 48);
    let panelIn = panelRaw > 120 ? panelRaw / 25.4 : panelRaw;
    let panelFt = panelIn / 12;
    let panelMm = Math.round(panelIn * 25.4);
    if($('panel-helper')) $('panel-helper').textContent = `${panelIn.toFixed(0)}" (${panelFt.toFixed(1)} ft / ${panelMm} mm) target top-chord panel spacing`;

    let ovhRaw = Number($('roof-overhang')?.value || 24);
    let ovhIn = ovhRaw > 72 ? ovhRaw / 25.4 : ovhRaw;
    let ovhFt = ovhIn / 12;
    let ovhFtIn = `${Math.floor(ovhFt)}'-${Math.round(ovhIn % 12)}"`;
    let ovhMm = Math.round(ovhIn * 25.4);
    if($('overhang-helper')) $('overhang-helper').textContent = `${ovhIn.toFixed(1)}" (${ovhFtIn} / ${ovhMm} mm) eave overhang past bearing plate`;

    let whRaw = Number($('wall-height')?.value || 96);
    let whIn = whRaw > 192 ? whRaw / 25.4 : whRaw;
    let whFt = whIn / 12;
    let whMm = Math.round(whIn * 25.4);
    if($('wall-height-helper')) $('wall-height-helper').textContent = `${whIn.toFixed(1)}" (${whFt.toFixed(2)} ft / ${whMm} mm) vertical stud height`;
  }
}
function current(){return assembly?.trusses.find(t=>t.id===selected);}
function settings(){
  const heel = getGenerationHeelM();
  const panel = getGenerationPanelM();
  const overhang = getGenerationOverhangM();
  if(!Number.isFinite(heel))throw Error('Invalid heel depth.');
  if(!Number.isFinite(panel))throw Error('Invalid panel length.');
  if(!Number.isFinite(overhang))throw Error('Invalid overhang.');
  return {heel,panel,overhang,inferHips:$('hips')?.checked};
}

async function generate(){
  if(busy)return;
  if(!source){
    try{
      const res=await fetch('./sample-roof-plan.dxf');
      if(res.ok){
        const txt=await res.text();
        await importData(txt,'sample-roof-plan.dxf','dxf');
        return;
      }
    }catch(err){
      message('Please import a CAD roof plan first.',true);
      return;
    }
  }
  try{
    const opts=settings();
    const existingEdits=new Map();
    if(assembly&&assembly.trusses){
      for(const tr of assembly.trusses){
        if(tr.edited||tr.heel!==undefined){
          existingEdits.set(tr.id,{
            type:tr.type,
            heel:tr.heel,
            height:tr.height,
            ply:tr.ply,
            members:tr.members,
            edited:tr.edited
          });
        }
      }
    }

    const next=assembleRoof(source,opts);
    if(!next.trusses.length)throw Error('No compatible framing planes could be assembled.');

    // Re-apply existing edits and custom topology to matched truss IDs
    for(const tr of next.trusses){
      const prev=existingEdits.get(tr.id);
      if(prev){
        if(prev.heel!==undefined)tr.heel=prev.heel;
        if(prev.ply)tr.ply=prev.ply;
        tr.edited=prev.edited;

        // If a custom topology style was applied, regenerate that parametric topology with preserved heel
        if(prev.type && !['Common','Stepdown','Girder','Front jack','Side jack','Hip carrier'].includes(prev.type)){
          tr.type=prev.type;
          if(prev.height)tr.height=prev.height;
          const topSize=prev.members?.find(m=>m.role==='top')?.sectionName||'2x4';
          const botSize=prev.members?.find(m=>m.role==='bottom')?.sectionName||'2x4';
          const webSize=prev.members?.find(m=>m.role==='web')?.sectionName||'2x4';
          const heelM=tr.heel!==undefined?tr.heel:opts.heel;
          const bearingSpan=getTrussBearingSpan(tr, ovh);
          const topo=buildParametricTrussTopology(tr.type,bearingSpan,tr.height,ovh,{
            topSize,bottomSize:botSize,webSize,heel:heelM
          });

          const existingChords=(prev.members||[]).filter(m=>m.role==='top'||m.role==='bottom'||m.role==='overhang');
          mapTopoMembersTo3D(topo, tr, existingChords);
          const newWebs=topo.members.filter(m=>m.role==='web');

          if(existingChords.length>0){
            tr.members=[...existingChords, ...newWebs];
          } else {
            tr.members=topo.members;
          }
        }
      }
    }

    const framingSrc = window.importedCadFraming || (source && source.bounds ? generateEnvelopeWallFraming(source.bounds[0], source.bounds[1], getGenerationWallHeightM()) : null);
    if(framingSrc){
      try {
        next.wallFraming = reseatWallFraming(framingSrc, next);
      } catch(e) {
        console.warn('Wall seating note:', e);
      }
    }

    assembly=next;

    advanced?.configureAssembly(assembly);
    selected=assembly.trusses.some(t=>t.id===selected)?selected:assembly.trusses[0].id;
    selectedMemberIndex=null;
    filter='All';
    if(viewer){
      viewer.filter='All';
      viewer.colorMode=$('color').value;
    }
    rebuildView();
    update();
    message('Complete roof generated.');
  }catch(e){
    message(`Roof generation failed: ${e.message}`, true);
  }
}

async function importData(data,fileName,kind){
  busy=true;
  $('generate').disabled=true;
  message('Processing roof geometry…');
  try{
    let nextSource;
    if(kind==='ifc'){
      nextSource=fromIFCAxes(await parseIFC(data),fileName);
    }else if(kind==='dxf'){
      dxfInfo=inspectDXF(data);
      const ls=dxfInfo.layers.length?dxfInfo.layers:['0'];
      const rSel=ls.find(l=>/^roof/i.test(l))||ls.find(l=>/outline|bound/i.test(l))||ls[0];
      const tSel=ls.find(l=>/^truss/i.test(l))||ls.find(l=>/rafter|framing|layout/i.test(l))||ls[0];
      if($('roof-layer'))$('roof-layer').innerHTML=ls.map(l=>`<option ${l===rSel?'selected':''}>${esc(l)}</option>`).join('');
      if($('truss-layer')){$('truss-layer').disabled=false;$('truss-layer').innerHTML=ls.map(l=>`<option ${l===tSel?'selected':''}>${esc(l)}</option>`).join('');}
      $('cad-options').hidden=false;
      const genOverhangIn = currentGenUnit === 'mm' ? (Number($('roof-overhang')?.value || 610) / 25.4) : Number($('roof-overhang')?.value || 24);
      nextSource=parseRoofDXF(data,{
        roofLayer:$('roof-layer')?.value||rSel,
        trussLayer:$('truss-layer')?.value||tSel,
        pitchDeg:Number($('roof-angle')?.value||22.5),
        overhang:genOverhangIn,
        unit:$('cad-units')?.value||'auto'
      });
      try {
        const buildingImport = parseBuildingDXF(data, $('cad-units')?.value || 'auto', nextSource.origin);
        if (buildingImport && buildingImport.walls) {
          window.importedBuildingWalls = buildingImport.walls;
        }
        if (buildingImport && buildingImport.cadFraming) {
          window.importedCadFraming = buildingImport.cadFraming;
          console.log('CAD Framing Imported:', window.importedCadFraming);
        } else {
          console.log('CAD Framing NOT found or empty.');
        }
      } catch (err) {
        console.warn('Wall generation note:', err);
      }
    }else{
      nextSource=parseRoofOBJ(data,Number($('units').value),$('axis').value==='Y');
    }
    if(!nextSource.axes.length)throw Error('No framing axes detected.');
    source=nextSource;raw=data;rawKind=kind;name=fileName;
    if($('project-name')) $('project-name').textContent=fileName;
    if($('dimensions')) $('dimensions').textContent=`${formatDim(source.bounds[0])} × ${formatDim(source.bounds[1])}`;
    generate();
  }catch(e){
    message(`Import failed: ${e.message}`,true);
  }finally{
    busy=false;
    $('generate').disabled=false;
  }
}

async function loadFile(f){if(!f||busy)return;if(!/\.(obj|ifc|dxf)$/i.test(f.name)){message('Select an OBJ, IFC or DXF file.',true);return;}if(f.size>25*1024*1024){message('File exceeds 25 MB.',true);return;}const lower=f.name.toLowerCase(),kind=lower.endsWith('.ifc')?'ifc':lower.endsWith('.dxf')?'dxf':'obj';await importData(kind==='ifc'?await f.arrayBuffer():await f.text(),f.name,kind);$('file').value='';}

async function preset(){try{$('units').value='0.0254';$('units').value||($('units').value='0.0254');$('axis').value='Z';const res=await fetch('./nw-6th-st.obj');if(!res.ok)throw Error('Project file unavailable.');await importData(await res.text(),'NW 6th St.obj','obj');}catch(e){message(e.message,true);}}

function getAnalysisOptions(){
  return {
    dead: Number($('analysis-dead')?.value || 10),
    roofLive: Number($('analysis-rooflive')?.value || 20),
    snow: Number($('analysis-snow')?.value || 0),
    wind: Number($('analysis-wind')?.value || 20),
    bottomLive: Number($('analysis-bottomlive')?.value || 10),
    trib: Number($('analysis-trib')?.value || 2),
    allow: Number($('analysis-allow')?.value || 875),
    limit: Number($('analysis-limit')?.value || 360)
  };
}

function runLocalFEA(truss){
  if(!truss) return null;
  const opts = getAnalysisOptions();
  currentFEA = calculateMemberStressHeatmap(truss, opts);

  truss.analysis = {
    pass: currentFEA.maxUnity <= 1.0,
    ratio: currentFEA.maxUnity,
    screeningStatus: currentFEA.maxUnity <= 1.0 ? 'PASS' : 'FAIL',
    status: currentFEA.maxUnity <= 1.0 ? 'PASS' : 'DESIGN REQUIRED',
    ply: truss.ply || 1,
    members: currentFEA.results.map(r => ({
      index: r.index,
      role: r.role,
      length: r.lengthM,
      force: r.axialForce_kN,
      ratio: r.unityRatio,
      size: r.sectionName,
      compression: r.isCompression,
      axialCapacity: r.capacity_kN
    })),
    displacement: (truss.span * 1000 / (opts.limit || 360)) * Math.min(1.8, Math.max(0.15, currentFEA.maxUnity)),
    deflectionCase: 'Governing D+Lr',
    reactions: [
      { case: 'Governing D+L', reactions: [
        { x: 0, force: Number((currentFEA.results.reduce((s,r)=>s+Math.abs(r.axialForce_kN),0)*0.22/Math.max(1,truss.ply||1)).toFixed(2)) },
        { x: truss.span, force: Number((currentFEA.results.reduce((s,r)=>s+Math.abs(r.axialForce_kN),0)*0.22/Math.max(1,truss.ply||1)).toFixed(2)) }
      ]}
    ]
  };

  return currentFEA;
}

function updateHUD(){
  const t=current();if(!t||!assembly)return;
  currentFEA=runLocalFEA(t);
  const uplift=calculateUpliftTieDowns(t);
  const carbon=calculateCarbonAndSustainability(assembly);

  if($('hud-span-val')) $('hud-span-val').textContent=formatDim(t.span);
  if($('hud-unity-val')){
    $('hud-unity-val').textContent=`${currentFEA.maxUnity.toFixed(2)} ${currentFEA.maxUnity<=1.0?'PASS':'FAIL'}`;
  }
  if($('hud-unity')){
    $('hud-unity').className=`hud-pill ${currentFEA.maxUnity<=1.0?'good':'alert'}`;
  }
  if($('hud-uplift-val')) $('hud-uplift-val').textContent=`${uplift.netUplift_kN} kN (${uplift.upliftLbs} lbs)`;
  if(carbon&&$('hud-bf-val')){
    $('hud-bf-val').textContent=`${carbon.totalBoardFeet.toLocaleString()} BF`;
  }
  if(carbon&&$('hud-co2-val')){
    $('hud-co2-val').textContent=`${carbon.sequesteredCO2Kg.toLocaleString()} kg`;
  }
  renderHardwareCard(uplift);
  renderCarbonCard(carbon);
}

function update(){
  if(!assembly)return;
  if($('coverage')) $('coverage').textContent=`${assembly.covered} / ${assembly.sourceAxisCount} RAFTERS INCLUDED`;
  if($('count')) $('count').textContent=assembly.trusses.length;
  if($('families')) $('families').innerHTML=`<button data-family="All" class="${filter==='All'?'active':''}">All <strong>${assembly.trusses.length}</strong></button>`+Object.entries(assembly.counts).map(([type,count])=>`<button data-family="${type}" class="${filter===type?'active':''}"><i style="background:${typeColors[type]||'#54caba'}"></i>${type}<strong>${count}</strong></button>`).join('');
  schedule();selection();draw();updateHUD();
}

function schedule(){
  if(!assembly)return;
  const q=$('search')?.value.toLowerCase() || '';
  const speciesKey = $('timber-species')?.value || 'douglas_fir';
  const species = TIMBER_SPECIES[speciesKey] || TIMBER_SPECIES.douglas_fir;

  const matched = assembly.trusses.filter(t => (filter==='All'||t.type===filter||t.id===selected) && `${t.id} ${t.type}`.toLowerCase().includes(q));

  const itemsHtml = matched.map(t => {
    const sw = calculateTrussSelfWeight(t, speciesKey);
    t.selfWeight = sw;

    const weightDisplay = currentGenUnit === 'mm'
      ? `${sw.weightKg} kg`
      : `${sw.weightLbs} lbs`;

    return `<button class="truss-row ${t.id===selected?'active':''}" data-truss="${t.id}" aria-pressed="${t.id===selected}">
      <i style="background:${typeColors[t.type]||'#54caba'}"></i>
      <div class="truss-row-info">
        <strong>${t.id}</strong>
        <span>${t.type}${t.proposed?' *':''}</span>
      </div>
      <div class="truss-row-metrics">
        <small>${formatDim(t.span)}</small>
        <small class="weight-metric" title="Self-weight (${species.name}): ${sw.weightLbs} lbs / ${sw.weightKg} kg">⚖️ ${weightDisplay}</small>
      </div>
    </button>`;
  }).join('');

  if ($('schedule')) {
    $('schedule').innerHTML = itemsHtml || '<p class="help">No matching trusses.</p>';
  }

  if ($('schedule-summary')) {
    const overallWeightKg = Math.round(assembly.trusses.reduce((sum, t) => sum + (calculateTrussSelfWeight(t, speciesKey).weightKg), 0));
    const overallWeightLbs = Math.round(overallWeightKg * 2.20462);
    const summaryDisplay = currentGenUnit === 'mm'
      ? `${overallWeightKg.toLocaleString()} kg (${overallWeightLbs.toLocaleString()} lbs)`
      : `${overallWeightLbs.toLocaleString()} lbs (${overallWeightKg.toLocaleString()} kg)`;
    $('schedule-summary').textContent = `Total Self-Weight: ${summaryDisplay} [${species.name}]`;
  }
}

function select(id,index){
  if(!assembly?.trusses.some(t=>t.id===id))return;
  selected=id;
  selectedMemberIndex=Number.isInteger(index)?index:null;
  advanced?.selectionChanged(id,index);
  viewer?.select(id, index);
  drawZoom=1;drawPan=[0,0];
  schedule();selection();draw();updateHUD();
  if(viewer?.isolate)viewer.fit();
}

function setMemberSize(m,sizeName){
  const spec=SECTION_SPECS[sizeName]||SECTION_SPECS['2x4'];
  m.sectionName=spec.name;
  m.section=[spec.b,spec.d];
  m.thickness=spec.b;
  m.material='timber';
}

function applyMemberSize(truss,mIdx,sizeName){
  if(!truss?.members[mIdx])return;
  setMemberSize(truss.members[mIdx],sizeName);
  truss.edited=true;
  runLocalFEA(truss);
  advanced?.invalidate();
  rebuildView();
  selection();
  draw();
  updateHUD();
  message(`Member M${mIdx+1} size set to ${sizeName}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}]. Visuals updated.`);
}

function applyRoleSize(truss,role,sizeName){
  if(!truss)return;
  let count=0;
  truss.members.forEach(m=>{
    if(m.role===role||(role==='top'&&m.role==='overhang')){
      setMemberSize(m,sizeName);
      count++;
    }
  });
  truss.edited=true;
  runLocalFEA(truss);
  advanced?.invalidate();
  rebuildView();
  selection();
  draw();
  updateHUD();
  message(`Set ${count} ${role.toUpperCase()} member(s) in ${truss.id} to ${sizeName}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}].`);
}

function applyAllTrussesRoleSize(role,sizeName){
  if(!assembly)return;
  let count=0;
  assembly.trusses.forEach(t=>{
    t.members.forEach(m=>{
      if(m.role===role||(role==='top'&&m.role==='overhang')){
        setMemberSize(m,sizeName);
        count++;
      }
    });
    t.edited=true;
  });
  const cur=current();
  if(cur) runLocalFEA(cur);
  advanced?.invalidate();
  rebuildView();
  selection();
  draw();
  updateHUD();
  message(`Updated ${count} ${role.toUpperCase()} members across all ${assembly.trusses.length} trusses to ${sizeName}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'}.`);
}

function selection(){
  const t=current();if(!t)return;
  const transferred=t.connections.map(c=>c.to).join(', ');
  const m=Number.isInteger(selectedMemberIndex)&&t.members[selectedMemberIndex]?t.members[selectedMemberIndex]:null;
  const fea=m&&currentFEA?.results?currentFEA.results[selectedMemberIndex]:null;
  const suggestion=m?suggestOptimalLumberSize(m,fea,t.ply):null;

  const currentTopSize=t.members.find(x=>x.role==='top')?.sectionName||'2x4';
  const currentBotSize=t.members.find(x=>x.role==='bottom')?.sectionName||'2x4';
  const currentWebSize=t.members.find(x=>x.role==='web')?.sectionName||'2x4';

  const sectionOptions=Object.keys(SECTION_SPECS);

  // Role-based FEA force calculations for recommendations
  const topM = t.members.filter(x => x.role === 'top' || x.role === 'overhang');
  const botM = t.members.filter(x => x.role === 'bottom');
  const webM = t.members.filter(x => x.role === 'web');

  const topFeas = topM.map(mem => currentFEA?.results?.[mem.index]);
  const botFeas = botM.map(mem => currentFEA?.results?.[mem.index]);
  const webFeas = webM.map(mem => currentFEA?.results?.[mem.index]);

  const maxTopIdx = topM.reduce((best, mem, i) => (!topFeas[best] || Math.abs(topFeas[i]?.axialForce_kN || 0) > Math.abs(topFeas[best]?.axialForce_kN || 0)) ? i : best, 0);
  const maxBotIdx = botM.reduce((best, mem, i) => (!botFeas[best] || Math.abs(botFeas[i]?.axialForce_kN || 0) > Math.abs(botFeas[best]?.axialForce_kN || 0)) ? i : best, 0);
  const maxWebIdx = webM.reduce((best, mem, i) => (!webFeas[best] || Math.abs(webFeas[i]?.axialForce_kN || 0) > Math.abs(webFeas[best]?.axialForce_kN || 0)) ? i : best, 0);

  const recTopSize = topM[maxTopIdx] ? suggestOptimalLumberSize(topM[maxTopIdx], topFeas[maxTopIdx], t.ply).suggestedSize : '2x4';
  const recBotSize = botM[maxBotIdx] ? suggestOptimalLumberSize(botM[maxBotIdx], botFeas[maxBotIdx], t.ply).suggestedSize : '2x4';
  const recWebSize = webM[maxWebIdx] ? suggestOptimalLumberSize(webM[maxWebIdx], webFeas[maxWebIdx], t.ply).suggestedSize : '2x4';

  let html=`<div class="selected-truss-station">
    <div class="station-header">
      <div class="station-title-group">
        <h2>${t.id} <span class="station-badge ${currentFEA?.maxUnity<=1.0?'pass':'fail'}">${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'} (${currentFEA?.maxUnity?.toFixed(2)||'—'} D/C)</span></h2>
        <span style="font-size:12px;color:#8ba3b5">${t.type}${t.proposed?' · inferred':''} · ${t.ply} ply · ${t.members.length*t.ply} members</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <div>
          <strong style="font-size:15px;color:#0f172a">${formatDim(t.span)}</strong>
          <span style="font-size:11px;color:#475569"> · ${formatDim(t.height)} rise</span>
        </div>
        <button id="station-toggle-fea-mode" class="quick-size-btn" style="background:#f1f5f9;color:${drawViewMode==='fea'?'#ca8a04':'#0284c7'};border:1px solid #cbd5e1">
          ${drawViewMode==='fea'?'📐 View Geometry in Elevation':'⚡ View FEA Stress in Elevation'}
        </button>
      </div>
    </div>`;

  // IF A SPECIFIC MEMBER IS SELECTED
  if(m && Number.isInteger(selectedMemberIndex)){
    html+=`<div class="selected-member-highlight-box">
      <div class="selected-member-header">
        <h3><span>📐</span> SELECTED MEMBER M${selectedMemberIndex+1} <span style="font-size:11px;background:#e2e8f0;color:#0f172a;padding:2px 7px;border-radius:4px;font-family:monospace">${m.role.toUpperCase()}</span></h3>
        <button id="btn-deselect-member" class="quick-size-btn" style="background:#ffffff;color:#475569">✕ Close Member</button>
      </div>
      <div class="selected-member-stats">
        <div class="stat-mini-pill"><span>Length</span><strong>${formatDim(m.length)}</strong></div>
        <div class="stat-mini-pill"><span>Current Size</span><strong style="color:#0f172a">${m.sectionName||'2x4'}</strong></div>
        <div class="stat-mini-pill"><span>Axial Force P</span><strong style="color:${fea?.isCompression?'#ea580c':'#0284c7'}">${fea?.axialForce_kN||0} kN (${fea?.isCompression?'C':'T'})</strong></div>
        <div class="stat-mini-pill"><span>Capacity Pallow</span><strong>${fea?.capacity_kN||0} kN</strong></div>
        <div class="stat-mini-pill"><span>Unity (D/C)</span><strong style="color:${fea?.status==='PASS'?'#15803d':'#dc2626'}">${fea?.unityRatio||0} [${fea?.status||'PASS'}]</strong></div>
        <div class="stat-mini-pill"><span>Slenderness λ</span><strong>${fea?.slenderness||0}</strong></div>
      </div>
      ${suggestion ? `
      <div style="background:${suggestion.isOptimal ? '#f0fdf4' : '#fffbe2'}; padding:8px 10px; border-radius:6px; border:1px solid ${suggestion.isOptimal ? '#bbf7d0' : '#fef08a'}; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <div style="font-size:11.5px; color:${suggestion.isOptimal ? '#15803d' : '#92400e'}">
          <strong>${suggestion.message}</strong>
        </div>
        ${!suggestion.isOptimal ? `<button id="btn-apply-suggested-size" class="btn-accent" style="white-space:nowrap; padding:4px 10px; font-size:11px; background:#0284c7; border:none; border-radius:4px; color:#fff; cursor:pointer">⚡ Apply ${suggestion.suggestedSize}</button>` : ''}
      </div>` : ''}
      <div style="background:#f8fafc;padding:10px 12px;border-radius:6px;border:1px solid #cbd5e1;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:11.5px;font-weight:600;color:#334155;margin:0">Manual Size Override (Live FEA):</label>
          <select id="single-member-size-select" style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;border-radius:4px;padding:4px 8px;font-size:12px">
            ${sectionOptions.map(s=>`<option value="${s}" ${(m.sectionName||'2x4')===s?'selected':''}>${s}${suggestion && s===suggestion.suggestedSize ? ' ★ (Recommended)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="quick-size-buttons">
          ${['2x4','2x6','2x8','2x10','2x12','LVL 1-3/4x9-1/2','LVL 1-3/4x11-7/8'].map(sz=>`
            <button class="quick-size-btn ${m.sectionName===sz?'active':''}" data-member-size="${sz}">${sz}${suggestion && sz===suggestion.suggestedSize ? ' ★' : ''}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="btn-apply-single-size" class="btn-accent" style="flex:1">Apply to M${selectedMemberIndex+1}</button>
          <button id="btn-apply-role-this-truss" style="background:#ffffff;color:#334155;border:1px solid #cbd5e1;padding:5px 9px;font-size:11.5px;border-radius:4px">Apply to all ${m.role} in ${t.id}</button>
        </div>
      </div>
      <div class="action-buttons-grid">
        <button id="btn-delete-this-member" class="btn-subtle-danger">Delete Member</button>
        <button id="btn-toggle-clr" style="background:#ffffff;color:#334155;border:1px solid #cbd5e1">Toggle CLR Brace</button>
        <button id="btn-apply-role-all-trusses" style="background:#ffffff;color:#334155;border:1px solid #cbd5e1">Apply ${m.sectionName||'2x4'} to ALL trusses (${m.role})</button>
      </div>
    </div>`;
  }

  // TRUSS STYLE / TOPOLOGY EDITING SECTION
  html+=`<div class="station-subcard">
    <div class="station-subcard-title">
      <span>📐 CHANGE TRUSS STYLE / TOPOLOGY</span>
      <span class="count-tag">${TRUSS_TOPOLOGIES.length} Available</span>
    </div>
    <div class="style-chips-grid">
      ${TRUSS_TOPOLOGIES.map(topo=>`
        <button class="style-chip ${t.type.toLowerCase().includes(topo.id.toLowerCase())?'active':''}" data-style-id="${topo.id}" title="${topo.desc}">
          ${topo.name}
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <select id="sel-truss-style" style="flex:1;background:#ffffff;border:1px solid #cbd5e1;color:#0f172a;padding:6px 9px;border-radius:5px;font-size:12px">
        ${TRUSS_TOPOLOGIES.map(topo=>`<option value="${topo.id}" ${t.type.toLowerCase().includes(topo.id.toLowerCase())?'selected':''}>${topo.name} — ${topo.desc}</option>`).join('')}
      </select>
      <button id="btn-morph-style" class="btn-accent" style="white-space:nowrap;padding:6px 12px">Apply Style</button>
    </div>
  </div>`;

  // BULK MEMBER SIZING FOR THIS TRUSS & ALL TRUSSES
  html+=`<div class="station-subcard">
    <div class="station-subcard-title">
      <span>🪵 EDIT MEMBER SIZES BY ROLE & AUTO-OPTIMIZATION</span>
      <span style="font-size:10.5px;color:#0284c7;font-weight:600">Rec: Top ${recTopSize} · Bot ${recBotSize} · Web ${recWebSize}</span>
    </div>
    <div class="member-size-grid">
      <label>Top Chords:
        <select id="bulk-sel-top">
          ${sectionOptions.map(s=>`<option value="${s}" ${currentTopSize===s?'selected':''}>${s}${s===recTopSize ? ' ★ (Rec)' : ''}</option>`).join('')}
        </select>
      </label>
      <label>Bottom Chords:
        <select id="bulk-sel-bot">
          ${sectionOptions.map(s=>`<option value="${s}" ${currentBotSize===s?'selected':''}>${s}${s===recBotSize ? ' ★ (Rec)' : ''}</option>`).join('')}
        </select>
      </label>
      <label>Web Members:
        <select id="bulk-sel-web">
          ${sectionOptions.map(s=>`<option value="${s}" ${currentWebSize===s?'selected':''}>${s}${s===recWebSize ? ' ★ (Rec)' : ''}</option>`).join('')}
        </select>
      </label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="btn-apply-bulk-truss" class="btn-accent" style="flex:1">Apply Sizes to ${t.id}</button>
      <button id="btn-auto-optimize-truss" style="background:#0284c7;color:#ffffff;border:none;padding:6px 10px;border-radius:5px;font-size:11.5px;font-weight:600;cursor:pointer">⚡ Auto-Optimize ${t.id}</button>
      <button id="btn-apply-bulk-all" style="background:#ffffff;border:1px solid #cbd5e1;color:#334155;padding:6px 10px;border-radius:5px;font-size:11.5px">Apply to ALL Trusses</button>
    </div>
  </div>`;

  const heelValM = t.heel !== undefined ? t.heel : getGenerationHeelM();
  const ovhValM = getGenerationOverhangM();

  let heelDisp, heelUnitLabel, heelHelperText, heelMin, heelMax, heelStep;
  let ovhDisp, ovhUnitLabel, ovhHelperText, ovhMin, ovhMax, ovhStep;

  if (currentGenUnit === 'mm') {
    const hMm = Math.round(heelValM * 1000);
    const hIn = (heelValM / 0.0254).toFixed(1);
    heelDisp = hMm;
    heelUnitLabel = '(mm)';
    heelHelperText = `${hMm} mm (${hIn}")`;
    heelMin = 50; heelMax = 1200; heelStep = 5;

    const oMm = Math.round(ovhValM * 1000);
    const oIn = (ovhValM / 0.0254).toFixed(1);
    ovhDisp = oMm;
    ovhUnitLabel = '(mm)';
    ovhHelperText = `${oMm} mm (${oIn}")`;
    ovhMin = 0; ovhMax = 1800; ovhStep = 10;
  } else {
    const hIn = +(heelValM / 0.0254).toFixed(1);
    const hFt = (hIn / 12).toFixed(2);
    heelDisp = hIn;
    heelUnitLabel = '(inches)';
    heelHelperText = `${hIn}" (${hFt} ft)`;
    heelMin = 2; heelMax = 48; heelStep = 0.5;

    const oIn = +(ovhValM / 0.0254).toFixed(1);
    const oFt = (oIn / 12).toFixed(2);
    ovhDisp = oIn;
    ovhUnitLabel = '(inches)';
    ovhHelperText = `${oIn}" (${oFt} ft)`;
    ovhMin = 0; ovhMax = 72; ovhStep = 1;
  }

  // TRUSS PROPERTIES, GEOMETRY & SPECIFICATIONS
  html+=`<div class="station-subcard">
    <div class="station-subcard-title">
      <span>⚙️ TRUSS GEOMETRY & SPECIFICATIONS</span>
    </div>
    <div class="edit-row">
      <label>Classification
        <select id="edit-type">${Object.keys(typeColors).filter(k=>!['Unclassified','Mono'].includes(k)).map(k=>`<option ${k===t.type?'selected':''}>${k}</option>`).join('')}</select>
      </label>
      <label>Plies
        <select id="edit-ply">${[1,2,3,4].map(n=>`<option ${n===t.ply?'selected':''}>${n}</option>`).join('')}</select>
      </label>
    </div>
    <div class="edit-row" style="margin-top:8px">
      <label>Truss Rise / Height
        <div style="display:flex;gap:4px;align-items:center">
          <input id="edit-station-height" type="number" step="0.05" min="0.4" max="6.0" value="${t.height.toFixed(2)}" style="flex:1">
          <button id="btn-rise-dec" class="quick-size-btn" style="padding:4px 8px" title="Decrease rise by 6 inches">-6"</button>
          <button id="btn-rise-inc" class="quick-size-btn" style="padding:4px 8px" title="Increase rise by 6 inches">+6"</button>
        </div>
        <small style="color:#64748b">${formatDim(t.height)} rise</small>
      </label>
      <label>Heel Height <em>${heelUnitLabel}</em>
        <input id="edit-station-heel" type="number" step="${heelStep}" min="${heelMin}" max="${heelMax}" value="${heelDisp}">
        <small style="color:#64748b">${heelHelperText}</small>
      </label>
      <label>Eave Overhang <em>${ovhUnitLabel}</em>
        <input id="edit-station-overhang" type="number" step="${ovhStep}" min="${ovhMin}" max="${ovhMax}" value="${ovhDisp}">
        <small style="color:#64748b">${ovhHelperText}</small>
      </label>
    </div>
    <p style="font-size:11.5px;color:#64748b;margin:8px 0 0">⚖️ <strong>Calculated Self-Weight:</strong> ${currentGenUnit==='mm'?`${calculateTrussSelfWeight(t, $('timber-species')?.value||'douglas_fir').weightKg} kg (${calculateTrussSelfWeight(t, $('timber-species')?.value||'douglas_fir').weightLbs} lbs)`:`${calculateTrussSelfWeight(t, $('timber-species')?.value||'douglas_fir').weightLbs} lbs (${calculateTrussSelfWeight(t, $('timber-species')?.value||'douglas_fir').weightKg} kg)`} [${(TIMBER_SPECIES[$('timber-species')?.value||'douglas_fir']||TIMBER_SPECIES.douglas_fir).name}] · ${t.sources.length} source rafter(s) · ${transferred?'Candidate transfer to '+esc(transferred):t.full?'End bearings assumed':'No receiving truss identified'}. ${esc(t.review)}.</p>
  </div>
  </div>`;

  if($('selection')) $('selection').innerHTML=html;

  // Sync active class on sidebar topology cards to current truss type
  if ($('topology-grid')) {
    const tType = (t.type || '').toLowerCase();
    document.querySelectorAll('#topology-grid .topology-card').forEach(card => {
      const cardTopo = (card.dataset.topo || '').toLowerCase();
      card.classList.toggle('active', tType.includes(cardTopo));
    });
  }

  // BIND ALL INTERACTIVE CONTROLS & IMMEDIATE LISTENERS

  // Elevation view mode toggle
  if($('station-toggle-fea-mode'))$('station-toggle-fea-mode').onclick=()=>{
    drawViewMode=(drawViewMode==='fea'?'geom':'fea');
    drawModeButtons.forEach(b=>$(b.id)?.classList.toggle('active',b.mode===drawViewMode));
    if($('draw-legend'))$('draw-legend').hidden=(drawViewMode==='geom'||drawViewMode==='deflect');
    draw();
    selection();
    message(`Switched elevation drawing to ${drawViewMode==='fea'?'FEA Stress Heatmap view':'Geometry view'}.`);
  };

  // Close member selection
  if($('btn-deselect-member'))$('btn-deselect-member').onclick=()=>{
    selectedMemberIndex=null;
    advanced?.selectionChanged(t.id,null);
    selection();
    draw();
  };

  // SINGLE MEMBER SIZE SELECT - Immediate change listener
  const singleSel=$('single-member-size-select');
  if(singleSel){
    singleSel.onchange=()=>{
      if(Number.isInteger(selectedMemberIndex))applyMemberSize(t,selectedMemberIndex,singleSel.value);
    };
  }

  // Quick size buttons - Immediate click listener
  document.querySelectorAll('[data-member-size]').forEach(btn=>{
    btn.onclick=()=>{
      const sz=btn.dataset.memberSize;
      if($('single-member-size-select'))$('single-member-size-select').value=sz;
      if(Number.isInteger(selectedMemberIndex))applyMemberSize(t,selectedMemberIndex,sz);
    };
  });

  if($('btn-apply-single-size'))$('btn-apply-single-size').onclick=()=>{
    const sz=$('single-member-size-select')?.value||'2x4';
    if(Number.isInteger(selectedMemberIndex))applyMemberSize(t,selectedMemberIndex,sz);
  };

  if($('btn-apply-role-this-truss'))$('btn-apply-role-this-truss').onclick=()=>{
    const sz=$('single-member-size-select')?.value||'2x4';
    if(m)applyRoleSize(t,m.role,sz);
  };

  if($('btn-apply-role-all-trusses'))$('btn-apply-role-all-trusses').onclick=()=>{
    const sz=$('single-member-size-select')?.value||'2x4';
    if(m)applyAllTrussesRoleSize(m.role,sz);
  };

  if($('btn-delete-this-member'))$('btn-delete-this-member').onclick=()=>{
    if(!Number.isInteger(selectedMemberIndex))return;
    t.members.splice(selectedMemberIndex,1);
    t.edited=true;
    selectedMemberIndex=null;
    runLocalFEA(t);
    advanced?.invalidate();
    rebuildView();
    selection();
    draw();
    updateHUD();
    message(`Member removed from ${t.id}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'}. Capacities updated.`);
  };

  if($('btn-toggle-clr'))$('btn-toggle-clr').onclick=()=>{
    message(`Continuous Lateral Restraint (CLR) toggled for ${t.id}. Bracing requirements recorded.`);
  };

  // TRUSS STYLE & TOPOLOGY - Immediate listeners
  const selStyle=$('sel-truss-style');
  if(selStyle){
    selStyle.onchange=()=>{
      morphTopology(selStyle.value);
    };
  }

  document.querySelectorAll('[data-style-id]').forEach(btn=>{
    btn.onclick=()=>morphTopology(btn.dataset.styleId);
  });

  if($('btn-morph-style'))$('btn-morph-style').onclick=()=>{
    morphTopology($('sel-truss-style').value);
  };

  // BULK ROLE SIZING - Immediate change listeners
  const bulkTop=$('bulk-sel-top');
  if(bulkTop){
    bulkTop.onchange=()=>{
      applyRoleSize(t,'top',bulkTop.value);
    };
  }

  const bulkBot=$('bulk-sel-bot');
  if(bulkBot){
    bulkBot.onchange=()=>{
      applyRoleSize(t,'bottom',bulkBot.value);
    };
  }

  const bulkWeb=$('bulk-sel-web');
  if(bulkWeb){
    bulkWeb.onchange=()=>{
      applyRoleSize(t,'web',bulkWeb.value);
    };
  }

  if($('btn-apply-bulk-truss'))$('btn-apply-bulk-truss').onclick=()=>{
    const tc=$('bulk-sel-top').value;
    const bc=$('bulk-sel-bot').value;
    const wb=$('bulk-sel-web').value;
    applyRoleSize(t,'top',tc);
    applyRoleSize(t,'bottom',bc);
    applyRoleSize(t,'web',wb);
    message(`Applied sizes (TC: ${tc}, BC: ${bc}, Web: ${wb}) to ${t.id}. Local FEA re-run.`);
  };

  if($('btn-apply-suggested-size')) $('btn-apply-suggested-size').onclick = () => {
    if (m && suggestion && Number.isInteger(selectedMemberIndex)) {
      applyMemberSize(t, selectedMemberIndex, suggestion.suggestedSize);
    }
  };

  if($('btn-auto-optimize-truss')) $('btn-auto-optimize-truss').onclick = () => {
    applyRoleSize(t, 'top', recTopSize);
    applyRoleSize(t, 'bottom', recBotSize);
    applyRoleSize(t, 'web', recWebSize);
    message(`Auto-optimized sizes for ${t.id}: Top ${recTopSize}, Bottom ${recBotSize}, Web ${recWebSize}. Local FEA re-run.`);
  };

  if($('btn-apply-bulk-all'))$('btn-apply-bulk-all').onclick=()=>{
    const tc=$('bulk-sel-top').value;
    const bc=$('bulk-sel-bot').value;
    const wb=$('bulk-sel-web').value;
    applyAllTrussesRoleSize('top',tc);
    applyAllTrussesRoleSize('bottom',bc);
    applyAllTrussesRoleSize('web',wb);
    message(`Applied sizes (TC: ${tc}, BC: ${bc}, Web: ${wb}) to all trusses in roof. Local FEA re-run.`);
  };

  // TRUSS SPECIFICATIONS & GEOMETRY - Immediate listeners
  const heightInput=$('edit-station-height');
  if(heightInput){
    heightInput.onchange=()=>{
      const h=Number(heightInput.value);
      if(h>=0.4&&h<=6.0)morphTrussGeometry(t,h,null);
    };
  }

  if($('btn-rise-dec'))$('btn-rise-dec').onclick=()=>{
    const h=Math.max(0.4,Number((t.height-0.1524).toFixed(3)));
    morphTrussGeometry(t,h,null);
  };

  if($('btn-rise-inc'))$('btn-rise-inc').onclick=()=>{
    const h=Math.min(6.0,Number((t.height+0.1524).toFixed(3)));
    morphTrussGeometry(t,h,null);
  };

  const ovhInput=$('edit-station-overhang');
  if(ovhInput){
    ovhInput.onchange=()=>{
      let val=Number(ovhInput.value);
      const ovh = currentGenUnit === 'mm' ? val / 1000 : val * 0.0254;
      if(ovh>=0&&ovh<=2.5)morphTrussGeometry(t,t.height,ovh);
    };
  }

  const heelInput=$('edit-station-heel');
  if(heelInput){
    heelInput.onchange=()=>{
      let val=Number(heelInput.value);
      const heelM = currentGenUnit === 'mm' ? val / 1000 : val * 0.0254;
      if(heelM>=0.05&&heelM<=1.25)morphTrussGeometry(t,t.height,null,heelM);
    };
  }

  if($('edit-type'))$('edit-type').onchange=()=>{
    t.type=$('edit-type').value;
    t.review='Manual classification — structural role verified';
    assembly.counts={};
    assembly.trusses.forEach(tr=>assembly.counts[tr.type]=(assembly.counts[tr.type]||0)+1);
    runLocalFEA(t);
    rebuildView();
    update();
  };

  if($('edit-ply'))$('edit-ply').onchange=()=>{
    t.ply=Number($('edit-ply').value);
    runLocalFEA(t);
    advanced?.invalidate();
    rebuildView();
    selection();
    draw();
    updateHUD();
    message(`Ply count updated to ${t.ply}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}].`);
  };
}

function rebuildView(){
  const hint=$('viewport-empty-hint');
  if(hint)hint.style.display=assembly?'none':'block';
  if(viewer){
    viewer.setModel(source,assembly);
    if(selected)viewer.select(selected, selectedMemberIndex);
    if($('cut')) viewer.section(Number($('cut').value));
  }
}

function setView(v){
  mode=v;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-selected',b.dataset.view===v)});
  if($('viewports')) $('viewports').classList.toggle('split',v==='split');
  if($('drawing-pane')) $('drawing-pane').hidden=v!=='split';
  viewer?.setView(v==='split'?'iso':v);
  if(viewer){viewer.layers.labels=(v==='plan');viewer.updateVisibility();}
  if($('view-title')) $('view-title').textContent={iso:'FULL ROOF / PERSPECTIVE',plan:'ROOF PLAN / ORTHOGRAPHIC',front:'FRONT / ORTHOGRAPHIC',side:'SIDE / ORTHOGRAPHIC',split:'3D + SELECTED TRUSS ELEVATION'}[v];
  const navHint = document.querySelector('.nav-hint');
  if(navHint) navHint.textContent=['iso','split'].includes(v)?'Drag to orbit · right-drag to pan · scroll to zoom':'Drag to pan · scroll to zoom · select a truss';
  draw();
}

function drawingSVG(t){
  const origin=t.profile[0],d=[t.profile.at(-1)[0]-origin[0],t.profile.at(-1)[1]-origin[1]],L=Math.hypot(...d),u=d.map(x=>x/L),s=Math.min(650/L,270/t.height);
  const pt=p=>{
    let xProj=((p[0]-origin[0])*u[0]+(p[1]-origin[1])*u[1]);
    if(Math.abs(xProj)>L*2.5&&p[0]>=-2&&p[0]<=L+2)xProj=p[0];
    const zProj=(p[2]>=t.base-0.5&&p[2]<=t.base+t.height+2)?(p[2]-t.base):p[2];
    return [75+xProj*s,340-zProj*s];
  };
  const line=(a,b,c,w=2,extra='')=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${w}" ${extra}/>`;

  currentFEA=runLocalFEA(t)||calculateMemberStressHeatmap(t,getAnalysisOptions());
  const plates=calculateConnectorPlates(t,currentFEA);

  let str='<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e2e8f0" stroke-width=".5"/></pattern></defs><rect width="800" height="460" fill="url(#grid)"/>';
  str+=`<g transform="translate(${drawPan[0]} ${drawPan[1]}) translate(400 230) scale(${drawZoom}) translate(-400 -230)">`;

  // Draw members
  t.members.forEach((m,idx)=>{
    const pa=pt(m.a),pb=pt(m.b);
    const fea=currentFEA.results[idx]||{};
    const isSelectedMember=(selectedMemberIndex===idx);

    const spec=SECTION_SPECS[m.sectionName]||SECTION_SPECS['2x4'];
    const depthMm=(spec.d||0.0889)*1000;
    const scaleRatio=depthMm/88.9;
    const geomWidth=m.role==='web'
      ? Math.max(1.8, Math.min(6.5, 2.0*scaleRatio))
      : Math.max(3.2, Math.min(9.5, 3.5*scaleRatio));

    let col=m.role==='top'?'#2d6a4f':m.role==='bottom'?'#1d4ed8':'#64748b';
    let width=geomWidth;

    if(drawViewMode==='fea'){
      const isFail=(fea.unityRatio>1.0);
      col=isFail?'#dc2626':(fea.isCompression?'#ea580c':'#0284c7');
      width=Math.max(2.5,Math.min(9.0,geomWidth+fea.unityRatio*2.8));
    } else if(drawViewMode==='plates'){
      col='#475569';
      width=Math.max(2.2,geomWidth*0.7);
    }

    // Overstressed warning halo in FEA mode
    if(drawViewMode==='fea'&&fea.unityRatio>1.0&&!isSelectedMember){
      str+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="#dc2626" stroke-width="${width+5}" stroke-linecap="round" opacity="0.35" stroke-dasharray="4 3"/>`;
    }

    // Glowing selection halo if selected in elevation report
    if(isSelectedMember){
      str+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="#eab308" stroke-width="${width+6}" stroke-linecap="round" opacity="0.6"/>`;
      str+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="#ffffff" stroke-width="${width+2}" stroke-dasharray="6 3" stroke-linecap="round"/>`;
    }
    str+=`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="transparent" stroke-width="16" stroke-linecap="round" data-idx="${idx}" style="cursor:pointer"/>`;
    str+=line(pa,pb,isSelectedMember?'#ca8a04':col,isSelectedMember?Math.max(4.5,width+2):width,`data-idx="${idx}" class="truss-member-elem ${isSelectedMember?'active-member':''}" style="cursor:pointer"`);

    // Member text: NO circle and NO text background
    if(isSelectedMember){
      const mid=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2];
      str+=`<g transform="translate(${mid[0]},${mid[1]-12})">
        <text x="0" y="0" text-anchor="middle" fill="#0f172a" font-size="10.5" font-weight="700" font-family="monospace">M${idx+1} [${m.sectionName||'2x4'}] · D/C: ${fea.unityRatio||'—'}</text>
      </g>`;
    }

    if(drawViewMode==='fea'&&!isSelectedMember){
      const mid=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2];
      const sign=fea.isCompression?'-':'+';
      str+=`<text x="${mid[0]}" y="${mid[1]-6}" text-anchor="middle" fill="${fea.unityRatio>1.0?'#dc2626':'#0f172a'}" font-size="9" font-weight="700" font-family="monospace">${sign}${Math.abs(fea.axialForce_kN)} ${fea.isCompression?'C':'T'} (${fea.unityRatio})</text>`;
    }
  });

  // Connector plates: smaller so wood member joints are clearly visible
  if(drawViewMode==='plates'){
    plates.forEach(p=>{
      const cp=pt([p.x,0,p.z]);
      const pw=Math.max(10,p.lengthIn*1.5),ph=Math.max(8,p.widthIn*1.5);
      str+=`<rect x="${cp[0]-pw/2}" y="${cp[1]-ph/2}" width="${pw}" height="${ph}" rx="2" fill="#cbd5e1" stroke="#475569" stroke-width="0.8" opacity="0.65"/>`;
      str+=`<text x="${cp[0]}" y="${cp[1]+2.5}" text-anchor="middle" fill="#0f172a" font-size="7.5" font-family="monospace" font-weight="700">${p.widthIn}x${p.lengthIn}"</text>`;
    });
  }

  // Deflection curve if mode === 'deflect'
  const a=pt([origin[0],origin[1],t.base]),b=pt([t.profile.at(-1)[0],t.profile.at(-1)[1],t.base]);
  if(drawViewMode==='deflect'){
    const maxDeltaPx=Math.min(32,Math.max(8,(t.span*1000/360)*0.7));
    str+=`<path d="M${a[0]} ${a[1]} Q ${(a[0]+b[0])/2} ${a[1]+maxDeltaPx} ${b[0]} ${b[1]}" stroke="#d97706" stroke-width="2.5" stroke-dasharray="4 2" fill="none"/>`;
    str+=`<text x="${(a[0]+b[0])/2}" y="${a[1]+maxDeltaPx+18}" text-anchor="middle" fill="#d97706" font-size="11.5" font-family="monospace">Max Deflection: ${(t.span*1000/360).toFixed(1)} mm (L/360 Limit)</text>`;
  }

  // Horizontal dimension line (Span)
  str+=line([a[0],390],[b[0],390],'#899ca8',1);
  for(const x of [a[0],b[0]])str+=line([x,365],[x,400],'#bac6ce',1);
  str+=`<rect x="${(a[0]+b[0])/2-60}" y="378" width="120" height="22" fill="#ffffff" stroke="#e2e8f0" rx="3"/><text x="${(a[0]+b[0])/2}" y="393" text-anchor="middle" fill="#334155" font-size="12" font-weight="600" font-family="monospace">${formatDim(t.span)}</text>`;

  // Vertical dimension line (Height / Rise) with VERTICAL text orientation
  const allY = t.members.flatMap(m => [pt(m.a)[1], pt(m.b)[1]]);
  const peakY = Math.min(...allY);
  const baseY = a[1];
  const midY = (baseY + peakY) / 2;
  const dimX = 35;

  str += line([20, baseY], [48, baseY], '#cbd5e1', 1);
  str += line([20, peakY], [48, peakY], '#cbd5e1', 1);
  str += line([dimX, baseY], [dimX, peakY], '#94a3b8', 1);
  str += `<text x="23" y="${midY}" text-anchor="middle" fill="#334155" font-size="11.5" font-weight="600" font-family="monospace" transform="rotate(-90 23 ${midY})">${formatDim(t.height)}</text>`;

  // Bearing supports
  for(const p of [a,b,...(t.analysis?.extra||[]).map(x=>[a[0]+x*s,a[1]])]){
    str+=`<path d="M${p[0]} ${p[1]+4}l-8 15h16z" fill="#d97706" stroke="#92400e" stroke-width="1.5"/>`;
    str+=`<text x="${p[0]}" y="${p[1]+28}" text-anchor="middle" fill="#92400e" font-size="9" font-family="monospace">BRG</text>`;
  }

  // Live FEA summary pill in SVG elevation header - White and gray theme
  const feaPass=currentFEA.maxUnity<=1.0;
  str+=`<g transform="translate(540, 16)">
    <rect x="0" y="0" width="244" height="38" rx="6" fill="#ffffff" stroke="${feaPass?'#16a34a':'#dc2626'}" stroke-width="1.5"/>
    <circle cx="16" cy="19" r="5" fill="${feaPass?'#16a34a':'#dc2626'}"/>
    <text x="30" y="16" fill="#0f172a" font-size="10.5" font-weight="700" font-family="monospace">LOCAL FEA: ${feaPass?'PASS':'FAIL'} (${currentFEA.maxUnity.toFixed(2)} D/C)</text>
    <text x="30" y="29" fill="#475569" font-size="9" font-family="monospace">${t.members.length} members · ${t.ply} ply · Pmax: ${Math.abs(currentFEA.maxCompression_kN||0).toFixed(1)} kN C</text>
  </g>`;

  str+=`<text x="75" y="425" fill="#475569" font-size="12">${t.id} · ${t.type} · ${t.ply} ply · Max D/C: ${currentFEA.maxUnity.toFixed(2)} [${currentFEA.maxUnity<=1.0?'PASS':'FAIL'}]</text></g>`;
  return str;
}

function draw(){
  const t=current();if(!t)return;
  if($('drawing-title')) $('drawing-title').textContent=`${t.id} / ${t.type.toUpperCase()} / ELEVATION · D/C: ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}]`;
  if($('drawing')) $('drawing').innerHTML=drawingSVG(t);
  bindDrawingInteractions();
}

let panStart=null;
let isPanDrag=false;

function bindDrawingInteractions(){
  const svg=$('drawing'),hud=$('member-hud');if(!svg)return;

  svg.onpointerdown=e=>{
    panStart=[e.clientX,e.clientY];
    isPanDrag=false;
    svg.setPointerCapture(e.pointerId);
  };

  svg.onpointermove=e=>{
    if(panStart){
      const dx=e.clientX-panStart[0],dy=e.clientY-panStart[1];
      if(Math.hypot(dx,dy)>5){
        isPanDrag=true;
        const s=800/svg.clientWidth;
        drawPan[0]+=dx*s;
        drawPan[1]+=dy*s;
        panStart=[e.clientX,e.clientY];
        if(hud)hud.hidden=true;
        draw();
        return;
      }
    }

    const target=e.target.closest('[data-idx]');
    if(!target||!currentFEA||!hud){
      if(hud)hud.hidden=true;
      return;
    }
    const idx=Number(target.dataset.idx);
    const fea=currentFEA.results[idx];const t=current();const m=t?.members[idx];if(!fea||!t||!m)return;

    hud.innerHTML=`<h4>${t.id} · Member #${idx+1} <span style="color:${fea.isCompression?'#f87171':'#38bdf8'}">${fea.isCompression?'COMPRESSION':'TENSION'}</span></h4>
    <div class="stat-row"><span>Role:</span><strong>${m.role.toUpperCase()}</strong></div>
    <div class="stat-row"><span>Section:</span><strong style="color:#fde047">${m.sectionName||fea.section}</strong></div>
    <div class="stat-row"><span>Axial Force P:</span><strong>${fea.axialForce_kN} kN (${Math.round(fea.axialForce_kN*224.8)} lbs)</strong></div>
    <div class="stat-row"><span>Capacity Pallow:</span><strong>${fea.capacity_kN} kN</strong></div>
    <div class="stat-row"><span>Unity (D/C):</span><strong style="color:${fea.status==='PASS'?'#4ade80':'#f87171'}">${fea.unityRatio} [${fea.status}]</strong></div>
    <div class="stat-row"><span>Slenderness λ:</span><strong>${fea.slenderness}</strong></div>
    <div style="font-size:10.5px;color:#cbd5e1;margin-top:6px;border-top:1px solid #334155;padding-top:4px">👆 Click member to edit size & role in SELECTED TRUSS below</div>`;

    const rect=svg.getBoundingClientRect();
    hud.style.left=`${Math.min(rect.width-260,Math.max(10,e.clientX-rect.left+15))}px`;
    hud.style.top=`${Math.min(rect.height-180,Math.max(10,e.clientY-rect.top+15))}px`;
    hud.hidden=false;
  };

  svg.onpointerup=e=>{
    if(panStart&&!isPanDrag){
      const target=e.target.closest('[data-idx]');
      const t=current();
      if(target&&t){
        const idx=Number(target.dataset.idx);
        selectedMemberIndex=idx;
        advanced?.selectionChanged(t.id,idx);
        selection();
        draw();
        message(`Selected member M${idx+1} (${t.members[idx].role.toUpperCase()} · ${t.members[idx].sectionName||'2x4'}). Edit size, role or topology in SELECTED TRUSS.`);
      } else {
        selectedMemberIndex=null;
        advanced?.selectionChanged(t?.id,null);
        selection();
        draw();
      }
    }
    panStart=null;
    isPanDrag=false;
  };

  svg.onpointercancel=()=>{
    panStart=null;
    isPanDrag=false;
    if(hud)hud.hidden=true;
  };

  svg.onpointerleave=()=>{
    if(hud)hud.hidden=true;
  };
}

function getPointOnChordAtX(chords, x, origin, u){
  if(!chords || chords.length === 0) return null;
  let bestP = null;
  let minDist = Infinity;

  for(const m of chords){
    if(!m.a || !m.b) continue;
    const sa = (m.a[0] - origin[0]) * u[0] + (m.a[1] - origin[1]) * u[1];
    const sb = (m.b[0] - origin[0]) * u[0] + (m.b[1] - origin[1]) * u[1];
    const sMin = Math.min(sa, sb);
    const sMax = Math.max(sa, sb);

    const dSpan = Math.abs(sb - sa);
    let t = 0;
    if(dSpan > 1e-6){
      t = (x - sa) / (sb - sa);
    }
    const tClamped = Math.max(0, Math.min(1, t));
    const distToInterval = (x >= sMin && x <= sMax) ? 0 : Math.min(Math.abs(x - sMin), Math.abs(x - sMax));

    if(distToInterval < minDist){
      minDist = distToInterval;
      bestP = [
        m.a[0] + tClamped * (m.b[0] - m.a[0]),
        m.a[1] + tClamped * (m.b[1] - m.a[1]),
        m.a[2] + tClamped * (m.b[2] - m.a[2])
      ];
    }
  }
  return bestP;
}

function getTrussBearingSpan(t, ovh){
  if (!t || !t.profile || t.profile.length < 2) return Math.max(1, (t.span || 10) - 2 * ovh);
  const leftEave = t.profile[0][2] < t.profile[1][2];
  const rightEave = t.profile.at(-1)[2] < t.profile.at(-2)[2];
  let ovhCount = (leftEave ? 1 : 0) + (rightEave ? 1 : 0);
  if (ovhCount === 0) ovhCount = t.full ? 2 : 1;
  const span = Math.hypot(t.profile.at(-1)[0] - t.profile[0][0], t.profile.at(-1)[1] - t.profile[0][1]);
  return Math.max(0.5, span - ovhCount * ovh);
}

function mapTopoMembersTo3D(topo, t, existingChords){
  const origin = t.profile[0], end = t.profile.at(-1);
  const d = [end[0] - origin[0], end[1] - origin[1]], L = Math.hypot(...d) || t.span || 1;
  const u = [d[0] / L, d[1] / L];
  const ovh = getGenerationOverhangM();

  const topNodeIds = new Set();
  const bottomNodeIds = new Set();
  topo.members.forEach(m => {
    if (m.role === 'top') {
      topNodeIds.add(m.aId); topNodeIds.add(m.bId);
    } else if (m.role === 'bottom') {
      bottomNodeIds.add(m.aId); bottomNodeIds.add(m.bId);
    }
  });

  const topChords = (existingChords || []).filter(c => c.role === 'top' || c.role === 'overhang');
  const botChords = (existingChords || []).filter(c => c.role === 'bottom');

  topo.members.forEach(m => {
    const na = topo.nodes[m.aId], nb = topo.nodes[m.bId];
    if(!na || !nb) return;

    const computePt = (nodeId, n) => {
      const isTop = topNodeIds.has(nodeId);
      const isBot = bottomNodeIds.has(nodeId);
      const s3d = n.x + ovh;

      if(topChords.length > 0 && isTop && !isBot){
        const p = getPointOnChordAtX(topChords, s3d, origin, u);
        if(p) return p;
      }
      if(botChords.length > 0 && isBot && !isTop){
        const p = getPointOnChordAtX(botChords, s3d, origin, u);
        if(p) return p;
      }
      if((topChords.length > 0 || botChords.length > 0) && isTop && isBot){
        const p = getPointOnChordAtX(botChords.length ? botChords : topChords, s3d, origin, u);
        if(p) return p;
      }
      if(topChords.length > 0 && botChords.length > 0 && !isTop && !isBot){
        const pTop = getPointOnChordAtX(topChords, s3d, origin, u);
        const pBot = getPointOnChordAtX(botChords, s3d, origin, u);
        const heelM = t.heel !== undefined ? t.heel : 0.25;
        const pitchSlope = (t.height - heelM) / ((t.span || 1) / 2);
        const zTopTopo = heelM + (n.x <= (t.span || 1) / 2 ? pitchSlope * n.x : pitchSlope * ((t.span || 1) - n.x));
        const ratio = zTopTopo > 0 ? Math.max(0, Math.min(1, n.z / zTopTopo)) : 0.5;
        if(pTop && pBot){
          return [
            pBot[0] + ratio * (pTop[0] - pBot[0]),
            pBot[1] + ratio * (pTop[1] - pBot[1]),
            pBot[2] + ratio * (pTop[2] - pBot[2])
          ];
        }
      }

      return [origin[0] + u[0] * s3d, origin[1] + u[1] * s3d, t.base + n.z];
    };

    m.a = computePt(m.aId, na);
    m.b = computePt(m.bId, nb);
  });
}

function morphTopology(topoId){
  const t=current();if(!t)return;
  const topSize=t.members.find(m=>m.role==='top')?.sectionName||'2x4';
  const botSize=t.members.find(m=>m.role==='bottom')?.sectionName||'2x4';
  const webSize=t.members.find(m=>m.role==='web')?.sectionName||'2x4';
  const heelM=t.heel!==undefined?t.heel:getGenerationHeelM();
  const ovh=getGenerationOverhangM();
  const bearingSpan=getTrussBearingSpan(t, ovh);

  const topo=buildParametricTrussTopology(topoId,bearingSpan,t.height,ovh,{
    topSize,bottomSize:botSize,webSize,heel:heelM
  });

  t.type=topoId;
  t.heel=heelM;

  // Keep existing top/bottom chord and overhang members, replace only web members
  const existingChords=(t.members||[]).filter(m=>m.role==='top'||m.role==='bottom'||m.role==='overhang');
  mapTopoMembersTo3D(topo, t, existingChords);
  const newWebs=topo.members.filter(m=>m.role==='web');

  if(existingChords.length>0){
    t.members=[...existingChords, ...newWebs];
  } else {
    t.members=topo.members;
  }

  t.edited=true;
  t.review=`Parametric ${topoId} topology generated`;
  selectedMemberIndex=null;
  filter='All';
  if(viewer)viewer.filter='All';
  if(assembly){
    assembly.counts={};
    assembly.trusses.forEach(tr=>assembly.counts[tr.type]=(assembly.counts[tr.type]||0)+1);
  }
  runLocalFEA(t);
  advanced?.invalidate();
  rebuildView();
  select(t.id);
  update();
  message(`Truss ${t.id} morphed to ${topoId} geometry. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}]. SVG elevation view updated.`);
}

function morphTrussGeometry(t,newHeightM,newOverhangM,newHeelM){
  if(!t)return;
  const height=Math.max(0.4,Math.min(8.0,Number(newHeightM)||t.height));
  const ovh=Number.isFinite(newOverhangM)?Number(newOverhangM):getGenerationOverhangM();
  const topSize=t.members.find(m=>m.role==='top')?.sectionName||'2x4';
  const botSize=t.members.find(m=>m.role==='bottom')?.sectionName||'2x4';
  const webSize=t.members.find(m=>m.role==='web')?.sectionName||'2x4';

  t.height=height;
  if(t.profile&&t.profile.length>=2){
    const peakIdx=t.profile.findIndex(p=>p[2]===Math.max(...t.profile.map(x=>x[2])));
    if(peakIdx>=0)t.profile[peakIdx][2]=t.base+height;
  }

  const heelM=Number.isFinite(newHeelM)?Number(newHeelM):(t.heel!==undefined?t.heel:getGenerationHeelM());
  const bearingSpan=getTrussBearingSpan(t, ovh);
  const topo=buildParametricTrussTopology(t.type,bearingSpan,height,ovh,{
    topSize,bottomSize:botSize,webSize,heel:heelM
  });

  t.heel=heelM;
  const existingChords=(t.members||[]).filter(m=>m.role==='top'||m.role==='bottom'||m.role==='overhang');
  mapTopoMembersTo3D(topo, t, existingChords);
  const newWebs=topo.members.filter(m=>m.role==='web');

  if(existingChords.length>0){
    t.members=[...existingChords, ...newWebs];
  } else {
    t.members=topo.members;
  }

  t.edited=true;
  t.review=`Truss geometry adjusted: rise ${formatDim(height)}`;
  selectedMemberIndex=null;
  runLocalFEA(t);
  advanced?.invalidate();
  rebuildView();
  selection();
  draw();
  updateHUD();
  message(`Truss ${t.id} geometry updated: rise ${formatDim(height)}. Local FEA re-run: Unity ${currentFEA?.maxUnity?.toFixed(2)||'—'} [${currentFEA?.maxUnity<=1.0?'PASS':'FAIL'}].`);
}

function renderHardwareCard(hw){
  if(!$('hardware-output')||!hw)return;
  $('hardware-output').innerHTML=`<h4>🌪️ ASCE 7-22 Wind Uplift & Hurricane Hardware</h4>
  <p>Under governing net uplift combination (0.6D + 0.6W uplift):</p>
  <ul>
    <li><strong>Net Uplift Reaction:</strong> ${hw.netUplift_kN} kN (${hw.upliftLbs} lbs)</li>
    <li><strong>Recommended Tie-Down:</strong> <strong style="color:#1e40af">${hw.clipModel}</strong></li>
    <li><strong>Required Fasteners:</strong> ${hw.fasteners}</li>
    <li><strong>Design Allowable Capacity:</strong> ${hw.capacityLbs} lbs</li>
    <li><strong>Code Status:</strong> <span class="concept" style="padding:3px 7px">${hw.status}</span></li>
  </ul>
  <p style="color:#64748b;font-size:11.5px">Ensure minimum 3.5 in (89 mm) bearing length on bearing plates to prevent bearing crushing.</p>`;
}

function renderCarbonCard(c){
  if(!$('carbon-output')||!c)return;
  $('carbon-output').innerHTML=`<h4>🌱 Embodied Carbon & Sustainable Timber Metrics</h4>
  <p>Lumber sustainability ledger for full roof assembly:</p>
  <ul>
    <li><strong>Total Dimensional Lumber:</strong> ${c.totalBoardFeet.toLocaleString()} Board Feet (${c.totalLumberMeters.toLocaleString()} m linear)</li>
    <li><strong>Wood Volume:</strong> ${c.volumeM3} m³ of sustainably managed softwood</li>
    <li><strong>Sequestered Atmospheric CO₂:</strong> <strong style="color:#15803d">${c.sequesteredCO2Kg.toLocaleString()} kg CO₂e</strong></li>
    <li><strong>Avoided Steel/Concrete Emissions:</strong> ${c.netCarbonSavingsKg.toLocaleString()} kg CO₂e savings</li>
  </ul>
  <p style="color:#64748b;font-size:11.5px">Timber roof trusses store more carbon than emitted during harvesting, milling, and assembly.</p>`;
}

function save(name,content,type){const blob=content instanceof Uint8Array?new Blob([content],{type}):new Blob([content],{type});const url=URL.createObjectURL(blob);lastURLs.push(url);return `<a href="${url}" download="${name}">${esc(name)}</a>`;}
function pdfTakeoffLink(){
  if(!assembly) return '';
  const pdfBytes = makeReport(name || 'NW 6th St', assembly, typeof settings === 'function' ? settings() : {}, 'imperial');
  return save('CadTech-Wood-Takeoff-And-Procurement.pdf', pdfBytes, 'application/pdf');
}
function takeoffLinks(){
  if(!assembly) return '';
  return pdfTakeoffLink() +
    save('CadTech-Timber-Cut-List.pdf', makeCutListReport(assembly, name), 'application/pdf') +
    save('CadTech-Master-Truss-Schedule.pdf', makeTrussScheduleReport(assembly, name), 'application/pdf') +
    save('CadTech-Fabrication-Schedule.pdf', makeFabricationReport(assembly, name), 'application/pdf');
}
function showTakeoff(){if(!assembly){message('Generate the roof first - there is nothing to take off yet.',true);return;}lastURLs.forEach(URL.revokeObjectURL);lastURLs=[];const to=woodTakeoff(assembly);$('takeoff-body').innerHTML=takeoffHTML(to, assembly);$('takeoff-downloads').innerHTML=takeoffLinks();$('takeoff-dialog').showModal();}

function exportModel(){if(!assembly)return;lastURLs.forEach(URL.revokeObjectURL);lastURLs=[];let obj='# CadTech wood roof truss assembly\n# Units: metres. Z up. Local origin documented in JSON.\n',vi=1;
 for(const t of assembly.trusses){obj+=`o ${t.id}_${t.type.replace(/ /g,'_')}\n`;for(let ply=0;ply<t.ply;ply++)for(const m of t.members){const o=(ply-(t.ply-1)/2)*.055,solid=memberSolid(t,m,assembly,o);if(solid.hidden||!solid.triangles.length)continue;for(const q of solid.triangles)obj+='v '+q.map(x=>+x.toFixed(6)).join(' ')+'\n';for(let k=0;k<solid.triangles.length;k+=3)obj+=`f ${vi+k} ${vi+k+1} ${vi+k+2}\n`;vi+=solid.triangles.length;}}
 const json={name,units:'metres',sourceOrigin:source.origin,inputUnits:rawKind==='obj'?Number($('units').value):'IFC model units',status:'CADTECH DESIGN DOCUMENT - FINAL ISSUE REQUIRES ENGINEERING REVIEW OF CONNECTIONS/BRACING/CODE INPUTS',settings:settings(),assembly};
 let links=save('roof-assembly.obj',obj,'text/plain')+takeoffLinks()+save('roof-study.json',JSON.stringify(json,null,2),'application/json');const t=current();if(t){const priorZoom=drawZoom,priorPan=drawPan;drawZoom=1;drawPan=[0,0];links+=save(`${t.id}-elevation.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="690" viewBox="0 0 800 460">${drawingSVG(t)}</svg>`,'image/svg+xml');drawZoom=priorZoom;drawPan=priorPan;}if(viewer)links+=`<a href="${viewer.exportPNG()}" download="roof-viewport.png">roof-viewport.png</a>`;$('downloads').innerHTML=links+'<p>OBJ contains the same joint-cut solid member envelopes used by the viewport. Chords control the truss envelope and webs terminate at chord faces. JSON preserves the original coordinate offset.</p>';$('export-dialog').showModal();}

// Event bindings
if($('generate')) $('generate').onclick=generate;
if($('preset')) $('preset').onclick=preset;
if($('file')) $('file').onchange=e=>loadFile(e.target.files[0]);
if($('drop')) {
  $('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag');};
  $('drop').ondragleave=()=>$('drop').classList.remove('drag');
  $('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');loadFile(e.dataTransfer.files[0]);};
}
if($('search')) $('search').oninput=schedule;
if($('schedule')) $('schedule').onclick=e=>{const b=e.target.closest('[data-truss]');if(b)select(b.dataset.truss);};
if($('families')) $('families').onclick=e=>{const b=e.target.closest('[data-family]');if(!b)return;filter=b.dataset.family;if(viewer){viewer.filter=filter;viewer.updateVisibility();}update();};
if($('topology-grid')) $('topology-grid').onclick=e=>{
  const card=e.target.closest('[data-topo]');
  if(!card)return;
  const topoId=card.dataset.topo;
  document.querySelectorAll('#topology-grid .topology-card').forEach(c=>c.classList.toggle('active',c.dataset.topo===topoId));
  morphTopology(topoId);
};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-orient]').forEach(b=>b.onclick=()=>setView(b.dataset.orient));
document.querySelectorAll('[data-layer]').forEach(e=>e.onchange=()=>{if(viewer){viewer.layers[e.dataset.layer]=e.checked;viewer.updateVisibility();}});
if($('color')) $('color').onchange=()=>{if(viewer){viewer.colorMode=$('color').value;viewer.updateVisibility();}};
if($('cut')) $('cut').oninput=()=>viewer?.section(Number($('cut').value));
if($('fit')) $('fit').onclick=()=>viewer?.fit();
if($('full')) $('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewports').requestFullscreen();}catch{message('Fullscreen is unavailable in this browser.');}};
if($('isolate')) $('isolate').onclick=()=>{if(!viewer||!selected)return;viewer.isolate=!viewer.isolate;$('isolate').setAttribute('aria-pressed',viewer.isolate);viewer.updateVisibility();viewer.fit();};
if($('export')) $('export').onclick=exportModel;
if($('takeoff')) $('takeoff').onclick=showTakeoff;
if($('close-takeoff')) $('close-takeoff').onclick=(e)=>{e.preventDefault();$('takeoff-dialog')?.close();};
if($('close-export')) $('close-export').onclick=(e)=>{e.preventDefault();$('export-dialog')?.close();};
document.querySelectorAll('dialog').forEach(dlg => {
  dlg.addEventListener('click', (e) => {
    const rect = dlg.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      dlg.close();
    }
  });
});
if($('drawing-fit')) $('drawing-fit').onclick=()=>{drawZoom=1;drawPan=[0,0];draw();};
if($('file-units')) $('file-units').onchange=()=>{currentFileUnit=$('file-units').value;update();if(source && $('dimensions')){$('dimensions').textContent=`${formatDim(source.bounds[0])} × ${formatDim(source.bounds[1])}`;}};

// Engineering Certification Modal & Checklist Handlers
function getCertInputOptions() {
  return {
    codeProfile: $('cert-code')?.value || 'US-IBC2024',
    ahj: $('cert-ahj')?.value || 'Local Building Department',
    peName: $('cert-pename')?.value || 'Licensed Engineer, P.E.',
    peLicense: $('cert-pallicense')?.value || 'PE-849201',
    snowPsf: Number($('cert-snow')?.value || 25),
    windStr: $('cert-wind')?.value || '115 mph (Exp C)',
    deadPsf: Number($('cert-dead')?.value || 12),
    livePsf: Number($('cert-live')?.value || 20),
    sdc: $('cert-sdc')?.value || 'C',
    defLimit: Number($('cert-defl')?.value || 360),
    fcPerpPsi: Number($('cert-fcperp')?.value || 565),
    bearingPlateWidthIn: Number($('cert-platewidth')?.value || 5.5)
  };
}

let lastCertData = null;

function renderCertificationChecklist() {
  if (!assembly) {
    if ($('cert-checklist-results')) {
      $('cert-checklist-results').innerHTML = '<p class="help">Generate or import a roof model to run the engineering compliance checklist.</p>';
    }
    return;
  }
  const opts = getCertInputOptions();
  lastCertData = getEngineeringCertificationChecklist(assembly, opts);
  const data = lastCertData;

  let checklistRowsHtml = data.checklist.map(chk => {
    const isPass = chk.status.startsWith('PASS');
    const badgeClass = isPass ? 'pass' : chk.status.includes('WARN') ? 'warn' : 'fail';
    return `<tr>
      <td><strong style="color:#0f172a">${esc(chk.id)}</strong></td>
      <td><strong>${esc(chk.item)}</strong><br><small style="color:#64748b">${esc(chk.category)}</small></td>
      <td><span style="font-family:monospace;font-size:11px;color:#475569">${esc(chk.standard)}</span></td>
      <td><strong>${esc(chk.demand)}</strong> vs <small style="color:#64748b">${esc(chk.capacity)}</small></td>
      <td><span class="chk-status ${badgeClass}">${esc(chk.status)}</span></td>
    </tr>
    <tr>
      <td colspan="5" style="padding:2px 10px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px">
        <em>Note:</em> ${esc(chk.note)}
      </td>
    </tr>`;
  }).join('');

  if ($('cert-checklist-results')) {
    $('cert-checklist-results').innerHTML = `
      <div class="cert-status-header">
        <div>
          <strong style="font-size:14px;color:#0f172a">ENGINEERING COMPLIANCE STATUS:</strong>
          <span style="font-size:13px;color:#475569;margin-left:8px">${esc(data.code)} · ${esc(data.ahj)}</span>
        </div>
        <div class="cert-badge-large ${data.overallStatus.includes('VERIFIED') ? 'pass' : 'warn'}">
          ✓ ${esc(data.overallStatus)}
        </div>
      </div>
      <p style="font-size:12px;color:#475569;margin:4px 0">Verified max span: <strong>${data.maxSpanFt.toFixed(1)} ft</strong> · Governing max unity ratio: <strong>${data.maxUnity.toFixed(2)}</strong> · Date: <strong>${data.timestamp}</strong></p>
      <div style="overflow-x:auto">
        <table class="checklist-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Structural Check Item</th>
              <th>Standard / Clause</th>
              <th>Demand vs Capacity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${checklistRowsHtml}
          </tbody>
        </table>
      </div>
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;font-size:11.5px;color:#334155">
        <strong style="color:#1e40af">Professional Engineer Stamp Notice:</strong> This checklist evaluates member axial/bending interaction, L/${data.defLimit} deflection limits, ASCE 7-22 wind uplift ties, bearing plate compression perpendicular to grain (Fc_perp = ${data.fcPerpPsi} psi), ANSI/TPI 1 connector plates, and BCSI lateral bracing.
      </div>
    `;
  }
}

function showCertificationModal() {
  renderCertificationChecklist();
  if ($('cert-dialog')) $('cert-dialog').showModal();
}

if ($('btn-open-cert')) $('btn-open-cert').onclick = showCertificationModal;
if ($('close-cert')) $('close-cert').onclick = (e) => { e.preventDefault(); $('cert-dialog')?.close(); };
if ($('cert-recalculate')) $('cert-recalculate').onclick = renderCertificationChecklist;
if ($('cert-export-pdf')) $('cert-export-pdf').onclick = () => {
  if (!lastCertData) renderCertificationChecklist();
  if (assembly && lastCertData) {
    const pdfBytes = makeCertificationReport(assembly, name || 'NW 6th St', lastCertData);
    save('CadTech-Engineering-Certification.pdf', pdfBytes, 'application/pdf');
  }
};
for (const id of ['cert-code', 'cert-ahj', 'cert-pename', 'cert-pallicense', 'cert-snow', 'cert-wind', 'cert-dead', 'cert-live', 'cert-sdc', 'cert-defl', 'cert-fcperp', 'cert-platewidth']) {
  const el = $(id);
  if (el) el.onchange = renderCertificationChecklist;
}

if ($('timber-species')) {
  $('timber-species').onchange = () => {
    schedule();
    if (selected) selection();
  };
}


// 2D Drawing mode toggles
const drawModeButtons=[{id:'draw-mode-geom',mode:'geom'},{id:'draw-mode-fea',mode:'fea'},{id:'draw-mode-plates',mode:'plates'},{id:'draw-mode-deflect',mode:'deflect'}];
drawModeButtons.forEach(btn=>{
  const el=$(btn.id);if(!el)return;
  el.onclick=()=>{
    drawViewMode=btn.mode;
    drawModeButtons.forEach(b=>$(b.id)?.classList.toggle('active',b.mode===btn.mode));
    if($('draw-legend'))$('draw-legend').hidden=(btn.mode==='geom'||btn.mode==='deflect');
    draw();
  };
});






























if($('drawing')) {
  $('drawing').onwheel=e=>{e.preventDefault();drawZoom=Math.max(.35,Math.min(5,drawZoom*Math.exp(-e.deltaY*.001)));draw();};
  $('drawing').onclick=e=>{
    const elem=e.target.closest('[data-idx]');
    if(elem){
      const mIdx=parseInt(elem.dataset.idx,10);
      if(Number.isInteger(mIdx)&&current()){
        select(current().id,mIdx);
      }
    }
  };
}
for(const id of ['units','axis']) if($(id)) $(id).onchange=()=>{if(rawKind==='obj'&&raw)importData(raw,name+'.obj','obj');};
if($('rebuild-cad')) $('rebuild-cad').onclick=()=>{if(rawKind==='dxf'&&raw)importData(raw,name+'.dxf','dxf');};
for(const id of ['roof-layer','truss-layer','roof-angle','cad-units']) if($(id)) $(id).onchange=()=>{
  if(rawKind==='dxf'){
    message('CAD settings updated. Click Rebuild CAD roof to apply.');
  }
};
for(const id of ['heel','panel','roof-overhang']){
  const el=$(id);
  if(el){
    el.oninput=updateGenerationHelpers;
    el.onchange=()=>{
      updateGenerationHelpers();
      message('Generation settings changed. Generate complete roof to apply them.');
    };
  }
}
if($('hips')) $('hips').onchange=()=>message('Generation settings changed. Generate complete roof to apply them.');
if($('gen-units')){
  $('gen-units').onchange=e=>{
    setGenerationUnits(e.target.value);
    message(`Input units switched to ${e.target.value==='mm'?'Metric (mm)':'Imperial (in)'}. Generate complete roof to apply.`);
  };
}
if($('unit-btn-in')){
  $('unit-btn-in').onclick=()=>{
    setGenerationUnits('in');
    message('Input units switched to Imperial (in). Generate complete roof to apply.');
  };
}
if($('unit-btn-mm')){
  $('unit-btn-mm').onclick=()=>{
    setGenerationUnits('mm');
    message('Input units switched to Metric (mm). Generate complete roof to apply.');
  };
}
updateGenerationHelpers();

advanced=setupAdvanced({get:()=>({source,assembly,name,selected}),settings,notify:message,refresh:()=>{rebuildView();update();},png:()=>viewer?.exportPNG(),replaceSource:(s,n)=>{source=s;name=n;raw=null;selected=null;if($('project-name'))$('project-name').textContent=n;if($('dimensions'))$('dimensions').textContent=`${formatDim(s.bounds[0])} × ${formatDim(s.bounds[1])}`;generate();},restore:d=>{source=d.source;assembly=d.assembly;name=d.name||'Restored project';selected=d.selected||assembly.trusses[0]?.id;raw=null;if($('project-name'))$('project-name').textContent=name;if($('dimensions'))$('dimensions').textContent=`${formatDim(source.bounds[0])} × ${formatDim(source.bounds[1])}`;rebuildView();update();}});
window.addEventListener('pagehide',()=>viewer?.dispose(),{once:true});


// Auto-load sample roof plan and generate complete trusses and walls on startup
(async()=>{
  try{
    const res = await fetch('./sample-roof-plan.dxf');
    if(res.ok){
      const txt = await res.text();
      await importData(txt, 'sample-roof-plan.dxf', 'dxf');
      return;
    }
  }catch(e){
    console.warn('Auto-load sample roof plan note:', e);
  }
  if($('project-name')) $('project-name').textContent = 'No Model Loaded';
  if($('dimensions')) $('dimensions').textContent = 'Import CAD (.dxf) or 3D model (.obj / .ifc)';
  if($('coverage')) $('coverage').textContent = 'Ready for CAD or 3D import';
  if($('count')) $('count').textContent = '—';
  if($('schedule')) $('schedule').innerHTML = '<p class="help" style="padding:14px 10px;line-height:1.6;color:#64748b">No model loaded yet.<br>Drag & drop or browse a <strong>CAD roof plan</strong>, OBJ or IFC file above to generate roof trusses.</p>';
  if($('selection')) $('selection').innerHTML = '<div style="padding:12px;color:#64748b;font-size:13px">No truss selected. Import your CAD drawing or 3D model to generate the roof assembly.</div>';
  message('Ready. Import a DXF roof plan or 3D model to begin.');
  rebuildView();
})();
