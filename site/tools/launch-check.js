/* ============================================================
   BUYMO 公開準備チェック（実状態をコードから判定）
   静的なチェックリストではなく、いま設定が入っているかを実ファイルから確認する。
   実行: node tools/launch-check.js   （site/ で）
   ※ 情報表示が目的のため未設定でも exit 0（CIを止めない）。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const GENRES = require('../assets/js/genres').list;

function read(p) { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } }
function varVal(file, name) {
  const m = read(file).match(new RegExp('var\\s+' + name + "\\s*=\\s*'([^']*)'"));
  return m ? m[1] : null;
}
function mark(ok) { return ok ? '✅' : '🟡'; }

const lines = [];
let need = 0, needDone = 0;

// 必須：GAS エンドポイント（5ファイル）
const epFiles = [
  ['assets/js/buymo.js', '査定/問い合わせ/応募'],
  ['assets/js/auth.js', '業務ログイン'],
  ['assets/js/hq-common.js', '案件/リード/加盟店/お知らせ'],
  ['assets/js/member.js', '会員マイページ'],
  ['assets/js/report.js', '営業レポート'],
];
lines.push('— 必須：GAS エンドポイント（/exec）—');
epFiles.forEach(function (f) {
  const v = varVal(f[0], 'ENDPOINT');
  const ok = !!(v && v.trim());
  need++; if (ok) needDone++;
  lines.push('  ' + mark(ok) + ' ' + f[0] + '  (' + f[1] + ')' + (ok ? '' : '  ← 未設定（デモ動作）'));
});

// 必須：本番ドメイン（canonical/sitemap 絶対URL）
lines.push('— 必須：本番ドメイン（絶対URL化）—');
const canon = (read('genre/haisha/index.html').match(/rel="canonical" href="([^"]*)"/) || [])[1] || '';
const absCanon = /^https?:\/\//.test(canon);
const smAbs = /<loc>https?:\/\//.test(read('sitemap.xml'));
need += 1; if (absCanon && smAbs) needDone++;
lines.push('  ' + mark(absCanon) + ' canonical 絶対URL（例: ' + (canon || '—') + '）');
lines.push('  ' + mark(smAbs) + ' sitemap.xml 絶対URL');
lines.push('    → 設定: SITE_URL=https://（ドメイン） node tools/gen-genre.js && node tools/gen-area.js');

// 推奨：GA4
lines.push('— 推奨：計測 GA4 —');
const ga = varVal('assets/js/analytics.js', 'MEASUREMENT_ID');
lines.push('  ' + mark(!!(ga && ga.trim())) + ' analytics.js MEASUREMENT_ID' + (ga && ga.trim() ? ' = ' + ga : '  ← 未設定（計測オフ）'));

// 任意：チャットボットAI
lines.push('— 任意：チャットボットAI —');
const bot = varVal('assets/js/chatbot.js', 'BOT_ENDPOINT');
lines.push('  ' + mark(!!(bot && bot.trim())) + ' chatbot.js BOT_ENDPOINT' + (bot && bot.trim() ? '' : '  ← 未設定（ルールベースで動作）'));

// 任意：ジャンルのヒーロー画像（SVGバナーは生成済み。実写真jpgを置くと上書き）
lines.push('— 任意：ジャンルのヒーロー画像 —');
let svgN = 0, jpgN = 0;
GENRES.forEach(function (g) {
  if (fs.existsSync(path.join(ROOT, 'assets/img/genre/' + g.slug + '.svg'))) svgN++;
  if (fs.existsSync(path.join(ROOT, 'assets/img/genre/' + g.slug + '.jpg'))) jpgN++;
});
lines.push('  ' + mark(svgN === GENRES.length) + ' ブランドSVGバナー ' + svgN + ' / ' + GENRES.length + ' 配置済み（node tools/gen-genre-art.js で再生成）');
lines.push('  ' + mark(jpgN === GENRES.length) + ' 実写真(jpg) ' + jpgN + ' / ' + GENRES.length + '（assets/img/genre/<slug>.jpg を置くとSVGを上書き／任意）');

// 情報：電話番号（表示↔実番号）
lines.push('— 情報：電話番号 —');
const disp = read('buymo.html').indexOf('0120-123-456') >= 0;
lines.push('  ℹ️ 表示番号 0120-123-456 / 実番号 050-1784-2929。統一方針を確定してください' + (disp ? '' : ''));

// 情報：生成済みページ数
lines.push('— 情報：生成済みページ —');
function countDir(glob) { return glob; }
const genreN = GENRES.length;
const crossN = (function () {
  let n = 0; const CROSS = require('./_cross');
  CROSS.pairs(GENRES).forEach(function (pr) { if (fs.existsSync(path.join(ROOT, 'genre/' + pr.genre.slug + '/' + pr.pref.slug + '/index.html'))) n++; });
  return n;
})();
const smCount = (read('sitemap.xml').match(/<loc>/g) || []).length;
lines.push('  ℹ️ ジャンルLP ' + genreN + ' / 掛け合わせLP ' + crossN + ' / sitemap ' + smCount + ' URL');

console.log('\n=== BUYMO 公開準備チェック ===\n');
console.log(lines.join('\n'));
console.log('\n必須項目: ' + needDone + ' / ' + need + ' 完了');
console.log(needDone === need
  ? '\n✅ 必須項目はすべて設定済み。公開できます。'
  : '\n🟡 未設定の必須項目があります（上記 🟡）。デモ動作のままでも表示は可能です。');
console.log('\n詳細手順: docs/デプロイ手順.md（C2章）\n');
