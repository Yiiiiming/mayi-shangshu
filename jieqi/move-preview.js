const NS='http://www.w3.org/2000/svg';
const NAMES={r:{R:'车',N:'马',B:'相',A:'仕',K:'帅',C:'炮',P:'兵'},b:{R:'车',N:'马',B:'象',A:'士',K:'将',C:'炮',P:'卒'}};
let serial=0;
const valid=(board,move)=>Array.isArray(board)&&Number.isInteger(move?.from)&&Number.isInteger(move?.to)&&move.from>=0&&move.from<90&&move.to>=0&&move.to<90&&move.from!==move.to&&!!board[move.from];

// Skip only this victim's SVG while previewing; leave the board model intact.
export function previewHiddenSquare(board,move){
  return valid(board,move)&&board[move.to]?move.to:null;
}

/** Draw one selected first move. Remove `group` (or rerender) to clear it.
 * Call before the real-piece loop and skip `hiddenSquare` in that loop.
 * Covered pieces never read identity or original role, even for a label.
 */
export function drawMovePreview({parent,board,move,xy}){
  if(!parent?.ownerDocument||!valid(board,move)||typeof xy!=='function')return null;
  const a=xy(move.from),z=xy(move.to);
  if(!a||!z||![a.x,a.y,z.x,z.y].every(Number.isFinite))return null;
  const dx=z.x-a.x,dy=z.y-a.y,length=Math.hypot(dx,dy);
  if(!length)return null;
  const make=(tag,attrs,container,text)=>{
    const element=parent.ownerDocument.createElementNS(NS,tag);
    for(const[key,value]of Object.entries(attrs))element.setAttribute(key,String(value));
    if(text!==undefined)element.textContent=text;
    container.append(element);return element;
  };
  const group=make('g',{class:'move-preview','pointer-events':'none','aria-hidden':'true',focusable:'false'},parent);
  const id=`jieqi-preview-${++serial}`,defs=make('defs',{},group);
  const marker=make('marker',{id:id+'-arrow',markerUnits:'userSpaceOnUse',markerWidth:10,markerHeight:10,viewBox:'0 0 10 10',refX:10,refY:5,orient:'auto',overflow:'visible'},defs);
  make('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#167c73'},marker);
  // Let short arrows enter the translucent destination so one-step moves stay readable.
  const startInset=Math.min(28,length*.35),endInset=Math.min(14,length*.2),ux=dx/length,uy=dy/length;

  const piece=board[move.from],covered=!!piece.covered,red=piece.side==='r';
  const gradient=make('radialGradient',{id:id+'-fill',cx:'.35',cy:'.25',r:'.8'},defs);
  make('stop',{offset:'0%','stop-color':covered?'#514536':'#fff3d5'},gradient);
  make('stop',{offset:'100%','stop-color':covered?'#29231e':'#d4ad73'},gradient);
  const ghost=make('g',{class:'preview-ghost',transform:`translate(${z.x} ${z.y})`,opacity:.52},group);
  make('circle',{r:26,fill:`url(#${id}-fill)`,stroke:covered?(red?'#d36b4e':'#b2a78f'):'#967346','stroke-width':1.6},ghost);
  make('circle',{r:22,fill:'none',stroke:covered?(red?'#b35740':'#8d8372'):(red?'#a33324':'#292621'),'stroke-width':1},ghost);
  if(!covered){
    const glyph=NAMES[piece.side]?.[piece.identity||piece.role];
    if(glyph)make('text',{'text-anchor':'middle',y:11,fill:red?'#9e3022':'#252421','font-size':34,'font-weight':700,'font-family':'Songti SC,STSong,SimSun,serif'},ghost,glyph);
  }
  make('line',{class:'chosen-arrow',x1:a.x+ux*startInset,y1:a.y+uy*startInset,x2:z.x-ux*endInset,y2:z.y-uy*endInset,stroke:'#167c73','stroke-width':4,'stroke-linecap':'round','marker-end':`url(#${id}-arrow)`,opacity:.95},group);
  make('circle',{cx:z.x,cy:z.y,r:29,fill:'none',stroke:'#32ae9c','stroke-width':2,'stroke-dasharray':'4 3',opacity:.95},group);
  return {group,hiddenSquare:previewHiddenSquare(board,move)};
}
