import assert from 'node:assert/strict';
import test from 'node:test';
import {chooseObjectName,objectCrop,OBJECT_NAMES,canSampleName,MAX_NAME_ATTEMPTS} from '../src/xray/objectNames.js';

test('names a clear visual match without returning a tracking identifier',()=>{
 assert.equal(chooseObjectName([{label:'person',score:0.87},{label:'clothing',score:0.08}]),'Person');
 assert.equal(chooseObjectName([{label:'cardboard box',score:0.8}]),'Box');
});
test('abstains for ambiguous or weak matches and malformed results',()=>{
 for(const rows of [null,[],[{label:'person',score:NaN}],[{label:'person',score:0.2}],
  [{label:'car',score:0.4},{label:'truck',score:0.37}], [{label:'unrecognizable object',score:0.9}],
  [{label:'invented label',score:0.99}]]) assert.equal(chooseObjectName(rows),'Unknown object');
});
test('vocabulary contains no duplicates and includes common industrial objects',()=>{
 assert.equal(new Set(OBJECT_NAMES).size,OBJECT_NAMES.length);
 for(const name of ['person','car','forklift','wooden pallet','cardboard box','pipe']) assert.ok(OBJECT_NAMES.includes(name));
});
test('maps a source mask crop to native video pixels and clips at every frame edge',()=>{
 const result=objectCrop([[-10,-4],[80,0],[80,40],[0,40]],100,50,1920,960);
 assert.equal(result.x,0); assert.equal(result.y,0);
 assert.ok(result.width<=1920); assert.ok(result.height<=960);
 const center=objectCrop([[25,10],[50,10],[50,30],[25,30]],100,50,1000,500);
 assert.ok(center.x<250); assert.ok(center.y<100); assert.ok(center.width>250); assert.ok(center.height>200);
});
test('refuses invalid or invisible crops instead of capturing an unrelated region',()=>{
 for(const ring of [null,[],[[1,1],[1,1],[1,1]],[[NaN,0],[1,1],[2,2]],[[110,0],[120,0],[120,10]]]) {
  assert.equal(objectCrop(ring,100,50,1920,960),null);
 }
 assert.equal(objectCrop([[0,0],[1,0],[1,1]],0,50,1920,960),null);
});

test('recognizes notepads and door handles without splitting notebook synonyms',()=>{
 assert.ok(OBJECT_NAMES.includes('notepad')); assert.ok(OBJECT_NAMES.includes('door handle'));
 assert.equal(chooseObjectName([{label:'door handle',score:0.72},{label:'door',score:0.15}]),'Door handle');
 assert.equal(chooseObjectName([{label:'notepad',score:0.19},{label:'notebook',score:0.18},{label:'book',score:0.21}]),'Notepad / notebook');
});
test('only retries uncertain completed attempts, on a different later frame, up to the cap',()=>{
 assert.equal(canSampleName(null,10,0),true);
 const previous={pending:false,done:false,count:1,at:1000,mediaTime:10};
 assert.equal(canSampleName(previous,12,2000),false);
 assert.equal(canSampleName(previous,10,3000),false);
 assert.equal(canSampleName({...previous,pending:true},12,3000),false);
 assert.equal(canSampleName({...previous,done:true},12,3000),false);
 assert.equal(canSampleName({...previous,count:MAX_NAME_ATTEMPTS},12,3000),false);
 assert.equal(canSampleName(previous,12,3000),true);
});
