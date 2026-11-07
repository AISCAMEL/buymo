/* ============================================================
   BUYMO 車買取 — 公式LINE × 案件ボード 連動（案件連動.gs）
   ------------------------------------------------------------
   「BUYMO 車買取 LINE AI応答」の GAS に足すファイル（ファイル名「案件連動」）。
   案件ボード（BUYMO の本番 GAS）は変えずに、案件の一覧を10分おきに読みにいき、
   LINE のお客様に自動でお知らせを送る。

   ■ できること
     1. 進み具合のお知らせ：案件ボードでステージを進めると、その方の LINE に届く
        査定中／査定額提示（商談中）／契約／入金待ち／完了
     2. 査定額のあとの追いかけ：査定額のお知らせから2日・5日たってもお返事がなければ声かけ
        ［売りたい］［相談したい］［今回は見送る］のボタン → 答えは本部に通知
     3. 申し込んでいない友だちへの声かけ：友だち追加から1日・3日・7日（12〜20時に届く）
     4. 引取り日の前日リマインド：本部の画面（hq-kaitori-line.html）で引取り日時を入れると、決まったお知らせと前日18時のお知らせ
     5. 売却後のお礼：完了から3日後に、お礼・紹介・口コミのお願い
     6. 半年後：次のお車探しのご案内
     7. 写真：案件が結びついたお客様がトークに送った写真を、ドライブに保存して案件のメモにリンクを足す
     8. 毎朝の数字：毎朝の点検（dailyCheck）のメールに、昨日の友だち追加・申込・査定額・成約などを足す
     9. AI の概算：トークで「車種・年式・走行距離」がわかると、相場チェックと同じ計算で目安を返す

   ■ 案件と LINE の結びつけ
     ・LINE ミニアプリから申し込んだ案件は、メモの「userId: U…」で自動で結びつく
     ・サイトやお電話の案件は、本部の画面でその方に「案件ID」を入れて結びつける

   ■ スクリプトプロパティ（任意）
     PROD_GAS_URL   : 案件ボードの GAS（本番）の URL。空なら下の既定
     BUYMO_API_KEY  : 本番 GAS に API の合言葉（API_SECRET）を入れている場合だけ、同じものを入れる
     REVIEW_URL     : 口コミを書いてもらうページ（Google のクチコミなど）。空ならボタンを出さない
     NEXT_CAR_URL   : 次のお車探しのページ。空なら「相談したい」ボタン（トークで本部に通知）
     KAITORI_NUDGE  : 'off' にすると、申し込んでいない友だちへの声かけを止める

   ■ 準備：関数 setupCaseLink を1回実行（シートを作り、10分おきのトリガーを入れる）
   ============================================================ */

var PROD_GAS_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbxO8sl8moAF6lFwliBm-0JQAdJcv17TAcw_gq2KOt-2fPkLqsh1wP3CZE2NJKT62lVBsw/exec';
var KCASE_SHEET = 'LINEの案件';
var KCASE_COLS = ['案件ID', 'userId', 'お名前', 'ステージ', '金額', 'ステージが変わった日時', '引取り日時', '配信済み', '査定額へのお返事', 'お返事の日時', '結びつけ', '更新日時'];
var KFRIEND_SHEET = '友だちへの声かけ';
var KFRIEND_COLS = ['userId', '友だち追加日時', '配信済み', '止めた理由'];
var QUOTE_PREFIX = '【査定額へのお返事】';
var QUOTE_ANSWERS = ['売りたい', '相談したい', '今回は見送る'];
var NEXTCAR_TEXT = '【次のお車の相談】次のお車探しを相談したいです';
var QUOTE_STAGES = { '査定額提示': 1, '商談中': 1 };
var CLOSED_STAGES = { '完了': 1, '失注': 1 };
var KHOUR = 3600000, KDAY = 86400000;
var USERID_RE = /userId:\s*(U[0-9a-f]{32})/;

function kprop_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
function kjst_(t, f) { return Utilities.formatDate(new Date(t), 'Asia/Tokyo', f || 'yyyy-MM-dd HH:mm'); }
function khour_(t) { return Number(kjst_(t, 'H')); }
function kms_(v) {
  if (v && typeof v.getTime === 'function') return v.getTime();
  var s = String(v || '').trim();
  if (!s) return 0;
  var t = Date.parse(s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + '+09:00');
  return isNaN(t) ? 0 : t;
}
function kyen_(n) { return '¥' + Number(n || 0).toLocaleString('en-US'); }
function kfirst_(name) { return typeof callName_ === 'function' && name ? callName_(name) : (name ? String(name).split(/\s/)[0] + '様' : ''); }

/* ---------- シート ---------- */
function kbook_() {
  var id = kprop_('LOG_SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : null;
}
function ksheet_(name, cols) {
  var ss = kbook_();
  if (!ss) return null;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0A6B3C').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@');
  }
  return sh;
}
function krows_(sh, n) {
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues();
}
function kcaseObj_(r, i) {
  return { row: i + 2, id: String(r[0] || ''), userId: String(r[1] || ''), name: String(r[2] || ''), stage: String(r[3] || ''),
    amount: Number(r[4]) || 0, stageAt: kms_(r[5]), pickup: kms_(r[6]), sent: String(r[7] || '').split(',').filter(String),
    answer: String(r[8] || ''), answerAt: kms_(r[9]), link: String(r[10] || '自動') };
}
function kcaseRow_(c) {
  return [c.id, c.userId, c.name, c.stage, c.amount || 0, c.stageAt ? kjst_(c.stageAt) : '', c.pickup ? kjst_(c.pickup) : '',
    c.sent.join(','), c.answer || '', c.answerAt ? kjst_(c.answerAt) : '', c.link || '自動', kjst_(Date.now())];
}
function kcases_() {
  var sh = ksheet_(KCASE_SHEET, KCASE_COLS);
  return sh ? krows_(sh, KCASE_COLS.length).map(kcaseObj_).filter(function (c) { return c.id; }) : [];
}
function ksave_(sh, c) {
  if (c.row) sh.getRange(c.row, 1, 1, KCASE_COLS.length).setValues([kcaseRow_(c)]);
  else { sh.appendRow(kcaseRow_(c)); c.row = sh.getLastRow(); }
}
// そのお客様の、いま動いている案件（なければ最新）
function kcaseOfUser_(userId) {
  var list = kcases_().filter(function (c) { return c.userId === userId; });
  var open = list.filter(function (c) { return !CLOSED_STAGES[c.stage]; });
  var pick = (open.length ? open : list);
  return pick.length ? pick[pick.length - 1] : null;
}

/* ---------- 案件ボード（本番 GAS）を読む ---------- */
function prodUrl_() { return kprop_('PROD_GAS_URL') || PROD_GAS_URL_DEFAULT; }
function prodCases_() {
  var key = kprop_('BUYMO_API_KEY');
  var res = UrlFetchApp.fetch(prodUrl_() + '?action=cases' + (key ? '&key=' + encodeURIComponent(key) : ''), { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('案件ボードの読み込み HTTP ' + res.getResponseCode());
  var data = JSON.parse(res.getContentText());
  if (!Array.isArray(data)) throw new Error(data && data.error === 'unauthorized' ? '案件ボードの合言葉が違います（BUYMO_API_KEY）' : '案件ボードの返事が読めません');
  return data;
}
function prodNote_(caseId, text) {
  try {
    UrlFetchApp.fetch(prodUrl_(), { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ type: 'note', id: caseId, text: text }), muteHttpExceptions: true, followRedirects: true });
  } catch (err) { Logger.log('prodNote_: ' + err.message); }
}

/* ---------- LINE のカード ---------- */
function kcard_(title, body, buttons, label) {
  var btns = (buttons || []).map(function (b, i) {
    var uri = /^https?:\/\//.test(b[1]);
    return { type: 'button', style: i === 0 ? 'primary' : 'secondary', color: i === 0 ? '#0A6B3C' : undefined, height: 'sm',
      action: uri ? { type: 'uri', label: b[0].slice(0, 40), uri: b[1] } : { type: 'message', label: b[0].slice(0, 40), text: b[1] } };
  });
  btns.forEach(function (b) { if (!b.color) delete b.color; });
  var bubble = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
      { type: 'text', text: label || 'BUYMO 車買取', size: 'xs', color: '#0A6B3C', weight: 'bold' },
      { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
      { type: 'text', text: body, size: 'sm', color: '#444444', wrap: true }
    ] }
  };
  if (btns.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: btns };
  return { type: 'flex', altText: title, contents: bubble };
}
function kpush_(userId, msg, logText) {
  var ok = push_(userId, [msg]);
  if (ok) logRow_(userId, '自動配信', logText || msg.altText || msg.text || '');
  return ok;
}

/* ---------- お知らせの中身 ---------- */
function kmsg_(id, c, extra) {
  var who = kfirst_(c.name);
  var hi = who ? who + '、' : '';
  var docs = APP_URL + '?view=docs', mypage = MEMBER_URL;
  var ask = [['売りたい', QUOTE_PREFIX + '売りたい'], ['相談したい', QUOTE_PREFIX + '相談したい'], ['今回は見送る', QUOTE_PREFIX + '今回は見送る']];
  if (id === '査定中') return kcard_('査定を始めました', hi + 'お送りいただいたお車の査定を始めました。\n査定額は、最短で翌日にメールとこの LINE でお知らせします。', [['進み具合を見る', mypage]], '査定の進み具合');
  if (id === 'quote') {
    var amt = c.amount > 0 ? '\n\n査定額：' + kyen_(c.amount) : '';
    return kcard_('査定額が出ました', hi + 'お待たせしました。査定額をお知らせします。' + amt + '\n\nくわしくはメール・会員マイページでもご確認いただけます。売却をご希望でしたら、下のボタンでお知らせください（しつこいお電話はしません）。', ask, '査定額のお知らせ');
  }
  if (id === 'q2') return kcard_('査定額、ご検討いかがですか？', hi + '先日お知らせした査定額' + (c.amount > 0 ? '（' + kyen_(c.amount) + '）' : '') + '、ご検討いかがでしょうか。\n気になることがあれば、このトークでいつでも聞いてください。', ask, '査定額のフォロー');
  if (id === 'q5') return kcard_('ご売却のご予定はいかがですか？', hi + '査定額は、相場が動くと変わることがあります。売却を考えていらっしゃる場合は、早めにお知らせください。\n今回は見送る場合も、ボタンを押していただければ、このお知らせは止まります。', ask, '査定額のフォロー');
  if (id === '契約') return kcard_('ご契約ありがとうございます', hi + 'ご売却のご決断、ありがとうございます。\n必要書類をご準備ください（下のボタンでチェックできます）。引取りの日時が決まりましたら、この LINE でお知らせします。', [['必要書類をチェック', docs], ['進み具合を見る', mypage]], 'ご契約');
  if (id === 'pickset') return kcard_('引取りの日時が決まりました', hi + '引取りは ' + kjst_(c.pickup, 'M月d日（' + '日月火水木金土'.charAt(Number(kjst_(c.pickup, 'u')) % 7) + '）H:mm') + ' です。\n当日は、業者がお車の確認と引き取りに伺います。前日にもお知らせします。', [['必要書類をチェック', docs]], '引取りの日時');
  if (id === 'pick1') return kcard_('明日、お車の引取りです', hi + '明日 ' + kjst_(c.pickup, 'H:mm') + ' に伺います。\n書類のご準備はできていますか？（車検証・自賠責保険証明書・納税証明書・リサイクル券など。普通車は印鑑登録証明書と実印も）\nご都合が変わったときは、このトークでお知らせください。', [['必要書類をチェック', docs]], '引取りの前日');
  if (id === '入金待ち') return kcard_('お車と書類を確認しました', hi + 'お車の引取りと書類の確認が済みました。\nご入金は3営業日以内にお振り込みします。入金が済みましたら、この LINE でお知らせします。', [['進み具合を見る', mypage]], 'ご入金の準備');
  if (id === '完了') return kcard_('ご入金が完了しました', hi + 'ご入金が完了しました。BUYMO をご利用いただき、ありがとうございました！\nわからないことがあれば、このトークでいつでもどうぞ。', [], 'ご入金');
  if (id === 'r3') {
    var rv = kprop_('REVIEW_URL');
    var b = [['ご家族・お友だちに教える', APP_URL + '?view=home&share=1']];
    if (rv) b.unshift(['口コミを書く', rv]);
    return kcard_('ご売却のお礼', hi + 'このたびは、ありがとうございました。\nもしよろしければ、BUYMO の感想をお聞かせください。ご家族やお友だちで車を手放す方がいれば、ご紹介いただけるととてもうれしいです。', b, 'ありがとうございました');
  }
  if (id === 'n180') {
    var nc = kprop_('NEXT_CAR_URL');
    return kcard_('次のお車探しもお手伝いします', hi + 'お車を手放されてから半年がたちました。その後いかがですか？\n次のお車探しやローンのご相談も、BUYMO にお任せください。', [nc ? ['次のお車を見る', nc] : ['相談したい', NEXTCAR_TEXT]], 'その後いかがですか');
  }
  if (id === 'fr1') return kcard_('いまの愛車、いくらになるか見てみませんか？', '友だち追加ありがとうございます！\n「30秒で相場チェック」で、車種・年式・走行距離からおおよその目安がすぐわかります。', [['30秒で相場チェック', APP_URL + '?view=home'], ['写真で無料査定（約3分）', SATEI_PAGE]], 'BUYMO 車買取');
  if (id === 'fr3') return kcard_('事故車・動かない車も大丈夫です', '修復歴のある車、車検切れ、動かない車も、写真を送るだけで査定できます。\n査定料・手数料・引取りはすべて無料。しつこい電話もしません。', [['写真で無料査定', SATEI_PAGE], ['トークで質問する', MENU_TALK_TEXT]], 'BUYMO 車買取');
  if (id === 'fr7') return kcard_('売りどき、チェックしてみませんか？', '車は、時間がたつほど値段が下がりやすくなります。5つの質問に答えるだけで、いまが売りどきかがわかります。', [['売りどきチェック（5問）', APP_URL + '?view=check'], ['写真で無料査定', SATEI_PAGE]], 'BUYMO 車買取');
  return null;
}
// ステージ → お知らせ
function kstageMsgId_(stage) {
  if (QUOTE_STAGES[stage]) return 'quote';
  return { '査定中': '査定中', '契約': '契約', '入金待ち': '入金待ち', '完了': '完了' }[stage] || '';
}

/* ---------- 10分おき ---------- */
function caseTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var now = Date.now();
    try { ksyncCases_(now); } catch (err) {
      Logger.log('caseTick: ' + err.message);
      var c = CacheService.getScriptCache();   // 同じエラーの通知は1日1回まで
      if (!c.get('kerr')) { c.put('kerr', '1', 21600); reportError_('案件ボードとの連動', err); }
    }
    try { kfollowUps_(now); } catch (err2) { reportError_('案件のフォロー', err2); }
    try { kfriendNudges_(now); } catch (err3) { reportError_('友だちへの声かけ', err3); }
  } finally {
    lock.releaseLock();
  }
}

// 案件ボードのステージの変化を見て、お知らせを送る
function ksyncCases_(now) {
  var sh = ksheet_(KCASE_SHEET, KCASE_COLS);
  if (!sh) return;
  var mine = {};
  krows_(sh, KCASE_COLS.length).forEach(function (r, i) { var c = kcaseObj_(r, i); if (c.id) mine[c.id] = c; });
  prodCases_().forEach(function (pc) {
    var id = String(pc.id || '');
    if (!id) return;
    var c = mine[id];
    var m = String(pc.memo || '').match(USERID_RE);
    if (!c && !m) return;                       // LINE と結びついていない案件
    var stage = String(pc.stage || ''), amount = Number(pc.amount) || 0, name = String(pc.name || '');
    if (!c) {
      // はじめて見つけた案件：いまの状態を覚えるだけ（入れた時点の古い案件にまとめて送らない）
      c = { row: 0, id: id, userId: m[1], name: name, stage: stage, amount: amount, stageAt: now, pickup: 0, sent: [], answer: '', answerAt: 0, link: '自動' };
      if (QUOTE_STAGES[stage]) c.sent.push('quote', 'q2', 'q5');
      if (CLOSED_STAGES[stage]) c.sent.push('r3', 'n180');
      ksave_(sh, c);
      if (name && typeof setRealName_ === 'function') setRealName_(c.userId, name, '申込');
      return;
    }
    if (!c.userId) return;
    var renamed = !!name && name !== c.name;
    if (renamed) { c.name = name; if (typeof setRealName_ === 'function') setRealName_(c.userId, name, '申込'); }
    var changed = stage !== c.stage, amtUp = amount > 0 && amount !== c.amount;
    if (!changed && !amtUp) { if (renamed) ksave_(sh, c); return; }
    var prevAmount = c.amount;
    c.amount = amount;
    if (changed) {
      c.stage = stage; c.stageAt = now;
      if (QUOTE_STAGES[stage]) { c.sent = c.sent.filter(function (x) { return ['quote', 'q2', 'q5'].indexOf(x) < 0; }); c.answer = ''; c.answerAt = 0; }
      var mid = kstageMsgId_(stage);
      if (mid && !(mid === 'quote' && c.sent.indexOf('quote') >= 0)) {
        if (kpush_(c.userId, kmsg_(mid, c))) { if (mid === 'quote') c.sent.push('quote'); }
      }
    } else if (QUOTE_STAGES[stage] && amtUp && prevAmount === 0) {
      // 査定額のお知らせを金額なしで送ったあとに、金額が入った
      kpush_(c.userId, kmsg_('quote', c));
    }
    ksave_(sh, c);
  });
}

// 査定額の追いかけ・引取りの前日・お礼・半年後
function kfollowUps_(now) {
  var sh = ksheet_(KCASE_SHEET, KCASE_COLS);
  if (!sh) return;
  var h = khour_(now);
  krows_(sh, KCASE_COLS.length).forEach(function (r, i) {
    var c = kcaseObj_(r, i);
    if (!c.id || !c.userId) return;
    var add = [];
    function due(key, at, fromH, toH) {
      if (c.sent.indexOf(key) >= 0 || !at || now < at) return;
      add.push(key);
      if (now - at < 2 * KDAY && h >= fromH && h < toH) { if (!kpush_(c.userId, kmsg_(key, c))) add.pop(); }
      else if (now - at < 2 * KDAY) add.pop();   // 時間帯の外：あとで送る
    }
    if (QUOTE_STAGES[c.stage] && !c.answer && c.stageAt) {
      due('q2', c.stageAt + 2 * KDAY, 10, 20);
      due('q5', c.stageAt + 5 * KDAY, 10, 20);
    }
    if (c.pickup && !CLOSED_STAGES[c.stage]) {
      var eve = kms_(kjst_(c.pickup - KDAY, 'yyyy-MM-dd') + ' 18:00');
      var key = 'pick1@' + kjst_(c.pickup, 'MMddHHmm');
      if (c.sent.indexOf(key) < 0 && now >= eve && now < c.pickup) { if (kpush_(c.userId, kmsg_('pick1', c))) add.push(key); }
    }
    if (c.stage === '完了' && c.stageAt) {
      due('r3', kms_(kjst_(c.stageAt + 3 * KDAY, 'yyyy-MM-dd') + ' 11:00'), 10, 20);
      due('n180', kms_(kjst_(c.stageAt + 180 * KDAY, 'yyyy-MM-dd') + ' 11:00'), 10, 20);
    }
    if (add.length) { c.sent = c.sent.concat(add); ksave_(sh, c); }
  });
}

/* ---------- 申し込んでいない友だちへの声かけ ---------- */
function kfriendAdd_(userId) {
  try {
    var sh = ksheet_(KFRIEND_SHEET, KFRIEND_COLS);
    if (!sh) return;
    var rows = krows_(sh, KFRIEND_COLS.length), at = -1;
    rows.forEach(function (r, i) { if (String(r[0]) === userId) at = i; });
    if (at >= 0) sh.getRange(at + 2, 2, 1, 3).setValues([[kjst_(Date.now()), '', '']]);   // 追加し直し：最初から
    else sh.appendRow([userId, kjst_(Date.now()), '', '']);
  } catch (err) { Logger.log('kfriendAdd_: ' + err.message); }
}
function kfriendStop_(userId, why) {
  try {
    var sh = ksheet_(KFRIEND_SHEET, KFRIEND_COLS);
    if (!sh) return;
    krows_(sh, KFRIEND_COLS.length).forEach(function (r, i) { if (String(r[0]) === userId && !r[3]) sh.getRange(i + 2, 4).setValue(why); });
  } catch (err) { Logger.log('kfriendStop_: ' + err.message); }
}
function kfriendNudges_(now) {
  if (kprop_('KAITORI_NUDGE') === 'off') return;
  var h = khour_(now);
  if (h < 12 || h >= 20) return;
  var sh = ksheet_(KFRIEND_SHEET, KFRIEND_COLS);
  if (!sh) return;
  var linked = {};
  kcases_().forEach(function (c) { if (c.userId) linked[c.userId] = 1; });
  krows_(sh, KFRIEND_COLS.length).forEach(function (r, i) {
    var u = String(r[0] || ''), at = kms_(r[1]), sent = String(r[2] || '').split(',').filter(String);
    if (!u || !at || r[3]) return;
    if (linked[u]) { sh.getRange(i + 2, 4).setValue('申込あり'); return; }
    if (now - at > 9 * KDAY) { sh.getRange(i + 2, 4).setValue('おわり'); return; }
    var next = [['fr1', 1], ['fr3', 3], ['fr7', 7]].filter(function (x) { return sent.indexOf(x[0]) < 0 && now >= at + x[1] * KDAY; });
    if (!next.length) return;
    // 遅れて複数たまっていたら、最後の1通だけ送る
    var pick = next[next.length - 1][0];
    if (kpush_(u, kmsg_(pick, {}))) sh.getRange(i + 2, 3).setValue(sent.concat(next.map(function (x) { return x[0]; })).join(','));
  });
}

/* ---------- トークから（コード.gs が呼ぶ） ---------- */
// 【査定額へのお返事】売りたい など
function kquoteReply_(replyToken, userId, text) {
  var ans = text.slice(QUOTE_PREFIX.length).trim();
  if (QUOTE_ANSWERS.indexOf(ans) < 0) ans = ans.slice(0, 40);
  var c = kcaseOfUser_(userId);
  if (c) {
    var sh = ksheet_(KCASE_SHEET, KCASE_COLS);
    c.answer = ans; c.answerAt = Date.now();
    ksave_(sh, c);
    prodNote_(c.id, 'LINEで査定額へのお返事：' + ans);
  }
  var who = custName_(userId);
  var msg = ans === '売りたい'
    ? 'ありがとうございます！担当者から、ご契約と引取りの流れをご連絡します（営業時間外は翌営業日になることがあります）。\n必要書類も、いまのうちに確認しておくと安心です。'
    : ans === '相談したい'
      ? 'お知らせありがとうございます。担当者からこのトークでご連絡します。\n気になることは、そのまま送っていただければ AI もすぐにお答えします。'
      : ans === '今回は見送る'
        ? 'お知らせありがとうございます。今回は見送りで承りました。このあとのお知らせは止めます。\nまた売却を考えるときは、いつでもこのトークに送ってください。'
        : 'お知らせありがとうございます。担当者が確認します。';
  reply_(replyToken, msg, ans === '売りたい' ? [{ label: '必要書類', uri: APP_URL + '?view=docs' }] : DEFAULT_QUICK);
  logRow_(userId, 'お客様', text);
  logRow_(userId, ans === '今回は見送る' ? '定型' : '引き継ぎ', msg);
  notifyStaff_((ans === '売りたい' ? '🔥 ' : '') + '査定額へのお返事：' + ans + '（' + who + '）',
    (c ? '案件：' + c.id + (c.amount ? '（査定額 ' + kyen_(c.amount) + '）' : '') + '\n案件ボードで開く：https://buymo.me/hq.html?role=hq&case=' + encodeURIComponent(c.id) + '\n' : '') +
    (ans === '今回は見送る' ? '案件ボードのステージを「失注」などにしてください。' : 'LINE のチャットで、この方に連絡してください。'));
}
function knextCarReply_(replyToken, userId, text) {
  var msg = 'ありがとうございます！担当者から、このトークでご連絡します。ご希望の車種やご予算があれば、そのまま送ってください。';
  reply_(replyToken, msg, DEFAULT_QUICK);
  logRow_(userId, 'お客様', text);
  logRow_(userId, '引き継ぎ', msg);
  notifyStaff_('🚗 次のお車の相談（' + custName_(userId) + '）', 'ご売却から半年のお知らせに「相談したい」と答えました。LINE のチャットで連絡してください。');
}

// 写真：案件と結びついていれば、ドライブに保存して案件のメモにリンクを足す。保存した案件IDを返す
function kcasePhoto_(userId, messageId) {
  try {
    var c = kcaseOfUser_(userId);
    if (!c || CLOSED_STAGES[c.stage]) return '';
    var token = kprop_('LINE_CHANNEL_ACCESS_TOKEN');
    var res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '';
    var blob = res.getBlob().setName(c.id + '_LINE_' + kjst_(Date.now(), 'yyyyMMdd_HHmmss') + '.jpg');
    var root = kfolder_(DriveApp.getRootFolder(), 'BUYMO 車買取 LINEの写真');
    var folder = kfolder_(root, c.id + ' ' + (c.name || ''));
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* 共有できない設定のときはそのまま */ }
    prodNote_(c.id, 'LINEで写真が届きました：' + file.getUrl());
    return c.id;
  } catch (err) {
    Logger.log('kcasePhoto_: ' + err.message);
    reportError_('LINEの写真の保存', err);
    return '';
  }
}
function kfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------- AI の概算（相場チェックと同じ計算） ---------- */
var KSIM_BASE = { '軽自動車': 900000, 'コンパクト': 1000000, 'セダン': 1300000, 'ミニバン': 1600000, 'SUV': 1800000, '輸入車・高級車': 3000000, 'トラック・商用車': 1500000 };
var KSIM_COND = { '良好': 1.0, '普通': 0.85, '修復歴': 0.55, '不動': 0.22 };
var ESTIMATE_RE = /\[\[ESTIMATE:([^\]\n]{1,80})\]\]/g;
function kestimate_(cls, year, km, cond) {
  function round(n) { return n >= 100000 ? Math.round(n / 10000) * 10000 : Math.max(5000, Math.round(n / 1000) * 1000); }
  var base = KSIM_BASE[cls] || 1000000;
  var age = Math.max(0, Number(kjst_(Date.now(), 'yyyy')) - Number(year));
  var depr = Math.max(0.06, Math.pow(0.88, age));
  var mfac = Math.max(0.2, 1 - (Number(km) / 10000) * 0.05);
  var point = base * depr * mfac * (KSIM_COND[cond] || 0.85);
  var min = round(point * 0.88), max = round(point * 1.12);
  if (max < min) max = min;
  return { min: Math.max(5000, min), max: Math.max(10000, max) };
}
// AI の回答の印 [[ESTIMATE:区分|年式|走行距離km|状態]] を、計算した目安の文に置きかえる
function kestimateFill_(answer) {
  var added = '';
  var out = String(answer || '').replace(ESTIMATE_RE, function (_, body) {
    var p = body.split('|').map(function (s) { return s.trim(); });
    var cls = KSIM_BASE[p[0]] ? p[0] : '', year = Number(String(p[1] || '').replace(/[^0-9]/g, '')), km = Number(String(p[2] || '').replace(/[^0-9]/g, ''));
    var cond = KSIM_COND[p[3]] ? p[3] : '普通';
    var thisYear = Number(kjst_(Date.now(), 'yyyy'));
    if (!cls || !(year >= 1980 && year <= thisYear) || !(km >= 0 && km < 1000000)) return '';
    var r = kestimate_(cls, year, km, cond);
    added = '\n\n相場チェックの計算での目安：' + kyen_(r.min) + '〜' + kyen_(r.max) +
      '（' + cls + '・' + year + '年・' + (km >= 10000 ? Math.round(km / 1000) / 10 + '万km' : km + 'km') + '・状態「' + cond + '」）\n' +
      'あくまで目安です。実際の金額はお車の状態で変わるので、写真で無料査定（約3分）で正確な金額をお伝えします。';
    return '';
  }).replace(/\n+$/, '');
  return out + added;
}
// AI への指示に足す文
var ESTIMATE_PROMPT = [
  '',
  '# おおよその金額の目安（自動で計算して付け足す）',
  '- お客様の車の「車種（または車の区分）」「年式」「走行距離」がわかったら、回答の最後の行に [[ESTIMATE:区分|年式(西暦)|走行距離(km)|状態]] とだけ書く。システムが相場チェックと同じ計算で目安を付け足す。',
  '- 区分は 軽自動車／コンパクト／セダン／ミニバン／SUV／輸入車・高級車／トラック・商用車 のどれか（車種から判断する。例：プリウス→セダン、N-BOX→軽自動車、アルファード→ミニバン、ハリアー→SUV、ベンツ→輸入車・高級車）。',
  '- 状態は 良好／普通／修復歴／不動 のどれか。わからなければ 普通。年式は西暦（令和2年→2020）。走行距離は km の数字（8万km→80000）。',
  '- 3つのうち足りないものがあれば、印は書かずに、足りないもの（年式・走行距離など）をやさしくたずねる。金額の数字は自分では書かない。同じ車で一度目安を出したら、くり返し書かない。'
].join('\n');

/* ---------- 毎朝の数字（dailyCheck から） ---------- */
function caseDailyLines_() {
  var now = Date.now();
  var y0 = kms_(kjst_(now - KDAY, 'yyyy-MM-dd') + ' 00:00'), y1 = y0 + KDAY;
  var s = { follow: 0, block: 0, apply: 0, photo: 0, handoff: 0, quoteAns: {} };
  try {
    logRows_().forEach(function (r) {
      var t = logTime_(r[0]);
      if (t < y0 || t >= y1) return;
      var who = String(r[3]), text = String(r[4] || '');
      if (who === '友だち追加') s.follow++;
      if (who === 'ブロック') s.block++;
      if (who === 'お客様' && text.indexOf(APPLY_PREFIX) === 0) s.apply++;
      if (who === 'お客様' && text === '（写真）') s.photo++;
      if (who === '引き継ぎ') s.handoff++;
    });
  } catch (e) { /* noop */ }
  var st = { quote: 0, contract: 0, done: 0 }, ans = 0, ansSell = 0, pickToday = 0;
  kcases_().forEach(function (c) {
    if (c.stageAt >= y0 && c.stageAt < y1) {
      if (QUOTE_STAGES[c.stage]) st.quote++;
      if (c.stage === '契約') st.contract++;
      if (c.stage === '完了') st.done++;
    }
    if (c.answerAt >= y0 && c.answerAt < y1) { ans++; if (c.answer === '売りたい') ansSell++; }
    if (c.pickup >= y1 && c.pickup < y1 + KDAY) pickToday++;
  });
  return ['', '■ 昨日の数字（' + kjst_(y0, 'M/d') + '）',
    '友だち追加 ' + s.follow + '／ブロック ' + s.block + '／ミニアプリの査定申込 ' + s.apply + '／トークの写真 ' + s.photo + '／担当者への引き継ぎ ' + s.handoff,
    '査定額のお知らせ ' + st.quote + '／ご契約 ' + st.contract + '／ご入金完了 ' + st.done,
    '査定額へのお返事 ' + ans + '（うち「売りたい」' + ansSell + '）／今日の引取り ' + pickToday + '件'];
}

/* ---------- 本部の画面（hq-kaitori-line.html）から ---------- */
function caseAdmin_(req) {
  var sh = ksheet_(KCASE_SHEET, KCASE_COLS);
  if (!sh) return { ok: false, error: 'sheet' };
  var u = String(req.u || ''), id = String(req.caseId || '').trim().toUpperCase();
  if (req.action === 'caseLink') {
    if (!u || !/^[A-Z]{1,4}-?\d{2,6}$/.test(id)) return { ok: false, error: 'id' };
    var pc = null;
    try { pc = prodCases_().filter(function (x) { return String(x.id).toUpperCase() === id; })[0] || null; } catch (e) { return { ok: false, error: 'prod' }; }
    if (!pc) return { ok: false, error: 'notfound' };
    var c = kcases_().filter(function (x) { return x.id.toUpperCase() === id; })[0];
    if (!c) c = { row: 0, id: String(pc.id), sent: [], answer: '', answerAt: 0, pickup: 0 };
    c.userId = u; c.name = String(pc.name || ''); c.stage = String(pc.stage || ''); c.amount = Number(pc.amount) || 0; c.stageAt = c.stageAt || Date.now(); c.link = '本部';
    if (QUOTE_STAGES[c.stage] && c.sent.indexOf('quote') < 0) c.sent.push('quote', 'q2', 'q5');
    if (CLOSED_STAGES[c.stage]) c.sent.push('r3', 'n180');
    ksave_(sh, c);
    if (c.name && typeof setRealName_ === 'function') setRealName_(u, c.name, '申込');
    logRow_(u, '本部', '本部の画面で案件 ' + c.id + ' と結びつけました');
    return { ok: true, kcase: kview_(c) };
  }
  if (req.action === 'caseUnlink') {
    var cu = kcases_().filter(function (x) { return x.id.toUpperCase() === id; })[0];
    if (!cu) return { ok: false, error: 'notfound' };
    sh.deleteRow(cu.row);
    if (cu.userId) logRow_(cu.userId, '本部', '本部の画面で案件 ' + cu.id + ' の結びつけを外しました');
    return { ok: true };
  }
  if (req.action === 'pickup') {
    var cp = kcases_().filter(function (x) { return x.id.toUpperCase() === id; })[0];
    if (!cp) return { ok: false, error: 'notfound' };
    var at = req.at ? kms_(String(req.at).replace('T', ' ')) : 0;
    if (req.at && (!at || at < Date.now())) return { ok: false, error: 'at' };
    cp.pickup = at;
    ksave_(sh, cp);
    if (at) {
      if (req.notify !== false && cp.userId) kpush_(cp.userId, kmsg_('pickset', cp));
      prodNote_(cp.id, '引取り日時：' + kjst_(at, 'M/d H:mm'));
      logRow_(cp.userId, '本部', '引取り日時を ' + kjst_(at, 'M/d H:mm') + ' にしました');
    }
    return { ok: true, kcase: kview_(cp) };
  }
  if (req.action === 'kdone') {   // 「対応しました」：いま対応が必要な人から外す
    if (!u) return { ok: false, error: 'u' };
    logRow_(u, '本部', '本部が対応しました' + (req.note ? '：' + String(req.note).slice(0, 200) : ''));
    return { ok: true };
  }
  if (req.action === 'stats') return { ok: true, lines: caseDailyLines_() };
  return { ok: false, error: 'action' };
}
function kview_(c) {
  return { id: c.id, stage: c.stage, amount: c.amount, stageAt: c.stageAt, pickup: c.pickup, answer: c.answer, answerAt: c.answerAt, link: c.link, sent: c.sent };
}
// adminPeople_ に足す：その方の案件
function casePeopleInfo_() {
  var map = {};
  kcases_().forEach(function (c) { if (c.userId) (map[c.userId] = map[c.userId] || []).push(kview_(c)); });
  var fr = {};
  try {
    var sh = ksheet_(KFRIEND_SHEET, KFRIEND_COLS);
    if (sh) krows_(sh, KFRIEND_COLS.length).forEach(function (r) { if (r[0]) fr[String(r[0])] = { sent: String(r[2] || ''), stop: String(r[3] || '') }; });
  } catch (e) { /* noop */ }
  return { cases: map, friends: fr };
}

/* ---------- 準備・点検 ---------- */
function setupCaseLink() {
  ksheet_(KCASE_SHEET, KCASE_COLS);
  ksheet_(KFRIEND_SHEET, KFRIEND_COLS);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'caseTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('caseTick').timeBased().everyMinutes(10).create();
  try {
    var list = prodCases_();
    var linked = list.filter(function (c) { return USERID_RE.test(String(c.memo || '')); }).length;
    Logger.log('✓ 案件ボードを読めました（案件 ' + list.length + ' 件／LINE ミニアプリからの案件 ' + linked + ' 件）');
  } catch (err) {
    Logger.log('✗ 案件ボードを読めません：' + err.message);
    Logger.log('  本番 GAS に API の合言葉を入れている場合は、スクリプトプロパティ BUYMO_API_KEY に同じものを入れてください');
  }
  Logger.log('✓ 10分おきに案件ボードを見て、LINE にお知らせを送る設定にしました（「' + KCASE_SHEET + '」「' + KFRIEND_SHEET + '」シート）');
  caseTick();
  Logger.log('いまの結びつき：' + kcases_().length + ' 件');
}
function caseHealth_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'caseTick'; });
  if (!has) return { label: '案件ボードとの連動', level: 'warn', text: '10分おきのトリガーがありません（setupCaseLink を実行）' };
  try { var n = prodCases_().length; return { label: '案件ボードとの連動', level: 'ok', text: '案件 ' + n + ' 件を読めています／LINE と結びついた案件 ' + kcases_().length + ' 件' }; }
  catch (err) { return { label: '案件ボードとの連動', level: 'ng', text: err.message }; }
}
