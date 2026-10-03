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

const appSrc = read('app.js');
const html = read('index.html');
const css = read('style.css');

globalThis.location = { hash: '' };
const windowStub = { addEventListener() {}, scrollTo() {}, marked: null };
const api = new Function('document', 'localStorage', 'sessionStorage', 'window', 'alert', 'location',
  appSrc + '\n;return { DB, esc, starsHTML, paginate, splitTags, md };'
)(documentStub, globalThis.localStorage, globalThis.sessionStorage, windowStub, globalThis.alert, globalThis.location);

ok('esc 转义标签', api.esc('<img src=x onerror=1>') === '&lt;img src=x onerror=1&gt;');
ok('esc 保留普通文本', api.esc('都柏林的雪 & 风') === '都柏林的雪 &amp; 风');
ok('esc 容忍 null/undefined', api.esc(null) === '' && api.esc(undefined) === '');
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

// ---- 2. 单页结构：脚本语法 + 资源引用 ----
ok('index.html 引用 style.css', html.includes('href="style.css"'));
ok('index.html 引用 app.js', html.includes('src="app.js"'));
ok('index.html 无内联脚本', /<script(?![^>]*\bsrc=)[^>]*>/.test(html) === false);
ok('index.html 只有一个 body 标签', (html.match(/<body/g) || []).length === 1);
ok('index.html 不再引用已删除的页面或 script.js',
  !/(books|movies|journal|settings)\.html/.test(html) && !html.includes('script.js'));
ok('marked 是唯一的 CDN 依赖', (html.match(/https?:\/\/cdn\./g) || []).length === 1);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
ok('id 全局唯一（合并五页后的主要风险）', dupIds.length === 0, dupIds.join(','));

// ---- 3. 路由：app.js 的 VIEWS 必须和 index.html 的 section 一一对应 ----
const views = (appSrc.match(/const VIEWS = \[([^\]]*)\]/) || [, ''])[1]
  .split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
ok('app.js 声明了 VIEWS', views.length === 5, views.join('/'));

const sections = [...html.matchAll(/<section class="view[^"]*" data-view="([^"]+)"/g)].map(m => m[1]);
ok('每个视图都有对应 section', JSON.stringify(sections.slice().sort()) === JSON.stringify(views.slice().sort()),
  'sections=' + sections.join('/') + ' views=' + views.join('/'));

const links = [...html.matchAll(/data-view-link="([^"]+)"/g)].map(m => m[1]);
ok('导航项都能路由到真实视图', links.every(v => views.includes(v)) && links.length === 4, links.join('/'));
ok('主页有入口（标题指回 #home）', html.includes('href="#home"'));
ok('设置的空音乐提示指向 #settings', /id="music-hint"[\s\S]{0,120}href="#settings"/.test(html));
ok('route() 写 body.dataset.view 驱动背景', appSrc.includes('document.body.dataset.view = view'));
ok('style.css 随视图换背景', ['books', 'movies', 'journal']
  .every(v => css.includes(`body[data-view="${v}"]`)));
ok('style.css 保留 .hidden', /\.hidden \{ display: none !important; \}/.test(css));
ok('style.css 没有旧的按页 class 残留',
  !/body\.(home|books|movies|journal|settings)\b/.test(css) && !/#home-link/.test(css)
  && !/#search\b/.test(css) && !/#entryText/.test(css));

// ---- 4. app.js 取用的元素必须真的存在（原来 TypeError 的老毛病） ----
const NEEDS = [
  'lib-list', 'pager', 'category-quote', 'search-input', 'entry-form', 'add-btn', 'rating',
  'category-container', 'f-title', 'f-sub', 'f-review', 'f-tags', 'f-submit', 'f-cancel',
  'journal-list', 'entry-text', 'save-btn', 'cancel-btn', 'tab-buttons',
  'music-list', 'music-input', 'music-add-btn', 'export-btn', 'import-file', 'import-btn',
  'music-player'
];
const libShared = ['lib-list', 'category-quote', 'entry-form', 'rating', 'category-container',
  'f-title', 'f-sub', 'f-review', 'f-tags', 'f-submit', 'f-cancel'];
// 书架 / 影单 / 手札三处都有的公共件
const shared3 = ['pager', 'search-input'];
const classTokens = [...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
const clsCount = c => classTokens.filter(t => t === c).length;
const missing = NEEDS.filter(c => clsCount(c) === 0);
ok('app.js 需要的 class 都在 index.html 里', missing.length === 0, missing.join(','));
for (const c of libShared) ok(`书架与影单各有一份 .${c}`, clsCount(c) === 2, 'count=' + clsCount(c));
for (const c of shared3) ok(`书架/影单/手札各有一份 .${c}`, clsCount(c) === 3, 'count=' + clsCount(c));
const usedIds = [...appSrc.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const ghost = usedIds.filter(id => !ids.includes(id));
ok('app.js 无悬空 getElementById', ghost.length === 0, ghost.join(','));
ok('播放器只有一个实例', (html.match(/class="music-player"/g) || []).length === 1
  && (html.match(/data-music="toggle"/g) || []).length === 1);
ok('未复制旧播放器函数', !/function (playSong|togglePlay|prevSong|nextSong)\(/.test(appSrc + html));
ok('无音乐时整块隐藏播放器而不是报警', appSrc.includes("panel.classList.toggle('hidden', !has)")
  && !/没有找到音乐/.test(appSrc));
ok('journal 用 id 寻址而非下标', !/editEntry\(index\)/.test(appSrc) && appSrc.includes("String(e.id) === String(id)"));
ok('编辑走就地更新而不是新增', appSrc.includes('Object.assign(items[i], patch)'));
ok('删除有二次确认', (appSrc.match(/confirm\(/g) || []).length >= 3);

// ---- 5. 旧文件确实清掉了 ----
for (const f of ['books.html', 'movies.html', 'journal.html', 'settings.html', 'script.js']) {
  ok(f + ' 已清理', !fs.existsSync(path.join(dir, f)));
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
