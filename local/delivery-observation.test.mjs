import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nextDeliveryObservation,projectDeliveryObservation} from './delivery-observation.mjs';

test('provider status evidence retains raw played separately from normalized read',()=>{
 const sent=nextDeliveryObservation(null,2,'2026-10-03T12:00:00Z');
 const played=nextDeliveryObservation(sent,5,'2026-10-03T12:01:00Z');
 assert.equal(played.raw_status_code,5);
 assert.equal(played.interpreted_status,'played');
 assert.deepEqual(played.observations.map(x=>x.raw_status_code),[2,5]);
 assert.equal(played.history_complete,false);
 assert.equal(JSON.stringify(played).includes('message_id'),false);
});

test('unknown codes and invalid dates do not become delivery evidence',()=>{
 assert.equal(nextDeliveryObservation(null,1,'2026-10-03T12:00:00Z'),null);
 assert.equal(nextDeliveryObservation(null,'5','2026-10-03T12:00:00Z'),null);
 assert.equal(nextDeliveryObservation(null,5,'not-a-date'),null);
});

test('only canonical previous entries survive and history is bounded',()=>{
 const observations=Array.from({length:25},(_,i)=>({source:'baileys.messages.update',raw_status_code:3,interpreted_status:'delivered',observed_at:new Date(Date.UTC(2026,9,3,12,i)).toISOString(),private:'drop'}));
 observations.push({source:'untrusted',raw_status_code:5,interpreted_status:'played',observed_at:'2026-10-03T12:30:00Z',private:'drop'});
 const next=nextDeliveryObservation({observations},4,'2026-10-03T12:31:00Z');
 assert.equal(next.observations.length,20);
 assert.equal(next.observations[0].raw_status_code,3);
 assert.equal(next.observations.at(-1).raw_status_code,4);
 assert.equal(JSON.stringify(next).includes('private'),false);
});

test('API projection strips unexpected fields and rejects unverified status',()=>{
 const source={source:'baileys.messages.update',raw_status_code:5,interpreted_status:'played',observed_at:'2026-10-03T12:31:00Z',secret:'drop',observations:[{source:'baileys.messages.update',raw_status_code:4,interpreted_status:'read',observed_at:'2026-10-03T12:30:00Z',secret:'drop'}]};
 const projected=projectDeliveryObservation(source);
 assert.equal(projected.raw_status_code,5);
 assert.equal(JSON.stringify(projected).includes('secret'),false);
 assert.equal(projectDeliveryObservation({...source,interpreted_status:'delivered'}),null);
});
