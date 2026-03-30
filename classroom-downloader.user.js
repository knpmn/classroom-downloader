// ==UserScript==
// @name         Google Classroom - Instant Drive Downloader
// @namespace    https://github.com/knpmn/classroom-downloader
// @version      1.2.0
// @description  One-click download buttons on every Google Drive attachment
// @author       Claude
// @match        https://classroom.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');

    .cdl-btn {
      --bg:     #0f172a;
      --ink:    #e2e8f0;
      --accent: #38bdf8;
      --danger: #f87171;
      --ok:     #4ade80;

      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 20;

      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 8px;
      border: 1px solid rgba(56,189,248,.35);
      border-radius: 6px;
      background: var(--bg);
      color: var(--ink);
      font: 500 10px/1 'DM Mono', monospace;
      letter-spacing: .04em;
      cursor: pointer;
      outline: none;
      overflow: hidden;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,.3);
      transition: background 180ms ease, border-color 180ms ease,
                  transform 120ms ease, box-shadow 180ms ease;
    }

    .cdl-btn svg {
      flex-shrink: 0;
      transition: transform 220ms ease;
    }

    .cdl-btn:hover {
      background: #162032;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(56,189,248,.18), 0 4px 14px rgba(0,0,0,.4);
      transform: translateY(-1px);
    }
    .cdl-btn:hover svg { transform: translateY(2px); }
    .cdl-btn:active    { transform: scale(.96) translateY(0); }

    .cdl-btn[data-state="loading"] {
      border-color: var(--accent);
      pointer-events: none;
      animation: cdl-pulse 1s ease infinite;
    }
    @keyframes cdl-pulse {
      0%,100% { box-shadow: 0 0 0 0   rgba(56,189,248,.55); }
      50%     { box-shadow: 0 0 0 6px rgba(56,189,248,0);   }
    }

    .cdl-spin {
      display: none;
      width: 10px; height: 10px;
      border: 1.5px solid rgba(56,189,248,.3);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: cdl-rotate .7s linear infinite;
    }
    @keyframes cdl-rotate { to { transform: rotate(360deg); } }

    .cdl-btn[data-state="loading"] .cdl-spin { display: block; }
    .cdl-btn[data-state="loading"] .cdl-icon { display: none; }

    .cdl-btn[data-state="done"]  { border-color: var(--ok);    color: var(--ok);    pointer-events: none; }
    .cdl-btn[data-state="error"] { border-color: var(--danger); color: var(--danger); pointer-events: none; }
  `;

  const NS = 'http://www.w3.org/2000/svg';
  const DRIVE_RE = /https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/;
  const MAX_CLIMB = 12;

  // --- Hidden iframe pool for gesture-free parallel downloads ---
  // Navigating a hidden iframe to a download URL is treated as a navigation
  // by the browser, not a popup, so it is never blocked regardless of timing
  // or how many are in flight at once.
  function triggerDownload(url) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;border:none;';
    iframe.src = url;
    document.body.appendChild(iframe);
    // Clean up after enough time for the download to have been handed off
    setTimeout(() => iframe.remove(), 60_000);
  }

  function buildIcon(name) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cdl-icon');
    svg.setAttribute('width', '11');
    svg.setAttribute('height', '11');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const el = (tag, attrs) => {
      const node = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      return node;
    };

    if (name === 'download') {
      svg.setAttribute('stroke-width', '2.2');
      svg.append(
        el('path',     { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
        el('polyline', { points: '7 10 12 15 17 10' }),
        el('line',     { x1: '12', y1: '15', x2: '12', y2: '3' }),
      );
    } else if (name === 'check') {
      svg.setAttribute('stroke-width', '2.5');
      svg.append(el('polyline', { points: '20 6 9 17 4 12' }));
    } else if (name === 'x') {
      svg.setAttribute('stroke-width', '2.5');
      svg.append(
        el('line', { x1: '18', y1: '6',  x2: '6',  y2: '18' }),
        el('line', { x1: '6',  y1: '6',  x2: '18', y2: '18' }),
      );
    }

    return svg;
  }

  function setContent(btn, icon, text) {
    const label = document.createElement('span');
    label.className = 'cdl-label';
    label.textContent = text;

    const spinner = document.createElement('span');
    spinner.className = 'cdl-spin';

    btn.replaceChildren(...(icon === 'download' ? [spinner] : []), buildIcon(icon), label);
  }

  function toDownloadUrl(href) {
    const [, id] = href.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || [];
    if (!id) return null;
    const [, au = '0'] = href.match(/authuser=(\d+)/) || [];
    return `https://drive.usercontent.google.com/u/${au}/uc?id=${id}&export=download`;
  }

  function makeButton(href, label) {
    const url = toDownloadUrl(href);
    if (!url) return null;

    const btn = document.createElement('button');
    btn.className = 'cdl-btn';
    btn.dataset.state = 'idle';
    btn.title = `Download "${label}"`;
    setContent(btn, 'download', 'Download');

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      // Fires immediately, synchronously, no gesture expiry, never blocked
      triggerDownload(url);

      btn.dataset.state = 'done';
      setContent(btn, 'check', 'Saved!');

      setTimeout(() => {
        btn.dataset.state = 'idle';
        setContent(btn, 'download', 'Download');
      }, 3000);
    });

    return btn;
  }

  function findCard(anchor) {
    let fallback = null;
    let el = anchor.parentElement;

    for (let i = 0; i < MAX_CLIMB && el && el !== document.body; i++) {
      if (el.hasAttribute('data-attachment-id')) return el;

      if (/^attachment[:\s]/i.test(el.getAttribute('aria-label') || '')) return el;

      const rect = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      const small = rect.height > 0 && rect.height < 300;

      if (small && el.contains(anchor)) {
        const hasExternalImg = [...el.querySelectorAll('img')].some(img => !anchor.contains(img));
        if (hasExternalImg && ['block', 'flex', 'grid'].includes(st.display)) return el;
      }

      if (!fallback && small && ['relative', 'absolute', 'sticky', 'fixed'].includes(st.position)) {
        fallback = el;
      }

      el = el.parentElement;
    }

    return fallback || anchor.parentElement;
  }

  function isBtnAlive(btn) {
    if (!btn?.isConnected) return false;
    const card = btn.parentElement;
    if (!card?.isConnected) return false;
    const st = getComputedStyle(card);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }

  function processAnchor(anchor) {
    const href = anchor.getAttribute('href') || '';
    if (!DRIVE_RE.test(href)) return;
    if (anchor.dataset.cdlDone && isBtnAlive(anchor._cdlBtn)) return;

    anchor.dataset.cdlDone = '1';

    const raw = anchor.getAttribute('aria-label') || anchor.getAttribute('title') || anchor.textContent || '';
    const label = raw.trim()
      .replace(/^Attachment:\s*/i, '')
      .replace(/^(PDF|DOC|DOCX|XLS|XLSX|PPT|PPTX|IMG|SHEET|SLIDE|FORM|Unknown):\s*/i, '');

    let card;
    if (/^attachment[:\s]/i.test(anchor.getAttribute('aria-label') || '')) {
      card = anchor.parentElement;
      let el = card;
      for (let i = 0; i < MAX_CLIMB && el && el !== document.body; i++) {
        if (el.hasAttribute('data-attachment-id')) { card = el; break; }
        el = el.parentElement;
      }
    } else {
      card = findCard(anchor);
    }

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

    const btn = makeButton(href, label);
    if (!btn) return;

    btn.dataset.cdlHref = href;
    anchor._cdlBtn = btn;
    card.appendChild(btn);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function scan() {
    document.querySelectorAll('a[href*="drive.google.com/file/d/"]').forEach(processAnchor);
  }

  if (!document.getElementById('cdl-styles')) {
    const s = document.createElement('style');
    s.id = 'cdl-styles';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  scan();

  const debouncedScan = debounce(scan, 60);

  const mutObs = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('a[href*="drive.google.com/file/d/"]')) {
          processAnchor(node);
        } else {
          node.querySelectorAll?.('a[href*="drive.google.com/file/d/"]').forEach(processAnchor);
        }
      }
    }
    debouncedScan();
  });
  mutObs.observe(document.body, { childList: true, subtree: true });

  const intObs = new IntersectionObserver(
    entries => entries.forEach(e => e.isIntersecting && processAnchor(e.target)),
    { rootMargin: '300px' }
  );

  function watchAnchors() {
    document.querySelectorAll('a[href*="drive.google.com/file/d/"]').forEach(a => {
      if (!a._cdlObserved) { a._cdlObserved = true; intObs.observe(a); }
    });
  }

  new MutationObserver(debounce(watchAnchors, 200)).observe(document.body, { childList: true, subtree: true });

  watchAnchors();
  window.addEventListener('scroll', debouncedScan, { passive: true, capture: true });

})();
