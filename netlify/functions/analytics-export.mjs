import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'poweromega-analytics-v1';
const MAX_RECORDS = 10000;
// Solo se publica el hash irreversible. La clave original permanece local y fuera de Git.
const EXPORT_TOKEN_SHA256 = '33eca0a4e78bad2442858c4a8bc0a7c9a37f491963a70d2ccb7a9dc5f44c215b';

function corsHeaders(contentType) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Analytics-Key, Content-Type',
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders('application/json; charset=utf-8')
  });
}

function authorized(request) {
  const received = request.headers.get('x-analytics-key') || '';
  if (received.length < 24 || received.length > 160) return false;
  const receivedHash = createHash('sha256').update(received).digest('hex');
  return timingSafeEqual(Buffer.from(EXPORT_TOKEN_SHA256), Buffer.from(receivedHash));
}

function validDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

async function loadRecords(store, from, to) {
  const keys = [];
  for await (const page of store.list({ prefix: 'events/', paginate: true })) {
    for (const blob of page.blobs) {
      const datePart = blob.key.split('/')[1];
      const day = new Date(`${datePart}T00:00:00.000Z`);
      if (Number.isFinite(day.getTime()) && day >= from && day <= to) keys.push(blob.key);
    }
  }
  keys.sort().reverse();
  const selected = keys.slice(0, MAX_RECORDS);
  const records = [];
  for (let index = 0; index < selected.length; index += 25) {
    const batch = selected.slice(index, index + 25);
    const values = await Promise.all(batch.map(key => store.get(key, { type: 'json' })));
    values.filter(Boolean).forEach(value => records.push(value));
  }
  return { records, truncated: keys.length > MAX_RECORDS, available: keys.length };
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(records) {
  const headers = [
    'server_received_at', 'visitor_id', 'session_id', 'session_started_at',
    'event_time', 'event_name', 'module', 'target', 'value',
    'active_seconds', 'duration_seconds', 'device_category', 'operating_system',
    'browser', 'viewport', 'language', 'country_code', 'country', 'subdivision',
    'city', 'timezone', 'referrer_domain', 'utm_source', 'utm_medium',
    'utm_campaign', 'landing_path', 'consent_version'
  ];
  const rows = [headers.join(',')];
  records.forEach(record => {
    (record.events || []).forEach(event => {
      const values = [
        record.server_received_at, record.visitor_id, record.session_id, record.session_started_at,
        event.event_time, event.event_name, event.module, event.target, event.value,
        event.active_seconds, event.duration_seconds, record.device?.category,
        record.device?.operating_system, record.device?.browser, record.device?.viewport,
        record.device?.language, record.geo?.country_code, record.geo?.country,
        record.geo?.subdivision, record.geo?.city, record.geo?.timezone,
        record.acquisition?.referrer_domain, record.acquisition?.utm_source,
        record.acquisition?.utm_medium, record.acquisition?.utm_campaign,
        record.acquisition?.landing_path, record.consent_version
      ];
      rows.push(values.map(csvCell).join(','));
    });
  });
  return `\uFEFF${rows.join('\r\n')}`;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders('text/plain; charset=utf-8') });
  }
  if (request.method !== 'GET') return json(405, { error: 'Método no permitido' });
  if (!authorized(request)) return json(401, { error: 'Clave de acceso inválida' });

  const url = new URL(request.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 365 * 86400000);
  const from = validDate(url.searchParams.get('from'), defaultFrom);
  const to = validDate(url.searchParams.get('to'), now);
  to.setUTCHours(23, 59, 59, 999);
  if (from > to) return json(400, { error: 'Rango de fechas inválido' });

  const store = getStore(STORE_NAME);
  const result = await loadRecords(store, from, to);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();

  if (format === 'csv') {
    return new Response(toCsv(result.records), {
      status: 200,
      headers: {
        ...corsHeaders('text/csv; charset=utf-8'),
        'Content-Disposition': `attachment; filename="poweromega-analytics-${now.toISOString().slice(0, 10)}.csv"`,
        'X-Analytics-Truncated': String(result.truncated)
      }
    });
  }

  return json(200, {
    generated_at: now.toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    record_count: result.records.length,
    available_record_count: result.available,
    truncated: result.truncated,
    records: result.records
  });
}
