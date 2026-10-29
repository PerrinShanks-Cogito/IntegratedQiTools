---
# Liquid fills in the site links below
---
/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* MiQi improvement project: one project at a time, worked through the FOCUS
   stages (Find, Observe, Create, Undertake, Sustain, then Close). Based on the
   FOCUS QI project tracker. The project is kept in this tab (sessionStorage)
   and saved and opened as a project file with the shared toolbar. The MiQi
   Projects menu in the header opens this page with ?new=1, or with a project
   file it has just read (see focus-header.js). */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const KEY="miqi-project-v1";
const OPEN_KEY="miqi-open"; // a project file read by the header's Open a saved QI project

const LINKS={
  chatbot:{{ site.links.qi_coach | jsonify }},
  clinic:"https://nhs.sharepoint.com/:u:/r/sites/msteams_de9171/SitePages/Coaching,-Mentoring-%26-QI-Clinics.aspx?d=w388a701be9e940038a5ed1ab42b9b192&csf=1&web=1&e=6gO0oF",
  training:{{ site.links.citi_academy | jsonify }},
  community:"https://teams.microsoft.com/l/channel/19%3AtqDE8DYvOERF7Q7JAJyW4WuaJFD6AmLJ07wypT9dVks1%40thread.tacv2/Improvement%20Community%20Hub?groupId=1bf22369-4401-488f-8994-68e3d2340c12&tenantId=37c354b2-85b0-47f5-b222-07b48d774ee3",
  priorities:"https://intranet.gstt.nhs.uk/clinical-services/how-we-keep-patients-safe-and-improve-our-care/our-improvement-priorities/",
  girft:"https://gettingitrightfirsttime.co.uk/",
  modelHospital:"https://model.nhs.uk/"
};

const OPTS={
  group:["Cancer and Surgery","Evelina London Children's","Integrated and Specialist Medicine","Heart, Lung and Critical Care","Diagnostics and Pharmacy","Essentia","Finance","People","Digital Services","Corporate Nursing","Other corporate team"],
  domain:["Safe","Effective","Patient-centred","Timely","Efficient","Equitable"],
  submission:["Improvement idea","QI project","Part of a QI programme","QI fellowship or training project","Other"],
  profession:["Nursing and midwifery","Medical and dental","Allied health professional","Healthcare scientist","Pharmacy","Administrative and clerical","Estates and facilities","Management","Other"],
  sites:["St Thomas'","Guy's","Royal Brompton","Harefield","Evelina"],
  status:["Completed","Closed, not progressed","On hold","Merged with another project"],
  scalable:["Yes","No","Not sure"],
  realised:["Yes","Partially","No","Too early to tell"],
  beneficiaries:["Patients","Staff","Mixed"],
  reach:["Less than 100","100 - 999","1000 - 9999","10000 +"],
  pdsaOutcome:["Adopted","Adapted","Abandoned"]
};

/* Each stage's fields, the checks before moving on, and the tools on this site that help with it */
const STAGES=[
 {id:"find",letter:"F",name:"Find the opportunity",
  intro:"Tell us what you want to improve, why it matters and who is involved.",
  tools:[["fishbone_diagram","Map the causes behind the problem"],["pareto_chart","Find the few causes that matter most"],["process_map","See how the process works now"]],
  fields:[
   {k:"title",t:"text",l:"Project title",req:true},
   {k:"description",t:"textarea",l:"Briefly describe the project"},
   {k:"expectedBenefits",t:"textarea",l:"Expected benefits",hint:"What will be better if this works, and for whom?"},
   {row:[{k:"group",t:"select",l:"Clinical group / corporate team",o:"group"},{k:"domain",t:"select",l:"Quality domain",o:"domain"}]},
   {k:"submissionType",t:"select",l:"Submission type",o:"submission"},
   {h:"People"},
   {k:"submitter",t:"text",l:"Your name",hint:"The person submitting this project."},
   {row:[{k:"leadName",t:"text",l:"Project lead name"},{k:"leadEmail",t:"email",l:"Project lead email"}]},
   {k:"profession",t:"select",l:"Project lead professional group",o:"profession"},
   {row:[{k:"sponsor",t:"text",l:"Line manager / sponsor"},{k:"coach",t:"text",l:"Project coach / advisor"}]},
   {k:"collaborators",t:"textarea",l:"QI collaborators",hint:"Anyone else working on the project with you. Add names and teams, one per line."},
   {k:"sponsorSupport",t:"yesno",l:"Does your line manager / sponsor support the project?"},
   {h:"Where"},
   {k:"sites",t:"checks",l:"Project sites",o:"sites"}
  ],
  checklist:[
   {k:"ckClear",q:"Are you clear on what you are trying to accomplish?"},
   {k:"ckChatbot",q:"Have you run your opportunity by our QI Coach chatbot?",links:[["Open the QI Coach chatbot",LINKS.chatbot]]},
   {k:"ckTools",q:"Have you checked out our QI tools?",note:"Fishbone diagrams can be useful in analysing root causes."},
   {k:"ckAligned",q:"Is your project aligned with strategic goals like these?",links:[["Our improvement priorities (intranet)",LINKS.priorities],["Getting It Right First Time (GIRFT)",LINKS.girft],["NHS England Model Hospital",LINKS.modelHospital]]}
  ]},
 {id:"observe",letter:"O",name:"Observe the current state",
  intro:"Understand what is happening now and how you will know whether things have improved.",
  tools:[["process_map","Map the current process"],["run_chart","Plot your baseline over time"],["spc_tool","See how much the process varies"],["histogram","See the spread of your measurements"],["pareto_chart","Rank causes by how often they happen"]],
  fields:[
   {k:"measuring",t:"textarea",l:"Document how you are measuring your improvement"},
   {k:"evidence",t:"textarea",l:"Supporting evidence or rationale"},
   {k:"currentState",t:"textarea",l:"What is the current state?"},
   {k:"baseline",t:"textarea",l:"What are your baseline measures?"}
  ],
  docsLabel:"Supporting documents",
  checklist:[
   {k:"ckRca",q:"Have you developed a full understanding of the current state using root cause analysis techniques?"},
   {k:"ckBaseline",q:"Have you established a baseline measurement?"},
   {k:"ckTeam",q:"Have you briefed your project team?",note:"If it is only you, just mark yes."},
   {k:"ckStakeholders",q:"Have you engaged with customer side stakeholders?"}
  ]},
 {id:"create",letter:"C",name:"Create the plan",
  intro:"Set a clear aim and decide which changes you will test first.",
  tools:[["driver_diagram","Link your aim to the changes you will test"],["matrix_2x2","Score change ideas by ease and impact"]],
  fields:[
   {k:"smartAim",t:"yesno",l:"Do you have a SMART aim?",hint:"Specific, measurable, achievable, relevant and time-bound."},
   {k:"planOnPage",t:"yesno",l:"Have you created a Plan on a Page?"},
   {k:"solutions",t:"yesno",l:"Do you have a list of solutions to test?"}
  ],
  checklist:[
   {k:"smartAim",q:"Do you have a SMART aim?"},
   {k:"planOnPage",q:"Have you created a Plan on a Page?"},
   {k:"solutions",q:"Do you have a list of solutions to test?"}
  ]},
 {id:"undertake",letter:"U",name:"Undertake the plan",
  intro:"Test your changes, record what happens and keep a log of progress.",
  tools:[["run_chart","Track your measure as you test changes"],["spc_tool","Check whether a change is a real improvement"]],
  fields:[
   {k:"updates",t:"log",l:"Progress updates"},
   {k:"pdsaCount",t:"number",l:"Number of completed PDSA cycles"},
   {k:"pdsa",t:"pdsa",l:"PDSA cycles",hint:"List what each cycle changed and whether you adopted, adapted or abandoned the change."},
   {k:"loggedImprovements",t:"yesno",l:"Have you logged the improvements you have undertaken?"}
  ],
  checklist:[{k:"loggedImprovements",q:"Have you logged the improvements you have undertaken?"}]},
 {id:"sustain",letter:"S",name:"Sustain the benefit",
  intro:"Make sure the improvement holds once the project team steps back.",
  tools:[["spc_tool","Watch the measure for signs of slipping back"],["run_chart","Keep plotting the measure over time"]],
  fields:[
   {k:"sustainPlan",t:"yesno",l:"Have you created a sustainability plan?"},
   {k:"bau",t:"yesno",l:"Has the change been established in business as usual?"}
  ],
  checklist:[
   {k:"sustainPlan",q:"Have you created a sustainability plan?"},
   {k:"bau",q:"Has the change been established in business as usual?"}
  ]},
 {id:"close",letter:"✓",name:"Close",
  intro:"Record the outcome and share what you learned so others can build on it.",
  tools:[["a3_report","Tell the project's story on one page"]],
  fields:[
   {row:[{k:"status",t:"select",l:"Project status",o:"status"},{k:"completionDate",t:"date",l:"Completion date"}]},
   {k:"realised",t:"radio3",l:"Did this project realise its expected benefits?",o:"realised"},
   {k:"beneficiaries",t:"radio3",l:"Who benefits from the project?",o:"beneficiaries"},
   {k:"reach",t:"radio3",l:"How many people does this affect per year?",o:"reach"},
   {k:"learning",t:"textarea",l:"Key learning from your project"},
   {k:"poster",t:"url",l:"Link to poster",hint:"Paste a SharePoint or web link."},
   {k:"scalable",t:"radio3",l:"Is this idea scalable?",o:"scalable"},
   {k:"pulse",t:"pulse",l:"Project promoted to Pulse"}
  ]}
];
const LAST=STAGES.length-1;

/* ---------- the other tools on this site ---------- */
let TOOLS={}, BASE="";
try{
  const el=$("#toolsData"); BASE=el.dataset.base||"";
  JSON.parse(el.textContent).forEach(t=>{TOOLS[t.id]=t;});
}catch(e){TOOLS={};}
const toolUrl=id=>BASE+"/"+id+"/";

/* ---------- the programme guide's documents, by stage ---------- */
let GUIDE=[], GUIDE_BASE="";
try{const el=$("#guideDocs"); GUIDE_BASE=el.dataset.base||""; GUIDE=JSON.parse(el.textContent);}catch(e){GUIDE=[];}
const KIND={slides:"PowerPoint",sheet:"Excel",doc:"Word"};
/* the guide has no Close stage: its closure report sits under Sustain */
const guideDocs=sid=>GUIDE.filter(d=>d.stage===(sid==="close"?"sustain":sid));

/* ---------- state ---------- */
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const uid=()=>Math.random().toString(36).slice(2,9);
function blankProject(){return {id:uid(),stage:0,closed:false,created:today(),history:[{stage:0,date:today()}],data:{sites:[],updates:[],pdsa:[]},docs:{}};}

/* Check a project read from a file or this tab, and keep only what this page uses */
const isDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const stageNo=n=>Number.isInteger(n)&&n>=0&&n<=LAST?n:0;
function normalise(p){
  if(!p||typeof p!=="object"||!p.data||typeof p.data!=="object") throw new Error("bad");
  const out=blankProject();
  out.id=typeof p.id==="string"?p.id.slice(0,40):out.id;
  out.stage=stageNo(p.stage); out.closed=!!p.closed;
  if(isDate(p.created)) out.created=p.created;
  const h=Array.isArray(p.history)?p.history.filter(x=>x&&isDate(x.date)).map(x=>({stage:stageNo(x.stage),date:x.date})):[];
  out.history=h.length?h:[{stage:out.stage,date:out.created}];
  const d={};
  Object.keys(p.data).forEach(k=>{
    const v=p.data[k];
    if(typeof v==="string") d[k]=v;
    else if(k==="sites"&&Array.isArray(v)) d[k]=v.filter(x=>OPTS.sites.includes(x));
    else if(k==="updates"&&Array.isArray(v)) d[k]=v.filter(u=>u&&isDate(u.date)&&typeof u.text==="string").map(u=>({date:u.date,text:u.text}));
    else if(k==="pdsa"&&Array.isArray(v)) d[k]=v.filter(c=>c&&typeof c.change==="string"&&OPTS.pdsaOutcome.includes(c.outcome)).map(c=>({change:c.change,outcome:c.outcome}));
  });
  out.data=Object.assign({sites:[],updates:[],pdsa:[]},d);
  if(p.docs&&typeof p.docs==="object") STAGES.forEach(s=>{const a=p.docs[s.id]; if(Array.isArray(a)) out.docs[s.id]=a.filter(n=>typeof n==="string").map(n=>n.slice(0,200));});
  return out;
}

let P=null;
try{const raw=sessionStorage.getItem(KEY); if(raw) P=normalise(JSON.parse(raw));}catch(e){P=null;}
if(!P) P=blankProject();
let viewStage=P.closed?LAST:P.stage;

let saveTimer;
function persist(){try{sessionStorage.setItem(KEY,JSON.stringify(P));}catch(e){}}
function save(){
  clearTimeout(saveTimer); persist();
  const el=$("#savedNote"); if(el) el.textContent="Kept in this tab at "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
function saveSoon(){clearTimeout(saveTimer); saveTimer=setTimeout(save,400);}
/* keep the last few keystrokes when the page is refreshed or closed */
window.addEventListener("pagehide",persist);
function hasData(){
  const d=P.data;
  return P.stage>0||P.closed||Object.keys(d).some(k=>Array.isArray(d[k])?d[k].length:String(d[k]||"").trim())||Object.values(P.docs).some(a=>a.length);
}

/* ---------- helpers ---------- */
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=d=>d?new Date(d+"T00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"";
const X_SVG='<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
let tt;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2600);}
const stageLabel=p=>p.closed?"Closed":STAGES[p.stage].name;
const ext=u=>/^https?:\/\//i.test(u)?' target="_blank" rel="noopener"':"";

/* ---------- fields ---------- */
function seg(name,k,opts,v,short){
  return '<div class="seg">'+opts.map(o=>'<label><input type="radio" name="'+name+'" data-k="'+k+'" value="'+esc(o)+'"'+(v===o?" checked":"")+'><span>'+esc(short?short(o):o)+'</span></label>').join("")+'</div>';
}
function fieldHTML(f,d){
  if(f.h) return '<h3 class="group-title">'+esc(f.h)+'</h3>';
  if(f.row) return '<div class="grid2">'+f.row.map(x=>fieldHTML(x,d)).join("")+'</div>';
  const id="f_"+f.k, v=d[f.k];
  const lab=esc(f.l)+(f.req?' <span class="req" aria-hidden="true">*</span>':"");
  const hint=f.hint?'<span class="hint" id="'+id+'_h">'+esc(f.hint)+'</span>':"";
  const desc=f.hint?' aria-describedby="'+id+'_h"':"";
  switch(f.t){
    case "text": case "email": case "url": case "date":
      return '<div class="field"><label for="'+id+'">'+lab+'</label>'+hint+'<input type="'+f.t+'" id="'+id+'" data-k="'+f.k+'" value="'+esc(v)+'"'+desc+(f.req?" required":"")+'></div>';
    case "textarea":
      return '<div class="field"><label for="'+id+'">'+lab+'</label>'+hint+'<textarea id="'+id+'" data-k="'+f.k+'"'+desc+'>'+esc(v)+'</textarea></div>';
    case "select":
      return '<div class="field"><label for="'+id+'">'+lab+'</label>'+hint+'<select id="'+id+'" data-k="'+f.k+'"'+desc+'><option value="">Select an option</option>'+OPTS[f.o].map(o=>'<option'+(o===v?" selected":"")+'>'+esc(o)+'</option>').join("")+'</select></div>';
    case "number":
      return '<div class="field"><label for="'+id+'">'+lab+'</label>'+hint+'<input type="number" min="0" step="1" inputmode="numeric" id="'+id+'" data-k="'+f.k+'" value="'+esc(v)+'" style="max-width:8rem"'+desc+'></div>';
    case "yesno": case "radio3":
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend>'+hint+seg(id,f.k,f.t==="yesno"?["Yes","No"]:OPTS[f.o],v)+'</fieldset>';
    case "checks":
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend><div class="checks">'+OPTS[f.o].map(o=>'<label><input type="checkbox" data-k="'+f.k+'" value="'+esc(o)+'"'+((v||[]).includes(o)?" checked":"")+'>'+esc(o)+'</label>').join("")+'</div></fieldset>';
    case "pulse":
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend>'+hint+
        '<div class="pulse-row">'+seg(id,f.k,["Yes","No"],v)+'<button type="button" class="btn" data-act="exportPulse">Export project for upload to Pulse</button></div></fieldset>';
    case "pdsa":{
      const cyc=v||[];
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend>'+hint+
        '<div class="pdsa-add"><div><label for="pdsaChange" class="hint" style="margin:0 0 .3rem">What did this cycle change?</label><input type="text" id="pdsaChange" placeholder="For example: added a pharmacy prompt at the 10am huddle"></div>'+
        '<div><span class="hint" style="margin:0 0 .3rem" id="pdsaOutLbl">Outcome</span><div role="radiogroup" aria-labelledby="pdsaOutLbl">'+
        '<div class="seg">'+OPTS.pdsaOutcome.map((o,i)=>'<label><input type="radio" name="pdsaOut" value="'+o+'"'+(i===0?" checked":"")+'><span>'+o.replace("ed","")+'</span></label>').join("")+'</div></div></div></div>'+
        '<div style="margin-top:.6rem"><button type="button" class="btn" data-act="addPdsa">Add PDSA cycle</button></div>'+
        (cyc.length?'<ol class="pdsa">'+cyc.map((c,i)=>'<li><span>'+esc(c.change)+'</span><span class="out '+c.outcome+'">'+c.outcome+'</span><button type="button" class="xbtn" data-act="rmPdsa" data-i="'+i+'" aria-label="Delete cycle '+(i+1)+'" title="Delete cycle">'+X_SVG+'</button></li>').join("")+'</ol>':'<p class="empty">No PDSA cycles listed yet.</p>')+'</fieldset>';}
    case "log":{
      const list=(v||[]).map((u,i)=>Object.assign({i:i},u)).reverse();
      return '<div class="field"><label for="'+id+'">'+lab+'</label><span class="hint">Add a dated note each time you test a change or reach a milestone.</span>'+
        '<textarea id="'+id+'" placeholder="What did you test, what happened, what will you do next?"></textarea>'+
        '<div style="margin-top:.6rem"><button type="button" class="btn" data-act="addUpdate">Add update</button></div>'+
        (list.length?'<ul class="log">'+list.map(u=>'<li><div><time>'+fmt(u.date)+'</time>'+esc(u.text)+'</div><button type="button" class="xbtn" data-act="rmUpdate" data-i="'+u.i+'" aria-label="Delete update from '+fmt(u.date)+'" title="Delete update">'+X_SVG+'</button></li>').join("")+'</ul>':'<p class="empty">No updates yet. Your first update will appear here.</p>')+'</div>';}
  }
  return "";
}

/* ---------- render ---------- */
/* the project's name on its button in the header (focus-header.js) */
function syncHeader(){if(window.FocusHeader) window.FocusHeader.setProject(P.data.title,hasData());}
window.addEventListener("load",syncHeader);
function renderHead(){
  const d=P.data;
  syncHeader();
  $("#projTitle").textContent=d.title||"Untitled project";
  $("#projMeta").textContent=[d.leadName&&("Led by "+d.leadName),d.group,"Started "+fmt(P.created)].filter(Boolean).join(", ");
  const st=$("#projStatus");
  st.textContent=P.closed?"Closed":"Current stage: "+STAGES[P.stage].name;
  st.className="pill"+(P.closed?" done":"");
}
function render(){
  renderHead();
  $("#rail").innerHTML=STAGES.map((s,i)=>{
    const done=P.closed||i<P.stage, current=!P.closed&&i===P.stage;
    const stTxt=done?"Complete":current?"In progress":"Not started";
    return '<button type="button" role="tab" id="tab_'+s.id+'" aria-controls="panel" aria-selected="'+(i===viewStage)+'" tabindex="'+(i===viewStage?0:-1)+'" class="'+(done?"done":current?"current":"")+'" data-stage="'+i+'">'+
      '<span class="letter" aria-hidden="true">'+s.letter+'</span><span class="name">'+s.name+'</span><span class="state">'+stTxt+'</span>'+
      '<span class="sr">'+s.name+', '+stTxt+'</span></button>';
  }).join("");

  const s=STAGES[viewStage], isCurrent=!P.closed&&viewStage===P.stage;
  let notice="";
  if(P.closed) notice='<p class="notice">This project is closed. You can still view and update the record.</p>';
  else if(viewStage>P.stage) notice='<p class="notice">This project is at <strong>'+STAGES[P.stage].name+'</strong>. You can start filling this stage in early.</p>';
  else if(viewStage<P.stage) notice='<p class="notice">This stage is complete. Changes here update the project record.</p>';

  const docs=P.docs[s.id]||[];
  let action="";
  if(s.id==="close") action=P.closed?'<button type="button" class="btn" data-act="reopen">Reopen project</button>':'<button type="button" class="btn primary" data-act="closeProject">Close project</button>';
  else if(isCurrent) action='<button type="button" class="btn primary" data-act="checklist">Ready to move on</button>';

  const panel=$("#panel");
  panel.setAttribute("aria-labelledby","tab_"+s.id);
  panel.innerHTML='<h2>'+s.name+'</h2><p class="intro">'+s.intro+'</p>'+notice+
    '<form id="stageForm" novalidate>'+s.fields.map(f=>fieldHTML(f,P.data)).join("")+'</form>'+
    '<div class="docs"><h3>'+(s.docsLabel||"Documents")+'</h3><p class="hint" style="margin:0 0 .6rem">Keeps a list of the documents for this stage. The files themselves stay where they are.</p>'+
      '<button type="button" class="btn" data-act="addDocs">Add documents</button>'+
      (docs.length?'<ul class="doclist">'+docs.map((n,i)=>'<li><span>'+esc(n)+'</span><button type="button" class="btn small ghost danger" data-act="rmDoc" data-i="'+i+'" aria-label="Remove '+esc(n)+'">Remove</button></li>').join("")+'</ul>':'<p class="empty">No documents added to this stage yet.</p>')+
    '</div>'+
    '<div class="stage-actions">'+action+'<span class="saved" id="savedNote">Changes are kept in this tab as you type</span></div>';
  renderAside();
}
function renderAside(){
  const d=P.data, s=STAGES[viewStage];
  const docCount=Object.values(P.docs).reduce((a,b)=>a+b.length,0);
  const tools=(s.tools||[]).filter(([id])=>TOOLS[id]);
  $("#aside").innerHTML=
   '<div class="card"><h3>Project summary</h3><dl>'+
     '<dt>Lead</dt><dd>'+esc(d.leadName||"Not set")+'</dd>'+
     '<dt>Sponsor</dt><dd>'+esc(d.sponsor||"Not set")+'</dd>'+
     '<dt>Sites</dt><dd>'+esc((d.sites||[]).join(", ")||"Not set")+'</dd>'+
     '<dt>Domain</dt><dd>'+esc(d.domain||"Not set")+'</dd>'+
     '<dt>Documents</dt><dd>'+docCount+'</dd></dl></div>'+
   (tools.length?'<div class="card"><h3>Tools for this stage</h3><ul class="toollinks">'+tools.map(([id,why])=>'<li><a href="'+esc(toolUrl(id))+'" target="_blank" rel="noopener">'+esc(TOOLS[id].name)+'<span class="sr"> (opens in a new tab)</span></a><span class="why">'+esc(why)+'</span></li>').join("")+'</ul>'+
     '<p class="hint" style="margin:.6rem 0 0">Tools open in a new tab, so this project stays open here.</p></div>':"")+
   guideCard(s)+
   '<div class="card"><h3>Stage history</h3><ul class="history">'+P.history.slice().reverse().map(h=>'<li><span>'+STAGES[h.stage].name+'</span><time>'+fmt(h.date)+'</time></li>').join("")+'</ul></div>'+
   '<div class="card"><h3>Need a hand?</h3><ul class="helplinks">'+
     '<li><a href="'+esc(LINKS.chatbot)+'" target="_blank" rel="noopener">Ask the QI Coach chatbot</a></li>'+
     '<li><a href="'+esc(LINKS.clinic)+'" target="_blank" rel="noopener">Book a QI Clinic</a></li>'+
     '<li><a href="'+esc(LINKS.training)+'" target="_blank" rel="noopener">Book training with the CITI Academy</a></li>'+
     '<li><a href="'+esc(LINKS.community)+'" target="_blank" rel="noopener">Ask a question in the Improvement Community Hub</a></li></ul></div>';
}

function guideCard(s){
  const docs=guideDocs(s.id); if(!docs.length) return "";
  const kind=d=>KIND[d.kind]||"";
  const kinds=[...new Set(docs.map(kind).filter(Boolean))];
  return '<div class="card"><h3>Programme documents</h3><ul class="guidedocs">'+docs.map(d=>
    '<li><span class="dname">'+(d.code?'<span class="code">'+esc(d.code)+'</span>':"")+esc(d.name)+'</span>'+
    '<span class="why">'+esc(d.purpose)+'</span><span class="dl">'+
    (d.template?'<a href="'+esc(GUIDE_BASE+"templates/"+d.template)+'" download>Blank template<span class="sr"> for '+esc(d.name)+', '+kind(d)+'</span></a>':"")+
    (d.example?'<a href="'+esc(GUIDE_BASE+"examples/"+d.example)+'" download>Worked example<span class="sr"> of '+esc(d.name)+', '+kind(d)+'</span></a>':"")+
    '</span></li>').join("")+'</ul>'+
    '<p class="hint" style="margin:.7rem 0 0">'+(kinds.length?"Files download as "+(kinds.length>1?kinds.slice(0,-1).join(", ")+" and "+kinds[kinds.length-1]:kinds[0])+". ":"")+
    'See how they fit together in the <a href="'+esc(GUIDE_BASE)+'" target="_blank" rel="noopener">programme guide<span class="sr"> (opens in a new tab)</span></a>.</p></div>';
}

/* ---------- move-on checklist ---------- */
const dlg=$("#dlg");
function openChecklist(){
  const s=STAGES[P.stage], next=Math.min(P.stage+1,LAST);
  const yn=k=>seg("c_"+k,"",["Yes","No"],P.data[k]).replace(/data-k=""/g,'data-ck="'+k+'"');
  dlg.innerHTML=
   '<div class="dlg-head"><h2 id="dlgTitle">Ready to move on from '+s.name+'?</h2><p>Check you have covered the essentials before moving to the next FOCUS stage.</p></div>'+
   '<div class="dlg-body"><ol>'+
     s.checklist.map(c=>'<li class="q"><div><div class="qtext">'+esc(c.q)+'</div>'+
       (c.note?'<p class="sub" style="padding-left:0">'+esc(c.note)+'</p>':"")+
       (c.links?'<ul class="sub">'+c.links.map(([t,u])=>'<li><a href="'+esc(u)+'"'+ext(u)+'>'+esc(t)+'</a></li>').join("")+'</ul>':"")+
       yn(c.k)+'</div></li>').join("")+
     '<li class="q"><div><div class="qtext">Ready to move to the next stage?</div>'+yn("ckReady_"+s.id)+'</div></li>'+
     '<li class="q"><div><label class="qtext" for="ckDate">Date of the stage change</label><input type="date" id="ckDate" value="'+today()+'"></div></li>'+
     '<li class="q"><div><label class="qtext" for="ckStage">New stage</label>'+
       '<select id="ckStage">'+STAGES.map((x,i)=>'<option value="'+i+'"'+(i===next?" selected":"")+'>'+x.name+'</option>').join("")+'</select></div></li>'+
   '</ol><p class="warn" id="ckWarn" hidden></p></div>'+
   '<div class="dlg-foot"><button type="button" class="btn" data-act="dlgCancel">Not yet</button><button type="button" class="btn primary" data-act="dlgConfirm">Move to '+STAGES[next].name+'</button></div>';
  dlg.showModal();
}
dlg.addEventListener("change",e=>{
  if(e.target.dataset.ck){P.data[e.target.dataset.ck]=e.target.value; saveSoon();}
  if(e.target.id==="ckStage") dlg.querySelector('[data-act="dlgConfirm"]').textContent="Move to "+STAGES[+e.target.value].name;
});
dlg.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]"), a=b&&b.dataset.act;
  if(e.target===dlg||a==="dlgCancel"){dlg.close(); return;}
  if(a!=="dlgConfirm") return;
  const s=STAGES[P.stage], warn=dlg.querySelector("#ckWarn");
  const target=+dlg.querySelector("#ckStage").value, date=dlg.querySelector("#ckDate").value;
  let msg="";
  if(P.data["ckReady_"+s.id]!=="Yes") msg="Answer yes to \u201cReady to move to the next stage?\u201d to carry on.";
  else if(!date) msg="Enter the date of the stage change.";
  else if(target===P.stage) msg="Choose a different stage.";
  else if(s.id==="find"&&!(P.data.title||"").trim()) msg="Add a project title before moving on.";
  if(msg){warn.textContent=msg; warn.hidden=false; return;}
  P.stage=target; P.history.push({stage:target,date:date}); viewStage=target;
  save(); dlg.close(); render(); toast("Moved to "+STAGES[target].name);
  window.scrollTo({top:0,behavior:"smooth"});
});

/* ---------- stage panel ---------- */
const panel=$("#panel");
function onField(e){
  const el=e.target, k=el.dataset.k; if(!k) return;
  if(el.type==="checkbox") P.data[k]=[...panel.querySelectorAll('input[data-k="'+k+'"]:checked')].map(i=>i.value);
  else P.data[k]=el.value;
  if(k==="title"||k==="leadName"||k==="group") renderHead(); else syncHeader();
  saveSoon(); if(e.type==="change") renderAside();
}
panel.addEventListener("input",onField);
panel.addEventListener("change",onField);
panel.addEventListener("submit",e=>e.preventDefault());

const docInput=$("#docInput");
docInput.addEventListener("change",()=>{
  const sid=STAGES[viewStage].id, n=docInput.files.length; if(!n) return;
  P.docs[sid]=(P.docs[sid]||[]).concat([...docInput.files].map(f=>f.name));
  docInput.value=""; save(); render(); toast(n+" document"+(n>1?"s":"")+" added");
});

panel.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]"); if(!b) return;
  const sid=STAGES[viewStage].id, d=P.data;
  switch(b.dataset.act){
    case "addDocs": docInput.click(); break;
    case "rmDoc": P.docs[sid].splice(+b.dataset.i,1); save(); render(); toast("Document removed"); break;
    case "checklist": openChecklist(); break;
    case "addUpdate":{
      const ta=$("#f_updates"), txt=ta.value.trim();
      if(!txt){ta.focus(); toast("Write your update first"); return;}
      (d.updates=d.updates||[]).push({date:today(),text:txt}); save(); render(); toast("Update added"); break;}
    case "addPdsa":{
      const inp=$("#pdsaChange"), txt=inp.value.trim();
      if(!txt){inp.focus(); toast("Describe what the cycle changed first"); return;}
      (d.pdsa=d.pdsa||[]).push({change:txt,outcome:panel.querySelector('input[name="pdsaOut"]:checked').value});
      if(!d.pdsaCount||+d.pdsaCount<d.pdsa.length) d.pdsaCount=String(d.pdsa.length);
      save(); render(); toast("PDSA cycle added"); break;}
    case "rmUpdate": d.updates.splice(+b.dataset.i,1); save(); render(); toast("Update deleted"); break;
    case "rmPdsa": d.pdsa.splice(+b.dataset.i,1); save(); render(); toast("PDSA cycle deleted"); break;
    case "exportPulse": exportPulse(); break;
    case "closeProject":
      if(!d.status||!d.completionDate){toast("Add a project status and completion date to close"); return;}
      P.closed=true; P.stage=LAST; P.history.push({stage:LAST,date:d.completionDate}); save(); render(); toast("Project closed"); break;
    case "reopen": P.closed=false; save(); render(); toast("Project reopened"); break;
  }
});

const rail=$("#rail");
function showStage(i){viewStage=i; render(); $("#tab_"+STAGES[i].id).focus();}
rail.addEventListener("click",e=>{const b=e.target.closest("[data-stage]"); if(b) showStage(+b.dataset.stage);});
rail.addEventListener("keydown",e=>{
  const k={ArrowLeft:-1,ArrowRight:1}[e.key];
  if(k) showStage((viewStage+k+STAGES.length)%STAGES.length);
  else if(e.key==="Home") showStage(0);
  else if(e.key==="End") showStage(LAST);
  else return;
  e.preventDefault();
});

/* ---------- export for Pulse ---------- */
function pulseCSV(){
  const p=P, d=p.data, v=x=>Array.isArray(x)?x.join("; "):(x==null?"":x);
  const cols=[["Project ID",p.id],["Project title",d.title],["Description",d.description],["Expected benefits",d.expectedBenefits],
    ["Clinical group / corporate team",d.group],["Quality domain",d.domain],["Submission type",d.submissionType],["Submitter",d.submitter],
    ["Project lead",d.leadName],["Project lead email",d.leadEmail],["Project lead professional group",d.profession],
    ["Line manager / sponsor",d.sponsor],["Sponsor support",d.sponsorSupport],["Project coach / advisor",d.coach],["QI collaborators",(d.collaborators||"").replace(/\n+/g,"; ")],
    ["Project sites",d.sites],["Lifecycle stage",stageLabel(p)],["Start date",p.created],
    ["Lifecycle history",p.history.map(h=>STAGES[h.stage].name+" ("+h.date+")")],
    ["How improvement is measured",d.measuring],["Supporting evidence",d.evidence],["Current state",d.currentState],["Baseline measures",d.baseline],
    ["SMART aim",d.smartAim],["Plan on a Page",d.planOnPage],["Solutions to test",d.solutions],
    ["Completed PDSA cycles",d.pdsaCount],["PDSA cycles",(d.pdsa||[]).map((c,i)=>"Cycle "+(i+1)+": "+c.change+" ("+c.outcome+")")],
    ["Progress updates",(d.updates||[]).map(u=>u.date+": "+u.text)],["Improvements logged",d.loggedImprovements],
    ["Sustainability plan",d.sustainPlan],["Established in business as usual",d.bau],
    ["Project status",d.status],["Completion date",d.completionDate],["Expected benefits realised",d.realised],["Who benefits",d.beneficiaries],["People affected per year",d.reach],["Key learning",d.learning],
    ["Poster link",d.poster],["Scalable",d.scalable],["Promoted to Pulse",d.pulse],
    ["Documents",Object.entries(p.docs).flatMap(([st,fs])=>fs.map(f=>st+": "+f))]];
  /* a leading = + - or @ would run as a formula in Excel, so it's quoted out */
  const q=x=>{let s=String(v(x)); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"';};
  return "\uFEFF"+cols.map(c=>q(c[0])).join(",")+"\r\n"+cols.map(c=>q(c[1])).join(",")+"\r\n";
}
const fileBase=()=>((P.data.title||"").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-").slice(0,60)||"miqi-project");
async function exportPulse(){
  const name=fileBase()+"-pulse-export.csv";
  try{if(await FocusActions.saveFile(name,pulseCSV(),"text/csv")) toast("Saved "+name);}
  catch(e){toast("Couldn't save "+name+".");}
}

/* ---------- project files ---------- */
function docOf(){return {focus:{tool:"miqi_project",version:1,saved:new Date().toISOString()},project:P};}
function loadDoc(doc){
  if(!doc||!doc.focus||doc.focus.tool!=="miqi_project") throw new Error(doc&&doc.focus&&doc.focus.tool?"other":"bad");
  P=normalise(doc.project); viewStage=P.closed?LAST:P.stage; save(); render();
}
function openText(text,name){
  let doc; try{doc=JSON.parse(text);}catch(e){return toast("That file isn't a MiQi project file.");}
  try{loadDoc(doc);}
  catch(e){
    const other=doc&&doc.focus&&doc.focus.tool&&doc.focus.tool!=="miqi_project";
    return toast(other?"That file was saved from the "+String(doc.focus.tool).replace(/_/g," ")+" tool. Open it there instead.":"That file isn't a MiQi project file.");
  }
  toast("Opened "+(name||"your project"));
}
const projIn=document.createElement("input");
projIn.type="file"; projIn.accept=".json,application/json"; projIn.className="sr"; projIn.tabIndex=-1; projIn.setAttribute("aria-hidden","true");
document.body.appendChild(projIn);
projIn.addEventListener("change",()=>{
  const f=projIn.files&&projIn.files[0]; if(!f) return;
  projIn.value="";
  const big=FocusActions.tooBig(f,"project"); if(big) return toast(big);
  if(hasData()&&!confirm("Open "+f.name+"? The project open in this tab will be replaced. Choose Cancel, then Save, to keep it.")) return;
  f.text().then(t=>openText(t,f.name),()=>toast("Couldn't read that file."));
});

FocusActions.mount({
  tool:"miqi_project",
  toolName:"project",
  fileName:fileBase,
  save:()=>{
    const name=fileBase()+".json";
    FocusActions.saveFile(name,JSON.stringify(docOf(),null,2),"application/json")
      .then(ok=>{if(ok) toast("Saved "+name+". Use Open to carry on later.");},()=>toast("Couldn't save "+name+"."));
  },
  open:()=>projIn.click(),
  load:loadDoc,
  hasData:hasData,
  reset:()=>{P=blankProject(); viewStage=0; save(); render();},
  say:toast,
  ready:()=>true,
  a3:false,
  exports:[
    {type:"csv",label:"Export for Pulse (.csv)",hint:"The whole project as one row, to upload to Pulse",run:exportPulse},
    /* placeholder until the QI repository exists */
    {type:"repo",label:"Add project to QI repository",hint:"Coming soon",run:()=>toast("Adding projects to the QI repository is coming soon. For now, use Save to keep a project file.")}
  ]
});

/* ---------- arriving from the MiQi Projects menu ---------- */
render();
(function arrive(){
  let q; try{q=new URLSearchParams(location.search);}catch(e){return;}
  const clean=()=>history.replaceState(null,"",location.pathname+location.hash);
  if(q.has("open")){
    clean();
    let raw=null; try{raw=sessionStorage.getItem(OPEN_KEY); sessionStorage.removeItem(OPEN_KEY);}catch(e){}
    if(!raw) return;
    let name="your project"; try{const o=JSON.parse(raw); raw=o.text; name=o.name||name;}catch(e){return;}
    if(hasData()&&!confirm("Open "+name+"? The project open in this tab will be replaced. Choose Cancel, then Save, to keep it.")) return;
    openText(raw,name);
  } else if(q.has("new")){
    clean();
    /* With a project in the tab, the shared New button asks whether to save it first */
    const nb=document.querySelector('[data-fa="new"]');
    if(hasData()&&nb) nb.click();
    else toast("New project started");
  }
})();
})();
