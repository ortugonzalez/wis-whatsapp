import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { normalizeNewsletterEvent, attachNewsletterEvents } from './newsletter-events.mjs';

test('newsletter notifications validate counts and discard untrusted extra data', () => {
  const v = { id:'123@newsletter', server_id:'42', count:0, secret:'never persisted' };
  assert.deepEqual(normalizeNewsletterEvent('newsletter.view',v,'now'),{
    channel_id:v.id,server_id:'42',observed_at:'now',source:'baileys_passive_event',scope:'latest_notification_only',reported_view_count:0
  });
  for (const count of [-1,NaN,Infinity,1.5,'2',Number.MAX_SAFE_INTEGER+1]) assert.equal(normalizeNewsletterEvent('newsletter.view',{...v,count}),null);
  for (const id of ['123@s.whatsapp.net','wrong',null]) assert.equal(normalizeNewsletterEvent('newsletter.view',{...v,id}),null);
  assert.equal(normalizeNewsletterEvent('newsletter.view',{...v,server_id:'x\n'}),null);
  assert.equal(normalizeNewsletterEvent('newsletter.reaction',{...v,reaction:{secret:'x'}}),null);
});

test('passive handlers preserve channel scope, never accumulate reactions and honor socket ownership', () => {
  const emitter = new EventEmitter(), snapshots = new Map(), events=[];
  let owns=true;
  attachNewsletterEvents(emitter,{guarded:fn=>value=>{if(owns)fn(value);},snapshot:(k,id,p)=>snapshots.set(`${k}/${id}`,p),event:(...args)=>events.push(args)});
  const reaction={id:'123@newsletter',server_id:'42',reaction:{code:'👍',count:1}};
  emitter.emit('newsletter.reaction',reaction);emitter.emit('newsletter.reaction',reaction);
  assert.equal(snapshots.size,1);
  assert.equal([...snapshots.values()][0].reported_event_count,1);
  assert.equal([...snapshots.values()][0].total,undefined);
  emitter.emit('newsletter.view',{id:'456@newsletter',server_id:'42',count:12});
  assert.equal(snapshots.size,2);
  assert.equal(events.length,3);
  owns=false;emitter.emit('newsletter.view',{id:'456@newsletter',server_id:'42',count:99});
  assert.equal(events.length,3);
  assert.equal(snapshots.get('newsletter_view/456@newsletter:42').reported_view_count,12);
});
