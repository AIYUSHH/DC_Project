/**
 * Hamming and SECDED teaching simulations.
 * Hamming(7,4) uses even parity at positions 1,2,4.
 */
export function encodeHamming74(data) {
  const d = String(data).replace(/[^01]/g, '').slice(0, 4).padEnd(4, '0').split('').map(Number);
  const b = Array(8).fill(0);
  [3,5,6,7].forEach((p,i)=>b[p]=d[i]);
  b[1]=b[3]^b[5]^b[7];
  b[2]=b[3]^b[6]^b[7];
  b[4]=b[5]^b[6]^b[7];
  return b.slice(1).join('');
}
export function decodeHamming74(code) {
  const b=Array(8).fill(0);
  String(code).replace(/[^01]/g,'').slice(0,7).padEnd(7,'0').split('').forEach((v,i)=>b[i+1]=Number(v));
  const syndrome=(b[1]^b[3]^b[5]^b[7]) + 2*(b[2]^b[3]^b[6]^b[7]) + 4*(b[4]^b[5]^b[6]^b[7]);
  if(syndrome>0 && syndrome<=7) b[syndrome]^=1;
  return {received:b.slice(1).join(''), syndrome, corrected:b.slice(1).join(''), data:[b[3],b[5],b[6],b[7]].join(''), correctedBit:syndrome||null};
}
/** Extended Hamming(8,4): overall parity provides SECDED. */
export function encodeSecded(data) {
  const seven=encodeHamming74(data).split('').map(Number);
  return seven.concat(seven.reduce((a,b)=>a^b,0)).join('');
}
export function decodeSecded(code) {
  const bits=String(code).replace(/[^01]/g,'').slice(0,8).padEnd(8,'0').split('').map(Number);
  const base=decodeHamming74(bits.slice(0,7).join(''));
  const overall=bits.reduce((a,b)=>a^b,0);
  let status='No error detected', corrected=bits.slice();
  if(base.syndrome && overall){ corrected[base.syndrome-1]^=1; status='Single-bit error corrected'; }
  else if(!base.syndrome && overall){ corrected[7]^=1; status='Overall parity-bit error corrected'; }
  else if(base.syndrome && !overall){ status='Double-bit error detected (not corrected)'; }
  return {status, syndrome:base.syndrome, data:[corrected[2],corrected[4],corrected[5],corrected[6]].join(''), corrected:corrected.join('')};
}
