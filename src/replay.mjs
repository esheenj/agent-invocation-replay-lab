// Deterministic, offline rehearsal of agent invocation policy. No tool execution.
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const safeId=(v,label)=>{if(typeof v!=='string'||!ID.test(v))throw Error(label+' must be a 1–128 character identifier');return v;};
const safeNumber=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(label+' must be a non-negative safe integer');return v;};
const allowedKinds=new Set(['approve','invoke','revoke']);
export function parseScenario(value){
  const v=typeof value==='string'?JSON.parse(value):value;
  if(!isObj(v)||!isObj(v.policy)||!Array.isArray(v.events))throw Error('Expected {policy, events[]}');
  if(v.events.length>300)throw Error('Too many events (maximum 300)');
  const p=v.policy;
  if(!Array.isArray(p.allowedTools)||!Array.isArray(p.allowedActors)||!Array.isArray(p.approvalRequiredTools))
    throw Error('Policy requires allowedTools, allowedActors, approvalRequiredTools arrays');
  const strings=(arr,label)=>{if(arr.length>100)throw Error(label+' exceeds 100 entries');const out=arr.map(x=>safeId(x,label));if(new Set(out).size!==out.length)throw Error(label+' contains duplicates');return out;};
  const allowedTools=strings(p.allowedTools,'allowedTools');
  const allowedActors=strings(p.allowedActors,'allowedActors');
  const approvalRequiredTools=strings(p.approvalRequiredTools,'approvalRequiredTools');
  if(approvalRequiredTools.some(t=>!allowedTools.includes(t)))throw Error('approvalRequiredTools must be allowed');
  const maxCostUnits=safeNumber(p.maxCostUnits,'maxCostUnits');
  const maxEventAgeMs=safeNumber(p.maxEventAgeMs,'maxEventAgeMs');
  const sessionEnd=Date.parse(p.sessionEnd);
  if(typeof p.sessionEnd!=='string'||!Number.isFinite(sessionEnd))throw Error('sessionEnd must be ISO date-time');
  const events=v.events.map((e,index)=>{
    if(!isObj(e))throw Error('Event '+(index+1)+' must be an object');
    const kind=safeId(e.kind,'kind');if(!allowedKinds.has(kind))throw Error('Unsupported event kind: '+kind);
    safeId(e.eventId,'eventId');safeId(e.requestId,'requestId');safeId(e.actor,'actor');
    const at=Date.parse(e.at);
    if(typeof e.at!=='string'||!Number.isFinite(at))throw Error('Invalid event time at index '+index);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(e.at))
      throw Error('Event times must have an explicit timezone');
    let tool=null,costUnits=0,approvedBy=null;
    if(kind==='invoke'||kind==='approve'){
      tool=safeId(e.tool,'tool');
    }
    if(kind==='invoke')costUnits=safeNumber(e.costUnits,'costUnits');
    if(kind==='approve'){
      approvedBy=safeId(e.approvedBy,'approvedBy');
      if(approvedBy===e.actor)throw Error('An actor may not self-approve their own request');
    }
    return {eventId:e.eventId,requestId:e.requestId,actor:e.actor,kind,at:at,atIso:new Date(at).toISOString(),tool,costUnits,approvedBy};
  });
  return {policy:{allowedTools,allowedActors,approvalRequiredTools,maxCostUnits,maxEventAgeMs,sessionEnd},events};
}
export function replay(input){
  const {policy,events}=parseScenario(input);
  const allowTool=new Set(policy.allowedTools),allowActor=new Set(policy.allowedActors),approvalTool=new Set(policy.approvalRequiredTools);
  const eventIds=new Set(),invocationIds=new Set(),approvals=new Map(),revoked=new Set();
  let totalCost=0,previousAt=-Infinity;
  const rows=[];
  const add=(event,decision,why)=>rows.push({
    sequence:rows.length+1,eventId:event.eventId,kind:event.kind,requestId:event.requestId,
    actor:event.actor,tool:event.tool,time:event.atIso,decision,why,spentCostUnits:totalCost
  });
  for(const event of events){
    if(eventIds.has(event.eventId)){add(event,'REPLAY_REJECTED','Repeated event ID; first occurrence retained.');continue;}
    eventIds.add(event.eventId);
    if(event.at<previousAt){add(event,'OUT_OF_ORDER','Event timestamp precedes a previously supplied event; no state change.');continue;}
    previousAt=event.at;
    if(event.at>policy.sessionEnd){add(event,'EXPIRED_SESSION','Event occurs after the configured session end.');continue;}
    if(!allowActor.has(event.actor)){add(event,'ACTOR_DENIED','Actor is not in the simulated allowlist.');continue;}
    if(event.kind==='revoke'){
      revoked.add(event.requestId);approvals.delete(event.requestId);
      add(event,'REVOKED','Request ID marked revoked for the remainder of the replay.');continue;
    }
    if(revoked.has(event.requestId)){add(event,'REVOKED_REQUEST','Request was previously revoked.');continue;}
    if(!allowTool.has(event.tool)){add(event,'TOOL_DENIED','Tool absent from the simulated capability allowlist.');continue;}
    if(event.kind==='approve'){
      if(!allowActor.has(event.approvedBy)){add(event,'APPROVAL_DENIED','Approved-by identity absent from simulated actor allowlist.');continue;}
      approvals.set(event.requestId,{tool:event.tool,actor:event.actor,approvedBy:event.approvedBy,at:event.at});
      add(event,'APPROVAL_RECORDED','Fictional prior approval stored for this request ID, actor and tool.');continue;
    }
    if(invocationIds.has(event.requestId)){add(event,'DUPLICATE_BLOCKED','Request ID was previously admitted; no additional cost allocated.');continue;}
    if(approvalTool.has(event.tool)){
      const proof=approvals.get(event.requestId);
      if(!proof||proof.actor!==event.actor||proof.tool!==event.tool){
        add(event,'HELD_APPROVAL','No matching prior simulated approval for request ID, actor and tool.');continue;
      }
      if(event.at-proof.at>policy.maxEventAgeMs){
        add(event,'STALE_APPROVAL','Matching approval is older than the accepted window.');continue;
      }
      if(event.at<proof.at){add(event,'STALE_APPROVAL','Approval must precede invocation.');continue;}
    }
    if(event.costUnits>policy.maxCostUnits-totalCost){
      add(event,'HELD_BUDGET','Admitting request would exceed session cost-unit cap.');continue;
    }
    invocationIds.add(event.requestId);
    totalCost+=event.costUnits;
    add(event,'ADMITTED_SIMULATION','Request hypothetically admitted; no tool executed or cost incurred.');
  }
  const metrics={events:rows.length,admitted:rows.filter(r=>r.decision==='ADMITTED_SIMULATION').length,
    rejected:rows.filter(r=>!['ADMITTED_SIMULATION','APPROVAL_RECORDED','REVOKED'].includes(r.decision)).length,
    budgetUsed:totalCost,budgetMax:policy.maxCostUnits};
  return {status:'SIMULATED_NO_EXECUTION',metrics,decisions:rows,limitations:'Fictional policy/identity and input timestamp assertions. No real approvals, signatures, worker execution, persistence, cost metering or external authentication.'};
}
