import {frameProfile} from './roof.js';
const p=[[-1,0,-.5],[5,0,3],[11,0,-.5]],m=frameProfile(p,0,1.2),bc=m.filter(x=>x.role==='bottom'),web=m.filter(x=>x.role==='web'),tc=m.filter(x=>x.role==='top');
if(!bc.length||!web.length||!tc.length)throw Error('missing framing');
const xs=bc.flatMap(x=>[x.a[0],x.b[0]]);if(Math.min(...xs)<-.2||Math.max(...xs)>10.2)throw Error('bottom chord extends into eave tail');
for(const w of web)for(const q of [w.a,w.b])if(q[0]<-.2||q[0]>10.2)throw Error('web generated outside heel envelope');
console.log('V9.6 heel-bounded bottom chord/web topology: PASS');
