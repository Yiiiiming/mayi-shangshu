/**
 * Worker-private Jieqi referee and observer-specific information views.
 * Never serialize the game object: it contains the referee's concealed deal.
 * Movement/protocol behavior is aligned with AB-JChess v0.2d.
 */
// Rejection sampling avoids modulo bias and never puts a seed in public state.
function randomInt(max) {
  if (!Number.isInteger(max) || max < 1 || max > 0xffffffff) throw new RangeError('无效随机范围');
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}

export const INVENTORY=Object.freeze({R:2,N:2,B:2,A:2,C:2,P:5});
const TYPES=Object.keys(INVENTORY);
const ORIGINAL=('RNBAKABNR'+'.........'+'.C.....C.'+'P.P.P.P.P'+'.........'+'.........'+'P.P.P.P.P'+'.C.....C.'+'.........'+'RNBAKABNR').split('');
const NAMES={r:{R:'车',N:'马',B:'相',A:'仕',K:'帅',C:'炮',P:'兵'},b:{R:'车',N:'马',B:'象',A:'士',K:'将',C:'炮',P:'卒'}};
const NUM=['','一','二','三','四','五','六','七','八','九'];
const HORSES=[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const inside=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
const palace=(r,c,s)=>inside(r,c)&&c>=3&&c<=5&&(s==='r'?r>=7:r<=2);
const crossed=(r,s)=>s==='r'?r<=4:r>=5;
export const opponent=s=>s==='r'?'b':'r';
const pieceType=p=>p.covered?p.role:p.identity;
const copyBoard=board=>board.map(p=>p?{...p}:null);
const identityChar=(type,side)=>side==='r'?type:type.toLowerCase();
const moveEqual=(a,b)=>a&&b&&a.from===b.from&&a.to===b.to;
export const moveUci=m=>String.fromCharCode(97+m.from%9)+(9-Math.floor(m.from/9))+String.fromCharCode(97+m.to%9)+(9-Math.floor(m.to/9));

function requireSide(s){if(s!=='r'&&s!=='b')throw new TypeError('行棋方必须为 r 或 b。');}
function shuffledIdentities(){const a=TYPES.flatMap(t=>Array(INVENTORY[t]).fill(t));for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}

/** An honest unobserved board, also used for recording external games. */
export function createCoveredBoard(){
  return ORIGINAL.map((role,i)=>{if(role==='.')return null;return {side:i<45?'b':'r',role,identity:role==='K'?'K':null,covered:role!=='K'};});
}

export function createGame({humanSide='r'}={}){
  requireSide(humanSide);
  const bags={r:shuffledIdentities(),b:shuffledIdentities()};
  const board=createCoveredBoard().map(p=>p?{...p,identity:p.covered?bags[p.side].pop():'K'}:null);
  return {mode:'ai',humanSide,side:'r',revision:0,board,initialBoard:copyBoard(board),history:[],snapshots:[]};
}

function pseudoMoves(board,side){
  const result=[];
  const add=(from,r,c)=>{if(!inside(r,c))return;const to=r*9+c;if(board[to]?.side!==side)result.push({from,to});};
  for(let from=0;from<90;from++){
    const p=board[from];if(p?.side!==side)continue;
    const t=pieceType(p),r=Math.floor(from/9),c=from%9;
    if(t==='R'||t==='C'){
      for(const [dr,dc]of DIRS){let screen=false;for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc){const q=board[rr*9+cc];
        if(t==='R'){add(from,rr,cc);if(q)break;}
        else if(!screen){if(q)screen=true;else add(from,rr,cc);}else if(q){add(from,rr,cc);break;}
      }}
    }else if(t==='N'){
      for(const[dr,dc,lr,lc]of HORSES)if(inside(r+lr,c+lc)&&!board[(r+lr)*9+c+lc])add(from,r+dr,c+dc);
    }else if(t==='B'){
      // Revealed elephants may cross the river. Original dark elephant squares
      // do not admit a first move across the river, so no extra dark check is needed.
      for(const dr of[-2,2])for(const dc of[-2,2])if(inside(r+dr,c+dc)&&!board[(r+dr/2)*9+c+dc/2])add(from,r+dr,c+dc);
    }else if(t==='A'){
      for(const dr of[-1,1])for(const dc of[-1,1])if(!p.covered||palace(r+dr,c+dc,side))add(from,r+dr,c+dc);
    }else if(t==='K'){
      for(const[dr,dc]of DIRS)if(palace(r+dr,c+dc,side))add(from,r+dr,c+dc);
    }else if(t==='P'){
      add(from,r+(side==='r'?-1:1),c);if(crossed(r,side)){add(from,r,c-1);add(from,r,c+1);}
    }
  }
  return result;
}

/** Public-piece attacks: hidden identities must never influence check status. */
export function inCheck(board,side){
  requireSide(side);
  const king=board.findIndex(p=>p?.side===side&&!p.covered&&p.identity==='K');
  if(king<0)return true;
  const r=Math.floor(king/9),c=king%9,enemy=opponent(side);
  // Sliding pieces, cannon screens and the facing-general restriction.
  for(const[dr,dc]of DIRS){let screen=false,steps=0;for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc){steps++;const p=board[rr*9+cc];if(!p)continue;const t=pieceType(p);
    if(!screen){if(p.side===enemy&&(t==='R'||(t==='K'&&(dc===0||steps===1))))return true;screen=true;}
    else{if(p.side===enemy&&t==='C')return true;break;}
  }}
  for(const[dr,dc,lr,lc]of HORSES){const rr=r-dr,cc=c-dc;if(!inside(rr,cc))continue;const p=board[rr*9+cc];if(p?.side===enemy&&pieceType(p)==='N'&&!board[(rr+lr)*9+cc+lc])return true;}
  const pawnRow=r+(enemy==='r'?1:-1);if(inside(pawnRow,c)){const p=board[pawnRow*9+c];if(p?.side===enemy&&pieceType(p)==='P')return true;}
  if(crossed(r,enemy))for(const dc of[-1,1])if(inside(r,c+dc)){const p=board[r*9+c+dc];if(p?.side===enemy&&pieceType(p)==='P')return true;}
  for(const dr of[-1,1])for(const dc of[-1,1])if(inside(r+dr,c+dc)){const p=board[(r+dr)*9+c+dc];if(p?.side===enemy&&pieceType(p)==='A'&&(!p.covered||palace(r,c,enemy)))return true;}
  for(const dr of[-2,2])for(const dc of[-2,2])if(inside(r+dr,c+dc)){const p=board[(r+dr)*9+c+dc];if(p?.side===enemy&&pieceType(p)==='B'&&!board[(r+dr/2)*9+c+dc/2])return true;}
  return false;
}

export function legalMoves(game,side=game.side){
  requireSide(side);const board=game.board;
  if(!board.some(p=>p?.side==='r'&&p.identity==='K')||!board.some(p=>p?.side==='b'&&p.identity==='K'))return [];
  const result=[];
  for(const m of pseudoMoves(board,side)){
    const from=board[m.from],to=board[m.to];
    // Only occupancy of our move matters to enemy attacks on our own king.
    // Keep the mover's public role here rather than inspecting its secret identity.
    board[m.from]=null;board[m.to]=from;
    const safe=!inCheck(board,side);
    board[m.from]=from;board[m.to]=to;
    if(safe)result.push(m);
  }
  return result;
}

export function gameStatus(game){
  for(const side of['r','b'])if(!game.board.some(p=>p?.side===side&&p.identity==='K'))return {over:true,winner:opponent(side),reason:'king-captured'};
  const check=inCheck(game.board,game.side);
  if(!legalMoves(game).length)return {over:true,winner:opponent(game.side),reason:check?'checkmate':'stalemate'};
  return {over:false,winner:null,reason:check?'check':'playing'};
}

/** Human-readable notation; exact UCI coordinates remain available alongside it. */
export function formatMove(board,move){
  const p=board[move.from];if(!p)return moveUci(move);
  const t=pieceType(p),r=Math.floor(move.from/9),c=move.from%9,rr=Math.floor(move.to/9),cc=move.to%9;
  const num=x=>p.side==='r'?NUM[x]:String(x),file=x=>p.side==='r'?9-x:x+1;
  const prefix=(p.covered?'暗':'')+NAMES[p.side][t]+num(file(c));
  if(r===rr)return prefix+'平'+num(file(cc));
  return prefix+((p.side==='r'?rr<r:rr>r)?'进':'退')+num(['N','B','A'].includes(t)?file(cc):Math.abs(rr-r));
}

/** actor should be explicitly set by a route to its authorized human/AI side. */
export function playMove(game,move,{actor=game.side}={}){
  if(game.mode==='record')throw new Error('实战录入需要填写实际观察到的身份。');
  requireSide(actor);if(actor!==game.side)throw new Error('当前不轮到这一方行棋。');
  if(!move||!Number.isInteger(move.from)||!Number.isInteger(move.to)||move.from<0||move.from>89||move.to<0||move.to>89)throw new Error('走法坐标无效。');
  if(gameStatus(game).over)throw new Error('棋局已经结束。');
  if(!legalMoves(game).some(m=>moveEqual(m,move)))throw new Error('这不是当前局面的合法走法。');
  const moving=game.board[move.from],captured=game.board[move.to];
  game.snapshots.push({board:copyBoard(game.board),side:game.side});
  const event={ply:game.history.length+1,side:game.side,from:move.from,to:move.to,uci:moveUci(move),role:pieceType(moving),covered:moving.covered,revealed:moving.covered?moving.identity:null,notation:formatMove(game.board,move),captured:captured?{side:captured.side,role:pieceType(captured),covered:captured.covered,identity:captured.identity}:null};
  game.board[move.to]={...moving,covered:false};game.board[move.from]=null;
  game.history.push(event);game.side=opponent(game.side);game.revision++;
  return view(game);
}

export function undo(game,plies=1){
  if(!Number.isInteger(plies)||plies<1||plies>game.history.length)throw new Error('无法后退这么多步。');
  const snapshot=game.snapshots[game.snapshots.length-plies];
  game.board=copyBoard(snapshot.board);game.side=snapshot.side;game.history.length-=plies;game.snapshots.length-=plies;game.revision++;
  return view(game);
}

function visibleCapture(event,observer){
  const p=event.captured;if(!p)return null;
  return {side:p.side,role:p.role,covered:p.covered,identity:!p.covered||event.side===observer?p.identity:null};
}
export function unknownPools(game,observer=game.humanSide){
  requireSide(observer);const pools={r:{...INVENTORY},b:{...INVENTORY}};
  for(const event of game.history){
    if(event.revealed)pools[event.side][event.revealed]--;
    if(event.captured?.covered&&event.side===observer)pools[event.captured.side][event.captured.identity]--;
  }
  return pools;
}

/** Fixed-human view only. Do not expose an observer parameter in an HTTP route. */
export function view(game){
  const observer=game.humanSide;
  const history=game.history.map(e=>({ply:e.ply,side:e.side,from:e.from,to:e.to,uci:e.uci,role:e.role,covered:e.covered,revealed:e.revealed,notation:e.notation,captured:visibleCapture(e,observer)}));
  const captured={r:[],b:[],byHuman:[],byAI:[]};
  for(const e of game.history){if(!e.captured)continue;const capture={...visibleCapture(e,observer),by:e.side,ply:e.ply};captured[e.side].push(capture);captured[e.side===observer?'byHuman':'byAI'].push({...capture});}
  const status=gameStatus(game);
  return {mode:game.mode||'ai',humanSide:observer,side:game.side,revision:game.revision,ply:game.history.length,
    board:game.board.map(p=>p?{side:p.side,covered:p.covered,role:p.covered?p.role:p.identity,identity:p.covered?null:p.identity}:null),
    legalMoves:status.over?[]:legalMoves(game),status,history,captured,unknownPools:unknownPools(game,observer),
    lastMove:history.at(-1)||null,canUndo:game.history.length>0&&(game.mode==='record'||!(game.humanSide==='b'&&game.history.length===1))};
}

export function engineMoves(game,observer=game.side){
  requireSide(observer);
  return game.history.map(e=>e.uci+(e.revealed?identityChar(e.revealed,e.side):'')+(e.captured?.covered&&e.side===observer?identityChar(e.captured.identity,e.captured.side):''));
}
export function enginePosition(game,observer=game.side){
  const moves=engineMoves(game,observer);return {moves,command:'position startpos'+(moves.length?' moves '+moves.join(' '):'')};
}
