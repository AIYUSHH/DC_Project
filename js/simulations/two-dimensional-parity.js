/** Two-dimensional even parity helpers with safe single-bit correction. */
export function encode2DParity(rows) {
  const matrix=rows.map(r=>String(r).trim()).filter(Boolean).map(r=>{
    if(!/^[01]+$/.test(r)) throw new Error('Each row must contain only 0s and 1s.');
    return r.split('').map(Number);
  });
  if(!matrix.length || matrix.some(r=>r.length!==matrix[0].length)) throw new Error('Enter a non-empty rectangular binary matrix.');
  const width=matrix[0].length;
  const rowParity=matrix.map(r=>r.reduce((a,b)=>a^b,0));
  const colParity=Array.from({length:width},(_,c)=>matrix.reduce((a,r)=>a^r[c],0));
  return {matrix,rowParity,colParity,corner:colParity.reduce((a,b)=>a^b,0)};
}
export function locate2DError(receivedRows, referenceRows=receivedRows) {
  const reference=encode2DParity(referenceRows), received=encode2DParity(receivedRows);
  if(received.matrix.length!==reference.matrix.length || received.matrix[0].length!==reference.matrix[0].length)
    throw new Error('Received data must have the same dimensions as the original.');
  const badRows=received.matrix.map((row,i)=>row.reduce((a,b)=>a^b,0)^reference.rowParity[i]).map((v,i)=>v?i:-1).filter(i=>i>=0);
  const badCols=reference.colParity.map((p,col)=>received.matrix.reduce((a,row)=>a^row[col],0)^p).map((v,i)=>v?i:-1).filter(i=>i>=0);
  return {...reference,matrix:received.matrix,badRows,badCols,location:badRows.length===1&&badCols.length===1?{row:badRows[0],column:badCols[0]}:null};
}
export function correct2DError(receivedRows, referenceRows) {
  const result=locate2DError(receivedRows,referenceRows),matrix=result.matrix.map(r=>r.slice());
  if(!result.badRows.length&&!result.badCols.length)
    return {...result,status:'No error detected',corrected:matrix,correctedBit:null};
  if(result.location) {
    const {row,column}=result.location; matrix[row][column]^=1;
    return {...result,status:'Single-bit error corrected',corrected:matrix,correctedBit:{row,column}};
  }
  return {...result,status:'Error pattern is ambiguous; data was not changed',corrected:matrix,correctedBit:null};
}
