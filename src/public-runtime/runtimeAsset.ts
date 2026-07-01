// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated public-export copies of this runtime are available under the MIT terms in LICENCE-OUTPUT.md.

export const PUBLIC_RUNTIME_JS = String.raw`
/*! Cicada Studio public export runtime. See LICENCE-CICADA-RUNTIME.txt in this export. */
(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const genericFailure = 'The submitted value did not unlock anything.';
  const handoffParam = 'cicada-story-state';

  const normalize = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const bytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const text = (value) => decoder.decode(value);
  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  const uniquePush = (list, value) => {
    if (value && !list.includes(value)) list.push(value);
  };
  const asArray = (value) => Array.isArray(value) ? value : [];
  const normalizePath = (value) => {
    let path = decodeURIComponent(value || '').replace(/^\/+/, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    return path;
  };

  const deriveKey = async (secret, salt) => {
    const material = await crypto.subtle.importKey('raw', encoder.encode(normalize(secret)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  };

  const decrypt = async (secret, blob) => {
    try {
      const key = await deriveKey(secret, bytes(blob.salt));
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(blob.iv) }, key, bytes(blob.ciphertext));
      return text(new Uint8Array(decrypted));
    } catch {
      return null;
    }
  };

  const containsCandidates = (input) => {
    const normalized = normalize(input);
    const words = normalized.split(' ').filter(Boolean);
    const candidates = new Set([normalized]);
    for (let start = 0; start < words.length; start += 1) {
      for (let end = start + 1; end <= words.length; end += 1) {
        candidates.add(words.slice(start, end).join(' '));
      }
    }
    return [...candidates].filter(Boolean);
  };

  const readPayload = () => {
    const node = document.getElementById('arg-payload');
    if (!node?.textContent) return null;
    try {
      return JSON.parse(node.textContent);
    } catch {
      return null;
    }
  };

  const stateKey = (payload) => 'cicada-story-state:' + (payload.storyNamespace || 'default');
  const defaultState = () => ({
    schemaVersion: 2,
    flags: {},
    visitedPages: [],
    solvedEvents: [],
    unlockedPages: [],
    messenger: { threads: {} }
  });
  const loadState = (payload) => {
    try {
      const stored = localStorage.getItem(stateKey(payload));
      if (!stored) return defaultState();
      return { ...defaultState(), ...JSON.parse(stored) };
    } catch {
      return defaultState();
    }
  };
  const saveState = (payload, state) => {
    try {
      localStorage.setItem(stateKey(payload), JSON.stringify(state));
    } catch {
      // localStorage may be disabled or full; public pages still work without persistence.
    }
  };
  const threadState = (state, threadId) => {
    if (!state.messenger) state.messenger = { threads: {} };
    if (!state.messenger.threads) state.messenger.threads = {};
    if (!state.messenger.threads[threadId]) {
      state.messenger.threads[threadId] = {
        unreadCount: 0,
        deliveredNodeIds: [],
        reachedNodeIds: [],
        displayedProtectedMessages: {}
      };
    }
    return state.messenger.threads[threadId];
  };
  const safeJsonFromBase64Url = (value) => {
    try {
      const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
      return JSON.parse(text(bytes(padded)));
    } catch {
      return null;
    }
  };
  const base64UrlFromJson = (value) => {
    const raw = JSON.stringify(value);
    const encoded = btoa(String.fromCharCode(...encoder.encode(raw)));
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  const handoffSnapshot = (payload, state) => ({
    schemaVersion: 2,
    namespace: payload.storyNamespace || 'default',
    flags: state.flags || {},
    visitedPages: asArray(state.visitedPages),
    solvedEvents: asArray(state.solvedEvents),
    unlockedPages: asArray(state.unlockedPages),
    messenger: {
      threads: Object.fromEntries(
        Object.entries(state.messenger?.threads || {}).map(([threadId, thread]) => [
          threadId,
          {
            deliveredNodeIds: asArray(thread.deliveredNodeIds),
            reachedNodeIds: asArray(thread.reachedNodeIds)
          }
        ])
      )
    }
  });
  const mergeHandoffState = (payload, state, incoming) => {
    if (!incoming || incoming.namespace !== (payload.storyNamespace || 'default')) return false;
    if (incoming.flags && typeof incoming.flags === 'object') {
      for (const [key, value] of Object.entries(incoming.flags)) {
        if (typeof value === 'boolean') state.flags[key] = value;
      }
    }
    for (const pageId of asArray(incoming.visitedPages)) uniquePush(state.visitedPages, String(pageId));
    for (const eventId of asArray(incoming.solvedEvents)) uniquePush(state.solvedEvents, String(eventId));
    for (const pageId of asArray(incoming.unlockedPages)) uniquePush(state.unlockedPages, String(pageId));
    const threads = incoming.messenger?.threads || {};
    for (const [threadId, thread] of Object.entries(threads)) {
      const next = threadState(state, threadId);
      for (const nodeId of asArray(thread.deliveredNodeIds)) uniquePush(next.deliveredNodeIds, String(nodeId));
      for (const nodeId of asArray(thread.reachedNodeIds)) uniquePush(next.reachedNodeIds, String(nodeId));
    }
    return true;
  };
  const importHandoff = (payload, state) => {
    if (!location.hash || !location.hash.includes(handoffParam)) return false;
    const params = new URLSearchParams(location.hash.slice(1));
    const incoming = safeJsonFromBase64Url(params.get(handoffParam) || '');
    const merged = mergeHandoffState(payload, state, incoming);
    if (merged && history.replaceState) {
      history.replaceState(null, document.title, location.pathname + location.search);
    }
    return merged;
  };
  const currentPage = (payload) => {
    const path = normalizePath(location.pathname);
    return payload.pages.find((page) => path === page.path || path.endsWith('/' + page.path)) ||
      payload.pages.find((page) => page.path === 'index.html' && path.endsWith('index.html'));
  };
  const triggerEventId = (trigger) => {
    if (!trigger) return '';
    if (trigger.type === 'pageVisited') return 'pageVisited:' + trigger.siteId + ':' + trigger.pageId;
    if (trigger.type === 'revealSolved') return 'revealSolved:' + trigger.siteId + ':' + trigger.pageId + ':' + trigger.revealId;
    if (trigger.type === 'unlockSolved') return 'unlockSolved:' + trigger.siteId + ':' + trigger.pageId + ':' + trigger.unlockId;
    if (trigger.type === 'searchSolved') return 'searchSolved:' + trigger.searchRuleId;
    if (trigger.type === 'messengerThreadOpened') return 'messengerThreadOpened:' + trigger.threadId;
    if (trigger.type === 'messengerNodeDelivered') return 'messengerNodeDelivered:' + trigger.threadId + ':' + trigger.nodeId;
    if (trigger.type === 'messengerNodeReached') return 'messengerNodeReached:' + trigger.threadId + ':' + trigger.nodeId;
    if (trigger.type === 'messengerChoiceSelected') return 'messengerChoiceSelected:' + trigger.threadId + ':' + trigger.nodeId + ':' + trigger.choiceId;
    if (trigger.type === 'messengerInputMatched') return 'messengerInputMatched:' + trigger.threadId + ':' + trigger.nodeId + ':' + trigger.matchId;
    if (trigger.type === 'conditionReached') return 'conditionReached:' + trigger.conditionId;
    if (trigger.type === 'manual') return 'manual:' + trigger.flagId;
    return '';
  };
  let renderMessengerNow = () => {};
  const applyEffect = (payload, state, effect) => {
    if (effect.type === 'setFlag' && effect.flagId) {
      state.flags[effect.flagId] = true;
    }
    if (effect.type === 'unlockPage' && effect.pageId) {
      uniquePush(state.unlockedPages, effect.pageId);
    }
    if ((effect.type === 'deliverMessengerNode' || effect.type === 'scheduleMessengerNode') && effect.threadId && effect.nodeId) {
      const deliver = () => {
        const target = threadState(state, effect.threadId);
        if (!target.deliveredNodeIds.includes(effect.nodeId)) {
          target.deliveredNodeIds.push(effect.nodeId);
          target.unreadCount = Math.max(0, Number(target.unreadCount || 0)) + 1;
        }
        saveState(payload, state);
        recordEvent(payload, state, 'messengerNodeDelivered:' + effect.threadId + ':' + effect.nodeId);
        renderMessengerNow();
      };
      if (effect.type === 'scheduleMessengerNode' && effect.delayMs) {
        setTimeout(deliver, effect.delayMs);
      } else {
        deliver();
      }
    }
    if (effect.type === 'setMessengerUnread' && effect.threadId) {
      threadState(state, effect.threadId).unreadCount = Math.max(0, Number(effect.count || 0));
    }
    if (effect.type === 'jumpMessengerNode' && effect.threadId && effect.nodeId) {
      threadState(state, effect.threadId).currentNodeId = effect.nodeId;
    }
  };
  const applyStoryEffects = (payload, state, eventId) => {
    for (const binding of asArray(payload.storyEffects)) {
      if (triggerEventId(binding.trigger) !== eventId) continue;
      if (binding.prerequisiteMode === 'strict' && asArray(binding.requiredEventIds).some((requiredEventId) => !state.solvedEvents.includes(requiredEventId))) {
        continue;
      }
      for (const effect of asArray(binding.effects)) {
        applyEffect(payload, state, effect);
      }
    }
  };
  function recordEvent(payload, state, eventId) {
    if (!eventId) return;
    const seen = state.solvedEvents.includes(eventId);
    uniquePush(state.solvedEvents, eventId);
    if (!seen) applyStoryEffects(payload, state, eventId);
    saveState(payload, state);
  }
  const recordPageVisit = (payload, state) => {
    const page = currentPage(payload);
    if (!page) return;
    uniquePush(state.visitedPages, page.pageId);
    recordEvent(payload, state, 'pageVisited:' + page.siteId + ':' + page.pageId);
  };

  const renderMessage = (host, message, ok) => {
    const target = host.querySelector('[data-arg-result]');
    if (!target) return;
    target.className = ok ? 'arg-result ok' : 'arg-result fail';
    target.innerHTML = message;
  };

  const setupReveal = (payload, state) => {
    document.querySelectorAll('[data-arg-reveal]').forEach((host) => {
      const publicId = host.getAttribute('data-arg-reveal');
      const entries = payload.reveal.filter((item) => item.id === publicId);
      const form = host.querySelector('form');
      if (!entries.length || !form) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = new FormData(form).get('response')?.toString() ?? '';
        for (const entry of entries) {
          const html = await decrypt(input, entry);
          if (html) {
            renderMessage(host, html, true);
            recordEvent(payload, state, entry.eventId);
            return;
          }
        }
        renderMessage(host, escapeHtml(entries[0].failureMessage ?? genericFailure), false);
      });
    });
  };

  const setupUnlock = (payload, state) => {
    document.querySelectorAll('[data-arg-unlock]').forEach((host) => {
      const publicId = host.getAttribute('data-arg-unlock');
      const entries = payload.unlock.filter((item) => item.id === publicId);
      const form = host.querySelector('form');
      if (!entries.length || !form) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = new FormData(form).get('response')?.toString() ?? '';
        for (const entry of entries) {
          const html = await decrypt(input, entry);
          if (html) {
            renderMessage(host, html, true);
            recordEvent(payload, state, entry.eventId);
            return;
          }
        }
        renderMessage(host, escapeHtml(entries[0].failureMessage ?? genericFailure), false);
      });
    });
  };

  const setupSearch = (payload, state) => {
    document.querySelectorAll('[data-arg-search]').forEach((host) => {
      const form = host.querySelector('form');
      if (!form) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = new FormData(form).get('query')?.toString() ?? '';
        for (const entry of payload.search) {
          const candidates = entry.mode === 'contains' ? containsCandidates(input) : [normalize(input)];
          for (const candidate of candidates) {
            const match = await decrypt(candidate, entry);
            if (match) {
              const result = JSON.parse(match);
              recordEvent(payload, state, entry.eventId);
              renderMessage(
                host,
                '<a href="' + escapeHtml(result.path) + '">' + escapeHtml(result.title) + '</a>' +
                  (entry.hint ? '<p>' + escapeHtml(entry.hint) + '</p>' : ''),
                true
              );
              return;
            }
          }
        }
        renderMessage(host, escapeHtml(payload.genericFailure ?? genericFailure), false);
      });
    });
  };

  const setupCounters = (payload) => {
    document.querySelectorAll('[data-page-counter]').forEach((node) => {
      const current = node.getAttribute('data-page-counter');
      node.textContent = current + ' / ' + payload.pages.length;
    });
  };

  const injectMessengerStyles = () => {
    if (document.getElementById('cicada-messenger-style')) return;
    const style = document.createElement('style');
    style.id = 'cicada-messenger-style';
    style.textContent = [
      '.cicada-messenger{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172126}',
      '.cicada-messenger button,.cicada-messenger input{font:inherit}',
      '.cicada-messenger-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid #163238;background:#163238;color:#fff;border-radius:999px;padding:10px 14px;box-shadow:0 12px 28px rgba(0,0,0,.22);cursor:pointer}',
      '.cicada-messenger-count{min-width:20px;height:20px;border-radius:999px;background:#e95f3f;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}',
      '.cicada-messenger-panel{width:min(360px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 96px));display:none;grid-template-rows:auto 1fr;border:1px solid #cfd8d4;background:#f8fbf9;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);overflow:hidden}',
      '.cicada-messenger.open .cicada-messenger-panel{display:grid}',
      '.cicada-messenger.open .cicada-messenger-toggle{display:none}',
      '.cicada-messenger-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dce5e1;background:#fff}',
      '.cicada-messenger-head strong{font-size:14px}',
      '.cicada-messenger-close{border:0;background:transparent;cursor:pointer;font-size:20px;line-height:1}',
      '.cicada-messenger-body{overflow:auto;padding:12px;display:grid;gap:10px}',
      '.cicada-thread{border:1px solid #dce5e1;border-radius:10px;background:#fff;overflow:hidden}',
      '.cicada-thread-title{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #eef2ef;font-size:13px;font-weight:700}',
      '.cicada-message-list{display:grid;gap:8px;padding:10px;background:#f8fbf9}',
      '.cicada-message{max-width:84%;padding:8px 10px;border-radius:10px;background:#fff;border:1px solid #d8e1dd;font-size:14px;line-height:1.5;white-space:pre-wrap}',
      '.cicada-message.player{margin-left:auto;background:#dceee8;border-color:#bfded2}',
      '.cicada-message.system{max-width:100%;background:#f1f3f2;color:#52605b;font-size:12px;text-align:center}',
      '.cicada-message-actions,.cicada-protected form,.cicada-input form{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '.cicada-message-actions button,.cicada-protected button,.cicada-input button{border:1px solid #163238;background:#163238;color:#fff;border-radius:8px;padding:7px 10px;cursor:pointer}',
      '.cicada-protected input,.cicada-input input{min-width:0;flex:1;border:1px solid #cbd8d3;border-radius:8px;padding:7px 9px;background:#fff}',
      '.cicada-message-error{color:#b42318;font-size:12px;margin-top:6px}'
    ].join('');
    document.head.appendChild(style);
  };
  const nodeById = (thread, nodeId) => thread.nodes.find((node) => node.id === nodeId);
  const participantRole = (thread, senderId) => thread.participants.find((item) => item.id === senderId)?.role || 'character';
  const deliverNode = (payload, state, thread, nodeId, markUnread) => {
    const node = nodeById(thread, nodeId);
    if (!node) return;
    const current = threadState(state, thread.id);
    if (!current.deliveredNodeIds.includes(nodeId)) {
      current.deliveredNodeIds.push(nodeId);
      if (markUnread) current.unreadCount = Math.max(0, Number(current.unreadCount || 0)) + 1;
    }
    current.currentNodeId = nodeId;
    saveState(payload, state);
    recordEvent(payload, state, 'messengerNodeDelivered:' + thread.id + ':' + nodeId);
  };
  const renderMessengerNode = (payload, state, thread, node) => {
    const current = threadState(state, thread.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'cicada-message ' + participantRole(thread, node.senderId);
    if (node.kind === 'system' || node.kind === 'delay') wrapper.className = 'cicada-message system';
    const body = document.createElement('div');
    body.innerHTML = escapeHtml(node.body || '').replace(/\n/g, '<br>');
    wrapper.appendChild(body);
    const protectedHtml = current.displayedProtectedMessages?.[node.id];
    if (protectedHtml) {
      const revealed = document.createElement('div');
      revealed.innerHTML = protectedHtml;
      wrapper.appendChild(revealed);
    } else if (node.protectedEntries?.length) {
      const protectedBox = document.createElement('div');
      protectedBox.className = 'cicada-protected';
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'response';
      input.autocomplete = 'off';
      input.placeholder = node.protectedEntries[0].prompt || 'Key';
      const button = document.createElement('button');
      button.type = 'submit';
      button.textContent = 'Unlock';
      const error = document.createElement('div');
      error.className = 'cicada-message-error';
      form.append(input, button);
      protectedBox.append(form, error);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const inputValue = new FormData(form).get('response')?.toString() || '';
        for (const entry of node.protectedEntries) {
          const html = await decrypt(inputValue, entry);
          if (html) {
            threadState(state, thread.id).displayedProtectedMessages[node.id] = html;
            saveState(payload, state);
            renderMessengerNow();
            return;
          }
        }
        error.textContent = node.protectedEntries[0].failureMessage || genericFailure;
      });
      wrapper.appendChild(protectedBox);
    }
    if (node.choices?.length) {
      const actions = document.createElement('div');
      actions.className = 'cicada-message-actions';
      for (const choice of node.choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = choice.label;
        button.addEventListener('click', () => {
          if (choice.targetNodeId) deliverNode(payload, state, thread, choice.targetNodeId, false);
          for (const effect of asArray(choice.effects)) applyEffect(payload, state, effect);
          recordEvent(payload, state, 'messengerChoiceSelected:' + thread.id + ':' + node.id + ':' + choice.id);
          saveState(payload, state);
          renderMessengerNow();
        });
        actions.appendChild(button);
      }
      wrapper.appendChild(actions);
    }
    if (node.kind === 'input' && node.matchers?.length) {
      const inputBox = document.createElement('div');
      inputBox.className = 'cicada-input';
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'message';
      input.autocomplete = 'off';
      const button = document.createElement('button');
      button.type = 'submit';
      button.textContent = 'Send';
      const error = document.createElement('div');
      error.className = 'cicada-message-error';
      form.append(input, button);
      inputBox.append(form, error);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = new FormData(form).get('message')?.toString() || '';
        for (const matcher of node.matchers) {
          const candidates = matcher.mode === 'contains' ? containsCandidates(value) : [normalize(value)];
          for (const candidate of candidates) {
            const match = await decrypt(candidate, matcher);
            if (match) {
              const result = JSON.parse(match);
              if (result.targetNodeId) deliverNode(payload, state, thread, result.targetNodeId, false);
              for (const effect of asArray(result.effects)) applyEffect(payload, state, effect);
              recordEvent(payload, state, 'messengerInputMatched:' + thread.id + ':' + node.id + ':' + matcher.id);
              saveState(payload, state);
              renderMessengerNow();
              return;
            }
          }
        }
        error.textContent = genericFailure;
      });
      wrapper.appendChild(inputBox);
    }
    if (node.kind === 'delay' && node.delayMs && node.choices?.[0]?.targetNodeId) {
      setTimeout(() => {
        deliverNode(payload, state, thread, node.choices[0].targetNodeId, true);
        renderMessengerNow();
      }, node.delayMs);
    }
    return wrapper;
  };
  const setupMessenger = (payload, state) => {
    if (!payload.messengerThreads?.length) return;
    injectMessengerStyles();
    const root = document.createElement('div');
    root.className = 'cicada-messenger';
    document.body.appendChild(root);
    renderMessengerNow = () => {
      const unread = payload.messengerThreads.reduce((sum, thread) => sum + Number(threadState(state, thread.id).unreadCount || 0), 0);
      root.innerHTML = '';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'cicada-messenger-toggle';
      toggle.innerHTML = '<span>Messages</span>' + (unread ? '<span class="cicada-messenger-count">' + unread + '</span>' : '');
      const panel = document.createElement('div');
      panel.className = 'cicada-messenger-panel';
      const head = document.createElement('div');
      head.className = 'cicada-messenger-head';
      head.innerHTML = '<strong>Messages</strong>';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'cicada-messenger-close';
      close.setAttribute('aria-label', 'Close messages');
      close.textContent = 'x';
      head.appendChild(close);
      const body = document.createElement('div');
      body.className = 'cicada-messenger-body';
      for (const thread of payload.messengerThreads) {
        if (thread.nodes[0]) deliverNode(payload, state, thread, thread.nodes[0].id, false);
        const current = threadState(state, thread.id);
        const section = document.createElement('section');
        section.className = 'cicada-thread';
        const title = document.createElement('div');
        title.className = 'cicada-thread-title';
        title.innerHTML = '<span>' + escapeHtml(thread.title) + '</span>' + (current.unreadCount ? '<span>' + current.unreadCount + '</span>' : '');
        const messages = document.createElement('div');
        messages.className = 'cicada-message-list';
        for (const nodeId of current.deliveredNodeIds) {
          const node = nodeById(thread, nodeId);
          if (node) messages.appendChild(renderMessengerNode(payload, state, thread, node));
        }
        section.append(title, messages);
        body.appendChild(section);
      }
      panel.append(head, body);
      root.append(toggle, panel);
      toggle.addEventListener('click', () => {
        root.classList.add('open');
        for (const thread of payload.messengerThreads) {
          threadState(state, thread.id).unreadCount = 0;
          recordEvent(payload, state, 'messengerThreadOpened:' + thread.id);
        }
        saveState(payload, state);
        renderMessengerNow();
      });
      close.addEventListener('click', () => {
        root.classList.remove('open');
      });
    };
    renderMessengerNow();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const payload = readPayload();
    if (!payload) return;
    const state = loadState(payload);
    if (importHandoff(payload, state)) saveState(payload, state);
    window.CicadaStoryState = {
      get: () => handoffSnapshot(payload, loadState(payload)),
      createHandoffUrl: (url) => {
        const target = new URL(url, location.href);
        target.hash = handoffParam + '=' + base64UrlFromJson(handoffSnapshot(payload, loadState(payload)));
        return target.toString();
      }
    };
    recordPageVisit(payload, state);
    setupReveal(payload, state);
    setupUnlock(payload, state);
    setupSearch(payload, state);
    setupCounters(payload);
    setupMessenger(payload, state);
  });
})();
`;
