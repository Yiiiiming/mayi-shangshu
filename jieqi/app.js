import {createJieqiClient} from './jieqi-client.js';
import {mateLabel,mateTone} from './mate-label.js';

const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const names={r:{R:'车',N:'马',B:'相',A:'仕',K:'帅',C:'炮',P:'兵'},b:{R:'车',N:'马',B:'象',A:'士',K:'将',C:'炮',P:'卒'}};
const client=createJieqiClient();
let state=null,gameId=null,candidates=[],active=-1,selected=null,flipped=false,overlay=true,running=false,busy=false,paused=false,request=0,controller=null,pendingMove=null,ready=false;
let settings={timeMs:10000,threads:Math.min(2,navigator.hardwareConcurrency||2),hash:128};
const coord=i=>String.fromCharCode(97+i%9)+(9-Math.floor(i/9));
const pct=n=>(n/10).toFixed(1),compact=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(n||0);
const same=(a,b)=>a&&b&&a.from===b.from&&a.to===b.to;
const isRecord=()=>state?.mode==='record';
const ourTurn=()=>state?.side===state?.humanSide;
const pieceName=p=>p?(names[p.side]?.[p.identity||p.role]||'?'):'?';
function notation(board,m){const p=board[m.from];if(!p)return coord(m.from)+' → '+coord(m.to);const file=i=>p.side==='r'?'九八七六五四三二一'[i%9]:String(i%9+1);const r0=Math.floor(m.from/9),r1=Math.floor(m.to/9);const direction=r0===r1?'平':((r1-r0)*(p.side==='r'?-1:1)>0?'进':'退');const dist=Math.abs(r1-r0);const end=r0===r1||['N','B','A'].includes(p.role)?file(m.to):p.side==='r'?'零一二三四五六七八九'[dist]:String(dist);return(p.covered?'暗':'')+pieceName(p)+file(m.from)+direction+end;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function svg(tag,attrs={},text,parent=$('board')){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e;}
function xy(i){if(flipped)i=89-i;return{x:62+i%9*62,y:65+Math.floor(i/9)*62};}
function renderBoard(){
  const b=$('board');b.replaceChildren();if(!state)return;
  const defs=svg('defs'),g=svg('radialGradient',{id:'ivory',cx:'.35',cy:'.25',r:'.8'},undefined,defs);
  svg('stop',{offset:'0%','stop-color':'#fff3d5'},undefined,g);svg('stop',{offset:'100%','stop-color':'#d4ad73'},undefined,g);
  const dark=svg('radialGradient',{id:'back',cx:'.35',cy:'.25',r:'.8'},undefined,defs);svg('stop',{offset:'0%','stop-color':'#514536'},undefined,dark);svg('stop',{offset:'100%','stop-color':'#29231e'},undefined,dark);
  const marker=svg('marker',{id:'move-arrow',markerWidth:6,markerHeight:6,refX:5,refY:3,orient:'auto'},undefined,defs);svg('path',{d:'M0 0 L6 3 L0 6 Z',fill:'#167c73'},undefined,marker);
  for(let r=0;r<10;r++)svg('line',{x1:62,y1:65+r*62,x2:558,y2:65+r*62,class:'board-line'});
  for(let c=0;c<9;c++){const x=62+c*62;for(const[a,z]of c===0||c===8?[[65,623]]:[[65,313],[375,623]])svg('line',{x1:x,y1:a,x2:x,y2:z,class:'board-line'});}
  for(const y of[65,499]){svg('path',{d:`M248 ${y} L372 ${y+124} M372 ${y} L248 ${y+124}`,class:'board-line',fill:'none'});}
  svg('rect',{x:56,y:59,width:508,height:570,fill:'none',stroke:'#604329','stroke-width':2});
  svg('text',{x:185,y:352,'text-anchor':'middle',class:'river'},'楚 河');svg('text',{x:435,y:352,'text-anchor':'middle',class:'river'},'汉 界');
  for(let c=0;c<9;c++){svg('text',{x:62+c*62,y:34,'text-anchor':'middle',class:'coordinate'},flipped?'九八七六五四三二一'[c]:String(c+1));svg('text',{x:62+c*62,y:658,'text-anchor':'middle',class:'coordinate'},flipped?String(c+1):'九八七六五四三二一'[c]);}
  for(const i of[19,25,27,29,31,33,35,54,56,58,60,62,64,70]){const{x,y}=xy(i);for(const dx of[-1,1])for(const dy of[-1,1]){if(i%9===0&&dx<0||i%9===8&&dx>0)continue;svg('path',{d:`M${x+dx*6} ${y+dy*13} L${x+dx*6} ${y+dy*6} L${x+dx*13} ${y+dy*6}`,class:'board-line',fill:'none'});}}
  if(state.lastMove)for(const i of[state.lastMove.from,state.lastMove.to]){const{x,y}=xy(i);svg('rect',{x:x-28,y:y-28,width:56,height:56,rx:3,fill:'#fce7ab33',stroke:'#ffedb3','stroke-width':2});}
  for(let i=0;i<90;i++){const{x,y}=xy(i);const target=svg('rect',{x:x-30,y:y-30,width:60,height:60,fill:'transparent','data-square':i,class:'cell-target','aria-label':'落点 '+coord(i)});target.addEventListener('click',()=>cell(i));}
  if(selected!==null)for(const m of state.legalMoves.filter(x=>x.from===selected)){const{x,y}=xy(m.to);svg('circle',{cx:x,cy:y,r:state.board[m.to]?29:7,fill:state.board[m.to]?'none':'#167c73',stroke:state.board[m.to]?'#167c73':'none','stroke-width':3,'pointer-events':'none'});}
  // Exactly one explicitly selected first move, painted beneath the pieces.
  if(active>=0&&candidates[active]&&selected===null){const c=candidates[active],a=xy(c.move.from),z=xy(c.move.to),dx=z.x-a.x,dy=z.y-a.y,len=Math.hypot(dx,dy);if(len)svg('line',{x1:a.x+dx/len*29,y1:a.y+dy/len*29,x2:z.x-dx/len*31,y2:z.y-dy/len*31,stroke:'#167c73','stroke-width':4,'marker-end':'url(#move-arrow)',class:'chosen-arrow','pointer-events':'none'});}
  for(let i=0;i<90;i++){
    const p=state.board[i];if(!p)continue;const{x,y}=xy(i),red=p.side==='r';
    const e=svg('g',{transform:`translate(${x} ${y})`,class:`piece ${red?'red':'black'} ${p.covered?'covered':''} ${selected===i?'selected':''}`,role:'button',tabindex:0,'data-piece':i,'aria-label':`${red?'红':'黑'}${p.covered?'暗子 '+pieceName(p)+'位':pieceName(p)} ${coord(i)}`});
    svg('circle',{r:26,fill:p.covered?'url(#back)':'url(#ivory)',stroke:p.covered?(red?'#d36b4e':'#b2a78f'):'#967346','stroke-width':1.6,class:'piece-body'},undefined,e);
    svg('circle',{r:22,fill:'none',stroke:p.covered?(red?'#b35740':'#8d8372'):(red?'#a33324':'#292621'),'stroke-width':1,class:'inner-ring'},undefined,e);
    if(selected===i)svg('circle',{r:29,fill:'none',stroke:'#1fa58e','stroke-width':3},undefined,e);
    if(p.role==='K'&&state.status.reason==='check'&&p.side===state.side)svg('circle',{r:29,fill:'none',stroke:'#a92c1c','stroke-width':3,class:'check-ring'},undefined,e);
    if(p.covered){svg('text',{'text-anchor':'middle',y:4,fill:red?'#e2a487':'#c8c0ae','font-size':24,'font-family':'Songti SC,SimSun,serif','pointer-events':'none',class:'piece-label'},'暗',e);svg('text',{'text-anchor':'middle',y:17,fill:'#e0c7a0','font-size':8,'pointer-events':'none',class:'piece-role'},pieceName(p)+'位',e);}
    else svg('text',{'text-anchor':'middle',y:11,fill:red?'#9e3022':'#252421','font-size':34,'font-weight':700,'font-family':'Songti SC,STSong,SimSun,Noto Serif CJK SC,serif','pointer-events':'none',class:'piece-label'},pieceName(p),e);
    e.addEventListener('click',()=>cell(i));e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();cell(i);}});
  }
  // A fixed badge in the gap between intersections; never cover a glyph.
  if(overlay){const groups=new Map();candidates.forEach((c,i)=>{if(!groups.has(c.move.to))groups.set(c.move.to,[]);groups.get(c.move.to).push(i);});for(const[to,indices]of groups){const{x,y}=xy(to),index=indices.includes(active)?active:indices[0],e=svg('g',{transform:`translate(${x+27} ${y+27})`,class:'candidate-rank','pointer-events':'none'});svg('title',{},'候选 '+indices.map(i=>i+1).join('、'),e);svg('circle',{r:9,fill:index===0?'#176e62':'#695436',stroke:'#eed5aa','stroke-width':1},undefined,e);svg('text',{y:3.5,'text-anchor':'middle','font-size':10,fill:'#fff8e9','font-family':'system-ui,sans-serif'},String(index+1),e);}}

}
function renderButtons(){
  const over=!state||state.status.over,canMove=state&&!over&&!busy&&(isRecord()||ourTurn());
  $('undo').disabled=busy||!state?.canUndo;$('new-game').disabled=busy;$('game-mode').disabled=busy;
  $('analyze').disabled=busy||over||running||(isRecord()&&!ourTurn());$('stop').disabled=!running;
  $('help-move').disabled=!canMove||!ourTurn()||!candidates.length;$('play-candidate').disabled=!canMove||active<0||!candidates[active];
  $('analyze').textContent=!isRecord()&&!ourTurn()?'继续 AI 行棋':'分析';
  $('help-move').textContent=isRecord()?'录入首选':'代走';$('play-candidate').textContent=isRecord()?'录入这一步':'走这一步';
}
function renderStatus(){if(!state)return;
  const me=state.humanSide==='r'?'红':'黑',turn=state.side==='r'?'红':'黑',status=state.status;
  $('turn-label').textContent=status.over?(status.winner?(status.winner==='r'?'红':'黑')+'方获胜':'棋局结束'):`${turn}方行棋${status.reason==='check'?' · 将军':''}`;
  $('move-count').textContent=`第 ${state.ply+1} 手`;$('human-side').value=state.humanSide;$('game-mode').value=isRecord()?'record':'ai';
  $('black-role').textContent=state.humanSide==='b'?'你':isRecord()?'对手':'AI';$('red-role').textContent=state.humanSide==='r'?'你':isRecord()?'对手':'AI';
  $('perspective-note').textContent=isRecord()?`我执${me} · 录入双方走法，只填写你知道的身份。`:'AI 按自己掌握的信息计算，双方暗吃信息独立。';
  $('board-hint').textContent=status.over?'棋局已结束，可撤回或开新局。':isRecord()?`${turn}方走了哪一步？点击棋子，再点落点。暗子移动后填写揭子结果。`:ourTurn()?'轮到你：点击己方棋子，再点击落点。':'AI 思考中；暂停后可点“继续 AI 行棋”。';
  const best=candidates[0],wdl=best?.wdl;
  $('wdl-perspective').textContent=`我执${me}`;
  $('wdl-caption').textContent=wdl?`胜 ${pct(wdl[0])}% · 和 ${pct(wdl[1])}% · 负 ${pct(wdl[2])}%`:ourTurn()?'—':'对方行棋';
  const segments=$('wdl-bar').children;[wdl?.[2]||0,wdl?.[1]??1000,wdl?.[0]||0].forEach((n,i)=>{segments[i].style.width=pct(n)+'%';segments[i].textContent='';});
  const mate=mateLabel(best?.mate);$('mate-alert').hidden=!mate;$('mate-alert').textContent=mate?mate:'';$('mate-alert').className='mate-alert '+mateTone(best?.mate);
  renderButtons();
}
function renderCandidates(){
  const target=$('candidates');target.replaceChildren();
  if(!candidates.length){const e=document.createElement('div');e.className='empty';e.textContent=state?.status.over?'棋局结束':!ourTurn()?(isRecord()?'对方行棋':'AI 思考中…'):running?'计算中…':'—';target.append(e);}
  candidates.forEach((c,i)=>{
    const row=document.createElement('button');row.type='button';row.className='candidate-row'+(i===active?' active':'');row.setAttribute('aria-pressed',String(i===active));row.setAttribute('aria-label',`候选 ${i+1} ${notation(state.board,c.move)}，胜率 ${pct(c.wdl[0])}%，和率 ${pct(c.wdl[1])}%${mateLabel(c.mate)?'，'+mateLabel(c.mate):''}`);
    const span=(className,text,parent=row)=>{const e=document.createElement('span');e.className=className;e.textContent=text;parent.append(e);return e;};
    span('rank',String(i+1));const move=span('move-name',notation(state.board,c.move));span('move-meta',coord(c.move.from)+' → '+coord(c.move.to),move);if(mateLabel(c.mate))span('mate-badge '+mateTone(c.mate),mateLabel(c.mate),move);
    span('win-value',pct(c.wdl[0])+'%');span('draw-value',pct(c.wdl[1])+'%');span('depth-value',String(c.depth));
    row.addEventListener('click',()=>{active=active===i?-1:i;selected=null;renderBoard();renderCandidates();renderVariation();renderButtons();});target.append(row);
  });
}
function renderVariation(){const c=candidates[active];$('variation').hidden=!c;$('variation-depth').textContent=c?(mateLabel(c.mate)||'深度 '+c.depth):'—';if(!c){$('variation-line').textContent='—';return;}
  const board=state.board.map(p=>p?{...p}:null),line=[];let unknown=false;
  for(const m of c.pv||[]){if(!board[m.from])break;line.push(notation(board,m));if(board[m.from].covered||board[m.to]?.covered){unknown=true;break;}board[m.to]=board[m.from];board[m.from]=null;}
  $('variation-line').textContent=line.join(' → ')+(unknown?' · 待揭子':'');
}
function renderHistory(){
  $('history-count').textContent=state.history.length+' 手';const h=$('history');h.replaceChildren();
  if(!state.history.length){h.textContent='—';}
  for(const item of state.history){const e=document.createElement('div');e.className='history-entry';let label=`${item.ply}. ${item.side==='r'?'红':'黑'} ${item.notation||coord(item.from)+' → '+coord(item.to)}`;if(item.revealed)label+=' · 揭'+names[item.side][item.revealed];if(item.captured)label+=' · 吃'+(item.captured.identity?names[item.captured.side][item.captured.identity]:'暗子（未知）');e.textContent=label;h.append(e);}
  const captureText=list=>list?.length?list.map(p=>p.identity?names[p.side][p.identity]:'暗子·未知').join('  '):'暂无';
  $('human-captures').textContent=captureText(state.captured.byHuman);$('ai-captures').textContent=captureText(state.captured.byAI);
}
function renderAll(){renderBoard();renderStatus();renderCandidates();renderVariation();renderHistory();}
function accept(packet){gameId=packet.gameId||gameId;state=packet.state;candidates=[];active=-1;selected=null;renderAll();}
async function cancel(){const id=++request;controller?.abort();controller=null;running=false;renderButtons();if(state){const packet=await client.stop();if(id===request&&packet.gameId===gameId&&packet.state?.revision!==state.revision)accept(packet);}return id;}
function onInfo(event,id){if(id!==request||event.type==='done')return;if(event.depth){$('depth').textContent=String(event.depth);$('nodes').textContent=compact(event.nodes);$('nps').textContent=compact(event.nps)+'/s';}if(event.candidates?.length){const picked=candidates[active]?.uci;candidates=event.candidates;active=picked?candidates.findIndex(c=>c.uci===picked):-1;renderBoard();renderCandidates();renderVariation();renderStatus();}}
async function analyze(){
  if(!state||busy||state.status.over||isRecord()&&!ourTurn())return;
  let id;try{const cancelled=await cancel();if(cancelled!==request||busy||!state||state.status.over||isRecord()&&!ourTurn())return;id=++request;controller=new AbortController();running=true;paused=false;$('search-status').textContent='计算中';renderStatus();renderCandidates();
    const options={revision:state.revision,...settings};const event=await (!ourTurn()?client.ai(options,e=>onInfo(e,id),{signal:controller.signal}):client.analyze(options,e=>onInfo(e,id),{signal:controller.signal}));
    if(id!==request)return;running=false;controller=null;
    if(event.played){accept(event);$('search-status').textContent='AI 已落子';void analyze();return;}
    if(event.candidates?.length){candidates=event.candidates;active=-1;}
    $('search-status').textContent=event.cancelled?'已暂停':'分析完成';renderAll();
  }catch(error){if(id!==undefined&&id!==request||error.name==='AbortError')return;running=false;controller=null;$('search-status').textContent='分析未完成';toast(error.message);renderButtons();}
}
async function afterMove(packet){accept(packet);$('depth').textContent='—';$('nodes').textContent='—';$('nps').textContent='—';if(state.status.over){$('search-status').textContent='棋局结束';return;}if(isRecord()&&!ourTurn()){$('search-status').textContent='等待录入';return;}void analyze();}
async function cell(i){if(!state||busy||state.status.over)return;if(!isRecord()&&!ourTurn()){toast('轮到 AI 行棋，可暂停计算或悔棋。');return;}const p=state.board[i];if(p?.side===state.side){selected=selected===i?null:i;active=-1;renderBoard();renderCandidates();renderVariation();return;}if(selected!==null){const m=state.legalMoves.find(x=>x.from===selected&&x.to===i);if(m){void chooseMove(m);return;}}selected=null;renderBoard();}
async function chooseMove(m){if(busy||!state||( !isRecord()&&!ourTurn())||!state.legalMoves.some(x=>same(x,m)))return;const revision=state.revision,originalGame=gameId;busy=true;try{await cancel();if(gameId!==originalGame||state.revision!==revision||!state.legalMoves.some(x=>same(x,m)))return;if(isRecord()){pendingMove={...m,revision:state.revision};const moving=state.board[m.from],victim=state.board[m.to];$('record-summary').textContent=`${state.side==='r'?'红':'黑'}方 ${notation(state.board,m)}（${coord(m.from)} → ${coord(m.to)}）`;
    $('reveal-field').hidden=!moving.covered;$('capture-field').hidden=!(victim?.covered&&ourTurn());$('record-unknown-note').hidden=!(victim?.covered&&!ourTurn());$('record-revealed').value='';$('record-captured').value='';$('record-error').textContent='';$('record-dialog').showModal();
    if(!moving.covered&&!victim?.covered){$('record-summary').textContent+=victim?' · 吃'+pieceName(victim):' · 未吃子';}return;
  }
  renderButtons();const packet=await client.move(m,state.revision);busy=false;await afterMove(packet);}catch(error){toast(error.message);}finally{busy=false;renderButtons();}
}
async function confirmRecord(){if(!pendingMove||busy)return;const observations={};if(!$('reveal-field').hidden){if(!$('record-revealed').value){$('record-error').textContent='请选择这枚暗子揭开后的身份。';return;}observations.revealed=$('record-revealed').value;}if(!$('capture-field').hidden){if(!$('record-captured').value){$('record-error').textContent='请选择你吃掉的暗子身份。';return;}observations.captured=$('record-captured').value;}
  busy=true;$('record-confirm').disabled=true;try{const packet=await client.record({from:pendingMove.from,to:pendingMove.to},observations,pendingMove.revision);pendingMove=null;$('record-dialog').close();busy=false;await afterMove(packet);}catch(error){$('record-error').textContent=error.message;}finally{busy=false;$('record-confirm').disabled=false;renderButtons();}
}
async function newGame(mode,humanSide){busy=true;try{await cancel();const packet=await client.create({mode,humanSide});settings={...settings,threads:Math.min(settings.threads,packet.limits.threads.max)};$('threads').value=String(settings.threads);for(const opt of $('threads').options)opt.disabled=Number(opt.value)>packet.limits.threads.max;flipped=humanSide==='b';paused=false;busy=false;accept(packet);void analyze();}catch(error){toast(error.message);$('connection').textContent='未能创建棋局';}finally{busy=false;renderButtons();}}
function openNew(mode=state?.mode||'record'){$('new-mode').value=mode;$('new-side').value=state?.humanSide||'r';$('new-dialog').showModal();}
function engineStatus(e){const s=e.detail;$('connection').textContent=s.phase==='ready'?'就绪':s.phase==='error'?'加载失败':'加载中';$('connection-light').className=s.phase==='ready'?'online':'';$('engine-loading-message').textContent=s.phase==='error'?s.message:s.total?Math.round((s.loaded||0)/s.total*100)+'%':'';$('engine-loading').classList.toggle('error',s.phase==='error');if(s.total){$('engine-download').max=s.total;$('engine-download').value=s.loaded||0;}if(s.phase==='ready'){ready=true;$('engine-loading').hidden=true;}else if(!ready||s.phase==='error')$('engine-loading').hidden=false;}
window.addEventListener('engine-status',engineStatus);
$('analyze').addEventListener('click',()=>void analyze());$('stop').addEventListener('click',async()=>{paused=true;try{await cancel();$('search-status').textContent='已暂停';renderAll();}catch(error){toast(error.message);}});
$('flip').addEventListener('click',()=>{flipped=!flipped;renderBoard();});$('overlay-toggle').addEventListener('click',()=>{overlay=!overlay;$('overlay-toggle').textContent=overlay?'隐藏编号':'显示编号';$('overlay-toggle').setAttribute('aria-pressed',String(overlay));renderBoard();});
$('help-move').addEventListener('click',()=>{if(candidates[0])void chooseMove(candidates[0].move);});$('play-candidate').addEventListener('click',()=>{if(candidates[active])void chooseMove(candidates[active].move);});
$('undo').addEventListener('click',async()=>{if(busy)return;busy=true;try{await cancel();const packet=await client.undo(state.revision);busy=false;await afterMove(packet);}catch(error){toast(error.message);}finally{busy=false;renderButtons();}});
$('new-game').addEventListener('click',()=>openNew());$('game-mode').addEventListener('change',()=>{const mode=$('game-mode').value;$('game-mode').value=state?.mode||'record';openNew(mode);});$('cancel-new').addEventListener('click',()=>$('new-dialog').close());$('confirm-new').addEventListener('click',()=>{const mode=$('new-mode').value,side=$('new-side').value;$('new-dialog').close();void newGame(mode,side);});
$('record-confirm').addEventListener('click',()=>void confirmRecord());$('record-cancel').addEventListener('click',()=>{$('record-dialog').close();pendingMove=null;});$('record-dialog').addEventListener('cancel',()=>{pendingMove=null;});
for(const[id,key]of[['thinking-time','timeMs'],['threads','threads'],['hash','hash']])$(id).addEventListener('change',()=>{settings[key]=Number($(id).value);$('resource-caption').textContent=`${settings.threads} 线程 / ${settings.hash} MB`;if(running)toast('新的计算设置将在下一次分析时生效。');});
window.addEventListener('pagehide',()=>client.dispose(),{once:true});
void newGame(new URLSearchParams(location.search).get('mode')==='record'?'record':'ai','r');
