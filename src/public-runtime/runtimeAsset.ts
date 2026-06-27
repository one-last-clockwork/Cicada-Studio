export const PUBLIC_RUNTIME_JS = String.raw`
(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const genericFailure = 'The submitted value did not unlock anything.';

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

  const renderMessage = (host, message, ok) => {
    const target = host.querySelector('[data-arg-result]');
    if (!target) return;
    target.className = ok ? 'arg-result ok' : 'arg-result fail';
    target.innerHTML = message;
  };

  const setupReveal = (payload) => {
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
            return;
          }
        }
        renderMessage(host, entries[0].failureMessage ?? genericFailure, false);
      });
    });
  };

  const setupUnlock = (payload) => {
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
            return;
          }
        }
        renderMessage(host, entries[0].failureMessage ?? genericFailure, false);
      });
    });
  };

  const setupSearch = (payload) => {
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
        renderMessage(host, payload.genericFailure ?? genericFailure, false);
      });
    });
  };

  const setupCounters = (payload) => {
    document.querySelectorAll('[data-page-counter]').forEach((node) => {
      const current = node.getAttribute('data-page-counter');
      node.textContent = current + ' / ' + payload.pages.length;
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const payload = readPayload();
    if (!payload) return;
    setupReveal(payload);
    setupUnlock(payload);
    setupSearch(payload);
    setupCounters(payload);
  });
})();
`;
