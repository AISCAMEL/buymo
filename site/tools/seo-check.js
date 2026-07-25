/* ============================================================
   BUYMO SEO／構造化データ／整合性チェッカー
   - 全 .html の JSON-LD が parse できるか検証
   - SEO対象ページ（buymo.html / genre/** / area/**）の必須要素を検査
       title・canonical・description・<h1>×1・OGP・title重複
   - データソース整合：genres.js / _cross.js の各ページ実在、sitemap参照先の実在
   実行: node tools/seo-check.js   （site/ で）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const GENRES = require('../assets/js/genres').list;
const CROSS = require('./_cross');

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['tests', 'embed', 'node_modules', '.git'].indexOf(e.name) >= 0) return;
      walk(p, out);
    } else if (e.name.endsWith('.html')) out.push(p);
  });
  return out;
}

var files = walk(ROOT, []);
var errors = [];
var warns = [];
var rel = function (f) { return path.relative(ROOT, f); };
function isSeoPage(f) {
  var r = rel(f);
  return r === 'buymo.html' || r.indexOf('genre' + path.sep) === 0 || r.indexOf('area' + path.sep) === 0;
}

var titles = {}; // title -> [file...]（index可能なSEOページのみ）
files.forEach(function (f) {
  var html = fs.readFileSync(f, 'utf8');
  var r = rel(f);
  var noindex = /name="robots"[^>]*noindex/i.test(html);

  // JSON-LD は全ファイルで parse 検証
  (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).forEach(function (b, i) {
    var json = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '').trim();
    try { JSON.parse(json); } catch (e) { errors.push('[' + r + '] JSON-LD#' + (i + 1) + ' 解析エラー: ' + e.message); }
  });

  if (!isSeoPage(f)) return;

  var tm = html.match(/<title>([\s\S]*?)<\/title>/);
  var title = tm ? tm[1].trim() : '';
  if (!title) errors.push('[' + r + '] <title> がありません');
  if (!/rel="canonical"/.test(html)) errors.push('[' + r + '] canonical がありません');
  if (!/name="description"/.test(html)) warns.push('[' + r + '] meta description がありません');

  var h1c = (html.match(/<h1[\s>]/g) || []).length;
  if (h1c !== 1) warns.push('[' + r + '] <h1> が ' + h1c + ' 個（1個が理想）');
  if (!/property="og:title"/.test(html)) warns.push('[' + r + '] og:title なし');
  if (!/property="og:image"/.test(html)) warns.push('[' + r + '] og:image なし');

  if (title && !noindex) { (titles[title] = titles[title] || []).push(r); }
});

Object.keys(titles).forEach(function (t) {
  if (titles[t].length > 1) errors.push('title重複「' + t + '」: ' + titles[t].join(', '));
});

// ---- データソース整合 ----
function must(p, label) {
  if (!fs.existsSync(path.join(ROOT, p.split('/').join(path.sep)))) errors.push(label + ' が存在しない: ' + p);
}
GENRES.forEach(function (g) { must('genre/' + g.slug + '/index.html', 'ジャンルLP'); });
CROSS.pairs(GENRES).forEach(function (pr) { must('genre/' + pr.genre.slug + '/' + pr.pref.slug + '/index.html', '掛け合わせLP'); });

// ---- sitemap 参照先の実在 ----
var smPath = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(smPath)) { errors.push('sitemap.xml がありません'); }
else {
  var sm = fs.readFileSync(smPath, 'utf8');
  (sm.match(/<loc>([^<]+)<\/loc>/g) || []).forEach(function (m) {
    var u = m.replace(/<\/?loc>/g, '').replace(/^https?:\/\/[^/]+/, '');
    if (!u) return;
    var target = path.join(ROOT, u.split('/').join(path.sep));
    if (u.slice(-1) === '/') target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) errors.push('sitemap参照先が存在しない: ' + u);
  });
}

console.log('SEOチェック: ' + files.length + 'ファイル走査 / SEO対象ページの title ' + Object.keys(titles).length + '種');
if (warns.length) { console.log('\n⚠️ 警告 ' + warns.length + '件:'); warns.forEach(function (w) { console.log('  ' + w); }); }
if (errors.length) {
  console.log('\n❌ エラー ' + errors.length + '件:');
  errors.forEach(function (e) { console.log('  ' + e); });
  process.exitCode = 1;
} else {
  console.log('\n✅ SEO要素・構造化データ・整合性 問題なし');
}
