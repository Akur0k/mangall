// Перевод страниц манги прямо в браузере читателя (взято из ~/Projects/shorttest/ocr-bench):
// OCR: детектор комиксов + своя нарезка строк + PaddleOCR v5 EN (onnxruntime-web, ocr-worker.js) → реплики →
// перевод en→ru движком Bergamot (как в Firefox, mt-worker.js) → белые «пузыри» поверх картинки.
// Быстро — в несколько потоков, если страница изолирована (сервер отдаёт rm.html с COOP/COEP
// credentialless, см. serve.py). Готовый перевод страницы кешируется в браузере (localStorage).
(function () {
  const BASE = new URL('.', document.currentScript.src).href;   // …/tr/
  const CACHE = 'mangall-tr4:';   // tr4 — своя нарезка строк (2026-11-13), старый кеш не берём

  // --- воркеры ---------------------------------------------------------------
  let ocrW = null, mtW = null, seq = 0, ready = null;
  const wait = new Map();
  const onMsg = e => { const p = wait.get(e.data.id); if (!p) return; wait.delete(e.data.id); e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error)); };
  const call = (w, msg, transfer) => new Promise((res, rej) => { const id = ++seq; wait.set(id, { res, rej }); w.postMessage({ id, ...msg }, transfer || []); });
  const threads = () => self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)) : 1;
  function init() {
    // модель перевода — только после OCR: одновременная загрузка на холодном кеше ломала распознавание
    return ready ??= (async () => {
      ocrW = new Worker(BASE + 'ocr-worker.js', { type: 'module' }); ocrW.onmessage = onMsg;
      mtW = new Worker(BASE + 'mt-worker.js'); mtW.onmessage = onMsg;
      await call(ocrW, { cmd: 'init', threads: threads() });
      await call(mtW, { cmd: 'init' });
    })().catch(e => { ready = null; throw e; });
  }

  // --- строки блока → одна реплика -------------------------------------------------
  // Воркер отдаёт блоки текста (облачка, надписи) — их нашёл детектор комиксов, строки внутри
  // прочитал PaddleOCR, сверху вниз, через «\n». Тут склеиваем строки и чиним типичные ошибки OCR.
  function joinLines(raw) {
    let text = '';
    for (const t of raw.split('\n').map(x => x.trim()).filter(Boolean)) {
      // перенос слова: «foun-» + «dation» → «foundation»; дефис между словами («so-» «called») не трогаем
      if (/[A-Za-z][-‐‑–]$/.test(text) && /^[a-z]/i.test(t) && !/^(so|self|ex|non|re|co|th|t)[-‐‑–]$/i.test(text.split(' ').pop())) text = text.slice(0, -1) + t;
      else text += (text ? ' ' : '') + t;
    }
    // «Basi- cally» внутри строки (OCR отдаёт разные дефисы и пробел после них)
    text = text.replace(/([A-Za-z]+)[-‐‑–]\s+([a-z]{2,})/gi, (m, a, b) => /^(so|self|ex|non|re|co|th|t)$/i.test(a) ? m : a + b);
    // OCR путает «So»/«so» с «50», «is» с «i5», когда вокруг слова, а не числа
    if (/[A-Za-z]{3,}/.test(text)) text = text.replace(/\b50\b/g, 'so').replace(/\bi5\b/gi, 'is');
    return text.replace(/\s+([.,!?…])/g, '$1').replace(/[\]\[|]+$/, '').trim();
  }
  // КАПС → обычный регистр: модель перевода плохо понимает текст заглавными
  function sentenceCase(s) {
    let t = s.toLowerCase().replace(/(^|[.!?…]\s+|^["'(\[]+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
    return t.replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  }

  // --- одна страница -----------------------------------------------------------
  const cacheGet = url => { try { return JSON.parse(localStorage.getItem(CACHE + url.replace(/[?#].*$/, ''))); } catch (_) { return null; } };
  function cacheSet(url, d) {
    const k = CACHE + url.replace(/[?#].*$/, ''), v = JSON.stringify(d);
    for (let tries = 0; tries < 3; tries++) {
      try { localStorage.setItem(k, v); return; }
      catch (_) {   // место кончилось — выкидываем самые старые переводы
        const keys = []; for (let i = 0; i < localStorage.length; i++) { const x = localStorage.key(i); if (x.startsWith(CACHE)) keys.push(x); }
        keys.slice(0, Math.max(20, keys.length >> 2)).forEach(x => localStorage.removeItem(x));
      }
    }
  }
  async function page(url) {
    const hit = cacheGet(url);
    if (hit) return hit;
    await init();
    const image = await (await fetch(url, { mode: 'cors' })).arrayBuffer();
    let o = await call(ocrW, { cmd: 'run', image: image.slice(0) });
    if (!o.blocks.length) o = await call(ocrW, { cmd: 'run', image });   // первый прогон на холодном кеше бывает пустым
    const groups = o.blocks.map(b => ({ text: joinLines(b.text), box: b.box }))
      .filter(g => /[A-Za-z]{2}/.test(g.text) || /^[AI][.!?…]*$/i.test(g.text));
    const src = groups.map(g => sentenceCase(g.text));
    const r = src.length ? await call(mtW, { cmd: 'translate', texts: src }) : { out: [] };
    const d = { w: o.w, h: o.h, g: groups.map((g, i) => ({ b: g.box, en: src[i], ru: r.out[i] || '' })) };
    cacheSet(url, d);
    return d;
  }

  // --- пузыри поверх картинки ------------------------------------------------------
  function fit(el) {
    const span = el.firstChild, h = el.clientHeight;
    let fs = Math.min(22, h * 0.6);
    for (; fs > 5; fs -= 0.5) {
      el.style.fontSize = fs + 'px';
      if (span.offsetHeight <= el.clientHeight && span.scrollWidth <= el.clientWidth + 1 && el.scrollWidth <= el.clientWidth + 1) break;
    }
  }
  // Коллизия: пузыри (рамка блока + поля) не должны налезать друг на друга. Пересекающиеся пары
  // ужимаем навстречу друг другу по оси с меньшим пересечением; не меньше 40% исходного размера, в пределах страницы.
  function layout(d, pad) {
    const R = d.g.map(g => { const [x, y, w, h] = g.b; return { x0: Math.max(0, x - pad), y0: Math.max(0, y - pad), x1: Math.min(d.w, x + w + pad), y1: Math.min(d.h, y + h + pad), mw: w * 0.4, mh: h * 0.4 }; });
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
        const a = R[i], b = R[j];
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const [lo, hi, k0, k1, m] = ox < oy ? [a.x0 + a.x1 < b.x0 + b.x1 ? a : b, a.x0 + a.x1 < b.x0 + b.x1 ? b : a, 'x0', 'x1', 'mw'] : [a.y0 + a.y1 < b.y0 + b.y1 ? a : b, a.y0 + a.y1 < b.y0 + b.y1 ? b : a, 'y0', 'y1', 'mh'];
        const cut = (ox < oy ? ox : oy) / 2 + 1;
        // кто уже упёрся в минимум, тот не ужимается — ужимается сосед
        const loRoom = Math.max(0, lo[k1] - lo[k0] - lo[m]), hiRoom = Math.max(0, hi[k1] - hi[k0] - hi[m]);
        let cl = Math.min(cut, loRoom), ch = Math.min(cut, hiRoom);
        if (cl < cut) ch = Math.min(hiRoom, 2 * cut - cl); else if (ch < cut) cl = Math.min(loRoom, 2 * cut - ch);
        lo[k1] -= cl; hi[k0] += ch;
      }
      if (!moved) break;
    }
    return R;
  }
  function draw(box, d) {
    box.querySelectorAll('.trl').forEach(e => e.remove());
    const layer = document.createElement('div'); layer.className = 'trl';
    const R = layout(d, 12);
    for (let i = 0; i < d.g.length; i++) {
      const g = d.g[i], r = R[i];
      const el = document.createElement('div'); el.className = 'bub'; el.lang = 'ru'; el.title = g.en;
      el.style.cssText = `left:${r.x0 / d.w * 100}%;top:${r.y0 / d.h * 100}%;width:${(r.x1 - r.x0) / d.w * 100}%;height:${(r.y1 - r.y0) / d.h * 100}%`;
      const span = document.createElement('span'); span.textContent = g.ru; el.appendChild(span);
      layer.appendChild(el);
    }
    box.appendChild(layer);
    layer.querySelectorAll('.bub').forEach(fit);
  }
  addEventListener('resize', () => document.querySelectorAll('.trl .bub').forEach(fit));

  window.MTR = { page, draw, init, isolated: () => self.crossOriginIsolated, threads };
})();
