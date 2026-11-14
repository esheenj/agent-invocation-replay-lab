import {replay} from './replay.mjs';
const el=id=>document.getElementById(id);
const fixture={
policy:{allowedTools:['search_knowledge','propose_payment'],allowedActors:['research_agent','finance_agent','human_reviewer'],approvalRequiredTools:['propose_payment'],maxCostUnits:10,maxEventAgeMs:60000,sessionEnd:'2026-01-01T15:00:00Z'},
events:[
{eventId:'ev-1',kind:'invoke',requestId:'req-1',actor:'research_agent',at:'2026-01-01T10:00:00Z',tool:'search_knowledge',costUnits:2},
{eventId:'ev-2',kind:'invoke',requestId:'req-1',actor:'research_agent',at:'2026-01-01T10:00:01Z',tool:'search_knowledge',costUnits:2},
{eventId:'ev-3',kind:'invoke',requestId:'req-2',actor:'finance_agent',at:'2026-01-01T10:00:02Z',tool:'propose_payment',costUnits:3},
{eventId:'ev-4',kind:'approve',requestId:'req-2',actor:'finance_agent',approvedBy:'human_reviewer',at:'2026-01-01T10:00:03Z',tool:'propose_payment'},
{eventId:'ev-5',kind:'invoke',requestId:'req-2',actor:'finance_agent',at:'2026-01-01T10:00:04Z',tool:'propose_payment',costUnits:3},
{eventId:'ev-6',kind:'invoke',requestId:'req-3',actor:'research_agent',at:'2026-01-01T10:00:05Z',tool:'unknown_tool',costUnits:1},
{eventId:'ev-7',kind:'invoke',requestId:'req-4',actor:'research_agent',at:'2026-01-01T10:00:06Z',tool:'search_knowledge',costUnits:9},
{eventId:'ev-8',kind:'revoke',requestId:'req-5',actor:'human_reviewer',at:'2026-01-01T10:00:07Z'},
{eventId:'ev-9',kind:'invoke',requestId:'req-5',actor:'research_agent',at:'2026-01-01T10:00:08Z',tool:'search_knowledge',costUnits:1}
]};
let current=null;
function reset(){el('scenario').value=JSON.stringify(fixture,null,2);el('result-message').textContent='Example restored. Run the replay to inspect decisions.';}
function render(){
 try{
  const input=el('scenario').value;
  if(input.length>1048576)throw Error('Scenario exceeds the 1 MiB limit');
  if(!input.trim())throw Error('Please provide a scenario');
  current=replay(input);
  const m=current.metrics;
  for(const [name,value] of Object.entries({events:m.events,admitted:m.admitted,rejected:m.rejected,cost:m.budgetUsed+' / '+m.budgetMax}))el(name).textContent=String(value);
  el('state').textContent='SIMULATION COMPLETE';el('state').className='pill success';
  el('result-message').textContent=current.limitations;
  const list=el('decisions');list.replaceChildren();
  if(!current.decisions.length){const li=document.createElement('li');li.textContent='No events in this scenario.';list.append(li);}
  for(const row of current.decisions){
   const li=document.createElement('li');
   const id=document.createElement('div'),code=document.createElement('code'),meta=document.createElement('small');
   code.textContent=String(row.sequence).padStart(2,'0')+' / '+row.requestId;
   meta.textContent=row.actor+' · '+(row.tool||row.kind);
   id.append(code,meta);
   const right=document.createElement('div'),title=document.createElement('strong'),reason=document.createElement('p');
   title.textContent=row.decision;
   title.className=row.decision==='ADMITTED_SIMULATION'?'':row.decision.startsWith('HELD')?'held':'rejected';
   reason.textContent=row.why;right.append(title,reason);li.append(id,right);list.append(li);
  }
  el('export').disabled=false;
 }catch(err){
  current=null;el('export').disabled=true;el('state').textContent='INPUT REJECTED';el('state').className='pill error';
  el('result-message').textContent=err.message;el('decisions').replaceChildren();
  for(const x of ['events','admitted','rejected','cost'])el(x).textContent='—';
 }
}
function exportReport(){
 if(!current)return;
 const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='agent-invocation-replay-report.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
el('run').addEventListener('click',render);
el('reset').addEventListener('click',reset);
el('export').addEventListener('click',exportReport);
reset();
