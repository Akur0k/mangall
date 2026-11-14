// Вход через Google на всех страницах (Google Identity Services) + доступ к Worker'у.
// Google выдаёт подписанный ID-токен (JWT) с именем, почтой и аватаром — храним его в
// браузере и отправляем в Worker; тот проверяет подпись у Google. Токен живёт ~1 час,
// дальше Google обновляет его сам (auto_select), если человек не нажимал «Выйти».
//
// Страница задаёт window.SITE = {root, api, gclient} и кнопку #acc-btn в шапке.
// Снаружи: MAuth.user, MAuth.cred, MAuth.onChange(fn), MAuth.require(why, then),
// MAuth.api(path, {method, body}) → JSON (с Authorization), MAuth.track(kind, al, ch).
(function () {
  const S = window.SITE || {};
  const auth = { cred: null, user: null };
  const subs = [];
  let afterLogin = null, gReady = false;

  // Панель входа — одна на сайт, вставляем сами.
  const login = document.createElement('div');
  login.className = 'sheet'; login.id = 'login'; login.hidden = true;
  login.innerHTML = `<b>Аккаунт</b>
    <div class="out-only"><p class="why"></p><div id="gbtn"></div></div>
    <div class="in-only"><div class="me"><img alt="" referrerpolicy="no-referrer"><span></span></div></div>
    <div class="row"><button type="button" class="out in-only">Выйти</button><button type="button" class="cancel">Закрыть</button></div>`;
  document.body.appendChild(login);
  const accBtn = document.getElementById('acc-btn');

  function parseJwt(t) {
    try { const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (_) { return null; }
  }
  function setCred(t) {
    const u = t && parseJwt(t);
    if (u && u.exp * 1000 > Date.now() + 60000) { auth.cred = t; auth.user = u; }
    else { auth.cred = auth.user = null; t = null; }
    try {
      t ? localStorage.setItem('mangall-cred', t) : localStorage.removeItem('mangall-cred');
      if (auth.user) localStorage.setItem('mangall-was-in', '1');
    } catch (_) {}
    const u2 = auth.user;
    if (accBtn) {
      const ava = accBtn.querySelector('.ava');
      accBtn.classList.toggle('in', !!u2);
      ava.hidden = !(u2 && u2.picture); if (u2 && u2.picture) ava.src = u2.picture;
      accBtn.querySelector('.lbl').textContent = u2 ? (u2.given_name || u2.name || 'Аккаунт') : 'Войти';
      accBtn.title = u2 ? `Вы вошли: ${u2.name} (${u2.email})` : 'Войти через Google';
    }
    syncAuthItem(u2);
    if (u2) { login.dataset.in = ''; login.querySelector('.me img').src = u2.picture || '';
      login.querySelector('.me span').textContent = `${u2.name} · ${u2.email}`; } else delete login.dataset.in;
    subs.forEach(f => { try { f(u2); } catch (e) { console.error(e); } });
  }
  function open(why, then) {
    afterLogin = then || null;
    login.querySelector('.why').textContent = why || 'Войдите через Google — будут рекомендации по вашим вкусам и можно предлагать правки.';
    login.hidden = false;
    if (gReady && !auth.user) {
      const box = login.querySelector('#gbtn'); box.innerHTML = '';
      google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ru', shape: 'rectangular' });
    }
  }
  login.querySelector('.cancel').onclick = () => { login.hidden = true; afterLogin = null; };
  login.querySelector('.out').onclick = () => {
    try { google.accounts.id.disableAutoSelect(); } catch (_) {}
    try { localStorage.removeItem('mangall-was-in'); localStorage.removeItem('mangall-evq'); } catch (_) {}
    setCred(null); login.hidden = true;
  };
  if (accBtn) accBtn.onclick = () => open();
  // пункт «Войти через Google» в меню аккаунта (есть не на каждой странице — тогда просто нет)
  const authItem = document.getElementById('auth-item');
  if (authItem) authItem.onclick = () => open();
  function syncAuthItem(u2) {
    const l = document.getElementById('auth-item-label');
    if (l) l.textContent = u2 ? 'Аккаунт: ' + (u2.given_name || u2.name || u2.email) : 'Войти через Google';
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !login.hidden) { login.hidden = true; afterLogin = null; } });

  window.onGoogleLibraryLoad = () => {
    if (!S.gclient) return;
    google.accounts.id.initialize({
      client_id: S.gclient, auto_select: true, cancel_on_tap_outside: true, use_fedcm_for_prompt: true,
      callback: r => { setCred(r.credential); if (auth.user) { login.hidden = true; const f = afterLogin; afterLogin = null; if (f) f(); } },
    });
    gReady = true;
    if (!login.hidden) open(login.querySelector('.why').textContent, afterLogin);
    try { if (!auth.user && localStorage.getItem('mangall-was-in')) google.accounts.id.prompt(); } catch (_) {}
  };
  addEventListener('storage', ev => { if (ev.key === 'mangall-cred') setCred(ev.newValue); });

  // Запрос к Worker'у от имени вошедшего. 401 → просим войти заново.
  async function api(path, opt = {}) {
    if (!fresh()) throw Object.assign(new Error('Нужно войти'), { login: true });
    const r = await fetch(S.api + path, {
      method: opt.method || 'GET', keepalive: !!opt.keepalive,
      headers: Object.assign({ Authorization: 'Bearer ' + auth.cred }, opt.body ? { 'Content-Type': 'application/json' } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.login) { setCred(null); throw Object.assign(new Error(d.error || 'Нужно войти'), { login: true }); }
    if (!r.ok || !d.ok) throw new Error(d.error || ('ошибка ' + r.status));
    return d;
  }

  // Действия читателя для рекомендаций копим пачкой и отправляем раз в полминуты
  // и при уходе со страницы — бережём бесплатный лимит записей базы.
  function queue() { try { return JSON.parse(localStorage.getItem('mangall-evq') || '[]'); } catch (_) { return []; } }
  function track(k, al, ch, src) {
    if (!auth.user || !al) return;
    const e = { k, al: +al }; if (ch != null) e.ch = +ch; if (src) e.s = String(src);
    const q = queue(); q.push(e);
    try { localStorage.setItem('mangall-evq', JSON.stringify(q.slice(-200))); } catch (_) {}
  }
  let flushing = false;
  async function flush(keepalive) {
    if (flushing || !auth.user) return;
    const q = queue(); if (!q.length) return;
    flushing = true;
    try { localStorage.setItem('mangall-evq', '[]'); await api('/me/events', { method: 'POST', body: { events: q.slice(0, 100) }, keepalive }); }
    catch (e) { if (!e.login) { const rest = queue(); try { localStorage.setItem('mangall-evq', JSON.stringify(q.concat(rest).slice(-200))); } catch (_) {} } }
    finally { flushing = false; }
  }
  setInterval(() => flush(false), 30000);
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

  // Истёк ли токен — без оповещения подписчиков, если ничего не поменялось.
  function fresh() { if (auth.user && auth.user.exp * 1000 <= Date.now() + 60000) setCred(null); return auth.user; }
  window.MAuth = {
    get user() { return fresh(); },
    get cred() { return auth.cred; },
    onChange(fn) { subs.push(fn); },
    require(why, then) { if (auth.user) then && then(); else open(why, then); },
    open, api, track, flush,
  };
  try { setCred(localStorage.getItem('mangall-cred')); } catch (_) { setCred(null); }
})();
