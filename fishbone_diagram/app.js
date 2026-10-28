/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $=s=>document.querySelector(s);
const KEY="fishbone-builder-v1";
const TOOL="fishbone_diagram";
let seq=0;
const nid=()=>"n"+Date.now().toString(36)+(seq++).toString(36);

// The classic categories. Even positions go above the spine, odd ones below.
const STANDARD=["People","Materials","Environment","Methods","Equipment"];
// Other common category sets, offered in the Category set menu.
const SETS={
  classic:{label:"Classic",names:STANDARD},
  seips:{label:"SEIPS",names:["Tools & Technology","Tasks","Organisation","Person","External Environment","Internal Environment"]},
  "6ms":{label:"6Ms",names:["Machine","Method","Material","Measurement","Mother Nature","Manpower"]},
  "4ps":{label:"4Ps",names:["Policy/Procedure","Process","People","Place"]},
  functions:{label:"Functions",names:["Imaging","Finance","Transport","Testing"]},
  process:{label:"Process steps",names:["Registration","Triage","Dr assessment","Consult","Lab testing","Admission"]}
};
const ALL_NAMES=[...new Set(Object.values(SETS).flatMap(x=>x.names))];
// The set whose names match the current categories exactly, if any.
function currentSet(){
  const cur=state.categories.map(c=>c.name.trim().toLowerCase()).join("|");
  return Object.keys(SETS).find(k=>SETS[k].names.map(n=>n.toLowerCase()).join("|")===cur)||null;
}

function N(text,kids){return {id:nid(),text:text||"",children:kids||[]};}
function Cat(name,causes){return {id:nid(),name:name||"",causes:causes||[]};}
function blank(){return {title:"Cause and effect diagram",effect:"",categories:STANDARD.map(n=>Cat(n))};}
function example(){
  return {
    title:"Why do patients wait for discharge medicines? (example)",
    effect:"Long waits for discharge medicines",
    categories:[
      Cat("People",[
        N("Doctors busy with ward work",[N("Prescriptions written late in the day")]),
        N("Pharmacist cover stretched",[N("One pharmacist across three wards")])
      ]),
      Cat("Materials",[
        N("Medicines not stocked on the ward"),
        N("Patients' own medicines not brought in",[N("Not asked for at admission")])
      ]),
      Cat("Environment",[
        N("Dispensary far from the ward"),
        N("Afternoon peak in discharges")
      ]),
      Cat("Methods",[
        N("Prescription started on day of discharge",[N("Discharge date not planned in advance")]),
        N("Unclear who chases delays"),
        N("Batch delivery from pharmacy",[N("Porter rounds only twice a day")])
      ]),
      Cat("Equipment",[
        N("E-prescribing system slow",[N("Not enough computers on the ward")]),
        N("Label printer breaks down")
      ])
    ]
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
  if(!o||typeof o!=="object"||!Array.isArray(o.categories)) throw new Error("bad");
  const fix=n=>({id:nid(),text:String((n&&n.text)||(typeof n==="string"?n:"")),children:(n&&Array.isArray(n.children))?n.children.map(fix):[]});
  return {
    title:String(o.title||"Cause and effect diagram"),
    effect:String(o.effect||""),
    categories:o.categories.map(c=>({id:nid(),name:String((c&&c.name)||""),causes:(c&&Array.isArray(c.causes))?c.causes.map(fix):[]}))
  };
}

let state=load()||blank(); // start with the standard categories unless there is saved work
let selected=null;
let zoom=1, autoFit=true;

/* ---------- tree helpers ---------- */
const sideOf=i=>i%2===0?"top":"bottom";
function find(id){
  for(const cat of state.categories){
    const r=(function walk(arr,depth,parent){
      for(let i=0;i<arr.length;i++){
        const n=arr[i];
        if(n.id===id) return {node:n,arr:arr,idx:i,depth:depth,parent:parent};
        const r=walk(n.children,depth+1,n); if(r) return r;
      }
      return null;
    })(cat.causes,1,null);
    if(r){r.cat=cat;return r;}
  }
  return null;
}
function catIndex(id){return state.categories.findIndex(c=>c.id===id);}
function levelName(d){return d===1?"Cause":d===2?"Sub-cause":"Deeper cause";}
function countAll(n){return 1+n.children.reduce((a,c)=>a+countAll(c),0);}

/* ---------- editor ---------- */
function autosize(el){el.style.height="auto";el.style.height=(el.scrollHeight+2)+"px";}

function nodeEditor(n,depth){
  const w=document.createElement("div");
  w.className="node lvl-"+Math.min(depth,3)+(selected===n.id?" sel":"");
  w.dataset.id=n.id;
  const kind=levelName(depth);
  w.innerHTML=
    '<div class="node-head"><span class="node-kind">'+kind+'</span>'+
    '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move up">↑</button>'+
    '<button class="btn icon ghost" data-act="down" type="button" aria-label="Move down">↓</button>'+
    '<button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove '+kind.toLowerCase()+'">✕</button></div>'+
    '<textarea class="field t" rows="1" aria-label="'+kind+' text" placeholder="'+(depth===1?"What contributes to the effect?":"Why does that happen?")+'"></textarea>'+
    '<div class="node-actions"><button class="btn small" data-act="why" type="button">Ask “Why?”: add a sub-cause</button></div>'+
    '<div class="kids"></div>';
  w.querySelector(".t").value=n.text;
  const kids=w.querySelector(".kids");
  n.children.forEach(c=>kids.appendChild(nodeEditor(c,depth+1)));
  return w;
}
function catEditor(c,i){
  const w=document.createElement("div");
  w.className="cat"+(selected==="cat:"+c.id?" sel":"");
  w.dataset.cat=c.id;
  w.innerHTML=
    '<div class="node-head"><span class="node-kind">Category '+(i+1)+', '+(sideOf(i)==="top"?"above":"below")+' the spine</span>'+
    '<button class="btn icon ghost" data-cact="up" type="button" aria-label="Move category up">↑</button>'+
    '<button class="btn icon ghost" data-cact="down" type="button" aria-label="Move category down">↓</button>'+
    '<button class="btn icon ghost danger" data-cact="del" type="button" aria-label="Remove category">✕</button></div>'+
    '<input class="field cname" type="text" list="catSuggest" aria-label="Category '+(i+1)+' name" placeholder="e.g. People">'+
    '<div class="causes"></div>'+
    '<div class="node-actions"><button class="btn small" data-cact="add" type="button">Add cause</button></div>';
  w.querySelector(".cname").value=c.name;
  const box=w.querySelector(".causes");
  c.causes.forEach(n=>box.appendChild(nodeEditor(n,1)));
  return w;
}
function renderTree(){
  const box=$("#cats"); box.innerHTML="";
  if(!state.categories.length) box.innerHTML='<div class="empty">No categories yet. The classic five are Materials, Methods, Equipment, Environment and People.</div>';
  state.categories.forEach((c,i)=>box.appendChild(catEditor(c,i)));
  box.querySelectorAll("textarea").forEach(autosize);
  const used=new Set(state.categories.map(c=>c.name.trim().toLowerCase()));
  $("#catSuggest").innerHTML=ALL_NAMES.filter(n=>!used.has(n.toLowerCase())).map(n=>'<option value="'+esc(n)+'">').join("");
  $("#catSet").value=currentSet()||"custom";
}
function renderAll(){
  $("#title").value=state.title;
  $("#effectText").value=state.effect;
  autosize($("#effectText"));
  renderTree(); renderDiagram(); renderChecks();
}
function changed(){persist();renderDiagram();renderChecks();}

function focusNode(id){
  const el=document.querySelector('.node[data-id="'+id+'"] > .t');
  if(el){el.focus();el.scrollIntoView({block:"nearest"});}
}
function focusCat(id){
  const el=document.querySelector('.cat[data-cat="'+id+'"] > .cname');
  if(el){el.focus();el.scrollIntoView({block:"nearest"});}
}

$("#title").addEventListener("input",e=>{state.title=e.target.value;changed();});
$("#effectText").addEventListener("input",e=>{state.effect=e.target.value;autosize(e.target);changed();});
$("#effectText").addEventListener("focus",()=>setSel("effect"));

$("#addCat").addEventListener("click",()=>{
  const c=Cat(""); state.categories.push(c); renderTree(); changed(); focusCat(c.id);
});

// Apply a category set: rename categories in order, keeping their causes.
$("#catSet").addEventListener("change",e=>{
  const key=e.target.value, cs=state.categories;
  if(key==="custom"){
    if(!cs.length) cs.push(Cat(""));
    cs.forEach(c=>c.name="");
    renderTree(); changed(); focusCat(cs[0].id);
    return;
  }
  const names=SETS[key].names, extra=cs.slice(names.length);
  const lost=extra.reduce((a,c)=>a+c.causes.reduce((b,x)=>b+countAll(x),0),0);
  if(lost>0&&!confirm("The "+SETS[key].label+" set has "+names.length+" categories. Remove the last "+extra.length+" categor"+(extra.length>1?"ies":"y")+" and their "+lost+" cause"+(lost>1?"s":"")+"?")){
    e.target.value=currentSet()||"custom"; return;
  }
  cs.splice(names.length);
  names.forEach((n,i)=>{if(cs[i]) cs[i].name=n; else cs.push(Cat(n));});
  if(selected&&selected.startsWith("cat:")&&!cs.some(c=>"cat:"+c.id===selected)) selected=null;
  renderTree(); changed();
});

const cats=$("#cats");
cats.addEventListener("input",e=>{
  if(e.target.classList.contains("cname")){
    const i=catIndex(e.target.closest(".cat").dataset.cat);
    if(i>=0){state.categories[i].name=e.target.value;changed();}
    return;
  }
  if(!e.target.classList.contains("t")) return;
  const f=find(e.target.closest(".node").dataset.id); if(!f) return;
  f.node.text=e.target.value; autosize(e.target); changed();
});
cats.addEventListener("change",e=>{if(e.target.classList.contains("cname")) renderTree();});
cats.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||e.shiftKey) return;
  if(e.target.classList.contains("cname")){
    e.preventDefault();
    const i=catIndex(e.target.closest(".cat").dataset.cat); if(i<0) return;
    const n=N(""); state.categories[i].causes.push(n); renderTree(); changed(); focusNode(n.id);
    return;
  }
  if(!e.target.classList.contains("t")) return;
  e.preventDefault();
  const f=find(e.target.closest(".node").dataset.id); if(!f) return;
  const n=N(""); f.arr.splice(f.idx+1,0,n); renderTree(); changed(); focusNode(n.id);
});
cats.addEventListener("focusin",e=>{
  const w=e.target.closest(".node");
  if(w){setSel(w.dataset.id);return;}
  const c=e.target.closest(".cat");
  if(c&&e.target.classList.contains("cname")) setSel("cat:"+c.dataset.cat);
});
cats.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(b){
    const f=find(b.closest(".node").dataset.id); if(!f) return;
    const act=b.dataset.act;
    let focusId=null;
    if(act==="why"){const n=N("");f.node.children.push(n);focusId=n.id;}
    else if(act==="up"&&f.idx>0){f.arr.splice(f.idx-1,0,f.arr.splice(f.idx,1)[0]);focusId=f.node.id;}
    else if(act==="down"&&f.idx<f.arr.length-1){f.arr.splice(f.idx+1,0,f.arr.splice(f.idx,1)[0]);focusId=f.node.id;}
    else if(act==="del"){
      const kids=countAll(f.node)-1;
      if(kids>0&&!confirm("Remove this cause and the "+kids+" sub-cause"+(kids>1?"s":"")+" beneath it?")) return;
      f.arr.splice(f.idx,1); if(selected===f.node.id) selected=null;
    }
    renderTree(); changed();
    if(focusId){ if(act==="up"||act==="down"){const el=document.querySelector('.node[data-id="'+focusId+'"] [data-act="'+act+'"]'); if(el) el.focus();} else focusNode(focusId);}
    return;
  }
  const cb=e.target.closest("[data-cact]"); if(!cb) return;
  const i=catIndex(cb.closest(".cat").dataset.cat); if(i<0) return;
  const c=state.categories[i], act=cb.dataset.cact;
  if(act==="add"){const n=N("");c.causes.push(n);renderTree();changed();focusNode(n.id);return;}
  if(act==="up"&&i>0) state.categories.splice(i-1,0,state.categories.splice(i,1)[0]);
  else if(act==="down"&&i<state.categories.length-1) state.categories.splice(i+1,0,state.categories.splice(i,1)[0]);
  else if(act==="del"){
    const n=c.causes.reduce((a,x)=>a+countAll(x),0);
    if(n>0&&!confirm("Remove the "+(c.name.trim()||"untitled")+" category and its "+n+" cause"+(n>1?"s":"")+"?")) return;
    state.categories.splice(i,1); if(selected==="cat:"+c.id) selected=null;
  }
  else return;
  renderTree(); changed();
  if(act!=="del"){const el=document.querySelector('.cat[data-cat="'+c.id+'"] [data-cact="'+act+'"]'); if(el) el.focus();}
});

function setSel(id){
  if(selected===id) return;
  selected=id;
  document.querySelectorAll(".node.sel,.cat.sel,.effect-card.sel").forEach(x=>x.classList.remove("sel"));
  let w=null;
  if(id==="effect") w=$("#effectCard");
  else if(id&&id.startsWith("cat:")) w=document.querySelector('.cat[data-cat="'+id.slice(4)+'"]');
  else if(id) w=document.querySelector('.node[data-id="'+id+'"]');
  if(w) w.classList.add("sel");
  renderDiagram();
}

/* ---------- layout & SVG ---------- */
const FONT="Arial, Helvetica, sans-serif";
// slope: how far a bone runs left for each pixel it climbs away from the spine.
// ind: how far each "Why?" level steps in from the bone it hangs off.
const G={m:28,titleH:46,slope:0.5,ind:26,padS:16,padE:14,rowGap:8,lineGap:4,lh:16,wrap1:150,wrapN:136,minL:120,gap:28,effW:190,bin:4};
const COL={spine:"#003087",bone:"#005EB8",twig:"#7FA6CF",ink:"#0B2545",ph:"#8DA2B5",eff:"#003087",cat:"#005EB8",sel:"#FFB81C"};
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
  while(out.length>1&&out[out.length-1]==="") out.pop();
  return out;
}
function widest(lines,font){mctx.font=font;return lines.reduce((a,l)=>Math.max(a,mctx.measureText(l).width),0);}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

// Measure one category. Positions are worked out as d, the distance away from
// the spine, and x relative to where the bone meets the spine, so the same
// code draws bones above and below it. Causes read top to bottom on both
// sides, and each cause's text sits above its line.
function catGeom(c,side){
  const rows=[];
  (function walk(arr,lvl,parent){arr.forEach(n=>{
    const empty=!n.text.trim();
    const font=(lvl===1?"700":"400")+" 13px "+FONT;
    const lines=wrap(empty?"New cause":n.text,lvl===1?G.wrap1:G.wrapN,font);
    const r={n:n,lvl:lvl,lines:lines,tw:widest(lines,font),font:font,empty:empty,kids:[]};
    if(parent) parent.kids.push(r);
    rows.push(r);
    walk(n.children,lvl+1,r);
  });})(c.causes,1,null);
  let d=G.padS;
  (side==="bottom"?rows:rows.slice().reverse()).forEach(r=>{
    const th=r.lines.length*G.lh;
    if(side==="bottom"){r.t0=d;r.t1=d+th;r.dl=d+th+G.lineGap;}
    else{r.dl=d;r.t0=d+G.lineGap;r.t1=d+G.lineGap+th;}
    d+=th+G.lineGap+G.rowGap;
  });
  const lfont="700 15px "+FONT;
  const lempty=!c.name.trim();
  const llines=wrap(lempty?"Category":c.name,140,lfont);
  const label={lines:llines,w:Math.max(96,widest(llines,lfont)+24),h:llines.length*19+16,empty:lempty};
  return {c:c,side:side,rows:rows,need:d-G.rowGap+G.padE,label:label};
}
// Once the bone length L is known, place everything across and record the
// category's outline (left- and rightmost x for each band of d) so the
// columns can be packed close together without overlapping.
function placeX(g,L){
  const S=G.slope;
  const ax=(dd,lvl)=>-dd*S-(lvl-1)*G.ind;
  g.L=L;
  g.rows.forEach(r=>{
    r.ax=ax(r.dl,r.lvl);
    r.tr=ax(Math.max(r.dl,r.t1),r.lvl)-5;
    r.ll=Math.min(r.ax-40,r.tr-r.tw-5);
  });
  g.twigs=[];
  g.rows.forEach(r=>{
    if(!r.kids.length) return;
    const far=r.kids.reduce((a,k)=>Math.abs(k.dl-r.dl)>Math.abs(a.dl-r.dl)?k:a,r.kids[0]);
    g.twigs.push({d1:Math.min(r.dl,far.dl),d2:Math.max(r.dl,far.dl),off:r.lvl*G.ind});
  });
  const lb=g.label; lb.cx=-L*S;
  const nb=Math.ceil((L+lb.h)/G.bin)+1;
  g.min=new Array(nb).fill(Infinity); g.max=new Array(nb).fill(-Infinity);
  const mark=(b,x1,x2)=>{if(b<0||b>=nb) return; g.min[b]=Math.min(g.min[b],x1); g.max[b]=Math.max(g.max[b],x2);};
  const rect=(d1,d2,x1,x2)=>{for(let b=Math.floor(d1/G.bin);b<=Math.floor(d2/G.bin);b++) mark(b,x1,x2);};
  const seg=(d1,d2,off)=>{for(let b=Math.floor(d1/G.bin);b<=Math.floor(d2/G.bin);b++){
    const a=Math.max(d1,b*G.bin), z=Math.min(d2,(b+1)*G.bin); mark(b,-z*S-off-2,-a*S-off+2);}};
  seg(0,L,0);
  g.rows.forEach(r=>rect(Math.min(r.t0,r.dl),Math.max(r.t1,r.dl),r.ll,r.ax));
  g.twigs.forEach(t=>seg(t.d1,t.d2,t.off));
  rect(L,L+lb.h,lb.cx-lb.w/2,lb.cx+lb.w/2);
  g.minX=Math.min(...g.min.filter(isFinite)); g.maxX=Math.max(...g.max.filter(isFinite));
}
// Smallest distance B's join point must sit to the right of A's (same side).
function sep(A,B){
  let s=-Infinity;
  for(let b=0;b<Math.min(A.max.length,B.min.length);b++){
    if(isFinite(A.max[b])&&isFinite(B.min[b])) s=Math.max(s,A.max[b]-B.min[b]);
  }
  return s+G.gap;
}

function layout(st,opts){
  opts=opts||{};
  const S=G.slope;
  const geoms=st.categories.map((c,i)=>catGeom(c,sideOf(i)));
  // Give every category box the size of the largest one, so they line up.
  const lbW=geoms.reduce((a,g)=>Math.max(a,g.label.w),0), lbMaxH=geoms.reduce((a,g)=>Math.max(a,g.label.h),0);
  geoms.forEach(g=>{g.label.w=lbW;g.label.h=lbMaxH;});
  const top=geoms.filter(g=>g.side==="top"), bot=geoms.filter(g=>g.side==="bottom");
  const Lt=top.reduce((a,g)=>Math.max(a,g.need),G.minL);
  const Lb=bot.reduce((a,g)=>Math.max(a,g.need),G.minL);
  geoms.forEach(g=>placeX(g,g.side==="top"?Lt:Lb));

  // Columns run left to right, each with one category above and one below.
  const ncol=Math.ceil(geoms.length/2);
  const col=c=>geoms.slice(2*c,2*c+2);
  const joinX=[];
  for(let c=0;c<ncol;c++){
    let x=c?joinX[c-1]+80:0;
    for(let p=0;p<c;p++) col(p).forEach(A=>col(c).forEach(B=>{if(A.side===B.side) x=Math.max(x,joinX[p]+sep(A,B));}));
    joinX[c]=x;
  }
  let minX=0, rightX=0;
  geoms.forEach((g,i)=>{const jx=joinX[Math.floor(i/2)]; minX=Math.min(minX,jx+g.minX); rightX=Math.max(rightX,jx+g.maxX);});
  const shift=G.m+14-minX;
  const headX=(geoms.length?rightX+G.gap+10:220)+shift;

  const efont="700 17px "+FONT;
  const eEmpty=!st.effect.trim();
  const elines=wrap(eEmpty?"Write the effect":st.effect,G.effW-28,efont);
  const effH=Math.max(80,elines.length*22+28);

  const lbH=list=>list.reduce((a,g)=>Math.max(a,g.label.h),0);
  const topH=Math.max(top.length?Lt+lbH(top):0,effH/2+14);
  const botH=Math.max(bot.length?Lb+lbH(bot):0,effH/2+14);
  const spineY=G.m+G.titleH+topH;
  const W=Math.max(headX+G.effW+G.m,560);
  const H=spineY+botH+G.m;
  const Y=(d,side)=>side==="top"?spineY-d:spineY+d;
  const r1=v=>Math.round(v*10)/10;

  const s=[];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+r1(W)+' '+r1(H)+'" width="'+Math.round(W*(opts.scale||1))+'" height="'+Math.round(H*(opts.scale||1))+'" font-family="'+FONT+'" role="img" aria-label="'+esc("Cause and effect diagram: "+(st.effect||"untitled"))+'">');
  s.push('<rect width="'+r1(W)+'" height="'+r1(H)+'" fill="#FFFFFF"/>');
  s.push('<text x="'+G.m+'" y="'+(G.m+22)+'" font-size="20" font-weight="700" fill="#0B2545">'+esc(st.title||"")+'</text>');
  // spine
  s.push('<path d="M'+G.m+' '+r1(spineY)+'H'+r1(headX)+'" stroke="'+COL.spine+'" stroke-width="5" stroke-linecap="round"/>');
  geoms.forEach((g,i)=>{
    const jx=joinX[Math.floor(i/2)]+shift, side=g.side, L=g.L;
    s.push('<path d="M'+r1(jx)+' '+r1(spineY)+'L'+r1(jx-L*S)+' '+r1(Y(L,side))+'" stroke="'+COL.bone+'" stroke-width="3" stroke-linecap="round"/>');
    g.twigs.forEach(t=>s.push('<path d="M'+r1(jx-t.d1*S-t.off)+' '+r1(Y(t.d1,side))+'L'+r1(jx-t.d2*S-t.off)+' '+r1(Y(t.d2,side))+'" stroke="'+COL.twig+'" stroke-width="1.6" stroke-linecap="round"/>'));
    g.rows.forEach(r=>{
      const sel=!opts.export&&selected===r.n.id;
      const ly=Y(r.dl,side);
      s.push('<g class="box" data-id="'+r.n.id+'">');
      s.push('<rect x="'+r1(jx+r.ll)+'" y="'+r1(Math.min(Y(r.t0,side),Y(r.t1,side),ly)-2)+'" width="'+r1(r.ax-r.ll)+'" height="'+r1(r.lines.length*G.lh+G.lineGap+4)+'" fill="#FFFFFF" fill-opacity="0"/>');
      s.push('<path d="M'+r1(jx+r.ll)+' '+r1(ly)+'H'+r1(jx+r.ax)+'" stroke="'+(sel?COL.sel:COL.twig)+'" stroke-width="'+(sel?3.5:1.6)+'" stroke-linecap="round"/>');
      const textTop=Math.min(Y(r.t0,side),Y(r.t1,side));
      s.push('<text text-anchor="end" font-size="13" font-weight="'+(r.lvl===1?700:400)+'" fill="'+(r.empty?COL.ph:COL.ink)+'"'+(r.empty?' font-style="italic"':'')+'>');
      r.lines.forEach((ln,k)=>s.push('<tspan x="'+r1(jx+r.tr)+'" y="'+r1(textTop+k*G.lh+12)+'">'+esc(ln)+'</tspan>'));
      s.push('</text></g>');
    });
    // category label at the far end of the bone
    const lb=g.label, sel=!opts.export&&selected==="cat:"+g.c.id;
    const bx=jx+lb.cx-lb.w/2, by=side==="top"?spineY-L-lb.h:spineY+L;
    s.push('<g class="box" data-id="cat:'+g.c.id+'">');
    s.push('<rect x="'+r1(bx)+'" y="'+r1(by)+'" width="'+r1(lb.w)+'" height="'+r1(lb.h)+'" rx="4" fill="'+(lb.empty?"#FFFFFF":COL.cat)+'" stroke="'+(sel?COL.sel:COL.cat)+'" stroke-width="'+(sel?3.5:2)+'"'+(lb.empty?' stroke-dasharray="5 4"':'')+'/>');
    s.push('<text text-anchor="middle" font-size="15" font-weight="700" fill="'+(lb.empty?COL.ph:"#FFFFFF")+'"'+(lb.empty?' font-style="italic"':'')+'>');
    const ty=by+(lb.h-lb.lines.length*19)/2;
    lb.lines.forEach((ln,k)=>s.push('<tspan x="'+r1(jx+lb.cx)+'" y="'+r1(ty+k*19+15)+'">'+esc(ln)+'</tspan>'));
    s.push('</text></g>');
  });
  // effect at the head
  const esel=!opts.export&&selected==="effect";
  const ey=spineY-effH/2;
  s.push('<g class="box" data-id="effect">');
  s.push('<rect x="'+r1(headX)+'" y="'+r1(ey)+'" width="'+G.effW+'" height="'+r1(effH)+'" rx="7" fill="'+(eEmpty?"#FFFFFF":COL.eff)+'" stroke="'+(esel?COL.sel:COL.eff)+'" stroke-width="'+(esel?4:2.5)+'"'+(eEmpty?' stroke-dasharray="6 4"':'')+'/>');
  const et=ey+(effH-elines.length*22)/2+16;
  s.push('<text text-anchor="middle" font-size="17" font-weight="700" fill="'+(eEmpty?COL.ph:"#FFFFFF")+'"'+(eEmpty?' font-style="italic"':'')+'>');
  elines.forEach((ln,k)=>s.push('<tspan x="'+r1(headX+G.effW/2)+'" y="'+r1(et+k*22)+'">'+esc(ln)+'</tspan>'));
  s.push('</text></g>');
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
  if(hasContent()) trackChart({points:(function c(a){return a.reduce((n,x)=>n+1+c(x.children||[]),0);})(state.categories.flatMap(k=>k.causes))});
}
$("#canvas").addEventListener("click",e=>{
  const g=e.target.closest("g.box"); if(!g) return;
  const id=g.dataset.id;
  activateTab("build");
  if(id==="effect"){$("#effectText").focus();return;}
  if(id.startsWith("cat:")){focusCat(id.slice(4));return;}
  focusNode(id);
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

/* ---------- checks (the IHI instructions) ---------- */
function allCauses(){
  const out=[];
  state.categories.forEach(c=>(function w(a,d){a.forEach(n=>{out.push({n:n,d:d,c:c});w(n.children,d+1);});})(c.causes,1));
  return out;
}
function names(list){
  const t=list.slice(0,4).map(x=>"“"+((x.name!==undefined?x.name:x.text).trim()||"untitled")+"”").join(", ");
  return t+(list.length>4?" and "+(list.length-4)+" more":"");
}
function renderChecks(){
  const cs=state.categories, all=allCauses(), k=cs.length;
  const out=[];
  const add=(st,t,p)=>out.push({st:st,t:t,p:p});
  if(!state.effect.trim()) add("warn","Write the effect","Describe the problem or outcome you want to influence. It goes in the box at the head of the fish.");
  else add("pass","Effect","The effect sits in the box at the head of the fish.");
  const set=currentSet();
  if(set&&set!=="classic") add("pass","Category set","Using the "+SETS[set].label+" categories.");
  else if(k>=5&&k<=6) add("pass","Five or six categories",k+" categories of causes.");
  else if(k<5) add("warn","Five or six categories","You have "+k+". Aim for five or six. The classic set is Materials, Methods, Equipment, Environment and People.");
  else add("warn","Five or six categories","You have "+k+". Try merging related categories so there are five or six.");
  const unnamed=cs.filter(c=>!c.name.trim()).length;
  if(unnamed) add("warn","Label every category",unnamed+" categor"+(unnamed>1?"ies have":"y has")+" no name yet.");
  if(k){
    const emptyCats=cs.filter(c=>!c.causes.length);
    add(emptyCats.length?"warn":"pass","Causes in every category",emptyCats.length?"No causes yet under "+names(emptyCats)+".":"Each category lists at least one cause.");
  }
  const blankC=all.filter(x=>!x.n.text.trim()).length;
  if(blankC) add("warn","Empty causes",blankC+" cause box"+(blankC>1?"es are":" is")+" still blank.");
  if(all.length){
    const flat=cs.filter(c=>c.causes.length&&!c.causes.some(n=>n.children.length));
    add(flat.length?"info":"pass","Ask “Why?”",flat.length
      ?"No sub-causes yet under "+names(flat)+". Keep asking why until a cause is specific enough to test a change and measure its effects."
      :"Each category has causes broken down further. Stop once a cause is specific enough to test a change.");
  }
  const seen={}, dup=[];
  all.forEach(x=>{const t=x.n.text.trim().toLowerCase(); if(!t) return; if(seen[t]===1) dup.push(x.n); seen[t]=(seen[t]||0)+1;});
  if(dup.length) add("info","Repeated causes",names(dup)+" appear"+(dup.length>1?"":"s")+" more than once. That's fine if it belongs in both places, or keep the one where it helps most.");
  const depth=all.reduce((a,x)=>Math.max(a,x.d),0);
  if(depth>3) add("info","Many levels of “Why?”","Stop asking why once a cause is specific enough to test a change and measure its effects.");
  const warns=out.filter(c=>c.st==="warn").length;
  const bdg=$("#checkBadge"); bdg.textContent=warns; bdg.classList.toggle("zero",!warns);
  const sym={pass:"✓",warn:"!",info:"i"};
  $("#checks").innerHTML=out.map(c=>'<div class="check"><span class="dot '+c.st+'" aria-label="'+c.st+'">'+sym[c.st]+'</span><div><b>'+esc(c.t)+'</b><p>'+esc(c.p)+'</p></div></div>').join("");
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
  const flat=t=>t.replace(/\n/g," ");
  const o=["Title: "+flat(state.title),"Effect: "+flat(state.effect),""];
  state.categories.forEach(c=>{
    o.push(flat(c.name)||"Category");
    (function w(a,d){a.forEach(n=>{o.push("  ".repeat(d)+flat(n.text));w(n.children,d+1);});})(c.causes,1);
  });
  return o.join("\n");
}
function fromOutline(src){
  const s={title:"",effect:"",categories:[]};
  let cat=null, stack=[];
  src.split(/\r?\n/).forEach(raw=>{
    if(!raw.trim()) return;
    const ind=raw.match(/^[\t ]*/)[0].replace(/\t/g,"  ").length;
    let t=raw.trim(), m;
    if((m=t.match(/^title:\s*(.*)$/i))){s.title=m[1];return;}
    if((m=t.match(/^(?:effect|problem):\s*(.*)$/i))){s.effect=m[1];return;}
    t=t.replace(/^[-*•]\s+/,"");
    if(ind===0||!cat){cat=Cat(t);s.categories.push(cat);stack=[];return;}
    const node=N(t);
    while(stack.length&&stack[stack.length-1].ind>=ind) stack.pop();
    if(stack.length) stack[stack.length-1].node.children.push(node); else cat.causes.push(node);
    stack.push({ind:ind,node:node});
  });
  if(!s.title) s.title="Cause and effect diagram";
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
function hasCauses(){return state.categories.some(c=>c.causes.length);}
function hasContent(){
  return !!(state.effect.trim()||hasCauses()||state.categories.map(c=>c.name).join("|")!==STANDARD.join("|"));
}
function loadExampleProject(){
  if(hasContent()&&!confirm("Replace your current diagram with the discharge medicines example?")) return;
  state=example(); selected=null; autoFit=true; persist(); renderAll();
}
function newProject(){
  state=blank(); selected=null; autoFit=true; persist(); renderAll(); $("#effectText").focus();
}

function slug(){return (state.title||"cause-and-effect").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"cause-and-effect";}
function projectJson(){
  return JSON.stringify({focus:{tool:TOOL,version:1,saved:new Date().toISOString()},title:state.title,effect:state.effect,
    categories:state.categories.map(function strip(c){return c.causes?{name:c.name,causes:c.causes.map(strip)}:{text:c.text,children:c.children.map(strip)};})},null,2);
}
function tableRows(){
  const rows=[["Category","Cause","Level","Parent cause"]];
  state.categories.forEach(c=>(function w(a,d,p){a.forEach(n=>{rows.push([c.name,n.text,String(d),p?p.text:""]);w(n.children,d+1,n);});})(c.causes,1,null));
  return rows;
}
const csvCell=v=>{v=String(v).replace(/\r?\n/g," ");return /[",]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function pngBlob(cb){
  const L=layout(state,{export:true,scale:2});
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement("canvas"); cv.width=Math.round(L.W*2); cv.height=Math.round(L.H*2);
    const cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
    cv.toBlob(b=>cb(b),"image/png");
  };
  img.onerror=()=>cb(null);
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(L.svg);
}
function exportPng(){pngBlob(b=>{if(b) saveFile(slug()+".png",b,"image/png"); else toast("Couldn't create the PNG. Try SVG instead.");});}
function copyImage(){
  if(!(navigator.clipboard&&window.ClipboardItem)) return toast("Your browser can't copy images. Use PNG image instead.");
  pngBlob(async b=>{
    if(!b) return toast("Couldn't create the image. Try SVG instead.");
    try{await navigator.clipboard.write([new ClipboardItem({"image/png":b})]);toast("Diagram copied. Paste it into PowerPoint or Word.");}
    catch(e){toast("Copy was blocked. Use PNG image instead.");}
  });
}
async function copyTable(){
  try{await navigator.clipboard.writeText(tableRows().map(r=>r.map(v=>String(v).replace(/[\t\r\n]+/g," ")).join("\t")).join("\n"));toast("Table copied. Paste it into Excel.");}
  catch(e){toast("Copy was blocked. Use Data table (.csv) instead.");}
}

/* Shared toolbar (Example, Open, Save, Export) */
FocusActions.mount({
  tool:TOOL, toolName:"cause and effect diagram", fileName:()=>slug(), say:m=>toast(m),
  explain:{place:"#canvasWrap", text:()=>{
    const L=["Cause and effect (fishbone) diagram: "+(state.title||"untitled"),"Effect (the problem): "+(state.effect||"(not set)")];
    state.categories.forEach(c=>{L.push("Category: "+c.name);(function w(a,d){a.forEach(n=>{L.push("  ".repeat(d)+"- "+(n.text||"untitled"));w(n.children||[],d+1);});})(c.causes,1);});
    return L.join("\n");}},
  hasData:()=>hasContent(), reset:()=>{newProject();trackCleared();}, load:doc=>{state=normalise(doc);selected=null;autoFit=true;persist();renderAll();},
  example:()=>loadExampleProject(),
  save:()=>saveFile(slug()+".json",projectJson(),"application/json"),
  open:()=>$("#fileIn").click(),
  ready:()=>!!(state.effect.trim()||hasCauses()),
  exports:trackExports([
    {type:"png",run:()=>exportPng()},
    {type:"svg",run:()=>saveFile(slug()+".svg",layout(state,{export:true}).svg,"image/svg+xml")},
    {type:"copyimg",run:()=>copyImage()},
    {type:"csv",label:"Cause table (.csv)",run:()=>saveFile(slug()+".csv","﻿"+tableRows().map(r=>r.map(csvCell).join(",")).join("\r\n"),"text/csv")},
    {type:"copytable",run:()=>copyTable()}
  ])
});
trackSettings({categorySet:"catSet"});
$("#fileIn").addEventListener("change",e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    e.target.value="";
    let doc;
    try{doc=JSON.parse(r.result);}catch(err){return toast("That file isn't a cause and effect diagram project file.");}
    if(doc&&doc.focus&&doc.focus.tool&&doc.focus.tool!==TOOL) return toast("That file was saved from the "+String(doc.focus.tool).replace(/_/g," ")+" tool. Open it there instead.");
    try{state=normalise(doc);}catch(err){return toast("That file isn't a cause and effect diagram project file.");}
    selected=null; autoFit=true; persist(); renderAll(); toast("Opened "+f.name);
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

renderAll();
})();
