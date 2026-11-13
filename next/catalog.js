// MangALL — логика секции каталога на главной (см. index.html, там же
// вся её разметка). Тема, меню аккаунта, текстовые хелперы (esc/
// chapterBadge) — общие, см. common.js.

const grid = document.getElementById('catalog-grid');
// Пагинация продублирована сверху и снизу сетки (см. index.html) —
// рендерим в обе разом, чтобы не скроллить через весь список ради
// перехода на следующую страницу.
const pagers = [document.getElementById('catalog-pager-top'), document.getElementById('catalog-pager-bottom')];
const jumpForm = document.getElementById('catalog-pager-jump');
const jumpInput = document.getElementById('catalog-pager-input');
const jumpTotalEl = document.getElementById('catalog-pager-total');
const typeChipsEl = document.getElementById('catalog-type-chips');
const tagChipsEl = document.getElementById('catalog-tag-chips');
const moreTagsBtn = document.getElementById('catalog-more-tags');
const applyBtn = document.getElementById('catalog-apply');

// Число колонок сетки меняется по ширине экрана (см. .catalog-grid в
// CSS: 3 / 2 / 1) — размер страницы подстраивается вслед за ним
// (колонки × 3 строки), чтобы всегда было ровно 3 строки, а не фиксные
// 9 карточек, которые на 1 колонке растянулись бы в 9 строк.
const ROWS = 3;
function currentColumns() {
  if (window.matchMedia('(max-width: 560px)').matches) return 1;
  if (window.matchMedia('(max-width: 860px)').matches) return 2;
  return 3;
}
let LIMIT = currentColumns() * ROWS;

// При смене брейкпоинта (поворот телефона, ресайз окна) — перезапросить
// с новым размером страницы; debounce — resize стреляет очень часто, не
// на каждое событие дёргаем сеть, а после того как всё устаканилось.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const newLimit = currentColumns() * ROWS;
    if (newLimit !== LIMIT) {
      LIMIT = newLimit;
      currentPage = 1;
      loadPage();
    }
  }, 200);
});

const VISIBLE_TAGS = 14; // остальные — под "Ещё теги" (см. renderTagChips)

const selectedTypes = new Set();
const selectedTags = new Set();
let allTags = [];
let currentPage = 1;
let totalPagesCache = 1;
let currentQuery = ''; // текстовый поиск — см. applyCatalogQuery ниже
// translated=1 в URL — стрелка у "Новые главы" ведёт сюда с этим
// параметром (см. index.html) — только манга с хотя бы одной реально
// переведённой (visible=1) главой, не голые заглушки с MangaDex.
let onlyTranslated = false;   // «только переведённые» — на mangall-next; тут не используется

jumpForm.addEventListener('submit', e => {
  e.preventDefault();
  const p = Math.min(Math.max(1, parseInt(jumpInput.value, 10) || 1), totalPagesCache);
  jumpInput.value = '';
  goToPage(p);
});

// ── Панель фильтров — всплывает от кнопки, та же механика открытия/
// закрытия, что у .account-menu в шапке (см. initAccountMenu в
// common.js): класс .open на обёртке, opacity+scale в CSS. ──
(function initFilterMenu() {
  const wrap = document.getElementById('catalog-filter-wrap');
  const toggle = document.getElementById('catalog-filter-toggle');

  function setOpen(open) {
    wrap.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => setOpen(!wrap.classList.contains('open')));
  document.addEventListener('click', e => {
    if (wrap.classList.contains('open') && !e.target.closest('.catalog-filter-wrap')) setOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && wrap.classList.contains('open')) setOpen(false);
  });

  // Доступно снаружи — «Применить» закрывает панель тем же путём, что и
  // клик мимо/Esc (см. applyBtn.onclick ниже).
  window.closeFilterMenu = () => setOpen(false);
})();

// ── Тип (Манга/Манхва/Маньхуа) — разметка уже в index.html, вешаем
// только переключение — по механике тот же чипс-мультивыбор, что и теги
// ниже, просто из другого поля в базе (orig_language, не genres). ──
typeChipsEl.querySelectorAll('.catalog-chip').forEach(chip => {
  chip.onclick = () => {
    const t = chip.dataset.type;
    if (selectedTypes.has(t)) { selectedTypes.delete(t); chip.classList.remove('active'); }
    else { selectedTypes.add(t); chip.classList.add('active'); }
  };
});

// ── Жанры — список с сервера (см. /api/tags, посчитан один раз при
// старте сервера) — 77 тегов сразу одним рядом нечитаемо, поэтому по
// умолчанию только самые частые, остальное — по клику "Ещё теги". ──
function renderTagChips() {
  tagChipsEl.innerHTML = '';
  const expanded = tagChipsEl.classList.contains('is-expanded');
  const shown = expanded ? allTags : allTags.slice(0, VISIBLE_TAGS);
  shown.forEach(t => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'catalog-chip' + (selectedTags.has(t.name) ? ' active' : '');
    // Вложенный span — та же «рамка из фона» (двухслойный клип), что и
    // везде на сайте: у однослойного border+clip-path бордер пропадает
    // ровно на срезанном уголке (сам clip-path обрезает и рамку тоже).
    chip.innerHTML = `<span class="catalog-chip-inner">${esc(t.name)}</span>`;
    chip.onclick = () => {
      if (selectedTags.has(t.name)) { selectedTags.delete(t.name); chip.classList.remove('active'); }
      else { selectedTags.add(t.name); chip.classList.add('active'); }
    };
    tagChipsEl.appendChild(chip);
  });
  moreTagsBtn.hidden = allTags.length <= VISIBLE_TAGS;
  moreTagsBtn.textContent = expanded ? 'Свернуть ↑' : 'Ещё теги ↓';
}

moreTagsBtn.onclick = () => {
  tagChipsEl.classList.toggle('is-expanded');
  renderTagChips();
};

async function loadTags() {
  try {
    allTags = await fetch(RELAY + '/tags').then(r => r.json());
  } catch (e) {
    allTags = [];
  }
  renderTagChips();
}

// ── Карточка тайтла — строкой, не плиткой: обложка слева, справа
// название + теги + число глав. Ссылка на /manga/{slug} — та страница
// теперь есть (см. manga.html/manga.js). ──
// gridRow/gridColumn — явная позиция в CSS-сетке (1-индексация, как у
// самого grid-row/grid-column), а не порядок в разметке. По прямой
// просьбе "порядок сверху вниз, потом следующий столбец": .catalog-grid
// (см. style.css) — grid без своего grid-auto-flow, то есть по умолчанию
// заполняется по рядам (1,2,3 / 4,5,6 / ...) — карточки уже ПРИХОДЯТ с
// сервера в нужном порядке чтения (по свежести), но чтобы он читался
// сверху вниз внутри столбца, а не слева направо по рядам, каждой
// карточке при рендере (см. loadPage) вычисляется своя явная ячейка —
// так же надёжно работает и на неполной последней странице (когда число
// карточек не делится на число колонок ровно), см. комментарий там же.
let COVER = { base: '', md: 'mdcovers/' };
// обложка: AniList — имя файла (CDN AniList), «~N» — из папки обложек нашей базы MangaDex
const coverURL = c => !c ? '' : c[0] === '~' ? COVER.md + c.slice(1) + '.jpg' : c.startsWith('http') ? c : COVER.base + 'medium/' + c;
function cardHTML(u, gridRow, gridColumn) {
  const tags = firstGenres(u.genres, 6);
  const cov = coverURL(u.cover);
  return `
    <a class="catalog-card" href="title.html?id=${u.id}" style="grid-row:${gridRow};grid-column:${gridColumn};">
      <div class="catalog-card-frame">
        ${cov ? `<img class="catalog-card-img" src="${esc(cov)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="catalog-card-img"></div>'}
      </div>
      <div class="catalog-card-body">
        <div class="catalog-card-title">${esc(u.title)}</div>
        <div class="catalog-card-tags">
          ${tags.map(t => `<span class="catalog-card-tag">${esc(t)}</span>`).join('')}
        </div>
        <div class="catalog-card-meta">${u.chapters ? chapterBadge(u.chapters) : ''}</div>
      </div>
    </a>`;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (selectedTypes.size) params.set('types', [...selectedTypes].join(','));
  if (selectedTags.size) params.set('tags', [...selectedTags].join(','));
  if (currentQuery) params.set('q', currentQuery);
  if (onlyTranslated) params.set('translated', '1');
  params.set('limit', LIMIT);
  params.set('offset', (currentPage - 1) * LIMIT);
  return params.toString();
}

// Номера для пагинации — не сплошной список (при ~98k тайтлов и 30 на
// страницу это больше 3000 страниц) и не окно вокруг текущей: только 3
// опорные точки — первая, текущая, последняя, с многоточиями на разрывах
// между ними. "Назад"/"Вперёд" — уже свои кнопки, соседние страницы
// отдельными квадратами не дублируем.
function pageNumbers(current, total) {
  const anchors = [...new Set([1, current, total])]
    .filter(p => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const pages = [];
  let last = 0;
  for (const p of anchors) {
    if (last && p - last > 1) pages.push('…');
    pages.push(p);
    last = p;
  }
  return pages;
}

// Кнопка пагинации — та же двухслойная «рамка из фона», что и везде на
// сайте (чипсы, «Фильтры», поле перехода) — раньше пагинацию нарочно
// оставлял плоской (как .carousel-dot, не каждый мелкий контрол обязан
// нести срез), но она из-за этого читалась инородно на фоне всего
// остального. label — текст/цифра, extraClass — 'active' для текущей
// страницы, arrow — чуть шире паддинг под "← Назад"/"Вперёд →".
function pagerButton(label, extraClass, disabled) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'catalog-pager-btn' + (extraClass ? ' ' + extraClass : '');
  btn.disabled = !!disabled;
  btn.innerHTML = `<span class="catalog-pager-btn-inner">${esc(label)}</span>`;
  return btn;
}

// Заполняет ОДИН контейнер пагинации — DOM-узел можно вставить только в
// одно место разом (как когда-то с ImageLoader), поэтому кнопки под верх
// и под низ собираются отдельно, не общим набором элементов на двоих.
function fillPager(container, currentPage, totalPages) {
  container.innerHTML = '';

  const prev = pagerButton('← Назад', 'catalog-pager-arrow', currentPage <= 1);
  prev.onclick = () => goToPage(currentPage - 1);
  container.appendChild(prev);

  pageNumbers(currentPage, totalPages).forEach(p => {
    if (p === '…') {
      const dots = document.createElement('span');
      dots.className = 'catalog-pager-ellipsis';
      dots.textContent = '…';
      container.appendChild(dots);
      return;
    }
    const btn = pagerButton(String(p), p === currentPage ? 'active' : '');
    btn.onclick = () => goToPage(p);
    container.appendChild(btn);
  });

  const next = pagerButton('Вперёд →', 'catalog-pager-arrow', currentPage >= totalPages);
  next.onclick = () => goToPage(currentPage + 1);
  container.appendChild(next);
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  totalPagesCache = totalPages;
  jumpForm.hidden = totalPages <= 1;
  jumpInput.max = String(totalPages);
  jumpInput.placeholder = String(currentPage);
  jumpTotalEl.textContent = String(totalPages);

  pagers.forEach(container => {
    container.innerHTML = '';
    if (totalPages > 1) fillPager(container, currentPage, totalPages);
  });
}

async function loadPage() {
  // Раньше тут сразу стирали сетку в маленькую надпись "Загрузка..." —
  // на долю секунды высота контейнера проседала до одной строки текста,
  // и всё, что ниже (пагинация, футер), дёргалось вверх-вниз, а потом
  // обратно, когда приходили новые карточки. Теперь старые карточки
  // остаются на месте (просто притушенные) всё время запроса — высота
  // не меняется, ничего не прыгает.
  grid.classList.add('is-loading');
  let res = { items: [], total: 0 };
  try {
    res = await fetch(RELAY + '/catalog?' + buildQuery()).then(r => r.json());
    COVER = { base: res.coverBase, md: res.mdcover };
  } catch (e) {}

  const items = res.items || [];
  if (items.length) {
    // rows — из фактического числа карточек, не ROWS-константы: на
    // неполной последней странице (когда items.length < cols*ROWS) даёт
    // столбцы честной разной длины (последний короче), а не пустые ряды
    // снизу у всех столбцов сразу.
    const cols = currentColumns();
    const rows = Math.ceil(items.length / cols);
    grid.innerHTML = items.map((u, k) => cardHTML(u, (k % rows) + 1, Math.floor(k / rows) + 1)).join('');
  } else {
    grid.innerHTML = '<div class="grid-loading">Ничего не найдено.</div>';
  }
  grid.classList.remove('is-loading');
  renderPager(res.total || 0);
}

function goToPage(p) {
  currentPage = p;
  loadPage();
}

applyBtn.onclick = () => { closeFilterMenu(); currentPage = 1; loadPage(); };

// ── Текстовый запрос (Enter в поиске шапки — см. initNavSearch в
// common.js) — своего поля поиска у каталога нет, запрос прилетает
// снаружи и показывается чипсом рядом с заголовком секции, с крестиком
// на сброс. ──
const queryChip = document.getElementById('catalog-query-chip');
const queryText = document.getElementById('catalog-query-text');
const queryClear = document.getElementById('catalog-query-clear');

function setCatalogQuery(q) {
  currentQuery = (q || '').trim();
  queryChip.hidden = !currentQuery;
  queryText.textContent = `«${currentQuery}»`;
}

// applyCatalogQuery — единственная точка входа для остальных страниц:
// initNavSearch на главной зовёт её напрямую (без перезагрузки), а с
// других страниц — обычный переход на "/?q=...#catalog-page", тогда этот
// же запрос читается ниже из URL при обычной загрузке страницы.
window.applyCatalogQuery = function (q) {
  setCatalogQuery(q);
  currentPage = 1;
  loadPage();
};

queryClear.onclick = () => { setCatalogQuery(''); currentPage = 1; loadPage(); };

const urlQuery = new URLSearchParams(location.search).get('q');
if (urlQuery) setCatalogQuery(urlQuery);

// ── Фильтр "только переведённые" (onlyTranslated, см. объявление выше) —
// тот же чипс-приём, что и у текстового запроса, только без текста для
// ввода: сам факт присутствия — вкл/выкл. ──
const translatedChip = document.getElementById('catalog-translated-chip');
const translatedClear = document.getElementById('catalog-translated-clear');
translatedChip.hidden = !onlyTranslated;
translatedClear.onclick = () => {
  onlyTranslated = false;
  translatedChip.hidden = true;
  currentPage = 1;
  loadPage();
};

loadTags();
loadPage(); // без выбранных тегов/запроса — сразу весь каталог, по свежести
