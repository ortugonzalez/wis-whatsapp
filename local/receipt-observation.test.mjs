import test from 'node:test';
import assert from 'node:assert/strict';
import {projectReceiptObservation} from './receipt-observation.mjs';

test('projects receipt timestamps with raw seconds and separate persistence time',()=>{
 const result=projectReceiptObservation({data:{userJid:'participant@lid',receiptTimestamp:1767315600,readTimestamp:'1767315660',playedTimestamp:null,secret:'omit'},updated_at:'2026-01-02T01:02:00Z'});
 assert.deepEqual(result.receipt_timestamp,{raw:'1767315600',iso:'2026-01-02T01:00:00.000Z'});
 assert.deepEqual(result.read_timestamp,{raw:'1767315660',iso:'2026-01-02T01:01:00.000Z'});
 assert.equal(result.played_timestamp,null);
 assert.equal(result.persisted_at,'2026-01-02T01:02:00.000Z');
 assert.equal(result.history_complete,false);
 assert.equal(JSON.stringify(result).includes('secret'),false);
});

test('does not invent a time for malformed or unavailable marks',()=>{
 assert.equal(projectReceiptObservation({data:{readTimestamp:'not-a-time'}}),null);
 const result=projectReceiptObservation({data:{receiptTimestamp:'123',playedTimestamp:'1767315720'},updated_at:'invalid'});
 assert.deepEqual(result.receipt_timestamp,{raw:'123',iso:null});
 assert.equal(result.played_timestamp.iso,'2026-01-02T01:02:00.000Z');
 assert.equal(result.persisted_at,null);
});
