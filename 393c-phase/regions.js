'use strict';
// Topological reconstruction of KRRS (2017), Figure 1, not measured boundaries.
// Shared curves are traced once so neighboring cells meet without gaps.
const NUMERICAL_REGIONS=(()=>{
 const O=[321,1150],T=[1013,254],R=[672,899];
 const C={2:[699,1150],3:[784,1121],4:[912,1008],5:[946,858],6:[969,728]};
 const P={3:[831,890],4:[915,791],5:[935,685],6:[961,610]};
 const J={3:[760,1056],4:[903,968],5:[937,821],6:[957,688]};
 const line=(a,b)=>[a,b];
 const cubic=(a,b,c,d)=>Array.from({length:257},(_,i)=>{const t=i/256,s=1-t;return[0,1].map(k=>s*s*s*a[k]+3*s*s*t*b[k]+3*s*t*t*c[k]+t*t*t*d[k]);});
 const join=(...parts)=>parts.flatMap((p,i)=>i?p.slice(1):p);
 const rev=p=>[...p].reverse();
 const er0=cubic(O,[490,1130],[600,1000],R),er1=cubic(R,[800,750],[940,480],T),er=join(er0,er1);
 const upper=cubic(O,[560,955],[850,565],T);
 const low={2:cubic(C[2],[726,1140],[758,1133],C[3]),3:cubic(C[3],[860,1100],[897,1060],C[4]),4:cubic(C[4],[936,960],[943,910],C[5]),5:cubic(C[5],[958,805],[967,765],C[6])};
 const floor=line(O,C[2]),tail=cubic(C[6],[990,600],[1003,400],T),lower=join(floor,...Object.values(low),tail);
 const a2=join(cubic(R,[716,912],[727,947],[731,980]),cubic([731,980],[728,1058],[717,1120],C[2]));
 const left={3:cubic(P[3],[770,889],[736,962],J[3]),4:cubic(P[4],[884,790],[888,885],J[4]),5:cubic(P[5],[929,682],[930,775],J[5]),6:cubic(P[6],[944,604],[951,666],J[6])};
 const foot={3:cubic(J[3],[768,1085],[776,1107],C[3]),4:cubic(J[4],[906,984],[910,999],C[4]),5:cubic(J[5],[940,835],[944,850],C[5]),6:cubic(J[6],[963,713],[967,724],C[6])};
 const right={3:cubic(P[3],[902,891],[895,1003],C[3]),4:cubic(P[4],[948,782],[940,903],C[4]),5:cubic(P[5],[950,685],[952,785],C[5]),6:cubic(P[6],[975,604],[976,686],C[6])};
 const bridge={2:cubic(C[2],[729,1126],[750,1099],J[3]),3:cubic(C[3],[866,1098],[896,1059],J[4]),4:cubic(C[4],[936,931],[940,882],J[5]),5:cubic(C[5],[959,791],[959,733],J[6])};
 const top={3:cubic(P[3],[899,680],[973,430],T),4:cubic(P[4],[946,609],[983,404],T),5:cubic(P[5],[964,547],[995,375],T),6:cubic(P[6],[986,493],[1000,350],T)};
 const interp=(pts,x)=>{for(let i=1;i<pts.length;i++){if(x<=pts[i][0]){const a=pts[i-1],b=pts[i],u=(x-a[0])/(b[0]-a[0]||1);return a[1]+u*(b[1]-a[1]);}}return pts[pts.length-1][1];};
 const anchors=[[321,0],[699,.5],[784,2/3],[912,.75],[946,.8],[969,5/6],[1013,1]];
 const warp=([x,y])=>{const e=Math.max(0,Math.min(1,interp(anchors,x))),yl=interp(lower,x),yr=interp(er,x),yu=interp(upper,x);let q=y>=yr?(yl-y)/(yl-yr||1):1+(yr-y)/(yr-yu||1);return[e,Math.max(0,Math.min(2,q))];};
 const cells=[];
 const add=(id,phase,n,label,polygon,color)=>{const points=[];polygon.forEach((p,i)=>{if(p[0]===T[0]||p[0]===O[0]){const neighbors=[polygon[i-1],polygon[i+1]].filter(q=>q&&q[0]!==p[0]);for(const q of neighbors)points.push([p[0]===T[0]?.99999:.00001,warp(q)[1]]);}else points.push(warp(p));});cells.push({id,phase,n,label,color,points});};
 add('a2','A2',2,'A(2,0)',join(er0,a2,rev(floor)),'#cbb78d');
 for(let n=3;n<=6;n++)add('a'+n,'A',n,`A(${n},0)`,join(left[n],foot[n],rev(right[n])),['#d7c7a4','#c0a46e','#e3d6b8','#af935b'][n-3]);
 add('b1','B1',1,'B(1,1)',join(rev(er1),a2,bridge[2],rev(left[3]),top[3]),'#9db7a5');
 for(let n=2;n<=4;n++)add('b'+n,'B',n,`B(${n},1)`,join(rev(top[n+1]),right[n+1],bridge[n+1],rev(left[n+2]),top[n+2]),['#b5c9ba','#7d9d8b','#c5d6c8'][n-2]);
 for(let n=1;n<=4;n++)add('c'+n,'C',n,`C(${n},2)`,join(bridge[n+1],foot[n+2],rev(low[n+1])),['#a3bac7','#829fae','#bdcdd6','#6e8e9e'][n-1]);
 add('f','F',1,'F(1,1)',join(upper,rev(er)),'#c7b6bd');
 return cells;
})();
