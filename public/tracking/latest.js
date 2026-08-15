/*!
 * Vendus Tracking SDK v1
 * Captura UTMs, click ids, First/Last Touch e identifica leads em páginas externas.
 * Endpoint: <SUPABASE_URL>/functions/v1/tracking-collect
 */
(function () {
  'use strict';
  if (window.VendusTracking && window.VendusTracking.__loaded) return;

  var SUPABASE_URL = 'https://syvhrtaksjcvhrzhbltt.supabase.co';
  var ENDPOINT = SUPABASE_URL + '/functions/v1/tracking-collect';
  var STORAGE = {
    visitor: 'vnd_visitor_id',
    session: 'vnd_session_id',
    sessionAt: 'vnd_session_at',
    first: 'vnd_first_touch',
    last: 'vnd_last_touch',
    queue: 'vnd_queue',
    lead: 'vnd_lead',
  };
  var SESSION_TTL = 30 * 60 * 1000; // 30 min

  // Descobre a tag <script> que carregou o SDK e lê o data-vendus-key
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || '').indexOf('tracking') !== -1 && scripts[i].getAttribute('data-vendus-key')) return scripts[i];
    }
    return null;
  })();

  var config = {
    key: currentScript ? currentScript.getAttribute('data-vendus-key') : null,
    autoInit: !currentScript || currentScript.getAttribute('data-vendus-auto-init') !== 'false',
    bridgePixel: !currentScript || currentScript.getAttribute('data-vendus-bridge-pixel') !== 'false',
  };

  function safe(fn) { try { return fn(); } catch (e) { console.debug('[Vendus]', e); return null; } }
  function uuid() {
    return safe(function () { return crypto.randomUUID(); }) ||
      'vnd-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }
  function getStore(k) { return safe(function () { return localStorage.getItem(k); }); }
  function setStore(k, v) { return safe(function () { localStorage.setItem(k, v); }); }
  function getJson(k, def) { var v = getStore(k); if (!v) return def; return safe(function () { return JSON.parse(v); }) || def; }
  function setJson(k, v) { setStore(k, JSON.stringify(v)); }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function parsePipe(v) {
    if (!v || v.indexOf('|') === -1) return { raw: v };
    var parts = v.split('|');
    return { raw: v, name: parts[0], id: parts[1] };
  }

  function collectTouch() {
    var qs = new URLSearchParams(location.search);
    var get = function (k) { return qs.get(k) || undefined; };
    var fbclid = get('fbclid');
    var fbc = readCookie('_fbc') || (fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : undefined);
    var fbp = readCookie('_fbp') || undefined;
    var utm_campaign = parsePipe(get('utm_campaign'));
    var utm_medium = parsePipe(get('utm_medium'));
    var utm_content = parsePipe(get('utm_content'));
    return {
      utm_source: get('utm_source'),
      utm_medium: utm_medium.raw,
      utm_campaign: utm_campaign.raw,
      utm_content: utm_content.raw,
      utm_term: get('utm_term'),
      utm_id: get('utm_id'),
      campaign_name: utm_campaign.name,
      campaign_id: utm_campaign.id,
      adset_name: utm_medium.name,
      adset_id: utm_medium.id,
      ad_name: utm_content.name,
      ad_id: utm_content.id,
      fbclid: fbclid,
      gclid: get('gclid'),
      ttclid: get('ttclid'),
      msclkid: get('msclkid'),
      li_fat_id: get('li_fat_id'),
      fbc: fbc,
      fbp: fbp,
      landing_page: location.href,
      referrer: document.referrer || undefined,
      hostname: location.hostname,
      captured_at: new Date().toISOString(),
    };
  }

  function hasAttribution(t) {
    return !!(t && (t.utm_source || t.utm_campaign || t.fbclid || t.gclid || t.ttclid || t.msclkid));
  }

  function ensureVisitor() {
    var vid = getStore(STORAGE.visitor);
    if (!vid) { vid = 'vnd_vis_' + uuid().replace(/-/g, '').slice(0, 16); setStore(STORAGE.visitor, vid); }
    return vid;
  }

  function ensureSession() {
    var now = Date.now();
    var sid = getStore(STORAGE.session);
    var last = parseInt(getStore(STORAGE.sessionAt) || '0', 10);
    if (!sid || !last || now - last > SESSION_TTL) {
      sid = 'vnd_ses_' + uuid().replace(/-/g, '').slice(0, 16);
      setStore(STORAGE.session, sid);
    }
    setStore(STORAGE.sessionAt, String(now));
    return sid;
  }

  function ensureTouches() {
    var touch = collectTouch();
    var first = getJson(STORAGE.first, null);
    if (!first) { setJson(STORAGE.first, touch); first = touch; }
    var last = hasAttribution(touch) ? touch : getJson(STORAGE.last, first);
    setJson(STORAGE.last, last);
    return { first: first, last: last };
  }

  function currentPagePayload() {
    return { url: location.href, title: document.title, referrer: document.referrer, hostname: location.hostname };
  }

  function enqueue(payload) {
    var q = getJson(STORAGE.queue, []);
    q.push(payload); if (q.length > 50) q = q.slice(-50);
    setJson(STORAGE.queue, q);
  }
  function drainQueue() {
    var q = getJson(STORAGE.queue, []);
    if (!q.length) return;
    setJson(STORAGE.queue, []);
    q.forEach(function (p) { send(p, true); });
  }

  function send(payload, isReplay) {
    var body = JSON.stringify(payload);
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: 'application/json' });
        sent = navigator.sendBeacon(ENDPOINT, blob);
      } catch (e) { /* noop */ }
    }
    if (!sent) {
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body, keepalive: true, mode: 'cors',
        }).catch(function () { if (!isReplay) enqueue(payload); });
      } catch (e) {
        if (!isReplay) enqueue(payload);
      }
    }
  }

  function buildBase(type, eventName, properties, options) {
    var touches = ensureTouches();
    options = options || {};
    return {
      type: type,
      organization_key: config.key,
      visitor_id: ensureVisitor(),
      session_id: ensureSession(),
      event_id: String(options.event_id || options.eventID || uuid()),
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      url: location.href,
      hostname: location.hostname,
      referrer: document.referrer || null,
      first_touch: touches.first,
      last_touch: touches.last,
      page: currentPagePayload(),
      meta: { fbp: touches.last.fbp || null, fbc: touches.last.fbc || null, fbclid: touches.last.fbclid || null },
      properties: properties || {},
    };
  }

  // ---------- Auto-identify helpers ----------
  var EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  var PHONE_RE = /(\+?\d[\d\s().-]{7,})/;

  function extractLeadFromParams(params) {
    if (!params || typeof params !== 'object') return null;
    var email = params.email || params.em || params.user_email || null;
    var phone = params.phone || params.ph || params.whatsapp || params.telefone || null;
    var name = params.name || params.nome || params.fn || params.full_name || null;
    if (!email && !phone) return null;
    return {
      email: email ? String(email) : null,
      phone: phone ? String(phone) : null,
      name: name ? String(name) : null,
    };
  }

  function scanNearbyLead(el) {
    try {
      var root = (el && el.closest && (el.closest('form') || el.closest('section') || el.closest('main'))) || document;
      var text = (root.innerText || '').slice(0, 4000);
      var out = {};
      var em = text.match(EMAIL_RE); if (em) out.email = em[0];
      // Do not scrape phone from arbitrary text — evita capturar telefone da empresa. Só busca em inputs.
      var inputs = root.querySelectorAll ? root.querySelectorAll('input, textarea') : [];
      for (var i = 0; i < inputs.length; i++) {
        var v = (inputs[i].value || '').trim(); if (!v) continue;
        var n = ((inputs[i].name || '') + ' ' + (inputs[i].id || '') + ' ' + (inputs[i].placeholder || '')).toLowerCase();
        if (!out.email && EMAIL_RE.test(v)) out.email = v.match(EMAIL_RE)[0];
        if (!out.phone && (n.indexOf('phone') !== -1 || n.indexOf('tel') !== -1 || n.indexOf('whats') !== -1) && PHONE_RE.test(v)) out.phone = v;
        if (!out.name && (n.indexOf('name') !== -1 || n.indexOf('nome') !== -1) && v.length > 1) out.name = v;
      }
      return (out.email || out.phone) ? out : null;
    } catch (e) { return null; }
  }

  function rememberLead(lead, options) {
    if (!lead || (!lead.email && !lead.phone)) return;
    var prev = getJson(STORAGE.lead, {});
    var next = { email: lead.email || prev.email || null, phone: lead.phone || prev.phone || null, name: lead.name || prev.name || null };
    // Só reidentifica se algo mudou
    if (prev.email === next.email && prev.phone === next.phone && prev.name === next.name) return;
    setJson(STORAGE.lead, next);
    api.identify(next, options);
  }

  var api = {
    __loaded: true,
    _initialized: false,
    init: function () {
      if (!config.key) { console.debug('[Vendus] data-vendus-key ausente'); return; }
      if (this._initialized) return;
      this._initialized = true;
      ensureTouches();
      drainQueue();
      this.track('PageView');
      // SPA
      ['pushState', 'replaceState'].forEach(function (m) {
        var orig = history[m];
        history[m] = function () { var r = orig.apply(this, arguments); setTimeout(function () { api.track('PageView'); }, 0); return r; };
      });
      window.addEventListener('popstate', function () { api.track('PageView'); });
      bindForms();
      bindWhatsApp();
      if (config.bridgePixel) bridgePixel();
    },
    getData: function () {
      var t = ensureTouches();
      return {
        visitor_id: ensureVisitor(),
        session_id: ensureSession(),
        first_touch: t.first,
        last_touch: t.last,
        current_page: location.href,
        referrer: document.referrer,
        fbp: t.last.fbp || null,
        fbc: t.last.fbc || null,
      };
    },
    getVisitorId: ensureVisitor,
    getSessionId: ensureSession,
    track: function (name, props, options) {
      if (!config.key || !name) return;
      var type = name === 'PageView' ? 'page_view' : 'event';
      var payload = buildBase(type, name, props, options);
      send(payload);
      return payload.event_id;
    },
    identify: function (lead, options) {
      if (!config.key || !lead) return;
      options = options || {};
      var eventName = options.event_name || options.eventName || 'Lead';
      var payload = buildBase('identify', eventName, options.properties, options);
      payload.lead = {
        name: lead.name || null, email: lead.email || null,
        phone: lead.phone || null, external_id: lead.external_id || null,
      };
      setJson(STORAGE.lead, payload.lead);
      send(payload);
      return payload.event_id;
    },
    reset: function () {
      [STORAGE.visitor, STORAGE.session, STORAGE.sessionAt, STORAGE.first, STORAGE.last, STORAGE.queue, STORAGE.lead]
        .forEach(function (k) { safe(function () { localStorage.removeItem(k); }); });
    },
  };

  function bindForms() {
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.matches || !form.matches('form[data-vendus-form]')) return;
      var data = new FormData(form);
      var lead = {
        name: (data.get('name') || data.get('nome') || '').toString() || null,
        email: (data.get('email') || data.get('e-mail') || '').toString() || null,
        phone: (data.get('phone') || data.get('telefone') || data.get('whatsapp') || '').toString() || null,
      };
      rememberLead(lead);
      api.track('FormSubmit', { form_id: form.id || null });
    }, true);
  }

  function bindWhatsApp() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/wa\.me|api\.whatsapp\.com|^whatsapp:/i.test(href)) {
        var nearby = scanNearbyLead(a);
        if (nearby) rememberLead(nearby);
        api.track('WhatsAppClick', { href: href, text: (a.innerText || '').slice(0, 100) });
      }
    }, true);
  }

  // ---------- Bridge Meta Pixel (fbq) ----------
  function bridgePixel() {
    var attempts = 0;
    var maxAttempts = 40; // ~20s (500ms cada)
    var wrap = function () {
      attempts++;
      var fbq = window.fbq;
      if (!fbq || fbq.__vendusWrapped) {
        if (attempts < maxAttempts && !(fbq && fbq.__vendusWrapped)) setTimeout(wrap, 500);
        return;
      }
      try {
        var original = fbq;
        var wrapped = function () {
          try { original.apply(this, arguments); } catch (e) { /* noop */ }
          try {
            var args = Array.prototype.slice.call(arguments);
            var cmd = args[0];
            if (cmd === 'track' || cmd === 'trackCustom' || cmd === 'trackSingle' || cmd === 'trackSingleCustom') {
              var offset = (cmd === 'trackSingle' || cmd === 'trackSingleCustom') ? 2 : 1;
              var name = args[offset];
              var params = args[offset + 1] || {};
              var opts = args[offset + 2] || {};
              if (!name || name === 'PageView') return; // PageView já é enviado pelo SDK
              var lead = extractLeadFromParams(params);
              if (lead) rememberLead(lead);
              var payload = buildBase('event', String(name), Object.assign({}, params, { source: 'pixel_bridge' }), opts);
              send(payload);
            }
          } catch (e) { console.debug('[Vendus bridge]', e); }
        };
        // Preserva propriedades do fbq original (queue, loaded, version, callMethod)
        for (var k in original) { try { wrapped[k] = original[k]; } catch (e) { /* noop */ } }
        wrapped.__vendusWrapped = true;
        window.fbq = wrapped;
        if (window._fbq === original) window._fbq = wrapped;
      } catch (e) { console.debug('[Vendus bridge] wrap failed', e); }
    };
    wrap();
  }

  window.VendusTracking = api;
  if (config.autoInit && document.readyState !== 'loading') api.init();
  else if (config.autoInit) document.addEventListener('DOMContentLoaded', function () { api.init(); });
})();
