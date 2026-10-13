import test from 'node:test';
import assert from 'node:assert/strict';
import {isNvrWorkflowPrompt,isNvrConfirmationPrompt} from '../src/page/user/Assistant/nvrWorkflowUi.js';
for(const text of [
 'To add NVRs, you need to provide authorized NVR details. After that, you can discover or enter cameras, assign locations, select streams, and save the inventory.',
 'To add an NVR, you need to provide authorized NVR details. The process involves connecting authorized NVR feeds to the VideoraIQ platform.',
 'The Cameras & NVRs module lets you add recorders and select cameras.',
 'No NVRs matched the requested filters.',
])test('guidance and read results have no cancel control: '+text,()=>assert.equal(isNvrWorkflowPrompt(text),false));
for(const text of ['I need Brand and IP to add this Network Recorder.', 'Ready to create NVR Lobby. Reply Yes to confirm.', 'Where is this NVR located?'])test('actual NVR form prompt retains controls: '+text,()=>assert.equal(isNvrWorkflowPrompt(text),true));
test('confirmation is explicit',()=>{
 assert.equal(isNvrConfirmationPrompt('Ready to create NVR Lobby. Reply Yes to confirm.'),true);
 assert.equal(isNvrConfirmationPrompt('To add an NVR, provide its details.'),false);
});
