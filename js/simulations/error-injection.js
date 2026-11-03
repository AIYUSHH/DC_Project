/** Deterministic bit-error pattern helpers used by the Error Pattern Laboratory. */
export const ERROR_PATTERNS = [
 {id:'single',label:'Single-bit error',count:1,description:'One bit is inverted.'},
 {id:'double',label:'Two-bit error',count:2,description:'Two distinct bits are inverted.'},
 {id:'multi',label:'Multiple-bit error',count:4,description:'Four distinct bits are inverted.'},
 {id:'adjacent',label:'Adjacent-bit error',count:2,adjacent:true,description:'Two neighboring bits are inverted.'},
 {id:'burst4',label:'4-bit burst',count:4,burst:true,description:'A contiguous four-bit burst is inverted.'},
 {id:'burst8',label:'8-bit burst',count:8,burst:true,description:'A contiguous eight-bit burst is inverted.'},
 {id:'random',label:'Random corruption',count:3,description:'Three randomly selected bits are inverted.'},
];
export function corruptBytes(bytes, pattern='single') {
 const spec=ERROR_PATTERNS.find(p=>p.id===pattern)||ERROR_PATTERNS[0];
 const out=bytes.slice(), total=out.length*8, n=Math.min(spec.count,total);
 let start=Math.floor(Math.random()*Math.max(1,total-n+1));
 const indexes=spec.adjacent||spec.burst?Array.from({length:n},(_,i)=>start+i):[];
 if(!indexes.length){while(indexes.length<n){const i=Math.floor(Math.random()*total);if(!indexes.includes(i))indexes.push(i);}}
 indexes.forEach(i=>out[i>>3]^=0x80>>(i&7));
 return {bytes:out,indexes,description:spec.description};
}
