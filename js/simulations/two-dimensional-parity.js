/** Two-dimensional even parity helpers. */
export function encode2DParity(rows) {
  const matrix=rows.map(r=>String(r).replace(/[^01]/g,'').split('').map(Number)).filter(r=>r.length);
  const width=Math.max(1,...matrix.map(r=>r.length));
  matrix.forEach(r=>{while(r.length<width)r.push(0);});
  const rowParity=matrix.map(r=>r.reduce((a,b)=>a^b,0));
  const colParity=Array.from({length:width},(_,c)=>matrix.reduce((a,r)=>a^r[c],0));
  return {matrix,rowParity,colParity,corner:colParity.reduce((a,b)=>a^b,0)};
}
export function locate2DError(rows) {
  const result=encode2DParity(rows);
  const badRows=result.rowParity.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const badCols=result.colParity.map((v,i)=>v?i:-1).filter(i=>i>=0);
  return {...result,badRows,badCols,location:badRows.length===1&&badCols.length===1?{row:badRows[0],column:badCols[0]}:null};
}
