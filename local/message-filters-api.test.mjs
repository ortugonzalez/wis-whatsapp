import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { openDatabase } from './db.mjs';
import { makeServer } from './server.mjs';

test('message list supports bounded WHAPI-style filters over persisted local rows', async () => {
  const database = openDatabase(':memory:');
  const token = 'wis_' + randomBytes(32).toString('base64url');
  database.prepare('INSERT INTO tokens(id,name,token_hash,scopes,created_at) VALUES(?,?,?,?,?)').run('read-token','tests',createHash('sha256').update(token).digest('hex'),JSON.stringify(['read']),new Date().toISOString());
  database.prepare("UPDATE connections SET phone='+5491100005679',expected_phone_e164='+5491100005679' WHERE id='wis-5679'").run();
  database.prepare('INSERT INTO contacts(id,phone_e164,wa_jid,display_name,created_at) VALUES(?,?,?,?,?)').run('contact-one','+5491111111111','5491111111111@s.whatsapp.net','Fixture',new Date().toISOString());
  database.prepare('INSERT INTO conversations(id,contact_id,wa_chat_id) VALUES(?,?,?)').run('chat-one','contact-one','5491111111111@s.whatsapp.net');
  database.prepare('INSERT INTO conversations(id,contact_id,wa_chat_id) VALUES(?,?,?)').run('chat-group',null,'120363000@g.us');
  const insert = database.prepare('INSERT INTO messages(id,conversation_id,wa_message_id,direction,type,body,delivery_status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  insert.run('m-in','chat-one','wa-in','in','text','incoming','delivered','import','2026-01-01T00:00:00.000Z');
  insert.run('m-out','chat-one','wa-out','out','text','outgoing','sent','import','2026-01-02T00:00:00.000Z');
  insert.run('m-group','chat-group','wa-group','in','text','group incoming','delivered','live','2026-01-03T00:00:00.000Z');
  insert.run('m-system','chat-one','wa-system','in','event','system event','delivered','live','2026-01-04T00:00:00.000Z');
  const snapshot = database.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?)');
  snapshot.run('message','wa-group',JSON.stringify({participant:'5491111111111@s.whatsapp.net'}),'2026-01-03T00:00:00.000Z');
  snapshot.run('message','wa-system',JSON.stringify({messageStubType:1}),'2026-01-04T00:00:00.000Z');
  const server = makeServer(database);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/messages`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const filtered = await fetch(`${base}?from_me=false&time_from=1767225600&time_to=1767571200&sort=asc&count=2`,{headers});
    assert.equal(filtered.status,200);
    const page = await filtered.json();
    assert.deepEqual(page.data.map(row=>row.id),['m-in','m-group']);
    assert.equal(page.meta.limit,2);
    assert.equal(page.meta.sort,'asc');
    assert.equal(page.meta.history_complete,false);
    const authoredResponse = await fetch(`${base}?author=5491111111111`,{headers});
    assert.equal(authoredResponse.status,200,await authoredResponse.clone().text());
    const authored = await authoredResponse.json();
    assert.deepEqual(authored.data.map(row=>row.id),['m-group','m-in']);
    const e164Author = await fetch(`${base}?author=%2B5491111111111`,{headers});
    assert.deepEqual((await e164Author.json()).data.map(row=>row.id),['m-group','m-in']);
    const unmatchedAuthor=await (await fetch(`${base}?author=5491222222222`,{headers})).json();
    assert.deepEqual(unmatchedAuthor.data,[]);
    const normalResponse = await fetch(`${base}?normal_types=true&sort=asc`,{headers});
    assert.equal(normalResponse.status,200,await normalResponse.clone().text());
    const normal = await normalResponse.json();
    assert.deepEqual(normal.data.map(row=>row.id),['m-in','m-out','m-group']);
    for(const query of ['author=bad','from_me=yes','normal_types=yes','sort=random','count=201','count=1&limit=1','time_from=1767571200&time_to=1767312000']) {
      assert.equal((await fetch(`${base}?${query}`,{headers})).status,400,query);
    }
    assert.equal((await fetch(`${base}?from_me=true`)).status,401);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    database.close();
  }
});
