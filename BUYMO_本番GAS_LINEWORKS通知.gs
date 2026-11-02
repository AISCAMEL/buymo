/* ============================================================
   BUYMO 本番 GAS（サイト・案件ボード）の Slack 通知を、LINE WORKS にも送る追加ファイル
   ------------------------------------------------------------
   届くようになる通知：🆕 新規お問い合わせ（サイト・LINEミニアプリの査定申込）／ステージ変更／🤝 加盟店申込 など
   （本番 GAS の notifySlack(blocks) を通るものすべて）

   ■ 入れ方（約5分）
     1. 本番 GAS を開き、左の「ファイル」の「＋」→「スクリプト」→ 名前を「LINEWORKS通知」にする。
        中身を全部消して、このファイルの中身を貼り付けて保存
     2. 既存のファイルで「function notifySlack(blocks) {」を検索し、そのすぐ下の行に
          notifyWorksBlocks_(blocks);
        の1行を足して保存（Slack の URL が空でも LINE WORKS には届くよう、if (!url) return; より上に入れる）
     3. プロジェクトの設定 → スクリプト プロパティに LINEWORKS_WEBHOOK_URL を追加
        （LINE WORKS の「Incoming Webhook」アプリをトークルームに追加して発行された URL）
     4. 関数 testWorksNotify を実行 → LINE WORKS のトークルームに届けばOK
     5. デプロイを管理 → 鉛筆 → 新バージョン（URL は変わりません）
   ============================================================ */

// Slack の blocks（section の text・fields）を、LINE WORKS の文章にして送る
function notifyWorksBlocks_(blocks) {
  var url = PropertiesService.getScriptProperties().getProperty('LINEWORKS_WEBHOOK_URL');
  if (!url || !blocks || !blocks.length) return;
  var EMOJI = { ':new:': '🆕', ':handshake:': '🤝', ':camera:': '📷', ':car:': '🚗', ':bell:': '🔔', ':page_facing_up:': '📄' };
  function plain(t) {
    return String(t || '').replace(/:[a-z_]+:/g, function (m) { return EMOJI[m] || ''; })
      .replace(/`/g, '').replace(/\*([^*\n]+)\*/g, '$1').trim();
  }
  var title = '', lines = [];
  blocks.forEach(function (b) {
    if (!b || b.type !== 'section') return;
    if (b.text && b.text.text) { if (!title) title = plain(b.text.text); else lines.push(plain(b.text.text)); }
    (b.fields || []).forEach(function (f) {
      var p = plain(f.text).split('\n');
      lines.push(p[0] + '：' + p.slice(1).join(' '));
    });
  });
  if (!title) return;
  var payload = { title: title.slice(0, 100), body: { text: (lines.join('\n') || title).slice(0, 1900) },
    button: { label: '案件ボードを開く', url: 'https://buymo.me/hq-leads.html' } };
  try {
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) Logger.log('LINE WORKS: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  } catch (e) { Logger.log('LINE WORKS: ' + e.message); }
}

// 試しに送る（エディタから実行）
function testWorksNotify() {
  notifyWorksBlocks_([
    { type: 'section', text: { type: 'mrkdwn', text: ':new: *新規お問い合わせ（テスト）*' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: '*案件 ID*\nTEST-0001' },
      { type: 'mrkdwn', text: '*氏名*\nテスト 太郎' },
      { type: 'mrkdwn', text: '*写真*\n4枚' }
    ]}
  ]);
  Logger.log(PropertiesService.getScriptProperties().getProperty('LINEWORKS_WEBHOOK_URL') ? 'LINE WORKS に送りました' : '★LINEWORKS_WEBHOOK_URL が未設定です');
}
