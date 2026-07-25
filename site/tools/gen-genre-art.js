/* ============================================================
   BUYMO ジャンル ヒーローバナー（SVG）ジェネレーター
   genres.js を読み、各ジャンルの assets/img/genre/<slug>.svg を生成。
   ジャンルLPのヒーロー帯の既定ビジュアル（実写真 <slug>.jpg を置くと上書き）。
   実行: node tools/gen-genre-art.js  （site/ で）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const GENRES = require('../assets/js/genres').list;
const ROOT = path.resolve(__dirname, '..');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// カテゴリ別のアクセント配色（明 → 暗）
const PALETTE = {
  '状態・お悩みで買取': ['#FF8A4C', '#E0521B'],
  '人気車種で買取':     ['#3D6FE0', '#1E3A8A'],
  'タイプ・区分で買取': ['#19A6A0', '#0E6F6A'],
  '旧車・希少車で買取': ['#9B5DE5', '#5B2A86'],
  'パーツ・用品買取':   ['#6B7A99', '#384765'],
};

function banner(g) {
  const pal = PALETTE[g.cat] || ['#FF8A4C', '#E0521B'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" width="1200" height="360" role="img" aria-label="${esc(g.name)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="360" fill="url(#g)"/>
  <circle cx="1040" cy="60" r="240" fill="#ffffff" opacity="0.08"/>
  <circle cx="980" cy="320" r="150" fill="#ffffff" opacity="0.06"/>
  <circle cx="150" cy="330" r="90" fill="#ffffff" opacity="0.05"/>
  <text x="120" y="232" font-size="150" text-anchor="middle">${g.icon}</text>
  <text x="250" y="170" font-size="66" font-weight="900" fill="#ffffff" font-family="'Noto Sans JP',sans-serif">${esc(g.name)}</text>
  <text x="252" y="228" font-size="28" font-weight="700" fill="#ffffff" opacity="0.92" font-family="'Noto Sans JP',sans-serif">BUYMO｜高価買取・無料出張査定・3営業日以内に入金</text>
  <rect x="252" y="252" width="150" height="6" rx="3" fill="#FFD700"/>
</svg>
`;
}

const dir = path.join(ROOT, 'assets', 'img', 'genre');
fs.mkdirSync(dir, { recursive: true });
let n = 0;
GENRES.forEach(g => { fs.writeFileSync(path.join(dir, g.slug + '.svg'), banner(g)); n++; });
console.log('generated ' + n + ' genre hero banners (assets/img/genre/<slug>.svg)');
