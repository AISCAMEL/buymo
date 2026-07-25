/* ============================================================
   BUYMO スモークテスト（主要フローの実機回帰）
   - 公開／本部／加盟店の主要ページを実ブラウザで開く
   - 「コンソールエラー0」＋「主要要素の存在」を検証
   実行: cd site/tests && npm i playwright && node smoke.js
   （CIでは PLAYWRIGHT 同梱の Chromium を使用）
   ============================================================ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'file://' + path.resolve(__dirname, '..');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const PUBLIC = [
  ['buymo.html', '#buymoSim'],
  ['buymo.html', '.area-chips a'],          // トップ→都道府県LPの内部リンク
  ['buymo-contact.html', '#quoteForm'],
  ['buymo-thanks.html', '.thanks-steps'],   // 送信完了ページ
  ['buymo-partner.html', '#quoteForm'],
  ['genre/index.html', '.genre-group-block, .genre-card, .genre-cards-grid'],
  ['genre/haisha/index.html', '.genre-points'],     // ジャンル専用LP
  ['genre/haisha/index.html', '[data-buymo-sim]'],  // ジャンルLPの査定シミュ
  ['genre/hiace/tokyo/index.html', '.city-chips'],  // ジャンル×エリア掛け合わせLP
  ['area/index.html', '.pref-grid'],
  ['area/tokyo/index.html', '.city-chips'],
  ['tokushoho.html', '.legal'],
  ['member.html', '#memberLogin'],
  ['404.html', '.nf-nav a'],                // 404の回遊リンク
];
const HQ = [
  ['hq-dashboard.html', '#kTotal'],
  ['hq.html?role=hq', '#board'],
  ['hq-leads.html', '#rows'],
  ['hq-leads.html', '#btnCsv'],             // リードCSV出力ボタン
  ['hq-stores.html', '#storeGrid'],
  ['hq-stores.html', '#btnCsv'],            // 加盟店CSV出力ボタン
  ['report.html', '#funnel'],
  ['report.html', '#btnCsv'],               // レポートCSV出力ボタン
  ['hq-notices.html', '#noticeList'],
];
const PARTNER = [
  ['partner-academy.html', '#academyGrid'],
  ['partner-course.html?id=basic', '#cvList'],
  ['partner-quiz.html?id=basic', '.quiz-q'],
  ['partner-cert.html?id=basic', '#certRoot'],
  ['partner-scripts.html', '#scriptGroups'],
  ['partner-community.html', '#cmList'],
];

// モバイル横スクロール（はみ出し）回帰チェック対象。role=ログイン要否。
const MOBILE = [
  ['buymo.html', null],
  ['genre/index.html', null],
  ['genre/haisha/index.html', null],
  ['genre/hiace/tokyo/index.html', null],
  ['area/tokyo/index.html', null],
  ['buymo-contact.html', null],
  ['report.html', 'hq'],
  ['hq-leads.html', 'hq'],
  ['partner-academy.html', 'partner'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined });
  const results = [];

  async function run(ctx, list) {
    for (const [url, sel] of list) {
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(String(e)));
      // 外部リソース(フォントCDN等)の読込失敗は本番では起きないため除外。JS例外のみ計上。
      pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console:' + m.text()); });
      let ok = false, detail = '';
      try {
        await pg.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await pg.waitForTimeout(300);
        const landed = pg.url().split('/').pop();
        const count = await pg.locator(sel).count();
        ok = count > 0 && errs.length === 0;
        detail = 'el=' + count + (errs.length ? ' ERR=' + errs.length + ' ' + errs[0].slice(0, 60) : '') + (landed.indexOf('portal-login') >= 0 ? ' (redirected to login!)' : '');
      } catch (e) { detail = 'EXCEPTION ' + String(e).slice(0, 60); }
      results.push([url, ok, detail]);
      await pg.close();
    }
  }

  const pub = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await run(pub, PUBLIC); await pub.close();

  const hq = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await hq.addInitScript(() => { try { localStorage.setItem('buymo_session', JSON.stringify({ token: 't', role: 'hq', name: '本部', email: 'x@x', exp: 4102444800000 })); } catch (e) {} });
  await run(hq, HQ); await hq.close();

  const pt = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await pt.addInitScript(() => { try { localStorage.setItem('buymo_session', JSON.stringify({ token: 't', role: 'partner', name: 'いわき店', email: 'x@x', exp: 4102444800000 })); localStorage.setItem('buymo_role', 'partner'); } catch (e) {} });
  await run(pt, PARTNER); await pt.close();

  // モバイル(375px)横はみ出し検査
  async function runMobile(list) {
    for (const [url, role] of list) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
      if (role) await ctx.addInitScript(r => { try { localStorage.setItem('buymo_session', JSON.stringify({ token: 't', role: r, name: 'デモ', email: 'x@x', exp: 4102444800000 })); } catch (e) {} }, role);
      const pg = await ctx.newPage();
      let ok = false, detail = '';
      try {
        await pg.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await pg.waitForTimeout(300);
        const m = await pg.evaluate(() => {
          var sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
          var info = '';
          if (sw > cw + 1) {
            var all = document.querySelectorAll('*');
            var wide = [];
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              if (el.scrollWidth > cw + 1) {
                var cn = (el.className && typeof el.className === 'string') ? '.'+el.className.trim().split(/\s+/).join('.') : '';
                wide.push(el.tagName + (el.id?'#'+el.id:'') + cn.slice(0,30) + ' sw=' + el.scrollWidth + ' ow=' + el.offsetWidth + ' cs=' + getComputedStyle(el).overflowX);
              }
            }
            info = wide.slice(0,5).join(' | ');
          }
          return { sw: sw, cw: cw, info: info };
        });
        ok = m.sw <= m.cw + 1;
        detail = 'sw=' + m.sw + '/cw=' + m.cw + (ok ? '' : ' ⚠ 横はみ出し | ' + m.info);
      } catch (e) { detail = 'EXCEPTION ' + String(e).slice(0, 60); }
      results.push(['[mobile] ' + url, ok, detail]);
      await ctx.close();
    }
  }
  await runMobile(MOBILE);

  await browser.close();

  let pass = 0;
  console.log('\n=== BUYMO スモークテスト結果 ===');
  results.forEach(r => { console.log((r[1] ? '✅' : '❌') + ' ' + r[0] + '  [' + r[2] + ']'); if (r[1]) pass++; });
  console.log('\n' + pass + '/' + results.length + ' passed');
  if (pass !== results.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
