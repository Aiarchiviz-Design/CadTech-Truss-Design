// V9.9.4 wood take-off regression. Run: node test-takeoff-v99.mjs
import fs from 'fs';
import {parseRoofDXF} from './dxf-importer.js';
import {assembleRoof} from './roof.js';
import {templateMembers} from './advanced.js';
import {woodTakeoff,takeoffSummaryCSV,cutListCSV,takeoffByTrussCSV,takeoffHTML,ftIn,stockFor,nominalSize} from './takeoff.js';
import {makeReport} from './report.js';
const txt=fs.readFileSync(new URL('./TRUSSES.dxf',import.meta.url),'utf8');
const asm=assembleRoof(parseRoofDXF(txt,{roofLayer:'ROOF',trussLayer:'TRUSSES',pitchDeg:22.5,unit:'auto'}),{heel:.25,panel:1.2});
let members=0;for(const t of asm.trusses){t.members=templateMembers(t,{panel:1.2,overhang:.6});members+=t.members.length;}
const to=woodTakeoff(asm);
if(ftIn(.3048)!=="1'-0\""||ftIn(3.0480+.0254*1.5)!=="10'-1 1/2\"")throw Error('ftIn wrong: '+ftIn(3.0480+.0254*1.5));
if(stockFor(7.9)!==8||stockFor(8.2)!==10||stockFor(24)!==24||stockFor(24.1)!==null)throw Error('stock lengths wrong');
if(nominalSize('2x10').join()!=='2,10')throw Error('nominal size');
if(!(to.rows.length>0&&to.rows.length<members*.8))throw Error(`chord segments must merge into boards (${to.rows.length} boards from ${members} members)`);
// every truss appears, lengths are sane, no zero or absurd pieces
for(const t of asm.trusses)if(!to.rows.some(r=>r.truss===t.id))throw Error(t.id+' missing from take-off');
for(const r of to.rows){if(!(r.cutM>.05&&r.cutM<30))throw Error(`${r.mark} cut length ${r.cutM}`);const k=r.cutM/r.centerM;                                      // webs seat between chord faces (shorter than node-to-node); chords run to the cut ends
  if(r.role==='web'?(k<.4||k>1.02):(k<.88||k>1.12))throw Error(`${r.mark}: cut ${r.cutM.toFixed(3)} m vs centreline ${r.centerM.toFixed(3)} m`);}
// board feet: a 2x4 is 8/12 BF per foot
const r0=to.rows.find(r=>r.section==='2x4'),want=2*4/12*r0.cutFt*r0.qty;if(Math.abs(r0.bf-want)>1e-9)throw Error('board feet wrong');
// totals agree between views
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
if(Math.abs(sum(to.rows,r=>r.cutFt*r.qty)-to.totals.cutFt)>1e-6)throw Error('cut total mismatch');
if(Math.abs(sum(to.byTruss,x=>x.cutFt)-to.totals.cutFt)>1e-6)throw Error('by-truss total mismatch');
if(Math.abs(sum(to.byRole,x=>x.cutFt)-to.totals.cutFt)>1e-6)throw Error('by-role total mismatch');
// ordering never buys less than it cuts, and every board is a standard length
for(const s of to.sections){if(s.orderedFt+1e-6<s.cutFt)throw Error(s.section+' orders less than it cuts');if(s.yield>1+1e-9)throw Error('yield >100%');}
// top chords include the overhang as one continuous board
if(!to.rows.some(r=>r.role==='top'&&r.overhang))throw Error('overhang must be merged into its rafter');
// CSV shape
for(const c of [takeoffSummaryCSV(to),cutListCSV(to),takeoffByTrussCSV(to)]){const L=c.split('\r\n'),n=L[0].split(',').length;if(L.length<2||!n)throw Error('empty csv');}
if(cutListCSV(to).split('\r\n').length!==to.rows.length+1)throw Error('cut list row count');
if(!takeoffHTML(to).includes('<table'))throw Error('html');
// PDF carries the take-off page
for(const t of asm.trusses){t.span=t.span||1;t.height=t.height||1;}
const pdf=Buffer.from(makeReport('T',asm,{trib:2,dead:15,roofLive:20,limit:360},'imperial')).toString('latin1');
if(!pdf.includes('WOOD TAKE-OFF')||!pdf.includes('Nominal board feet'))throw Error('PDF take-off page missing');
// V9.9.7: roof take-off comes right after the layout (before the truss pages) and every truss page carries its own take-off
const first=pdf.indexOf('WOOD TAKE-OFF'),trussPg=pdf.indexOf(asm.trusses[0].id+' - ');
if(first<0||trussPg<0||first>trussPg)throw Error('roof wood take-off must precede the truss pages');
for(const t of asm.trusses)if(!pdf.includes('WOOD TAKE-OFF - '+t.id))throw Error(t.id+' page has no wood take-off');
if(!pdf.includes('Nom. BF')||!pdf.includes('TRUSS TOTAL'))throw Error('per-truss take-off columns missing');
console.log(`V9.9.4 wood take-off PASS (${members} members -> ${to.rows.length} boards, ${to.totals.cutFt.toFixed(0)} lin ft, ${to.totals.bf.toFixed(0)} BF, ${to.totals.boards} boards to order)`);
