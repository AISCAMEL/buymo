/* ============================================================
   BUYMO 内部リンク／アセット 健全性チェッカー
   - site 配下の .html を走査し、ローカル href/src の参照先が存在するか検証
   - 同一ページ内アンカー(#id) の存在も確認
   実行: node tools/check-links.js   （site/ で）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..'); // site/

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

function attrs(html, re) { var m, a = []; while ((m = re.exec(html))) a.push(m[1]); return a; }

var files = walk(ROOT, []);
var problems = [];
var checked = 0;

files.forEach(function (file) {
  var html = fs.readFileSync(file, 'utf8');
  var dir = path.dirname(file);
  var ids = {}; (html.match(/\sid="([^"]+)"/g) || []).forEach(function (s) { ids[s.replace(/.*id="/,'').replace(/"$/,'')] = 1; });

  var refs = []
    .concat(attrs(html, /href="([^"]+)"/g))
    .concat(attrs(html, /src="([^"]+)"/g));

  refs.forEach(function (ref) {
    if (!ref) return;
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) return;
    if (/[+'`]|\$\{/.test(ref)) return; // インラインJSで動的生成される href/src は対象外
    checked++;
    // same-page anchor
    if (ref.charAt(0) === '#') {
      if (ref.length > 1 && !ids[ref.slice(1)]) problems.push([file, ref, 'アンカー先ID無し']);
      return;
    }
    var clean = ref.split('#')[0].split('?')[0];
    if (!clean) return;
    var target = clean.charAt(0) === '/' ? path.join(ROOT, clean) : path.resolve(dir, clean);
    if (clean.slice(-1) === '/') target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) problems.push([file, ref, '参照先が存在しない']);
  });
});

console.log('HTML files scanned: ' + files.length + ' / refs checked: ' + checked);
if (!problems.length) { console.log('✅ 問題なし（リンク切れ・欠落なし）'); }
else {
  console.log('⚠️ ' + problems.length + ' 件の問題:');
  problems.forEach(function (p) { console.log('  [' + path.relative(ROOT, p[0]) + '] ' + p[1] + ' … ' + p[2]); });
  process.exitCode = 1;
}
