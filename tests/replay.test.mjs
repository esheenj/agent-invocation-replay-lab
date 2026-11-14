import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScenario,replay} from '../src/replay.mjs';
const policy=()=>({allowedTools:['read','pay'],allowedActors:['bot','reviewer','intruder'],approvalRequiredTools:['pay'],maxCostUnits:5,maxEventAgeMs:5000,sessionEnd:'2026-01-01T10:30:00Z'});
const at=(second=0)=>'2026-01-01T10:00:'+String(second).padStart(2,'0')+'Z';
const e=(eventId,requestId,kind='invoke',tool='read',costUnits=1,second=0,actor='bot')=>({eventId,requestId,kind,tool,costUnits,at:at(second),actor});
const run=(events,p=policy())=>replay({policy:p,events});
test('empty ledger has no false execution',()=>{const r=run([]);assert.equal(r.status,'SIMULATED_NO_EXECUTION');assert.equal(r.metrics.events,0);});
test('ordinary invocation is hypothetically admitted',()=>assert.equal(run([e('e1','r1')]).decisions[0].decision,'ADMITTED_SIMULATION'));
test('duplicate request does not double spend',()=>{const r=run([e('e1','r1'),e('e2','r1','invoke','read',3,1)]);assert.equal(r.metrics.budgetUsed,1);assert.equal(r.decisions[1].decision,'DUPLICATE_BLOCKED');});
test('same event ID never repeats effects',()=>{const r=run([e('e1','r1'),e('e1','r2','invoke','read',1,1)]);assert.equal(r.decisions[1].decision,'REPLAY_REJECTED');assert.equal(r.metrics.admitted,1);});
test('unknown tool denied',()=>assert.equal(run([e('e1','r1','invoke','other')]).decisions[0].decision,'TOOL_DENIED'));
test('unknown actor denied',()=>assert.equal(run([e('e1','r1','invoke','read',1,0,'unlisted')]).decisions[0].decision,'ACTOR_DENIED'));
test('approval-required tool is held without approval',()=>assert.equal(run([e('e1','r1','invoke','pay')]).decisions[0].decision,'HELD_APPROVAL'));
test('separate prior approval admits request',()=>{
 const approval={...e('e1','r1','approve','pay',0),approvedBy:'reviewer'};
 const r=run([approval,e('e2','r1','invoke','pay',2,1)]);
 assert.deepEqual(r.decisions.map(x=>x.decision),['APPROVAL_RECORDED','ADMITTED_SIMULATION']);
});
test('self approval is invalid input',()=>assert.throws(()=>run([{...e('e1','r1','approve','pay',0),approvedBy:'bot'}]),/self-approve/));
test('mismatched approval actor cannot authorize',()=>{
 const a={...e('e1','r1','approve','pay',0),approvedBy:'reviewer'};
 const b=e('e2','r1','invoke','pay',2,1,'intruder');
 assert.equal(run([a,b]).decisions[1].decision,'HELD_APPROVAL');
});
test('mismatched approval tool cannot authorize',()=>{
 const a={...e('e1','r1','approve','read',0),approvedBy:'reviewer'};
 assert.equal(run([a,e('e2','r1','invoke','pay',2,1)]).decisions[1].decision,'HELD_APPROVAL');
});
test('stale approval held',()=>{
 const a={...e('e1','r1','approve','pay',0),approvedBy:'reviewer'};
 assert.equal(run([a,e('e2','r1','invoke','pay',2,8)]).decisions[1].decision,'STALE_APPROVAL');
});
test('approval from actor outside allowlist denied',()=>{
 const a={...e('e1','r1','approve','pay',0),approvedBy:'unknown'};
 assert.equal(run([a,e('e2','r1','invoke','pay',2,1)]).decisions[0].decision,'APPROVAL_DENIED');
});
test('revoke blocks later request',()=>{
 const rev=e('e1','r1','revoke',undefined,undefined,0,'reviewer');
 const r=run([rev,e('e2','r1','invoke','read',1,1)]);
 assert.equal(r.decisions[1].decision,'REVOKED_REQUEST');
});
test('budget cap holds requests and keeps admitted total unchanged',()=>{
 const r=run([e('e1','r1','invoke','read',5),e('e2','r2','invoke','read',1,1)]);
 assert.equal(r.decisions[1].decision,'HELD_BUDGET');assert.equal(r.metrics.budgetUsed,5);
});
test('out of order does not mutate approvals or budget',()=>{
 const r=run([e('e1','r1','invoke','read',2,2),e('e2','r2','invoke','read',3,1)]);
 assert.equal(r.decisions[1].decision,'OUT_OF_ORDER');assert.equal(r.metrics.budgetUsed,2);
});
test('expired session held',()=>{
 const r=run([e('e1','r1','invoke','read',2,0)],{...policy(),sessionEnd:'2026-01-01T09:00:00Z'});
 assert.equal(r.decisions[0].decision,'EXPIRED_SESSION');
});
test('invalid cost and negative budgets rejected',()=>{
 assert.throws(()=>run([e('e1','r1','invoke','read',-1)]),/non-negative/);
 assert.throws(()=>run([],{...policy(),maxCostUnits:-2}),/non-negative/);
});
test('bad event kinds rejected',()=>assert.throws(()=>run([e('e1','r1','execute')]),/Unsupported/));
test('invalid date without explicit timezone rejected',()=>assert.throws(()=>run([{...e('e1','r1'),at:'2026-01-01T10:00:00'}]),/explicit timezone/));
test('unapproved required tool rejected in policy',()=>assert.throws(()=>run([],{...policy(),approvalRequiredTools:['outside']}),/must be allowed/));
test('repeated policy list entries rejected',()=>assert.throws(()=>run([],{...policy(),allowedTools:['read','read']}),/duplicates/));
test('malformed input rejected',()=>assert.throws(()=>replay({events:[]}),/Expected/));
test('multiple events deterministic across runs',()=>{const a=[e('e1','r1'),e('e2','r2','invoke','read',2,1)];assert.deepEqual(run(a),run(a));});
test('max 300 events accepted, 301 rejected',()=>{
 const events=Array.from({length:300},(_,i)=>e('e'+i,'r'+i,'invoke','read',0,0));
 assert.equal(run(events).metrics.events,300);
 assert.throws(()=>run([...events,e('extra','new')]),/maximum 300/);
});
test('JSON parsing source matches object parsing',()=>{const s={policy:policy(),events:[e('e1','r1')]};assert.deepEqual(replay(JSON.stringify(s)),replay(s));});
