---
# Liquid fills in the site links below
---
/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $=s=>document.querySelector(s);
const KEY="pm-builder-v1";
const FF="Figtree, Frutiger, 'Helvetica Neue', Arial, sans-serif";
let seq=0;
const nid=()=>"s"+Date.now().toString(36)+(seq++).toString(36);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const TYPES={terminator:"Start / end",step:"Activity",decision:"Decision"};
const PATH="#005EB8"; // arrows and outlines for steps on a decision's new path
const VALUES={"":"Not classified",va:"Value-adding",nnva:"Necessary (NNVA)",nva:"Non-value-adding"};
const VSHORT={va:"VA",nnva:"NNVA",nva:"NVA"};
const VCOL={va:{fill:"#E3F2E9",ink:"#007F3B"},nnva:{fill:"#FFF4DB",ink:"#8A5A00"},nva:{fill:"#FBE7E5",ink:"#B3261E"},"":{fill:"#FFFFFF",ink:"#768692"}};

/* ---------- model ---------- */
function L(name,patient){return {id:nid(),name:name,patient:!!patient};}
/* The patient's lane is found from its name, so there's nothing to tick */
const isPat=l=>/patient|service user|carer/i.test((l&&l.name)||"");
function S(lane,type,text,value,x){return Object.assign({id:nid(),lane:lane.id||lane,type:type,text:text||"",value:value||"",issue:"",noTo:"",thenTo:"",depth:0,yesLabel:"Yes",noLabel:"No"},x||{});}
function blankMap(){
  /* a new map starts with one lane; add more for each role or team */
  const p=L("Lane 1");
  return {lanes:[p],steps:[S(p,"terminator",""),S(p,"step",""),S(p,"terminator","")]};
}
function blank(){return {title:"",scope:{start:"",end:"",who:""},active:"current",maps:{current:blankMap(),future:null},view:{issues:true}};}

function example(){
  const pt=L("Patient",true),rc=L("Reception"),ph=L("Phlebotomist"),po=L("Porter"),lab=L("Laboratory"),cl=L("Clinician");
  const c4=S(rc,"step","Prints labels and a paper request form","nnva",{issue:"Same details written out twice"});
  const cur={lanes:[pt,rc,ph,po,lab,cl],steps:[
    S(pt,"terminator","Patient arrives for blood test",""),
    S(pt,"step","Takes a ticket and waits to check in","nva"),
    S(rc,"step","Checks identity and finds the request","nnva",{issue:"Request is on the EPR but gets re-keyed"}),
    c4,
    S(pt,"step","Waits to be called","nva",{issue:"Queue peaks 08:30 to 10:00"}),
    S(ph,"step","Takes blood sample","va"),
    S(ph,"decision","Labels match the patient?","nnva",{noTo:c4.id,noLabel:"No, relabel"}),
    S(po,"step","Sample waits in tray for porter round","nva",{issue:"Porter round only hourly"}),
    S(po,"step","Carries samples to the lab","nnva"),
    S(lab,"step","Sample waits to be booked in","nva"),
    S(lab,"step","Books in and analyses sample","va"),
    S(cl,"step","Result waits in inbox","nva",{issue:"Only reviewed at end of clinic"}),
    S(cl,"step","Reviews result and decides action","va"),
    S(pt,"terminator","Patient told the result","")
  ]};
  const fp=L("Patient",true),fph=L("Phlebotomist"),flab=L("Laboratory"),fcl=L("Clinician");
  const fut={lanes:[fp,fph,flab,fcl],steps:[
    S(fp,"terminator","Patient arrives at booked slot",""),
    S(fp,"step","Checks in at the kiosk","nnva"),
    S(fp,"step","Waits to be called","nva",{issue:"Booked slots spread the morning peak"}),
    S(fph,"step","Prints labels at the chair from the e-request","nnva"),
    S(fph,"step","Takes and labels sample at the chair","va"),
    S(fph,"step","Sends sample by air tube","nnva"),
    S(flab,"step","Sample waits to be booked in","nva"),
    S(flab,"step","Books in and analyses sample","va"),
    S(fcl,"step","Result flagged and waits for review","nva"),
    S(fcl,"step","Reviews result and decides action","va"),
    S(fp,"terminator","Patient told the result in the app","")
  ]};
  return {title:"Outpatient blood test, arrival to result",scope:{start:"Patient arrives for a blood test",end:"Patient is told the result",who:"Adult outpatients with a routine blood test request"},
    active:"current",maps:{current:cur,future:fut},view:{issues:true}};
}

/* ---------- persistence ---------- */
/* The tool always opens on a fresh one-lane map rather than restoring the last map in this
   tab. Work is kept by saving a project file. Anything older versions kept in the browser is cleared. */
try{sessionStorage.removeItem(KEY);localStorage.removeItem(KEY);}catch(e){}
function persist(){}
function normMap(m){
  if(!m||typeof m!=="object") return null;
  const idmap={};
  let lanes=Array.isArray(m.lanes)?m.lanes.map(l=>{const n=L(String((l&&l.name)||"Lane"),l&&l.patient);idmap["L"+(l&&l.id)]=n.id;return n;}):[];
  if(!lanes.length) lanes=[L("Patient",true)];
  const steps=(Array.isArray(m.steps)?m.steps:[]).map(s=>{
    s=s||{};
    const legacy=s.type==="branch"; // older maps had a New path step type
    /* older maps also had a Wait / queue type: it opens as a non-value-adding activity */
    const wait=s.type==="wait", value=VALUES[s.value]!==undefined?s.value:"";
    const n=S(idmap["L"+s.lane]||lanes[0].id,legacy||wait?"step":TYPES[s.type]?s.type:"step",String(s.text||""),wait&&!value?"nva":value,
      {issue:String(s.issue||""),yesLabel:String(s.yesLabel||"Yes"),noLabel:String(s.noLabel||"No"),
       depth:legacy?Math.max(1,Math.floor(+s.depth||1)):Math.max(0,Math.floor(+s.depth||0))});
    idmap["S"+s.id]=n.id; n._old=s.noTo; n._then=s.thenTo; return n;
  });
  steps.forEach(n=>{
    n.noTo=n._old&&idmap["S"+n._old]?idmap["S"+n._old]:"";
    n.thenTo=n._then==="end"?"end":n._then&&idmap["S"+n._then]?idmap["S"+n._then]:"";
    delete n._old; delete n._then;
  });
  syncDepth(steps);
  return {lanes:lanes,steps:steps};
}
function normalise(o){
  if(!o||typeof o!=="object"||!o.maps) throw new Error("bad");
  const s=blank();
  s.title=String(o.title||"");
  const sc=o.scope||{}; s.scope={start:String(sc.start||""),end:String(sc.end||""),who:String(sc.who||"")};
  s.maps.current=normMap(o.maps.current)||blankMap();
  s.maps.future=o.maps.future?normMap(o.maps.future):null;
  s.active=o.active==="future"&&s.maps.future?"future":"current";
  const v=o.view||{}; s.view={issues:v.issues!==false};
  return s;
}
function cloneMap(m){return normMap(JSON.parse(JSON.stringify(m)));}

let state=blank();
let selected=null, zoom=1, autoFit=true, laneTipsOpen=false;
const map=()=>state.maps[state.active];
const laneOf=(m,id)=>m.lanes.find(l=>l.id===id)||m.lanes[0];


/* ---------- flow ----------
   Steps run in list order, and each has a path level: 0 is the usual path.
   Steps one level deeper straight after a decision are its "no" route, a new
   path; the decision's "yes" carries on along its own path. Any kind of step
   can sit on a path, including another decision with a new path of its own.
   At its end a path rejoins the path it came from, goes on to a chosen step,
   loops back to an earlier one or ends. */
/* A step can be at most one level deeper than a decision just before it, and
   no deeper than any other step before it */
function levels(st){
  const dep=[];
  st.forEach((s,i)=>{
    const want=Math.max(0,Math.floor(+s.depth||0));
    dep[i]=Math.min(want,i===0?0:dep[i-1]+(st[i-1].type==="decision"?1:0));
  });
  return dep;
}
function syncDepth(st){const d=levels(st);st.forEach((s,i)=>s.depth=d[i]);}
function flow(m){
  const st=m.steps, n=st.length, idx={}, edges=[], runs={}, ends=[], owner=[], last=[];
  st.forEach((s,i)=>idx[s.id]=i);
  const dep=levels(st), open=[];
  st.forEach((s,i)=>{owner[i]=dep[i]>0?open[dep[i]-1]:-1; open[dep[i]]=i;});
  const next=i=>{for(let j=i+1;j<n;j++) if(dep[j]<=dep[i]) return j; return -1;};
  /* where the path a step is on carries on after the decision it came from */
  const rejoin=i=>{const o=owner[i]; if(o<0) return {to:-1}; const c=cont(o); return c.to>=0?{to:c.to,kind:c.kind==="back"?"back":"rejoin"}:c;};
  function cont(i){
    const j=next(i);
    if(j>=0&&dep[j]===dep[i]) return {to:j,kind:"seq"};
    if(dep[i]===0) return {to:-1};
    const s=st[i];
    if(s.thenTo==="end") return {to:-1,end:true};
    const t=s.thenTo?idx[s.thenTo]:undefined;
    if(t!==undefined&&t!==i) return {to:t,kind:t<i?"back":"rejoin"};
    return rejoin(i);
  }
  for(let i=0;i<n;i++){
    const s=st[i], isD=s.type==="decision", j=next(i), c=cont(i);
    last[i]=dep[i]>0&&(j<0||dep[j]<dep[i]);
    if(isD&&i+1<n&&dep[i+1]===dep[i]+1){
      runs[i]={first:i+1};
      edges.push({a:i,b:i+1,kind:"no"});
      if(c.to>=0) edges.push({a:i,b:c.to,kind:c.kind==="seq"?"yes":c.kind,yes:true});
      else if(c.end) ends.push(i);
      continue;
    }
    const yes=isD&&!!s.noTo;
    if(c.to>=0) edges.push({a:i,b:c.to,kind:c.kind==="seq"?(yes?"yes":"seq"):c.kind,yes:yes});
    else if(c.end) ends.push(i);
  }
  /* Step labels follow the yes route: 1, 2, 3… along the usual path. A decision's new
     path takes its number plus a letter (3a, 3b); a path from a decision on that path
     adds a number (3b1, 3b2), then letters again */
  const labels=[], kids={}; let num=0;
  const letters=k=>{let t="";k++;while(k>0){k--;t=String.fromCharCode(97+k%26)+t;k=Math.floor(k/26);}return t;};
  st.forEach((s,i)=>{
    if(dep[i]===0){labels[i]=String(++num);return;}
    const o=owner[i], k=kids[o]=(kids[o]||0)+1;
    labels[i]=labels[o]+(dep[i]%2?letters(k-1):String(k));
  });
  const pathEnd=i=>{let j=i;while(j+1<n&&dep[j+1]>dep[i]) j++;return j;};
  return {idx:idx,dep:dep,owner:owner,runs:runs,edges:edges,ends:ends,labels:labels,last:last,rejoin:rejoin,pathEnd:pathEnd};
}

/* ---------- metrics ---------- */
function metrics(m){
  const r={steps:0,patient:0,handoffs:0,decisions:0,va:0,nnva:0,nva:0,unc:0,loops:0,paths:0,issues:0,hasPatient:m.lanes.some(isPat)};
  const pl={}; m.lanes.forEach(l=>pl[l.id]=isPat(l));
  const F=flow(m), idx=F.idx;
  /* a path that loops back is rework, so like a rework loop it isn't counted as a hand-off */
  F.edges.forEach(e=>{if(e.kind==="back") r.loops++; else if(m.steps[e.a].lane!==m.steps[e.b].lane) r.handoffs++;});
  r.paths=Object.keys(F.runs).length;
  m.steps.forEach((s,i)=>{
    if(s.issue&&s.issue.trim()) r.issues++;
    if(s.type==="terminator") return;
    r.steps++;
    if(pl[s.lane]) r.patient++;
    if(s.type==="decision"){r.decisions++; if(!F.runs[i]&&s.noTo&&idx[s.noTo]!==undefined&&idx[s.noTo]<i) r.loops++;}
    if(s.value) r[s.value]++; else r.unc++;
  });
  return r;
}

/* ---------- text wrapping ---------- */
const mctx=document.createElement("canvas").getContext("2d");
function wrap(text,maxW,font,maxLines){
  mctx.font=font;
  const words=String(text||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
  const lines=[]; let cur="";
  words.forEach(w=>{const t=cur?cur+" "+w:w; if(!cur||mctx.measureText(t).width<=maxW) cur=t; else {lines.push(cur);cur=w;}});
  if(cur) lines.push(cur);
  if(lines.length>maxLines){
    const out=lines.slice(0,maxLines); let last=out[maxLines-1];
    while(last.length>1&&mctx.measureText(last+"…").width>maxW) last=last.slice(0,-1);
    out[maxLines-1]=last.trim()+"…"; return out;
  }
  return lines;
}

/* ---------- layout (SVG) ---------- */
function layout(m,o){
  o=o||{};
  const v=state.view, ex=!!o.export;
  const steps=m.steps, lanes=m.lanes, n=steps.length;
  /* with only one lane there's nothing to tell apart, so the lane label column is left out */
  const one=lanes.length===1;
  const LHW=one?0:150, COLW=172, BW=138, X0=LHW+14, TOP=70;
  const li={}; lanes.forEach((l,i)=>li[l.id]=i);
  const F=flow(m), idx=F.idx;
  const G=steps.map((s,i)=>{
    const isD=s.type==="decision";
    const txt=s.text.trim()||(s.type==="terminator"?(i===0?"Start":"End"):"(no text yet)");
    const lines=wrap(txt,isD?86:BW-22,"600 13px "+FF,isD?4:5);
    const h=isD?Math.max(92,lines.length*15+58):Math.max(s.type==="terminator"?44:58,lines.length*16+(s.type==="terminator"?22:30));
    let note=null;
    if(v.issues&&s.issue&&s.issue.trim()){const nl=wrap(s.issue,BW-16,"500 11.5px "+FF,4);note={lines:nl,h:nl.length*14+14};}
    return {s:s,i:i,lines:lines,empty:!s.text.trim(),h:h,lane:li[s.lane]!==undefined?li[s.lane]:0,note:note,cx:X0+i*COLW+COLW/2,dep:F.dep[i]};
  });
  /* Each lane has a main row, then a row below it for each path level used in that lane */
  const LN=lanes.map(()=>({rowH:{0:0},noteH:0,loops:0}));
  G.forEach(g=>{const d=LN[g.lane];d.rowH[g.dep]=Math.max(d.rowH[g.dep]||0,g.h);if(g.note)d.noteH=Math.max(d.noteH,g.note.h+14);});
  const loopK={};
  G.forEach(g=>{if(g.s.type==="decision"&&!F.runs[g.i]&&g.s.noTo&&idx[g.s.noTo]!==undefined&&idx[g.s.noTo]!==g.i){loopK[g.i]=LN[g.lane].loops++;}});
  /* a new path that loops back runs along the bottom of its last step's lane, like a rework loop */
  const backK={};
  F.edges.forEach(e=>{if(e.kind==="back") backK[e.a]=LN[G[e.a].lane].loops++;});
  let y=TOP;
  LN.forEach(d=>{
    d.top=y; d.rowCy={}; let cur=y+d.noteH+24;
    Object.keys(d.rowH).map(Number).sort((a,b)=>a-b).forEach((k,ix)=>{const h=d.rowH[k]||40; if(ix) cur+=30; d.rowCy[k]=cur+h/2; cur+=h;});
    d.bottom=cur+(d.loops?30+d.loops*9:24);
    y=d.bottom;
  });
  G.forEach(g=>{g.cy=LN[g.lane].rowCy[g.dep];});
  const lanesBottom=y;
  const W=Math.max(X0+n*COLW+24,720);
  let p=[];
  p.push('<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#425563"/></marker>'+
    '<marker id="ahl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#6A4C93"/></marker>'+
    '<marker id="ahp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="'+PATH+'"/></marker></defs>');
  /* title */
  const sub=(state.active==="future"&&!o.forceCurrent?"Redesign (to be)":"Current process (as is)")+
    (state.scope.start||state.scope.end?"   From: "+(state.scope.start||"?")+"   To: "+(state.scope.end||"?"):"");
  p.push('<text x="20" y="32" font-family="'+FF+'" font-size="19" font-weight="800" fill="#212B32">'+esc(state.title||"Process map")+'</text>');
  p.push('<text x="20" y="54" font-family="'+FF+'" font-size="12.5" fill="#4C6272">'+esc(sub)+'</text>');
  /* lanes */
  lanes.forEach((l,i)=>{
    const d=LN[i], h=d.bottom-d.top;
    p.push('<rect x="0" y="'+d.top+'" width="'+W+'" height="'+h+'" fill="'+(!one&&isPat(l)?"#F2F7FC":(i%2?"#F7F9FA":"#FFFFFF"))+'"/>');
    if(!one){
    p.push('<rect x="0" y="'+d.top+'" width="'+LHW+'" height="'+h+'" fill="'+(isPat(l)?"#003087":"#E6F0FA")+'"/>');
    const nl=wrap(l.name||"Lane",LHW-24,"700 13.5px "+FF,4);
    const ty=d.top+h/2-(nl.length-1)*8+5;
    nl.forEach((t,k)=>p.push('<text x="14" y="'+(ty+k*16)+'" font-family="'+FF+'" font-size="13.5" font-weight="700" fill="'+(isPat(l)?"#FFFFFF":"#003087")+'">'+esc(t)+'</text>'));
    }
    p.push('<line x1="0" y1="'+d.bottom+'" x2="'+W+'" y2="'+d.bottom+'" stroke="#D8DDE0"/>');
  });
  p.push('<line x1="0" y1="'+TOP+'" x2="'+W+'" y2="'+TOP+'" stroke="#D8DDE0"/>');
  /* sequence arrows, including a decision's yes and new path routes */
  const GAP=(COLW-BW)/2;
  F.edges.forEach(e=>{
    const a=G[e.a], b=G[e.b], bx=b.cx-BW/2;
    if(e.kind==="back"){
      /* down to the lane's loop channel, back along it, then into the earlier step from below (or above) */
      const ch=LN[a.lane].bottom-14-backK[e.a]*9, sy=a.cy+a.h/2, isD=b.s.type==="decision", off=isD?14:10;
      const tx=b.cx-off;
      const ey=b.lane<=a.lane?(isD?b.cy+b.h/2*(1-off/(BW/2)):b.cy+b.h/2)+1:(isD?b.cy-b.h/2*(1-off/(BW/2)):b.cy-b.h/2)-1;
      p.push('<path d="M'+a.cx+","+sy+"V"+ch+"H"+tx+"V"+ey+'" fill="none" stroke="'+PATH+'" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#ahp)"/>');
      return;
    }
    const onP=e.kind==="no"||a.dep>0||e.kind==="rejoin", col=onP?PATH:"#425563";
    let d;
    if(e.kind==="no"){
      /* leave from the diamond's bottom (or top) point, then across to the path */
      const down=b.cy>=a.cy, sy=down?a.cy+a.h/2:a.cy-a.h/2;
      d="M"+a.cx+","+sy+"V"+b.cy+"H"+(bx-1);
      p.push('<text x="'+(a.cx+6)+'" y="'+(down?sy+13:sy-5)+'" font-family="'+FF+'" font-size="11" font-weight="700" fill="'+PATH+'">'+esc(a.s.noLabel||"No")+'</text>');
    } else {
      const ax=a.cx+BW/2;
      if(a.cy===b.cy) d="M"+ax+","+a.cy+"H"+(bx-1);
      else{
        /* turn in the gap next to the step that's skipped from (yes) or joined (rejoin), clear of other boxes */
        const mx=e.kind==="rejoin"?bx-GAP:ax+GAP;
        d="M"+ax+","+a.cy+"H"+mx+"V"+b.cy+"H"+(bx-1);
      }
      /* the label goes on the side away from where the arrow turns */
      if(e.yes) p.push('<text x="'+(ax+3)+'" y="'+(b.cy<a.cy?a.cy+14:a.cy-6)+'" font-family="'+FF+'" font-size="11" font-weight="700" fill="'+col+'">'+esc(a.s.yesLabel||"Yes")+'</text>');
    }
    p.push('<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.6" marker-end="url(#'+(onP?"ahp":"ah")+')"/>');
  });
  /* a new path that ends: short arrow to an end point */
  const pathEnds=F.ends.length>0;
  F.ends.forEach(k=>{
    const g=G[k], x=g.cx+BW/2;
    p.push('<path d="M'+x+","+g.cy+"H"+(x+10)+'" fill="none" stroke="'+PATH+'" stroke-width="1.6" marker-end="url(#ahp)"/>');
    p.push('<circle cx="'+(x+20)+'" cy="'+g.cy+'" r="8" fill="#fff" stroke="'+PATH+'" stroke-width="1.6"/><circle cx="'+(x+20)+'" cy="'+g.cy+'" r="4.5" fill="'+PATH+'"/>');
  });
  /* rework loops */
  G.forEach(a=>{
    if(loopK[a.i]===undefined) return;
    const t=G[idx[a.s.noTo]];
    const ch=LN[a.lane].bottom-14-loopK[a.i]*9;
    const sy=a.cy+a.h/2;
    const ey=t.lane<=a.lane?t.cy+t.h/2+1:t.cy-t.h/2-1;
    const tx=t.cx+(t.i<a.i?-10:10);
    p.push('<path d="M'+a.cx+","+sy+"V"+ch+"H"+tx+"V"+ey+'" fill="none" stroke="#6A4C93" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#ahl)"/>');
    p.push('<text x="'+(a.cx+6)+'" y="'+(sy+13)+'" font-family="'+FF+'" font-size="11" font-weight="700" fill="#6A4C93">'+esc(a.s.noLabel||"No")+'</text>');
  });
  /* notes */
  G.forEach(g=>{
    if(!g.note) return;
    const d=LN[g.lane], nx=g.cx-BW/2+6, ny=d.top+8, nh=g.note.h, bt=g.cy-g.h/2;
    p.push('<line x1="'+g.cx+'" y1="'+(ny+nh)+'" x2="'+g.cx+'" y2="'+bt+'" stroke="#B88A00" stroke-dasharray="2 3"/>');
    p.push('<rect x="'+nx+'" y="'+ny+'" width="'+(BW-12)+'" height="'+nh+'" fill="#FFE68A" stroke="#E0B400" transform="rotate(-1.2 '+(nx+BW/2)+' '+(ny+nh/2)+')"/>');
    g.note.lines.forEach((t,k)=>p.push('<text x="'+(nx+7)+'" y="'+(ny+16+k*14)+'" font-family="'+FF+'" font-size="11.5" font-weight="500" fill="#3D2E00">'+esc(t)+'</text>'));
  });
  /* boxes */
  G.forEach(g=>{
    const s=g.s, x=g.cx-BW/2, top=g.cy-g.h/2, c=VCOL[s.value||""];
    const fill=s.type==="terminator"?"#FFFFFF":c.fill;
    const stroke=g.dep>0?PATH:"#425563", sw=g.dep>0?2:1.5;
    let shape;
    if(s.type==="decision") shape='<path d="M'+g.cx+","+top+"L"+(x+BW)+","+g.cy+"L"+g.cx+","+(top+g.h)+"L"+x+","+g.cy+'Z"';
    else if(s.type==="terminator") shape='<rect x="'+x+'" y="'+top+'" width="'+BW+'" height="'+g.h+'" rx="'+Math.min(22,g.h/2)+'"';
    else shape='<rect x="'+x+'" y="'+top+'" width="'+BW+'" height="'+g.h+'" rx="4"';
    p.push('<g class="box" data-id="'+s.id+'">');
    if(!ex&&selected===s.id) p.push(shape+' fill="none" stroke="#FFB81C" stroke-width="9" stroke-linejoin="round"/>');
    p.push(shape+' fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+'/>');
    const lh=s.type==="decision"?15:16, by=g.cy-(g.lines.length-1)*lh/2+(s.type==="step"?1.5:4.5);
    g.lines.forEach((t,k)=>p.push('<text x="'+g.cx+'" y="'+(by+k*lh)+'" text-anchor="middle" font-family="'+FF+'" font-size="13" font-weight="600" '+(g.empty?'font-style="italic" fill="#768692"':'fill="#212B32"')+'>'+esc(t)+'</text>'));
    /* step label badge: a circle for 1-digit labels, a pill for longer ones such as 12 or 3a */
    const lab=F.labels[g.i], bw=Math.max(20,lab.length*6.5+9), bfill=g.dep>0?PATH:"#003087";
    const bx=s.type==="decision"?g.cx-26:x+2, byy=s.type==="decision"?top+16:top+2;
    p.push('<rect x="'+(bx-bw/2)+'" y="'+(byy-10)+'" width="'+bw+'" height="20" rx="10" fill="'+bfill+'"/><text x="'+bx+'" y="'+(byy+4)+'" text-anchor="middle" font-family="'+FF+'" font-size="10.5" font-weight="800" fill="#fff">'+esc(lab)+'</text>');
    /* value tag */
    if(s.value&&s.type!=="terminator"){
      const vx=s.type==="decision"?g.cx:x+BW-6, vy=s.type==="decision"?top+g.h-16:top+g.h-6;
      p.push('<text x="'+vx+'" y="'+vy+'" text-anchor="'+(s.type==="decision"?"middle":"end")+'" font-family="'+FF+'" font-size="9.5" font-weight="800" fill="'+c.ink+'">'+VSHORT[s.value]+'</text>');
    }
    p.push('</g>');
  });
  let y2=lanesBottom;
  const M=metrics(m);
  /* legend */
  const ly=y2+18; let lx=14;
  const leg=(sw,label)=>{p.push(sw(lx,ly));p.push('<text x="'+(lx+22)+'" y="'+(ly+4)+'" font-family="'+FF+'" font-size="11.5" fill="#4C6272">'+esc(label)+'</text>');mctx.font="11.5px "+FF;lx+=22+mctx.measureText(label).width+18;};
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#E3F2E9" stroke="#007F3B"/>',"Value-adding (VA)");
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#FFF4DB" stroke="#FFB81C"/>',"Necessary, non-value-adding (NNVA)");
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#FBE7E5" stroke="#D5281B"/>',"Non-value-adding (NVA)");
  if(M.paths) leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#FFFFFF" stroke="'+PATH+'" stroke-width="2"/>',"New path (decision's no route)");
  if(pathEnds) leg((x,y)=>'<circle cx="'+(x+8)+'" cy="'+y+'" r="7" fill="#fff" stroke="'+PATH+'" stroke-width="1.5"/><circle cx="'+(x+8)+'" cy="'+y+'" r="4" fill="'+PATH+'"/>',"Path ends");
  if(Object.keys(backK).length) leg((x,y)=>'<line x1="'+x+'" y1="'+y+'" x2="'+(x+16)+'" y2="'+y+'" stroke="'+PATH+'" stroke-width="2" stroke-dasharray="4 3"/>',"Path loops back");
  if(Object.keys(loopK).length) leg((x,y)=>'<line x1="'+x+'" y1="'+y+'" x2="'+(x+16)+'" y2="'+y+'" stroke="#6A4C93" stroke-width="2" stroke-dasharray="4 3"/>',"Rework loop");
  const H=ly+20;
  const Wf=Math.max(W,lx+10);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+Wf+' '+H+'" width="'+Wf+'" height="'+H+'" role="img" aria-label="'+esc((state.title||"Process map")+", "+n+" steps")+'"><rect width="'+Wf+'" height="'+H+'" fill="#FFFFFF"/>'+p.join("")+'</svg>';
  return {svg:svg,W:Wf,H:H};
}

/* ---------- canvas ---------- */
const wrapEl=$("#canvasWrap"), canvasEl=$("#canvas");
function renderCanvas(){
  const m=map();
  if(!m){
    canvasEl.style.display="block";
    canvasEl.innerHTML='<div class="empty-map" style="line-height:1.5"><h2>No redesign yet</h2><p>When you have analysed the current process, start the to-be map here. You can copy the current map and change it, or start from a blank sheet.</p><div class="actions"><button class="btn primary" type="button" data-start="copy">Copy current map</button><button class="btn" type="button" data-start="blank">Start blank</button></div></div>';
    canvasEl.style.background="transparent";canvasEl.style.border="0";canvasEl.style.boxShadow="none";
    $("#zoomLabel").textContent="–"; return;
  }
  canvasEl.style.background="";canvasEl.style.border="";canvasEl.style.boxShadow="";
  const Lr=layout(m);
  /* Fit: in full screen the map is as big as the screen allows; otherwise it fits the width */
  if(autoFit){
    const aw=wrapEl.clientWidth-34, ah=wrapEl.clientHeight-34;
    zoom=isFull()?Math.max(.2,Math.min(3,aw/Lr.W,ah/Lr.H)):Math.max(.6,Math.min(1,aw/Lr.W));
  }
  canvasEl.innerHTML=Lr.svg;
  const svg=canvasEl.querySelector("svg");
  svg.setAttribute("width",Math.round(Lr.W*zoom)); svg.setAttribute("height",Math.round(Lr.H*zoom));
  $("#zoomLabel").textContent=Math.round(zoom*100)+"%";
  updatePanCursor();
  if(hasContent()) trackChart({points:m.steps.length,map:state.active});
}
canvasEl.addEventListener("click",e=>{
  const st=e.target.closest("[data-start]"); if(st){startRedesign(st.dataset.start);return;}
  const g=e.target.closest("g.box"); if(!g) return;
  selected=g.dataset.id; showTab("build"); renderCanvas(); markSel();
  const card=document.querySelector('.step[data-id="'+selected+'"]');
  if(card){card.scrollIntoView({block:"nearest",behavior:"smooth"}); const t=card.querySelector(".t"); if(t) t.focus({preventScroll:true});}
});
$("#zoomIn").addEventListener("click",()=>{autoFit=false;zoom=Math.min(3,zoom*1.2);renderCanvas();});
$("#zoomOut").addEventListener("click",()=>{autoFit=false;zoom=Math.max(.2,zoom/1.2);renderCanvas();});
$("#zoomFit").addEventListener("click",()=>{autoFit=true;renderCanvas();});
let rz; window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(autoFit)renderCanvas();else updatePanCursor();},120);});

/* ---------- move around the map by dragging ----------
   The map sits in its own window, the height of the browser window, which
   stays in view as the page scrolls. Drag anywhere in it to move the map
   inside it, sideways and up and down; the page itself doesn't move. A click
   without a drag still opens a step. Move (or holding Space) is the hand tool:
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
  /* Only take over the pointer once it's a drag, so a plain click still reaches the map */
  if(!dragged){dragged=true; wrapEl.setPointerCapture(e.pointerId); wrapEl.classList.add("grabbing");}
  drag.x=e.clientX; drag.y=e.clientY;
  wrapEl.scrollLeft-=dx; wrapEl.scrollTop-=dy;
});
function endDrag(e){if(!drag||e.pointerId!==drag.id) return; drag=null; wrapEl.classList.remove("grabbing");}
wrapEl.addEventListener("pointerup",endDrag);
wrapEl.addEventListener("pointercancel",endDrag);
/* Clicking a step opens its editor beside the map, so leave full screen first */
wrapEl.addEventListener("click",e=>{if(isFull()&&!dragged&&!handOn()&&e.target.closest("g.box")) setFull(false);},true);
/* A drag, or any click with the hand on, should not select anything */
wrapEl.addEventListener("click",e=>{
  if(dragged||handOn()&&!e.target.closest("button,a,input")){e.stopPropagation();e.preventDefault();}
  dragged=false;
},true);
/* Arrow keys move the map once its window has focus */
wrapEl.addEventListener("keydown",e=>{
  if(e.target!==wrapEl) return;
  const step=e.shiftKey?200:60;
  const k={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
  if(!k) return;
  e.preventDefault();
  wrapEl.scrollLeft+=k[0]; wrapEl.scrollTop+=k[1];
});
/* Full screen: the map window fills the screen, with the same drag and zoom.
   Where a browser can't put part of a page full screen (iPhone Safari), the
   window fills the browser window instead. Esc leaves either. */
function isFull(){return document.fullscreenElement===stageEl||stageEl.classList.contains("full");}
function fullChanged(){
  const on=isFull();
  fullBtn.setAttribute("aria-pressed",on);
  fullBtn.querySelector("span").textContent=on?"Exit full screen":"Full screen";
  document.body.classList.toggle("ft-full",stageEl.classList.contains("full"));
  autoFit=true;
  requestAnimationFrame(()=>renderCanvas());
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
["Issues"].forEach(k=>{
  const el=$("#v"+k), key=k.toLowerCase();
  el.addEventListener("change",()=>{state.view[key]=el.checked;persist();renderCanvas();});
});

/* ---------- map switch ---------- */
function setActive(a){state.active=a;selected=null;autoFit=true;persist();renderAll();}
$("#mapCur").addEventListener("click",()=>setActive("current"));
$("#mapFut").addEventListener("click",()=>setActive("future"));
function startRedesign(how){
  state.maps.future=how==="copy"?cloneMap(state.maps.current):blankMap();
  state.active="future"; selected=null; autoFit=true; persist(); renderAll();
  toast(how==="copy"?"Copied the current map. Change it into your redesign.":"Started a blank redesign");
}

/* ---------- editor ---------- */
function autosize(el){el.style.height="auto";el.style.height=(el.scrollHeight+2)+"px";}
function renderEditing(){
  const fut=state.active==="future";
  $("#editingBar").innerHTML='<span>Editing <b>'+(fut?"Redesign (to be)":"Current process (as is)")+'</b></span>'+
    (fut&&state.maps.future?'<button class="btn small ghost danger" type="button" id="delFuture">Delete redesign</button>':(!fut?'<button class="btn small ghost" type="button" id="goFuture">Go to redesign</button>':""));
  const d=$("#delFuture"); if(d) d.addEventListener("click",()=>{if(!confirm("Delete the redesign map? The current map is kept."))return;state.maps.future=null;setActive("current");});
  const g=$("#goFuture"); if(g) g.addEventListener("click",()=>setActive("future"));
}
/* Steps are referred to by name, not number. Elements that show a step's name carry
   data-name-of (and data-pre for any leading words) so they update as the name is typed. */
function nameOf(s){
  const t=String((s&&s.text)||"").replace(/\s+/g," ").trim(), short=t.length>45?t.slice(0,44).trim()+"…":t;
  /* start and end shapes are named Start or End, with their wording after it */
  if(s&&s.type==="terminator"){const m=map(), first=!m||m.steps.indexOf(s)===0, k=first?"Start":"End"; return t?k+": "+short:k;}
  return t?short:"(untitled step)";
}
function nameAttr(o,pre){return ' data-name-of="'+o.id+'"'+(pre?' data-pre="'+esc(pre)+'"':"");}
function refreshNames(s){document.querySelectorAll('[data-name-of="'+s.id+'"]').forEach(el=>{el.textContent=(el.dataset.pre||"")+nameOf(s)+(el.dataset.post||"");});}
function laneOptions(m,sel){return m.lanes.map(l=>'<option value="'+l.id+'"'+(l.id===sel?" selected":"")+'>'+esc(l.name||"Unnamed lane")+'</option>').join("");}
function stepCard(m,s,i,F){
  const isT=s.type==="terminator", isD=s.type==="decision", d=F.dep[i], run=isD?F.runs[i]:null;
  const opt=(o,sel,pre)=>'<option value="'+o.id+'"'+(sel?" selected":"")+nameAttr(o,pre)+'>'+esc((pre||"")+nameOf(o))+'</option>';
  /* where a decision's no route goes: back to an earlier step, or down the new path that follows it */
  /* a decision's no route: a new path (the default), carry on, or go to another step */
  const others=m.steps.map((o,k)=>o.id===s.id||(run&&k>i&&k<=F.pathEnd(i))?"":opt(o,!run&&o.id===s.noTo,F.labels[k]+". ")).join(""); // numbered, e.g. "3. Triage referral"
  const noRow=!isD?"":
    '<div class="row2"><label>If no, go to<select class="field sm nt"><option value=""'+(!run&&!s.noTo?" selected":"")+'>Carry on (no loop)</option><option value="__path"'+(run?" selected":"")+'>A new path</option>'+(others?'<optgroup label="Go to a step">'+others+'</optgroup>':"")+'</select></label><label>No label<input class="field sm nl" type="text"></label></div>';
  /* the last step on a path says where the path goes next */
  let pathRow="";
  if(F.last[i]){
    const r=F.rejoin(i), pre=r.to>=0&&F.dep[r.to]===0?"Rejoin the usual path at ":"Rejoin the path above at ";
    const later=m.steps.map((o,k)=>k>i&&k!==r.to?opt(o,o.id===s.thenTo,"Go to "):"").join("");
    const earlier=m.steps.map((o,k)=>k<i?opt(o,o.id===s.thenTo,"Go back to "):"").join("");
    pathRow='<div class="row1"><label>'+(run?"If yes, at the end of this path":"At the end of this path")+'<select class="field sm th">'+
      (r.to>=0?'<option value=""'+nameAttr(m.steps[r.to],pre)+'>'+esc(pre+nameOf(m.steps[r.to]))+'</option>':'<option value="">'+(r.end?"End, as the path above does":"Rejoin the usual path")+'</option>')+
      '<option value="end"'+(s.thenTo==="end"?" selected":"")+'>End the path here</option>'+
      (later?'<optgroup label="Go on to a later step">'+later+'</optgroup>':"")+
      (earlier?'<optgroup label="Loop back (rework)">'+earlier+'</optgroup>':"")+'</select></label></div>';
  }
  /* moving a step onto or off a path */
  const canIn=i>0&&F.dep[i-1]+(m.steps[i-1].type==="decision"?1:0)>d;
  const moves=(d>0?'<button class="btn small ghost" data-act="out" type="button">Move off path</button>':"")+(canIn?'<button class="btn small ghost" data-act="in" type="button">Move onto path</button>':"");
  return '<div class="step t-'+s.type+(d?" on-path":"")+(s.value&&!isT?" v-"+s.value:"")+(selected===s.id?" sel":"")+'" data-id="'+s.id+'"'+(d?' style="margin-left:'+(d*1.3)+'rem"':"")+'>'+
    '<div class="step-head"><span class="num" aria-hidden="true">'+esc(F.labels[i])+'</span>'+
    '<select class="field sm ty" aria-label="Step '+F.labels[i]+' type">'+Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(k===s.type?" selected":"")+'>'+TYPES[k]+'</option>').join("")+'</select>'+
    '<select class="field sm la" aria-label="Step '+F.labels[i]+' lane">'+laneOptions(m,s.lane)+'</select>'+
    '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move step '+F.labels[i]+' up">↑</button>'+
    '<button class="btn icon ghost" data-act="down" type="button" aria-label="Move step '+F.labels[i]+' down">↓</button>'+
    '<button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove step '+F.labels[i]+'">✕</button></div>'+
    '<textarea class="field t" rows="1" aria-label="Step '+F.labels[i]+' description" placeholder="'+(isT?(i===0?"Where the process starts":"Where the process ends"):isD?"A yes or no question":d?"What happens on this path? Start with a verb":"What happens? Start with a verb")+'"></textarea>'+
    noRow+pathRow+
    '<input class="field measure issue is" type="text" aria-label="Issue for step '+F.labels[i]+'" placeholder="Issue or frustration (optional)">'+
    (isT?"":'<div class="row1"><label>Value<select class="field sm va">'+Object.keys(VALUES).map(k=>'<option value="'+k+'"'+(k===(s.value||"")?" selected":"")+'>'+VALUES[k]+'</option>').join("")+'</select></label></div>')+
    '<div class="step-foot"><span></span>'+
    '<span class="foot-btns">'+moves+
    '<button class="btn small" data-act="ins" type="button">'+(d?"Add path step below":"Add step below")+'</button>'+
    '<button class="btn small" data-act="branch" type="button">Add new branch</button></span></div></div>';
}
function renderEditor(){
  renderEditing();
  const m=map(), host=$("#mapEditor");
  if(!m){
    host.innerHTML='<div class="empty" style="margin-top:1rem">No redesign yet.<div class="actions" style="justify-content:center;margin-top:.7rem"><button class="btn small" type="button" data-start="copy">Copy current map</button><button class="btn small" type="button" data-start="blank">Start blank</button></div></div>';
    return;
  }
  let h='<div class="section-h"><h2>Lanes</h2><button class="btn small" id="addLane" type="button">Add lane</button></div>';
  /* with one lane, explain that swimlanes are what make hand-offs visible and countable */
  h+='<p class="hint">'+(m.lanes.length===1?'With one lane the map is a simple flowchart. To track hand-offs, turn it into a swimlane map. ':'Hand-offs are counted each time the work moves from one lane to another. ')+
    'Give each person, role, team or organisation involved its own lane, including patients, service users, carers and families.</p>';
  /* when a new lane earns its place, and when it doesn't */
  h+='<details class="lane-tips"'+(laneTipsOpen?" open":"")+'><summary>When to add a lane</summary><ul>'+
    '<li><b>Another role or team does the next step</b>, for example when the work moves from reception to a nurse.</li>'+
    '<li><b>The work crosses into a different organisation or governance structure</b>, such as another directorate, trust, provider, contractor or the local authority. Give it its own lane even if the same kind of staff do the work, so the change of accountability shows.</li>'+
    '<li><b>You want to see the patient\'s own journey</b>, including the waiting. Call that lane Patient, Service user or Carer so the steps they go through are counted.</li>'+
    '<li><b>Something travels separately</b> from the patient and has its own delays: samples, notes, referrals or an IT system.</li>'+
    '</ul><p>You don\'t need a new lane for each person (use their role), or for steps the same role does one after another. If you need more than about eight lanes, the map is probably covering too much: narrow the scope, or map the detail separately.</p></details>';
  h+='<div id="lanes">';
  m.lanes.forEach((l,i)=>{
    h+='<div class="lane-row" data-id="'+l.id+'"><input class="field ln" type="text" aria-label="Lane '+(i+1)+' name" placeholder="Role or team">'+
      '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move lane up">↑</button><button class="btn icon ghost" data-act="down" type="button" aria-label="Move lane down">↓</button><button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove lane">✕</button></div>';
  });
  h+='</div><div class="section-h"><h2>Steps</h2></div>';
  const F=flow(m);
  h+='<div id="steps">'+m.steps.map((s,i)=>stepCard(m,s,i,F)).join("")+'</div>';
  h+='<div class="actions" style="margin-top:.6rem"><button class="btn small" id="addStep" type="button">Add step at the end</button><button class="btn small" id="addBranch" type="button">Add new branch at the end</button></div>';
  h+='<p class="hint">Press Enter in a step to add the next one in the same lane. Shift+Enter starts a new line. <b>Add new branch</b> adds a decision with a new path for its "no" route. To give a decision a different "no" route, choose <b>A new path</b> in its <b>If no, go to</b> list: the yes route carries on along its own path. A path can have its own decisions and new paths.</p>';
  host.innerHTML=h;
  host.querySelectorAll(".lane-row").forEach(r=>{r.querySelector(".ln").value=laneOf(m,r.dataset.id).name;});
  host.querySelectorAll(".step").forEach(c=>{
    const s=m.steps.find(x=>x.id===c.dataset.id);
    const t=c.querySelector(".t"); t.value=s.text; autosize(t);
    c.querySelector(".is").value=s.issue||"";
    const nl=c.querySelector(".nl"); if(nl) nl.value=s.noLabel||"No";
  });
}
function markSel(){document.querySelectorAll(".step").forEach(c=>c.classList.toggle("sel",c.dataset.id===selected));}
function changed(full){const m=map(); if(m) syncDepth(m.steps); persist(); if(full) renderEditor(); renderCanvas(); renderChecks(); renderAnalysis();}

const ed=$("#mapEditor");
ed.addEventListener("toggle",e=>{if(e.target.classList&&e.target.classList.contains("lane-tips")) laneTipsOpen=e.target.open;},true);
ed.addEventListener("input",e=>{
  const m=map(); if(!m) return;
  const lr=e.target.closest(".lane-row");
  if(lr&&e.target.classList.contains("ln")){
    laneOf(m,lr.dataset.id).name=e.target.value;
    document.querySelectorAll('.step .la option[value="'+lr.dataset.id+'"]').forEach(o=>o.textContent=e.target.value||"Unnamed lane");
    changed(); return;
  }
  const c=e.target.closest(".step"); if(!c) return;
  const s=m.steps.find(x=>x.id===c.dataset.id); if(!s) return;
  const cl=e.target.classList;
  if(cl.contains("t")){s.text=e.target.value;autosize(e.target);refreshNames(s);}
  else if(cl.contains("is")) s.issue=e.target.value;
  else if(cl.contains("nl")) s.noLabel=e.target.value;
  else return;
  changed();
});
ed.addEventListener("change",e=>{
  const m=map(); if(!m) return;
  const lr=e.target.closest(".lane-row");
  const c=e.target.closest(".step"); if(!c) return;
  const s=m.steps.find(x=>x.id===c.dataset.id); if(!s) return;
  const cl=e.target.classList;
  if(cl.contains("ty")){
    const hadPath=!!flow(m).runs[m.steps.indexOf(s)];
    s.type=e.target.value;
    if(s.type!=="decision") s.noTo="";
    if(s.type==="terminator") s.value="";
    /* a new decision starts with a new path for its "no" route */
    if(s.type==="decision"&&!hadPath&&!s.noTo){addPathStep(m.steps.indexOf(s),true); focusCard(s.id,".t"); return;}
    changed(true); focusCard(s.id,".ty");
    if(hadPath&&s.type!=="decision") toast("Its new path's steps moved onto the path above.");
    return;
  }
  if(cl.contains("la")){s.lane=e.target.value;changed();return;}
  if(cl.contains("va")){s.value=e.target.value;c.className=c.className.replace(/\sv-\w+/g,"")+(s.value?" v-"+s.value:"");changed();return;}
  if(cl.contains("nt")){
    /* choosing A new path starts the decision's new path */
    const i=m.steps.indexOf(s), F=flow(m);
    if(e.target.value==="__path"){if(!F.runs[i]){s.noTo=""; addPathStep(i);} return;}
    /* moving off A new path removes the path's steps, asking first if any have been filled in */
    if(F.runs[i]){
      const gone=m.steps.slice(i+1,F.pathEnd(i)+1), used=gone.filter(x=>x.text.trim()||x.issue.trim()).length;
      if(used&&!confirm("Remove the "+gone.length+" step"+(gone.length>1?"s":"")+" on this decision's new path?")){changed(true);return;}
      const ids=gone.map(x=>x.id); m.steps.splice(i+1,gone.length);
      m.steps.forEach(x=>{if(ids.includes(x.noTo))x.noTo="";if(ids.includes(x.thenTo))x.thenTo="";});
      if(ids.includes(selected)) selected=null;
    }
    s.noTo=e.target.value; changed(true); focusCard(s.id,".nt"); return;
  }
  if(cl.contains("th")){s.thenTo=e.target.value;changed();return;}
});
ed.addEventListener("focusin",e=>{
  const c=e.target.closest(".step"); if(!c||selected===c.dataset.id) return;
  selected=c.dataset.id; markSel(); renderCanvas();
});
ed.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||e.shiftKey||!e.target.classList.contains("t")) return;
  e.preventDefault();
  const m=map(), i=m.steps.findIndex(x=>x.id===e.target.closest(".step").dataset.id);
  insertAfter(i);
});
/* last step of a step's own new path (and any paths inside it) */
function blockEnd(F,i){let j=i;while(j+1<F.dep.length&&F.dep[j+1]>F.dep[i]) j++;return j;}
/* Add a step after this one on the same path, after the step's own new path if it has one */
function insertAfter(i){
  const m=map(), ref=m.steps[i], F=flow(m);
  const ns=S(ref?ref.lane:m.lanes[0].id,"step","");
  let at=i+1;
  if(ref){
    ns.depth=F.dep[i]; at=blockEnd(F,i)+1;
    /* a new last step on a path takes over where the path goes next */
    if(F.last[i]){ns.thenTo=ref.thenTo; ref.thenTo="";}
  }
  m.steps.splice(at,0,ns); selected=ns.id; changed(true); focusCard(ns.id,".t");
}
/* Add a decision after this one on the same path, with a new path started for its "no" route */
function insertBranch(i){
  insertAfter(i);
  const m=map(), s=m.steps.find(x=>x.id===selected);
  s.type="decision"; addPathStep(m.steps.indexOf(s),true); focusCard(s.id,".t");
}
/* Add a step to a decision's new path, starting the path if it hasn't got one */
function addPathStep(i,stay){
  const m=map(), F=flow(m);
  if(F.runs[i]){let k=i+1; for(let j=i+1;j<=blockEnd(F,i);j++) if(F.dep[j]===F.dep[i]+1) k=j; return insertAfter(k);}
  const ns=S(m.steps[i].lane,"step",""); ns.depth=F.dep[i]+1;
  m.steps.splice(i+1,0,ns); if(!stay) selected=ns.id; changed(true); if(!stay) focusCard(ns.id,".t");
}
/* Move a step, with its own new path, past the step or path next to it */
function moveStep(i,dir){
  const st=map().steps, F=flow(map()), dep=F.dep, e=blockEnd(F,i), blk=st.slice(i,e+1);
  if(dir<0){
    if(i===0) return false;
    let p=i-1; while(p>0&&dep[p]>dep[i]) p--;
    if(dep[p]===dep[i]){const prev=st.slice(p,i); st.splice(p,e+1-p,...blk,...prev);}
    else{const one=st.splice(i-1,1)[0]; st.splice(e,0,one);}
  } else {
    const q=e+1; if(q>=st.length) return false;
    if(dep[q]===dep[i]){const qe=blockEnd(F,q), nxt=st.slice(q,qe+1); st.splice(i,qe+1-i,...nxt,...blk);}
    else{const one=st.splice(q,1)[0]; st.splice(i,0,one);}
  }
  return true;
}
/* Move a step, with its own new path, one level onto or off a path */
function shiftLevel(i,by){
  const st=map().steps, F=flow(map()), e=blockEnd(F,i);
  for(let j=i;j<=e;j++) st[j].depth=Math.max(0,F.dep[j]+by);
  const after=levels(st);
  if(by<0&&e+1<st.length&&after[e+1]<F.dep[e+1]&&F.dep[e+1]===F.dep[i]) toast("The steps after it on the path moved off too.");
}
function focusCard(id,sel){const c=document.querySelector('.step[data-id="'+id+'"]'); if(c){const t=c.querySelector(sel); if(t) t.focus(); c.scrollIntoView({block:"nearest"});}}
ed.addEventListener("click",e=>{
  const st=e.target.closest("[data-start]"); if(st){startRedesign(st.dataset.start);return;}
  const m=map(); if(!m) return;
  if(e.target.id==="addLane"){m.lanes.push(L("New lane"));changed(true);const rows=document.querySelectorAll(".lane-row .ln");const last=rows[rows.length-1];last.focus();last.select();return;}
  if(e.target.id==="addStep"){insertAfter(m.steps.length-1);return;}
  if(e.target.id==="addBranch"){insertBranch(m.steps.length-1);return;}
  const b=e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act;
  const lr=b.closest(".lane-row");
  if(lr){
    const i=m.lanes.findIndex(l=>l.id===lr.dataset.id);
    if(act==="up"&&i>0) [m.lanes[i-1],m.lanes[i]]=[m.lanes[i],m.lanes[i-1]];
    else if(act==="down"&&i<m.lanes.length-1) [m.lanes[i+1],m.lanes[i]]=[m.lanes[i],m.lanes[i+1]];
    else if(act==="del"){
      if(m.lanes.length<2){toast("A map needs at least one lane.");return;}
      const used=m.steps.filter(s=>s.lane===m.lanes[i].id).length;
      if(used&&!confirm(used+" step"+(used>1?"s are":" is")+" in this lane. Move "+(used>1?"them":"it")+" to the first remaining lane and remove the lane?")) return;
      const gone=m.lanes.splice(i,1)[0]; m.steps.forEach(s=>{if(s.lane===gone.id) s.lane=m.lanes[0].id;});
    } else return;
    changed(true); return;
  }
  const c=b.closest(".step"); if(!c) return;
  const i=m.steps.findIndex(x=>x.id===c.dataset.id);
  if(act==="up"||act==="down"){if(moveStep(i,act==="up"?-1:1)){changed(true);focusCard(c.dataset.id,'[data-act="'+act+'"]');}}
  else if(act==="in"||act==="out"){shiftLevel(i,act==="in"?1:-1);changed(true);focusCard(c.dataset.id,".t");}
  else if(act==="del"){
    const F=flow(m), gone=m.steps[i], e=F.runs[i]?blockEnd(F,i):i, n=e-i;
    /* a decision goes with its new path */
    if(n&&!confirm("Remove this decision and the "+n+" step"+(n>1?"s":"")+" on its new path?")) return;
    /* removing the last step on a path: the step before it on the path keeps where the path goes next */
    if(F.last[i]&&gone.thenTo){let p=i-1; while(p>=0&&F.dep[p]>F.dep[i]) p--; if(p>=0&&F.dep[p]===F.dep[i]) m.steps[p].thenTo=gone.thenTo;}
    const ids=m.steps.splice(i,n+1).map(x=>x.id);
    m.steps.forEach(s=>{if(ids.includes(s.noTo))s.noTo="";if(ids.includes(s.thenTo))s.thenTo="";});
    if(ids.includes(selected))selected=null; changed(true);
  }
  else if(act==="ins") insertAfter(i);
  else if(act==="branch") insertBranch(i);
});
/* header fields */
$("#title").addEventListener("input",e=>{state.title=e.target.value;changed();});
[["scStart","start"],["scEnd","end"],["scWho","who"]].forEach(([id,k])=>$("#"+id).addEventListener("input",e=>{state.scope[k]=e.target.value;changed();}));

/* ---------- analysis ---------- */
function renderAnalysis(){
  const cur=metrics(state.maps.current), fm=state.maps.future, fut=fm?metrics(fm):null;
  const rows=[
    ["Steps","steps",-1,0],["Steps the patient goes through","patient",-1,0,!cur.hasPatient&&!(fut&&fut.hasPatient)],["Hand-offs","handoffs",-1,0],
    ["Decisions","decisions",-1,0],["Non-value-adding steps","nva",-1,0],["Necessary non-value-adding steps","nnva",-1,0],
    ["Value-adding steps","va",0,0],["Rework loops","loops",-1,0],["New paths from decisions","paths",0,0,!cur.paths&&!(fut&&fut.paths)]
  ];
  const f=v=>String(v);
  let h='<h2 style="font-size:1.05rem;margin:0">Current versus redesign</h2><table class="metrics"><thead><tr><th>Measure</th><th>Current</th><th>Redesign</th>'+(fut?'<th>Change</th>':"")+'</tr></thead><tbody>';
  rows.forEach(([lab,key,dir,kind,hide])=>{
    if(hide) return;
    let ch="";
    if(fut){
      const d=fut[key]-cur[key], better=dir===0||d===0?"":(dir<0?d<0:d>0)?"better":"worse";
      const ds=d===0?"–":(d>0?"+":"−")+Math.abs(d);
      ch='<td class="'+better+'">'+ds+'</td>';
    }
    h+='<tr'+(key==="nva"||key==="handoffs"?' class="key"':"")+'><td>'+lab+'</td><td>'+f(cur[key],kind)+'</td><td>'+(fut?f(fut[key],kind):"–")+'</td>'+ch+'</tr>';
  });
  h+='</tbody></table>';
  if(!fut) h+='<p class="hint">Start a redesign from the map view to compare the two.</p>';
  const a=state.active==="future"&&fut?fut:cur, label=state.active==="future"&&fut?"redesign":"current process";
  const tot=a.va+a.nnva+a.nva+a.unc;
  h+='<div class="section-h"><h2>Where the value is ('+label+')</h2></div>';
  if(tot){
    const seg=(k,col)=>a[k]?'<span style="width:'+(a[k]/tot*100)+'%;background:'+col+'" title="'+VALUES[k==="unc"?"":k]+'"></span>':"";
    h+='<div class="mixbar" role="img" aria-label="'+a.va+' value-adding, '+a.nnva+' necessary, '+a.nva+' non-value-adding, '+a.unc+' not classified">'+seg("va","#007F3B")+seg("nnva","#FFB81C")+seg("nva","#D5281B")+seg("unc","#AEB7BD")+'</div>';
    h+='<div class="mixkey"><span><i style="background:#007F3B"></i>'+a.va+' VA</span><span><i style="background:#FFB81C"></i>'+a.nnva+' NNVA</span><span><i style="background:#D5281B"></i>'+a.nva+' NVA</span>'+(a.unc?'<span><i style="background:#AEB7BD"></i>'+a.unc+' not classified</span>':"")+'</div>';
  } else h+='<p class="hint">Add steps to see the value mix.</p>';
  /* prompts */
  const P=[];
  if(a.steps&&a.nva) P.push(a.nva+" of "+a.steps+" steps add no value for the patient. Which could you stop doing altogether?");
  if(a.handoffs>=3) P.push("The patient or the work changes hands "+a.handoffs+" times. Could one person or team do more of the journey?");
  if(a.loops) P.push(a.loops+" rework loop"+(a.loops>1?"s send":" sends")+" work back. Fix the cause at source rather than checking for it later.");
  if(a.paths) P.push(a.paths+" decision"+(a.paths>1?"s send":" sends")+" some cases down a new path. How often does each path happen, and what would make it unnecessary?");
  if(a.nnva) P.push("Necessary steps can still be simplified or done at the same time as something else. Look at the "+a.nnva+" amber step"+(a.nnva>1?"s":"")+".");
  if(a.issues) P.push("There "+(a.issues>1?"are ":"is ")+a.issues+" issue note"+(a.issues>1?"s":"")+" on the map. Group them, then pick the ones that matter most to patients.");
  P.push("Could any steps happen in parallel instead of one after another?");
  P.push("Is anything done twice, by different people, or written down in more than one place?");
  h+='<div class="section-h"><h2>Questions for redesign</h2></div><ul class="prompts">'+P.map(t=>"<li>"+esc(t)+"</li>").join("")+'</ul>';
  h+='<div class="notice">Test redesigned steps with small PDSA cycles, and track a measure on a <a href="{{ '/run_chart/' | relative_url }}">run chart</a> to see whether the change is an improvement.</div>';
  $("#analysis").innerHTML=h;
}

/* ---------- checks ---------- */
function renderChecks(){
  const m=map(), C=[];
  let group="";
  const add=(st,t,d)=>C.push({g:group,s:st,t:t,d:d});
  /* "Step 3", "Steps 2a and 3", "Steps 1, 2 and 3" */
  const steps=L=>(L.length>1?"Steps ":"Step ")+(L.length>1?L.slice(0,-1).join(", ")+" and "+L[L.length-1]:L[0]);
  const sc=state.scope;

  group="Scope";
  if(sc.start.trim()&&sc.end.trim()) add("pass","Start and end agreed",'From "'+sc.start.trim()+'" to "'+sc.end.trim()+'".');
  else add("warn","Agree where the process starts and ends","Fill in Starts when and Ends when, so everyone maps the same thing.");
  if(!sc.who.trim()) add("info","Say who it's for","Fill in Who it's for, for example \"Adults referred for routine bloods\", so the map stays focused.");

  if(!m){group="Map"; add("info","No redesign yet","Switch to Current to check that map, or start a redesign.");}
  else{
    const st=m.steps, M=metrics(m), F=flow(m), lab=s=>F.labels[st.indexOf(s)];

    group="Steps";
    if(st.length&&st[0].type==="terminator"&&st[st.length-1].type==="terminator") add("pass","Map has a start and an end","");
    else add("warn","Mark the start and end","Make the first and last steps Start / end shapes so the boundaries are clear.");
    const empty=st.filter(s=>!s.text.trim()&&s.type!=="terminator");
    if(empty.length) add("warn",steps(empty.map(lab))+(empty.length>1?" have":" has")+" no description","Describe each step as an action, for example \"Books in sample\", or each decision as a yes or no question.");
    else if(M.steps) add("pass","Every step is described","");
    const unc=st.filter(s=>s.type!=="terminator"&&!s.value);
    if(unc.length) add("warn",steps(unc.map(lab))+(unc.length>1?" aren't":" isn't")+" classified for value","Ask of each one: would the patient value this? Mark it value-adding, necessary or non-value-adding.");
    else if(M.steps) add("pass","Every step is classified for value","");
    if(!M.issues&&M.steps>=3) add("info","No issues noted yet","Add the frustrations people raise as issue notes on the steps. They become your list of things to fix.");

    if(M.decisions){
      group="Decisions and paths";
      const straight=st.filter((s,i)=>s.type==="decision"&&!s.noTo&&!F.runs[i]);
      straight.forEach(s=>add("info",'"'+nameOf(s)+'" carries straight on if the answer is no',"If a no goes a different way, choose A new path in its If no, go to list. If it sends work back, choose the step it goes back to."));
      if(!straight.length) add("pass","Every decision has a no route","");
      Object.keys(F.runs).map(Number).forEach(k=>{
        if(F.dep[k]===0&&!F.edges.some(e=>e.a===k&&e.yes)&&!F.ends.includes(k)) add("warn",'"'+nameOf(st[k])+'" has no yes route',"Its new path is at the end of the map. Add the steps that follow a yes after the path.");
      });
      const ended=F.ends.filter(k=>F.dep[k]>0);
      if(ended.length) add("info",ended.length+" path"+(ended.length>1?"s end":" ends")+" without rejoining","Check the work really stops there, for example when a referral is closed. Otherwise set where the path goes next on its last step.");
    }

    group="Lanes";
    const usedL=new Set(st.map(s=>s.lane));
    if(m.lanes.length===1) add("info","Simple flowchart","With one lane, hand-offs aren't counted. To track them, add a lane for each person, role, team or organisation involved to make a swimlane map.");
    else{
      const idle=m.lanes.filter(l=>!usedL.has(l.id));
      if(idle.length) add("info","Lane"+(idle.length>1?"s":"")+" with no steps",idle.map(l=>l.name||"Unnamed").join(", ")+". Remove "+(idle.length>1?"them":"it")+" or add the steps that happen there.");
      if(usedL.size<2&&M.steps) add("info","Only one lane in use","Put each step in the lane of whoever does it, so hand-offs show up.");
      else if(M.steps) add("pass",M.handoffs+" hand-off"+(M.handoffs===1?"":"s")+" counted","Each time the work moves from one lane to another.");
      if(!M.hasPatient) add("info","No patient lane","Call the lane for the people the service is for Patient, Service user or Carer, so the steps they go through are counted.");
    }
  }

  group="Redesign";
  if(state.maps.future){
    const a=metrics(state.maps.current), b=metrics(state.maps.future);
    const ds=a.steps-b.steps, dn=a.nva-b.nva, dh=a.handoffs-b.handoffs;
    if(ds>0||dn>0||dh>0) add("pass","Redesign improves the process",[ds>0?ds+" fewer step"+(ds>1?"s":""):"",dn>0?dn+" fewer non-value-adding step"+(dn>1?"s":""):"",dh>0?dh+" fewer hand-off"+(dh>1?"s":""):""].filter(Boolean).join(", ")+". Now test it with small PDSA cycles.");
    else add("warn","Redesign isn't better yet","It doesn't reduce steps, waste or hand-offs compared with the current map.");
  } else add("info","No redesign yet","Once you've analysed the current map, start a redesign to compare the two.");

  const warns=C.filter(c=>c.s==="warn").length, b=$("#checkBadge");
  b.textContent=warns; b.classList.toggle("zero",!warns);
  let h="", g=null;
  C.forEach(c=>{
    if(c.g!==g){h+='<h3 class="check-h">'+esc(c.g)+'</h3>'; g=c.g;}
    h+='<div class="check"><span class="dot '+c.s+'" aria-hidden="true">'+(c.s==="pass"?"✓":c.s==="warn"?"!":"i")+'</span><div><b>'+esc(c.t)+'</b>'+(c.d?'<p>'+esc(c.d)+'</p>':"")+'</div></div>';
  });
  $("#checks").innerHTML=h;
}

/* ---------- tabs ---------- */
function showTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected",String(t.dataset.tab===name)));
  document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("active",p.id==="pane-"+name));
}
document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{showTab(t.dataset.tab);if(t.dataset.tab==="build")document.querySelectorAll("#pane-build textarea").forEach(autosize);}));

/* ---------- table dialog ---------- */
/* Columns: Lane, Step, Type, Value, Issue, If no go to, Path level
   (blank or 0 for the usual path), At path end (for the last step on a path: a step name or End) */
const COLS=["Lane","Step","Type","Value","Issue","If no go to","Path level","At path end"];
/* Column order for a pasted table: from its header row when it has one, so tables from older
   versions (with Time and Bottleneck columns) still load; otherwise the order above */
function colMap(head){
  const keys={lane:/^lane/,step:/^step/,type:/^type/,value:/^value/,issue:/^issue/,go:/^if no/,level:/^path level/,then:/^at path end/};
  const at={}; Object.keys(keys).forEach(k=>at[k]=-1);
  if(head) head.forEach((h,i)=>{const t=h.toLowerCase().trim(); Object.keys(keys).forEach(k=>{if(at[k]<0&&keys[k].test(t)) at[k]=i;});});
  else ["lane","step","type","value","issue","go","level","then"].forEach((k,i)=>at[k]=i);
  return at;
}
function toTable(m){
  const byId={}, F=flow(m); m.steps.forEach(s=>byId[s.id]=s);
  const nm=id=>byId[id]?String(byId[id].text||"").replace(/[\t\n]/g," ").trim():"";
  const tn={terminator:"Start/end",step:"Activity",decision:"Decision"};
  const out=[COLS.join("\t")];
  m.steps.forEach((s,i)=>out.push([laneOf(m,s.lane).name,s.text,tn[s.type],VSHORT[s.value]||"",s.issue,
    s.type==="decision"&&s.noTo?nm(s.noTo):"",F.dep[i]||"",
    F.last[i]?(s.thenTo==="end"?"End":s.thenTo?nm(s.thenTo):""):""].map(c=>String(c==null?"":c).replace(/[\t\n]/g," ")).join("\t")));
  return out.join("\n");
}
function fromTable(src,old){
  const lines=src.split(/\r?\n/).filter(l=>l.trim());
  const split=line=>(line.indexOf("\t")>=0?line.split("\t"):line.split("|")).map(x=>x.trim());
  const at=colMap(lines.length&&/^\s*lane\b/i.test(lines[0])?split(lines.shift()):null), col=(c,k)=>at[k]>=0?c[at[k]]||"":"";
  const m={lanes:[],steps:[]}, byName={}, gotos=[], thens=[];
  let prev=null;
  lines.forEach(line=>{
    const c=split(line);
    const ln=col(c,"lane")||"Lane", key=ln.toLowerCase();
    if(!byName[key]){const l=L(ln);byName[key]=l;m.lanes.push(l);}
    const ty=col(c,"type").toLowerCase(), va=col(c,"value").toLowerCase().replace(/[^a-z]/g,"");
    /* older tables had a "New path" type: an activity one level below the step before it */
    const legacy=/new path|branch|altern/.test(ty);
    const type=legacy?"step":/start|end|termin/.test(ty)?"terminator":/decis|question|\?/.test(ty)?"decision":"step";
    const value=type==="terminator"?"":va==="nnva"||/necess|amber/.test(va)?"nnva":va==="nva"||/^non|waste|red/.test(va)?"nva":va==="va"||/^value|green/.test(va)?"va":"";
    const lvRaw=col(c,"level"), go=col(c,"go"), th=col(c,"then");
    const lv=/^\d+$/.test(lvRaw)?+lvRaw:legacy?(prev?prev.depth+(prev.type==="decision"?1:0):0)||1:0;
    const s=S(byName[key],type,col(c,"step"),value,{issue:col(c,"issue"),depth:lv});
    gotos.push(legacy&&!th?"":go); thens.push(th||(legacy?go:""));
    m.steps.push(s); prev=s;
  });
  /* "If no go to" and "At path end" name the step (a step number from older tables still works) */
  const find=(raw,s)=>{
    let t=null;
    if(/^\d+$/.test(raw)){const g=+raw; if(g>=1&&g<=m.steps.length) t=m.steps[g-1];}
    else{const key=raw.toLowerCase().replace(/\s+/g," "); t=m.steps.find(o=>o!==s&&String(o.text||"").toLowerCase().replace(/\s+/g," ").trim()===key)||null;}
    return t===s?null:t;
  };
  m.steps.forEach((s,i)=>{
    const g=gotos[i].trim(), th=thens[i].trim();
    if(g&&s.type==="decision"){const t=find(g,s); if(t) s.noTo=t.id;}
    if(th){const t=find(th,s); if(t) s.thenTo=t.id; else if(/^end$/i.test(th)) s.thenTo="end";}
  });
  syncDepth(m.steps);
  if(!m.lanes.length) m.lanes.push(L("Patient",true));
  return m;
}
const dlg=$("#tableDlg");
$("#btnTable").addEventListener("click",()=>{const m=map();$("#tableText").value=m?toTable(m):COLS.join("\t")+"\n";dlg.showModal();});
$("#tableForm").addEventListener("submit",e=>{
  if(e.submitter&&e.submitter.value==="apply"){
    const m=fromTable($("#tableText").value,map());
    if(!m.steps.length){toast("No steps found. Put one step per line.");e.preventDefault();return;}
    state.maps[state.active]=m; selected=null; autoFit=true; persist(); renderAll(); toast("Table applied: "+m.steps.length+" steps");
  }
});

/* ---------- top actions ---------- */
function hasContent(){const c=state.maps.current;return !!(state.title.trim()||c.steps.some(s=>s.text.trim())||state.maps.future);}
function loadExampleProject(){
  if(hasContent()&&!confirm("Replace your maps with the blood test example?")) return;
  state=example(); selected=null; autoFit=true; persist(); renderAll();
}
function newProject(){
  const v=state.view; state=blank(); state.view=v; selected=null; autoFit=true; persist(); renderAll(); $("#title").focus();
}
/* Shared toolbar (Open, Save, Export) */
function withMap(fn){const m=map(); if(!m){toast("There's no redesign to export. Switch to the current map.");return;} fn(m);}
FocusActions.mount({
  tool:"process_map", toolName:"process map", fileName:()=>slug(), say:m=>toast(m),
  explain:{root:"#analysis", place:"#canvasWrap", visibleOnly:false},
  hasData:()=>hasContent(), reset:()=>{newProject();trackCleared();}, load:doc=>{state=normalise(doc);selected=null;autoFit=true;persist();renderAll();},
  example:()=>loadExampleProject(),
  save:()=>saveFile(slug()+".json",JSON.stringify(state,null,2),"application/json"),
  open:()=>$("#fileIn").click(),
  exports:trackExports([
    {type:"png",hint:"The map you're viewing, for slides",run:()=>withMap(m=>exportPng(m))},
    {type:"svg",run:()=>withMap(m=>saveFile(slug()+suffix()+".svg",layout(m,{export:true}).svg,"image/svg+xml"))},
    {type:"csv",label:"Step table (.csv)",run:()=>withMap(m=>{
      const q=v=>{v=String(v==null?"":v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
      const csv=toTable(m).split("\n").map(r=>r.split("\t").map(q).join(",")).join("\n");
      saveFile(slug()+suffix()+".csv","\uFEFF"+csv,"text/csv");
    })}
  ])
});
trackSettings({issues:"vIssues"});
function slug(){return (state.title||"process-map").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"process-map";}
function suffix(){return state.active==="future"?"-redesign":"-current";}
function exportPng(m){
  const Lr=layout(m,{export:true});
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement("canvas"); cv.width=Math.round(Lr.W*2); cv.height=Math.round(Lr.H*2);
    const cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
    cv.toBlob(b=>{if(b) saveFile(slug()+suffix()+".png",b,"image/png"); else toast("Couldn't create the PNG. Try SVG instead.");},"image/png");
  };
  img.onerror=()=>toast("Couldn't create the PNG. Try SVG instead.");
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(Lr.svg);
}
$("#fileIn").addEventListener("change",e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const big=FocusActions.tooBig(f,"project"); if(big){e.target.value="";return toast(big);}
  const r=new FileReader();
  r.onload=()=>{
    try{state=normalise(JSON.parse(r.result));selected=null;autoFit=true;persist();renderAll();toast("Opened "+f.name);}
    catch(err){toast("That file isn't a process map project file.");}
    e.target.value="";
  };
  r.readAsText(f);
});

/* ---------- saving files ---------- */
let dlP=null;
function getDownloads(){if(!dlP) dlP=window.claude.use("downloads").catch(()=>null); return dlP;}
async function saveFile(name,data,mime){
  if(window.claude&&typeof window.claude.use==="function"){
    const d=await getDownloads();
    if(d){
      try{await d.save({filename:name,data:data});toast("Saved "+name);}
      catch(err){const c=err&&err.code; if(c==="declined") return; if(c==="rate_limited") toast("A save prompt is already open."); else toast("Couldn't save "+name+".");}
      return;
    }
  }
  try{if(await FocusActions.saveFile(name,data,mime)) toast("Saved "+name);}
  catch(err){toast("Couldn't save "+name+".");}
}
let tt;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2600);}

/* Nothing is kept when the page closes, so ask before leaving a map with work on it */
window.addEventListener("beforeunload",e=>{if(hasContent()){e.preventDefault();e.returnValue="";}});

/* ---------- render all ---------- */
function renderAll(){
  $("#title").value=state.title; $("#scStart").value=state.scope.start; $("#scEnd").value=state.scope.end; $("#scWho").value=state.scope.who;
  $("#mapCur").setAttribute("aria-pressed",String(state.active==="current"));
  $("#mapFut").setAttribute("aria-pressed",String(state.active==="future"));
  $("#vIssues").checked=state.view.issues;
  renderEditor(); renderCanvas(); renderChecks(); renderAnalysis();
}

/* ---------- suite menus ---------- */

renderAll();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>renderCanvas());
})();
