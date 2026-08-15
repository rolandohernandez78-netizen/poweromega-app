import { getStore } from '@netlify/blobs';

const STORE_NAME = 'poweromega-analytics-v1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 60;
const ALLOWED_ORIGINS = new Set([
  'https://poweromega-app.netlify.app',
  'http://localhost:8888',
  'http://127.0.0.1:8888'
]);
const ALLOWED_EVENTS = new Set([
  'consent_granted',
  'page_view',
  'module_view',
  'download',
  'outbound_click',
  'interaction',
  'selection',
  'calculator_use',
  'bcs_selection',
  'scroll_depth',
  'session_summary'
]);

function text(value, maxLength = 120) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isValidId(value) {
  return /^[a-zA-Z0-9-]{12,80}$/.test(String(value || ''));
}

function number(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

function corsHeaders(origin = '') {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://poweromega-app.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function response(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin)
  });
}

function normalizeEvent(event) {
  const name = text(event?.event_name, 50);
  if (!ALLOWED_EVENTS.has(name)) return null;
  const parsedTime = Date.parse(event?.event_time);
  return {
    event_name: name,
    event_time: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString(),
    module: text(event?.module, 80),
    target: text(event?.target, 120),
    value: text(event?.value, 100),
    active_seconds: name === 'session_summary' ? number(event?.active_seconds, 0, 86400) : 0,
    duration_seconds: name === 'session_summary' ? number(event?.duration_seconds, 0, 86400) : 0
  };
}

export default async function handler(request, context) {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return response(405, { error: 'Método no permitido' }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return response(403, { error: 'Origen no permitido' }, origin);

  const userAgent = request.headers.get('user-agent') || '';
  if (/bot|crawler|spider|headless|lighthouse|pagespeed/i.test(userAgent)) {
    return response(202, { stored: false, reason: 'automated_client' }, origin);
  }

  const raw = await request.text();
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return response(413, { error: 'Carga inválida o demasiado grande' }, origin);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_error) {
    return response(400, { error: 'JSON inválido' }, origin);
  }

  if (body?.consent !== true || !isValidId(body?.visitor_id) || !isValidId(body?.session_id)) {
    return response(400, { error: 'Consentimiento o identificadores inválidos' }, origin);
  }

  const events = Array.isArray(body.events)
    ? body.events.slice(0, MAX_EVENTS).map(normalizeEvent).filter(Boolean)
    : [];
  if (events.length === 0) return response(400, { error: 'No hay eventos válidos' }, origin);

  const now = new Date();
  const receivedAt = now.toISOString();
  const day = receivedAt.slice(0, 10);
  const geo = context.geo || {};
  const record = {
    schema_version: 1,
    server_received_at: receivedAt,
    consent_version: text(body.consent_version, 30),
    visitor_id: text(body.visitor_id, 80),
    session_id: text(body.session_id, 80),
    session_started_at: Number.isFinite(Date.parse(body.session_started_at))
      ? new Date(body.session_started_at).toISOString()
      : receivedAt,
    sent_at: Number.isFinite(Date.parse(body.sent_at)) ? new Date(body.sent_at).toISOString() : receivedAt,
    device: {
      category: text(body.device?.category, 30),
      operating_system: text(body.device?.operating_system, 30),
      browser: text(body.device?.browser, 30),
      viewport: text(body.device?.viewport, 30),
      language: text(body.device?.language, 8)
    },
    acquisition: {
      referrer_domain: text(body.acquisition?.referrer_domain, 100),
      utm_source: text(body.acquisition?.utm_source, 60),
      utm_medium: text(body.acquisition?.utm_medium, 60),
      utm_campaign: text(body.acquisition?.utm_campaign, 80),
      landing_path: text(body.acquisition?.landing_path, 120)
    },
    geo: {
      country_code: text(geo.country?.code, 8),
      country: text(geo.country?.name, 80),
      subdivision_code: text(geo.subdivision?.code, 12),
      subdivision: text(geo.subdivision?.name, 80),
      city: text(geo.city, 80),
      timezone: text(geo.timezone, 50)
    },
    events
  };

  const store = getStore(STORE_NAME);
  const key = `events/${day}/${record.session_id}/${Date.now()}-${crypto.randomUUID()}.json`;
  await store.setJSON(key, record, {
    onlyIfNew: true,
    metadata: {
      day,
      expires_at: new Date(now.getTime() + 400 * 86400000).toISOString()
    }
  });

  return response(202, { stored: true, events: events.length }, origin);
}

export const config = {
  path: '/api/poweromega-analytics',
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};
