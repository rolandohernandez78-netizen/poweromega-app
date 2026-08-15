/* ==========================================================================
   PowerOmega APP - Analítica agregada con consentimiento previo
   No registra IP, coordenadas, información clínica ni valores de calculadores.
   ========================================================================== */

const PowerOmegaAnalytics = (function () {
  'use strict';

  const CONSENT_VERSION = '2026-08-15';
  const CONSENT_KEY = 'poweromega_analytics_consent_v1';
  const VISITOR_KEY = 'poweromega_analytics_visitor_v1';
  const SESSION_KEY = 'poweromega_analytics_session_v1';
  const ENDPOINT = '/api/poweromega-analytics';
  const FLUSH_INTERVAL_MS = 120000;
  const IDLE_AFTER_MS = 30000;
  const MAX_QUEUE = 100;

  const MODULE_NAMES = {
    'module-morphometrics': 'Peso morfométrico',
    'module-nutrition': 'Requerimientos y nutrición',
    'module-bcs': 'Condición corporal (BCS)',
    'module-product': 'EQUIGRAS y Tecnigrasas'
  };

  const TRACKED_SELECTS = new Set([
    'selectWeightModel',
    'selectPhysioState',
    'selectHeightCategory',
    'simCategory',
    'simTemp',
    'simDiet',
    'selectEquineType'
  ]);

  const TRACKED_INPUTS = new Set([
    'inputNC', 'inputH', 'inputG', 'inputL',
    'rangeNC', 'rangeH', 'rangeG', 'rangeL',
    'simBodyWeight', 'inputFatCm', 'rangeFatCm'
  ]);

  const TRACKED_BUTTONS = new Set([
    'btnUnitMetric',
    'btnUnitImperial',
    'btnScrollToWeight',
    'btnToggleWaterSim',
    'btnScrollWaterTable',
    'btnExpertsToggle'
  ]);

  let enabled = false;
  let queue = [];
  let visitorId = '';
  let sessionId = '';
  let sessionStartedAt = Date.now();
  let lastActivityAt = Date.now();
  let activeSeconds = 0;
  let lastActiveTick = performance.now();
  let flushTimer = null;
  let activeTimer = null;
  let isFlushing = false;
  let trackingEventsBound = false;
  const reachedScrollDepths = new Set();

  function safeStorage(storage, action, key, value) {
    try {
      if (action === 'get') return storage.getItem(key);
      if (action === 'set') storage.setItem(key, value);
      if (action === 'remove') storage.removeItem(key);
    } catch (_error) {
      return null;
    }
    return null;
  }

  function randomId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    const part = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${part()}-${part()}`;
  }

  function getOrCreateId(storage, key) {
    const existing = safeStorage(storage, 'get', key);
    if (existing && /^[a-zA-Z0-9-]{12,80}$/.test(existing)) return existing;
    const created = randomId();
    safeStorage(storage, 'set', key, created);
    return created;
  }

  function getConsent() {
    const raw = safeStorage(localStorage, 'get', CONSENT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && ['accepted', 'declined'].includes(parsed.status) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function setConsent(status) {
    const consent = {
      status,
      version: CONSENT_VERSION,
      recorded_at: new Date().toISOString()
    };
    safeStorage(localStorage, 'set', CONSENT_KEY, JSON.stringify(consent));
    return consent;
  }

  function showConsent() {
    const panel = document.getElementById('analyticsConsent');
    if (!panel) return;
    panel.hidden = false;
    const primary = document.getElementById('btnAnalyticsAccept');
    if (primary) primary.focus({ preventScroll: true });
  }

  function hideConsent() {
    const panel = document.getElementById('analyticsConsent');
    if (panel) panel.hidden = true;
  }

  function currentModule() {
    const active = document.querySelector('.module-section.active');
    return active ? (MODULE_NAMES[active.id] || active.id) : 'Sin identificar';
  }

  function sanitizeText(value, maxLength = 100) {
    return String(value == null ? '' : value)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function viewportBucket() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (width <= 380) return 'Hasta 380 px';
    if (width <= 480) return '381–480 px';
    if (width <= 768) return '481–768 px';
    if (width <= 1024) return '769–1024 px';
    if (width <= 1440) return '1025–1440 px';
    return 'Más de 1440 px';
  }

  function deviceCategory() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'Tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'Teléfono';
    return 'Computador';
  }

  function operatingSystem() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Otro';
  }

  function browserName() {
    const ua = navigator.userAgent || '';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/CriOS/i.test(ua)) return 'Chrome iOS';
    if (/FxiOS/i.test(ua)) return 'Firefox iOS';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
    return 'Otro';
  }

  function referrerDomain() {
    if (!document.referrer) return 'Directo';
    try {
      const referrer = new URL(document.referrer);
      return referrer.hostname === location.hostname ? 'Navegación interna' : referrer.hostname;
    } catch (_error) {
      return 'No identificado';
    }
  }

  function acquisitionData() {
    const params = new URLSearchParams(location.search);
    return {
      referrer_domain: referrerDomain(),
      utm_source: sanitizeText(params.get('utm_source'), 60),
      utm_medium: sanitizeText(params.get('utm_medium'), 60),
      utm_campaign: sanitizeText(params.get('utm_campaign'), 80),
      landing_path: sanitizeText(location.pathname, 120)
    };
  }

  function deviceData() {
    return {
      category: deviceCategory(),
      operating_system: operatingSystem(),
      browser: browserName(),
      viewport: viewportBucket(),
      language: sanitizeText((navigator.language || 'es').split('-')[0], 8)
    };
  }

  function recordEvent(name, details = {}) {
    if (!enabled) return;
    queue.push({
      event_name: sanitizeText(name, 50),
      event_time: new Date().toISOString(),
      module: sanitizeText(details.module || currentModule(), 80),
      target: sanitizeText(details.target, 120),
      value: sanitizeText(details.value, 100)
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= 20) flush();
  }

  function sessionSummaryEvent() {
    return {
      event_name: 'session_summary',
      event_time: new Date().toISOString(),
      module: currentModule(),
      target: '',
      value: '',
      active_seconds: Math.round(activeSeconds),
      duration_seconds: Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000))
    };
  }

  function buildPayload(events) {
    return {
      schema_version: 1,
      consent: true,
      consent_version: CONSENT_VERSION,
      visitor_id: visitorId,
      session_id: sessionId,
      session_started_at: new Date(sessionStartedAt).toISOString(),
      sent_at: new Date().toISOString(),
      device: deviceData(),
      acquisition: acquisitionData(),
      events
    };
  }

  async function flush(options = {}) {
    if (!enabled || isFlushing || queue.length === 0) return;
    isFlushing = true;
    const events = queue.splice(0, queue.length);
    events.push(sessionSummaryEvent());
    const payload = buildPayload(events);
    const body = JSON.stringify(payload);

    try {
      if (options.beacon && navigator.sendBeacon) {
        const accepted = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        if (!accepted) throw new Error('sendBeacon no aceptó el envío');
      } else {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
          credentials: 'omit'
        });
        if (!response.ok) throw new Error(`Respuesta analítica ${response.status}`);
      }
    } catch (_error) {
      queue = events.filter(event => event.event_name !== 'session_summary').concat(queue).slice(-MAX_QUEUE);
    } finally {
      isFlushing = false;
    }
  }

  function updateActiveTime() {
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(5, (now - lastActiveTick) / 1000));
    lastActiveTick = now;
    if (!document.hidden && Date.now() - lastActivityAt <= IDLE_AFTER_MS) {
      activeSeconds += elapsed;
    }
  }

  function markActivity() {
    lastActivityAt = Date.now();
  }

  function trackScrollDepth() {
    if (!enabled) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const depth = Math.min(100, Math.round((window.scrollY / maxScroll) * 100));
    [25, 50, 75, 90].forEach(milestone => {
      if (depth >= milestone && !reachedScrollDepths.has(milestone)) {
        reachedScrollDepths.add(milestone);
        recordEvent('scroll_depth', { target: `${milestone}%` });
      }
    });
  }

  function fileLabel(anchor) {
    try {
      const url = new URL(anchor.href, location.href);
      return decodeURIComponent(url.pathname.split('/').pop() || anchor.textContent || 'archivo');
    } catch (_error) {
      return sanitizeText(anchor.textContent || 'archivo', 120);
    }
  }

  function isDownloadLink(anchor) {
    if (!anchor) return false;
    const href = anchor.getAttribute('href') || '';
    return /\.(pdf|png|jpe?g|docx?|xlsx?)(?:$|[?#])/i.test(href)
      || /download|descargar/i.test(anchor.className + ' ' + anchor.textContent);
  }

  function trackClick(event) {
    if (!enabled) return;

    const tab = event.target.closest('.nav-tab-btn[data-module]');
    if (tab) {
      const moduleId = tab.dataset.module;
      recordEvent('module_view', {
        module: MODULE_NAMES[moduleId] || moduleId,
        target: tab.id
      });
      return;
    }

    const bcsCard = event.target.closest('.bcs-card[data-score]');
    if (bcsCard) {
      recordEvent('bcs_selection', { target: 'condición corporal', value: bcsCard.dataset.score });
      return;
    }

    const anchor = event.target.closest('a[href]');
    if (anchor) {
      if (isDownloadLink(anchor)) {
        recordEvent('download', { target: fileLabel(anchor) });
        return;
      }
      try {
        const url = new URL(anchor.href, location.href);
        if (url.origin !== location.origin) {
          recordEvent('outbound_click', { target: url.hostname });
        }
      } catch (_error) {
        // Un enlace no válido simplemente no se registra.
      }
      return;
    }

    const button = event.target.closest('button[id]');
    if (button && TRACKED_BUTTONS.has(button.id)) {
      recordEvent('interaction', {
        target: button.id,
        value: button.getAttribute('aria-expanded') || ''
      });
    }
  }

  function trackChange(event) {
    if (!enabled || !event.target) return;
    const id = event.target.id;
    if (TRACKED_SELECTS.has(id)) {
      recordEvent('selection', { target: id, value: event.target.value });
    } else if (TRACKED_INPUTS.has(id)) {
      recordEvent('calculator_use', { target: id });
    }
  }

  function bindTrackingEvents() {
    if (trackingEventsBound) return;
    trackingEventsBound = true;
    document.addEventListener('click', trackClick, true);
    document.addEventListener('change', trackChange, true);
    ['pointerdown', 'keydown', 'touchstart'].forEach(name => {
      document.addEventListener(name, markActivity, { passive: true });
    });
    window.addEventListener('scroll', () => {
      markActivity();
      trackScrollDepth();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      updateActiveTime();
      if (document.hidden) flush({ beacon: true });
    });
    window.addEventListener('pagehide', () => flush({ beacon: true }));
  }

  function enableTracking(consentWasJustGranted = false) {
    if (enabled) return;
    enabled = true;
    visitorId = getOrCreateId(localStorage, VISITOR_KEY);
    sessionId = randomId();
    safeStorage(sessionStorage, 'set', SESSION_KEY, sessionId);
    sessionStartedAt = Date.now();
    lastActivityAt = Date.now();
    lastActiveTick = performance.now();

    bindTrackingEvents();
    activeTimer = window.setInterval(updateActiveTime, 1000);
    flushTimer = window.setInterval(() => flush(), FLUSH_INTERVAL_MS);

    if (consentWasJustGranted) {
      recordEvent('consent_granted', { target: CONSENT_VERSION });
    }
    recordEvent('page_view', { target: location.pathname || '/' });
    recordEvent('module_view', { module: currentModule(), target: 'initial' });
    window.setTimeout(() => flush(), 350);
  }

  function disableTracking() {
    enabled = false;
    queue = [];
    if (flushTimer) window.clearInterval(flushTimer);
    if (activeTimer) window.clearInterval(activeTimer);
    flushTimer = null;
    activeTimer = null;
    safeStorage(localStorage, 'remove', VISITOR_KEY);
    safeStorage(sessionStorage, 'remove', SESSION_KEY);
  }

  function bindConsentControls() {
    const accept = document.getElementById('btnAnalyticsAccept');
    const decline = document.getElementById('btnAnalyticsDecline');
    const settings = document.getElementById('btnPrivacySettings');

    if (accept) {
      accept.addEventListener('click', () => {
        setConsent('accepted');
        hideConsent();
        enableTracking(true);
      });
    }

    if (decline) {
      decline.addEventListener('click', () => {
        setConsent('declined');
        disableTracking();
        hideConsent();
      });
    }

    if (settings) settings.addEventListener('click', showConsent);
  }

  function init() {
    bindConsentControls();
    const consent = getConsent();
    if (consent && consent.status === 'accepted') {
      enableTracking(false);
    } else if (!consent && navigator.globalPrivacyControl === true) {
      setConsent('declined');
    } else if (!consent) {
      showConsent();
    }
  }

  return { init, flush };
})();

document.addEventListener('DOMContentLoaded', PowerOmegaAnalytics.init);
