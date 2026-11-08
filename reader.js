
// Шапка прячется, когда листаешь вниз, и появляется, когда чуть прокрутишь вверх
// (или дошёл до самого верха / низа главы). Пока открыт список глав — не прячем.
let lastY = scrollY, acc = 0;
addEventListener('scroll', () => {
  const y = scrollY, dy = y - lastY; lastY = y;
  if (document.getElementById('cnav').classList.contains('open')) return;
  acc = (Math.sign(dy) === Math.sign(acc)) ? acc + dy : dy; // копим путь в одну сторону — дрожание пальца не дёргает шапку
  const atTop = y < 80, atEnd = y + innerHeight > document.documentElement.scrollHeight - 40;
  if (atTop || atEnd || acc < -30) document.body.classList.remove('hdr-off');
  else if (acc > 30) document.body.classList.add('hdr-off');
}, { passive: true });

// Список глав в шапке: открыть/закрыть по кнопке, закрыть кликом мимо и Esc.
const cnav = document.getElementById('cnav'), ctog = document.getElementById('ctog');
ctog.onclick = ev => {
  ev.stopPropagation();
  const open = cnav.classList.toggle('open'); ctog.setAttribute('aria-expanded', open);
  if (open) { const cur = cnav.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' }); }
};
document.addEventListener('click', ev => { if (!cnav.contains(ev.target)) { cnav.classList.remove('open'); ctog.setAttribute('aria-expanded', false); } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { cnav.classList.remove('open'); if (typeof closeSheet === 'function' && !sheet.hidden) closeSheet(); } });

// Оригинал / Перевод: слой перевода (.t) просто прячется. Выбор запоминается.
const origBtn = document.getElementById('orig-btn');
function setOrig(on) {
  document.body.classList.toggle('orig', on);
  origBtn.setAttribute('aria-pressed', on);
  origBtn.title = on ? 'Показать перевод' : 'Показать оригинал';
  origBtn.querySelector('.lbl').textContent = on ? 'Перевод' : 'Оригинал';
  try { localStorage.setItem('mangall-orig', on ? '1' : ''); } catch (_) {}
}
origBtn.onclick = () => setOrig(!document.body.classList.contains('orig'));
try { if (localStorage.getItem('mangall-orig')) setOrig(true); } catch (_) {}

// Предложить правку: включить режим → нажать на место ошибки → написать → отправить.
const sugBtn = document.getElementById('sug-btn'), sheet = document.getElementById('sheet');
const ta = sheet.querySelector('textarea'), nameIn = sheet.querySelector('input[name=name]');
const msg = sheet.querySelector('.msg'), sendBtn = sheet.querySelector('.go');
let pick = null, mark = null;
try { nameIn.value = localStorage.getItem('mangall-name') || ''; } catch (_) {}
function setSuggest(on) {
  document.body.classList.toggle('suggest', on);
  sugBtn.setAttribute('aria-pressed', on);
  if (!on) closeSheet();
}
sugBtn.onclick = () => setSuggest(!document.body.classList.contains('suggest'));
function closeSheet() { sheet.hidden = true; if (mark) mark.remove(); mark = pick = null; msg.textContent = ''; }
sheet.querySelector('.cancel').onclick = closeSheet;
document.querySelectorAll('.pg').forEach(pg => pg.addEventListener('click', ev => {
  if (!document.body.classList.contains('suggest')) return;
  const r = pg.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  if (mark) mark.remove();
  mark = document.createElement('div'); mark.className = 'mark';
  mark.style.left = (x * 100) + '%'; mark.style.top = (y * 100) + '%';
  pg.appendChild(mark);
  pick = { pg, x, y };
  sheet.querySelector('b').textContent = 'Страница ' + pg.dataset.n + ': что исправить?';
  sheet.hidden = false; msg.textContent = ''; ta.focus();
}));
const loadCors = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
// Кусок страницы вокруг точки (как видит читатель: оригинал + перевод, если включён) с красным кругом.
async function crop(p) {
  const [o, t] = await Promise.all([loadCors(p.pg.dataset.o), document.body.classList.contains('orig') ? null : loadCors(p.pg.dataset.t)]);
  if (!o) return null;
  const W = o.naturalWidth, H = o.naturalHeight, S = Math.min(700, W, H);
  const cx = p.x * W, cy = p.y * H;
  const sx = Math.max(0, Math.min(W - S, cx - S / 2)), sy = Math.max(0, Math.min(H - S, cy - S / 2));
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.drawImage(o, sx, sy, S, S, 0, 0, S, S);
  if (t) ctx.drawImage(t, sx, sy, S, S, 0, 0, S, S);
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - sx, cy - sy, 26, 0, 7); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#e11'; ctx.beginPath(); ctx.arc(cx - sx, cy - sy, 26, 0, 7); ctx.stroke();
  return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}
sendBtn.onclick = async () => {
  if (!pick) return;
  const text = ta.value.trim();
  if (!text) { msg.textContent = 'Напишите, что исправить.'; ta.focus(); return; }
  sendBtn.disabled = true; msg.textContent = 'Отправляю…';
  try {
    const fd = new FormData();
    fd.append('text', text); fd.append('name', nameIn.value.trim());
    fd.append('website', sheet.querySelector('.hp').value);
    fd.append('manga', READER.manga); fd.append('chapter', READER.chapter); fd.append('page', pick.pg.dataset.n);
    fd.append('link', location.href.split('#')[0] + '#p' + pick.pg.dataset.n);
    try { localStorage.setItem('mangall-name', nameIn.value.trim()); } catch (_) {}
    const img = await crop(pick); if (img) fd.append('image', img, 'page.jpg');
    const r = await fetch(READER.suggest, { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || r.status);
    ta.value = ''; closeSheet(); setSuggest(false);
    alert('Спасибо! Правка отправлена.');
  } catch (e) { msg.textContent = 'Не получилось отправить: ' + e.message; }
  finally { sendBtn.disabled = false; }
};
