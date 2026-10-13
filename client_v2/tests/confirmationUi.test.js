import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingConfirmation} from '../src/page/user/Assistant/confirmationUi.js';
for(const workflow of ['admin_delete','incident_action','create_department','create_location','create_auto_email_report','register_new_user','add_network_recorder'])test('locks composer for '+workflow,()=>{
 const msg={role:'assistant',text:'Please review.',ui:{type:workflow.startsWith('create')||workflow==='register_new_user'?'review':'confirmation',workflow}};
 assert.equal(pendingConfirmation([msg]),msg);
});
test('plain confirmation prompts lock without structured UI',()=>assert.ok(pendingConfirmation([{role:'assistant',text:'Send this report? Reply Yes to confirm or Cancel to stop.'}])));
test('guidance and failures restore composer and do not reuse an older confirmation',()=>{
 const pending={role:'assistant',ui:{type:'confirmation',workflow:'admin_delete'}};
 for(const text of ['Email send failed. Please retry later.','Creation cancelled.','Here is how to add an NVR.'])assert.equal(pendingConfirmation([pending,{role:'assistant',text}]),null);
});
for(const status of ['completed','cancelled','failed','error'])test('does not lock terminal status '+status,()=>assert.equal(pendingConfirmation([{role:'assistant',ui:{type:'confirmation',status}}]),null));
