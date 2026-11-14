(function () {
  'use strict';

  if (window.__chatProLoaded) return;
  window.__chatProLoaded = true;

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName('script');
    script = scripts[scripts.length - 1];
  }
  if (!script) return;

  var widgetId = script.getAttribute('data-chatbot-id');
  if (!widgetId) {
    console.error('[ChatPro] Missing data-chatbot-id attribute.');
    return;
  }

  // Built-in production API base. The data-api-url attribute on the script
  // tag overrides this (e.g. for local development against 127.0.0.1).
  var DEFAULT_API_URL = 'https://webdesignbd.click';

  var baseUrl = script.getAttribute('data-api-url') || DEFAULT_API_URL;

  var STATE = {
    config: null,
    conversationId: null,
    visitorToken: null,
    sessionToken: null,
    messages: [],
    sending: false,
    open: false,
  };

  try {
    var stored = localStorage.getItem('chatpro_session_' + widgetId);
    if (stored) {
      var parsed = JSON.parse(stored);
      STATE.conversationId = parsed.conversationId || null;
      STATE.visitorToken = parsed.visitorToken || null;
      STATE.sessionToken = parsed.sessionToken || null;
      STATE.messages = parsed.messages || [];
    }
  } catch (e) {
    /* localStorage unavailable; ignore */
  }

  function persist() {
    try {
      localStorage.setItem('chatpro_session_' + widgetId, JSON.stringify({
        sessionToken: STATE.sessionToken,
        conversationId: STATE.conversationId,
        visitorToken: STATE.visitorToken,
        messages: STATE.messages.slice(-40),
      }));
    } catch (e) {
      /* ignore */
    }
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }, options.headers || {});
    return fetch(baseUrl.replace(/\/$/, '') + path, options).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      }).catch(function () {
        return { ok: res.ok, status: res.status, body: {} };
      });
    });
  }

  // --- Shadow DOM host ------------------------------------------------------
  var host = document.createElement('div');
  host.setAttribute('data-chatpro-widget', widgetId);
  host.style.all = 'initial';
  document.body.appendChild(host);

  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
  var root = shadow || host;

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:var(--cp-font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);}',
    '.cp-launcher{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:2147483000;transition:transform .15s ease;}',
    '.cp-launcher:hover{transform:scale(1.05);}',
    '.cp-launcher.cp-left{left:20px;right:auto;}',
    '.cp-panel{position:fixed;bottom:92px;right:20px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.24);display:flex;flex-direction:column;overflow:hidden;z-index:2147483001;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease;}',
    '.cp-panel.cp-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}',
    '.cp-panel.cp-left{left:20px;right:auto;}',
    '.cp-header{padding:16px;color:#fff;display:flex;align-items:center;gap:12px;}',
    '.cp-header .cp-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:700;}',
    '.cp-header .cp-title{font-size:15px;font-weight:600;line-height:1.2;}',
    '.cp-header .cp-subtitle{font-size:12px;opacity:.85;}',
    '.cp-header .cp-actions{margin-left:auto;display:flex;gap:6px;}',
    '.cp-btn{background:transparent;border:none;color:inherit;cursor:pointer;padding:6px;border-radius:6px;line-height:0;}',
    '.cp-btn:hover{background:rgba(255,255,255,.18);}',
    '.cp-body{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;}',
    '.cp-msg{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;}',
    '.cp-msg.cp-user{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;}',
    '.cp-msg.cp-bot{align-self:flex-start;background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-bottom-left-radius:4px;}',
    '.cp-msg.cp-error{background:#fef2f2;color:#b91c1c;border-color:#fecaca;}',
    '.cp-msg a{color:inherit;text-decoration:underline;}',
    '.cp-commerce{margin-top:10px;display:flex;flex-direction:column;gap:8px;white-space:normal;}',
    '.cp-product-card{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fff;}',
    '.cp-product-img{width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;}',
    '.cp-product-info{flex:1;min-width:0;font-size:13px;}.cp-product-price{display:block;color:#64748b;font-size:12px;}',
    '.cp-variant-select{margin-top:4px;width:100%;font-size:12px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;font-family:inherit;}',
    '.cp-order-btn{border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;color:#fff;background:#6366f1;cursor:pointer;font-family:inherit;flex-shrink:0;}',
    '.cp-order-btn:hover{background:#4338ca;}',
    '.cp-commerce-note{margin-top:8px;border:1px solid #e2e8f0;border-left-width:3px;border-radius:8px;padding:8px 10px;font-size:13px;background:#f0fdf4;white-space:normal;}',
    '.cp-msg code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px;font-family:monospace;font-size:13px;}',
    '.cp-suggestions{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 8px;background:#f8fafc;}',
    '.cp-chip{border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;}',
    '.cp-chip:hover{border-color:#94a3b8;}',
    '.cp-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;}',
    '.cp-dot{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:cp-bounce 1.2s infinite;}',
    '.cp-dot:nth-child(2){animation-delay:.15s;}',
    '.cp-dot:nth-child(3){animation-delay:.3s;}',
    '@keyframes cp-bounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-4px);opacity:1;}}',
    '.cp-footer{border-top:1px solid #e2e8f0;padding:10px;background:#fff;}',
    '.cp-inputrow{display:flex;gap:8px;align-items:flex-end;}',
    '.cp-input{flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:14px;resize:none;max-height:110px;outline:none;line-height:1.4;font-family:inherit;}',
    '.cp-input:focus{border-color:#94a3b8;}',
    '.cp-send{border:none;border-radius:12px;width:42px;height:42px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    '.cp-send:disabled{opacity:.5;cursor:not-allowed;}',
    '.cp-handoff{display:block;width:100%;margin-top:8px;padding:9px 12px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;}',
    '.cp-handoff:hover{border-color:#94a3b8;color:#1e293b;}',
    '.cp-handoff:disabled{opacity:.6;cursor:not-allowed;}',
    '.cp-branding{text-align:center;font-size:11px;color:#94a3b8;padding:6px 0 2px;}',
    '.cp-branding a{color:#64748b;text-decoration:none;}',
    '@media (max-width:480px){.cp-panel{right:0;left:0;bottom:0;width:100%;height:100%;max-height:100%;border-radius:0;}.cp-panel.cp-left{left:0;}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}',
  ].join('');
  root.appendChild(style);

  var wrap = document.createElement('div');
  root.appendChild(wrap);

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Only allow http(s) product images; anything else (javascript:, data:,
   * relative paths from untrusted payloads) is dropped.
   */
  function safeImageUrl(url) {
    return /^https?:\/\//i.test(String(url || '')) ? escapeHtml(String(url)) : '';
  }

  // Minimal, safe markdown: bold, italic, inline code, links, line breaks.
  function renderMarkdown(text) {
    var safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer nofollow">' + label + '</a>';
    });
    return safe;
  }

  var launcher, panel, body, input, sendBtn, suggestionsEl, handoffBtn;

  function iconChat() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  }
  function iconClose() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  }
  function iconMinus() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  }
  function iconSend() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  }

  function colors(config) {
    var c = (config && config.appearance) || {};
    return {
      theme: c.theme_color || '#6366f1',
      text: c.text_color || null,
      position: c.position || 'bottom-right',
      font: c.font_family || null,
    };
  }

  function applyTheme(config) {
    var col = colors(config);
    host.style.setProperty('--cp-font', col.font || '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif');
    var left = col.position === 'bottom-left';
    host.setAttribute('data-position', left ? 'left' : 'right');
    return { col: col, left: left };
  }

  function renderMessages() {
    body.innerHTML = '';

    if (STATE.messages.length === 0 && STATE.config) {
      var welcome = STATE.config.chatbot.welcome_message;
      if (welcome) {
        body.appendChild(bubble('bot', welcome));
      }
    }

    STATE.messages.forEach(function (m) {
      body.appendChild(bubble(m.role === 'user' ? 'user' : 'bot', m.content, m.status, m.commerce));
    });

    if (STATE.sending) {
      var typing = el('div', { class: 'cp-typing' }, [
        el('span', { class: 'cp-dot' }),
        el('span', { class: 'cp-dot' }),
        el('span', { class: 'cp-dot' }),
      ]);
      body.appendChild(typing);
    }

    body.scrollTop = body.scrollHeight;
  }

  function bubble(who, text, status, commerce) {
    var cls = 'cp-msg ' + (who === 'user' ? 'cp-user' : 'cp-bot');
    if (status === 'error') cls += ' cp-error';
    var node = el('div', { class: cls });
    node.innerHTML = renderMarkdown(text);
    if (who === 'user') {
      node.style.background = colors(STATE.config).theme;
    }
    if (Array.isArray(commerce) && commerce.length) {
      commerce.forEach(function (payload) {
        var html = commerceHtml(payload);
        if (html) node.appendChild(html);
      });
    }
    return node;
  }

  // Commerce payloads from the AI agent: product cards, order receipt, lead note.
  function commerceHtml(payload) {
    if (!payload || !payload.type) return null;
    var theme = colors(STATE.config).theme;

    if (payload.type === 'show_products' && Array.isArray(payload.products)) {
      var wrap = el('div', { class: 'cp-commerce' });
      payload.products.forEach(function (p) {
        var card = el('div', { class: 'cp-product-card' });
        var price = '৳' + Number(p.price).toFixed(2);
        var stock = p.stock === null || p.stock === undefined ? '' : (p.stock > 0 ? ' · ' + p.stock + ' in stock' : ' · out of stock');
        var inner = '';
        if (p.image) inner += '<img src="' + safeImageUrl(p.image) + '" alt="" class="cp-product-img">';
        inner += '<div class="cp-product-info"><strong>' + escapeHtml(p.name) + '</strong>' +
          '<span class="cp-product-price">' + price + stock + '</span>';
        if (p.variants && p.variants.length) {
          var label = p.variant_label || 'Variant';
          inner += '<select class="cp-variant-select">';
          p.variants.forEach(function (v) {
            inner += '<option value="' + escapeHtml(String(v.id)) + '">' + escapeHtml(v.name) + ' — ৳' + Number(v.price).toFixed(2) + '</option>';
          });
          inner += '</select>';
        }
        inner += '</div>';
        card.innerHTML = inner + '<button type="button" class="cp-order-btn">Order</button>';
        card.querySelector('.cp-order-btn').addEventListener('click', function () {
          var sel = card.querySelector('.cp-variant-select');
          var msg = 'I want to order product #' + p.id;
          if (sel) msg += ' (variant ' + sel.value + ')';
          input.value = msg;
          if (sendBtn) sendBtn.focus();
        });
        wrap.appendChild(card);
      });
      return wrap;
    }

    if (payload.type === 'order_placed' && payload.order) {
      var receipt = el('div', { class: 'cp-commerce-note' });
      receipt.innerHTML = '<strong>✅ Order ' + escapeHtml(payload.order.number) + ' placed</strong><br>' +
        'Total: ৳' + Number(payload.order.total).toFixed(2) + ' — we will contact you shortly.';
      receipt.style.borderColor = theme;
      return receipt;
    }

    if (payload.type === 'lead_captured') {
      var note = el('div', { class: 'cp-commerce-note' });
      note.innerHTML = '<strong>✓ Your details were saved.</strong> Our team will follow up soon.';
      note.style.borderColor = theme;
      return note;
    }

    return null;
  }

  function renderSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = '';
    if (!STATE.config || STATE.messages.length > 0) return;
    var qs = STATE.config.chatbot.suggested_questions || [];
    if (!qs.length) return;
    qs.forEach(function (q) {
      suggestionsEl.appendChild(el('button', {
        class: 'cp-chip',
        type: 'button',
        text: q,
        onclick: function () { send(q); },
      }));
    });
  }

  function build() {
    var config = STATE.config;
    var theme = colors(config);
    var left = theme.position === 'bottom-left';

    launcher = el('button', {
      class: 'cp-launcher' + (left ? ' cp-left' : ''),
      'aria-label': 'Open chat',
      type: 'button',
      html: iconChat(),
      onclick: toggle,
    });
    launcher.style.background = theme.theme;

    panel = el('div', {
      class: 'cp-panel' + (left ? ' cp-left' : ''),
      role: 'dialog',
      'aria-label': config.chatbot.name || 'Chat',
    });

    var header = el('div', { class: 'cp-header' });
    header.style.background = theme.theme;
    header.appendChild(el('div', { class: 'cp-avatar', text: (config.chatbot.name || 'A').charAt(0).toUpperCase() }));
    var headText = el('div');
    headText.appendChild(el('div', { class: 'cp-title', text: config.chatbot.name || 'Assistant' }));
    if (config.chatbot.subtitle) {
      headText.appendChild(el('div', { class: 'cp-subtitle', text: config.chatbot.subtitle }));
    }
    header.appendChild(headText);
    var actions = el('div', { class: 'cp-actions' });
    actions.appendChild(el('button', { class: 'cp-btn', type: 'button', 'aria-label': 'Minimize', html: iconMinus(), onclick: toggle }));
    actions.appendChild(el('button', { class: 'cp-btn', type: 'button', 'aria-label': 'Close', html: iconClose(), onclick: toggle }));
    header.appendChild(actions);

    body = el('div', { class: 'cp-body' });
    suggestionsEl = el('div', { class: 'cp-suggestions' });

    var footer = el('div', { class: 'cp-footer' });
    var row = el('div', { class: 'cp-inputrow' });
    input = el('textarea', {
      class: 'cp-input',
      rows: '1',
      placeholder: 'Type your message...',
      'aria-label': 'Message',
      onkeydown: function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send(input.value);
        }
      },
    });
    sendBtn = el('button', {
      class: 'cp-send',
      type: 'button',
      'aria-label': 'Send message',
      html: iconSend(),
      onclick: function () { send(input.value); },
    });
    sendBtn.style.background = theme.theme;
    row.appendChild(input);
    row.appendChild(sendBtn);
    footer.appendChild(row);

    if (config.chatbot.human_handoff_enabled) {
      handoffBtn = el('button', {
        class: 'cp-handoff',
        type: 'button',
        text: 'Talk to a human',
        onclick: requestHandoff,
      });
      footer.appendChild(handoffBtn);
    }

    if (config.chatbot.show_branding !== false) {
      footer.appendChild(el('div', { class: 'cp-branding', html: 'Powered by <a href="' + baseUrl + '" target="_blank" rel="noopener">ChatPro AI</a>' }));
    }

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(suggestionsEl);
    panel.appendChild(footer);

    wrap.appendChild(panel);
    wrap.appendChild(launcher);

    renderMessages();
    renderSuggestions();
  }

  function toggle() {
    STATE.open = !STATE.open;
    panel.classList.toggle('cp-open', STATE.open);
    launcher.setAttribute('aria-label', STATE.open ? 'Close chat' : 'Open chat');
    if (STATE.open) {
      setTimeout(function () { input && input.focus(); }, 60);
      if (!STATE.conversationId && STATE.messages.length === 0) {
        ensureConversation();
      }
    }
  }

  function ensureConversation() {
    if (STATE.conversationId) return Promise.resolve(true);
    return api('/api/v1/widget/' + encodeURIComponent(widgetId) + '/conversations', {
      method: 'POST',
      body: JSON.stringify({ session_token: STATE.sessionToken }),
    })
      .then(function (res) {
        if (res.ok && res.body.data) {
          STATE.conversationId = res.body.data.conversation_id;
          STATE.visitorToken = res.body.data.visitor_token;
          if (res.body.data.welcome_message && STATE.config) {
            STATE.config.chatbot.welcome_message = res.body.data.welcome_message;
          }
          persist();
          return true;
        }
        pushError('Unable to start a conversation. Please try again later.');
        return false;
      })
      .catch(function () {
        pushError('Network error. Please check your connection.');
        return false;
      });
  }

  // Create/resume the widget session; adopts any still-open conversation so
  // history survives reloads, tabs and (within the session TTL) browsers.
  function ensureSession() {
    return api('/api/v1/widget/' + encodeURIComponent(widgetId) + '/session', {
      method: 'POST',
      body: JSON.stringify({ session_token: STATE.sessionToken }),
    }).then(function (res) {
      if (res.ok && res.body.data && res.body.data.session) {
        STATE.sessionToken = res.body.data.session.token;
        var convo = res.body.data.conversation;
        if (convo && !STATE.conversationId) {
          STATE.conversationId = convo.id;
          STATE.visitorToken = convo.visitor_token;
          return loadHistory();
        }
        persist();
      }
      return true;
    }).catch(function () {
      return false; // Session layer is additive; chat must keep working.
    });
  }

  function loadHistory() {
    if (!STATE.conversationId || !STATE.visitorToken) return Promise.resolve(false);
    return api(
      '/api/v1/widget/' + encodeURIComponent(widgetId) + '/messages'
      + '?conversation_id=' + encodeURIComponent(STATE.conversationId),
      { headers: { 'X-Visitor-Token': STATE.visitorToken } }
    ).then(function (res) {
      if (res.ok && res.body.data && res.body.data.messages) {
        STATE.messages = res.body.data.messages.map(function (m) {
          return { role: m.role, content: m.content, status: m.status };
        });
        renderMessages();
        persist();
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  function pushError(text) {
    STATE.messages.push({ role: 'assistant', content: text, status: 'error' });
    renderMessages();
    persist();
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || STATE.sending) return;

    STATE.messages.push({ role: 'user', content: text });
    persist();
    input.value = '';
    STATE.sending = true;
    renderMessages();
    renderSuggestions();

    ensureConversation().then(function (ready) {
      if (!ready) {
        STATE.sending = false;
        renderMessages();
        return;
      }
      var idempotencyKey = 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      var wantsStream = STATE.config && STATE.config.chatbot && STATE.config.chatbot.streaming_enabled;
      var payload = {
        conversation_id: STATE.conversationId,
        visitor_token: STATE.visitorToken,
        message: text,
        idempotency_key: idempotencyKey,
      };

      if (wantsStream && typeof ReadableStream !== 'undefined') {
        streamRequest(payload, text);
      } else {
        jsonRequest(payload, text);
      }
    });
  }

  function requestHandoff() {
    if (STATE.sending) return;
    STATE.sending = true;
    if (handoffBtn) {
      handoffBtn.disabled = true;
      handoffBtn.textContent = 'Requesting…';
    }

    ensureConversation().then(function (ready) {
      if (!ready) {
        STATE.sending = false;
        resetHandoffBtn();
        return;
      }

      api('/api/v1/widget/' + encodeURIComponent(widgetId) + '/handoff', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: STATE.conversationId,
          visitor_token: STATE.visitorToken,
        }),
      }).then(function (res) {
        STATE.sending = false;
        resetHandoffBtn();
        var message = 'Thanks — a member of our team will reach out to you shortly.';
        if (res.ok && res.body.data && res.body.data.handoff && res.body.data.handoff.message) {
          message = res.body.data.handoff.message;
        } else if (res.body && res.body.error && res.body.error.message) {
          message = res.body.error.message;
        }
        STATE.messages.push({ role: 'assistant', content: message });
        renderMessages();
        persist();
      }).catch(function () {
        STATE.sending = false;
        resetHandoffBtn();
        pushError('Network error. Please try again.');
      });
    });
  }

  function resetHandoffBtn() {
    if (handoffBtn) {
      handoffBtn.disabled = false;
      handoffBtn.textContent = 'Talk to a human';
    }
  }

  function jsonRequest(payload, text) {
    api('/api/v1/widget/' + encodeURIComponent(widgetId) + '/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (res) {
      STATE.sending = false;
      if (res.ok && res.body.data && res.body.data.reply) {
        STATE.messages.push({ role: 'assistant', content: res.body.data.reply, commerce: (res.body.data.commerce || []) });
      } else if (res.body && res.body.error) {
        var reply = res.body.error.reply || res.body.error.message || 'Something went wrong.';
        STATE.messages.push({ role: 'assistant', content: reply, status: 'error' });
        STATE.lastFailed = text;
      } else {
        STATE.messages.push({ role: 'assistant', content: 'Something went wrong. Please try again.', status: 'error' });
        STATE.lastFailed = text;
      }
      renderMessages();
      persist();
    }).catch(function () {
      STATE.sending = false;
      STATE.messages.push({ role: 'assistant', content: 'Network error. Please retry.', status: 'error' });
      STATE.lastFailed = text;
      renderMessages();
    });
  }

  function streamRequest(payload, text) {
    var placeholder = { role: 'assistant', content: '' };
    STATE.messages.push(placeholder);

    fetch(baseUrl.replace(/\/$/, '') + '/api/v1/widget/' + encodeURIComponent(widgetId) + '/messages/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok || !res.body) {
        throw new Error('Stream unavailable');
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            STATE.sending = false;
            if (placeholder.content === '') {
              placeholder.content = 'Something went wrong. Please try again.';
              placeholder.status = 'error';
              STATE.lastFailed = text;
            }
            renderMessages();
            persist();
            return;
          }

          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();

          var event = null;
          lines.forEach(function (line) {
            line = line.trim();
            if (line.indexOf('event:') === 0) {
              event = line.slice(6).trim();
            } else if (line.indexOf('data:') === 0) {
              var raw = line.slice(5).trim();
              var data = {};
              try { data = JSON.parse(raw); } catch (e) { data = {}; }
              if (event === 'delta' && data.text) {
                placeholder.content += data.text;
                renderMessages();
              } else if (event === 'error') {
                placeholder.content = placeholder.content || (data.message || 'Something went wrong.');
                placeholder.status = 'error';
                STATE.lastFailed = text;
              }
            }
          });

          return pump();
        });
      }

      return pump();
    }).catch(function () {
      // Fall back to the non-streaming endpoint on any stream failure.
      STATE.messages.pop();
      renderMessages();
      jsonRequest(payload, text);
    });
  }

  function init() {
    api('/api/v1/widget/' + encodeURIComponent(widgetId) + '/config')
      .then(function (res) {
        if (res.ok && res.body.data) {
          STATE.config = res.body.data;
          build();
          ensureSession();
        } else {
          // Degrade gracefully: do not break the host page.
          console.warn('[ChatPro] Widget unavailable:', res.body && res.body.error && res.body.error.message);
        }
      })
      .catch(function (e) {
        console.warn('[ChatPro] Failed to initialise:', e && e.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
