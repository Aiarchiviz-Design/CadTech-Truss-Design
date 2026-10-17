// CadTech physical timber connection geometry.
// Analytical panel points remain on member centre-lines. Rendered/fabrication solids are
// shortened to the physical face of the adjoining timber so webs/BCs do not protrude.
const EPS=1e-7, JOINT_TOL=.012;
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=v=>Math.hypot(...v);
const unit=v=>{const L=norm(v);return L>EPS?v.map(x=>x/L):[0,0,0]};
const lerp=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const dist=(a,b)=>norm(sub(a,b));

export function receiverHalfWidth(receiver){
  const breadth=Math.max(.01,...(receiver?.members||[]).map(m=>Number(m.section?.[0])||.045));
  const ply=Math.max(1,Number(receiver?.ply)||1);
  return (breadth+(ply-1)*.055)/2;
}
function trussReferencePoint(t){const pts=(t?.members||[]).flatMap(m=>[m.a,m.b]).filter(Boolean);return pts.length?[0,1,2].map(i=>pts.reduce((s,p)=>s+(Number(p[i])||0),0)/pts.length):[0,0,0];}
function connectionPlane(truss,receiver,c,member){
  const n=unit([Number(receiver?.normal?.[0])||0,Number(receiver?.normal?.[1])||0,0]);if(norm(n)<.5)return null;
  const origin=(c?.point?.length>=3)?c.point:trussReferencePoint(receiver);
  let tc=(c?.keepPoint?.length>=3)?c.keepPoint:trussReferencePoint(truss);if(!c?.keepPoint&&!(truss?.members||[]).some(m=>m?.a&&m?.b)&&member?.a&&member?.b)tc=lerp(member.a,member.b,.5);
  let side=Math.sign(dot(sub(tc,origin),n));if(!side){const p=truss?.profile?.[0]||truss?.members?.[0]?.a;side=Math.sign(dot(sub(p||tc,origin),n))||1;}
  return {origin,n,side,half:receiverHalfWidth(receiver),receiver:receiver.id};
}
function clipSegmentToNearFace(a,b,plane){
  const q=p=>plane.side*dot(sub(p,plane.origin),plane.n)-plane.half;let qa=q(a),qb=q(b);
  if(qa>=-EPS&&qb>=-EPS)return {a,b,changed:false};if(qa<-EPS&&qb<-EPS)return {a,b,changed:true,hidden:true};
  const den=qa-qb;if(Math.abs(den)<EPS)return {a,b,changed:true,hidden:true};const hit=lerp(a,b,Math.max(0,Math.min(1,qa/den)));if(qa<0)a=hit;else b=hit;return {a,b,changed:true,hidden:false};
}
function roleDepth(m){return Math.max(.01,Number(m?.section?.[1])||.09);}
function isCollinear(a,b){const u=unit(sub(a.b,a.a)),v=unit(sub(b.b,b.a));return norm(u)>.5&&norm(v)>.5&&Math.abs(dot(u,v))>.997;}
function endpointOnMember(p,m){
  const ab=sub(m.b,m.a),den=dot(ab,ab);if(den<EPS)return dist(p,m.a)<=JOINT_TOL;
  const t=dot(sub(p,m.a),ab)/den;if(t<-.015||t>1.015)return false;const q=add(m.a,mul(ab,Math.max(0,Math.min(1,t))));return dist(p,q)<=Math.max(JOINT_TOL,roleDepth(m)*0.8);
}
function setbackToFace(incoming,receiver){
  const iu=unit(sub(incoming.other,incoming.p)),ru=unit(sub(receiver.b,receiver.a));
  const c=Math.max(-1,Math.min(1,dot(iu,ru))),sin=Math.sqrt(Math.max(0,1-c*c));
  if(sin<.08)return 0;return Math.min(.35,roleDepth(receiver)/(2*sin));
}
function jointReceivers(truss,member,p){return (truss?.members||[]).filter(r=>r!==member&&r?.a&&r?.b&&endpointOnMember(p,r));}
function roleRank(r){return r==='top'?3:r==='bottom'?2:r==='web'?1:0;}
function chooseReceiver(member,receivers){
  // Envelope-first MPC truss rule. Chords are the controlling perimeter members.
  // Webs fit BETWEEN chord faces. Chords are never shortened merely because a web
  // lands on them. Bottom chord only terminates to a top chord at a true heel.
  if(member.role==='web'){
    const chords=receivers.filter(r=>r.role==='top'||r.role==='bottom');
    chords.sort((a,b)=>roleRank(b.role)-roleRank(a.role));
    return chords[0]||null;
  }
  if(member.role==='bottom'){
    // At a true heel the bottom chord is a secondary envelope member: its physical
    // end is sawn to the top-chord face.  The analytical heel node is unchanged.
    return receivers.find(r=>r.role==='top')||null;
  }
  return null;
}
function memberOrder(truss,m){return Math.max(0,(truss?.members||[]).indexOf(m));}
function sameRoleAt(truss,member,p,role){return jointReceivers(truss,member,p).filter(r=>r.role===role);}
function peakMate(truss,member,p){
  if(member.role!=='top')return null;
  return sameRoleAt(truss,member,p,'top').find(r=>!isCollinear(member,r))||null;
}
function endpointJointType(truss,member,p){
  const rs=jointReceivers(truss,member,p);
  if(member.role==='web')return rs.some(r=>r.role==='top')?'WEB_TOP':rs.some(r=>r.role==='bottom')?'WEB_BOTTOM':'WEB_FREE';
  if(member.role==='bottom')return rs.some(r=>r.role==='top')?'HEEL':rs.some(r=>r.role==='bottom'&&isCollinear(member,r))?'BC_SPLICE':'BC_FREE';
  if(member.role==='top')return rs.some(r=>r.role==='top'&&!isCollinear(member,r))?'PEAK':rs.some(r=>r.role==='top'&&isCollinear(member,r))?'TC_SPLICE':'TC_FREE';
  return 'FREE';
}
function trimEndpointToJointFace(truss,member,p,other){
  // Centre-lines / analytical panel points stay untouched. Physical cuts are made by
  // memberCutProfile(). This function intentionally returns the analytical point.
  return p;
}
function internalJointFaceTrim(truss,member,a,b){return {a,b};}


// =====================================================================================
// V9.7 exact face-to-face joint solids
// -------------------------------------------------------------------------------------
// Every member is built as a convex 2D outline in the truss plane (X along the truss, Z up)
// and extruded across its thickness.  The outline starts as the member rectangle and is
// clipped by half-planes taken from the neighbouring timbers' real faces:
//   * web end      -> face of every chord that carries it (vertical post under a ridge gets the
//                     pointed "V" seat because both rafter undersides clip it)
//   * chord/chord  -> zero-gap mitre through the two intersections of the facing edges
//   * web/web      -> the stronger (steeper) web wins, the other butts against its side face
//   * free BC end  -> sawn flush with the outside face of a near-vertical heel web
//   * collinear    -> chord/overhang continuity, no cut
// Analytical panel nodes are never moved.
// =====================================================================================
const NODE_TOL=.015;
function planeFrame(truss){
  const nx=Number(truss?.normal?.[0])||0, ny=Number(truss?.normal?.[1]);const n=[nx,Number.isFinite(ny)?ny:1];
  const L=Math.hypot(n[0],n[1])||1;const h=[n[1]/L,-n[0]/L,0];
  const first=(truss?.members||[]).find(m=>m?.a);const o=first?first.a:[0,0,0];
  return {h,n:[n[0]/L,n[1]/L,0],o};
}
const to2=(fr,p)=>[(p[0]-fr.o[0])*fr.h[0]+(p[1]-fr.o[1])*fr.h[1],p[2]];
const from3=(fr,q,off=0)=>[fr.o[0]+fr.h[0]*q[0]+fr.n[0]*off,fr.o[1]+fr.h[1]*q[0]+fr.n[1]*off,q[1]];
const v2sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], v2add=(a,b)=>[a[0]+b[0],a[1]+b[1]], v2mul=(a,s)=>[a[0]*s,a[1]*s];
const v2dot=(a,b)=>a[0]*b[0]+a[1]*b[1], v2len=a=>Math.hypot(a[0],a[1]);
const v2unit=a=>{const l=v2len(a);return l>EPS?[a[0]/l,a[1]/l]:[0,0]};
const v2rot=a=>[-a[1],a[0]];
function lineIntersect(p1,d1,p2,d2){const den=d1[0]*d2[1]-d1[1]*d2[0];if(Math.abs(den)<1e-9)return null;const t=((p2[0]-p1[0])*d2[1]-(p2[1]-p1[1])*d2[0])/den;return [p1[0]+d1[0]*t,p1[1]+d1[1]*t];}
function clipPoly(poly,hp){ // keep dot(q-hp.p,hp.n)>=0   (Sutherland-Hodgman, convex)
  if(!poly.length)return poly;const out=[],f=q=>v2dot(v2sub(q,hp.p),hp.n);
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);
    if(fa>=-1e-10)out.push(a);
    if((fa>1e-10&&fb<-1e-10)||(fa<-1e-10&&fb>1e-10)){const t=fa/(fa-fb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
  return out;
}
function polyArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;}
function dedupePoly(p){const o=[];for(const q of p){if(!o.length||v2len(v2sub(q,o.at(-1)))>1e-6)o.push(q);}if(o.length>1&&v2len(v2sub(o[0],o.at(-1)))<=1e-6)o.pop();return o;}
function satOverlap(A,B,tol=1e-5){ // convex polygon interiors overlap (penetration > tol)
  for(const P of [A,B])for(let i=0;i<P.length;i++){const e=v2sub(P[(i+1)%P.length],P[i]),n=v2unit(v2rot(e));if(!n[0]&&!n[1])continue;
    let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;for(const q of A){const d=v2dot(q,n);a0=Math.min(a0,d);a1=Math.max(a1,d);}for(const q of B){const d=v2dot(q,n);b0=Math.min(b0,d);b1=Math.max(b1,d);}
    if(a1<=b0+tol||b1<=a0+tol)return false;}
  return true;
}
function roleOf(m){return m.role==='overhang'?'top':m.role;}
function info2(fr,m){const A=to2(fr,m.a),B=to2(fr,m.b),L=v2len(v2sub(B,A));const u=L>EPS?v2mul(v2sub(B,A),1/L):[1,0];return {m,A,B,L,u,d:roleDepth(m),role:roleOf(m)};}
function dirFrom(I,P){ // unit direction of member I pointing away from node P
  return dist2(P,I.A)<=dist2(P,I.B)?I.u:v2mul(I.u,-1);
}
const dist2=(a,b)=>v2len(v2sub(a,b));
function collinear2(a,b){return Math.abs(v2dot(a.u,b.u))>.9998;}
function atNode(I,P){return dist2(I.A,P)<=NODE_TOL||dist2(I.B,P)<=NODE_TOL;}
function onBody(I,P){ // P lies on member I (end or interior, within a face allowance)
  const ab=v2sub(I.B,I.A),den=v2dot(ab,ab);if(den<EPS)return dist2(P,I.A)<=NODE_TOL;
  const t=v2dot(v2sub(P,I.A),ab)/den;if(t<-.015||t>1.015)return false;
  const q=v2add(I.A,v2mul(ab,Math.max(0,Math.min(1,t))));return dist2(P,q)<=Math.max(NODE_TOL,I.d*.8);
}
// half-plane = the near face of chord C seen from a member leaving node P in direction w
function chordFace(C,P,w){
  let n=v2rot(C.u);if(v2dot(n,w)<0)n=v2mul(n,-1);if(Math.abs(v2dot(n,w))<.02)return null;
  // project node onto the chord centre-line so the face is exact even when the node is slightly off
  const ab=v2sub(C.B,C.A),t=v2dot(v2sub(P,C.A),ab)/(v2dot(ab,ab)||1),Q=v2add(C.A,v2mul(ab,t));
  return {p:v2add(Q,v2mul(n,C.d/2)),n};
}
// zero-gap mitre line between two members that meet at node P
function mitreHalfPlanes(I,J,P){
  const ui=dirFrom(I,P),uj=dirFrom(J,P),vi=v2rot(ui),vj=v2rot(uj),di=I.d/2,dj=J.d/2;
  const p1=v2add(P,v2mul(vi,di)),p2=v2add(P,v2mul(vi,-di)),q1=v2add(P,v2mul(vj,dj)),q2=v2add(P,v2mul(vj,-dj));
  const X1=lineIntersect(p1,ui,q2,uj), X2=lineIntersect(p2,ui,q1,uj); // (left_i,right_j) and (right_i,left_j)
  if(!X1||!X2||dist2(X1,X2)<1e-5)return null;
  const dir=v2unit(v2sub(X2,X1)),nrm=v2rot(dir);
  const sideOf=(u)=>{const pt=v2add(P,v2mul(u,.25));return v2dot(v2sub(pt,X1),nrm)>=0?1:-1;};
  return {forI:{p:X1,n:v2mul(nrm,sideOf(ui))},forJ:{p:X1,n:v2mul(nrm,sideOf(uj))}};
}
function baseRect(I,P0,P1,ext0,ext1){ // member rectangle with optional extensions beyond its nodes
  const v=v2rot(I.u),h=I.d/2,s0=-ext0,s1=I.L+ext1;
  const pt=(s,y)=>v2add(v2add(I.A,v2mul(I.u,s)),v2mul(v,y));
  return [pt(s0,-h),pt(s1,-h),pt(s1,h),pt(s0,h)];
}
// V9.8: an eave overhang is the straight continuation of its top chord, so it is the SAME timber:
// it takes the depth and thickness of the top chord it continues from. Without this the overhang kept the
// default 2x4 after the top chord was resized, and the two centre-aligned members showed a step on top.
function harmonizeOverhangs(list){
  for(const I of list){
    if(I.m.role!=='overhang')continue;
    const mates=list.filter(T=>T.m.role==='top'&&collinear2(T,I)&&[T.A,T.B].some(p=>[I.A,I.B].some(q=>dist2(p,q)<=NODE_TOL)));
    if(!mates.length)continue;
    const T=mates.reduce((a,b)=>b.d>a.d?b:a);
    I.d=T.d;I.b=Number(T.m.section?.[0])||undefined;
  }
}
function allInfo(truss){const fr=planeFrame(truss);const list=(truss?.members||[]).filter(m=>m?.a&&m?.b).map(m=>info2(fr,m));harmonizeOverhangs(list);return {fr,list};}

// Clip list for one member end. Returns {clips:[halfplanes], ext, kind}
const MIN_STUB=.05;      // a web shorter than 50 mm (mean) left between two faces is a sliver, not a timber
const MIN_HEEL_STUB=.10; // a raised-heel stub needs >= 100 mm clear between BC top face and rafter underside, else saw the BC to the rafter
// Raised heel with a deep rafter: when the rafter underside comes within MIN_STUB of the bottom-chord top face the
// stub is only a sliver (the 'hook' seen on deep Common/Girder rafters). Saw the bottom chord to the rafter underside instead.
function shallowHeelSeat(ctx,I,P,away){
  let best=null;
  for(const J of ctx.list){
    if(J===I||J.role!=='top'||Math.abs(J.u[0])<.05)continue;
    if(P[0]<Math.min(J.A[0],J.B[0])-NODE_TOL||P[0]>Math.max(J.A[0],J.B[0])+NODE_TOL)continue;
    const zc=J.A[1]+(P[0]-J.A[0])*J.u[1]/J.u[0];if(zc<=P[1]+1e-6)continue;       // rafter must sit above the BC end
    const f=chordFace(J,P,away);if(!f)continue;
    const zU=f.p[1]+(P[0]-f.p[0])*J.u[1]/J.u[0],clear=zU-(P[1]+I.d/2);
    if(clear>=MIN_HEEL_STUB)continue;
    const Pb=[P[0],P[1]-I.d/2],s=v2dot(v2sub(Pb,f.p),f.n)/v2dot(away,f.n);
    const seat={clip:f,ext:Math.min(.8,Math.max(0,s)+.02),clear};
    if(!best||clear<best.clear)best=seat;
  }
  return best;
}
function endClips(ctx,I,endKey){
  const P=endKey==='a'?I.A:I.B, others=ctx.list.filter(J=>J!==I);
  const away=endKey==='a'?I.u:v2mul(I.u,-1); // direction from the node into this member
  const rec=others.filter(J=>onBody(J,P)&&!collinear2(I,J));
  const clips=[];let kind='FREE',ext=0;
  const chords=rec.filter(J=>J.role==='top'||J.role==='bottom');
  if(I.role==='web'){
    for(const C of chords){const f=chordFace(C,P,away);if(f)clips.push(f);}
    if(chords.length)kind=chords.some(c=>c.role==='top')?'WEB_TOP':'WEB_BOTTOM';
    ext=chords.length?Math.min(.6,Math.max(.08,I.L*.5)):0;
    return {clips,ext,kind,P,away};
  }
  // chords
  const mates=others.filter(J=>J.role===I.role&&atNode(J,P)&&!collinear2(I,J));
  if(I.role==='top'||I.role==='bottom'||I.role==='overhang'){
    if(mates.length){
      const J=mates[0],mh=mitreHalfPlanes(I,J,P);
      if(mh){clips.push(mh.forI);kind=I.role==='top'?'PEAK_MITER':'BC_MITRE';ext=I.d*2.5;return {clips,ext,kind,P,away};}
    }
    // top chord or eave overhang free outer end -> vertical plumb cut
    const continues=others.some(J=>(J.role==='top'||J.role==='overhang')&&atNode(J,P)&&collinear2(I,J));
    if(!continues&&(I.role==='top'||I.role==='overhang')&&Math.abs(away[0])>0.01){
      const plumbN=[away[0]>=0?1:-1,0];
      clips.push({p:P,n:plumbN});
      kind='TOP_PLUMB';
      ext=I.d*2.0;
      return {clips,ext,kind,P,away};
    }
    // bottom chord ending under / on a top chord: sawn to the rafter face (classic heel)
    if(I.role==='bottom'){
      const outerN=[away[0]>=0?1:-1,0];
      const seat=shallowHeelSeat(ctx,I,P,away);
      if(seat)return {clips:[seat.clip],ext:seat.ext,kind:'HEEL',P,away,sawn:true};
      const tops=rec.filter(J=>J.role==='top');
      if(tops.length){
        for(const C of tops){const f=chordFace(C,P,away);if(f)clips.push(f);}
        clips.push({p:P,n:outerN});
        kind='HEEL';ext=I.d*3;return {clips,ext,kind,P,away};
      }
    }
  }
  return {clips,ext,kind,P,away};
}

function webPriorityClips(ctx,outlines){
  // web / web overlaps at a shared node: steeper web wins, the other butts on its side face
  const webs=ctx.list.filter(I=>I.role==='web');
  const key=P=>P.map(v=>Math.round(v/NODE_TOL)).join(',');const nodes=new Map();
  for(const I of webs)for(const P of [I.A,I.B]){const k=key(P);if(!nodes.has(k))nodes.set(k,{P,items:[]});nodes.get(k).items.push(I);}
  for(const {P,items} of nodes.values()){
    const uniq=[...new Set(items)];if(uniq.length<2)continue;
    const rank=I=>Math.abs(dirFrom(I,P)[1]);                       // steeper = stronger
    uniq.sort((a,b)=>rank(b)-rank(a)||ctx.list.indexOf(a)-ctx.list.indexOf(b));
    for(let k=1;k<uniq.length;k++){const W=uniq[k];
      for(let j=0;j<k;j++){const H=uniq[j];
        const A=outlines.get(W),B=outlines.get(H);if(!A?.length||!B?.length||!satOverlap(A,B))continue;
        const uh=dirFrom(H,P),uw=dirFrom(W,P);
        if(Math.abs(v2dot(uh,uw))>.9995)continue;
        let n=v2rot(uh);if(v2dot(n,uw)<0)n=v2mul(n,-1);
        // if both are similarly steep and on opposite sides use the symmetric mitre, else butt on the winner's face
        let hp=null;
        if(Math.abs(rank(W)-rank(H))<.05){const mh=mitreHalfPlanes(W,H,P);if(mh)hp=mh.forI;}
        if(!hp)hp={p:v2add(P,v2mul(n,H.d/2)),n};
        outlines.set(W,dedupePoly(clipPoly(A,hp)));
      }}
  }
}
function solveOutlines(truss){
  const ctx=allInfo(truss),out=new Map(),meta=new Map();
  const ends=new Map(ctx.list.map(I=>[I,{sa:endClips(ctx,I,'a'),sb:endClips(ctx,I,'b')}]));
  // nodes where a shallow raised heel was converted to a sawn heel: the near-vertical stub there is dropped
  const sawn=[];for(const {sa,sb} of ends.values()){if(sa.sawn)sawn.push(sa.P);if(sb.sawn)sawn.push(sb.P);}
  for(const I of ctx.list){
    const {sa,sb}=ends.get(I);
    // an end is only extended past its node when something will saw it back to a face
    const ea=sa.clips.length?sa.ext:0, eb=sb.clips.length?sb.ext:0;
    let poly=baseRect(I,I.A,I.B,ea,eb);
    for(const hp of [...sa.clips,...sb.clips])poly=clipPoly(poly,hp);
    poly=dedupePoly(poly);
    if(I.role==='web'&&Math.abs(I.A[0]-I.B[0])<.02&&poly.length>=3){
      const bcXs=ctx.list.filter(J=>J.role==='bottom').flatMap(J=>[J.A[0],J.B[0]]);
      const minBcX=bcXs.length?Math.min(...bcXs):0;
      const maxBcX=bcXs.length?Math.max(...bcXs):Math.max(...ctx.list.map(J=>Math.max(J.A[0],J.B[0])));
      const minX=Math.min(...poly.map(q=>q[0])), maxX=Math.max(...poly.map(q=>q[0]));
      if(Math.abs(I.A[0]-minBcX)<.05&&minX<minBcX){
        poly=shiftPoly(poly,minBcX-minX);
        for(const W of ctx.list){
          if(W!==I&&W.role==='web'&&(atNode(W,I.A)||atNode(W,I.B))){
            const wp=out.get(W);
            if(wp&&wp.length>=3)out.set(W,dedupePoly(clipPoly(wp,{p:[minBcX+I.d,0],n:[1,0]})));
          }
        }
      }else if(Math.abs(I.A[0]-maxBcX)<.05&&maxX>maxBcX){
        poly=shiftPoly(poly,maxBcX-maxX);
        for(const W of ctx.list){
          if(W!==I&&W.role==='web'&&(atNode(W,I.A)||atNode(W,I.B))){
            const wp=out.get(W);
            if(wp&&wp.length>=3)out.set(W,dedupePoly(clipPoly(wp,{p:[maxBcX-I.d,0],n:[-1,0]})));
          }
        }
      }
    }
    if(I.role==='web'&&poly.length>=3&&Math.abs(polyArea(poly))/I.d<MIN_STUB)poly=[]; // sliver left between two faces: not a timber
    if(I.role==='web'&&Math.abs(I.u[0])<.5&&sawn.some(P=>dist2(P,I.A)<=NODE_TOL||dist2(P,I.B)<=NODE_TOL))poly=[]; // heel stub replaced by the sawn heel
    out.set(I,poly);meta.set(I,{start:sa.kind,end:sb.kind});
  }
  webPriorityClips(ctx,out);
  return {ctx,out,meta};
}
const solveCache=new WeakMap();
function solved(truss){
  const sig=(truss?.members||[]).length+':'+(truss?.members||[]).map(m=>[...m.a,...m.b,m.section?.[1]].join(',')).join('|');
  const c=solveCache.get(truss);if(c&&c.sig===sig)return c.val;
  const val=solveOutlines(truss);solveCache.set(truss,{sig,val});return val;
}
// -------- truss-to-truss receiver clipping (plane of the receiving truss) in 2D --------
function receiverClips2D(truss,assembly,fr){
  const hps=[];let hidden=false;
  for(const c of (truss?.connections||[])){
    if(!c?.to||!assembly?.trusses)continue;const receiver=assembly.trusses.find(x=>x.id===c.to);if(!receiver||receiver===truss)continue;
    const plane=connectionPlane(truss,receiver,c,null);if(!plane)continue;
    const f=X=>{const p=[fr.o[0]+fr.h[0]*X,fr.o[1]+fr.h[1]*X,0];return plane.side*dot(sub(p,plane.origin),plane.n)-plane.half;};
    const f0=f(0),f1=f(1),slope=f1-f0;
    if(Math.abs(slope)<1e-9){if(f0<-EPS)hidden=true;continue;}
    hps.push({p:[-f0/slope,0],n:[Math.sign(slope),0]});
  }
  return {hps,hidden};
}
// V9.9.2: full-width end stud at a flush (truss-to-truss) cut.
// The end node of a truss that butts a perpendicular truss lies on the receiver's centre line, so the receiver's near-face
// cut used to leave only the sliver of the end stud that sticks out past the face (~25 mm instead of the full stud width).
// The stud is moved inward until its OUTSIDE face is flush with the receiver face and keeps its full width; the diagonal web
// that lands on the same node is then trimmed back to the stud's inner face so the two do not overlap.
function isVerticalWeb(I){return I.role==='web'&&Math.abs(I.A[0]-I.B[0])<.02;} // a true stud: both nodes on the same X (steep diagonals are not studs)
function studCutOffset(J,hp){return hp.n[0]*((J.A[0]+J.B[0])/2-hp.p[0]);} // >0 centre inside the kept side
function studAtCut(J,hp){const off=studCutOffset(J,hp);return off<J.d/2-1e-4&&off>-(J.d/2+.03);}
function shiftPoly(poly,dx){
  const zs=poly.map(q=>q[1]),zm=(Math.min(...zs)+Math.max(...zs))/2;
  const slope=g=>{const a=g.reduce((p,q)=>q[0]<p[0]?q:p,g[0]),b=g.reduce((p,q)=>q[0]>p[0]?q:p,g[0]);return g.length<2||Math.abs(b[0]-a[0])<1e-6?0:(b[1]-a[1])/(b[0]-a[0]);};
  const st=slope(poly.filter(q=>q[1]>=zm)),sb=slope(poly.filter(q=>q[1]<zm));
  return poly.map(q=>[q[0]+dx,q[1]+(q[1]>=zm?st:sb)*dx]);
}
function endStudAdjust(ctx,I,poly,rc){
  if(I.role!=='web'||!rc.hps.length||poly.length<3)return poly;
  for(const hp of rc.hps){
    if(isVerticalWeb(I)){
      if(!studAtCut(I,hp))continue;
      const minX=Math.min(...poly.map(q=>q[0])), maxX=Math.max(...poly.map(q=>q[0]));
      if(hp.n[0]>0)poly=shiftPoly(poly,hp.p[0]-minX);
      else if(hp.n[0]<0)poly=shiftPoly(poly,hp.p[0]-maxX);
    }else{
      for(const J of ctx.list){
        if(J===I||!isVerticalWeb(J)||!studAtCut(J,hp))continue;
        const xc=(J.A[0]+J.B[0])/2;
        if(Math.abs(I.A[0]-xc)>.03&&Math.abs(I.B[0]-xc)>.03)continue;   // only the diagonal that lands on this node
        poly=clipPoly(poly,{p:[hp.p[0]+hp.n[0]*J.d,0],n:[hp.n[0],0]});
      }
    }
  }
  return poly;
}
// Public: closed solid outline of one member in 3D (world) coordinates -------------------
export function memberSolid(truss,member,assembly=null,plyOffset=0){
  const {ctx,out}=solved(truss);const I=ctx.list.find(x=>x.m===member);
  if(!I)return {hidden:true,outline:[],triangles:[],tag:'missing'};
  let poly=out.get(I)||[];const rc=receiverClips2D(truss,assembly,ctx.fr);
  if(rc.hidden)return {hidden:true,outline:[],triangles:[]};
  poly=endStudAdjust(ctx,I,poly,rc);
  for(const hp of rc.hps)poly=clipPoly(poly,hp);poly=dedupePoly(poly);
  if(poly.length<3||Math.abs(polyArea(poly))<1e-9)return {hidden:true,outline:[],triangles:[],trimmed:rc.hps.length>0,receivers:[]};
  if(polyArea(poly)<0)poly=[...poly].reverse();
  const b=Math.max(.005,Number(I.b??member.section?.[0])||.045),fr=ctx.fr,lo=plyOffset-b/2,hi=plyOffset+b/2;
  const P0=poly.map(q=>from3(fr,q,lo)),P1=poly.map(q=>from3(fr,q,hi)),tri=[];const n=poly.length;
  for(let i=1;i<n-1;i++){tri.push(P0[0],P0[i+1],P0[i]);tri.push(P1[0],P1[i],P1[i+1]);}
  for(let i=0;i<n;i++){const j=(i+1)%n;tri.push(P0[i],P0[j],P1[j]);tri.push(P0[i],P1[j],P1[i]);}
  // outward-facing triangles regardless of plane handedness (signed volume must be positive)
  let vol=0;for(let i=0;i<tri.length;i+=3){const a=tri[i],b=tri[i+1],c=tri[i+2];vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}
  if(vol<0)for(let i=0;i<tri.length;i+=3){const t=tri[i+1];tri[i+1]=tri[i+2];tri[i+2]=t;}
  return {hidden:false,outline:poly,outline3:poly.map(q=>from3(fr,q,plyOffset)),triangles:tri,lo,hi,trimmed:rc.hps.length>0,receivers:[]};
}
// V9.9.4: overall (long-point) length of one timber = the extent of its cut solid along its own axis. For a chord that is
// modelled as several panel segments pass all of its collinear segments: the result is the length of the continuous board.
export function memberRunLength(truss,members,assembly=null){
  const list=Array.isArray(members)?members:[members];if(!list.length)return 0;
  const {ctx}=solved(truss);const first=ctx.list.find(x=>x.m===list[0]);if(!first)return Number(list[0]?.length)||0;
  let lo=Infinity,hi=-Infinity;
  for(const m of list){const sol=memberSolid(truss,m,assembly,0);if(sol.hidden)continue;
    for(const q of sol.outline){const t=(q[0]-first.A[0])*first.u[0]+(q[1]-first.A[1])*first.u[1];if(t<lo)lo=t;if(t>hi)hi=t;}}
  return hi>lo?hi-lo:0;
}
// V9.9.5: everything a drawing needs in ONE truss frame (x along the truss, z up): every member's axis, depth and its exact cut
// outline (same solids as the 3D model), plus project() to put any world point into that frame.
export function trussFrameGeometry(truss,assembly=null){
  const {ctx}=solved(truss);
  const members=ctx.list.map(I=>{const s=memberSolid(truss,I.m,assembly,0);
    return {index:(truss.members||[]).indexOf(I.m),m:I.m,role:I.m.role,A:I.A,B:I.B,u:I.u,d:I.d,L:I.L,hidden:!!s.hidden||!s.outline?.length,outline:s.hidden?[]:s.outline};});
  return {members,project:p=>to2(ctx.fr,p)};
}
export function memberOutline2D(truss,member){const {ctx,out}=solved(truss);const I=ctx.list.find(x=>x.m===member);return I?(out.get(I)||[]).map(q=>[...q]):[];}
export function memberJointType(truss,member,p){
  const {ctx,meta}=solved(truss);const I=ctx.list.find(x=>x.m===member);if(!I)return 'FREE';
  const P=to2(ctx.fr,p),m=meta.get(I),k=dist2(P,I.A)<=dist2(P,I.B)?m.start:m.end;
  // classification names used by the schedule / older tools
  if(k==='PEAK_MITER')return 'PEAK';
  if(k==='BC_HEEL_FLUSH')return 'HEEL';
  if(k==='BC_MITRE')return 'BC_KNEE';
  if(k==='FREE'){const r=I.role==='web'?'WEB_FREE':I.role==='bottom'?'BC_FREE':I.role==='top'?'TC_FREE':'FREE';return r;}
  return k;
}
// Legacy view of the outline as two long-edge offsets per end (kept for older tools / tests)
export function memberCutProfile(truss,member){
  const {ctx,out,meta}=solved(truss);const I=ctx.list.find(x=>x.m===member);if(!I)return {start:null,end:null};
  const poly=out.get(I)||[];if(poly.length<3)return {start:null,end:null};
  const v=v2rot(I.u),sOf=q=>v2dot(v2sub(q,I.A),I.u),yOf=q=>v2dot(v2sub(q,I.A),v);
  const ys=poly.map(yOf),minY=Math.min(...ys),maxY=Math.max(...ys);
  const edge=(sign,atEnd)=>{
    const targetY=sign<0?minY:maxY;
    const c=poly.filter(q=>Math.abs(yOf(q)-targetY)<1e-5).map(sOf);if(!c.length)return null;return atEnd?Math.max(...c):Math.min(...c);};
  const mk=(atEnd)=>{const sm=edge(-1,atEnd),sp=edge(1,atEnd);if(sm==null||sp==null)return null;
    const mm=atEnd?I.L-sm:sm,pp=atEnd?I.L-sp:sp;if(Math.abs(mm)<1e-7&&Math.abs(pp)<1e-7)return null;
    const k=meta.get(I)[atEnd?'end':'start'];return {kind:k,minus:mm,plus:pp};};
  return {start:mk(false),end:mk(true)};
}

export function connectionTrimForMember(truss,member,assembly,plyOffset=0){
  let a=[...member.a],b=[...member.b],trimmed=false,receiverIds=[],setback=0;
  for(const c of (truss?.connections||[])){
    if(!c?.to||!assembly?.trusses)continue;const receiver=assembly.trusses.find(x=>x.id===c.to);if(!receiver||receiver===truss)continue;
    const plane=connectionPlane(truss,receiver,c,member);if(!plane)continue;const r=clipSegmentToNearFace(a,b,plane);a=r.a;b=r.b;
    if(r.changed){trimmed=true;receiverIds.push(receiver.id);setback=Math.max(setback,Math.min(dist(r.a,member.a),dist(r.b,member.b)));}if(r.hidden)return {a,b,trimmed:true,hidden:true,receivers:receiverIds,receiver:receiver.id};
  }
  // IMPORTANT: internal chord/web joints are NOT shortened here.  Their analytical
  // panel points remain the physical-solid reference and memberCutProfile() supplies
  // the actual saw/miter face.  Shortening here and cutting again in the viewer was
  // a double-trim error that caused the visible gaps, spikes and hanging heel/web ends.
  // Only truss-to-truss receiver clipping changes the centreline endpoints above.
  return {a,b,trimmed,hidden:false,receivers:receiverIds,receiver:receiverIds.at(-1)||null,setback};
}
export function solidMemberEnds(truss,member,assembly,plyOffset=0){return connectionTrimForMember(truss,member,assembly,plyOffset);}
export function penetrationAudit(assembly){const issues=[];for(const t of (assembly?.trusses||[]))for(const [i,m] of (t.members||[]).entries()){const r=connectionTrimForMember(t,m,assembly,0);if(r.hidden)issues.push({truss:t.id,member:i,status:'FULLY BEYOND RECEIVER',receivers:r.receivers});else if(r.trimmed)issues.push({truss:t.id,member:i,status:'FACE-TRIMMED',receivers:r.receivers});}return issues;}
