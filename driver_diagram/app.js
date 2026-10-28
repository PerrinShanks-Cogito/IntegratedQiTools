/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $=s=>document.querySelector(s);
const KEY="dd-builder-v1";
let seq=0;
const nid=()=>"n"+Date.now().toString(36)+(seq++).toString(36);

function blank(){return {title:"Driver diagram",goal:{text:"",measure:""},drivers:[],balancing:[]};}
function D(text,kids,measure){return {id:nid(),kind:"driver",text:text,measure:measure||"",children:kids||[]};}
function P(text,measure){return {id:nid(),kind:"project",text:text,measure:measure||"",children:[]};}
function example(){
  return {
    title:"How do I decrease my fuel costs?",
    goal:{text:"Decrease fuel costs",measure:"£ spent on fuel per month, 20% lower by March 2027"},
    drivers:[
      D("Reduce fuel price per gallon",[P("Shop at a cheaper petrol station")]),
      D("Reduce miles driven",[P("Walk to work instead of driving / share a car")]),
      D("Increase efficiency (mpg)",[
        D("Increase car efficiency",[P("Buy a more fuel efficient car")]),
        D("Improve driving pattern",[
          D("Decrease use of rapid braking"),
          D("Increase use of appropriate gears"),
          D("Decrease use of rapid acceleration"),
          P("Improve driving habits, avoid unnecessarily accelerating and decelerating")
        ])
      ],"Miles per gallon")
    ],
    balancing:[{id:nid(),text:"No increase in lateness for work"}]
  };
}

/* ---------- persistence ---------- */
function load(){
  /* Work in progress is kept in sessionStorage, so it survives a refresh but is cleared when the tab
     closes and isn't left on a shared computer. Work an older version kept in localStorage moves across once. */
  try{const old=localStorage.getItem(KEY); if(old!==null){localStorage.removeItem(KEY); if(sessionStorage.getItem(KEY)===null) sessionStorage.setItem(KEY,old);}}catch(e){}
  try{const raw=sessionStorage.getItem(KEY); if(!raw) return null; return normalise(JSON.parse(raw));}catch(e){return null;}
}
let saveTimer=null;
function persist(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch(e){}},250);
}
function normalise(o){
  if(!o||typeof o!=="object") throw new Error("bad");
  const s=blank();
  s.title=String(o.title||"Driver diagram");
  s.goal={text:String((o.goal&&o.goal.text)||""),measure:String((o.goal&&o.goal.measure)||"")};
  const fix=n=>({id:nid(),kind:n&&n.kind==="project"?"project":"driver",text:String((n&&n.text)||""),measure:String((n&&n.measure)||""),
    children:(n&&n.kind!=="project"&&Array.isArray(n.children))?n.children.map(fix):[]});
  s.drivers=Array.isArray(o.drivers)?o.drivers.map(fix):[];
  s.drivers.forEach(d=>{if(d.kind==="project") d.kind="driver";});
  s.balancing=Array.isArray(o.balancing)?o.balancing.map(b=>({id:nid(),text:String((b&&b.text)||b||"")})):[];
  return s;
}

let state=load()||blank(); // start empty unless there is saved work
let selected=null;
let zoom=1, autoFit=true;

/* ---------- tree helpers ---------- */
function find(id,arr,depth,parent){
  arr=arr||state.drivers; depth=depth||1;
  for(let i=0;i<arr.length;i++){
    const n=arr[i];
    if(n.id===id) return {node:n,arr:arr,idx:i,depth:depth,parent:parent||null};
    const r=find(id,n.children,depth+1,n); if(r) return r;
  }
  return null;
}
function levelName(d){return ["","Primary driver","Secondary driver","Tertiary driver"][d]||("Level "+d+" driver");}

/* ---------- editor ---------- */
function autosize(el){el.style.height="auto";el.style.height=(el.scrollHeight+2)+"px";}

function nodeEditor(n,depth){
  const w=document.createElement("div");
  const isP=n.kind==="project";
  w.className="node "+(isP?"is-project":"lvl-"+Math.min(depth,4))+(selected===n.id?" sel":"");
  w.dataset.id=n.id;
  const kind=isP?"Project / change idea":levelName(depth);
  w.innerHTML=
    '<div class="node-head"><span class="node-kind">'+kind+'</span>'+
    '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move up">↑</button>'+
    '<button class="btn icon ghost" data-act="down" type="button" aria-label="Move down">↓</button>'+
    '<button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove '+(isP?"project":"driver")+'">✕</button></div>'+
    '<textarea class="field t" rows="1" aria-label="'+kind+' text" placeholder="'+(isP?"Change you will test":"Improve / increase / reduce …")+'"></textarea>'+
    '<input class="field measure m" type="text" aria-label="Measure for this '+(isP?"project":"driver")+'" placeholder="Measure (optional)">'+
    (isP?"":'<div class="node-actions"><button class="btn small" data-act="addD" type="button">Add '+levelName(depth+1).toLowerCase()+'</button><button class="btn small" data-act="addP" type="button">Add project</button></div>')+
    '<div class="kids"></div>';
  w.querySelector(".t").value=n.text;
  w.querySelector(".m").value=n.measure||"";
  const kids=w.querySelector(".kids");
  n.children.forEach(c=>kids.appendChild(nodeEditor(c,depth+1)));
  return w;
}
function renderTree(){
  const tree=$("#tree"); tree.innerHTML="";
  if(!state.drivers.length){
    tree.innerHTML='<div class="empty">No drivers yet. Add the factors you believe will directly move your goal.</div>';
  }
  state.drivers.forEach(n=>tree.appendChild(nodeEditor(n,1)));
  tree.querySelectorAll("textarea").forEach(autosize);
}
function renderBal(){
  const box=$("#balList"); box.innerHTML="";
  if(!state.balancing.length){box.innerHTML='<div class="empty">None yet.</div>';return;}
  state.balancing.forEach(b=>{
    const r=document.createElement("div"); r.className="bal-row"; r.dataset.id=b.id;
    r.innerHTML='<textarea class="field" rows="1" aria-label="Balancing measure" placeholder="e.g. No increase in waiting time"></textarea><button class="btn icon ghost danger" type="button" data-bdel aria-label="Remove balancing measure">✕</button>';
    r.querySelector("textarea").value=b.text; box.appendChild(r);
  });
  box.querySelectorAll("textarea").forEach(autosize);
}
function renderAll(){
  $("#title").value=state.title;
  $("#goalText").value=state.goal.text;
  $("#goalMeasure").value=state.goal.measure;
  autosize($("#goalText"));
  renderTree(); renderBal(); renderDiagram(); renderChecks();
}
function changed(){persist();renderDiagram();renderChecks();}

function focusNode(id){
  const el=document.querySelector('.node[data-id="'+id+'"] > .t');
  if(el){el.focus();el.scrollIntoView({block:"nearest"});}
}

$("#title").addEventListener("input",e=>{state.title=e.target.value;changed();});
$("#goalText").addEventListener("input",e=>{state.goal.text=e.target.value;autosize(e.target);changed();});
$("#goalMeasure").addEventListener("input",e=>{state.goal.measure=e.target.value;changed();});
$("#goalText").addEventListener("focus",()=>setSel("goal"));

$("#addPrimary").addEventListener("click",()=>{
  const n=D(""); state.drivers.push(n); renderTree(); changed(); focusNode(n.id);
});
$("#addBal").addEventListener("click",()=>{
  const b={id:nid(),text:""}; state.balancing.push(b); renderBal(); changed();
  const el=document.querySelector('.bal-row[data-id="'+b.id+'"] textarea'); if(el) el.focus();
});
$("#balList").addEventListener("input",e=>{
  const row=e.target.closest(".bal-row"); if(!row) return;
  const b=state.balancing.find(x=>x.id===row.dataset.id); if(b){b.text=e.target.value;autosize(e.target);changed();}
});
$("#balList").addEventListener("click",e=>{
  const btn=e.target.closest("[data-bdel]"); if(!btn) return;
  const id=btn.closest(".bal-row").dataset.id;
  state.balancing=state.balancing.filter(x=>x.id!==id); renderBal(); changed();
});

const tree=$("#tree");
tree.addEventListener("input",e=>{
  const w=e.target.closest(".node"); if(!w) return;
  const f=find(w.dataset.id); if(!f) return;
  if(e.target.classList.contains("t")){f.node.text=e.target.value;autosize(e.target);}
  else if(e.target.classList.contains("m")){f.node.measure=e.target.value;}
  changed();
});
tree.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||e.shiftKey||!e.target.classList.contains("t")) return;
  e.preventDefault();
  const f=find(e.target.closest(".node").dataset.id); if(!f) return;
  const n=f.node.kind==="project"?P(""):D("");
  f.arr.splice(f.idx+1,0,n); renderTree(); changed(); focusNode(n.id);
});
tree.addEventListener("focusin",e=>{
  const w=e.target.closest(".node"); if(w) setSel(w.dataset.id);
});
tree.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]"); if(!b) return;
  const f=find(b.closest(".node").dataset.id); if(!f) return;
  const act=b.dataset.act;
  let focusId=null;
  if(act==="addD"){const n=D("");f.node.children.push(n);focusId=n.id;}
  else if(act==="addP"){const n=P("");f.node.children.push(n);focusId=n.id;}
  else if(act==="up"&&f.idx>0){f.arr.splice(f.idx-1,0,f.arr.splice(f.idx,1)[0]);focusId=f.node.id;}
  else if(act==="down"&&f.idx<f.arr.length-1){f.arr.splice(f.idx+1,0,f.arr.splice(f.idx,1)[0]);focusId=f.node.id;}
  else if(act==="del"){
    const kids=countAll(f.node)-1;
    if(kids>0&&!confirm("Remove this "+(f.node.kind==="project"?"project":"driver")+" and the "+kids+" item"+(kids>1?"s":"")+" beneath it?")) return;
    f.arr.splice(f.idx,1); if(selected===f.node.id) selected=null;
  }
  renderTree(); changed();
  if(focusId){ if(act==="up"||act==="down"){const el=document.querySelector('.node[data-id="'+focusId+'"] [data-act="'+act+'"]'); if(el) el.focus();} else focusNode(focusId);}
});
function countAll(n){return 1+n.children.reduce((a,c)=>a+countAll(c),0);}

function setSel(id){
  if(selected===id) return;
  selected=id;
  document.querySelectorAll(".node.sel").forEach(x=>x.classList.remove("sel"));
  const w=document.querySelector('.node[data-id="'+id+'"]'); if(w) w.classList.add("sel");
  renderDiagram();
}

/* ---------- layout & SVG ---------- */
const FONT="Arial, Helvetica, sans-serif";
const C={m:28,goalW:230,colW:210,projW:232,gx:58,vgap:14,pgap:26,titleH:46,headH:30,pad:10};
const COL={
  goal:{fill:"#003087",stroke:"#003087",ink:"#FFFFFF",mink:"#C9DDF2"},
  l1:{fill:"#005EB8",stroke:"#005EB8",ink:"#FFFFFF",mink:"#D6E8F7"},
  l2:{fill:"#D6E8F7",stroke:"#5C93C9",ink:"#0B2545",mink:"#3E5F80"},
  l3:{fill:"#FFFFFF",stroke:"#7F9AB4",ink:"#0B2545",mink:"#4A6178"},
  project:{fill:"#FFF1B8",stroke:"#C9A227",ink:"#3D2F00",mink:"#6B5718"},
  line:"#8DA2B5", head:"#52667A", bal:"#6A4C93"
};
const mctx=document.createElement("canvas").getContext("2d");
function wrap(text,width,font){
  mctx.font=font;
  const out=[];
  String(text).split(/\n/).forEach(para=>{
    const words=para.split(/\s+/).filter(Boolean);
    if(!words.length){out.push("");return;}
    let line="";
    words.forEach(w=>{
      while(mctx.measureText(w).width>width&&w.length>1){
        let cut=w.length-1; while(cut>1&&mctx.measureText(w.slice(0,cut)+"-").width>width) cut--;
        if(line){out.push(line);line="";}
        out.push(w.slice(0,cut)+"-"); w=w.slice(cut);
      }
      const t=line?line+" "+w:w;
      if(mctx.measureText(t).width<=width) line=t; else {out.push(line);line=w;}
    });
    out.push(line);
  });
  return out;
}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

function makeBox(text,measure,w,style,placeholder){
  const big=style==="goal";
  const fs=big?16:14, lh=big?20:18, fw=(big||style==="l1")?"700":"400";
  const inner=w-2*C.pad-4;
  const empty=!String(text).trim();
  const lines=wrap(empty?placeholder:text,inner,fw+" "+fs+"px "+FONT);
  let h=2*C.pad+lines.length*lh;
  let mlines=[];
  if(measure&&measure.trim()){mlines=wrap("Measure: "+measure.trim(),inner,"italic 400 12px "+FONT);h+=6+mlines.length*15;}
  return {w:w,h:Math.max(h,40),lines:lines,mlines:mlines,fs:fs,lh:lh,fw:fw,style:style,empty:empty};
}

function layout(st,opts){
  opts=opts||{};
  let maxDepth=0, hasProj=false;
  (function scan(arr,d){arr.forEach(n=>{if(n.kind==="project") hasProj=true; else {maxDepth=Math.max(maxDepth,d); scan(n.children,d+1);}});})(st.drivers,1);
  const colX=d=>C.m+C.goalW+C.gx+(d-1)*(C.colW+C.gx);
  const projX=colX(maxDepth+1);

  function measure(n,d){
    n._d=d;
    if(n.kind==="project") n._b=makeBox(n.text,n.measure,C.projW,"project","New project");
    else n._b=makeBox(n.text,n.measure,C.colW,d===1?"l1":d===2?"l2":"l3","New driver");
    n.children.forEach(c=>measure(c,d+1));
    const kids=n.children.reduce((a,c)=>a+c._span,0)+Math.max(0,n.children.length-1)*C.vgap;
    n._kids=kids;
    n._span=Math.max(n._b.h,kids);
  }
  st.drivers.forEach(n=>measure(n,1));

  const boxes=[], edges=[];
  function place(n,top){
    const b=n._b;
    b.x=n.kind==="project"?projX:colX(n._d);
    if(n.children.length){
      let y=top+(n._span-n._kids)/2;
      n.children.forEach(c=>{place(c,y);y+=c._span+C.vgap;});
      const f=n.children[0]._b, l=n.children[n.children.length-1]._b;
      const mid=((f.y+f.h/2)+(l.y+l.h/2))/2;
      b.y=Math.min(Math.max(mid-b.h/2,top),top+n._span-b.h);
    } else b.y=top+(n._span-b.h)/2;
    boxes.push({b:b,id:n.id});
    n.children.forEach(c=>edges.push([b,c._b]));
  }
  const y0=C.m+C.titleH+C.headH;
  let y=y0;
  st.drivers.forEach(n=>{place(n,y);y+=n._span+C.pgap;});
  const driversBottom=st.drivers.length?y-C.pgap:y0;

  const goal=makeBox(st.goal.text,st.goal.measure,C.goalW,"goal","Write your goal");
  goal.x=C.m;
  if(st.drivers.length){
    const f=st.drivers[0]._b, l=st.drivers[st.drivers.length-1]._b;
    goal.y=Math.max(y0,((f.y+f.h/2)+(l.y+l.h/2))/2-goal.h/2);
  } else goal.y=y0;
  st.drivers.forEach(n=>edges.push([goal,n._b]));

  // balancing box
  let bal=null;
  const items=st.balancing.filter(b=>b.text.trim());
  if(items.length){
    const inner=C.goalW-2*C.pad-14;
    const rows=items.map(b=>wrap(b.text,inner,"400 13px "+FONT));
    const h=2*C.pad+18+rows.reduce((a,r)=>a+r.length*17+4,0);
    bal={x:C.m,w:C.goalW,h:h,rows:rows};
    bal.y=Math.max(goal.y+goal.h+40,driversBottom-h);
  }

  const right=st.drivers.length?(hasProj?projX+C.projW:colX(maxDepth)+C.colW):C.m+C.goalW;
  const W=Math.max(right+C.m,560);
  const H=Math.max(driversBottom,goal.y+goal.h,bal?bal.y+bal.h:0)+C.m;

  // build svg
  const s=[];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="'+Math.round(W*(opts.scale||1))+'" height="'+Math.round(H*(opts.scale||1))+'" font-family="'+FONT+'" role="img" aria-label="'+esc("Driver diagram: "+(st.goal.text||"untitled"))+'">');
  s.push('<rect width="'+W+'" height="'+H+'" fill="#FFFFFF"/>');
  s.push('<text x="'+C.m+'" y="'+(C.m+22)+'" font-size="20" font-weight="700" fill="#0B2545">'+esc(st.title||"")+'</text>');
  // column heads
  const hy=C.m+C.titleH+12;
  const head=(x,w,t)=>s.push('<text x="'+(x+w/2)+'" y="'+hy+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+COL.head+'">'+esc(t)+'</text>');
  head(C.m,C.goalW,"Goal");
  for(let d=1;d<=maxDepth;d++) head(colX(d),C.colW,["","Primary drivers","Secondary drivers","Tertiary drivers"][d]||("Level "+d+" drivers"));
  if(hasProj) head(projX,C.projW,"Projects / change ideas");
  // edges
  s.push('<g fill="none" stroke="'+COL.line+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">');
  edges.forEach(e=>{
    const p=e[0],c=e[1];
    const x1=p.x+p.w, y1=p.y+p.h/2, x2=c.x, y2=c.y+c.h/2, xm=x1+C.gx/2;
    const dy=y2-y1;
    if(Math.abs(dy)<1){s.push('<path d="M'+x1+' '+y1+'H'+x2+'"/>');return;}
    const r=Math.min(8,Math.abs(dy)/2), sg=dy>0?1:-1;
    s.push('<path d="M'+x1+' '+y1+'H'+(xm-r)+'Q'+xm+' '+y1+' '+xm+' '+(y1+sg*r)+'V'+(y2-sg*r)+'Q'+xm+' '+y2+' '+(xm+r)+' '+y2+'H'+x2+'"/>');
  });
  s.push('</g>');
  // boxes
  function drawBox(b,id){
    const c=COL[b.style];
    const sel=!opts.export&&id&&selected===id;
    s.push('<g class="box"'+(id?' data-id="'+id+'"':'')+'>');
    if(b.style==="project"){
      const f=12;
      s.push('<path d="M'+b.x+' '+(b.y+2)+'Q'+b.x+' '+b.y+' '+(b.x+2)+' '+b.y+'H'+(b.x+b.w-f)+'L'+(b.x+b.w)+' '+(b.y+f)+'V'+(b.y+b.h-2)+'Q'+(b.x+b.w)+' '+(b.y+b.h)+' '+(b.x+b.w-2)+' '+(b.y+b.h)+'H'+(b.x+2)+'Q'+b.x+' '+(b.y+b.h)+' '+b.x+' '+(b.y+b.h-2)+'Z" fill="'+c.fill+'" stroke="'+(sel?"#FFB81C":c.stroke)+'" stroke-width="'+(sel?3:1.4)+'"/>');
      s.push('<path d="M'+(b.x+b.w-f)+' '+b.y+'V'+(b.y+f)+'H'+(b.x+b.w)+'" fill="#F2DC85" stroke="'+c.stroke+'" stroke-width="1.2"/>');
    } else {
      s.push('<rect x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'" rx="7" fill="'+c.fill+'" stroke="'+(sel?"#FFB81C":c.stroke)+'" stroke-width="'+(sel?3:(b.style==="l3"?1.4:1.6))+'"'+(b.empty?' stroke-dasharray="5 4"':'')+'/>');
    }
    const cx=b.x+b.w/2;
    let ty=b.y+C.pad+(b.lh-b.fs)/2+b.fs*0.82;
    const ink=b.empty?(b.style==="goal"||b.style==="l1"?"#B9D2EC":"#8DA2B5"):c.ink;
    s.push('<text text-anchor="middle" font-size="'+b.fs+'" font-weight="'+b.fw+'" fill="'+ink+'"'+(b.empty?' font-style="italic"':'')+'>');
    b.lines.forEach((ln,i)=>s.push('<tspan x="'+cx+'" y="'+(ty+i*b.lh)+'">'+esc(ln)+'</tspan>'));
    s.push('</text>');
    if(b.mlines.length){
      let my=b.y+C.pad+b.lines.length*b.lh+6+11;
      s.push('<text text-anchor="middle" font-size="12" font-style="italic" fill="'+c.mink+'">');
      b.mlines.forEach((ln,i)=>s.push('<tspan x="'+cx+'" y="'+(my+i*15)+'">'+esc(ln)+'</tspan>'));
      s.push('</text>');
    }
    s.push('</g>');
  }
  drawBox(goal,"goal");
  boxes.forEach(x=>drawBox(x.b,x.id));
  if(bal){
    s.push('<g class="box" data-id="balancing"><rect x="'+bal.x+'" y="'+bal.y+'" width="'+bal.w+'" height="'+bal.h+'" rx="7" fill="#F3EEF8" stroke="'+COL.bal+'" stroke-width="1.5" stroke-dasharray="6 4"/>');
    s.push('<text x="'+(bal.x+C.pad)+'" y="'+(bal.y+C.pad+12)+'" font-size="13" font-weight="700" fill="'+COL.bal+'">Balancing measures</text>');
    let yy=bal.y+C.pad+18+15;
    bal.rows.forEach(r=>{
      s.push('<text font-size="13" fill="#2E1F45">');
      r.forEach((ln,i)=>s.push('<tspan x="'+(bal.x+C.pad+(i?14:0))+'" y="'+(yy+i*17)+'">'+(i?"":"• ")+esc(ln)+'</tspan>'));
      s.push('</text>');
      yy+=r.length*17+4;
    });
    s.push('</g>');
  }
  s.push('</svg>');
  return {svg:s.join(""),W:W,H:H};
}

function renderDiagram(){
  const wrapEl=$("#canvasWrap");
  const L=layout(state,{scale:1});
  /* Fit: in full screen the diagram is as big as the screen allows; otherwise it fits the width */
  if(autoFit){
    const aw=wrapEl.clientWidth-36, ah=wrapEl.clientHeight-36;
    if(isFull()) zoom=aw>0&&ah>0?Math.min(2,Math.max(0.3,Math.min(aw/L.W,ah/L.H))):1;
    else zoom=aw>0?Math.min(1,Math.max(0.3,aw/L.W)):1;
  }
  $("#canvas").innerHTML=layout(state,{scale:zoom}).svg;
  $("#zoomLabel").textContent=Math.round(zoom*100)+"%";
  updatePanCursor();
  if(hasContent()) trackChart({points:(function c(a){return a.reduce((n,x)=>n+1+c(x.children||[]),0);})(state.drivers)});
}
$("#canvas").addEventListener("click",e=>{
  const g=e.target.closest("g.box"); if(!g) return;
  const id=g.dataset.id;
  if(id==="goal"){$("#goalText").focus();return;}
  if(id==="balancing"){const t=document.querySelector("#balList textarea");if(t)t.focus();return;}
  activateTab("build"); focusNode(id);
});
function setZoom(z){autoFit=false;zoom=Math.min(2,Math.max(0.3,z));renderDiagram();}
$("#zoomIn").addEventListener("click",()=>setZoom(zoom+0.1));
$("#zoomOut").addEventListener("click",()=>setZoom(zoom-0.1));
$("#zoomFit").addEventListener("click",()=>{autoFit=true;renderDiagram();});
let rz; window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(autoFit)renderDiagram();else updatePanCursor();},120);});

const wrapEl=$("#canvasWrap"), canvasEl=$("#canvas");
/* ---------- move around the diagram by dragging ----------
   The diagram sits in its own window, the height of the browser window, which
   stays in view as the page scrolls. Drag anywhere in it to move the diagram
   inside it, sideways and up and down; the page itself doesn't move. A click
   without a drag still opens a box. Move (or holding Space) is the hand tool:
   a grab cursor everywhere and clicks don't select anything. Touch screens
   keep their own swipe scrolling. */
const panBtn=$("#panMode"), stageEl=wrapEl.closest(".stage"), fullBtn=$("#fullScreen");
let panMode=false, spaceDown=false, overMap=false, drag=null, dragged=false;
function handOn(){return panMode||spaceDown;}
function updatePanCursor(){
  const big=!!canvasEl.querySelector("svg")&&(wrapEl.scrollWidth>wrapEl.clientWidth||wrapEl.scrollHeight>wrapEl.clientHeight);
  wrapEl.classList.toggle("can-pan",big);
  wrapEl.classList.toggle("pan",handOn());
}
panBtn.addEventListener("click",()=>{panMode=!panMode;panBtn.setAttribute("aria-pressed",panMode);updatePanCursor();});
wrapEl.addEventListener("pointerenter",()=>{overMap=true;});
wrapEl.addEventListener("pointerleave",()=>{overMap=false;});
document.addEventListener("keydown",e=>{
  if(e.code!=="Space"||!overMap||e.repeat&&spaceDown) return;
  if(e.target.closest("input,textarea,select,button,[contenteditable]")) return;
  e.preventDefault(); if(!spaceDown){spaceDown=true;updatePanCursor();}
});
document.addEventListener("keyup",e=>{if(e.code==="Space"&&spaceDown){spaceDown=false;updatePanCursor();}});
window.addEventListener("blur",()=>{if(spaceDown){spaceDown=false;updatePanCursor();}});
wrapEl.addEventListener("pointerdown",e=>{
  if(e.pointerType==="touch"||(e.button!==0&&e.button!==1)) return;
  if(!canvasEl.querySelector("svg")||e.target.closest("button,a,input")) return;
  drag={x:e.clientX,y:e.clientY,id:e.pointerId}; dragged=false;
  e.preventDefault();
});
wrapEl.addEventListener("pointermove",e=>{
  overMap=true;
  if(!drag||e.pointerId!==drag.id) return;
  const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
  if(!dragged&&Math.abs(dx)+Math.abs(dy)<4) return;
  /* Only take over the pointer once it's a drag, so a plain click still reaches the diagram */
  if(!dragged){dragged=true; wrapEl.setPointerCapture(e.pointerId); wrapEl.classList.add("grabbing");}
  drag.x=e.clientX; drag.y=e.clientY;
  wrapEl.scrollLeft-=dx; wrapEl.scrollTop-=dy;
});
function endDrag(e){if(!drag||e.pointerId!==drag.id) return; drag=null; wrapEl.classList.remove("grabbing");}
wrapEl.addEventListener("pointerup",endDrag);
wrapEl.addEventListener("pointercancel",endDrag);
/* Clicking a box opens its editor beside the diagram, so leave full screen first */
wrapEl.addEventListener("click",e=>{if(isFull()&&!dragged&&!handOn()&&e.target.closest("g.box")) setFull(false);},true);
/* A drag, or any click with the hand on, should not select anything */
wrapEl.addEventListener("click",e=>{
  if(dragged||handOn()&&!e.target.closest("button,a,input")){e.stopPropagation();e.preventDefault();}
  dragged=false;
},true);
/* Arrow keys move the diagram once its window has focus */
wrapEl.addEventListener("keydown",e=>{
  if(e.target!==wrapEl) return;
  const step=e.shiftKey?200:60;
  const k={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
  if(!k) return;
  e.preventDefault();
  wrapEl.scrollLeft+=k[0]; wrapEl.scrollTop+=k[1];
});
/* Full screen: the diagram window fills the screen, with the same drag and zoom.
   Where a browser can't put part of a page full screen (iPhone Safari), the
   window fills the browser window instead. Esc leaves either. */
function isFull(){return document.fullscreenElement===stageEl||stageEl.classList.contains("full");}
function fullChanged(){
  const on=isFull();
  fullBtn.setAttribute("aria-pressed",on);
  fullBtn.querySelector("span").textContent=on?"Exit full screen":"Full screen";
  $("#zoomFit").textContent=on?"Fit to screen":"Fit to width";
  document.body.classList.toggle("ft-full",stageEl.classList.contains("full"));
  autoFit=true;
  requestAnimationFrame(()=>renderDiagram());
}
function setFull(on){
  if(on===isFull()) return;
  if(!on&&stageEl.classList.contains("full")){stageEl.classList.remove("full");fullChanged();return;}
  if(document.fullscreenEnabled&&stageEl.requestFullscreen){
    if(on) stageEl.requestFullscreen().catch(()=>{stageEl.classList.add("full");fullChanged();});
    else document.exitFullscreen();
    return;
  }
  stageEl.classList.toggle("full",on); fullChanged();
}
fullBtn.addEventListener("click",()=>setFull(!isFull()));
document.addEventListener("fullscreenchange",fullChanged);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&stageEl.classList.contains("full")) setFull(false);});

/* ---------- checks ---------- */
const DIR=/\b(improv|increas|decreas|reduc|rais|lower|enhanc|optimi[sz]|minimi[sz]|maximi[sz]|eliminat|prevent|strengthen|expand|shorten|cut|grow|boost|fewer|more|less|better|faster|earlier|develop|establish)\w*/i;
const TIME=/\b(by|within|before|until|end of)\b|\b20\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(q[1-4]|weeks?|months?|quarters?|years?)\b/i;
function allDrivers(){const out=[];(function w(a,d){a.forEach(n=>{if(n.kind==="driver"){out.push({n:n,d:d});w(n.children,d+1);}});})(state.drivers,1);return out;}
function hasProject(n){return n.children.some(c=>c.kind==="project"||hasProject(c));}
function names(list){const t=list.slice(0,4).map(n=>"“"+(n.text.trim()||"untitled")+"”").join(", ");return t+(list.length>4?" and "+(list.length-4)+" more":"");}
function renderChecks(){
  const g=(state.goal.text+" "+state.goal.measure).trim();
  const ds=allDrivers();
  const leafless=ds.filter(x=>!hasProject(x.n)&&!x.n.children.some(c=>c.kind==="driver")).map(x=>x.n);
  const noDir=ds.filter(x=>x.n.text.trim()&&!DIR.test(x.n.text)).map(x=>x.n);
  const blankD=ds.filter(x=>!x.n.text.trim()).length;
  const withM=ds.filter(x=>x.n.measure.trim()).length;
  const depth=ds.reduce((a,x)=>Math.max(a,x.d),0);
  const C2=[];
  const add=(st,t,p)=>C2.push({st:st,t:t,p:p});
  if(!state.goal.text.trim()) add("warn","Write a goal","Everything in the diagram flows from one clearly defined goal.");
  else{
    add(/\d|%/.test(g)?"pass":"warn","Goal is measurable",/\d|%/.test(g)?"The goal or its measure includes a target figure.":"Add a number or percentage so you'll know when you've achieved it.");
    add(TIME.test(g)?"pass":"warn","Goal has a timescale",TIME.test(g)?"The goal says by when.":"Say by when, e.g. “by March 2027”.");
  }
  add(state.drivers.length?"pass":"warn","Primary drivers",state.drivers.length?state.drivers.length+" factor"+(state.drivers.length>1?"s":"")+" believed to act directly on the goal.":"Add the factors you believe directly move the goal.");
  if(blankD) add("warn","Empty drivers",blankD+" driver box"+(blankD>1?"es are":" is")+" still blank.");
  if(ds.length) add(noDir.length?"warn":"pass","Drivers state a direction",noDir.length?"Try wording like improve, increase or reduce for "+names(noDir)+".":"Each driver says which way it needs to move.");
  if(ds.length) add(leafless.length?"warn":"pass","Every branch ends in a project",leafless.length?"No change ideas yet under "+names(leafless)+".":"Each branch leads to at least one project.");
  const nb=state.balancing.filter(b=>b.text.trim()).length;
  add(nb?"pass":"warn","Balancing measures",nb?nb+" thing"+(nb>1?"s":"")+" you'll watch so they don't get worse.":"Name anything that must not get worse, such as waiting times or staff hours.");
  if(ds.length) add(withM===ds.length?"pass":"info","Driver measures",withM+" of "+ds.length+" drivers have a measure. Measures turn the diagram into a measurement framework.");
  if(depth>3) add("info","More than three driver levels","That's fine if it helps. Stop adding layers once the projects become obvious.");
  const warns=C2.filter(c=>c.st==="warn").length;
  const bdg=$("#checkBadge"); bdg.textContent=warns; bdg.classList.toggle("zero",!warns);
  const sym={pass:"✓",warn:"!",info:"i"};
  $("#checks").innerHTML=C2.map(c=>'<div class="check"><span class="dot '+c.st+'" aria-label="'+c.st+'">'+sym[c.st]+'</span><div><b>'+esc(c.t)+'</b><p>'+esc(c.p)+'</p></div></div>').join("");
}

/* ---------- tabs ---------- */
function activateTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected",String(t.dataset.tab===name)));
  document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("active",p.id==="pane-"+name));
  if(name==="build") document.querySelectorAll("#pane-build textarea").forEach(autosize);
}
document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>activateTab(t.dataset.tab)));

/* ---------- outline ---------- */
function toOutline(){
  const o=["Title: "+state.title,"Goal: "+state.goal.text.replace(/\n/g," ")];
  if(state.goal.measure) o.push("Measure: "+state.goal.measure);
  o.push("");
  (function w(a,d){a.forEach(n=>{
    const ind="  ".repeat(d);
    o.push(ind+(n.kind==="project"?"- ":"")+n.text.replace(/\n/g," "));
    if(n.measure) o.push(ind+"  Measure: "+n.measure);
    w(n.children,d+1);
  });})(state.drivers,0);
  if(state.balancing.length){o.push("");state.balancing.forEach(b=>o.push("Balancing: "+b.text.replace(/\n/g," ")));}
  return o.join("\n");
}
function fromOutline(src){
  const s=blank(); s.title=""; let last=null; const stack=[];
  src.split(/\r?\n/).forEach(raw=>{
    if(!raw.trim()) return;
    const ind=raw.match(/^[\t ]*/)[0].replace(/\t/g,"  ").length;
    let t=raw.trim(), m;
    if((m=t.match(/^title:\s*(.*)$/i))){s.title=m[1];return;}
    if((m=t.match(/^(?:goal|aim):\s*(.*)$/i))){s.goal.text=m[1];last=s.goal;return;}
    if((m=t.match(/^measures?:\s*(.*)$/i))){if(last) last.measure=m[1];return;}
    if((m=t.match(/^balancing(?:\s+(?:measures?|goals?))?:\s*(.*)$/i))){s.balancing.push({id:nid(),text:m[1]});return;}
    const isP=/^[-*•]\s+/.test(t); if(isP) t=t.replace(/^[-*•]\s+/,"");
    const node=isP?P(t):D(t);
    while(stack.length&&stack[stack.length-1].ind>=ind) stack.pop();
    let parent=null; for(let i=stack.length-1;i>=0;i--){if(stack[i].node.kind==="driver"){parent=stack[i].node;break;}}
    if(parent) parent.children.push(node); else {node.kind="driver"; s.drivers.push(node);}
    stack.push({ind:ind,node:node}); last=node;
  });
  if(!s.title) s.title="Driver diagram";
  return s;
}
const dlg=$("#outlineDlg");
$("#btnOutline").addEventListener("click",()=>{$("#outlineText").value=toOutline(); dlg.showModal();});
$("#outlineForm").addEventListener("submit",e=>{
  if(e.submitter&&e.submitter.value==="apply"){
    state=fromOutline($("#outlineText").value); selected=null; autoFit=true; persist(); renderAll(); toast("Outline applied");
  }
});

/* ---------- top actions ---------- */
function loadExampleProject(){
  if(hasContent()&&!confirm("Replace your current diagram with the fuel costs example?")) return;
  state=example(); selected=null; autoFit=true; persist(); renderAll();
}
function newProject(){
  state=blank(); selected=null; autoFit=true; persist(); renderAll(); $("#goalText").focus();
}
function hasContent(){return !!(state.goal.text.trim()||state.drivers.length||state.balancing.length);}

/* Shared toolbar (Open, Save, Export) */
FocusActions.mount({
  tool:"driver_diagram", toolName:"driver diagram", fileName:()=>slug(), say:m=>toast(m),
  explain:{place:"#canvasWrap", text:()=>{
    const L=["Driver diagram: "+(state.title||"untitled"),"Aim: "+(state.goal.text||"(not set)")+(state.goal.measure?" (measure: "+state.goal.measure+")":"")];
    (function w(a,d){a.forEach(n=>{L.push("  ".repeat(d)+"- "+(n.kind==="project"?"Change idea: ":(d===0?"Primary driver: ":"Secondary driver: "))+(n.text||"untitled")+(n.measure?" (measure: "+n.measure+")":""));w(n.children||[],d+1);});})(state.drivers,0);
    if(state.balancing.length) L.push("Balancing measures: "+state.balancing.map(b=>b.text).join("; "));
    return L.join("\n");}},
  hasData:()=>hasContent(), reset:()=>{newProject();trackCleared();}, load:doc=>{state=normalise(doc);selected=null;autoFit=true;persist();renderAll();},
  example:()=>loadExampleProject(),
  save:()=>saveFile(slug()+".json",JSON.stringify(state,null,2),"application/json"),
  open:()=>$("#fileIn").click(),
  ready:()=>hasContent(),
  exports:trackExports([
    {type:"png",run:()=>exportPng()},
    {type:"svg",run:()=>saveFile(slug()+".svg",layout(state,{export:true}).svg,"image/svg+xml")}
  ])
});
function slug(){return (state.title||"driver-diagram").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"driver-diagram";}
function exportPng(){
  const L=layout(state,{export:true,scale:2});
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement("canvas"); cv.width=Math.round(L.W*2); cv.height=Math.round(L.H*2);
    const cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
    cv.toBlob(b=>{if(b) saveFile(slug()+".png",b,"image/png"); else toast("Couldn't create the PNG. Try SVG instead.");},"image/png");
  };
  img.onerror=()=>toast("Couldn't create the PNG. Try SVG instead.");
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(L.svg);
}
$("#fileIn").addEventListener("change",e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const big=FocusActions.tooBig(f,"project"); if(big){e.target.value="";return toast(big);}
  const r=new FileReader();
  r.onload=()=>{
    try{state=normalise(JSON.parse(r.result));selected=null;autoFit=true;persist();renderAll();toast("Opened "+f.name);}
    catch(err){toast("That file isn't a driver diagram project file.");}
    e.target.value="";
  };
  r.readAsText(f);
});

/* ---------- saving files ---------- */
let dlP=null;
function getDownloads(){
  if(!dlP) dlP=window.claude.use("downloads").catch(()=>null);
  return dlP;
}
async function saveFile(name,data,mime){
  if(window.claude&&typeof window.claude.use==="function"){
    const d=await getDownloads();
    if(!d){toast("Downloads aren't available in this view.");return;}
    try{await d.save({filename:name,data:data});toast("Saved "+name);}
    catch(err){
      const c=err&&err.code;
      if(c==="declined") return;
      if(c==="rate_limited") toast("A save prompt is already open.");
      else toast("Couldn't save "+name+".");
    }
    return;
  }
  try{if(await FocusActions.saveFile(name,data,mime)) toast("Saved "+name);}
  catch(err){toast("Couldn't save "+name+".");}
}
let tt;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2600);}

/* ---------- suite menus ---------- */

renderAll();
})();
