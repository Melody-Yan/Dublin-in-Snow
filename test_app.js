// 冒烟测试：node test_app.js
// 只测纯逻辑与页面结构，不需要浏览器。
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
let failed = 0;
const ok = (name, cond, extra) => {
  if (!cond) { failed++; console.log('FAIL ' + name + (extra ? ' -> ' + extra : '')); }
  else console.log('ok   ' + name);
};

// ---- 1. app.js 纯函数（用假 DOM 跑一遍真实源码） ----
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
globalThis.alert = () => {};
const el = () => ({ innerHTML: '', textContent: '', style: {}, dataset: {}, value: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, append() {},
  addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
  remove() {}, closest: () => null, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, width: 0 }) });
const documentStub = { getElementById: () => null, querySelector: () => null, body: el(),
  querySelectorAll: () => [], createElement: el, addEventListener() {} };

const api = new Function('document', 'localStorage', 'sessionStorage', 'window', 'alert',
  read('app.js') + '\n;return { DB, esc, starsHTML, paginate, splitTags, md };'
)(documentStub, globalThis.localStorage, globalThis.sessionStorage, {}, globalThis.alert);

ok('esc 转义标签', api.esc('<img src=x onerror=1>') === '&lt;img src=x onerror=1&gt;');
ok('esc 保留普通文本', api.esc('都柏林的雪 & 风') === '都柏林的雪 &amp; 风');
ok('starsHTML 无评分不崩', api.starsHTML(undefined) === '<span class="stars"><span class="on"></span>☆☆☆☆☆</span>', api.starsHTML(undefined));
ok('starsHTML 满星', api.starsHTML(5) === '<span class="stars"><span class="on">★★★★★</span></span>');
ok('starsHTML 越界被夹住', api.starsHTML(99) === api.starsHTML(5) && api.starsHTML(-3) === api.starsHTML(0));
ok('starsHTML 支持自定义上限', api.starsHTML(1, 3) === '<span class="stars"><span class="on">★</span>☆☆</span>');
ok('splitTags 兼容字符串', JSON.stringify(api.splitTags('a, b')) === '["a","b"]');
ok('splitTags 去重去空', JSON.stringify(api.splitTags('a,,a ， ')) === '["a"]' && JSON.stringify(api.splitTags(undefined)) === '[]');
ok('splitTags 兼容数组', JSON.stringify(api.splitTags(['a'])) === '["a"]');

const p1 = api.paginate([1, 2, 3, 4, 5], 1, 2);
ok('paginate 首页', JSON.stringify(p1.items) === '[1,2]' && p1.totalPages === 3 && p1.page === 1);
const p9 = api.paginate([1, 2, 3, 4, 5], 99, 2);
ok('paginate 越界页码被夹住', JSON.stringify(p9.items) === '[5]' && p9.page === 3);
const p0 = api.paginate([], 1, 2);
ok('paginate 空列表', p0.items.length === 0 && p0.totalPages === 1 && p0.page === 1);

api.DB.set('t', [{ a: 1 }]);
ok('DB 读写往返', JSON.stringify(api.DB.get('t', [])) === '[{"a":1}]');
store['t'] = '{坏掉的 json';
let warned = false;
const origWarn = console.warn; console.warn = () => { warned = true; };
ok('DB 损坏数据回退默认值', JSON.stringify(api.DB.get('t', ['fallback'])) === '["fallback"]' && warned);
console.warn = origWarn;
ok('md 无 marked 时退化为纯文本', api.md('<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;');

// ---- 2. 五个页面：脚本语法 + 资源引用 ----
const pages = ['index.html', 'books.html', 'movies.html', 'journal.html', 'settings.html'];
for (const page of pages) {
  const html = read(page);
  ok(page + ' 引用 style.css', html.includes('href="style.css"'));
  ok(page + ' 引用 app.js', html.includes('src="app.js"'));
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (page === 'index.html') ok(page + ' 无需内联脚本', inline.length === 0);
  else ok(page + ' 有内联脚本', inline.length > 0);
  inline.forEach((code, i) => {
    try { new Function(code); ok(`${page} 内联脚本#${i} 语法通过`, true); }
    catch (e) { ok(`${page} 内联脚本#${i} 语法通过`, false, e.message); }
  });
  // 重复页面级函数：共享逻辑必须只在 app.js 里定义一次
  const dup = ['function esc(', 'function paginate(', 'function renderPager(', 'function splitTags(']
    .filter(sig => html.includes(sig));
  ok(page + ' 不重复定义共享函数', dup.length === 0, dup.join(','));
  ok(page + ' 不再引用已删除的 script.js', !html.includes('script.js'));
}

// 播放器只在 app.js 里实现，页面通过 data-music 委托；五个页面的播放器结构必须一致
const playerIds = ['audio', 'music-title', 'music-bar', 'music-progress'];
// app.js 会按需取用的元素：页面上缺一个就等于原来的 TypeError 老毛病
const needs = {
  'index.html': playerIds,
  'books.html': [...playerIds, 'categories', 'categoryQuote', 'search', 'list', 'pager',
    'addBtn', 'form', 'f-title', 'f-sub', 'f-review', 'f-tags', 'f-rating', 'f-submit', 'f-cancel'],
  'movies.html': [...playerIds, 'categories', 'categoryQuote', 'search', 'list', 'pager',
    'addBtn', 'form', 'f-title', 'f-sub', 'f-review', 'f-tags', 'f-rating', 'f-submit', 'f-cancel'],
  'journal.html': [...playerIds, 'tabs', 'search', 'entryText', 'saveBtn', 'cancelBtn', 'entries', 'pager'],
  'settings.html': [...playerIds, 'music-input', 'music-list', 'addBtn', 'exportBtn', 'importBtn', 'importFile']
};
for (const page of pages) {
  const html = read(page);
  ok(page + ' 用 data-music 接线播放器', html.includes('data-music="toggle"'));
  ok(page + ' 未复制旧播放器函数', !/function (playSong|togglePlay|prevSong|nextSong)\(/.test(html));
  const missing = needs[page].filter(id => !html.includes(`id="${id}"`));
  ok(page + ' 所需元素齐全', missing.length === 0, missing.join(','));
  // 页面自己 getElementById 的东西也必须真的存在
  const used = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  const ghost = used.filter(id => !html.includes(`id="${id}"`));
  ok(page + ' 无悬空 getElementById', ghost.length === 0, ghost.join(','));
  ok(page + ' 播放器结构一致',
    (html.match(/<div class="controls">/g) || []).length === 1 && html.includes('class="music-player"'));
}
ok('音乐为空时按 body.settings 决定去留', read('app.js').includes("classList.contains('settings')"));
ok('journal 用 id 寻址而非下标', !/function editEntry\(index\)/.test(read('journal.html')));
ok('index 只有一个 body 标签', (read('index.html').match(/<body/g) || []).length === 1);

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
