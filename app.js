/* 都柏林的雪 · 唯一脚本
   数据 / 转义 / 分页 / 评分 / 播放器 / 书架·影单·手札·设置 / 哈希路由 */

/* ================= 数据 ================= */
const DB = {
  get(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      return value === null ? fallback : value;
    } catch (e) {
      console.warn('[DB] 读取失败：' + key, e);
      return fallback;               // 数据损坏时不让整页脚本崩掉
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert('保存失败：浏览器存储不可用或空间已满。');
      return false;
    }
  }
};

/* ================= 文本 ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* Markdown：marked 没加载成功（离线）时退化成纯文本 */
const md = t => (window.marked ? window.marked.parse(t) : esc(t).replace(/\n/g, '<br>'));

const splitTags = s => [...new Set(String(s || '').split(/[,，、]/).map(t => t.trim()).filter(Boolean))];

/* ================= 评分 ================= */
function starsHTML(n, max = 5) {
  n = Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  return `<span class="stars"><span class="on">${'★'.repeat(n)}</span>${'☆'.repeat(max - n)}</span>`;
}

function initRating(el) {
  let value = 0;
  const paint = () => [...el.children].forEach((s, i) => s.classList.toggle('selected', i < value));
  el.addEventListener('click', e => {
    const star = e.target.closest('.star');
    if (!star) return;
    value = Number(star.dataset.value) || [...el.children].indexOf(star) + 1;
    paint();
  });
  return {
    get value() { return value; },
    set(v) { value = Math.max(0, Math.min(el.children.length, Number(v) || 0)); paint(); }
  };
}

/* ================= 分页 ================= */
function paginate(arr, page, per) {
  const totalPages = Math.max(1, Math.ceil(arr.length / per));
  const current = Math.min(Math.max(1, page || 1), totalPages);
  return { items: arr.slice((current - 1) * per, current * per), page: current, totalPages };
}

function renderPager(el, state, go) {
  el.innerHTML = '';
  if (state.totalPages <= 1) return;
  const add = (label, page, active = false, disabled = false) => {
    const b = document.createElement('button');
    b.className = 'page-button' + (active ? ' active-page' : '');
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = () => go(page);
    el.appendChild(b);
  };
  add('«', state.page - 1, false, state.page === 1);
  for (let i = 1; i <= state.totalPages; i++) add(String(i), i, i === state.page);
  add('»', state.page + 1, false, state.page === state.totalPages);
}

/* ================= 书架 / 影单（同一套逻辑，各喂一个 root） ================= */
function initLibrary(root, cfg) {
  if (!root) return;
  const $ = sel => root.querySelector(sel);
  const listEl = $('.lib-list'), pagerEl = $('.pager'), quoteEl = $('.category-quote');
  const searchEl = $('.search-input'), formEl = $('.entry-form'), addBtn = $('.add-btn');
  const rating = initRating($('.rating'));

  let cat = cfg.categories[0].id;
  let page = 1, query = '', editingId = null;

  $('.f-title').placeholder = cfg.labels[0];
  $('.f-sub').placeholder = cfg.labels[1];
  $('.f-review').placeholder = cfg.labels[2];

  cfg.categories.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'category-button';
    b.dataset.cat = c.id;
    b.textContent = c.label;
    if (i === 0) b.classList.add('active');
    b.onclick = () => { cat = c.id; page = 1; paintCategories(); render(); };
    $('.category-container').appendChild(b);
  });

  const all = () => DB.get(cfg.key, []) || [];
  const sub = x => x[cfg.subKey] || '';

  function paintCategories() {
    root.querySelectorAll('.category-button')
      .forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    const c = cfg.categories.find(c => c.id === cat);
    quoteEl.textContent = c ? c.quote : '';
  }

  function card(x) {
    const tags = splitTags(x.tags).map(t => `<span class="tag">#${esc(t)}</span>`).join(' ');
    // 搜索时卡片上标出分类，免得「搜到了但不知道在哪一栏」
    const catName = query.trim()
      ? (cfg.categories.find(c => c.id === x.category) || {}).label || ''
      : '';
    const el = document.createElement('article');
    el.className = 'entry-card';
    el.innerHTML = `
      <div class="entry-head">
        <strong>《${esc(x.title)}》</strong>
        <span class="by">${esc(sub(x))}</span>
        <span class="actions">
          <button class="icon-btn" data-act="edit" data-id="${esc(x.id)}">编辑</button>
          <button class="icon-btn danger" data-act="del" data-id="${esc(x.id)}">删除</button>
        </span>
      </div>
      <div class="meta">${starsHTML(x.rating)}${x.dateAdded ? ' · ' + esc(x.dateAdded) : ''}${tags ? ' · ' + tags : ''}${catName ? ' · ' + esc(catName) : ''}</div>
      ${x.review ? `<p class="review">${esc(x.review).replace(/\n/g, '<br>')}</p>` : ''}
    `;
    return el;
  }

  function render() {
    const q = query.trim().toLowerCase();
    const items = all()
      .filter(x => q || x.category === cat)      // 有搜索词时跨分类找，不要假装别处的内容不存在
      .filter(x => !q || [x.title, sub(x), x.tags, x.review]
        .some(v => String(v || '').toLowerCase().includes(q)));

    const state = paginate(items, page, 4);
    page = state.page;
    listEl.innerHTML = '';
    if (!state.items.length) {
      listEl.innerHTML = `<p class="empty">${q ? '没有找到匹配的内容。' : cfg.empty}</p>`;
    }
    state.items.forEach(x => listEl.appendChild(card(x)));
    renderPager(pagerEl, state, p => { page = p; render(); });
  }

  function openForm(id) {
    editingId = id ?? null;
    const x = id !== null ? all().find(v => String(v.id) === String(id)) : null;
    $('.f-title').value = x ? x.title : '';
    $('.f-sub').value = x ? sub(x) : '';
    $('.f-review').value = x ? (x.review || '') : '';
    $('.f-tags').value = x ? (x.tags || '') : '';
    rating.set(x ? x.rating : 0);
    $('.f-submit').textContent = x ? '保存修改' : '提交';
    formEl.classList.remove('hidden');
    addBtn.classList.add('hidden');
    $('.f-title').focus();
  }

  function closeForm() {
    editingId = null;
    formEl.reset();
    rating.set(0);
    formEl.classList.add('hidden');
    addBtn.classList.remove('hidden');
  }

  addBtn.onclick = () => openForm(null);
  $('.f-cancel').onclick = closeForm;
  searchEl.addEventListener('input', () => { query = searchEl.value; page = 1; render(); });

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const title = $('.f-title').value.trim();
    const second = $('.f-sub').value.trim();
    if (!title || !second) {
      alert(`${cfg.labels[0]}和${cfg.labels[1]}不能为空！`);
      return;
    }
    const items = all();
    const patch = {
      title,
      [cfg.subKey]: second,
      review: $('.f-review').value.trim(),
      tags: $('.f-tags').value.trim(),
      rating: rating.value
    };

    if (editingId !== null) {
      const i = items.findIndex(v => String(v.id) === String(editingId));
      if (i > -1) Object.assign(items[i], patch);   // 分类和添加日期保持不变
    } else {
      items.unshift({
        id: Date.now(),
        ...patch,
        category: cat,
        dateAdded: new Date().toLocaleDateString()
      });
    }
    if (DB.set(cfg.key, items)) { closeForm(); page = 1; render(); }
  });

  listEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') { openForm(id); return; }
    const item = all().find(v => String(v.id) === id);
    if (!confirm(`确定删除《${item ? item.title : ''}》吗？`)) return;
    if (DB.set(cfg.key, all().filter(v => String(v.id) !== id))) render();
  });

  paintCategories();
  render();
}

const LIBRARIES = {
  books: {
    key: 'books',
    subKey: 'author',
    labels: ['书名', '作者', '书评'],
    empty: '这个分类还空着，点下面的「添加书籍」开始记录。',
    categories: [
      { id: 'snow',      label: '都柏林的雪（想读）', quote: '“在都柏林的雪中，总有未曾翻开的书页。”' },
      { id: 'reading',   label: '旅途中的灯（在读）', quote: '“旅途的灯未熄，文字依然温暖。”' },
      { id: 'finished',  label: '落幕的章节（已读）', quote: '“落幕的章节，仍在心中吟诵。”' },
      { id: 'abandoned', label: '遗忘的书页（弃读）', quote: '“这里的书已经被遗忘，或许有一天会再次拾起。”' }
    ]
  },
  movies: {
    key: 'movies',
    subKey: 'director',
    labels: ['电影名', '导演', '电影评论'],
    empty: '这个分类还空着，点下面的「添加电影」开始记录。',
    categories: [
      { id: 'watchlist', label: '想看', quote: '“还有许多待探索的故事，正等着我去发现。”' },
      { id: 'watching',  label: '在看', quote: '“正在这片荧幕里，寻觅着梦的碎片。”' },
      { id: 'watched',   label: '已看', quote: '“每一部电影都是一次心灵的旅行。”' },
      { id: 'dropped',   label: '弃看', quote: '“有些故事，未完待续。”' }
    ]
  }
};

/* ================= 心境手札 ================= */
function initJournal(root) {
  if (!root) return;
  const $ = sel => root.querySelector(sel);
  const LIST = $('.journal-list'), PAGER = $('.pager'), SEARCH = $('.search-input');
  const TEXT = $('.entry-text'), SAVE = $('.save-btn'), CANCEL = $('.cancel-btn');

  const TABS = ['碎碎念', '随笔', '灵感', '长篇'];
  const PER_PAGE = 4;
  let tab = TABS[0], page = 1, query = '', editingId = null;

  // 老数据没有 id，补一次，之后按 id 增删改（不再依赖数组下标）
  (function migrate() {
    const list = DB.get('entries', []);
    let changed = false;
    list.forEach((e, i) => { if (!e.id) { e.id = 'e' + Date.now() + i; changed = true; } });
    if (changed) DB.set('entries', list);
  })();

  const all = () => DB.get('entries', []) || [];
  const find = id => all().find(e => String(e.id) === String(id));

  TABS.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tab = t;
    b.textContent = t;
    b.onclick = () => { tab = t; page = 1; closeForm(); render(); };
    $('.tab-buttons').appendChild(b);
  });

  function card(e) {
    const el = document.createElement('article');
    el.className = 'entry';
    el.innerHTML = `
      <h3>${esc(e.date || '')}${e.updated ? ' · 修改于 ' + esc(e.updated) : ''}${query.trim() ? ' · ' + esc(e.tab) : ''}</h3>
      <div class="entry-body">${md(e.text)}</div>
      <span class="actions">
        <button class="icon-btn" data-act="edit" data-id="${esc(e.id)}">编辑</button>
        <button class="icon-btn danger" data-act="del" data-id="${esc(e.id)}">删除</button>
      </span>`;
    return el;
  }

  function render() {
    root.querySelectorAll('.tab-buttons button')
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const q = query.trim().toLowerCase();
    const items = all()
      .filter(e => q || e.tab === tab)      // 有搜索词时跨栏目找，不要只搜当前这一栏
      .filter(e => !q || String(e.text).toLowerCase().includes(q));

    const state = paginate(items, page, PER_PAGE);
    page = state.page;

    LIST.innerHTML = '';
    if (!state.items.length) {
      LIST.innerHTML = `<p class="empty">${q ? '没有找到匹配的文字。' : '这里还是空的，写点什么吧。'}</p>`;
    }
    state.items.forEach(e => LIST.appendChild(card(e)));
    renderPager(PAGER, state, p => { page = p; render(); });
  }

  function closeForm() {
    editingId = null;
    TEXT.value = '';
    SAVE.textContent = '保存';
    CANCEL.classList.add('hidden');
  }

  function save() {
    const text = TEXT.value.trim();
    if (!text) { alert('内容不能为空！'); return; }
    const list = all();
    if (editingId !== null) {
      const i = list.findIndex(e => String(e.id) === String(editingId));
      if (i > -1) { list[i].text = text; list[i].updated = new Date().toLocaleString(); }
    } else {
      list.push({ id: 'e' + Date.now(), tab, text, date: new Date().toLocaleString() });
    }
    if (DB.set('entries', list)) { closeForm(); page = 1; render(); }
  }

  SAVE.onclick = save;
  CANCEL.onclick = closeForm;
  SEARCH.addEventListener('input', e => { query = e.target.value; page = 1; render(); });

  LIST.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') {
      const item = find(id);
      if (!item) return;
      editingId = id;
      TEXT.value = item.text;
      SAVE.textContent = '保存修改';
      CANCEL.classList.remove('hidden');
      TEXT.focus();
      TEXT.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!confirm('确定删除这条记录吗？')) return;
    if (DB.set('entries', all().filter(x => String(x.id) !== id))) render();
  });

  render();
}

/* ================= 设置 ================= */
function initSettings(root) {
  if (!root) return;
  const $ = sel => root.querySelector(sel);
  const KEYS = ['books', 'movies', 'entries', 'musicLinks'];

  function renderList() {
    const tracks = DB.get('musicLinks', []);
    const ul = $('.music-list');
    ul.innerHTML = '';

    if (!tracks.length) {
      const li = document.createElement('li');
      li.textContent = '还没有添加音乐。';
      ul.appendChild(li);
      return;
    }

    tracks.forEach((link, i) => {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = (i + 1) + '. ' + (link.split('/').pop().split('?')[0] || link);
      name.title = '点击播放：' + link;
      name.onclick = () => Music.play(i);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.textContent = '删除';
      del.onclick = () => {
        const list = DB.get('musicLinks', []);
        list.splice(i, 1);
        if (DB.set('musicLinks', list)) { renderList(); Music.refresh(); }
      };

      li.append(name, del);
      ul.appendChild(li);
    });
  }

  $('.music-add-btn').onclick = () => {
    const input = $('.music-input');
    const url = input.value.trim();
    if (!url) { alert('请先填写音乐链接。'); return; }
    const list = DB.get('musicLinks', []);
    if (list.includes(url)) { alert('这个链接已经在列表里了。'); return; }
    list.push(url);
    if (DB.set('musicLinks', list)) {
      input.value = '';
      renderList();
      Music.refresh();
    }
  };

  $('.export-btn').onclick = () => {
    const data = {};
    KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    if (!Object.keys(data).length) { alert('还没有可以备份的内容。'); return; }

    const blob = new Blob(
      [JSON.stringify({ app: '都柏林的雪', exportedAt: new Date().toISOString(), data }, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `都柏林的雪-备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const fileInput = $('.import-file');
  $('.import-btn').onclick = () => fileInput.click();

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed && parsed.data ? parsed.data : parsed;
        const found = KEYS.filter(k => typeof data[k] === 'string');
        if (!found.length) throw new Error('没有可识别的数据');
        if (!confirm('导入会覆盖当前的书籍、影单、手札和音乐设置，确定继续吗？')) return;
        found.forEach(k => localStorage.setItem(k, data[k]));
        alert('导入完成，页面将重新载入。');
        location.reload();
      } catch (err) {
        alert('备份文件无法识别。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  renderList();
}

/* ================= 播放器（全站唯一，切视图不打断） ================= */
const Music = (function () {
  const audio = document.getElementById('audio');
  const panel = document.querySelector('.music-player');
  const hint = document.getElementById('music-hint');
  let tracks = DB.get('musicLinks', []);
  if (!Array.isArray(tracks)) tracks = [];
  if (!audio || !panel) return { play() {}, refresh() {} };

  const titleEl = document.getElementById('music-title');
  const barEl = document.getElementById('music-progress');
  const bar = document.getElementById('music-bar');
  const toggleBtn = document.querySelector('[data-music="toggle"]');
  const name = t => String(t).split('/').pop().split('?')[0] || String(t);
  const saved = k => Number(sessionStorage.getItem(k)) || 0;

  let index = Math.min(saved('musicIndex'), Math.max(0, tracks.length - 1));
  let lastSaved = 0;
  let restoring = saved('musicTime') > 0;

  // 没配音乐就整块藏起来，只在设置页留下一句去哪儿加
  function sync() {
    const has = tracks.length > 0;
    panel.classList.toggle('hidden', !has);
    if (hint) hint.classList.toggle('hidden', has);
  }

  function paint() {
    if (toggleBtn) toggleBtn.textContent = audio.paused ? '▶' : '⏸';
    if (titleEl) titleEl.textContent = tracks.length ? name(tracks[index]) : '无音乐';
    if (barEl) barEl.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%';
    sync();
  }

  function play() {
    // 浏览器可能禁止自动播放：失败了就停在 ▶，不抛未捕获的错误
    audio.play().then(paint, paint);
  }

  function load(i, autoplay = true) {
    if (!tracks.length) { paint(); return; }
    index = (i + tracks.length) % tracks.length;
    sessionStorage.setItem('musicIndex', index);
    audio.src = tracks[index];
    if (autoplay) play();
    paint();
  }

  document.querySelectorAll('[data-music]').forEach(b => {
    b.onclick = () => {
      if (!tracks.length) return;
      const act = b.dataset.music;
      if (act === 'prev') load(index - 1);
      else if (act === 'next') load(index + 1);
      else if (audio.paused) play();
      else audio.pause();
    };
  });

  audio.addEventListener('play', paint);
  audio.addEventListener('pause', paint);
  audio.addEventListener('ended', () => load(index + 1));
  audio.addEventListener('error', paint);
  audio.addEventListener('loadedmetadata', () => {
    if (restoring) {                      // 刷新后接着上次的位置播
      restoring = false;
      const t = saved('musicTime');
      if (t > 0 && t < audio.duration - 1) audio.currentTime = t;
    }
  });
  audio.addEventListener('timeupdate', () => {
    if (barEl) barEl.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%';
    if (Math.abs(audio.currentTime - lastSaved) > 3) {
      lastSaved = audio.currentTime;
      sessionStorage.setItem('musicTime', audio.currentTime);
    }
  });
  if (bar) bar.addEventListener('click', e => {
    if (!audio.duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
  });
  window.addEventListener('pagehide', () => sessionStorage.setItem('musicTime', audio.currentTime));

  if (tracks.length) load(index);
  paint();

  return {
    play(i) { load(i); },
    refresh() {
      tracks = DB.get('musicLinks', []);
      if (!Array.isArray(tracks)) tracks = [];
      if (index >= tracks.length) index = 0;
      sessionStorage.setItem('musicIndex', index);
      if (tracks.length) load(index);
      else { audio.pause(); audio.removeAttribute('src'); }
      paint();
    }
  };
})();

/* ================= 路由：五个视图，一个页面 ================= */
const VIEWS = ['home', 'books', 'movies', 'journal', 'settings'];

function route() {
  const want = location.hash.replace(/^#\/?/, '');
  const view = VIEWS.includes(want) ? want : 'home';
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('hidden', s.dataset.view !== view));
  document.querySelectorAll('[data-view-link]')
    .forEach(a => a.classList.toggle('active', a.dataset.viewLink === view));
  document.body.dataset.view = view;      // 背景图跟着视图换
  window.scrollTo(0, 0);
}

/* ================= 离线：注册 Service Worker（打包成 App 后也靠它离线可用） ================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

function init() {
  initLibrary(document.querySelector('[data-view="books"]'), LIBRARIES.books);
  initLibrary(document.querySelector('[data-view="movies"]'), LIBRARIES.movies);
  initJournal(document.querySelector('[data-view="journal"]'));
  initSettings(document.querySelector('[data-view="settings"]'));
  window.addEventListener('hashchange', route);
  route();
}

init();
