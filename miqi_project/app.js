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
  yesno:["Yes","No"],
  realised:["Yes","Partially","No","Too early to tell"],
  beneficiaries:["Patients","Staff","Mixed"],
  reach:["Less than 100","100 - 999","1000 - 9999","10000 +"],
  pdsaOutcome:["Adopted","Adapted","Abandoned"],
  benefitType:["Benefit","Dis-benefit"],
  benefitStatus:["Realised","Partly realised","Not realised","Too early to tell"]
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
   {k:"baseline",t:"textarea",l:"What are your baseline measures?"},
   {k:"benefits",t:"benefits",l:"Benefits register",hide:["achieved","status"],
    hint:"Set out the benefits the project should deliver, with a measure, baseline and target for each, and any dis-benefit to watch for. This is the same register as on the Close stage, where you record what was achieved: change it on either and it changes on both."}
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
   {k:"solutions",t:"yesno",l:"Do you have a list of solutions to test?"},
   {k:"milestones",t:"milestones",l:"Key milestones",hint:"The dates the project has to hit, such as the first PDSA cycle starting or a report to the board. Add each one to your Outlook calendar as a reminder."}
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
   {k:"repo",t:"repo",l:"Submit your A3 to the QI repository and become eligible for a prize",hint:"Share your project and its A3 report so others across the Trust can learn from it."},
   {k:"scalable",t:"radio3",l:"Is this idea scalable?",o:"scalable"},
   {k:"pulse",t:"pulse",l:"Project promoted to Pulse"},
   {k:"benefits",t:"benefits",l:"Benefits register",hint:"Record what each benefit achieved and whether it was realised. This is the same register you started on the Observe stage: change it on either and it changes on both. Add as many or as few benefits as you need."}
  ]}
];
const LAST=STAGES.length-1;

/* Benefits register columns, following the CITI benefits register (template K) */
const BENEFIT=[
  {k:"title",l:"Benefit",w:"wide",ph:"For example: more patients discharged before midday"},
  {k:"type",l:"Benefit or dis-benefit",t:"seg",o:"benefitType"},
  {k:"beneficiary",l:"Who benefits",ph:"For example: patients on Florence Ward"},
  {k:"measure",l:"Measure",ph:"For example: % of discharges before 12:00"},
  {k:"baseline",l:"Baseline",ph:"For example: 16%"},
  {k:"target",l:"Target",ph:"For example: 33%"},
  {k:"achieved",l:"Achieved at close",ph:"For example: 29%"},
  {k:"status",l:"Status",t:"select",o:"benefitStatus"},
  {k:"source",l:"Data source and frequency",ph:"For example: EPR discharge times, weekly"},
  {k:"owner",l:"Benefit owner",ph:"Who looks after it now"},
  {k:"cash",l:"Cash releasing?",t:"seg",o:"yesno"},
  {k:"value",l:"£ value per year",ph:"For example: 25,000"}
];

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
function blankProject(){return {id:uid(),stage:0,closed:false,created:today(),history:[{stage:0,date:today()}],data:{sites:[],updates:[],pdsa:[],milestones:[],benefits:[]},docs:{}};}

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
    else if(k==="benefits"&&Array.isArray(v)) d[k]=v.filter(x=>x&&typeof x==="object").map(x=>{const o={id:typeof x.id==="string"?x.id.slice(0,40):uid()}; BENEFIT.forEach(c=>{if(typeof x[c.k]==="string") o[c.k]=x[c.k];}); return o;});
    else if(k==="milestones"&&Array.isArray(v)) d[k]=v.filter(m=>m&&typeof m.title==="string"&&isDate(m.date)).map(m=>({id:typeof m.id==="string"?m.id.slice(0,40):uid(),title:m.title,date:m.date,owner:typeof m.owner==="string"?m.owner:"",seq:Number.isInteger(m.seq)&&m.seq>=0?m.seq:0,changed:!!m.changed}));
  });
  out.data=Object.assign({sites:[],updates:[],pdsa:[],milestones:[],benefits:[]},d);
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
function toast(m,ms){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),ms||2600);}
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
        '<div class="pdsa-add"><div><label for="pdsaChange" class="hint" style="margin:0 0 .3rem">What did this cycle change?</label><input type="text" id="pdsaChange" data-k="draftPdsa" value="'+esc(d.draftPdsa)+'" placeholder="For example: added a pharmacy prompt at the 10am huddle"></div>'+
        '<div><span class="hint" style="margin:0 0 .3rem" id="pdsaOutLbl">Outcome</span><div role="radiogroup" aria-labelledby="pdsaOutLbl">'+
        '<div class="seg">'+OPTS.pdsaOutcome.map((o,i)=>'<label><input type="radio" name="pdsaOut" data-k="draftPdsaOut" value="'+o+'"'+((d.draftPdsaOut?d.draftPdsaOut===o:i===0)?" checked":"")+'><span>'+o.replace("ed","")+'</span></label>').join("")+'</div></div></div></div>'+
        '<div style="margin-top:.6rem"><button type="button" class="btn" data-act="addPdsa">Add PDSA cycle</button></div>'+
        (cyc.length?'<ol class="pdsa">'+cyc.map((c,i)=>'<li><span>'+esc(c.change)+'</span><span class="out '+c.outcome+'">'+c.outcome+'</span><button type="button" class="xbtn" data-act="rmPdsa" data-i="'+i+'" aria-label="Delete cycle '+(i+1)+'" title="Delete cycle">'+X_SVG+'</button></li>').join("")+'</ol>':'<p class="empty">No PDSA cycles listed yet.</p>')+'</fieldset>';}
    case "benefits":{
      const list=v||[];
      const cell=(b,i,c)=>{
        const cid="bf_"+b.id+"_"+c.k, val=b[c.k]||"";
        if(c.t==="seg") return '<fieldset class="bf-'+c.k+'"><legend class="hint" style="margin:0 0 .3rem">'+c.l+'</legend><div class="seg">'+OPTS[c.o].map(o=>'<label><input type="radio" name="'+cid+'" data-bid="'+esc(b.id)+'" data-bk="'+c.k+'" value="'+esc(o)+'"'+(val===o?" checked":"")+'><span>'+esc(o)+'</span></label>').join("")+'</div></fieldset>';
        const lab='<label for="'+cid+'" class="hint" style="margin:0 0 .3rem">'+c.l+'</label>';
        if(c.t==="select") return '<div>'+lab+'<select id="'+cid+'" data-bid="'+esc(b.id)+'" data-bk="'+c.k+'"><option value="">Select</option>'+OPTS[c.o].map(o=>'<option'+(o===val?" selected":"")+'>'+esc(o)+'</option>').join("")+'</select></div>';
        return '<div'+(c.w?' class="bf-'+c.w+'"':'')+'>'+lab+'<input type="text" id="'+cid+'" data-bid="'+esc(b.id)+'" data-bk="'+c.k+'" value="'+esc(val)+'" placeholder="'+esc(c.ph||"")+'"></div>';
      };
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend>'+hint+
        (list.length?'<ol class="bf">'+list.map((b,i)=>'<li><div class="bf-head"><h3>'+(b.type==="Dis-benefit"?"Dis-benefit ":"Benefit ")+(i+1)+'</h3>'+
          '<button type="button" class="btn small ghost danger" data-act="rmBenefit" data-id="'+esc(b.id)+'" aria-label="Remove '+(b.title?esc(b.title):"benefit "+(i+1))+'">Remove</button></div>'+
          '<div class="bf-grid">'+BENEFIT.filter(c=>!(f.hide||[]).includes(c.k)).map(c=>cell(b,i,c)).join("")+'</div></li>').join("")+'</ol>'
          :'<p class="empty">No benefits added yet.</p>')+
        '<div class="bf-actions"><button type="button" class="btn" data-act="addBenefit">Add benefit</button>'+
        (list.length?'<button type="button" class="btn" data-act="benefitsXlsx">Download register (.xlsx)</button>':'')+'</div></fieldset>';}
    case "repo":{
      const a3=TOOLS.a3_report?'<a href="'+esc(toolUrl("a3_report"))+'" target="_blank" rel="noopener">A3 report tool<span class="sr"> (opens in a new tab)</span></a>':"A3 report tool";
      return '<fieldset class="field repo"><legend class="lbl">'+lab+'</legend>'+hint+
        '<p class="hint" style="margin:0 0 .6rem">No A3 yet? Make one with the '+a3+'.</p>'+
        '<button type="button" class="btn primary" data-act="addToRepo">Submit to the QI repository</button></fieldset>';}
    case "milestones":{
      const list=sortedMilestones();
      return '<fieldset class="field"><legend class="lbl">'+lab+'</legend>'+hint+
        '<div class="ms-add">'+
          '<div><label for="msTitle" class="hint" style="margin:0 0 .3rem">Milestone</label><input type="text" id="msTitle" data-k="draftMsTitle" value="'+esc(d.draftMsTitle)+'" placeholder="For example: first PDSA cycle starts"></div>'+
          '<div><label for="msDate" class="hint" style="margin:0 0 .3rem">Date</label><input type="date" id="msDate" data-k="draftMsDate" value="'+esc(d.draftMsDate)+'"></div>'+
          '<div><label for="msOwner" class="hint" style="margin:0 0 .3rem">Owner (optional)</label><input type="text" id="msOwner" data-k="draftMsOwner" value="'+esc(d.draftMsOwner)+'" placeholder="Who makes sure it happens"></div>'+
        '</div>'+
        '<div style="margin-top:.6rem"><button type="button" class="btn" data-act="addMilestone">Add milestone</button></div>'+
        (list.length?'<ol class="ms">'+list.map(m=>{const past=m.date<today();
          return '<li class="'+(past?"past":"")+(m.changed?" changed":"")+'"><input type="date" class="ms-date" data-mid="'+esc(m.id)+'" value="'+m.date+'" aria-label="Date of '+esc(m.title)+'" title="Change the date">'+
            '<span class="ms-what"><b>'+esc(m.title)+'</b>'+(m.owner?'<span class="hint" style="margin:0">'+esc(m.owner)+'</span>':'')+
            (m.changed?'<span class="ms-note">Date changed. Update your calendar to move the entry.</span>':'')+'</span>'+
            '<button type="button" class="btn small'+(m.changed?' primary':'')+'" data-act="icsOne" data-id="'+esc(m.id)+'" aria-label="'+(m.changed?"Update "+esc(m.title)+" in":"Add "+esc(m.title)+" to")+' your calendar (.ics)">'+(m.changed?"Update calendar":"Add to calendar")+'</button>'+
            '<button type="button" class="xbtn" data-act="rmMilestone" data-id="'+esc(m.id)+'" aria-label="Delete milestone '+esc(m.title)+'" title="Delete milestone">'+X_SVG+'</button></li>';}).join("")+'</ol>'+
          '<div style="margin-top:.75rem"><button type="button" class="btn primary" data-act="icsAll">'+(list.some(m=>m.changed)?"Add or update all ":"Add all ")+list.length+' in calendar (.ics)</button></div>'+
          '<p class="hint" style="margin:.5rem 0 0">Calendar files download to your Downloads folder. Open one and it appears in Outlook as an all-day entry with a reminder a week before: choose Save &amp; Close to keep it. Add all puts every milestone in one file.</p>'
        :'<p class="empty">No milestones yet.</p>')+'</fieldset>';}
    case "log":{
      const list=(v||[]).map((u,i)=>Object.assign({i:i},u)).reverse();
      return '<div class="field"><label for="'+id+'">'+lab+'</label><span class="hint">Add a dated note each time you test a change or reach a milestone.</span>'+
        '<textarea id="'+id+'" data-k="draftUpdate" placeholder="What did you test, what happened, what will you do next?">'+esc(d.draftUpdate)+'</textarea>'+
        '<div style="margin-top:.6rem"><button type="button" class="btn" data-act="addUpdate">Add update</button></div>'+
        (list.length?'<ul class="log">'+list.map(u=>'<li><div><time>'+fmt(u.date)+'</time>'+esc(u.text)+'</div><button type="button" class="xbtn" data-act="rmUpdate" data-i="'+u.i+'" aria-label="Delete update from '+fmt(u.date)+'" title="Delete update">'+X_SVG+'</button></li>').join("")+'</ul>':'<p class="empty">No updates yet. Your first update will appear here.</p>')+'</div>';}
  }
  return "";
}

/* ---------- render ---------- */
/* the project's name on its button in the header (focus-header.js) */
function syncHeader(){
  if(window.FocusHeader) window.FocusHeader.setProject(P.data.title,hasData());
  /* the browser tab shows the project's name, so it's easy to find again */
  const t=(P.data.title||"").trim();
  document.title=t?t+" \u2013 MiQi project":"MiQi improvement project";
  announce();
}
/* Tell other tabs of this site that this project is open (focus-header.js
   shows its name there), and that it's gone when this tab closes */
const tabId=uid()+uid();
const miqiCh=typeof BroadcastChannel==="function"?new BroadcastChannel("focus-miqi"):null;
function announce(){if(miqiCh) miqiCh.postMessage(hasData()?{type:"here",id:tabId,title:(P.data.title||"").trim()}:{type:"gone",id:tabId});}
if(miqiCh){
  miqiCh.onmessage=e=>{if(e.data&&e.data.type==="ping") announce();};
  window.addEventListener("pagehide",()=>miqiCh.postMessage({type:"gone",id:tabId}));
  window.addEventListener("pageshow",e=>{if(e.persisted) announce();});
}
window.addEventListener("load",syncHeader);
function renderHead(){
  const d=P.data;
  syncHeader();
  $("#projTitle").textContent=d.title||"Untitled project";
  /* each part labelled, so the team doesn't read as the lead's own team */
  $("#projMeta").textContent=[d.leadName&&("Lead: "+d.leadName),d.group&&("Team: "+d.group),"Started "+fmt(P.created)].filter(Boolean).join(" · ");
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

/* The card starts closed, and stays open or closed as the stages change */
let guideOpen=false;
$("#aside").addEventListener("toggle",e=>{if(e.target.classList.contains("guide")) guideOpen=e.target.open;},true);
function guideCard(s){
  const docs=guideDocs(s.id); if(!docs.length) return "";
  const kind=d=>KIND[d.kind]||"";
  const kinds=[...new Set(docs.map(kind).filter(Boolean))];
  return '<details class="card guide"'+(guideOpen?" open":"")+'><summary><h3>Programme documents <span class="count">('+docs.length+')</span></h3></summary><ul class="guidedocs">'+docs.map(d=>
    '<li><span class="dname">'+(d.code?'<span class="code">'+esc(d.code)+'</span>':"")+esc(d.name)+'</span>'+
    '<span class="why">'+esc(d.purpose)+'</span><span class="dl">'+
    (d.template?'<a href="'+esc(GUIDE_BASE+"templates/"+d.template)+'" download>Blank template<span class="sr"> for '+esc(d.name)+', '+kind(d)+'</span></a>':"")+
    (d.example?'<a href="'+esc(GUIDE_BASE+"examples/"+d.example)+'" download>Worked example<span class="sr"> of '+esc(d.name)+', '+kind(d)+'</span></a>':"")+
    '</span></li>').join("")+'</ul>'+
    '<p class="hint" style="margin:.7rem 0 0">'+(kinds.length?"Files download as "+(kinds.length>1?kinds.slice(0,-1).join(", ")+" and "+kinds[kinds.length-1]:kinds[0])+". ":"")+
    'See how they fit together in the <a href="'+esc(GUIDE_BASE)+'" target="_blank" rel="noopener">programme guide<span class="sr"> (opens in a new tab)</span></a>.</p></details>';
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
  const el=e.target;
  if(el.dataset.mid){
    /* a milestone's new date: flag it so its calendar entry gets updated */
    if(e.type!=="change") return;
    const m=(P.data.milestones||[]).find(x=>x.id===el.dataset.mid); if(!m) return;
    if(!isDate(el.value)){el.value=m.date; return toast("Choose a date for the milestone");}
    if(el.value===m.date) return;
    m.date=el.value; m.seq=(m.seq||0)+1; m.changed=true;
    save(); render();
    const again=panel.querySelector('.ms-date[data-mid="'+m.id+'"]'); if(again) again.focus();
    return toast("Date changed. Use Update calendar to move it in Outlook.");
  }
  if(el.dataset.bk){
    const b=(P.data.benefits||[]).find(x=>x.id===el.dataset.bid); if(!b) return;
    b[el.dataset.bk]=el.value;
    /* the card's heading says whether it's a benefit or a dis-benefit */
    if(el.dataset.bk==="type"){const h=el.closest("li").querySelector("h3"); h.textContent=h.textContent.replace(/^(Dis-benefit|Benefit)/,el.value);}
    saveSoon(); syncHeader(); return;
  }
  const k=el.dataset.k; if(!k) return;
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
      (d.updates=d.updates||[]).push({date:today(),text:txt}); delete d.draftUpdate; save(); render(); toast("Update added"); break;}
    case "addPdsa":{
      const inp=$("#pdsaChange"), txt=inp.value.trim();
      if(!txt){inp.focus(); toast("Describe what the cycle changed first"); return;}
      (d.pdsa=d.pdsa||[]).push({change:txt,outcome:panel.querySelector('input[name="pdsaOut"]:checked').value});
      if(!d.pdsaCount||+d.pdsaCount<d.pdsa.length) d.pdsaCount=String(d.pdsa.length);
      delete d.draftPdsa; delete d.draftPdsaOut; save(); render(); toast("PDSA cycle added"); break;}
    case "rmUpdate": d.updates.splice(+b.dataset.i,1); save(); render(); toast("Update deleted"); break;
    case "rmPdsa": d.pdsa.splice(+b.dataset.i,1); save(); render(); toast("PDSA cycle deleted"); break;
    case "addMilestone":{
      const t=$("#msTitle"), dt=$("#msDate"), title=t.value.trim();
      if(!title){t.focus(); toast("Name the milestone first"); return;}
      if(!isDate(dt.value)){dt.focus(); toast("Choose the milestone's date"); return;}
      (d.milestones=d.milestones||[]).push({id:uid(),title:title,date:dt.value,owner:$("#msOwner").value.trim()});
      delete d.draftMsTitle; delete d.draftMsDate; delete d.draftMsOwner;
      save(); render(); $("#msTitle").focus(); toast("Milestone added"); break;}
    case "addBenefit":{
      const nb={id:uid(),type:"Benefit"}; (d.benefits=d.benefits||[]).push(nb);
      save(); render(); const f=$("#bf_"+nb.id+"_title"); if(f){f.focus(); f.scrollIntoView({block:"center"});} break;}
    case "rmBenefit":{
      const i=(d.benefits||[]).findIndex(x=>x.id===b.dataset.id); if(i<0) return;
      const x=d.benefits[i], used=BENEFIT.some(c=>c.k!=="type"&&(x[c.k]||"").trim());
      if(used&&!confirm("Remove "+(x.title?"“"+x.title+"”":"this benefit")+" from the register?")) return;
      d.benefits.splice(i,1); save(); render(); toast("Benefit removed"); break;}
    case "benefitsXlsx": benefitsXlsx(); break;
    case "addToRepo": addToRepo(); break;
    case "rmMilestone":
      /* the site can't reach the calendar, so an entry already added there stays */
      d.milestones=(d.milestones||[]).filter(m=>m.id!==b.dataset.id); save(); render();
      toast("Milestone deleted from this project. If you added it to your calendar, it's still there: delete it in Outlook too.",8000); break;
    case "icsOne":{const m=(d.milestones||[]).find(x=>x.id===b.dataset.id); if(m) downloadIcs([m],fileBase()+"-"+slugOf(m.title)+".ics"); break;}
    case "icsAll": downloadIcs(sortedMilestones(),fileBase()+"-milestones.ics"); break;
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

/* ---------- QI repository (placeholder until it exists) ----------
   Export > Add project to QI repository and the Close stage's Submit
   button both come here. */
function addToRepo(){toast("Adding projects to the QI repository is coming soon. For now, use Save to keep a project file.");}

/* ---------- benefits register as a spreadsheet ---------- */
function benefitsXlsx(){
  const list=P.data.benefits||[]; if(!list.length) return toast("Add a benefit first");
  const head=BENEFIT.map(c=>({v:c.l,s:"head"}));
  const sheet={name:"Benefits register",freeze:3,cols:BENEFIT.map(c=>c.w?40:c.k==="source"?30:18),
    rows:[[{v:"Benefits register: "+(P.data.title||"Untitled project"),s:"title"}],[],head].concat(list.map(b=>BENEFIT.map(c=>({v:b[c.k]||"",s:"wrap"}))))};
  const name=fileBase()+"-benefits-register.xlsx";
  FocusActions.saveFile(name,FocusActions.xlsx([sheet])).then(ok=>{if(ok) toast("Saved "+FocusActions.lastSaved());},()=>toast("Couldn't save "+name+"."));
}

/* ---------- milestones as calendar files (.ics) ----------
   Each milestone is an all-day entry, shown as free time, with a reminder a
   week before. Outlook, Teams, Google and Apple calendars all open them. The
   UID stays the same for a milestone, so adding it again updates the entry
   rather than adding a second one. */
const sortedMilestones=()=>(P.data.milestones||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
const slugOf=t=>String(t||"").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-").slice(0,40)||"milestone";
function icsText(t){return String(t||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");}
/* Lines over 75 bytes are folded onto continuation lines starting with a space */
function icsFold(line){
  const enc=new TextEncoder(); let out="", cur="", n=0;
  for(const ch of line){const b=enc.encode(ch).length; if(n+b>(out?74:75)){out+=(out?"\r\n ":"")+cur; cur=""; n=0;} cur+=ch; n+=b;}
  return out+(out?"\r\n ":"")+cur;
}
function ics(list){
  const ymd=s=>s.replace(/-/g,"");
  const next=s=>{const d=new Date(s+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10).replace(/-/g,"");};
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z");
  const title=P.data.title||"Untitled project";
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GSTT FOCUS//MiQi project//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  list.forEach(m=>{
    const desc=["Milestone for the improvement project "+title+".",m.owner?"Owner: "+m.owner+".":"",P.data.leadName?"Project lead: "+P.data.leadName+".":"","From the MiQi improvement project tool."].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT","UID:"+P.id+"-"+m.id+"@miqi-project","SEQUENCE:"+(m.seq||0),"DTSTAMP:"+stamp,"LAST-MODIFIED:"+stamp,
      "DTSTART;VALUE=DATE:"+ymd(m.date),"DTEND;VALUE=DATE:"+next(m.date),
      "SUMMARY:"+icsText("Milestone: "+m.title+" ("+title+")"),"DESCRIPTION:"+icsText(desc),"CATEGORIES:MiQi project",
      "TRANSP:TRANSPARENT","X-MICROSOFT-CDO-BUSYSTATUS:FREE","X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsText("Milestone in a week: "+m.title),"TRIGGER:-P7D","END:VALARM","END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n")+"\r\n";
}
/* Straight to the Downloads folder, without a Save as window */
function downloadIcs(list,name){
  if(!list.length) return toast("Add a milestone first");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([ics(list)],{type:"text/calendar;charset=utf-8"}));
  a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  if(list.some(m=>m.changed)){list.forEach(m=>{m.changed=false;}); save(); render();}
  toast(list.length>1?"Downloaded "+list.length+" milestones in "+name+". Open it to add them to Outlook.":"Downloaded "+name+". Open it to add it to Outlook.");
}

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
    ["Benefits register",(d.benefits||[]).filter(b=>BENEFIT.some(c=>c.k!=="type"&&(b[c.k]||"").trim())).map(b=>[b.type||"Benefit",b.title,b.measure&&"measure "+b.measure,b.baseline&&"baseline "+b.baseline,b.target&&"target "+b.target,b.achieved&&"achieved "+b.achieved,b.status,b.owner&&"owner "+b.owner,b.cash==="Yes"&&("cash releasing"+(b.value?" £"+b.value:""))].filter(Boolean).join(", "))],
    ["Key milestones",sortedMilestones().map(m=>m.date+": "+m.title+(m.owner?" ("+m.owner+")":""))],
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
  FocusActions.opened();
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
      .then(ok=>{if(ok) toast("Saved "+FocusActions.lastSaved()+(FocusActions.linkedFile()?". Save updates this file from now on.":". Use Open to carry on later."));},()=>toast("Couldn't save "+name+"."));
  },
  open:projIn,
  recent:()=>({title:(P.data.title||"").trim()||"Untitled project",id:P.id}),
  load:loadDoc,
  hasData:hasData,
  reset:()=>{P=blankProject(); viewStage=0; save(); render();},
  say:toast,
  ready:()=>true,
  a3:false,
  exports:[
    {type:"csv",label:"Export for Pulse (.csv)",hint:"The whole project as one row, to upload to Pulse",run:exportPulse},
    /* placeholder until the QI repository exists */
    {type:"repo",label:"Add project to QI repository",hint:"Coming soon",run:()=>addToRepo()}
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
