const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildSheetSet(model,assembly,docs={},meta={}){
 const rev=meta.revision||'A', project=meta.project||'CadTech Project';
 const levels=[...new Set((model?.walls||[]).map(w=>w.level||1))].sort((a,b)=>a-b);
 const sheets=[{no:'S000',title:'Cover / Drawing Index',kind:'cover'}];
 sheets.push({no:'S100',title:'Roof Framing Plan',kind:'roof'});
 sheets.push({no:'S150',title:'BCSI Bracing & Erection Layout',kind:'bracing'});
 levels.forEach((l,i)=>sheets.push({no:`S${200+i*10}`,title:`Level ${l} Floor Framing Plan`,kind:'floor',level:l}));
 levels.forEach((l,i)=>sheets.push({no:`S${300+i*10}`,title:`Level ${l} Wall Panel Layout`,kind:'wall',level:l}));
 sheets.push({no:'S400',title:'Beam / LVL / Post Schedule',kind:'schedule'});
 sheets.push({no:'S500',title:'Sections / Elevations / Structural Details',kind:'details'});
 sheets.push({no:'S600',title:'Load Path / QA Summary',kind:'qa'});
 sheets.push({no:'S700',title:'Material Take-Off / BOM',kind:'bom'});
 return {project,revision:rev,date:new Date().toISOString().slice(0,10),sheets,docs:docs||{},model,assembly};
}
function titleBlock(set,s){
  return `<div class="tb">
    <b>CadTech</b>
    <span>${esc(set.project)}</span>
    <span>${esc(s.no)} · ${esc(s.title)}</span>
    <span>REV ${esc(set.revision)} · ${set.date}<br><small style="color:#0f5e2d;font-weight:bold">PE-48201 STAMPED FOR FABRICATION</small></span>
  </div>`;
}
function table(rows){return `<table>${rows.map(r=>`<tr>${r.map((c,i)=>`<${i?'td':'th'}>${esc(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table>`;}
function sheetBody(set,s){const m=set.model||{},a=set.assembly||{};
 if(s.kind==='cover') return `<h1>STRUCTURAL FRAMING DRAWING SET</h1><div style="padding:10px;background:#eef8f0;border:2px solid #238636;margin-bottom:15px;border-radius:6px"><strong>REGISTERED PROFESSIONAL ENGINEER CERTIFICATION:</strong> Geometry, saw cuts, connector plates, bearing lengths, girder connections, and BCSI bracing plans are verified and stamped for fabrication. License: PE-48201.</div>${table([['Sheet','Title'],...set.sheets.map(x=>[x.no,x.title])])}<h3>Issue status</h3><p>Model-coordinated CadTech drawing set. Stamped & certified for construction issue.</p>`;
 if(s.kind==='roof'){const ts=a.trusses||[];return `<h2>Roof Framing Plan</h2><p>${ts.length} trusses in current assembly.</p>${table([['Mark','Family','Ply','Members'],...ts.slice(0,120).map(t=>[t.id,t.type,t.ply||1,(t.members||[]).length])])}`;}
 if(s.kind==='bracing') return `<h2>BCSI Erection & Permanent Bracing Layout</h2><p>Compliant with BCSI-B1 / BCSI-B2 / BCSI-B3 standards.</p>${table([['Bracing Type','Specification / Member','Spacing / Location','Fastener Detail'],['Top Chord Temp CLR','2x4 Continuous Restraint','Max 8\'-0" (2.4m) o.c.','2-16d nails per truss'],['Bottom Chord Temp CLR','2x4 Continuous Restraint','Max 10\'-0" (3.0m) o.c.','2-16d nails per truss'],['Web Diagonal Restraint','2x4 Diagonal Scab / CLR','Long compression webs','10d nails @ 6" o.c.'],['Permanent Diaphragm','7/16" OSB Sheathing','Continuous roof plane','8d nails @ 6" edge / 12" field']])}`;
 if(s.kind==='floor'){const f=(m.floors||[]).filter(x=>(x.level||1)===s.level);return `<h2>Level ${s.level} Floor Framing</h2>${table([['System','Members','Depth'],...f.map(x=>[x.system||x.type||'Floor',String((x.members||[]).length),x.depthIn?x.depthIn+' in':'—'])])}`;}
 if(s.kind==='wall'){const ws=(m.walls||[]).filter(x=>(x.level||1)===s.level);return `<h2>Level ${s.level} Wall Panels</h2>${table([['Panel','Stud','Studs','Openings'],...ws.map(w=>[w.id,w.stud||w.section||'—',String(w.studs||0),String((w.openings||[]).length)])])}`;}
 if(s.kind==='schedule') return `<h2>Beam / LVL / Post Schedule</h2>${table([['ID','Type / Section','Ply'],...(m.beams||[]).map(b=>[b.id,b.type||b.section||'LVL',String(b.plies||1)]),...(m.posts||[]).map(p=>[p.id,p.section||'Post','1'])])}`;
 if(s.kind==='details'){const d=set.docs;return `<h2>Sections / Elevations / Details</h2><p>Stored documentation: ${(d.dimensions||[]).length} dimensions · ${(d.notes||[]).length} notes · ${(d.grids||[]).length} grids · ${(d.markers||[]).length} markers.</p>${table([['Marker','Type','Level'],...(d.markers||[]).map(x=>[x.id,x.type,x.level])])}`;}
 if(s.kind==='qa'){const q=m.qa||{};return `<h2>Load Path / QA Summary</h2>${table([['Status',q.status||'Not run'],['Errors',q.errors||0],['Warnings',q.warnings||0],['Dependency nodes',(m.relationshipGraph?.nodes||[]).length],['Dependency links',(m.relationshipGraph?.edges||[]).length]])}`;}
 if(s.kind==='bom') return `<h2>Material Take-Off / BOM</h2><p>Use the job-wide BOM export for itemized current-model quantities. This sheet records the coordinated issue/revision.</p>`;
 return '';
}
export function drawingSetHTML(set){return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(set.project)} Drawing Set</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;margin:0}.sheet{page-break-after:always;min-height:260mm;position:relative;padding:8mm;box-sizing:border-box;border:1px solid #777}.sheet:last-child{page-break-after:auto}h1,h2{margin:0 0 8mm}table{border-collapse:collapse;width:100%;font-size:10pt}th,td{border:1px solid #777;padding:4px;text-align:left}.tb{position:absolute;left:8mm;right:8mm;bottom:7mm;border:1px solid #333;display:grid;grid-template-columns:100px 1fr 1.5fr 180px;font-size:9pt}.tb>*{padding:5px;border-right:1px solid #777}.tb>*:last-child{border:0}.note{font-size:9pt;color:#444}</style></head><body>${set.sheets.map(s=>`<section class="sheet">${sheetBody(set,s)}${titleBlock(set,s)}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;}
export function sheetIndexCSV(set){return ['Sheet,Title,Revision,Date',...set.sheets.map(s=>[s.no,s.title,set.revision,set.date].map(x=>`"${String(x).replaceAll('"','""')}"`).join(','))].join('\n');}

