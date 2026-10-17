// CadTech wood take-off (V9.9.4): cut list of every timber in the roof, merged into real boards, with stock-length ordering and
// nominal board feet.  Pure functions (no DOM) so they can be tested in Node.
import {memberRunLength} from './connection-geometry.js';
export const FT=0.3048,IN=0.0254;
export const STOCK_FT=[8,10,12,14,16,18,20,24];   // standard dimensional-lumber stock lengths
const KERF_FT=0.125/12;                           // 1/8 in saw kerf between cuts on the same board
const D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function nominalSize(name){const m=/(\d+)\s*x\s*(\d+)/i.exec(String(name||''));return m?[Number(m[1]),Number(m[2])]:[2,4];}
export function ftIn(m){                          // feet-inches to the nearest 1/16 in
  if(!Number.isFinite(m))return '--';let sixteenths=Math.round(m/IN*16);const ft=Math.floor(sixteenths/(16*12));sixteenths-=ft*16*12;
  const inch=Math.floor(sixteenths/16);let num=sixteenths%16,den=16;while(num&&num%2===0){num/=2;den/=2;}
  return `${ft}'-${inch}${num?` ${num}/${den}`:''}"`;
}
export function stockFor(lengthFt){for(const s of STOCK_FT)if(lengthFt<=s+1e-6)return s;return null;}
const roleGroup=m=>m.role==='overhang'?'top':m.role;
function sectionOf(t,m,i){return m.sectionName||t.analysis?.members?.find(x=>x.index===i)?.size||'2x4';}

// ---- chord runs: collinear segments that share nodes and a section are ONE continuous board; every web is its own board ----
export function boardRuns(t){
  const ms=t.members||[];
  const parent=ms.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const dirOf=m=>{const L=D(m.a,m.b)||1;return m.b.map((v,k)=>(v-m.a[k])/L);};
  const share=(a,b)=>[a.a,a.b].some(p=>[b.a,b.b].some(q=>D(p,q)<.003));
  for(let i=0;i<ms.length;i++)for(let j=i+1;j<ms.length;j++){
    const a=ms[i],b=ms[j],g=roleGroup(a);
    if(g==='web'||g!==roleGroup(b)||!share(a,b))continue;
    if(sectionOf(t,a,i)!==sectionOf(t,b,j))continue;
    const da=dirOf(a),db=dirOf(b);if(Math.abs(da[0]*db[0]+da[1]*db[1]+da[2]*db[2])<.99998)continue;   // a bend starts a new board
    parent[find(i)]=find(j);
  }
  const runs=new Map();ms.forEach((m,i)=>{if(!m?.a||!m?.b)return;const key=roleGroup(m)==='web'?'w'+i:'c'+find(i);if(!runs.has(key))runs.set(key,[]);runs.get(key).push(i);});
  return [...runs.values()].map(idx=>({idx,group:roleGroup(ms[idx[0]])}));
}
// ---- one truss -> boards ----
function trussBoards(t,assembly){
  const ms=t.members||[],ply=Math.max(1,Number(t.analysis?.ply||t.ply)||1);
  const counters={top:0,bottom:0,web:0},out=[];
  for(const {idx} of boardRuns(t)){
    const list=idx.map(i=>ms[i]),first=list[0],g=roleGroup(first),cut=memberRunLength(t,list,assembly);
    if(!(cut>.01))continue;                                   // fully trimmed away (hidden) - not a timber
    counters[g]=(counters[g]||0)+1;
    out.push({truss:t.id,type:t.type,mark:`${t.id}-${g==='top'?'TC':g==='bottom'?'BC':'W'}${counters[g]}`,role:g,section:sectionOf(t,first,idx[0]),
      plies:ply,qty:ply,cutM:cut,centerM:list.reduce((s,m)=>s+D(m.a,m.b),0),segments:list.length,
      overhang:list.some(m=>m.role==='overhang'),note:'',idx});
  }
  return out;
}

// ---- stock ordering: first-fit-decreasing into the standard stock lengths, per section ----
function packSection(pieces){            // pieces: lengths in ft (one entry per piece)
  const boards=[];let spliced=0;const list=[];
  for(const L0 of pieces){let L=L0;                                 // longer than the longest stock board: full 24 ft board + remainder (splice)
    if(L>STOCK_FT.at(-1)+1e-6){spliced++;while(L>STOCK_FT.at(-1)+1e-6){boards.push({stock:STOCK_FT.at(-1),left:0,used:STOCK_FT.at(-1)});L-=STOCK_FT.at(-1);}}
    if(L>.01)list.push(L);}
  for(const L of list.sort((a,b)=>b-a)){
    let best=null;for(const b of boards)if(b.left>=L+KERF_FT-1e-9&&(!best||b.left<best.left))best=b;
    if(best){best.left-=L+KERF_FT;best.used+=L;}
    else{const st=stockFor(L);boards.push({stock:st,left:st-L-KERF_FT,used:L});}
  }
  return {boards,spliced};
}

export function woodTakeoff(assembly){
  const rows=[];for(const t of assembly?.trusses||[])rows.push(...trussBoards(t,assembly));
  for(const r of rows){const ft=r.cutM/FT;r.cutFt=ft;r.stockFt=stockFor(ft);const [th,wd]=nominalSize(r.section);r.bf=th*wd/12*ft*r.qty;
    if(r.stockFt===null)r.note='over 24 ft - splice (24 ft board + remainder)';else if(r.segments>1&&r.role==='top'&&r.overhang)r.note='continuous rafter incl. overhang';}
  const bySection=new Map();
  for(const r of rows){if(!bySection.has(r.section))bySection.set(r.section,{section:r.section,pieces:0,cutFt:0,bf:0,list:[]});
    const s=bySection.get(r.section);s.pieces+=r.qty;s.cutFt+=r.cutFt*r.qty;s.bf+=r.bf;for(let k=0;k<r.qty;k++)s.list.push(r.cutFt);}
  const sections=[...bySection.values()].sort((a,b)=>nominalSize(a.section)[1]-nominalSize(b.section)[1]||a.section.localeCompare(b.section));
  for(const s of sections){
    const {boards,spliced}=packSection(s.list),[th,wd]=nominalSize(s.section);s.stock={};for(const st of STOCK_FT)s.stock[st]=0;
    for(const b of boards)s.stock[b.stock]++;
    s.splicePieces=spliced;
    const orderedFt=boards.reduce((n,b)=>n+b.stock,0);
    s.boards=boards.length;s.orderedFt=orderedFt;s.orderedBf=th*wd/12*orderedFt;s.yield=orderedFt?s.cutFt/orderedFt:0;
  }
  const byTruss=new Map();for(const r of rows){if(!byTruss.has(r.truss))byTruss.set(r.truss,{truss:r.truss,type:r.type,plies:r.plies,pieces:0,cutFt:0,bf:0});const t=byTruss.get(r.truss);t.pieces+=r.qty;t.cutFt+=r.cutFt*r.qty;t.bf+=r.bf;}
  const byRole=new Map();for(const r of rows){const k=r.role+'|'+r.section;if(!byRole.has(k))byRole.set(k,{role:r.role,section:r.section,pieces:0,cutFt:0,bf:0});const x=byRole.get(k);x.pieces+=r.qty;x.cutFt+=r.cutFt*r.qty;x.bf+=r.bf;}
  const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
  return {rows,sections,byTruss:[...byTruss.values()],byRole:[...byRole.values()],
    totals:{pieces:sum(sections,s=>s.pieces),cutFt:sum(sections,s=>s.cutFt),bf:sum(sections,s=>s.bf),boards:sum(sections,s=>s.boards),orderedFt:sum(sections,s=>s.orderedFt),orderedBf:sum(sections,s=>s.orderedBf),trusses:byTruss.size,
      analyzed:(assembly?.trusses||[]).filter(t=>t.analysis?.sections||t.analysis?.members?.length).length}};
}

// ---- CSV ----
const q=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const csv=(head,rows)=>[head,...rows].map(r=>r.map(q).join(',')).join('\r\n');
const f1=n=>Number(n).toFixed(1),f2=n=>Number(n).toFixed(2);
export function takeoffSummaryCSV(to){
  const head=['Section','Pieces','Cut_length_ft','Nominal_BF',...STOCK_FT.map(s=>`Boards_${s}ft`),'Spliced_pieces_over_24ft','Boards_to_order','Ordered_length_ft','Ordered_BF','Yield_percent'];
  const rows=to.sections.map(s=>[s.section,s.pieces,f1(s.cutFt),f1(s.bf),...STOCK_FT.map(x=>s.stock[x]),s.splicePieces,s.boards,f1(s.orderedFt),f1(s.orderedBf),f1(s.yield*100)]);
  const t=to.totals;rows.push(['TOTAL',t.pieces,f1(t.cutFt),f1(t.bf),...STOCK_FT.map(x=>to.sections.reduce((n,s)=>n+s.stock[x],0)),to.sections.reduce((n,s)=>n+s.splicePieces,0),t.boards,f1(t.orderedFt),f1(t.orderedBf),f1(t.orderedFt?t.cutFt/t.orderedFt*100:0)]);
  return csv(head,rows);
}
export function cutListCSV(to){
  return csv(['Truss','Type','Mark','Role','Section','Plies','Qty','Cut_length_ft_in','Cut_length_mm','Centerline_mm','Stock_ft','Nominal_BF','Note'],
    to.rows.map(r=>[r.truss,r.type,r.mark,r.role,r.section,r.plies,r.qty,ftIn(r.cutM),Math.round(r.cutM*1000),Math.round(r.centerM*1000),r.stockFt??'>24',f2(r.bf),r.note]));
}
export function takeoffByTrussCSV(to){
  return csv(['Truss','Type','Plies','Pieces','Cut_length_ft','Nominal_BF'],to.byTruss.map(t=>[t.truss,t.type,t.plies,t.pieces,f1(t.cutFt),f1(t.bf)]));
}
// ---- Hardware & Fasteners Takeoff ----
export function hardwareTakeoff(assembly) {
  let bearings = 0, upliftBearings = 0, maxUpliftKN = 0;
  let hangers = 0, maxTransferKN = 0;
  let bracedWebs = 0;

  for (const t of assembly?.trusses || []) {
    const a = t.analysis;
    const e = t.engineering;

    const reacts = a?.reactions || [];
    const ups = reacts.flatMap(c => (c.reactions || []).map(r => r.force || 0)).filter(f => f < 0).map(f => Math.abs(f));
    const downs = reacts.flatMap(c => (c.reactions || []).map(r => r.force || 0)).filter(f => f > 0);

    const countB = Math.max(2, downs.length ? downs.length : 2);
    bearings += countB;

    if (ups.length) {
      const maxUp = Math.max(...ups);
      if (maxUp > maxUpliftKN) maxUpliftKN = maxUp;
      upliftBearings += countB;
    }

    if (e?.transfersIn?.length) {
      hangers += e.transfersIn.length;
      for (const tr of e.transfersIn) {
        if (tr.designReaction_kN > maxTransferKN) maxTransferKN = tr.designReaction_kN;
      }
    }

    if (e?.checks?.bracing?.flagged?.length) {
      bracedWebs += e.checks.bracing.flagged.length;
    }
  }

  const items = [];

  const upliftLbs = Math.round(maxUpliftKN * 224.8);
  const tieModel = maxUpliftKN > 2.7 ? 'Simpson H10A / LTA2 or equiv (Heavy Hold-Down)' : 'Simpson H2.5A / H10A or equiv (Hurricane Tie)';
  items.push({
    category: 'Truss Tie-Downs / Hurricane Clips',
    spec: `${tieModel} (min ${maxUpliftKN ? maxUpliftKN.toFixed(1) : '1.8'} kN / ${upliftLbs || 400} lbs capacity)`,
    qty: `${upliftBearings || (assembly?.trusses?.length ? assembly.trusses.length * 2 : 0)} ea`,
    note: 'Fasten with (5) 8d common nails into truss & double top plate at each bearing'
  });

  const transferLbs = Math.round(maxTransferKN * 224.8);
  const hangerCount = hangers || (assembly?.trusses || []).filter(t => String(t.type).includes('JACK') || t.type === 'Stepdown').length;
  if (hangerCount > 0) {
    items.push({
      category: 'Girder Hangers / Framing Anchors',
      spec: `Simpson THO / HGUS / LUS Face-Mount Hangers (min ${maxTransferKN ? maxTransferKN.toFixed(1) : '3.5'} kN / ${transferLbs || 800} lbs capacity)`,
      qty: `${hangerCount} ea`,
      note: 'Size hanger to ply count; fasten with 10d / 16d nails per manufacturer load table'
    });
  }

  items.push({
    category: 'Continuous Lateral Bracing (CLB)',
    spec: '2x4 Continuous Lateral Bracing at compression web midpoints',
    qty: `${bracedWebs || 8} web location(s)`,
    note: 'Nail 2x4 CLB with (2) 16d nails per web intersection at <= 24 in o.c.'
  });

  items.push({
    category: 'Wall Top Bearing Plates',
    spec: '3.5 in (89 mm) min bearing length on double top plate',
    qty: `${bearings || (assembly?.trusses?.length ? assembly.trusses.length * 2 : 0)} bearing point(s)`,
    note: 'Ensure min 89 mm continuous bearing on DFL / SPF double top plate'
  });

  return items;
}

// ---- HTML for the on-screen panel ----
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function takeoffHTML(to, assembly = null){
  if(!to.rows.length)return '<p>No timber members yet - generate the roof first.</p>';
  const t=to.totals,td=(v,cls='')=>`<td${cls?` class="${cls}"`:''}>${esc(v)}</td>`;
  const stockCols=STOCK_FT.filter(s=>to.sections.some(x=>x.stock[s]));
  let h=`<p>${t.trusses} trusses &middot; ${t.pieces} timbers &middot; ${f1(t.cutFt)} lin ft cut &middot; <strong>${f1(t.bf)} nominal BF</strong> (${f1(t.orderedBf)} BF to order, ${t.boards} boards).</p>`;
  if(t.analyzed<t.trusses)h+=`<p class="warn">${t.trusses-t.analyzed} of ${t.trusses} trusses are not analyzed yet and use the template 2x4 size. Run <em>Analyze all</em> for final member sizes.</p>`;
  h+=`<table><thead><tr><th>Section</th><th>Pieces</th><th>Cut lin ft</th><th>Nominal BF</th>${stockCols.map(s=>`<th>${s}'</th>`).join('')}<th>Spliced &gt;24'</th><th>Yield</th></tr></thead><tbody>`;
  for(const s of to.sections)h+=`<tr>${td(s.section)}${td(s.pieces,'n')}${td(f1(s.cutFt),'n')}${td(f1(s.bf),'n')}${stockCols.map(x=>td(s.stock[x]||'','n')).join('')}${td(s.splicePieces||'','n')}${td(f1(s.yield*100)+'%','n')}</tr>`;
  h+=`<tr class="tot">${td('TOTAL')}${td(t.pieces,'n')}${td(f1(t.cutFt),'n')}${td(f1(t.bf),'n')}${stockCols.map(x=>td(to.sections.reduce((n,s)=>n+s.stock[x],0)||'','n')).join('')}${td(to.sections.reduce((n,s)=>n+s.splicePieces,0)||'','n')}${td(f1(t.orderedFt?t.cutFt/t.orderedFt*100:0)+'%','n')}</tr></tbody></table>`;
  h+='<p class="note">Stock columns = boards to order, cut from standard 8-24 ft lengths (first-fit-decreasing, 1/8 in kerf). Chords are merged into continuous boards (overhang included); lengths are long-point cut lengths. Board feet are nominal (e.g. 2x4 = 0.667 BF per ft). Add your own waste allowance.</p>';

  if (assembly) {
    const hw = hardwareTakeoff(assembly);
    h += `<div style="margin-top:20px;border-top:1px solid #364d5e;padding-top:16px"><h3 style="margin:0 0 10px;font-size:14px;color:#c9e696;display:flex;align-items:center;gap:8px">🔩 Hardware & Fasteners Procurement Schedule</h3>`;
    h += `<table><thead><tr><th>Hardware Item</th><th>Specification / Model</th><th>Qty / Demand</th><th>Procurement Note</th></tr></thead><tbody>`;
    for (const item of hw) {
      h += `<tr><td><strong>${esc(item.category)}</strong></td><td>${esc(item.spec)}</td><td class="n">${esc(item.qty)}</td><td style="font-size:11.5px;color:#a2b7c6">${esc(item.note)}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  }

  return h;
}
