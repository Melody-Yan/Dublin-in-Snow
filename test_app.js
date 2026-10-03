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
// 不会返回 null 的假元素：让 init() 真正跑一遍，才能抓到空引用
const el = () => ({ innerHTML: '', textContent: '', placeholder: '', value: '', src: '', paused: true,
  duration: 0, currentTime: 0, children: [], style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, append() {},
  reset() {}, play: () => Promise.resolve(), pause() {}, removeAttribute() {}, focus() {},
  addEventListener() {}, querySelectorAll: () => [], querySelector: () => el(),
  remove() {}, closest: () => null, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, width: 0 }) });
const KNOWN_IDS = ['audio', 'music-title', 'music-progress', 'music-bar', 'music-hint'];
const byId = {};
KNOWN_IDS.forEach(id => { byId[id] = el(); });
const documentStub = {
  getElementById: id => byId[id] || null,
  querySelector: () => el(),
  querySelectorAll: () => [],
  createElement: el,
  addEventListener() {},
  body: el()
};

const appSrc = read('app.js');
const html = read('index.html');
const css = read('style.css');

globalThis.location = { hash: '' };
const windowStub = { addEventListener() {}, scrollTo() {}, marked: null };
const api = new Function('document', 'localStorage', 'sessionStorage', 'window', 'alert', 'location',
  appSrc + '\n;return { DB, esc, starsHTML, paginate, splitTags, md };'
)(documentStub, globalThis.localStorage, globalThis.sessionStorage, windowStub, globalThis.alert, globalThis.location);

ok('init() 在假 DOM 上完整跑通（空引用/拼错都会在这里炸）', true);
ok('播放器在无音乐时不报错并写回标题', byId['music-title'].textContent === '无音乐', byId['music-title'].textContent);
ok('播放器进度条按无时长收敛到 0%', byId['music-progress'].style.width === '0%', byId['music-progress'].style.width);

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

// app.js 里写下的每个选择器都要对得上某处真实标记（拼错、漏抄都会在这里露出来）
const GENERATED = ['category-button'];   // 由 app.js 自己创建
const selectorLits = [...appSrc.matchAll(/(?:\$|querySelector(?:All)?)\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
const badSel = [];
for (const sel of selectorLits) {
  for (const m of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) {
    if (clsCount(m[1]) === 0 && !GENERATED.includes(m[1])) badSel.push(`${sel} → .${m[1]}`);
  }
  for (const m of sel.matchAll(/\[data-view="([^"]+)"\]/g)) {
    if (!views.includes(m[1])) badSel.push(`${sel} → view ${m[1]}`);
  }
}
ok('app.js 的选择器都对得上真实标记', badSel.length === 0 && selectorLits.length > 20,
  `bad=${badSel.join(' | ')} found=${selectorLits.length}`);
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

// ---- 5. PWA：manifest / 图标 / Service Worker（打包成 APK 全靠这三样） ----
const manifest = JSON.parse(read('manifest.json'));
ok('manifest 必填字段齐全',
  !!manifest.name && !!manifest.short_name && !!manifest.start_url && !!manifest.theme_color
  && !!manifest.background_color && !!manifest.display, JSON.stringify(Object.keys(manifest)));
ok('manifest 中文没乱码也没 BOM',
  manifest.name === '都柏林的雪' && manifest.short_name === '都柏林的雪'
  && fs.readFileSync(path.join(dir, 'manifest.json'))[0] !== 0xEF, manifest.name);
ok('manifest 可在独立窗口运行', ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
ok('manifest scope 覆盖 start_url', manifest.start_url.startsWith(manifest.scope || './'));

const pngSize = f => {
  const b = fs.readFileSync(path.join(dir, f));
  const magic = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return magic ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
};
const sizes = manifest.icons.map(i => i.sizes);
ok('manifest 带 192 与 512 图标', sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
ok('manifest 带 maskable 图标以适配安卓启动器裁切',
  manifest.icons.some(i => (i.purpose || '').includes('maskable')));

for (const icon of manifest.icons) {
  const p = pngSize(icon.src);
  ok(`图标 ${icon.src} 存在且尺寸与声明一致`,
    !!p && `${p.w}x${p.h}` === icon.sizes && icon.type === 'image/png',
    p ? `${p.w}x${p.h}` : '缺失或不是 PNG');
}
ok('apple-touch-icon 180x180', (pngSize('icons/apple-touch-icon.png') || {}).w === 180);

const sw = read('sw.js');
ok('Service Worker 有 install/activate/fetch 三件事',
  /addEventListener\('install'/.test(sw) && /addEventListener\('activate'/.test(sw) && /addEventListener\('fetch'/.test(sw));
ok('Service Worker 会跳过等待并接管', sw.includes('skipWaiting') && sw.includes('clients.claim'));
ok('Service Worker 逐个缓存而不是 addAll（一条失败不至于装不上）',
  sw.includes('cache.add(u).catch(() => {})') && !sw.includes('addAll'));
const swShell = (sw.match(/const SHELL = \[([\s\S]*?)\]/) || [, ''])[1]
  .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
const missingShell = swShell.filter(u => {
  const rel = u.replace(/^\.\//, '');
  if (rel === '') return !fs.existsSync(path.join(dir, 'index.html'));
  return !fs.existsSync(path.join(dir, rel));
});
ok('Service Worker 预缓存清单里的文件都存在（写错一个就会装不上）',
  missingShell.length === 0 && swShell.length >= 8, missingShell.join(','));
ok('Service Worker 清掉旧版本缓存', /caches\.keys\(\)/.test(sw) && /caches\.delete/.test(sw));
ok('index.html 挂上 manifest 与图标',
  html.includes('href="manifest.json"') && html.includes('href="icons/apple-touch-icon.png"'));
ok('app.js 在 load 后注册 sw.js 且失败不炸',
  appSrc.includes("'serviceWorker' in navigator") && appSrc.includes("register('sw.js').catch(() => {})"));

// ---- 6. Digital Asset Links：没有它，APK 打开时顶部会挂着浏览器地址栏 ----
const al = JSON.parse(read('.well-known/assetlinks.json'));
ok('assetlinks 是数组且第一项有 target', Array.isArray(al) && !!al[0] && !!al[0].target);
ok('assetlinks 声明了 handle_all_urls',
  (al[0].relation || []).includes('delegate_permission/common.handle_all_urls'), (al[0].relation || []).join(','));
ok('assetlinks 的包名与 APK 一致',
  al[0].target.package_name === 'com.melody.dublininsnow', al[0].target.package_name);
ok('assetlinks 的 namespace 是 android_app', al[0].target.namespace === 'android_app');
const fps = al[0].target.sha256_cert_fingerprints || [];
ok('assetlinks 有 SHA-256 指纹且格式正确',
  fps.length > 0 && fps.every(f => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f)), fps.join(','));
ok('包名是合法的 Java 包名（Google Play 不接受改包名）',
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(al[0].target.package_name));

// ---- 7. 旧文件确实清掉了 ----
for (const f of ['books.html', 'movies.html', 'journal.html', 'settings.html', 'script.js']) {
  ok(f + ' 已清理', !fs.existsSync(path.join(dir, f)));
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
