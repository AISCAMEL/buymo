/* ============================================================
   BUYMO チャットボット v2 — AI対応（Claude Haiku via GAS）
   - window.BUYMO_BOT_MODE = 'user' | 'partner' で初期モード切替
   - GAS ANTHROPIC_API_KEY 設定済みなら Claude AI 回答
   - 未設定 or タイムアウトはルールベースにフォールバック
   ============================================================ */
(function () {
  'use strict';

  var GAS  = 'https://script.google.com/macros/s/AKfycbw0Ao9-I-GUizO--TIU2AeJCIEGoW8Ot9DZXErD2oJk8fg_1sNj8FRNYkoAvtm6CwMc/exec';
  var MODE = (window.BUYMO_BOT_MODE === 'partner') ? 'partner' : 'user';
  var history = []; // 会話履歴（{role,content}[]）

  var KB = {
    user: {
      title:  '買取AIサポート',
      greet:  'こんにちは！車の売却についてAIがお答えします。なんでもどうぞ。',
      chips:  ['今いくら？', '事故車もOK？', '入金はいつ？', '書類は何が必要？', 'しつこい営業は？'],
      rules: [
        { k: ['しつこい','勧誘','営業電話','安心'],     a: 'しつこい営業は一切しません。査定後のキャンセルも無料。安心してご相談ください。' },
        { k: ['還付','自動車税','重量税','税金'],        a: '廃車（抹消）時は自動車税・自賠責・重量税の還付が受けられる場合があります。手続きも代行します。' },
        { k: ['名義変更','手続き','代行'],               a: '名義変更・廃車抹消など手続きは全て無料代行。書類の取得サポートもあります。' },
        { k: ['書類','車検証','印鑑','用意'],            a: '車検証・自賠責保険証・本人確認書類・印鑑が基本です。普通車は実印＋印鑑証明も必要。揃っていなくてもご相談ください。' },
        { k: ['ハイエース','ランクル','ジムニー','アルファード','人気','高く'],  a: 'ハイエース・ランドクルーザー・ジムニー・アルファードなどは国内外で需要が高く高価買取が期待できます。' },
        { k: ['旧車','絶版','ネオクラ','クラシック'],    a: '旧車・絶版車は希少価値で高評価。不動・レストアベースでも専門ルートで買取します。' },
        { k: ['過走行','距離','10万','多走行'],          a: '走行距離が多い車も買取可能です。ハイエース・ランクルなど海外需要の高い車種は過走行でも高値が付きやすいです。' },
        { k: ['車検切れ','車検'],                        a: '車検切れのままでも査定・引取OK。公道を走れない場合はレッカーで無料引取りします。' },
        { k: ['ローン','残債'],                          a: 'ローン残債がある車も買取できます。残債精算の流れもサポートします。' },
        { k: ['相場','いくら','高く','金額','査定額'],   a: 'ページ上部の「かんたん査定シミュレーション」で30秒で概算確認できます。正確な金額は無料査定でご確認ください。' },
        { k: ['無料','費用','料金'],                     a: '査定・出張・手続き代行・レッカー引取はすべて無料。お客様のご負担はありません。' },
        { k: ['事故','修復','不動','廃車','故障'], a: '事故車・修復歴・不動車・廃車など。他社で断られた車もご相談ください。' },
        { k: ['入金','振込','支払','即日'],              a: '書類・車両を丁寧に確認のうえ、3営業日以内に確実にお振込みします。' },
        { k: ['キャンセル','断る','相談だけ'],           a: '査定だけ・ご相談だけでも大歓迎です。査定後のキャンセルも無料。お気軽にどうぞ。' },
        { k: ['エリア','地域','出張','全国'],            a: '全国47都道府県に対応。お近くのスタッフが無料で出張査定に伺います。' },
        { k: ['電話','受付','時間','何時'],              a: 'お電話は平日8:00〜17:00（📞 050-1784-2929）、フォームは24時間受付です。' }
      ],
      fallback: 'お力になれずすみません。無料査定フォームまたはお電話（050-1784-2929／平日8:00〜17:00）で詳しくご案内します。'
    },
    partner: {
      title: '加盟店AIサポート',
      greet: 'BUYMO加盟店向けAIサポートです。運営・査定・システムの疑問にお答えします。',
      chips: ['出品の流れは？', 'システムの使い方', '加盟したい', '集客は？'],
      rules: [
        { k: ['加盟','開業','費用','始め','応募'],      a: '加盟のご相談は本部まで直接お問い合わせください。費用・条件はプランにより異なり、本部が個別にご説明します。' },
        { k: ['出品','オークション','搬入'],            a: '出品は「申込→査定→出品票作成→会場搬入→落札」の流れです。アカデミーの〈出品マニュアル〉コースをご確認ください。' },
        { k: ['報酬','手数料','収益','ロイヤリティ'],   a: '報酬・ロイヤリティはプランによります。詳細は本部の個別説明をご確認ください。' },
        { k: ['相場','査定','金額'],                    a: '相場は査定シミュレーターやオークション実績を参照。迷う場合は本部へエスカレーションしてください。' },
        { k: ['システム','ボード','リード','ログイン'],  a: '案件管理は看板ボード（hq.html?role=partner）で。ログインはportal-login.htmlから。' },
        { k: ['集客','広告','送客'],                    a: 'LP・地域SEO・ジャンル別LPからの送客は本部が担当。加盟店はリード対応に専念できます。' },
        { k: ['研修','アカデミー','マニュアル'],         a: 'アカデミー（partner-academy.html）で動画研修と修了テストが受講できます。' },
        { k: ['トラブル','クレーム'],                   a: 'クレームは対応履歴に記録のうえ、重大案件は本部へ連絡してください。' }
      ],
      fallback: '本部サポートにお繋ぎします。研修はアカデミー（partner-academy.html）もご活用ください。'
    }
  };

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ---------- Build widget ---------- */
  var root = el('div', 'cbot');
  root.innerHTML =
    '<button class="cbot-launch" aria-label="チャットを開く" aria-expanded="false">' +
      '<span class="cbot-launch-ico">💬</span>' +
      '<span class="cbot-launch-badge" aria-hidden="true">AI</span>' +
    '</button>' +
    '<div class="cbot-panel" hidden role="dialog" aria-label="BUYMOチャットサポート">' +
      '<div class="cbot-head">' +
        '<span class="cbot-title"></span>' +
        '<div class="cbot-mode">' +
          '<button data-mode="user">ユーザー</button>' +
          '<button data-mode="partner">加盟店</button>' +
        '</div>' +
        '<button class="cbot-x" aria-label="チャットを閉じる">×</button>' +
      '</div>' +
      '<div class="cbot-log" id="cbotLog" role="log" aria-live="polite"></div>' +
      '<div class="cbot-chips" id="cbotChips"></div>' +
      '<form class="cbot-input" autocomplete="off">' +
        '<input id="cbotIn" placeholder="メッセージを入力…" aria-label="メッセージ入力" maxlength="300">' +
        '<button type="submit" aria-label="送信">→</button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);
  document.body.classList.add('has-bot');

  var panel  = root.querySelector('.cbot-panel');
  var log    = document.getElementById('cbotLog');
  var chips  = document.getElementById('cbotChips');
  var input  = document.getElementById('cbotIn');

  /* ---------- Message rendering ---------- */
  function addMsg(role, text) {
    var m = el('div', 'cbot-msg ' + role);
    // simple markdown: **bold**, newlines
    var html = esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    m.innerHTML = html;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }

  function addTyping() {
    var t = el('div', 'cbot-msg bot cbot-typing',
      '<span></span><span></span><span></span>');
    log.appendChild(t);
    log.scrollTop = log.scrollHeight;
    return t;
  }

  /* ---------- Rule-based fallback ---------- */
  function ruleAnswer(text) {
    var kb = KB[MODE]; var t = text.toLowerCase();
    for (var i = 0; i < kb.rules.length; i++) {
      var r = kb.rules[i];
      for (var j = 0; j < r.k.length; j++) {
        if (text.indexOf(r.k[j]) >= 0 || t.indexOf(r.k[j]) >= 0) return r.a;
      }
    }
    return kb.fallback;
  }

  /* ---------- AI call (JSONP → GAS → Claude) ---------- */
  function aiAsk(text, cb) {
    var cbName = '__buymoBot' + Date.now();
    var done   = false;

    function finish(answer) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { delete window[cbName]; } catch(e) {}
      cb(answer || null);
    }

    // 8秒でタイムアウト
    var timer = setTimeout(function () { finish(null); }, 8000);

    window[cbName] = function (d) {
      finish(d && d.answer ? d.answer : null);
    };

    var s = document.createElement('script');
    var histJson = JSON.stringify(history.slice(-6).map(function(m){
      return { role: m.role, content: m.content.slice(0,300) };
    }));
    s.src = GAS +
      '?action=bot'  +
      '&mode='       + encodeURIComponent(MODE) +
      '&q='          + encodeURIComponent(text.slice(0, 300)) +
      '&h='          + encodeURIComponent(histJson) +
      '&callback='   + cbName;

    // ネットワークエラー → 即フォールバック
    s.onerror = function () { finish(null); };

    // スクリプトが読み込めたのにコールバックが呼ばれない
    // ＝ GASが非JSONPを返した（未デプロイ等）→ 500ms待って即フォールバック
    s.onload = function () {
      setTimeout(function () { finish(null); }, 500);
    };

    document.body.appendChild(s);
  }

  /* ---------- Send ---------- */
  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    chips.style.display = 'none';

    var typing = addTyping();
    aiAsk(text, function (aiReply) {
      typing.remove();
      var reply = aiReply || ruleAnswer(text);
      addMsg('bot', reply);
      history.push({ role: 'assistant', content: reply });
    });
  }

  /* ---------- Chips ---------- */
  function renderChips() {
    chips.innerHTML = '';
    chips.style.display = '';
    KB[MODE].chips.forEach(function (c) {
      var b = el('button', 'cbot-chip', esc(c));
      b.addEventListener('click', function () { send(c); });
      chips.appendChild(b);
    });
  }

  /* ---------- Mode switch ---------- */
  function setMode(m) {
    MODE = m; history = [];
    root.querySelector('.cbot-title').textContent = '🐮 ' + KB[m].title;
    root.querySelectorAll('.cbot-mode button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === m);
    });
    log.innerHTML = '';
    addMsg('bot', KB[m].greet);
    renderChips();
  }

  /* ---------- Events ---------- */
  root.querySelector('.cbot-launch').addEventListener('click', function () {
    panel.hidden = false;
    this.setAttribute('aria-expanded', 'true');
    if (!log.children.length) setMode(MODE);
    input.focus();
  });
  root.querySelector('.cbot-x').addEventListener('click', function () {
    panel.hidden = true;
    root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'false');
  });
  root.querySelectorAll('.cbot-mode button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  root.querySelector('.cbot-input').addEventListener('submit', function (e) {
    e.preventDefault(); send(input.value);
  });

  setMode(MODE);
})();
