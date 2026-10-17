// CadTech wall seating (V10.5.1): the TOP face of each wall's top plate meets the UNDERSIDE of the bottom chords it carries.
// Walls used to be seated once, when the roof was generated, to the lowest bottom-chord underside of the roof AT THAT MOMENT (default 150 mm
// chords). Analyze then replaced the chords with their designed sections (2x4 = 89 mm) so the chord underside rose ~30 mm and the plates were
// left floating below the trusses. The seat is now recomputed from the CURRENT bottom chords every time the view is rebuilt, per wall.
import {memberSolid} from './connection-geometry.js';
export const SEAT_TOLERANCE_M=0;     // plate top matches chord underside exactly.

// underside (lowest solid vertex) and plan footprint of every bottom chord in the roof
export function bottomChordUndersides(assembly){
  const out=[];
  for(const t of assembly?.trusses||[]){
    const ply=Math.max(1,Number(t.analysis?.ply||t.ply)||1);
    for(const m of t.members||[]){
      if(m.role!=='bottom'||!m.a||!m.b)continue;
      const s=memberSolid(t,m,assembly,0);if(s.hidden||!s.triangles?.length)continue;
      let z=Infinity;for(const p of s.triangles)if(p[2]<z)z=p[2];
      out.push({truss:t.id,a:[m.a[0],m.a[1]],b:[m.b[0],m.b[1]],halfW:(Number(m.section?.[0])||.0381)/2+.055*(ply-1)/2,z});
    }
  }
  return out;
}
function segDist(a,b,c,d){                                // minimum distance between two plan segments
  const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)return 0;
  const pt=(p,u,v)=>{const dx=v[0]-u[0],dy=v[1]-u[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/L)):0;return Math.hypot(p[0]-u[0]-t*dx,p[1]-u[1]-t*dy);};
  return Math.min(pt(a,c,d),pt(b,c,d),pt(c,a,b),pt(d,a,b));
}
const topFaceZ=w=>Math.max(...(w.topPlates||[]).map(p=>Math.max(p.a[2],p.b[2])+(Number(p.depthM)||w.sectionWidthM||.0381)/2));

// seat level for one wall = lowest underside among the bottom chords that overlap the wall in plan, adjusted for heel height
export function wallSeatLevel(w, chords, assembly) {
  const half = (Number(w.cadThicknessM) || Number(w.sectionDepthM) || 0.0889) / 2;
  const over = chords.filter(c => segDist(c.a, c.b, w.start, w.end) < c.halfW + half);
  const use = over.length ? over : chords;
  
  // Target Z is the chord's lowest point (the underside of the bottom chord)
  const targetZs = use.map(c => c.z);

  const minZ = Math.min(...targetZs);
  return { z: minZ, spread: Math.max(...targetZs) - minZ, count: over.length, basis: over.length ? 'bottom chords over the wall' : 'all bottom chords' };
}

function normalizeTrussElevations(framing, assembly, chords) {
  const trussShifts = new Map(); 
  for (const w of framing.wallAssemblies) {
    const seat = wallSeatLevel(w, chords, assembly);
    if (seat.count <= 1 || seat.spread < 0.001) continue;
    const half = (Number(w.cadThicknessM) || Number(w.sectionDepthM) || 0.0889) / 2;
    const over = chords.filter(c => segDist(c.a, c.b, w.start, w.end) < c.halfW + half);
    for (const c of over) {
      const dz = seat.z - c.z; 
      if (dz < -0.0005) { // Truss is higher than the lowest point on this wall
        const current = trussShifts.get(c.truss) || 0;
        if (dz < current) trussShifts.set(c.truss, dz);
      }
    }
  }
  if (trussShifts.size > 0) {
    for (const t of assembly.trusses) {
      const dz = trussShifts.get(t.id);
      if (dz) {
        const up = p => (Array.isArray(p) && p.length >= 3) ? [p[0], p[1], p[2] + dz] : p;
        if (t.members) {
          for (const m of t.members) {
            if (m.a) m.a = up(m.a);
            if (m.b) m.b = up(m.b);
          }
        }
        if (t.profile) t.profile = t.profile.map(up);
        delete t.shape;
      }
    }
    return true;
  }
  return false;
}

// returns a framing whose walls are seated to the CURRENT bottom chords; safe to call again and again
export function reseatWallFraming(framing, assembly) {
  if (!framing?.wallAssemblies?.length || !assembly?.trusses?.length) return framing;
  let chords = bottomChordUndersides(assembly); if (!chords.length) return framing;

  // V10.5.2: Automatically align floating trusses down to the wall plate level to satisfy "no gap" request.
  if (normalizeTrussElevations(framing, assembly, chords)) {
    chords = bottomChordUndersides(assembly);
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of assembly.trusses) {
    for (const p of t.profile || []) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
  }

  let framingWalls = framing.wallAssemblies;
  if (Number.isFinite(minX) && framingWalls.length >= 4) {
    framingWalls = framingWalls.map(w => {
      const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1];
      const isNorth = Math.abs(dy) < 0.05 && Math.abs(w.start[1] - maxY) < 0.75;
      const isSouth = Math.abs(dy) < 0.05 && Math.abs(w.start[1] - minY) < 0.75;
      const isWest = Math.abs(dx) < 0.05 && Math.abs(w.start[0] - minX) < 0.75;
      const isEast = Math.abs(dx) < 0.05 && Math.abs(w.start[0] - maxX) < 0.75;
      if (isNorth) return { ...w, start: [minX, maxY, w.start[2]], end: [maxX, maxY, w.end[2]] };
      if (isSouth) return { ...w, start: [minX, minY, w.start[2]], end: [maxX, minY, w.end[2]] };
      if (isWest) return { ...w, start: [minX, minY, w.start[2]], end: [minX, maxY, w.end[2]] };
      if (isEast) return { ...w, start: [maxX, minY, w.start[2]], end: [maxX, maxY, w.end[2]] };
      return w;
    });
  }

  let maxSpread = 0;
  const walls = framingWalls.map(w => {
    const cur = topFaceZ(w); if (!Number.isFinite(cur)) return w;
    const seat = wallSeatLevel(w, chords, assembly), target = seat.z + SEAT_TOLERANCE_M;
    const dz = target - cur;
    maxSpread = Math.max(maxSpread, seat.spread);
    const info = { z: target, chordsOver: seat.count, spreadMm: +(seat.spread * 1000).toFixed(1), basis: seat.basis };
    if (Math.abs(dz) < 1e-9) return { ...w, seat: info };
    const up = p => [p[0], p[1], p[2] + dz];
    return { 
      ...w, 
      start: up(w.start), end: up(w.end), 
      seat: info, 
      bottomPlate: w.bottomPlate ? { ...w.bottomPlate, a: up(w.bottomPlate.a), b: up(w.bottomPlate.b) } : null,
      bottomPlates: (w.bottomPlates || []).map(p => ({ ...p, a: up(p.a), b: up(p.b) })),
      topPlates: (w.topPlates || []).map(p => ({ ...p, a: up(p.a), b: up(p.b) })),
      studs: (w.studs || []).map(s => ({ ...s, a: up(s.a), b: up(s.b) })) 
    };
  });
  return { ...framing, wallAssemblies: walls, seating: { walls: walls.length, maxChordSpreadMm: +(maxSpread * 1000).toFixed(1) } };
}
