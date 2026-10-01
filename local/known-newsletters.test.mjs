import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './db.mjs';
import { NEWSLETTER_READ_BATCH_SIZE, selectKnownNewsletterTargets } from './known-newsletters.mjs';

test('known newsletter reads rotate past the first batch and prefer unobserved channels', () => {
  const database = openDatabase(':memory:');
  try {
    for (let index = 0; index < 27; index++) {
      database.prepare('INSERT INTO conversations(id,wa_chat_id,title) VALUES(?,?,?)')
        .run(`conversation-${index}`, `${1000 + index}@newsletter`, `Channel ${index}`);
    }
    const first = selectKnownNewsletterTargets(database);
    assert.equal(first.targets.length, NEWSLETTER_READ_BATCH_SIZE);
    assert.equal(first.truncated, true);
    assert.deepEqual(first.targets, Array.from({ length: 20 }, (_, index) => `${1000 + index}@newsletter`));

    const seenAt = '2026-09-30T00:00:00.000Z';
    const save = database.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('newsletter',?,'{}',?)");
    for (const target of first.targets) save.run(target, seenAt);

    const second = selectKnownNewsletterTargets(database);
    assert.equal(second.targets.length, NEWSLETTER_READ_BATCH_SIZE);
    assert.equal(second.truncated, true);
    assert.ok(second.targets.includes('1020@newsletter'));
    assert.ok(second.targets.includes('1021@newsletter'));
    assert.ok(second.targets.includes('1022@newsletter'));
    assert.ok(second.targets.includes('1023@newsletter'));
    assert.ok(second.targets.includes('1024@newsletter'));
    assert.ok(second.targets.includes('1025@newsletter'));
    assert.ok(second.targets.includes('1026@newsletter'));
    assert.equal(new Set(second.targets).size, second.targets.length);
  } finally {
    database.close();
  }
});

test('newsletter selection ignores malformed stored resource IDs and reports truncation accurately', () => {
  const database = openDatabase(':memory:');
  try {
    database.prepare("INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES('newsletter','not-a-channel','{}','2026-01-01T00:00:00.000Z')").run();
    database.prepare('INSERT INTO conversations(id,wa_chat_id,title) VALUES(?,?,?)').run('known', '12345@newsletter', 'Known');
    assert.deepEqual(selectKnownNewsletterTargets(database, 1), { targets: ['12345@newsletter'], truncated: false });
    assert.throws(() => selectKnownNewsletterTargets(database, 0), /invalid_newsletter_batch_size/);
  } finally {
    database.close();
  }
});
