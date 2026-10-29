/** Xiangqi move validation and notation. AI analysis is supplied by native Pikafish. */
const RED_NAMES = {r:'车',n:'马',b:'相',a:'仕',k:'帅',c:'炮',p:'兵'};
const BLACK_NAMES = {r:'车',n:'马',b:'象',a:'士',k:'将',c:'炮',p:'卒'};
const NUM = ['','一','二','三','四','五','六','七','八','九'];
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const HORSES = [[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];
const inside = (r,c) => r>=0&&r<10&&c>=0&&c<9;
const palace = (r,c,s) => c>=3&&c<=5&&(s==='r'?r>=7:r<=2);
const crossed = (r,s) => s==='r'?r<=4:r>=5;
export const opponent = s => s==='r'?'b':'r';
export const pieceSide = p => !p?null:p===p.toUpperCase()?'r':'b';

export function initialBoard(){
  return ('rnbakabnr'+'.........'+'.c.....c.'+'p.p.p.p.p'+'.........'+'.........'+'P.P.P.P.P'+'.C.....C.'+'.........'+'RNBAKABNR').split('').map(x=>x==='.'?null:x);
}
export function applyMove(board,move){const b=board.slice();b[move.to]=b[move.from];b[move.from]=null;return b;}

function pseudoMoves(board,side,capturesOnly=false){
  const out=[];
  const add=(from,r,c)=>{if(!inside(r,c))return;const to=r*9+c,p=board[to];if(pieceSide(p)===side)return;if(!capturesOnly||p)out.push({from,to});};
  for(let from=0;from<90;from++){
    const p=board[from];if(pieceSide(p)!==side)continue;
    const t=p.toLowerCase(),r=(from/9)|0,c=from%9;
    if(t==='r'||t==='c'){
      for(const [dr,dc] of DIRS){let screen=false;
        for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc){const q=board[rr*9+cc];
          if(t==='r'){if(!q){add(from,rr,cc);}else{add(from,rr,cc);break;}}
          else if(!screen){if(q)screen=true;else add(from,rr,cc);}
          else if(q){add(from,rr,cc);break;}
        }
      }
    }else if(t==='n'){
      for(const [dr,dc,lr,lc] of HORSES)if(inside(r+lr,c+lc)&&!board[(r+lr)*9+c+lc])add(from,r+dr,c+dc);
    }else if(t==='b'){
      for(const dr of [-2,2])for(const dc of [-2,2]){const rr=r+dr,cc=c+dc;if(inside(rr,cc)&&(side==='r'?rr>=5:rr<=4)&&!board[(r+dr/2)*9+c+dc/2])add(from,rr,cc);}
    }else if(t==='a'){
      for(const dr of [-1,1])for(const dc of [-1,1])if(palace(r+dr,c+dc,side))add(from,r+dr,c+dc);
    }else if(t==='k'){
      for(const [dr,dc] of DIRS)if(palace(r+dr,c+dc,side))add(from,r+dr,c+dc);
      const dr=side==='r'?-1:1;
      for(let rr=r+dr;rr>=0&&rr<10;rr+=dr){const q=board[rr*9+c];if(q){if(q.toLowerCase()==='k'&&pieceSide(q)!==side)add(from,rr,c);break;}}
    }else if(t==='p'){
      add(from,r+(side==='r'?-1:1),c);
      if(crossed(r,side)){add(from,r,c-1);add(from,r,c+1);}
    }
  }
  return out;
}

/** Direct attack check, including flying generals and horse-leg/cannon screens. */
export function inCheck(board,side){
  const king=side==='r'?'K':'k',k=board.indexOf(king);if(k<0)return true;
  const r=(k/9)|0,c=k%9,enemy=opponent(side);
  for(const [dr,dc] of DIRS){let screen=false,steps=0;
    for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc){steps++;const q=board[rr*9+cc];if(!q)continue;
      if(!screen){if(pieceSide(q)===enemy){const t=q.toLowerCase();if(t==='r')return true;if(t==='k'&&(dc===0||steps===1))return true;}screen=true;}
      else{if(pieceSide(q)===enemy&&q.toLowerCase()==='c')return true;break;}
    }
  }
  // Reverse each horse's destination displacement to find the attacking horse.
  for(const [dr,dc,lr,lc] of HORSES){const rr=r-dr,cc=c-dc;if(!inside(rr,cc))continue;const q=board[rr*9+cc];if(pieceSide(q)===enemy&&q.toLowerCase()==='n'&&!board[(rr+lr)*9+cc+lc])return true;}
  const pawnRow=r+(enemy==='r'?1:-1);
  if(inside(pawnRow,c)){const q=board[pawnRow*9+c];if(pieceSide(q)===enemy&&q.toLowerCase()==='p')return true;}
  if(crossed(r,enemy))for(const dc of [-1,1])if(inside(r,c+dc)){const q=board[r*9+c+dc];if(pieceSide(q)===enemy&&q.toLowerCase()==='p')return true;}
  // These cases also support custom positions used for engine verification.
  for(const dr of [-1,1])for(const dc of [-1,1])if(inside(r+dr,c+dc)){
    const q=board[(r+dr)*9+c+dc];if(pieceSide(q)===enemy&&q.toLowerCase()==='a'&&palace(r,c,enemy))return true;
  }
  for(const dr of [-2,2])for(const dc of [-2,2])if(inside(r+dr,c+dc)){
    const q=board[(r+dr)*9+c+dc];if(pieceSide(q)===enemy&&q.toLowerCase()==='b'&&(enemy==='r'?r>=5:r<=4)&&!board[(r+dr/2)*9+c+dc/2])return true;
  }
  return false;
}
function legalMutable(board,side,capturesOnly=false){
  if(board.indexOf(side==='r'?'K':'k')<0)return [];
  const result=[];
  for(const m of pseudoMoves(board,side,capturesOnly)){const p=board[m.from],q=board[m.to];board[m.to]=p;board[m.from]=null;const ok=!inCheck(board,side);board[m.from]=p;board[m.to]=q;if(ok)result.push(m);}
  return result;
}
function hasAnyLegal(board,side){
  for(const m of pseudoMoves(board,side)){const p=board[m.from],q=board[m.to];board[m.from]=null;board[m.to]=p;const safe=!inCheck(board,side);board[m.from]=p;board[m.to]=q;if(safe)return true;}
  return false;
}
export function legalMoves(board,side){return legalMutable(board.slice(),side);}
export function gameStatus(board,side){
  if(!board.includes('K'))return {over:true,winner:'b',reason:'king-captured'};
  if(!board.includes('k'))return {over:true,winner:'r',reason:'king-captured'};
  const check=inCheck(board,side);
  if(!legalMutable(board.slice(),side).length)return {over:true,winner:opponent(side),reason:check?'checkmate':'stalemate'};
  return {over:false,winner:null,reason:check?'check':'playing'};
}

export function formatMove(board,move){
  const p=board[move.from];if(!p)return `${move.from}→${move.to}`;
  const s=pieceSide(p),t=p.toLowerCase(),r=(move.from/9)|0,c=move.from%9,rr=(move.to/9)|0,cc=move.to%9;
  const n=x=>s==='r'?NUM[x]:String(x),file=x=>s==='r'?9-x:x+1;
  const name=(s==='r'?RED_NAMES:BLACK_NAMES)[t];
  const sameFile=[];for(let i=c;i<90;i+=9)if(board[i]===p)sameFile.push(i);
  let prefix=name+n(file(c));
  if(sameFile.length===2){sameFile.sort((a,b)=>s==='r'?a-b:b-a);prefix=(move.from===sameFile[0]?'前':'后')+name;}
  else if(sameFile.length>2){sameFile.sort((a,b)=>s==='r'?a-b:b-a);const ix=sameFile.indexOf(move.from);prefix=(ix===0?'前':ix===sameFile.length-1?'后':sameFile.length===3?'中':n(ix+1))+name;}
  if(r===rr)return prefix+'平'+n(file(cc));
  const action=(s==='r'?rr<r:rr>r)?'进':'退';
  return prefix+action+n(['n','b','a'].includes(t)?file(cc):Math.abs(rr-r));
}

