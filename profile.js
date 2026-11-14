// Профиль (публичный сайт): только для вошедших через Google. Вход — auth.js (MAuth),
// коллекция — Worker mangall-suggest (GET/PUT /collection), хранится в базе D1 по аккаунту.
const $ = id => document.getElementById(id);
const COLLECTION_GROUPS = [
  { status: 'favorite', title: 'Любимое' },
  { status: 'reading', title: 'Читаю' },
  { status: 'planned', title: 'В планах' },
  { status: 'completed', title: 'Прочитано' },
  { status: 'dropped', title: 'Брошено' },
];

function tileHTML(it) {
  const cover = it.cover || '';
  return `
    <a class="profile-tile-card" href="title.html?id=${encodeURIComponent(it.mid)}">
      <div class="profile-tile">
        <img src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <img class="profile-tile-bookshadow" src="tile-shadow.png" alt="" aria-hidden="true">
        <div class="profile-tile-shine" aria-hidden="true"></div>
      </div>
      <div class="profile-tile-title">${esc(it.title || 'Без названия')}</div>
    </a>`;
}

function showGuest(on) {
  $('profile-guest').hidden = !on;
  ['profile-content'].forEach(id => { const el = $(id); if (el) el.hidden = on; });
  document.querySelectorAll('.profile-stats').forEach(el => el.hidden = on);
  $('profile-collection-sections').hidden = on;
}

function renderUser(u) {
  $('profile-name').textContent = u.name || u.email || 'Читатель';
  $('profile-tag').textContent = 'ЧИТАТЕЛЬ';
  $('profile-avatar').src = u.picture || 'avatar.png';
}

async function renderCollection() {
  const sectionsEl = $('profile-collection-sections');
  let items = [];
  try {
    const d = await MAuth.api('/collection');
    items = d.items || [];
  } catch (e) {
    sectionsEl.innerHTML = `<div class="grid-loading">Не получилось загрузить коллекцию: ${esc(e.message)}</div>`;
    return;
  }
  $('stat-in-progress').textContent = String(items.filter(i => i.status === 'reading').length);
  $('stat-total-pages').textContent = String(items.length);
  const byStatus = {};
  items.forEach(it => { (byStatus[it.status] = byStatus[it.status] || []).push(it); });
  const groups = COLLECTION_GROUPS.filter(g => byStatus[g.status] && byStatus[g.status].length);
  if (!groups.length) { sectionsEl.innerHTML = '<div class="grid-loading">Коллекция пока пуста. Добавить тайтл можно кнопкой на странице манги.</div>'; return; }

  sectionsEl.innerHTML = `
    <div class="profile-section-head" id="profile-collection-tabs">
      ${groups.map((g, i) => `<button type="button" class="profile-section-title${i === 0 ? ' active' : ''}" data-status="${esc(g.status)}">${esc(g.title)}</button>`).join('')}
      <div class="profile-section-line" aria-hidden="true"></div>
    </div>
    <div class="profile-tile-grid" id="profile-collection-grid"></div>`;
  const tabsEl = $('profile-collection-tabs'), gridEl = $('profile-collection-grid');
  const renderGroup = st => { gridEl.innerHTML = (byStatus[st] || []).map(tileHTML).join(''); };
  tabsEl.querySelectorAll('.profile-section-title').forEach(btn => btn.addEventListener('click', () => {
    tabsEl.querySelectorAll('.profile-section-title').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGroup(btn.dataset.status);
  }));
  renderGroup(groups[0].status);
}

function refresh() {
  const u = window.MAuth && MAuth.user;
  if (!u) {
    showGuest(true);
    $('profile-login').onclick = () => MAuth.open('Войдите через Google, чтобы открыть профиль');
    return;
  }
  showGuest(false);
  renderUser(u);
  renderCollection();
}

if (window.MAuth) { MAuth.onChange(refresh); refresh(); }
else showGuest(true);
