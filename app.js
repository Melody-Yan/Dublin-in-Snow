/* 都柏林的雪 · 共用脚本
   数据存取 / 转义 / 分页 / 评分 / 播放器 / 书架与影单 */

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

/* ================= 书架 / 影单（同一套逻辑） ================= */
function initLibrary(cfg) {
  const $ = id => document.getElementById(id);
  const listEl = $('list'), pagerEl = $('pager'), quoteEl = $('categoryQuote');
  const searchEl = $('search'), formEl = $('form'), addBtn = $('addBtn');
  const rating = initRating($('f-rating'));

  let cat = cfg.categories[0].id;
  let page = 1, query = '', editingId = null;

  $('f-title').placeholder = cfg.labels[0];
  $('f-sub').placeholder = cfg.labels[1];
  $('f-review').placeholder = cfg.labels[2];

  cfg.categories.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'category-button';
    b.dataset.cat = c.id;
    b.textContent = c.label;
    if (i === 0) b.classList.add('active');
    b.onclick = () => {
      cat = c.id;
      page = 1;
      paintCategories();
      render();
    };
    $('categories').appendChild(b);
  });

  const all = () => DB.get(cfg.key, []) || [];
  const sub = x => x[cfg.subKey] || '';

  function paintCategories() {
    document.querySelectorAll('#categories .category-button')
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
    $('f-title').value = x ? x.title : '';
    $('f-sub').value = x ? sub(x) : '';
    $('f-review').value = x ? (x.review || '') : '';
    $('f-tags').value = x ? (x.tags || '') : '';
    rating.set(x ? x.rating : 0);
    $('f-submit').textContent = x ? '保存修改' : '提交';
    formEl.classList.remove('hidden');
    addBtn.classList.add('hidden');
    $('f-title').focus();
  }

  function closeForm() {
    editingId = null;
    formEl.reset();
    rating.set(0);
    formEl.classList.add('hidden');
    addBtn.classList.remove('hidden');
  }

  addBtn.onclick = () => openForm(null);
  $('f-cancel').onclick = closeForm;
  searchEl.addEventListener('input', () => { query = searchEl.value; page = 1; render(); });

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const title = $('f-title').value.trim();
    const second = $('f-sub').value.trim();
    if (!title || !second) {
      alert(`${cfg.labels[0]}和${cfg.labels[1]}不能为空！`);
      return;
    }
    const items = all();
    const patch = {
      title,
      [cfg.subKey]: second,
      review: $('f-review').value.trim(),
      tags: $('f-tags').value.trim(),
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

/* ================= 播放器（全站唯一实现） ================= */
const Music = (function () {
  const audio = document.getElementById('audio');
  const panel = document.querySelector('.music-player');
  let tracks = DB.get('musicLinks', []);
  if (!Array.isArray(tracks)) tracks = [];

  // 没配音乐时：设置页保留播放器（正上方就是添加链接的地方），其他页面整块藏掉只留一句提示
  const onSettings = document.body.classList.contains('settings');
  if (panel && !tracks.length && !onSettings) {
    panel.insertAdjacentHTML('beforebegin',
      '<p class="music-empty">还没有音乐，去 <a href="settings.html">设置</a> 添加链接</p>');
    panel.remove();
    return { play() {}, refresh() {} };   // 已从页面上摘掉，不必再接事件
  }
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

  function paint() {
    if (toggleBtn) toggleBtn.textContent = audio.paused ? '▶' : '⏸';
    if (titleEl) titleEl.textContent = tracks.length ? name(tracks[index]) : '无音乐';
    if (barEl) barEl.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%';
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
    if (restoring) {                      // 跨页面接着上次的位置播
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
      else { audio.removeAttribute('src'); paint(); }
    }
  };
})();
