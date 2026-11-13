// Общее для всех страниц (главная + каталог) — тема и меню аккаунта.
// Виджет-логика (ImageLoader, лента+разворот) — только в app.js, там она
// и нужна; сюда её тащить незачем.

// ── Тема: сохранённый выбор > светлая по умолчанию ──
(function initTheme() {
  const saved = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
})();

// theme-toggle есть не на каждой странице — например, на finish-
// registration.html шапка урезана до логотипа, без меню аккаунта вообще
// (человек ещё даже не долистал регистрацию). Без проверки на null тут
// был бы TypeError, который в том же <script> оборвал бы и код ниже
// (esc/chapterBadge и т.д. переживут — это hoisted function-декларации,
// а вот initAccountMenu() ниже просто не запустился бы).
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── Меню аккаунта: открытие/закрытие по кнопке, клику вне меню и Esc.
// Закладки/Уведомления — пока пункты-заглушки (href="#", нет ни бэкенда,
// ни этих страниц) — клик по ним просто закрывает меню. Каталог — уже
// настоящая ссылка (якорь на секцию ниже на этой же странице,
// href="#catalog-page"), её не трогаем, пусть ведёт по назначению.
// Войти/Выйти — настоящие, см. initAuth() ниже. ──
(function initAccountMenu() {
  const nav = document.querySelector('.nav-account');
  if (!nav) return; // см. коммент про themeToggle выше — той же причине.
  const toggle = document.getElementById('account-toggle');
  const menu = document.getElementById('account-menu');

  // Класс .open на .nav-account вместо menu.hidden — display:none нельзя
  // анимировать (нужно для «выезда» из угла кнопки), поэтому открытие/
  // закрытие теперь через opacity+scale в CSS (см. .account-menu).
  function setOpen(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));

  menu.addEventListener('click', e => {
    const item = e.target.closest('.account-menu-item');
    if (item && item.tagName === 'A' && item.getAttribute('href') === '#') e.preventDefault(); // заглушка, некуда вести
    if (item) setOpen(false);
  });

  document.addEventListener('click', e => {
    if (nav.classList.contains('open') && !e.target.closest('.nav-account')) setOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false);
  });
})();

// Уведомлений и входа mangall-next тут нет (сайт статический): вход — на странице рекомендаций.

const RELAY = window.RELAY || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'https://mangall-relay.nake000071.workers.dev' : /^(192\.168|10)\./.test(location.hostname) ? location.origin + '/relay' : location.origin + '/api');   // relay: каталог, поиск, главы (localhost — relay; домашняя сеть — serve.py /relay/; Cloudflare Pages — /api/)

function pluralChapters(n) {
  const n100 = n % 100, n10 = n % 10;
  if (n10 === 1 && n100 !== 11) return 'глава';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'главы';
  return 'глав';
}
function chapterBadge(n) { return `${n} ${pluralChapters(n)}`; }

// В базе в genres намешаны рейтинги контента, а не только жанры — прячем их.
const NOT_A_GENRE = new Set(['Safe', 'Suggestive', 'Erotica', 'Pornographic']);
function firstGenres(genres, n) {
  return (Array.isArray(genres) ? genres : (genres || '').split(',')).map(g => g.trim())
    .filter(g => g && !NOT_A_GENRE.has(g)).slice(0, n);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Живые подсказки в строке поиска шапки — портировано с /search на 8080
// (тот же /api/manga/suggest, см. search.go), но как выпадающий список под
// строкой в шапке, а не отдельная страница (на 8080 это была своя большая
// страница с тем же полем). Общий файл, не app.js/catalog.js — .nav-search
// одинаковая что на главной, что на странице тайтла (см. index.html/
// manga.html), а не только "на главной", как буквально просили — так не
// пришлось бы заводить копию этого куска под каждую страницу с такой же
// шапкой. ──
(function initNavSearch() {
  const input = document.getElementById('nav-search-input');
  const dropdown = document.getElementById('nav-search-dropdown');
  if (!input || !dropdown) return; // страницы без шапки/поиска (finish-registration и т.п.)

  let lastQuery = '';
  let activeIndex = -1;
  let reqSeq = 0; // отбрасываем устаревший ответ, если пользователь уже допечатал дальше

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function open() { dropdown.hidden = false; }
  function close() { dropdown.hidden = true; activeIndex = -1; }

  input.addEventListener('input', debounce(() => {
    const query = input.value.trim();
    if (query === lastQuery) return;
    lastQuery = query;
    activeIndex = -1;

    if (query.length < 2) {
      close();
      return;
    }
    doSearch(query);
  }, 150));

  input.addEventListener('focus', () => {
    if (dropdown.children.length && input.value.trim().length >= 2) open();
  });

  input.addEventListener('keydown', e => {
    // Enter — отдельно, ДО общего "если список закрыт — выходим" ниже:
    // если список пуст/скрыт (меньше 2 символов, ничего не найдено,
    // ошибка сети — не важно), Enter не должен просто теряться. С
    // выбранной стрелками подсказкой — переходим по ней, как обычно;
    // без выбора — едем в каталог с этим же запросом (см. goToCatalog).
    if (e.key === 'Enter') {
      const items = dropdown.hidden ? [] : dropdown.querySelectorAll('.nav-search-item');
      if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].click();
      } else {
        e.preventDefault();
        goToCatalog(input.value.trim());
      }
      return;
    }
    if (dropdown.hidden) return;
    const items = dropdown.querySelectorAll('.nav-search-item');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      setActive(items);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      setActive(items);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  // goToCatalog — на самой главной каталог уже на странице (секция
  // #catalog-page, см. catalog.js) — применяем запрос прямо в её
  // фильтре и скроллим к ней, без перезагрузки. С любой другой страницы
  // (manga.html и т.п., там своего каталога нет) — обычный переход на
  // главную с ?q=..., catalog.js сам подхватит его при загрузке (см. её
  // же urlQuery), а до #catalog-page браузер доскроллит сам по фрагменту
  // в адресе — отдельный JS-скролл тут не нужен.
  function goToCatalog(query) {
    close();
    if (typeof window.applyCatalogQuery === 'function') {
      window.applyCatalogQuery(query);
      document.getElementById('catalog-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      location.href = './?q=' + encodeURIComponent(query) + '#catalog-page';
    }
  }

  document.addEventListener('click', e => {
    if (!dropdown.hidden && !e.target.closest('.nav-search-frame')) close();
  });

  function setActive(items) {
    items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0) items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  async function doSearch(query) {
    const seq = ++reqSeq;
    dropdown.innerHTML = '<div class="nav-search-state">Ищем…</div>';
    open();
    try {
      const resp = await fetch(`${RELAY}/suggest?q=${encodeURIComponent(query)}&limit=8`);
      const data = await resp.json();
      if (seq !== reqSeq) return;
      if (!data || data.length === 0) {
        dropdown.innerHTML = '<div class="nav-search-state">Ничего не найдено</div>';
        return;
      }
      renderSuggestions(data, query);
    } catch (e) {
      if (seq !== reqSeq) return;
      dropdown.innerHTML = '<div class="nav-search-state">Ошибка соединения</div>';
    }
  }

  function renderSuggestions(items, query) {
    dropdown.innerHTML = items.map(m => `
        <a class="nav-search-item" href="title.html?id=${m.id}">
          <div class="nav-search-title">${highlight(m.title, query)}</div>
          ${m.alt && m.alt !== m.title ? `<div class="nav-search-alt">${highlight(m.alt, query)}</div>` : ''}
        </a>`).join('');
  }

  function parseAltTitles(raw) {
    if (!raw) return [];
    try {
      const obj = JSON.parse(raw);
      return Object.values(obj).filter(v => typeof v === 'string' && v.trim());
    } catch (e) {
      return [];
    }
  }

  function highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return safe;
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + query.length)) + '</mark>' + esc(text.slice(idx + query.length));
  }
})();
