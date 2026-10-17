import {MEMBER_SIZE_LADDER} from './advanced.js';
const expected=['2x4/1','2x4/2','2x6/1','2x6/2','2x6/3','2x8/1'];
const actual=MEMBER_SIZE_LADDER.slice(0,6).map(x=>`${['2x4','2x6','2x8','2x10','2x12'][x.size]}/${x.ply}`);
if(JSON.stringify(actual)!==JSON.stringify(expected)) throw Error(`Unexpected size/ply ladder: ${actual.join(', ')}`);
for(const role of ['top','bottom','web']) if(!role) throw Error('role missing');
console.log('Member size/ply ladder PASS:',actual.join(' -> '));
