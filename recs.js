// Рекомендации MangALL — только для вошедших через Google (см. auth.js).
// Каталог (≈20 тыс. популярных манг с AniList: жанры, теги, оценка, обложки-ссылки) и
// «похожие» по рекомендациям пользователей AniList — статические файлы recs/data/*.json.
// Вкусы и действия человека хранит Worker в базе (GET /me), подборку считаем тут, в браузере.
//
// Страница задаёт SITE.recsMode: 'page' (страница «Рекомендации») или 'similar'
// (блок «Похожие» на странице манги; SITE.al — её id на AniList).
(function () {
  const S = window.SITE || {};
  const root = document.getElementById('recs');
  if (!root) return;

  // --- русские подписи жанров и частых тегов AniList ---------------------------
  const RU = {
    Action: 'Экшен', Adventure: 'Приключения', Comedy: 'Комедия', Drama: 'Драма', Ecchi: 'Этти', Fantasy: 'Фэнтези',
    Hentai: 'Хентай', Horror: 'Ужасы', 'Mahou Shoujo': 'Махо-сёдзё', Mecha: 'Меха', Music: 'Музыка', Mystery: 'Детектив',
    Psychological: 'Психология', Romance: 'Романтика', 'Sci-Fi': 'Фантастика', 'Slice of Life': 'Повседневность',
    Sports: 'Спорт', Supernatural: 'Сверхъестественное', Thriller: 'Триллер',
    Shounen: 'Сёнэн', Shoujo: 'Сёдзё', Seinen: 'Сэйнэн', Josei: 'Дзёсэй', 'School': 'Школа', 'Isekai': 'Исекай',
    'Female Protagonist': 'Героиня', 'Male Protagonist': 'Герой', 'Comedy': 'Комедия', 'Time Skip': 'Скачок во времени',
    'Magic': 'Магия', 'Martial Arts': 'Боевые искусства', 'Historical': 'Историческое', 'Revenge': 'Месть',
    'Reincarnation': 'Перерождение', 'Villainess': 'Злодейка', 'Royal Affairs': 'Королевский двор', 'Nobility': 'Знать',
    "Boys' Love": 'Яой (BL)', 'Yuri': 'Юри', 'LGBTQ+ Themes': 'ЛГБТ-темы', 'Love Triangle': 'Любовный треугольник',
    'Harem': 'Гарем', 'Reverse Harem': 'Обратный гарем', 'Office': 'Офис', 'Workplace': 'Работа', 'Cooking': 'Кулинария',
    'Gore': 'Жестокость', 'Tragedy': 'Трагедия', 'Survival': 'Выживание', 'Demons': 'Демоны', 'Vampire': 'Вампиры',
    'Ghost': 'Призраки', 'Zombie': 'Зомби', 'Dungeon': 'Подземелья', 'Video Games': 'Видеоигры', 'Super Power': 'Суперсилы',
    'Swordplay': 'Мечи', 'Military': 'Армия', 'Crime': 'Криминал', 'Detective': 'Сыщик', 'Coming of Age': 'Взросление',
    'Family Life': 'Семья', 'Childhood Friends': 'Друзья детства', 'Crossdressing': 'Переодевание', 'Gender Bending': 'Смена пола',
    'Full Color': 'Цветная', 'Webtoon': 'Вебтун', 'Work': 'Работа', 'Age Gap': 'Разница в возрасте',
    'Primarily Female Cast': 'В основном девушки', 'Primarily Male Cast': 'В основном парни', 'Anti-Hero': 'Антигерой',
    'Male Protagonist ': 'Герой', 'Politics': 'Политика', 'Philosophy': 'Философия', 'Romantic Subtext': 'Романтический подтекст',
    'Fake Relationship': 'Фиктивные отношения', 'Arranged Marriage': 'Брак по договору', 'Rehabilitation': 'Исцеление',
    'Episodic': 'Эпизодический', 'Iyashikei': 'Иясикэй (уютное)', 'Cute Girls Doing Cute Things': 'Милые девочки',
    'Delinquents': 'Хулиганы', 'Bullying': 'Травля', 'Parody': 'Пародия', 'Satire': 'Сатира', 'Club': 'Кружок',
    'Band': 'Музыкальная группа', 'Idol': 'Айдолы', 'Showbusiness': 'Шоу-бизнес', 'Medicine': 'Медицина',
    'Food': 'Еда', 'Animals': 'Животные', 'Kemonomimi': 'Кемономими', 'Elf': 'Эльфы', 'Dragons': 'Драконы',
    'Post-Apocalyptic': 'Постапокалипсис', 'Dystopian': 'Антиутопия', 'Space': 'Космос', 'Cyberpunk': 'Киберпанк',
    'Assassins': 'Убийцы', 'Mafia': 'Мафия', 'Gangs': 'Банды', 'Tsundere': 'Цундэрэ', 'Kuudere': 'Кудэрэ',
  };
  const ru = n => RU[n] || n;
  const FMT = { MANGA: 'Манга', NOVEL: 'Ранобэ', ONE_SHOT: 'Ваншот' };
  const GENRES_QUIZ = ['Romance', 'Comedy', 'Drama', 'Action', 'Fantasy', 'Slice of Life', 'Adventure', 'Supernatural',
    'Mystery', 'Psychological', 'Horror', 'Sports', 'Sci-Fi', 'Thriller', 'Ecchi', 'Mecha', 'Music', 'Mahou Shoujo'];
  const TAGS_QUIZ = ['Shounen', 'Shoujo', 'Seinen', 'Josei', 'School', 'Isekai', 'Reincarnation', 'Villainess', 'Historical',
    'Magic', 'Martial Arts', 'Revenge', 'Harem', 'Reverse Harem', "Boys' Love", 'Yuri', 'Office', 'Survival', 'Gore',
    'Tragedy', 'Iyashikei', 'Cooking', 'Webtoon', 'Full Color', 'Crossdressing', 'Childhood Friends', 'Video Games', 'Dungeon'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000, HALF_LIFE = 60 * DAY;

  // --- данные ----------------------------------------------------------------
  let CAT = null, SIM = null, byId = new Map(), me = null;
  async function loadData() {
    if (CAT) return;
    const [c, s, md] = await Promise.all([
      fetch(S.root + 'recs/data/catalog.json').then(r => r.json()),
      fetch(S.root + 'recs/data/similar.json').then(r => r.json()),
      // манга из базы MangaDex, которой нет в каталоге AniList (жанры/теги — те же словари)
      fetch(S.root + 'recs/data/catalog-md.json').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    ]);
    CAT = c; SIM = s;
    for (const r of c.items.concat(md.items || [])) byId.set(r[0], {
      id: r[0], title: r[1], score: r[3], pop: r[4],
      // обложка: 230px обычно, 460px — на экранах с высокой плотностью (браузер выбирает сам по srcset)
      // «~N» — обложка манги из нашей базы MangaDex (папка обложек mangall: mdcovers/N.jpg)
      cover: r[2] ? (r[2][0] === '~' ? S.root + c.mdcover + r[2].slice(1) + '.jpg' : r[2].startsWith('http') ? r[2] : c.cover + 'medium/' + r[2]) : '',
      cover2: r[2] && r[2][0] !== '~' && !r[2].startsWith('http') ? c.cover + 'large/' + r[2] : '',
      year: r[5], fmt: r[6], adult: !!(r[7] & 1), md: !!(r[7] & 4), ours: c.ours[r[0]] || null, g: r[8], t: r[9], alt: r[10] || '',
    });
  }
  async function loadMe() { me = await MAuth.api('/me'); return me; }

  // --- модель вкуса ----------------------------------------------------------
  // Веса жанров/тегов из опроса + действий (с затуханием: полвеса за 60 дней),
  // «семена» — тайтлы, от которых идут рекомендации AniList, и что больше не показывать.
  function profile() {
    const p = me.prefs || {}, now = Date.now();
    const gIdx = n => CAT.genres.indexOf(n), tIdx = n => CAT.tags.indexOf(n);
    const gw = new Map(), tw = new Map(), seeds = new Map(), hide = new Set(), liked = new Set(), seen = new Set();
    const bump = (m, k, w) => m.set(k, (m.get(k) || 0) + w);
    const addItem = (it, w) => {
      if (!it) return;
      for (const g of it.g) bump(gw, g, w / Math.sqrt(it.g.length || 1));
      for (const [t, r] of it.t) bump(tw, t, w * (r / 100) / Math.sqrt(it.t.length || 1));
    };
    (p.likeGenres || []).forEach(n => { const i = gIdx(n); if (i >= 0) bump(gw, i, 3); });
    (p.dislikeGenres || []).forEach(n => { const i = gIdx(n); if (i >= 0) bump(gw, i, -6); });
    (p.likeTags || []).forEach(n => { const i = tIdx(n); if (i >= 0) bump(tw, i, 2); });
    (p.dislikeTags || []).forEach(n => { const i = tIdx(n); if (i >= 0) bump(tw, i, -5); });
    (p.liked || []).forEach(id => { addItem(byId.get(id), 2.5); bump(seeds, id, 3); liked.add(id); });
    const banG = new Set((p.dislikeGenres || []).map(gIdx).filter(i => i >= 0));
    const banT = new Set((p.dislikeTags || []).map(tIdx).filter(i => i >= 0));

    // события — от старых к новым, чтобы unlike/unnope отменяли предыдущие
    const ev = (me.events || []).slice().sort((a, b) => a[0] - b[0]);
    const reads = new Map(), likes = new Set(), nopes = new Set();
    for (const [t, k, al] of ev) {
      const d = Math.pow(0.5, (now - t) / HALF_LIFE), it = byId.get(al);
      seen.add(al);
      if (k === 'read') { const r = reads.get(al) || { n: 0, first: t, last: t, d: 0 }; r.n++; r.last = t; r.d = Math.max(r.d, d); reads.set(al, r); }
      else if (k === 'open') addItem(it, 0.4 * d);
      else if (k === 'ext') { addItem(it, 1.2 * d); bump(seeds, al, 1 * d); }
      else if (k === 'like') likes.add(al);
      else if (k === 'unlike') likes.delete(al);
      else if (k === 'nope') nopes.add(al);
      else if (k === 'unnope') nopes.delete(al);
      else if (k === 'want') { addItem(it, 1.5 * d); bump(seeds, al, 1.5 * d); }
      else if (k === 'ignore') addItem(it, -0.7 * d);
    }
    for (const [al, r] of reads) {
      const it = byId.get(al);
      // бросил на первой главе: одна прочитанная глава и больше недели тишины
      if (r.n === 1 && now - r.last > 7 * DAY) { addItem(it, -1.5 * r.d); continue; }
      const w = (1.2 + Math.min(r.n - 1, 5) * 0.6) * r.d;   // несколько глав подряд — сильнее
      addItem(it, w); bump(seeds, al, w); liked.add(al);
    }
    for (const al of likes) { const d = 1; addItem(byId.get(al), 3 * d); bump(seeds, al, 3); liked.add(al); }
    for (const al of nopes) { addItem(byId.get(al), -2); hide.add(al); }
    return { gw, tw, seeds, hide, liked, seen, banG, banT, adult: !!p.adult, likes, wants: new Set(me.wants || []) };
  }

  // похожие на тайтл X по рекомендациям AniList: позиция в списке → вес
  function recBoosts(P) {
    const boost = new Map(), from = new Map();
    for (const [sid, w] of P.seeds) {
      (SIM[sid] || []).forEach((rid, pos) => {
        const v = w * 0.9 * (1 - pos / 12);
        boost.set(rid, (boost.get(rid) || 0) + v);
        if (!from.has(rid) || from.get(rid)[1] < v) from.set(rid, [sid, v]);
      });
    }
    return { boost, from };
  }
  function scoreItem(it, P, B) {
    let s = 0, gBest = [];
    for (const g of it.g) { const w = (P.gw.get(g) || 0) / Math.sqrt(it.g.length); s += w; gBest.push([g, w]); }
    for (const [t, r] of it.t) s += 0.6 * (P.tw.get(t) || 0) * (r / 100) / Math.sqrt(it.t.length);
    s += B.boost.get(it.id) || 0;
    s += 0.6 * (it.score || 60) / 100 + 0.12 * Math.log10(1 + it.pop);   // качество и популярность — слабый фон
    if (it.ours) s += 0.8;                                                // уже переведено у нас — повыше
    if (!it.cover) s -= 0.6;                                              // без обложки — пониже (манга из MangaDex без AniList)
    return { s, gBest: gBest.sort((a, b) => b[1] - a[1]) };
  }
  function allowed(it, P) {
    if (P.hide.has(it.id) || P.liked.has(it.id)) return false;
    if (it.adult && !P.adult) return false;
    if (it.g.some(g => P.banG.has(g)) || it.t.some(([t]) => P.banT.has(t))) return false;
    return true;
  }
  function reasonFor(it, P, B, gBest, explore) {
    if (explore) return 'Попробуйте что-то новое';
    const f = B.from.get(it.id);
    if (f && f[1] > 0.8 && byId.get(f[0])) return 'Похоже на «' + byId.get(f[0]).title + '»';
    const top = gBest.filter(x => x[1] > 0.3).slice(0, 2).map(x => ru(CAT.genres[x[0]]));
    if (top.length) return 'Вы любите: ' + top.join(', ');
    return 'Популярное';
  }

  // Подборка: лучшие по счёту, и каждая пятая — «новое»: тайтл с хорошей оценкой,
  // но жанрами в стороне от главных любимых (так система узнаёт, что ещё может понравиться).
  function recommend(limit, offset = 0) {
    const P = profile(), B = recBoosts(P);
    const scored = [];
    for (const it of byId.values()) if (allowed(it, P)) { const r = scoreItem(it, P, B); scored.push([it, r.s, r.gBest]); }
    scored.sort((a, b) => b[1] - a[1]);
    const topG = [...P.gw].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const day = Math.floor(Date.now() / DAY);
    const rnd = (k) => { let x = Math.sin(day * 9301 + k * 49297) * 233280; return x - Math.floor(x); };
    // «новое»: хорошая оценка, не из самого верха подборки и с жанрами в стороне от двух главных любимых
    const top2 = topG.slice(0, 2);
    const pool = scored.slice(30, 3000).filter(([it]) => (it.score || 0) >= 65 && it.g.filter(g => top2.includes(g)).length <= 1);
    const out = [], used = new Set();
    let main = 0, ex = 0;
    while (out.length < offset + limit && (main < scored.length || ex < pool.length)) {
      const wantExplore = (out.length + 1) % 5 === 0 && pool.length;
      let pickIt;
      if (wantExplore) {
        for (let tries = 0; tries < 30; tries++) { const c = pool[Math.floor(rnd(out.length * 31 + tries) * pool.length)]; if (c && !used.has(c[0].id)) { pickIt = [c, true]; break; } }
      }
      if (!pickIt) { while (main < scored.length && used.has(scored[main][0].id)) main++; if (main >= scored.length) break; pickIt = [scored[main++], false]; }
      const [[it, s, gBest], explore] = pickIt;
      used.add(it.id);
      out.push({ it, why: reasonFor(it, P, B, gBest, explore) });
    }
    return { list: out.slice(offset), P };
  }

  // Похожие на одну мангу: рекомендации AniList для неё + сходство по жанрам/тегам,
  // слегка подстроенные под вкус человека.
  function similarTo(al, limit) {
    const base = byId.get(al), P = profile(), out = [], used = new Set([al]);
    (SIM[al] || []).forEach(id => { const it = byId.get(id); if (it && allowed(it, P) && !used.has(id)) { used.add(id); out.push({ it, why: 'Читатели AniList советуют' }); } });
    if (base && out.length < limit) {
      const tset = new Map(base.t.map(([t, r]) => [t, r]));
      const cand = [];
      for (const it of byId.values()) {
        if (used.has(it.id) || !allowed(it, P)) continue;
        let s = it.g.filter(g => base.g.includes(g)).length / Math.sqrt(base.g.length * (it.g.length || 1) || 1);
        for (const [t, r] of it.t) if (tset.has(t)) s += 1.5 * Math.min(r, tset.get(t)) / 100 / Math.sqrt(base.t.length || 1);
        for (const g of it.g) s += 0.05 * (P.gw.get(g) || 0);
        s += 0.15 * (it.score || 60) / 100;
        cand.push([it, s]);
      }
      cand.sort((a, b) => b[1] - a[1]).slice(0, limit - out.length).forEach(([it]) => out.push({ it, why: 'Похожие жанры и темы' }));
    }
    return out.slice(0, limit);
  }

  // --- карточки --------------------------------------------------------------
  // «Видел несколько раз и ни разу не открыл» — считаем показы в браузере; на третьем — ignore.
  const SEEN_KEY = 'mangall-impr';
  let impr = {}; try { impr = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (_) {}
  const saveImpr = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(impr)); } catch (_) {} };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) {
      io.unobserve(e.target);
      const id = +e.target.dataset.id; const n = (impr[id] || 0) + 1; impr[id] = n;
      if (n === 3) MAuth.track('ignore', id);
      saveImpr();
    }
  }, { threshold: 0.6 }) : null;

  function card({ it, why }, P) {
    const el = document.createElement('div');
    el.className = 'rc'; el.dataset.id = it.id;
    const liked = P.likes.has(it.id), want = P.wants.has(it.id);
    const tags = it.g.slice(0, 3).map(g => ru(CAT.genres[g])).join(' · ');
    // Есть у нас — «Читать» здесь, иначе «Хочу перевод» (голос за то, чтобы перевели у нас).
    const wantBtn = `<button class="btn want" type="button" aria-pressed="${want}">${want ? '✓ Хочу перевод' : 'Хочу перевод'}</button>`;
    const action = it.ours ? `<a class="btn go" href="${S.root}manga/${esc(it.ours)}/">Читать</a>` : wantBtn;
    // Обложка и название ведут на страницу тайтла (title.html): описание и главы — английские с
    // MangaDex и русские с readmanga/Senkuro/seimanga/MangaLib.
    const readHref = `${S.root}title.html?id=${it.id}`;
    el.innerHTML = `<a class="cv" href="${esc(readHref)}">
        ${it.cover ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(it.cover)}"${it.cover2 ? ` srcset="${esc(it.cover)} 230w, ${esc(it.cover2)} 460w" sizes="(max-width:600px) 45vw, 220px"` : ''} alt="">` : ''}
        ${it.ours ? '<span class="our">Есть на MangALL</span>' : ''}</a>
      <div class="rb"><a class="tt" href="${esc(readHref)}">${esc(it.title)}</a>
        ${it.alt ? `<div class="alt mut">${esc(it.alt)}</div>` : ''}
        <div class="mut">${it.score ? '★ ' + (it.score / 10).toFixed(1) + ' · ' : ''}${it.year || ''}${it.fmt && FMT[it.fmt] ? ' · ' + FMT[it.fmt] : ''}</div>
        <div class="mut">${esc(tags)}</div>
        <div class="why">${esc(why)}</div>
        <div class="acts">${action}
          <button class="ib like" type="button" aria-pressed="${liked}" title="Нравится"><span><i class="ic i-heart"></i></span></button>
          <button class="ib nope" type="button" title="Не интересно — больше не показывать"><span><i class="ic i-x"></i></span></button></div></div>`;
    el.querySelectorAll('a.cv, a.tt').forEach(a => a.addEventListener('click', () => { MAuth.track('open', it.id); impr[it.id] = -99; saveImpr(); }));
    const likeB = el.querySelector('.like');
    likeB.onclick = () => {
      const on = likeB.getAttribute('aria-pressed') !== 'true';
      likeB.setAttribute('aria-pressed', on); MAuth.track(on ? 'like' : 'unlike', it.id);
      me.events.push([Date.now(), on ? 'like' : 'unlike', it.id, null]);
    };
    el.querySelector('.nope').onclick = () => {
      MAuth.track('nope', it.id); me.events.push([Date.now(), 'nope', it.id, null]);
      el.classList.add('gone');
      const undo = document.createElement('div'); undo.className = 'undo';
      undo.innerHTML = `Скрыто: «${esc(it.title)}» <button class="btn" type="button">Вернуть</button>`;
      undo.querySelector('button').onclick = () => { MAuth.track('unnope', it.id); me.events.push([Date.now(), 'unnope', it.id, null]); undo.replaceWith(el); el.classList.remove('gone'); };
      setTimeout(() => el.replaceWith(undo), 250);
    };
    const wantB = el.querySelector('.want');
    if (wantB) wantB.onclick = async () => {
      const on = wantB.getAttribute('aria-pressed') !== 'true';
      wantB.disabled = true;
      try {
        await MAuth.api('/want', { method: 'POST', body: { al: it.id, title: it.title, on } });
        wantB.setAttribute('aria-pressed', on); wantB.textContent = on ? '✓ Хочу перевод' : 'Хочу перевод';
        if (on) { me.wants.push(it.id); me.events.push([Date.now(), 'want', it.id, null]); } else me.wants = me.wants.filter(x => x !== it.id);
      } catch (e) { if (e.login) MAuth.open('Войдите ещё раз, чтобы голосовать за перевод.'); else alert('Не получилось: ' + e.message); }
      finally { wantB.disabled = false; }
    };
    const img = el.querySelector('.cv img');
    if (img) img.onerror = () => {
      // у части старых тайтлов на AniList нет большой обложки — откатываемся на 230px, и только потом на название
      if (img.srcset) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.src = it.cover; return; }
      const cv = el.querySelector('.cv'); img.remove(); cv.classList.add('noimg'); cv.insertAdjacentText('afterbegin', it.title);
    };
    else { const cv = el.querySelector('.cv'); cv.classList.add('noimg'); cv.insertAdjacentText('afterbegin', it.title); }
    if (io) io.observe(el);
    return el;
  }

  // --- опрос вкусов ----------------------------------------------------------
  function quiz(prefill, onDone) {
    const p = prefill || {};
    const state = new Map();   // имя → 1 (люблю) / -1 (не люблю)
    (p.likeGenres || []).concat(p.likeTags || []).forEach(n => state.set(n, 1));
    (p.dislikeGenres || []).concat(p.dislikeTags || []).forEach(n => state.set(n, -1));
    const liked = new Set(p.liked || []);
    const chip = n => `<button type="button" class="chip" data-n="${esc(n)}" data-s="${state.get(n) || 0}">${esc(ru(n))}</button>`;
    root.innerHTML = `<div class="quiz">
      <h1>Что вам нравится?</h1>
      <p class="mut">Нажмите один раз — «люблю» (красный), второй — «не люблю» (зачёркнуто), третий — сбросить. Потом подборка будет сама подстраиваться под то, что вы читаете.</p>
      <h2>Жанры</h2><div class="chips">${GENRES_QUIZ.map(chip).join('')}</div>
      <h2>Темы</h2><div class="chips">${TAGS_QUIZ.map(chip).join('')}</div>
      <label class="adult"><input type="checkbox" ${p.adult ? 'checked' : ''}> Показывать 18+</label>
      <h2>3–5 манг, которые вам понравились</h2>
      <input class="search" type="search" placeholder="Название (по-английски или ромадзи)…" autocomplete="off">
      <div class="found"></div><div class="picked"></div>
      <div class="row"><button type="button" class="btn skip">Пропустить</button><button type="button" class="btn go done">Готово</button></div>
      <div class="msg mut"></div></div>`;
    root.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      const n = b.dataset.n, s = state.get(n) || 0, nx = s === 0 ? 1 : s === 1 ? -1 : 0;
      nx ? state.set(n, nx) : state.delete(n); b.dataset.s = nx;
    });
    const found = root.querySelector('.found'), picked = root.querySelector('.picked'), search = root.querySelector('.search');
    const renderPicked = () => {
      picked.innerHTML = [...liked].map(id => byId.get(id)).filter(Boolean).map(it =>
        `<span class="pk">${esc(it.title)} <button type="button" data-id="${it.id}" aria-label="Убрать">✕</button></span>`).join('');
      picked.querySelectorAll('button').forEach(b => b.onclick = () => { liked.delete(+b.dataset.id); renderPicked(); });
    };
    renderPicked();
    let tmr;
    search.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => {
      const q = search.value.trim().toLowerCase();
      if (q.length < 2) { found.innerHTML = ''; return; }
      const res = [];
      for (const it of byId.values()) { if ((it.title + ' ' + it.alt).toLowerCase().includes(q)) { res.push(it); if (res.length >= 8) break; } }
      found.innerHTML = res.map(it => `<button type="button" class="fd" data-id="${it.id}">${it.cover ? `<img referrerpolicy="no-referrer" src="${esc(it.cover)}" alt="">` : ''}<span>${esc(it.title)}<small class="mut">${it.year || ''}</small></span></button>`).join('') || '<div class="mut">Ничего не нашлось</div>';
      found.querySelectorAll('.fd').forEach(b => b.onclick = () => { liked.add(+b.dataset.id); search.value = ''; found.innerHTML = ''; renderPicked(); search.focus(); });
    }, 150); };
    const save = async (skip) => {
      const msg = root.querySelector('.msg');
      const body = skip ? { done: true } : {
        likeGenres: GENRES_QUIZ.filter(n => state.get(n) === 1), dislikeGenres: GENRES_QUIZ.filter(n => state.get(n) === -1),
        likeTags: TAGS_QUIZ.filter(n => state.get(n) === 1), dislikeTags: TAGS_QUIZ.filter(n => state.get(n) === -1),
        liked: [...liked], adult: root.querySelector('.adult input').checked };
      msg.textContent = 'Сохраняю…';
      try { const d = await MAuth.api('/me/prefs', { method: 'PUT', body }); me.prefs = d.prefs; onDone(); }
      catch (e) { msg.textContent = 'Не получилось: ' + e.message; if (e.login) MAuth.open(); }
    };
    root.querySelector('.done').onclick = () => save(false);
    root.querySelector('.skip').onclick = () => save(true);
  }

  // --- «Мои вкусы» -----------------------------------------------------------
  function tastes() {
    const P = profile();
    const top = (m, names, n) => [...m].filter(x => x[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, n);
    const mx = Math.max(0.01, ...[...P.gw.values()], ...[...P.tw.values()]);
    const bar = (name, w) => `<div class="bar"><span>${esc(ru(name))}</span><i style="width:${Math.round(100 * w / mx)}%"></i></div>`;
    const gs = top(P.gw, CAT.genres, 8).map(([g, w]) => bar(CAT.genres[g], w)).join('');
    const ts = top(P.tw, CAT.tags, 10).map(([t, w]) => bar(CAT.tags[t], w)).join('');
    const neg = [...P.gw].filter(x => x[1] < -0.5).map(x => ru(CAT.genres[x[0]]));
    return `<div class="tastes"><h2>Мои вкусы</h2>
      <p class="mut">Так система сейчас понимает ваши вкусы — по опросу и по тому, что вы читаете, лайкаете и скрываете. Свежие действия весят больше старых.</p>
      <div class="cols"><div><h3>Жанры</h3>${gs || '<p class="mut">Пока ничего</p>'}</div><div><h3>Темы</h3>${ts || '<p class="mut">Пока ничего</p>'}</div></div>
      ${neg.length ? `<p class="mut">Не нравится: ${esc(neg.join(', '))}</p>` : ''}
      <div class="row"><button type="button" class="btn edit">Изменить вкусы</button><button type="button" class="btn reset">Сбросить всё</button><button type="button" class="btn go close">Назад к подборке</button></div></div>`;
  }

  // --- режим «Только с readmanga» -------------------------------------------
  // Показываем только мангу, которую нашёл поиск readmanga (через локальный relay, node relay.js).
  // relay не запущен — режим молча выключается и показывается всё.
  const RELAY = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'https://mangall-relay.nake000071.workers.dev' : /^(192\.168|10)\./.test(location.hostname) ? location.origin + '/relay' : location.origin + '/api');   // localhost — relay на компьютере; домашняя сеть — через serve.py (/relay/); Cloudflare Pages — облачный API (/api/)
  const RM_KEY = 'mangall-rm-only';
  let rmOnly = true; try { rmOnly = localStorage.getItem(RM_KEY) !== '0'; } catch (_) {}
  const rmHas = new Map();   // id AniList → {title, manga} | null
  async function checkRm(items) {
    const need = items.filter(it => !rmHas.has(it.id));
    for (let i = 0; i < need.length; i += 30) {
      const chunk = need.slice(i, i + 30).map(it => ({ id: it.id, q: it.title, alt: it.alt }));
      const r = await fetch(RELAY + '/has?items=' + encodeURIComponent(JSON.stringify(chunk)));
      if (!r.ok) throw new Error('relay ' + r.status);
      const d = await r.json();
      for (const [id, v] of Object.entries(d)) rmHas.set(+id, v);
    }
  }
  const onRm = it => !!rmHas.get(it.id);
  // Из потока кандидатов набираем limit штук, которые есть на readmanga. next(n) → следующие n кандидатов.
  async function pickRm(next, limit, maxBatches = 8) {
    const out = [];
    for (let b = 0; b < maxBatches && out.length < limit; b++) {
      const batch = next(48);
      if (!batch.length) break;
      await checkRm(batch.map(x => x.it));
      batch.forEach(x => { if (onRm(x.it) && out.length < limit) out.push(x); });
    }
    return out;
  }
  const rmToggle = () => `<label class="rmonly" title="Показывать только мангу, которая есть на readmanga или seimanga">
      <input type="checkbox"${rmOnly ? ' checked' : ''}> Только то, что можно читать</label>`;
  function bindRmToggle(again) {
    const cb = root.querySelector('.rmonly input');
    if (cb) cb.onchange = () => { rmOnly = cb.checked; try { localStorage.setItem(RM_KEY, rmOnly ? '1' : '0'); } catch (_) {} again(); };
  }

  // --- страница «Рекомендации» ----------------------------------------------
  let shown = 0;
  function showPicks() {
    const P = profile();
    root.innerHTML = `<div class="rhead"><h1>Для вас</h1>${rmToggle()}<button type="button" class="btn my">Мои вкусы</button></div>
      <div class="rmnote mut" hidden></div>
      <div class="grid"></div><div class="more"><button type="button" class="btn go">Показать ещё</button></div><div class="panel" hidden></div>`;
    const grid = root.querySelector('.grid'), moreBox = root.querySelector('.more'), note = root.querySelector('.rmnote');
    bindRmToggle(showPicks);
    shown = 0;
    let pos = 0, busy = false;   // pos — сколько кандидатов уже просмотрено (с фильтром их больше, чем показано)
    const more = async () => {
      if (busy) return; busy = true;
      const btn = moreBox.querySelector('button');
      try {
        if (!rmOnly) {
          const { list, P: P2 } = recommend(24, shown); list.forEach(x => grid.appendChild(card(x, P2))); shown += list.length;
          if (!list.length) moreBox.hidden = true;
          return;
        }
        btn.disabled = true; btn.textContent = 'Ищу на readmanga…';
        const P2 = profile();
        const next = n => { const { list } = recommend(n, pos); pos += list.length; return list; };
        const list = await pickRm(next, 24);
        list.forEach(x => grid.appendChild(card(x, P2))); shown += list.length;
        if (!list.length) { moreBox.hidden = true; if (!shown) { note.hidden = false; note.textContent = 'Не нашлось манги с readmanga/seimanga среди подходящих.'; } }
      } catch (e) {
        // relay не отвечает — показываем всё, как раньше
        rmOnly = false; note.hidden = false;
        note.textContent = 'Не могу проверить readmanga (запущен ли node relay.js?) — показываю всё.';
        const cb = root.querySelector('.rmonly input'); if (cb) cb.checked = false;
        busy = false; return more();
      } finally { busy = false; btn.disabled = false; btn.textContent = 'Показать ещё'; }
    };
    more();
    root.querySelector('.more button').onclick = more;
    root.querySelector('.my').onclick = () => {
      const panel = root.querySelector('.panel');
      panel.innerHTML = tastes(); panel.hidden = false; grid.hidden = true; root.querySelector('.more').hidden = true;
      panel.querySelector('.close').onclick = showPicks;
      panel.querySelector('.edit').onclick = () => quiz(me.prefs, showPicks);
      panel.querySelector('.reset').onclick = async () => {
        if (!confirm('Сбросить все ваши вкусы и историю для рекомендаций?')) return;
        try { await MAuth.api('/me', { method: 'DELETE' }); await loadMe(); start(); } catch (e) { alert('Не получилось: ' + e.message); }
      };
    };
  }

  function gate(text) {
    root.innerHTML = `<div class="gate"><h1>${S.recsMode === 'page' ? 'Рекомендации' : 'Похожие'}</h1><p class="mut">${esc(text)}</p>
      <button type="button" class="btn go">Войти через Google</button></div>`;
    root.querySelector('button').onclick = () => MAuth.open('Войдите через Google, чтобы получить подборку по вашим вкусам.');
  }


  // --- главная: «Рекомендации» под каталогом, в его же оформлении (SITE.recsMode = 'grid') ---
  // карточки и пагинация — классы каталога mangall-next (next/style.css), подборка — recommend().
  // подборка «бесконечная»: «Вперёд» есть всегда, а перейти номером можно только до самой
  // дальней страницы, до которой уже долистали (она же — последний номер в пагинации).
  let gridPage = 1, gridMax = 1;
  try { gridMax = Math.max(1, +localStorage.getItem('mangall-recs-max') || 1); } catch (_) {}
  const gridCols = () => matchMedia('(max-width: 560px)').matches ? 1 : matchMedia('(max-width: 860px)').matches ? 2 : 3;
  function gridMsg(html) { root.innerHTML = `<div class="grid-loading">${html}</div>`; }
  function gridCard({ it, why }, row, col) {
    const tags = it.g.map(g => CAT.genres[g]).concat(it.t.map(([t]) => CAT.tags[t])).slice(0, 6);
    return `<a class="catalog-card" href="${S.root}title.html?id=${it.id}" data-id="${it.id}" style="grid-row:${row};grid-column:${col};">
      <div class="catalog-card-frame">${it.cover ? `<img class="catalog-card-img" src="${esc(it.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="catalog-card-img"></div>'}</div>
      <div class="catalog-card-body">
        <div class="catalog-card-title">${esc(it.title)}</div>
        <div class="catalog-card-tags">${tags.map(t => `<span class="catalog-card-tag">${esc(t)}</span>`).join('')}</div>
        <div class="catalog-card-meta">${esc(why)}</div>
      </div></a>`;
  }
  function gridPager(cur, max) {
    const btn = (label, page, cls, off) => `<button type="button" class="catalog-pager-btn${cls ? ' ' + cls : ''}" data-page="${page}"${off ? ' disabled' : ''}><span class="catalog-pager-btn-inner">${label}</span></button>`;
    const pts = [...new Set([1, cur, max])].sort((a, b) => a - b);
    let out = btn('← Назад', cur - 1, 'catalog-pager-arrow', cur <= 1), last = 0;
    for (const p of pts) { if (last && p - last > 1) out += '<span class="catalog-pager-ellipsis">…</span>'; out += btn(p, p, p === cur ? 'active' : ''); last = p; }
    return out + btn('Вперёд →', cur + 1, 'catalog-pager-arrow', false);
  }
  function gridGo(p) {
    gridPage = Math.max(1, p);
    if (gridPage > gridMax) { gridMax = gridPage; try { localStorage.setItem('mangall-recs-max', gridMax); } catch (_) {} }
    showGrid();   // страница остаётся на месте — без прокрутки
  }

  // «Мои вкусы» и опрос на главной — в той же светлой области, где карточки (класс recs-panel)
  function gridPanel(html) { root.innerHTML = `<div class="recs-panel">${html}</div>`; return root.querySelector('.recs-panel'); }
  function gridQuiz(prefill) {
    quiz(prefill, () => { setTastesBtn(true); showGrid(); });
    // опрос нарисован прямо в root — переносим его узлы в светлую панель (обработчики сохраняются)
    const inner = document.createElement('div'); inner.className = 'recs-panel';
    while (root.firstChild) inner.appendChild(root.firstChild);
    root.appendChild(inner);
  }
  function gridTastes() {
    const panel = gridPanel(tastes());
    panel.querySelector('.close').onclick = showGrid;
    panel.querySelector('.edit').onclick = () => gridQuiz(me.prefs);
    panel.querySelector('.reset').onclick = async () => {
      if (!confirm('Сбросить все ваши вкусы и историю для рекомендаций?')) return;
      try { await MAuth.api('/me', { method: 'DELETE' }); await loadMe(); start(); } catch (e) { alert('Не получилось: ' + e.message); }
    };
  }
  // кнопка «Мои вкусы» в заголовке раздела (templates/home.html) — видна только вошедшим
  function setTastesBtn(on) {
    const b = document.getElementById('recs-tastes-btn');
    if (!b) return;
    b.hidden = !on;
    b.onclick = () => { if (root.querySelector('.tastes')) showGrid(); else gridTastes(); };
  }

  function showGrid() {
    const per = gridCols() * 3;
    const { list } = recommend(per, (gridPage - 1) * per);
    const rows = Math.ceil(list.length / gridCols());
    root.innerHTML = `<div class="catalog-pager" style="margin-bottom:var(--space-6)">${gridPager(gridPage, gridMax)}</div>
      <div class="catalog-grid">${list.length ? list.map((x, k) => gridCard(x, (k % rows) + 1, Math.floor(k / rows) + 1)).join('') : '<div class="grid-loading">Пока нечего посоветовать.</div>'}</div>
      <div class="catalog-pager">${gridPager(gridPage, gridMax)}</div>
      <form class="catalog-pager-jump">
        <label for="recs-pager-input">Стр.</label>
        <div class="catalog-pager-input-frame"><input type="number" id="recs-pager-input" class="catalog-pager-input" min="1" max="${gridMax}" step="1" inputmode="numeric" placeholder="${gridPage}"></div>
        <span>из ${gridMax}</span>
        <button type="submit" class="catalog-pager-go"><span class="catalog-pager-go-inner">Перейти</span></button>
      </form>`;
    root.querySelectorAll('.catalog-pager-btn').forEach(b => b.onclick = () => gridGo(+b.dataset.page));
    // номером — не дальше самой дальней страницы, до которой уже дошли
    root.querySelector('.catalog-pager-jump').onsubmit = e => {
      e.preventDefault();
      const v = parseInt(root.querySelector('#recs-pager-input').value, 10);
      if (v) gridGo(Math.min(Math.max(1, v), gridMax));
    };
    root.querySelectorAll('.catalog-card').forEach(a => a.addEventListener('click', () => MAuth.track('open', +a.dataset.id)));
  }

  async function start() {
    if (S.recsMode === 'grid' && !MAuth.user) {
      setTastesBtn(false);
      gridMsg('Подборка по вашим вкусам — для вошедших.<br><br><button type="button" class="catalog-chip"><span class="catalog-chip-inner">Войти через Google</span></button>');
      root.querySelector('button').onclick = () => MAuth.open('Войдите через Google, чтобы получить подборку по вашим вкусам.');
      return;
    }
    if (!MAuth.user) {
      return S.recsMode === 'page'
        ? gate('Подборка манги по вашим вкусам — только для вошедших. Отметите любимые жанры, и дальше подборка будет сама подстраиваться под то, что вы читаете.')
        : gate('Войдите, чтобы видеть похожую мангу с учётом ваших вкусов.');
    }
    root.innerHTML = S.recsMode === 'grid' ? '<div class="grid-loading">Загрузка...</div>' : '<p class="mut">Загружаю…</p>';
    try { await loadData(); if (!me) await loadMe(); }
    catch (e) { root.innerHTML = `<p class="mut">Не получилось загрузить: ${esc(e.message)}</p>`; if (e.login) gate('Вход устарел — войдите ещё раз.'); return; }
    if (S.recsMode === 'similar') {
      const showSimilar = async () => {
        const P = profile();
        let list = similarTo(+S.al, 12), note = '';
        if (rmOnly) {
          root.innerHTML = `<div class="rhead"><h2>Похожие</h2>${rmToggle()}</div><p class="mut">Ищу на readmanga…</p>`;
          try {
            const all = similarTo(+S.al, 60); let k = 0;
            list = await pickRm(n => { const b = all.slice(k, k + n); k += b.length; return b; }, 12, 2);
            if (!list.length) note = 'Похожей манги с readmanga/seimanga не нашлось.';
          } catch (e) { note = 'Не могу проверить readmanga (запущен ли node relay.js?) — показываю всё.'; }
        }
        root.innerHTML = `<div class="rhead"><h2>Похожие</h2>${rmToggle()}</div>${note ? `<p class="mut">${esc(note)}</p>` : ''}<div class="grid"></div>`;
        list.forEach(x => root.querySelector('.grid').appendChild(card(x, P)));
        bindRmToggle(showSimilar);
      };
      return showSimilar();
    }
    if (S.recsMode === 'grid') {
      if (!(me.prefs && me.prefs.done)) { setTastesBtn(false); return gridQuiz(null); }   // сначала опрос вкусов
      setTastesBtn(true);
      let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(showGrid, 200); });
      return showGrid();
    }
    if (!(me.prefs && me.prefs.done)) return quiz(null, showPicks);
    showPicks();
  }
  MAuth.onChange(u => { if (!u) me = null; start(); });
  start();
})();
