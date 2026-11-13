// ==UserScript==
// @name         MangALL — мост к readmanga / seimanga
// @namespace    mangall
// @version      1.2
// @description  Передаёт читалке MangALL (rm.html) картинки и главы со страницы readmanga/seimanga. Работает только в окне/фрейме, открытом читалкой.
// @match        *://readmanga.me/*
// @match        *://*.readmanga.me/*
// @match        *://readmanga.club/*
// @match        *://*.readmanga.club/*
// @match        *://mintmanga.me/*
// @match        *://*.mintmanga.me/*
// @match        *://selfmanga.me/*
// @match        *://*.selfmanga.me/*
// @match        *://seimanga.me/*
// @match        *://*.seimanga.me/*
// @match        *://seimanga.ru/*
// @match        *://*.seimanga.ru/*
// @match        *://zazaza.me/*
// @match        *://*.zazaza.me/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  // seimanga — скрытый фрейм читалки; readmanga во фреймы не пускает — маленькое окно (window.opener)
  const target = window.top !== window ? window.parent : window.opener;
  if (!target) return;
  const m = /^mangall-bridge-(\w+)$/.exec(window.name || '');
  if (!m) return;
  const id = m[1];
  // отдаём данные только читалке MangALL: локальной и опубликованной (Cloudflare Pages)
  const ORIGINS = ['http://localhost:3003', 'http://127.0.0.1:3003', 'https://mangall.pages.dev'];
  const send = data => {
    ORIGINS.forEach(o => { try { target.postMessage({ mangallBridge: id, ...data }, o); } catch (_) {} });
    if (target === window.opener) setTimeout(() => window.close(), 300);
  };

  const host = location.host;
  const html = document.documentElement.outerHTML;
  const unescapeHtml = s => s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

  try {
    // страница манги (не главы): отдаём ссылку на первую главу
    if (!/\/vol\d+\/\d+/.test(location.pathname)) {
      const a = document.querySelector('a.read-first-chapter[href]') || document.querySelector('a[href*="/vol"]');
      return send(a ? { first: new URL(a.getAttribute('href'), location.href).toString().replace(/#.*$/, '') } : { error: 'на странице манги нет глав' });
    }
    // то же, что parseChapter в relay.js
    const images = [];
    const init = html.match(/rm_h\.readerInit\(\s*chapterInfo\s*,\s*(\[\[[\s\S]*?\]\])\s*[,)]/);
    if (init) {
      const re = /\[\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*(\d+)/g;
      let x;
      while ((x = re.exec(init[1]))) images.push({ url: x[1] + x[2], w: +x[3], h: +x[4] });
    }
    const link = name => {
      const r = html.match(new RegExp('var\\s+' + name + '\\s*=\\s*"([^"]*)"'));
      if (!r || !/\/vol\d+\/\d+/.test(r[1])) return null;
      return 'https://' + host + r[1].replace(/#.*$/, '');
    };
    const t = document.title || '';
    const tm = t.match(/главу\s+(\S+)\s+(?:манги|манхвы|маньхуа|комикса)?\s*(.+?)\s*(?:\([^)]*\)\s*)?онлайн/i);
    const ts = !tm && t.match(/^\s*(?:(?:Читать|Чтение)\s+)?(?:Манга|Манхва|Маньхуа|Комикс)?\s*(.+?)\s+-\s+[\s\S]*?Глава\s+(\S+)/i);
    const chapters = [], seen = new Set();
    const cre = /<a\b[^>]*href="(\/[^"]*\/vol\d+\/\d+[^"]*)"[^>]*class="[^"]*\bchapter-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let cm;
    while ((cm = cre.exec(html))) {
      const url = 'https://' + host + cm[1].replace(/&amp;/g, '&').replace(/#.*$/, '');
      const title = unescapeHtml(cm[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      // ссылки «переводчик» / «Другие переводы» (?tran=…) — не главы; у глав название «том - номер …»
      if (/[?&]tran=/.test(url) || !/^\d/.test(title) || seen.has(url)) continue;
      seen.add(url);
      chapters.push({ url, title });
    }
    const out = {
      manga: tm ? tm[2] : ts ? ts[1] : '', chapter: tm ? tm[1] : ts ? ts[2] : '',
      images, chapters, prev: link('prevChapterLink'), next: link('nextChapterLink'), native: location.hostname,
    };
    if (!images.length && /Если вам больше 18 лет/.test(html)) out.adult = true;
    send({ data: out });
  } catch (e) { send({ error: e.message }); }
})();
