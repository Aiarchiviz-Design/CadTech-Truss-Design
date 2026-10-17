import {memberCutProfile} from './connection-geometry.js';
const tc={role:'top',section:[.038,.09],a:[0,0,.30],b:[1,0,.80]};
const bc={role:'bottom',section:[.038,.09],a:[0,0,.30],b:[1,0,.30]};
const web={role:'web',section:[.038,.09],a:[.5,0,.30],b:[.5,0,.55]};
const t={normal:[0,1,0],members:[tc,bc,web]};
const c=memberCutProfile(t,web);
if(!c.start||!c.end)throw Error('web cuts missing');
if(Math.abs(c.end.minus-c.end.plus)<1e-5)throw Error('top web cut is still square');
console.log('manufacturing oblique web cuts OK',c.start.minus,c.start.plus,c.end.minus,c.end.plus);
