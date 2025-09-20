import fetch from 'node-fetch';

export const TICKTICK_BASE = 'https://api.ticktick.com/open/v1';
const TICKTICK_OAUTH_TOKEN = 'https://ticktick.com/oauth/token';

export async function getStoredTickTickTokens(pool) {
  const result = await pool.query(
    'SELECT access_token, refresh_token, access_expires_at FROM oauth_tokens WHERE provider = $1',
    ['ticktick']
  );
  return result.rows[0] || null;
}

export async function saveTickTickTokens(pool, refreshToken, accessToken, expiresInSecs) {
  let expiresAt = null;
  if (expiresInSecs) {
    expiresAt = new Date(Date.now() + expiresInSecs * 1000);
  }
  await pool.query(
    `INSERT INTO oauth_tokens (provider, refresh_token, access_token, access_expires_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       access_token = EXCLUDED.access_token,
       access_expires_at = EXCLUDED.access_expires_at,
       updated_at = NOW()`,
    ['ticktick', refreshToken, accessToken, expiresAt]
  );
}

export async function refreshTickTickAccessToken(pool, env = process.env, fetchImpl = fetch) {
  const tokens = await getStoredTickTickTokens(pool);
  const refreshToken = tokens?.refresh_token || env.TICKTICK_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('Missing TickTick refresh token');
  if (!env.TICKTICK_CLIENT_ID || !env.TICKTICK_CLIENT_SECRET) {
    throw new Error('Missing TICKTICK_CLIENT_ID or TICKTICK_CLIENT_SECRET');
  }
  const auth = Buffer.from(`${env.TICKTICK_CLIENT_ID}:${env.TICKTICK_CLIENT_SECRET}`).toString('base64');
  const response = await fetchImpl(TICKTICK_OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'tasks:read tasks:write' })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TickTick token refresh failed (${response.status}): ${error}`);
  }
  const data = await response.json();
  await saveTickTickTokens(pool, data.refresh_token || refreshToken, data.access_token, data.expires_in);
  return data.access_token;
}

export async function getTickTickHeaders(pool, env = process.env, fetchImpl = fetch) {
  const tokens = await getStoredTickTickTokens(pool);
  const now = new Date();
  if (tokens?.access_token && (!tokens.access_expires_at || new Date(tokens.access_expires_at) > now)) {
    return { Authorization: `Bearer ${tokens.access_token}` };
  }
  try {
    const at = await refreshTickTickAccessToken(pool, env, fetchImpl);
    return { Authorization: `Bearer ${at}` };
  } catch {
    const envAccessToken = env.TICKTICK_ACCESS_TOKEN;
    if (envAccessToken) return { Authorization: `Bearer ${envAccessToken}` };
    throw new Error('No valid TickTick token available');
  }
}

const parseTimestamp = (str) => {
  if (!str) return null;
  try { return new Date(str); } catch { return null; }
};

// Format date for TickTick API: "yyyy-MM-dd'T'HH:mm:ssZ" (e.g., "2019-11-13T03:00:00+0000")
const formatDateForTickTick = (dateStr) => {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    
    // Get timezone offset in format +HHMM or -HHMM
    const offset = date.getTimezoneOffset();
    const absOffset = Math.abs(offset);
    const offsetHours = Math.floor(absOffset / 60).toString().padStart(2, '0');
    const offsetMinutes = (absOffset % 60).toString().padStart(2, '0');
    const offsetSign = offset <= 0 ? '+' : '-';
    const offsetStr = `${offsetSign}${offsetHours}${offsetMinutes}`;
    
    // Format date parts
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
  } catch {
    return undefined;
  }
};

export async function createTickTickTask(pool, args, fetchImpl = fetch) {
  const headers = await getTickTickHeaders(pool, process.env, fetchImpl);
  headers['Content-Type'] = 'application/json';
  const body = { title: args.title };
  if (args.project_id !== undefined) body.projectId = args.project_id;
  if (args.content !== undefined) body.content = args.content;
  if (args.desc !== undefined) body.desc = args.desc;
  if (args.is_all_day !== undefined) body.isAllDay = args.is_all_day;
  
  // Format dates for TickTick API
  const formattedStartDate = formatDateForTickTick(args.start_date);
  const formattedDueDate = formatDateForTickTick(args.due_date);
  if (formattedStartDate) body.startDate = formattedStartDate;
  if (formattedDueDate) body.dueDate = formattedDueDate;
  
  if (args.time_zone !== undefined) body.timeZone = args.time_zone;
  if (args.repeat_flag !== undefined) body.repeatFlag = args.repeat_flag;
  if (args.reminders !== undefined) body.reminders = args.reminders;
  if (args.priority !== undefined) body.priority = args.priority;
  if (args.tags !== undefined) body.tags = args.tags;

  const resp = await fetchImpl(`${TICKTICK_BASE}/task`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    let error;
    try { error = await resp.json(); } catch { error = await resp.text(); }
    throw new Error(`TickTick create task failed (${resp.status}): ${JSON.stringify(error)}`);
  }
  const createdTask = await resp.json();

  const upsertQuery = `
    INSERT INTO ticktick_tasks (
      id, project_id, title, content, "desc", is_all_day, start_date, due_date,
      time_zone, repeat_flag, reminders, priority, status, completed_time,
      sort_order, items, tags, modified_time, created_time, deleted, etag, raw, last_synced_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
    ) ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      "desc" = EXCLUDED."desc",
      is_all_day = EXCLUDED.is_all_day,
      start_date = EXCLUDED.start_date,
      due_date = EXCLUDED.due_date,
      time_zone = EXCLUDED.time_zone,
      repeat_flag = EXCLUDED.repeat_flag,
      reminders = EXCLUDED.reminders,
      priority = EXCLUDED.priority,
      status = EXCLUDED.status,
      completed_time = EXCLUDED.completed_time,
      sort_order = EXCLUDED.sort_order,
      items = EXCLUDED.items,
      tags = EXCLUDED.tags,
      modified_time = EXCLUDED.modified_time,
      created_time = EXCLUDED.created_time,
      deleted = EXCLUDED.deleted,
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      last_synced_at = NOW()
    RETURNING *
  `;

  const values = [
    createdTask.id,
    createdTask.projectId || null,
    createdTask.title,
    createdTask.content || null,
    createdTask.desc || null,
    createdTask.isAllDay || createdTask.allDay || false,
    parseTimestamp(createdTask.startDate),
    parseTimestamp(createdTask.dueDate),
    createdTask.timeZone || null,
    createdTask.repeatFlag || createdTask.repeat || null,
    JSON.stringify(createdTask.reminders || []),
    createdTask.priority || null,
    createdTask.status || null,
    parseTimestamp(createdTask.completedTime),
    createdTask.sortOrder || null,
    JSON.stringify(createdTask.items || []),
    createdTask.tags || null,
    parseTimestamp(createdTask.modifiedTime),
    parseTimestamp(createdTask.createdTime),
    createdTask.deleted || false,
    createdTask.etag || null,
    JSON.stringify(createdTask)
  ];

  const dbResult = await pool.query(upsertQuery, values);
  return { createdTask, dbRow: dbResult.rows?.[0] };
}

