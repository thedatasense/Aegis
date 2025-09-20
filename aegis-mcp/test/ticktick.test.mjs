import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTickTickTask, getTickTickHeaders } from '../ticktick.js';

// Simple fake pool with configurable behavior
function makeFakePool({ rows = [], onQuery } = {}) {
  return {
    async query(sql, params) {
      if (onQuery) return onQuery(sql, params);
      return { rows };
    }
  };
}

test('getTickTickHeaders returns bearer for valid stored access token', async () => {
  const fakePool = makeFakePool({
    rows: [{ access_token: 'AT', access_expires_at: new Date(Date.now() + 3600_000).toISOString() }],
  });
  const headers = await getTickTickHeaders(fakePool, {});
  assert.equal(headers.Authorization, 'Bearer AT');
});

test('getTickTickHeaders refreshes when expired and saves token', async () => {
  let saved;
  const fakePool = makeFakePool({
    onQuery(sql, params) {
      if (sql.includes('SELECT access_token')) {
        return Promise.resolve({ rows: [{ access_token: 'OLD', access_expires_at: new Date(Date.now() - 1000).toISOString(), refresh_token: 'RT' }] });
      }
      if (sql.startsWith('INSERT INTO oauth_tokens')) {
        saved = params; // ['ticktick', rt, at, exp]
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    }
  });

  const fakeFetch = async () => ({
    ok: true,
    async json() { return { access_token: 'NEWAT', expires_in: 3600, refresh_token: 'NEWRT' }; },
    async text() { return 'ok'; }
  });

  const headers = await getTickTickHeaders(fakePool, { TICKTICK_CLIENT_ID: 'id', TICKTICK_CLIENT_SECRET: 'sec' }, fakeFetch);
  assert.equal(headers.Authorization, 'Bearer NEWAT');
  assert.equal(saved[1], 'NEWRT');
  assert.equal(saved[2], 'NEWAT');
});

test('createTickTickTask posts to API and upserts DB row', async () => {
  const created = {
    id: 'task123',
    projectId: 'proj1',
    title: 'Test',
    content: 'Body',
    isAllDay: false,
    startDate: '2024-01-01T10:00:00Z',
    dueDate: '2024-01-02T10:00:00Z',
    timeZone: 'UTC',
    repeatFlag: null,
    reminders: ['2024-01-02T09:00:00Z'],
    priority: 5,
    status: '0',
    sortOrder: 0,
    items: [],
    tags: ['a'],
    modifiedTime: '2024-01-01T11:00:00Z',
    createdTime: '2024-01-01T09:00:00Z',
    deleted: false,
    etag: 'etag123'
  };

  const calls = { queries: [], bodies: [] };
  const fakePool = makeFakePool({
    onQuery(sql, params) {
      calls.queries.push({ sql, params });
      if (sql.includes('SELECT access_token')) {
        return Promise.resolve({ rows: [{ access_token: 'AT', access_expires_at: new Date(Date.now() + 10000).toISOString() }] });
      }
      if (sql.includes('INSERT INTO ticktick_tasks')) {
        return Promise.resolve({ rows: [{ id: created.id }] });
      }
      return Promise.resolve({ rows: [] });
    }
  });

  const fakeFetch = async (url, init) => {
    calls.bodies.push({ url, init });
    if (url.endsWith('/task')) {
      return {
        ok: true,
        async json() { return created; },
        async text() { return JSON.stringify(created); }
      };
    }
    return { ok: true, async json() { return {}; }, async text() { return 'ok'; } };
  };

  const { createdTask, dbRow } = await createTickTickTask(fakePool, { title: 'Test' }, fakeFetch);
  assert.equal(createdTask.id, 'task123');
  assert.equal(dbRow.id, 'task123');
  // Verify Authorization header was set
  const sent = calls.bodies[0].init;
  assert(sent.headers.Authorization.startsWith('Bearer '));
});
