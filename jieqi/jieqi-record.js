/** External-game observation ledger. No hidden deal is created or inferred. */
import {createCoveredBoard,legalMoves,gameStatus,formatMove,moveUci,opponent,unknownPools,view,enginePosition} from './jieqi-game.js';

const TYPES=new Set(['R','N','B','A','C','P']);
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const copyBoard=board=>board.map(piece=>piece?{...piece}:null);
const validSide=side=>side==='r'||side==='b';

export function createRecordGame({humanSide='r'}={}){
  if(!validSide(humanSide))throw new Error('请选择执红或执黑。');
  return {mode:'record',humanSide,side:'r',revision:0,board:createCoveredBoard(),history:[],snapshots:[]};
}

export function validateRecordMove(game,move,observations={}){
  if(game.mode!=='record')throw new Error('请先切换到实战录入模式。');
  if(!move||typeof move!=='object'||Object.keys(move).some(key=>!['from','to'].includes(key))||!Number.isInteger(move.from)||!Number.isInteger(move.to)||!legalMoves(game).some(m=>m.from===move.from&&m.to===move.to))throw new Error('这不是当前局面的合法走法。');
  if(gameStatus(game).over)throw new Error('棋局已经结束。');
  if(!observations||typeof observations!=='object'||Array.isArray(observations)||Object.keys(observations).some(key=>!['revealed','captured'].includes(key)))throw new Error('只填写本手实际揭出的棋子和你暗吃到的棋子。');
  const moving=game.board[move.from],captured=game.board[move.to];
  if(moving.covered){
    if(!has(observations,'revealed')||!TYPES.has(observations.revealed))throw new Error('请填写这枚暗子实际揭出的身份。');
  }else if(has(observations,'revealed'))throw new Error('明子移动不需要再填写揭子身份。');
  const ourDarkCapture=captured?.covered&&game.side===game.humanSide;
  if(ourDarkCapture){
    if(!has(observations,'captured')||!TYPES.has(observations.captured))throw new Error('请填写你暗吃到的棋子身份。');
  }else if(has(observations,'captured')){
    if(captured?.covered)throw new Error('对方暗吃的身份只有对方知道，这里不能填写。');
    throw new Error('本手没有需要填写身份的暗吃。');
  }
  const pools=unknownPools(game,game.humanSide);
  if(moving.covered&&pools[game.side][observations.revealed]<=0)throw new Error('该方这个身份的棋子数量已用完，请检查之前的录入。');
  if(ourDarkCapture&&pools[captured.side][observations.captured]<=0)throw new Error('对方这个身份的棋子数量已用完，请检查之前的录入。');
  return {moving,captured,ourDarkCapture};
}

export function recordMove(game,move,observations={}){
  const {moving,captured,ourDarkCapture}=validateRecordMove(game,move,observations);
  const revealed=moving.covered?observations.revealed:null;
  const event={ply:game.history.length+1,side:game.side,from:move.from,to:move.to,uci:moveUci(move),role:moving.covered?moving.role:moving.identity,covered:moving.covered,revealed,notation:formatMove(game.board,move),captured:captured?{side:captured.side,role:captured.covered?captured.role:captured.identity,covered:captured.covered,identity:captured.covered?(ourDarkCapture?observations.captured:null):captured.identity}:null};
  game.snapshots.push({board:copyBoard(game.board),side:game.side});
  game.board[move.to]={...moving,identity:revealed||moving.identity,covered:false};game.board[move.from]=null;
  game.history.push(event);game.side=opponent(game.side);game.revision++;
  return view(game);
}

export function recordEnginePosition(game){
  if(game.mode!=='record')throw new Error('当前不是实战录入模式。');
  return enginePosition(game,game.humanSide);
}
