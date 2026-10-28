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

const TYPES={terminator:"Start / end",step:"Activity",decision:"Decision",branch:"New path",wait:"Wait / queue"};
const PATH="#005EB8"; // arrows and outlines for a decision's new path
const VALUES={"":"Not classified",va:"Value-adding",nnva:"Necessary (NNVA)",nva:"Non-value-adding"};
const VSHORT={va:"VA",nnva:"NNVA",nva:"NVA"};
const VCOL={va:{fill:"#E3F2E9",ink:"#007F3B"},nnva:{fill:"#FFF4DB",ink:"#8A5A00"},nva:{fill:"#FBE7E5",ink:"#B3261E"},"":{fill:"#FFFFFF",ink:"#768692"}};
const LINE={va:"#007F3B",nnva:"#FFB81C",nva:"#D5281B","":"#AEB7BD"};
const UNITS={min:"minutes",h:"hours",d:"days"};
const UNITF={min:1,h:60,d:1440};

/* ---------- model ---------- */
function L(name,patient){return {id:nid(),name:name,patient:!!patient};}
function S(lane,type,text,value,time,x){return Object.assign({id:nid(),lane:lane.id||lane,type:type,text:text||"",value:value||"",time:time===undefined||time===null?"":time,issue:"",bottleneck:false,noTo:"",thenTo:"",yesLabel:"Yes",noLabel:"No"},x||{});}
function blankMap(){
  const p=L("Patient",true), s=L("Staff");
  return {lanes:[p,s],steps:[S(p,"terminator",""),S(s,"step",""),S(p,"terminator","")]};
}
function blank(){return {title:"",scope:{start:"",end:"",who:""},unit:"min",active:"current",maps:{current:blankMap(),future:null},view:{timeline:true,issues:true,handoffs:true}};}

function example(){
  const pt=L("Patient",true),rc=L("Reception"),ph=L("Phlebotomist"),po=L("Porter"),lab=L("Laboratory"),cl=L("Clinician");
  const c4=S(rc,"step","Prints labels and a paper request form","nnva",3,{issue:"Same details written out twice"});
  const cur={lanes:[pt,rc,ph,po,lab,cl],steps:[
    S(pt,"terminator","Patient arrives for blood test","",0),
    S(pt,"wait","Takes a ticket and waits to check in","nva",10),
    S(rc,"step","Checks identity and finds the request","nnva",4,{issue:"Request is on the EPR but gets re-keyed"}),
    c4,
    S(pt,"wait","Waits to be called","nva",35,{bottleneck:true,issue:"Queue peaks 08:30 to 10:00"}),
    S(ph,"step","Takes blood sample","va",6),
    S(ph,"decision","Labels match the patient?","nnva",1,{noTo:c4.id,noLabel:"No, relabel"}),
    S(po,"wait","Sample waits in tray for porter round","nva",45,{issue:"Porter round only hourly"}),
    S(po,"step","Carries samples to the lab","nnva",15),
    S(lab,"wait","Sample waits to be booked in","nva",30),
    S(lab,"step","Books in and analyses sample","va",50),
    S(cl,"wait","Result waits in inbox","nva",240,{issue:"Only reviewed at end of clinic"}),
    S(cl,"step","Reviews result and decides action","va",5),
    S(pt,"terminator","Patient told the result","",0)
  ]};
  const fp=L("Patient",true),fph=L("Phlebotomist"),flab=L("Laboratory"),fcl=L("Clinician");
  const fut={lanes:[fp,fph,flab,fcl],steps:[
    S(fp,"terminator","Patient arrives at booked slot","",0),
    S(fp,"step","Checks in at the kiosk","nnva",2),
    S(fp,"wait","Waits to be called","nva",10,{issue:"Booked slots spread the morning peak"}),
    S(fph,"step","Prints labels at the chair from the e-request","nnva",2),
    S(fph,"step","Takes and labels sample at the chair","va",6),
    S(fph,"step","Sends sample by air tube","nnva",3),
    S(flab,"wait","Sample waits to be booked in","nva",10),
    S(flab,"step","Books in and analyses sample","va",50),
    S(fcl,"wait","Result flagged and waits for review","nva",60),
    S(fcl,"step","Reviews result and decides action","va",5),
    S(fp,"terminator","Patient told the result in the app","",0)
  ]};
  return {title:"Outpatient blood test, arrival to result",scope:{start:"Patient arrives for a blood test",end:"Patient is told the result",who:"Adult outpatients with a routine blood test request"},
    unit:"min",active:"current",maps:{current:cur,future:fut},view:{timeline:true,issues:true,handoffs:true}};
}

/* ---------- persistence ---------- */
/* Work in progress is kept in sessionStorage, so it survives a refresh but is cleared when the tab
   closes and isn't left on a shared computer. Work an older version kept in localStorage moves across once. */
function load(){try{const old=localStorage.getItem(KEY);if(old!==null){localStorage.removeItem(KEY);if(sessionStorage.getItem(KEY)===null)sessionStorage.setItem(KEY,old);}}catch(e){}
  try{const raw=sessionStorage.getItem(KEY);if(!raw)return null;return normalise(JSON.parse(raw));}catch(e){return null;}}
let saveTimer=null;
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch(e){}},250);}
function normMap(m){
  if(!m||typeof m!=="object") return null;
  const idmap={};
  let lanes=Array.isArray(m.lanes)?m.lanes.map(l=>{const n=L(String((l&&l.name)||"Lane"),l&&l.patient);idmap["L"+(l&&l.id)]=n.id;return n;}):[];
  if(!lanes.length) lanes=[L("Patient",true)];
  const steps=(Array.isArray(m.steps)?m.steps:[]).map(s=>{
    s=s||{};
    const n=S(idmap["L"+s.lane]||lanes[0].id,TYPES[s.type]?s.type:"step",String(s.text||""),VALUES[s.value]!==undefined?s.value:"",
      (s.time===""||s.time===null||s.time===undefined||isNaN(+s.time))?"":Math.max(0,+s.time),
      {issue:String(s.issue||""),bottleneck:!!s.bottleneck,yesLabel:String(s.yesLabel||"Yes"),noLabel:String(s.noLabel||"No")});
    idmap["S"+s.id]=n.id; n._old=s.noTo; n._then=s.thenTo; return n;
  });
  steps.forEach(n=>{
    n.noTo=n._old&&idmap["S"+n._old]?idmap["S"+n._old]:"";
    n.thenTo=n.type!=="branch"?"":n._then==="end"?"end":n._then&&idmap["S"+n._then]?idmap["S"+n._then]:"";
    delete n._old; delete n._then;
  });
  return {lanes:lanes,steps:steps};
}
function normalise(o){
  if(!o||typeof o!=="object"||!o.maps) throw new Error("bad");
  const s=blank();
  s.title=String(o.title||"");
  const sc=o.scope||{}; s.scope={start:String(sc.start||""),end:String(sc.end||""),who:String(sc.who||"")};
  s.unit=UNITS[o.unit]?o.unit:"min";
  s.maps.current=normMap(o.maps.current)||blankMap();
  s.maps.future=o.maps.future?normMap(o.maps.future):null;
  s.active=o.active==="future"&&s.maps.future?"future":"current";
  const v=o.view||{}; s.view={timeline:v.timeline!==false,issues:v.issues!==false,handoffs:v.handoffs!==false};
  return s;
}
function cloneMap(m){return normMap(JSON.parse(JSON.stringify(m)));}

let state=load()||blank(); // start empty unless there is saved work
let selected=null, zoom=1, autoFit=true;
const map=()=>state.maps[state.active];
const laneOf=(m,id)=>m.lanes.find(l=>l.id===id)||m.lanes[0];

/* ---------- time ---------- */
const r1=v=>String(Math.round(v*10)/10);
function fmtT(v,unit){
  unit=unit||state.unit; v=+v||0;
  if(unit==="min"){ if(v<60) return r1(v)+" min"; const h=Math.floor(v/60),m=Math.round(v-h*60); return h+" h"+(m?" "+m+" min":""); }
  if(unit==="h"){ if(v<24) return r1(v)+" h"; const d=Math.floor(v/24),h=Math.round((v-d*24)*10)/10; return d+" d"+(h?" "+r1(h)+" h":""); }
  return r1(v)+(v===1?" day":" days");
}

/* ---------- flow ----------
   Steps run in list order. A decision followed by one or more New path steps
   sends its "no" down that path, and its "yes" skips the path to the next
   main step. At its end the path rejoins the main flow, goes on to a later
   step or ends. New path steps that don't follow a decision run in order like
   activities. */
function flow(m){
  const st=m.steps, n=st.length, idx={}, onPath={}, runs={}, edges=[];
  st.forEach((s,i)=>idx[s.id]=i);
  for(let i=0;i<n;i++){
    const s=st[i];
    if(s.type==="decision"){
      let k=i; while(k+1<n&&st[k+1].type==="branch") k++;
      if(k>i){
        const last=st[k], after=k+1<n?k+1:-1, end=last.thenTo==="end";
        let target=after, back=false;
        const ti=last.thenTo?idx[last.thenTo]:undefined;
        if(end) target=-1;
        else if(ti!==undefined&&ti>k) target=ti;
        else if(ti!==undefined&&ti<=i){target=ti;back=true;} // loops back to an earlier step (or the decision itself)
        runs[i]={first:i+1,last:k,after:after,target:target,end:end,back:back};
        for(let j=i+1;j<=k;j++) onPath[j]=i;
        edges.push({a:i,b:i+1,kind:"no"});
        for(let j=i+1;j<k;j++) edges.push({a:j,b:j+1,kind:"path"});
        if(target>=0) edges.push({a:k,b:target,kind:back?"back":"rejoin"});
        if(after>=0) edges.push({a:i,b:after,kind:"yes"});
        i=k; continue;
      }
    }
    if(i<n-1) edges.push({a:i,b:i+1,kind:s.type==="decision"&&s.noTo?"yes":"seq"});
  }
  return {idx:idx,onPath:onPath,runs:runs,edges:edges};
}

/* ---------- metrics ---------- */
function metrics(m){
  const r={steps:0,patient:0,handoffs:0,decisions:0,waits:0,va:0,nnva:0,nva:0,unc:0,loops:0,paths:0,pathTime:0,bottlenecks:0,issues:0,lead:0,vaTime:0,waitTime:0,untimed:0,hasPatient:m.lanes.some(l=>l.patient)};
  const pl={}; m.lanes.forEach(l=>pl[l.id]=l.patient);
  const F=flow(m), idx=F.idx;
  /* a path that loops back is rework, so like a rework loop it isn't counted as a hand-off */
  F.edges.forEach(e=>{if(e.kind==="back") r.loops++; else if(m.steps[e.a].lane!==m.steps[e.b].lane) r.handoffs++;});
  r.paths=Object.keys(F.runs).length;
  m.steps.forEach((s,i)=>{
    if(s.issue&&s.issue.trim()) r.issues++;
    if(s.bottleneck) r.bottlenecks++;
    if(s.type==="terminator") return;
    r.steps++;
    if(pl[s.lane]) r.patient++;
    if(s.type==="decision"){r.decisions++; if(!F.runs[i]&&s.noTo&&idx[s.noTo]!==undefined&&idx[s.noTo]<i) r.loops++;}
    if(s.type==="wait") r.waits++;
    if(s.value) r[s.value]++; else r.unc++;
    const t=+s.time||0;
    if(s.time===""&&s.type!=="decision") r.untimed++;
    /* Only some cases go down a new path, so its time is kept out of the lead time */
    if(F.onPath[i]!==undefined){r.pathTime+=t;return;}
    r.lead+=t;
    if(s.type==="wait") r.waitTime+=t;
    else if(s.value==="va") r.vaTime+=t;
  });
  r.vaPct=r.lead>0?r.vaTime/r.lead*100:0;
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
  const LHW=150, COLW=172, BW=138, X0=LHW+14, TOP=70;
  const steps=m.steps, lanes=m.lanes, n=steps.length;
  const li={}; lanes.forEach((l,i)=>li[l.id]=i);
  const F=flow(m), idx=F.idx;
  const G=steps.map((s,i)=>{
    const isD=s.type==="decision";
    const txt=s.text.trim()||(s.type==="terminator"?(i===0?"Start":"End"):"(no text yet)");
    const lines=wrap(txt,isD?86:BW-22,"600 13px "+FF,isD?4:5);
    const h=isD?Math.max(92,lines.length*15+58):Math.max(s.type==="terminator"?44:58,lines.length*16+(s.type==="terminator"?22:30));
    let note=null;
    if(v.issues&&s.issue&&s.issue.trim()){const nl=wrap(s.issue,BW-16,"500 11.5px "+FF,4);note={lines:nl,h:nl.length*14+14};}
    return {s:s,i:i,lines:lines,empty:!s.text.trim(),h:h,lane:li[s.lane]!==undefined?li[s.lane]:0,note:note,cx:X0+i*COLW+COLW/2,alt:F.onPath[i]!==undefined};
  });
  /* Each lane has a main row, and a second row below it for steps on a new path */
  const LN=lanes.map(()=>({maxH:0,altH:0,noteH:0,loops:0}));
  G.forEach(g=>{const d=LN[g.lane];if(g.alt)d.altH=Math.max(d.altH,g.h);else d.maxH=Math.max(d.maxH,g.h);if(g.note)d.noteH=Math.max(d.noteH,g.note.h+14);});
  const loopK={};
  G.forEach(g=>{if(g.s.type==="decision"&&!F.runs[g.i]&&g.s.noTo&&idx[g.s.noTo]!==undefined&&idx[g.s.noTo]!==g.i){loopK[g.i]=LN[g.lane].loops++;}});
  /* a new path that loops back runs along the bottom of its last step's lane, like a rework loop */
  const backK={};
  F.edges.forEach(e=>{if(e.kind==="back") backK[e.a]=LN[G[e.a].lane].loops++;});
  let y=TOP;
  LN.forEach(d=>{
    d.top=y; const body=d.maxH||40;
    d.cy=y+d.noteH+24+body/2;
    let low=d.cy+body/2;
    if(d.altH){d.acy=low+30+d.altH/2; low=d.acy+d.altH/2;}
    d.bottom=low+(d.loops?30+d.loops*9:24);
    y=d.bottom;
  });
  G.forEach(g=>{g.cy=g.alt?LN[g.lane].acy:LN[g.lane].cy;});
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
    p.push('<rect x="0" y="'+d.top+'" width="'+W+'" height="'+h+'" fill="'+(l.patient?"#F2F7FC":(i%2?"#F7F9FA":"#FFFFFF"))+'"/>');
    p.push('<rect x="0" y="'+d.top+'" width="'+LHW+'" height="'+h+'" fill="'+(l.patient?"#003087":"#E6F0FA")+'"/>');
    const nl=wrap(l.name||"Lane",LHW-24,"700 13.5px "+FF,4);
    const ty=d.top+h/2-(nl.length-1)*8+5;
    nl.forEach((t,k)=>p.push('<text x="14" y="'+(ty+k*16)+'" font-family="'+FF+'" font-size="13.5" font-weight="700" fill="'+(l.patient?"#FFFFFF":"#003087")+'">'+esc(t)+'</text>'));
    p.push('<line x1="0" y1="'+d.bottom+'" x2="'+W+'" y2="'+d.bottom+'" stroke="#D8DDE0"/>');
  });
  p.push('<line x1="0" y1="'+TOP+'" x2="'+W+'" y2="'+TOP+'" stroke="#D8DDE0"/>');
  /* sequence arrows, including a decision's yes and new path routes */
  const hand=[], GAP=(COLW-BW)/2;
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
    const onP=e.kind==="no"||e.kind==="path"||e.kind==="rejoin", col=onP?PATH:"#425563";
    let d;
    if(e.kind==="no"){
      /* leave from the diamond's bottom (or top) point, then across to the path */
      const down=b.cy>=a.cy, sy=down?a.cy+a.h/2:a.cy-a.h/2;
      d="M"+a.cx+","+sy+"V"+b.cy+"H"+(bx-1);
      if(a.lane!==b.lane) hand.push([a.cx,(sy+b.cy)/2]);
      p.push('<text x="'+(a.cx+6)+'" y="'+(down?sy+13:sy-5)+'" font-family="'+FF+'" font-size="11" font-weight="700" fill="'+PATH+'">'+esc(a.s.noLabel||"No")+'</text>');
    } else {
      const ax=a.cx+BW/2;
      if(a.cy===b.cy) d="M"+ax+","+a.cy+"H"+(bx-1);
      else{
        /* turn in the gap next to the step that's skipped from (yes) or joined (rejoin), clear of other boxes */
        const mx=e.kind==="rejoin"?bx-GAP:ax+GAP;
        d="M"+ax+","+a.cy+"H"+mx+"V"+b.cy+"H"+(bx-1);
        if(a.lane!==b.lane) hand.push([mx,(a.cy+b.cy)/2]);
      }
      /* the label goes on the side away from where the arrow turns */
      if(e.kind==="yes") p.push('<text x="'+(ax+3)+'" y="'+(b.cy<a.cy?a.cy+14:a.cy-6)+'" font-family="'+FF+'" font-size="11" font-weight="700" fill="#425563">'+esc(a.s.yesLabel||"Yes")+'</text>');
    }
    p.push('<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.6" marker-end="url(#'+(onP?"ahp":"ah")+')"/>');
  });
  /* a new path that ends: short arrow to an end point */
  let pathEnds=false;
  Object.keys(F.runs).forEach(k=>{
    const r=F.runs[k]; if(!r.end) return;
    const g=G[r.last], x=g.cx+BW/2; pathEnds=true;
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
    const stroke=s.bottleneck?"#D5281B":s.type==="branch"?PATH:"#425563", sw=s.bottleneck?3:s.type==="branch"?2:1.5;
    let shape;
    if(s.type==="decision") shape='<path d="M'+g.cx+","+top+"L"+(x+BW)+","+g.cy+"L"+g.cx+","+(top+g.h)+"L"+x+","+g.cy+'Z"';
    else if(s.type==="terminator") shape='<rect x="'+x+'" y="'+top+'" width="'+BW+'" height="'+g.h+'" rx="'+Math.min(22,g.h/2)+'"';
    else if(s.type==="wait"){const r=Math.min(g.h/2,24);shape='<path d="M'+x+","+top+"H"+(x+BW-r)+"A"+r+","+r+" 0 0 1 "+(x+BW)+","+(top+r)+"V"+(top+g.h-r)+"A"+r+","+r+" 0 0 1 "+(x+BW-r)+","+(top+g.h)+"H"+x+'Z"';}
    else shape='<rect x="'+x+'" y="'+top+'" width="'+BW+'" height="'+g.h+'" rx="4"';
    p.push('<g class="box" data-id="'+s.id+'">');
    if(!ex&&selected===s.id) p.push(shape+' fill="none" stroke="#FFB81C" stroke-width="9" stroke-linejoin="round"/>');
    p.push(shape+' fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+(s.type==="wait"?' stroke-dasharray="5 3"':"")+'/>');
    const lh=s.type==="decision"?15:16, by=g.cy-(g.lines.length-1)*lh/2+(s.type==="step"||s.type==="wait"||s.type==="branch"?1.5:4.5);
    g.lines.forEach((t,k)=>p.push('<text x="'+g.cx+'" y="'+(by+k*lh)+'" text-anchor="middle" font-family="'+FF+'" font-size="13" font-weight="600" '+(g.empty?'font-style="italic" fill="#768692"':'fill="#212B32"')+'>'+esc(t)+'</text>'));
    /* number badge */
    const bx=s.type==="decision"?g.cx-26:x+2, byy=s.type==="decision"?top+16:top+2;
    p.push('<circle cx="'+bx+'" cy="'+byy+'" r="10" fill="#003087"/><text x="'+bx+'" y="'+(byy+4)+'" text-anchor="middle" font-family="'+FF+'" font-size="10.5" font-weight="800" fill="#fff">'+(g.i+1)+'</text>');
    /* value tag */
    if(s.value&&s.type!=="terminator"){
      const vx=s.type==="decision"?g.cx:x+BW-(s.type==="wait"?14:6), vy=s.type==="decision"?top+g.h-16:top+g.h-6;
      p.push('<text x="'+vx+'" y="'+vy+'" text-anchor="'+(s.type==="decision"?"middle":"end")+'" font-family="'+FF+'" font-size="9.5" font-weight="800" fill="'+c.ink+'">'+VSHORT[s.value]+'</text>');
    }
    if(s.bottleneck){
      const tx=s.type==="decision"?g.cx+14:x+BW-72, tyy=s.type==="decision"?top+4:top-9;
      p.push('<rect x="'+tx+'" y="'+tyy+'" width="70" height="17" rx="8.5" fill="#D5281B"/><text x="'+(tx+35)+'" y="'+(tyy+12.5)+'" text-anchor="middle" font-family="'+FF+'" font-size="10" font-weight="800" fill="#fff">Bottleneck</text>');
    }
    p.push('</g>');
  });
  /* hand-off markers */
  if(v.handoffs) hand.forEach(h=>p.push('<circle cx="'+h[0]+'" cy="'+h[1]+'" r="9" fill="#FFB81C" stroke="#212B32" stroke-width="1"/><text x="'+h[0]+'" y="'+(h[1]+4)+'" text-anchor="middle" font-family="'+FF+'" font-size="10.5" font-weight="800" fill="#212B32">H</text>'));
  /* timeline */
  let y2=lanesBottom;
  const M=metrics(m);
  if(v.timeline&&n){
    const t0=y2+14, up=t0+22, lo=t0+58;
    p.push('<text x="14" y="'+(up+4)+'" font-family="'+FF+'" font-size="12" font-weight="700" fill="#4C6272">Waiting</text>');
    p.push('<text x="14" y="'+(lo+4)+'" font-family="'+FF+'" font-size="12" font-weight="700" fill="#4C6272">Doing</text>');
    let prevY=null;
    G.forEach(g=>{
      const s=g.s, x0=X0+g.i*COLW, x1=x0+COLW, yy=s.type==="wait"?up:lo;
      if(prevY!==null&&prevY!==yy) p.push('<line x1="'+x0+'" y1="'+up+'" x2="'+x0+'" y2="'+lo+'" stroke="#AEB7BD" stroke-width="1.5"/>');
      const col=s.type==="terminator"?"#D8DDE0":LINE[s.value||""];
      /* steps on a new path are shown faded and in brackets: they aren't in the lead time */
      p.push('<line x1="'+(x0+2)+'" y1="'+yy+'" x2="'+(x1-2)+'" y2="'+yy+'" stroke="'+col+'" stroke-width="5" stroke-linecap="round"'+(g.alt?' stroke-dasharray="1 9" opacity=".7"':"")+'/>');
      if(s.type!=="terminator"&&s.time!=="") p.push('<text x="'+(x0+COLW/2)+'" y="'+(yy-8)+'" text-anchor="middle" font-family="'+FF+'" font-size="11.5" font-weight="700" fill="'+(g.alt?"#4C6272":"#212B32")+'">'+esc(g.alt?"("+fmtT(s.time)+")":fmtT(s.time))+'</text>');
      prevY=yy;
    });
    const tot="Lead time "+fmtT(M.lead)+"     Waiting "+fmtT(M.waitTime)+"     Value-adding time "+fmtT(M.vaTime)+" ("+Math.round(M.vaPct)+"% of lead time)"+
      (M.paths?"     New paths "+fmtT(M.pathTime)+" (not in lead time)":"");
    p.push('<text x="14" y="'+(t0+92)+'" font-family="'+FF+'" font-size="13" font-weight="700" fill="#212B32">'+esc(tot)+'</text>');
    y2=t0+104;
  }
  /* legend */
  const ly=y2+18; let lx=14;
  const leg=(sw,label)=>{p.push(sw(lx,ly));p.push('<text x="'+(lx+22)+'" y="'+(ly+4)+'" font-family="'+FF+'" font-size="11.5" fill="#4C6272">'+esc(label)+'</text>');mctx.font="11.5px "+FF;lx+=22+mctx.measureText(label).width+18;};
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#E3F2E9" stroke="#007F3B"/>',"Value-adding (VA)");
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#FFF4DB" stroke="#FFB81C"/>',"Necessary, non-value-adding (NNVA)");
  leg((x,y)=>'<rect x="'+x+'" y="'+(y-7)+'" width="16" height="13" rx="2" fill="#FBE7E5" stroke="#D5281B"/>',"Non-value-adding (NVA)");
  if(v.handoffs) leg((x,y)=>'<circle cx="'+(x+8)+'" cy="'+y+'" r="7" fill="#FFB81C" stroke="#212B32"/>',"Hand-off ("+M.handoffs+")");
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
["Timeline","Issues","Handoffs"].forEach(k=>{
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
function laneOptions(m,sel){return m.lanes.map(l=>'<option value="'+l.id+'"'+(l.id===sel?" selected":"")+'>'+esc(l.name||"Unnamed lane")+'</option>').join("");}
function stepCard(m,s,i,F){
  const isT=s.type==="terminator", isD=s.type==="decision", isB=s.type==="branch";
  const short=(o,k)=>(k+1)+'. '+esc((o.text||"(no text)").slice(0,40));
  const others=m.steps.map((o,k)=>o.id===s.id?"":'<option value="'+o.id+'"'+(o.id===s.noTo?" selected":"")+'>'+short(o,k)+'</option>').join("");
  const run=isD?F.runs[i]:null, own=isB&&F.onPath[i]!==undefined?F.runs[F.onPath[i]]:null;
  /* where a decision's no route goes: back to an earlier step, or down the new path that follows it */
  const noRow=!isD?"":run?
    '<div class="row2"><p class="path-note">If no, take the new path: step'+(run.last>run.first?"s "+(run.first+1)+" to "+(run.last+1):" "+(run.first+1))+'</p><label>No label<input class="field sm nl" type="text"></label></div>':
    '<div class="row2"><label>If no, go to<select class="field sm nt"><option value="">Carry on (no loop)</option>'+others+'</select></label><label>No label<input class="field sm nl" type="text"></label></div>';
  /* the last step on a new path says where the path goes next */
  let pathRow="";
  if(own&&own.last===i){
    const later=m.steps.map((o,k)=>k>i&&k!==own.after&&F.onPath[k]===undefined?'<option value="'+o.id+'"'+(o.id===s.thenTo?" selected":"")+'>Go to step '+short(o,k)+'</option>':"").join("");
    const earlier=m.steps.map((o,k)=>k<own.first?'<option value="'+o.id+'"'+(o.id===s.thenTo?" selected":"")+'>Go back to step '+short(o,k)+'</option>':"").join("");
    pathRow='<div class="row1"><label>At the end of this path<select class="field sm th">'+
      '<option value="">'+(own.after>=0?"Rejoin the main path at step "+(own.after+1):"Rejoin the main path")+'</option>'+
      '<option value="end"'+(s.thenTo==="end"?" selected":"")+'>End the path here</option>'+
      (later?'<optgroup label="Rejoin later on">'+later+'</optgroup>':"")+
      (earlier?'<optgroup label="Loop back (rework)">'+earlier+'</optgroup>':"")+'</select></label></div>';
  } else if(isB&&!own) pathRow='<p class="path-note warn">Put this straight after a decision, or after another new path step, to make it the decision\'s "no" route.</p>';
  return '<div class="step t-'+s.type+(s.value&&!isT?" v-"+s.value:"")+(selected===s.id?" sel":"")+'" data-id="'+s.id+'">'+
    '<div class="step-head"><span class="num" aria-hidden="true">'+(i+1)+'</span>'+
    '<select class="field sm ty" aria-label="Step '+(i+1)+' type">'+Object.keys(TYPES).map(k=>'<option value="'+k+'"'+(k===s.type?" selected":"")+'>'+TYPES[k]+'</option>').join("")+'</select>'+
    '<select class="field sm la" aria-label="Step '+(i+1)+' lane">'+laneOptions(m,s.lane)+'</select>'+
    '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move step '+(i+1)+' up">↑</button>'+
    '<button class="btn icon ghost" data-act="down" type="button" aria-label="Move step '+(i+1)+' down">↓</button>'+
    '<button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove step '+(i+1)+'">✕</button></div>'+
    '<textarea class="field t" rows="1" aria-label="Step '+(i+1)+' description" placeholder="'+(isT?(i===0?"Where the process starts":"Where the process ends"):isD?"A yes or no question":s.type==="wait"?"Who or what is waiting, and where":isB?"What happens on the 'no' route? Start with a verb":"What happens? Start with a verb")+'"></textarea>'+
    (isT?"":'<div class="row2"><label>Value<select class="field sm va">'+Object.keys(VALUES).map(k=>'<option value="'+k+'"'+(k===(s.value||"")?" selected":"")+'>'+VALUES[k]+'</option>').join("")+'</select></label>'+
      '<label>'+(s.type==="wait"?"Waiting time":"Time taken")+'<span class="timefield"><input class="field sm tm" type="number" min="0" step="any" inputmode="decimal"><span>'+UNITS[state.unit]+'</span></span></label></div>')+
    noRow+pathRow+
    '<input class="field measure issue is" type="text" aria-label="Issue for step '+(i+1)+'" placeholder="Issue or frustration (optional)">'+
    '<div class="step-foot">'+(isT?"<span></span>":'<label class="chk"><input type="checkbox" class="bn"'+(s.bottleneck?" checked":"")+'> Bottleneck</label>')+
    '<span class="foot-btns">'+(isD?'<button class="btn small" data-act="path" type="button">'+(run?"Add step to new path":"Add new path")+'</button>':"")+
    '<button class="btn small" data-act="ins" type="button">'+(isB?"Add path step below":"Add step below")+'</button></span></div></div>';
}
function renderEditor(){
  renderEditing();
  const m=map(), host=$("#mapEditor");
  if(!m){
    host.innerHTML='<div class="empty" style="margin-top:1rem">No redesign yet.<div class="actions" style="justify-content:center;margin-top:.7rem"><button class="btn small" type="button" data-start="copy">Copy current map</button><button class="btn small" type="button" data-start="blank">Start blank</button></div></div>';
    return;
  }
  let h='<div class="section-h"><h2>Lanes</h2><button class="btn small" id="addLane" type="button">Add lane</button></div><div id="lanes">';
  m.lanes.forEach((l,i)=>{
    h+='<div class="lane-row" data-id="'+l.id+'"><input class="field ln" type="text" aria-label="Lane '+(i+1)+' name" placeholder="Role or team"><label class="chk" title="The patient or service user\'s own lane"><input type="checkbox" class="lp"'+(l.patient?" checked":"")+'> Patient</label>'+
      '<button class="btn icon ghost" data-act="up" type="button" aria-label="Move lane up">↑</button><button class="btn icon ghost" data-act="down" type="button" aria-label="Move lane down">↓</button><button class="btn icon ghost danger" data-act="del" type="button" aria-label="Remove lane">✕</button></div>';
  });
  h+='</div><p class="hint">One lane per role or team, plus the patient. Map supporting work, such as samples or notes, in its own lane.</p>';
  h+='<div class="section-h"><h2>Steps</h2><span class="unit-sel"><label for="unitSel">Times in</label><select class="field sm" id="unitSel">'+Object.keys(UNITS).map(k=>'<option value="'+k+'"'+(k===state.unit?" selected":"")+'>'+UNITS[k]+'</option>').join("")+'</select></span></div>';
  const F=flow(m);
  h+='<div id="steps">'+m.steps.map((s,i)=>stepCard(m,s,i,F)).join("")+'</div>';
  h+='<div style="margin-top:.6rem"><button class="btn small" id="addStep" type="button">Add step at the end</button></div>';
  h+='<p class="hint">Press Enter in a step to add the next one in the same lane. Shift+Enter starts a new line. To give a decision a different "no" route, use <b>Add new path</b> on the decision: the yes route carries on along the main path.</p>';
  host.innerHTML=h;
  host.querySelectorAll(".lane-row").forEach(r=>{r.querySelector(".ln").value=laneOf(m,r.dataset.id).name;});
  host.querySelectorAll(".step").forEach(c=>{
    const s=m.steps.find(x=>x.id===c.dataset.id);
    const t=c.querySelector(".t"); t.value=s.text; autosize(t);
    const tm=c.querySelector(".tm"); if(tm) tm.value=s.time;
    c.querySelector(".is").value=s.issue||"";
    const nl=c.querySelector(".nl"); if(nl) nl.value=s.noLabel||"No";
  });
}
function markSel(){document.querySelectorAll(".step").forEach(c=>c.classList.toggle("sel",c.dataset.id===selected));}
function changed(full){persist(); if(full) renderEditor(); renderCanvas(); renderChecks(); renderAnalysis();}

const ed=$("#mapEditor");
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
  if(cl.contains("t")){s.text=e.target.value;autosize(e.target);}
  else if(cl.contains("tm")){const v=e.target.value;s.time=v===""?"":Math.max(0,+v||0);}
  else if(cl.contains("is")) s.issue=e.target.value;
  else if(cl.contains("nl")) s.noLabel=e.target.value;
  else return;
  changed();
});
ed.addEventListener("change",e=>{
  const m=map(); if(!m) return;
  if(e.target.id==="unitSel"){
    const from=state.unit,to=e.target.value,f=UNITF[from]/UNITF[to];
    ["current","future"].forEach(k=>{const mm=state.maps[k]; if(mm) mm.steps.forEach(s=>{if(s.time!=="") s.time=Math.round(s.time*f*100)/100;});});
    state.unit=to; changed(true); toast("Times converted to "+UNITS[to]); return;
  }
  const lr=e.target.closest(".lane-row");
  if(lr&&e.target.classList.contains("lp")){laneOf(m,lr.dataset.id).patient=e.target.checked;changed();return;}
  const c=e.target.closest(".step"); if(!c) return;
  const s=m.steps.find(x=>x.id===c.dataset.id); if(!s) return;
  const cl=e.target.classList;
  if(cl.contains("ty")){
    s.type=e.target.value;
    if(s.type==="wait"&&!s.value) s.value="nva";
    if(s.type!=="decision") s.noTo="";
    if(s.type!=="branch") s.thenTo="";
    if(s.type==="terminator"){s.value="";s.bottleneck=false;}
    changed(true); focusCard(s.id,".ty"); return;
  }
  if(cl.contains("la")){s.lane=e.target.value;changed();return;}
  if(cl.contains("va")){s.value=e.target.value;c.className=c.className.replace(/\sv-\w+/g,"")+(s.value?" v-"+s.value:"");changed();return;}
  if(cl.contains("nt")){s.noTo=e.target.value;changed();return;}
  if(cl.contains("th")){s.thenTo=e.target.value;changed();return;}
  if(cl.contains("bn")){s.bottleneck=e.target.checked;changed();return;}
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
function insertAfter(i){
  const m=map(), ref=m.steps[i];
  let lane=ref?ref.lane:m.lanes[0].id;
  const ns=S(lane,"step","");
  /* below a new path step, the new step carries on the same path and takes over where the path goes next */
  if(ref&&ref.type==="branch"){ns.type="branch";ns.thenTo=ref.thenTo;ref.thenTo="";}
  m.steps.splice(i+1,0,ns); selected=ns.id; changed(true); focusCard(ns.id,".t");
}
/* Add a step to a decision's new path, starting the path if it hasn't got one */
function addPathStep(i){
  const m=map(), F=flow(m), run=F.runs[i];
  if(run) return insertAfter(run.last);
  const ns=S(m.steps[i].lane,"branch","");
  m.steps.splice(i+1,0,ns); selected=ns.id; changed(true); focusCard(ns.id,".t");
}
function focusCard(id,sel){const c=document.querySelector('.step[data-id="'+id+'"]'); if(c){const t=c.querySelector(sel); if(t) t.focus(); c.scrollIntoView({block:"nearest"});}}
ed.addEventListener("click",e=>{
  const st=e.target.closest("[data-start]"); if(st){startRedesign(st.dataset.start);return;}
  const m=map(); if(!m) return;
  if(e.target.id==="addLane"){m.lanes.push(L("New lane"));changed(true);const rows=document.querySelectorAll(".lane-row .ln");const last=rows[rows.length-1];last.focus();last.select();return;}
  if(e.target.id==="addStep"){insertAfter(m.steps.length-1);return;}
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
  if(act==="up"&&i>0){[m.steps[i-1],m.steps[i]]=[m.steps[i],m.steps[i-1]];changed(true);focusCard(c.dataset.id,'[data-act="up"]');}
  else if(act==="down"&&i<m.steps.length-1){[m.steps[i+1],m.steps[i]]=[m.steps[i],m.steps[i+1]];changed(true);focusCard(c.dataset.id,'[data-act="down"]');}
  else if(act==="del"){
    const gone=m.steps[i], id=gone.id, prev=m.steps[i-1];
    /* removing the last step on a path: the step before it keeps where the path goes next */
    if(gone.type==="branch"&&gone.thenTo&&prev&&prev.type==="branch"&&!(m.steps[i+1]&&m.steps[i+1].type==="branch")) prev.thenTo=gone.thenTo;
    m.steps.splice(i,1);m.steps.forEach(s=>{if(s.noTo===id)s.noTo="";if(s.thenTo===id)s.thenTo="";});if(selected===id)selected=null;changed(true);
  }
  else if(act==="ins") insertAfter(i);
  else if(act==="path") addPathStep(i);
});
/* header fields */
$("#title").addEventListener("input",e=>{state.title=e.target.value;changed();});
[["scStart","start"],["scEnd","end"],["scWho","who"]].forEach(([id,k])=>$("#"+id).addEventListener("input",e=>{state.scope[k]=e.target.value;changed();}));

/* ---------- analysis ---------- */
function renderAnalysis(){
  const cur=metrics(state.maps.current), fm=state.maps.future, fut=fm?metrics(fm):null;
  const rows=[
    ["Steps","steps",-1,0],["Steps the patient goes through","patient",-1,0,!cur.hasPatient&&!(fut&&fut.hasPatient)],["Hand-offs","handoffs",-1,0],
    ["Decisions","decisions",-1,0],["Waits and queues","waits",-1,0],["Non-value-adding steps","nva",-1,0],["Necessary non-value-adding steps","nnva",-1,0],
    ["Value-adding steps","va",0,0],["Rework loops","loops",-1,0],["New paths from decisions","paths",0,0,!cur.paths&&!(fut&&fut.paths)],["Bottlenecks","bottlenecks",-1,0],
    ["Lead time","lead",-1,1],["Waiting time","waitTime",-1,1],["Value-adding time","vaTime",0,1],["Value-adding share of lead time","vaPct",1,2]
  ];
  const f=(v,k)=>k===1?fmtT(v):k===2?Math.round(v)+"%":String(v);
  let h='<h2 style="font-size:1.05rem;margin:0">Current versus redesign</h2><table class="metrics"><thead><tr><th>Measure</th><th>Current</th><th>Redesign</th>'+(fut?'<th>Change</th>':"")+'</tr></thead><tbody>';
  rows.forEach(([lab,key,dir,kind,hide])=>{
    if(hide) return;
    let ch="";
    if(fut){
      const d=fut[key]-cur[key], better=dir===0||d===0?"":(dir<0?d<0:d>0)?"better":"worse";
      const ds=d===0?"–":(d>0?"+":"−")+(kind===1?fmtT(Math.abs(d)):kind===2?Math.round(Math.abs(d))+" pts":Math.abs(d));
      ch='<td class="'+better+'">'+ds+'</td>';
    }
    h+='<tr'+(key==="lead"||key==="nva"||key==="handoffs"?' class="key"':"")+'><td>'+lab+'</td><td>'+f(cur[key],kind)+'</td><td>'+(fut?f(fut[key],kind):"–")+'</td>'+ch+'</tr>';
  });
  h+='</tbody></table>';
  if(!fut) h+='<p class="hint">Start a redesign from the map view to compare the two.</p>';
  const a=state.active==="future"&&fut?fut:cur, am=map()||state.maps.current, label=state.active==="future"&&fut?"redesign":"current process";
  const tot=a.va+a.nnva+a.nva+a.unc;
  h+='<div class="section-h"><h2>Where the value is ('+label+')</h2></div>';
  if(tot){
    const seg=(k,col)=>a[k]?'<span style="width:'+(a[k]/tot*100)+'%;background:'+col+'" title="'+VALUES[k==="unc"?"":k]+'"></span>':"";
    h+='<div class="mixbar" role="img" aria-label="'+a.va+' value-adding, '+a.nnva+' necessary, '+a.nva+' non-value-adding, '+a.unc+' not classified">'+seg("va","#007F3B")+seg("nnva","#FFB81C")+seg("nva","#D5281B")+seg("unc","#AEB7BD")+'</div>';
    h+='<div class="mixkey"><span><i style="background:#007F3B"></i>'+a.va+' VA</span><span><i style="background:#FFB81C"></i>'+a.nnva+' NNVA</span><span><i style="background:#D5281B"></i>'+a.nva+' NVA</span>'+(a.unc?'<span><i style="background:#AEB7BD"></i>'+a.unc+' not classified</span>':"")+'</div>';
  } else h+='<p class="hint">Add steps to see the value mix.</p>';
  /* prompts */
  const P=[];
  const num=s=>am.steps.indexOf(s)+1;
  if(a.steps&&a.nva) P.push(a.nva+" of "+a.steps+" steps add no value for the patient. Which could you stop doing altogether?");
  if(a.handoffs>=3) P.push("The patient or the work changes hands "+a.handoffs+" times. Could one person or team do more of the journey?");
  const waits=am.steps.filter(s=>s.type==="wait"&&+s.time>0).sort((x,y)=>y.time-x.time).slice(0,3);
  if(waits.length) P.push("Longest wait"+(waits.length>1?"s":"")+": "+waits.map(s=>"step "+num(s)+", "+(s.text||"untitled")+" ("+fmtT(s.time)+")").join("; ")+". What is the work waiting for?");
  if(a.lead>0&&a.vaPct<25) P.push("Only "+Math.round(a.vaPct)+"% of the lead time adds value. Shortening waits will usually do more than speeding up the work itself.");
  am.steps.filter(s=>s.bottleneck).forEach(s=>P.push("Step "+num(s)+" is marked as a bottleneck. Protect its capacity: make sure it never waits for work, and move tasks away from it that others could do."));
  if(a.loops) P.push(a.loops+" rework loop"+(a.loops>1?"s send":" sends")+" work back. Fix the cause at source rather than checking for it later.");
  if(a.paths) P.push(a.paths+" decision"+(a.paths>1?"s send":" sends")+" some cases down a new path. How often does each path happen, and what would make it unnecessary?");
  if(a.nnva) P.push("Necessary steps can still be simplified or done at the same time as something else. Look at the "+a.nnva+" amber step"+(a.nnva>1?"s":"")+".");
  if(a.issues) P.push("There "+(a.issues>1?"are ":"is ")+a.issues+" issue note"+(a.issues>1?"s":"")+" on the map. Group them, then pick the ones that matter most to patients.");
  P.push("Could any steps happen in parallel instead of one after another?");
  P.push("Is anything done twice, by different people, or written down in more than one place?");
  h+='<div class="section-h"><h2>Questions for redesign</h2></div><ul class="prompts">'+P.map(t=>"<li>"+esc(t)+"</li>").join("")+'</ul>';
  h+='<div class="notice">Test redesigned steps with small PDSA cycles, and track lead time on a <a href="{{ '/run_chart/' | relative_url }}">run chart</a> to see whether the change is an improvement.</div>';
  $("#analysis").innerHTML=h;
}

/* ---------- checks ---------- */
function renderChecks(){
  const m=map(), C=[];
  const add=(s,t,d)=>C.push({s,t,d});
  const sc=state.scope;
  if(sc.start.trim()&&sc.end.trim()) add("pass","Start and end points agreed",'From "'+sc.start+'" to "'+sc.end+'".');
  else add("warn","Agree the start and end points","Fill in where the process starts and ends so the team maps the same thing.");
  if(!m){add("info","No redesign yet","Switch to Current to check that map, or start a redesign.");}
  else{
    const st=m.steps, M=metrics(m);
    if(st.length&&st[0].type==="terminator"&&st[st.length-1].type==="terminator") add("pass","Map has a start and an end","The first and last steps are start or end shapes.");
    else add("warn","Mark the start and end","Make the first and last steps Start / end shapes so the boundaries are clear.");
    const empty=st.filter(s=>!s.text.trim()).length;
    if(empty) add("warn",empty+" step"+(empty>1?"s have":" has")+" no description","Describe each step as an action, for example \"Books in sample\".");
    else if(st.length) add("pass","Every step is described","");
    if(M.unc) add("warn",M.unc+" step"+(M.unc>1?"s aren't":" isn't")+" classified","For each one ask: would the patient value this? Mark it value-adding, necessary or non-value-adding.");
    else if(M.steps) add("pass","Every step is classified for value","");
    if(M.untimed) add("info",M.untimed+" step"+(M.untimed>1?"s have":" has")+" no time","Rough times are fine. They give you lead time and show where the waits are.");
    else if(M.steps) add("pass","Times recorded","Lead time is "+fmtT(M.lead)+".");
    const F=flow(m);
    const openD=st.filter((s,i)=>s.type==="decision"&&!s.noTo&&!F.runs[i]);
    if(openD.length) add("info",openD.length+" decision"+(openD.length>1?"s have":" has")+" no 'no' route","If a 'no' sends work back to an earlier step, link it so the rework loop shows. If it goes a different way, add a new path.");
    const lost=st.map((s,i)=>s.type==="branch"&&F.onPath[i]===undefined?i+1:0).filter(Boolean);
    if(lost.length) add("warn","New path step"+(lost.length>1?"s ":" ")+lost.join(", ")+(lost.length>1?" don't":" doesn't")+" follow a decision","Move "+(lost.length>1?"them":"it")+" to straight after a decision, or change the type to Activity.");
    Object.keys(F.runs).forEach(k=>{
      const r=F.runs[k];
      if(r.after<0) add("info","Decision "+(+k+1)+" has no 'yes' step","Its new path is at the end of the map. Add the steps that follow a 'yes' after the path.");
    });
    if(!M.waits&&M.steps) add("info","No waits mapped","Most processes have queues. Add them as Wait / queue steps so they are counted.");
    const usedL=new Set(st.map(s=>s.lane));
    const idle=m.lanes.filter(l=>!usedL.has(l.id));
    if(idle.length) add("info","Lane"+(idle.length>1?"s":"")+" with no steps",idle.map(l=>l.name||"Unnamed").join(", ")+". Remove "+(idle.length>1?"them":"it")+" or add the steps that happen there.");
    if(usedL.size<2&&M.steps) add("info","Only one lane in use","Give each role its own lane so hand-offs show up.");
    if(!M.hasPatient) add("info","No patient lane","Tick Patient on the patient's lane to count the steps they go through.");
    if(!M.bottlenecks&&M.steps>4) add("info","No bottleneck marked","Where does work pile up? Mark that step as the bottleneck.");
  }
  if(state.maps.future){
    const a=metrics(state.maps.current), b=metrics(state.maps.future);
    const dl=a.lead-b.lead, dn=a.nva-b.nva, dh=a.handoffs-b.handoffs;
    if(dl>0||dn>0||dh>0) add("pass","Redesign improves the process",[dn>0?dn+" fewer non-value-adding step"+(dn>1?"s":""):"",dh>0?dh+" fewer hand-off"+(dh>1?"s":""):"",dl>0?"lead time down by "+fmtT(dl):""].filter(Boolean).join(", ")+". Now test it with PDSA cycles.");
    else add("warn","Redesign isn't better yet","It doesn't reduce lead time, waste or hand-offs compared with the current map.");
  } else add("info","No redesign yet","Once you have analysed the current map, start a redesign to compare the two.");
  const warns=C.filter(c=>c.s==="warn").length, b=$("#checkBadge");
  b.textContent=warns; b.classList.toggle("zero",!warns);
  $("#checks").innerHTML=C.map(c=>'<div class="check"><span class="dot '+c.s+'" aria-hidden="true">'+(c.s==="pass"?"✓":c.s==="warn"?"!":"i")+'</span><div><b>'+esc(c.t)+'</b>'+(c.d?'<p>'+esc(c.d)+'</p>':"")+'</div></div>').join("");
}

/* ---------- tabs ---------- */
function showTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected",String(t.dataset.tab===name)));
  document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("active",p.id==="pane-"+name));
}
document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{showTab(t.dataset.tab);if(t.dataset.tab==="build")document.querySelectorAll("#pane-build textarea").forEach(autosize);}));

/* ---------- table dialog ---------- */
function toTable(m){
  const idx={}; m.steps.forEach((s,i)=>idx[s.id]=i+1);
  const tn={terminator:"Start/end",step:"Activity",decision:"Decision",branch:"New path",wait:"Wait"};
  const out=[["Lane","Step","Type","Value","Time ("+UNITS[state.unit]+")","Issue","If no go to","Bottleneck"].join("\t")];
  /* for a new path step, "If no go to" holds where the path goes next: a step number or End */
  const go=s=>s.type==="branch"?(s.thenTo==="end"?"End":s.thenTo?idx[s.thenTo]:""):s.noTo?idx[s.noTo]:"";
  m.steps.forEach(s=>out.push([laneOf(m,s.lane).name,s.text,tn[s.type],VSHORT[s.value]||"",s.time,s.issue,go(s),s.bottleneck?"Yes":""].map(c=>String(c==null?"":c).replace(/[\t\n]/g," ")).join("\t")));
  return out.join("\n");
}
function fromTable(src,old){
  const lines=src.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length&&/^\s*lane\b/i.test(lines[0])) lines.shift();
  const m={lanes:[],steps:[]}, byName={}, gotos=[];
  const oldP={}; if(old) old.lanes.forEach(l=>oldP[l.name.trim().toLowerCase()]=l.patient);
  lines.forEach(line=>{
    const c=(line.indexOf("\t")>=0?line.split("\t"):line.split("|")).map(x=>x.trim());
    const ln=c[0]||"Lane", key=ln.toLowerCase();
    if(!byName[key]){const l=L(ln,oldP[key]!==undefined?oldP[key]:/patient|service user|carer/i.test(ln));byName[key]=l;m.lanes.push(l);}
    const ty=(c[2]||"").toLowerCase(), va=(c[3]||"").toLowerCase().replace(/[^a-z]/g,"");
    const type=/new path|path|branch|altern/.test(ty)?"branch":/start|end|termin/.test(ty)?"terminator":/decis|question|\?/.test(ty)?"decision":/wait|queue|delay/.test(ty)?"wait":"step";
    const value=type==="terminator"?"":va==="nnva"||/necess|amber/.test(va)?"nnva":va==="nva"||/^non|waste|red/.test(va)?"nva":va==="va"||/^value|green/.test(va)?"va":"";
    const t=c[4]===undefined||c[4]===""||isNaN(+c[4])?"":Math.max(0,+c[4]);
    const s=S(byName[key],type,c[1]||"",value,t,{issue:c[5]||"",bottleneck:/^(y|yes|true|x|1)$/i.test(c[7]||"")});
    gotos.push(c[6]||""); m.steps.push(s);
  });
  m.steps.forEach((s,i)=>{
    const raw=gotos[i].trim(), g=parseInt(raw,10);
    if(s.type==="decision"&&g>=1&&g<=m.steps.length&&g!==i+1) s.noTo=m.steps[g-1].id;
    if(s.type==="branch"){ if(/^end/i.test(raw)) s.thenTo="end"; else if(g>=1&&g<=m.steps.length&&g!==i+1) s.thenTo=m.steps[g-1].id; }
  });
  if(!m.lanes.length) m.lanes.push(L("Patient",true));
  return m;
}
const dlg=$("#tableDlg");
$("#btnTable").addEventListener("click",()=>{const m=map();$("#tableText").value=m?toTable(m):"Lane\tStep\tType\tValue\tTime\tIssue\tIf no go to\tBottleneck\n";dlg.showModal();});
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
      const csv=toTable(m).split("\n").map((r,i)=>[i?i:"Step number"].concat(r.split("\t")).map(q).join(",")).join("\n");
      saveFile(slug()+suffix()+".csv","\uFEFF"+csv,"text/csv");
    })}
  ])
});
trackSettings({timeline:"vTimeline",issues:"vIssues",handoffs:"vHandoffs",timeUnit:"unitSel"});
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

/* ---------- render all ---------- */
function renderAll(){
  $("#title").value=state.title; $("#scStart").value=state.scope.start; $("#scEnd").value=state.scope.end; $("#scWho").value=state.scope.who;
  $("#mapCur").setAttribute("aria-pressed",String(state.active==="current"));
  $("#mapFut").setAttribute("aria-pressed",String(state.active==="future"));
  $("#vTimeline").checked=state.view.timeline; $("#vIssues").checked=state.view.issues; $("#vHandoffs").checked=state.view.handoffs;
  renderEditor(); renderCanvas(); renderChecks(); renderAnalysis();
}

/* ---------- suite menus ---------- */

renderAll();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>renderCanvas());
})();
