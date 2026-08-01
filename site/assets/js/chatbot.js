/* ============================================================
   BUYMO チャットボット v3 — 強化版
   - AI（Claude Haiku via GAS）+ 拡充ルールベース
   - ページ文脈認識、リッチCTA返答、マスコット、クイックアクション
   - window.BUYMO_BOT_MODE = 'user' | 'partner' で初期モード切替
   ============================================================ */
(function () {
  'use strict';

  var GAS  = 'https://script.google.com/macros/s/AKfycbw0Ao9-I-GUizO--TIU2AeJCIEGoW8Ot9DZXErD2oJk8fg_1sNj8FRNYkoAvtm6CwMc/exec';
  var MODE = (window.BUYMO_BOT_MODE === 'partner') ? 'partner' : 'user';
  var history = [];
  var STORAGE_KEY = 'buymoBotHistory';

  /* ---------- ページ文脈の検出 ---------- */
  function detectContext() {
    var p = location.pathname;
    var ctx = { type: 'top', name: '', slug: '' };
    var areaMatch = p.match(/\/area\/([a-z]+)\//);
    var genreMatch = p.match(/\/genre\/([a-z]+)\//);
    if (areaMatch) {
      ctx.type = 'area';
      ctx.slug = areaMatch[1];
      ctx.name = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : ctx.slug;
    } else if (genreMatch) {
      ctx.type = 'genre';
      ctx.slug = genreMatch[1];
      ctx.name = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : ctx.slug;
    } else if (p.indexOf('/tokushoho') >= 0 || p.indexOf('/privacy') >= 0) {
      ctx.type = 'legal';
    } else if (p.indexOf('/genre/') >= 0) {
      ctx.type = 'genrehub';
    } else if (p.indexOf('/area/') >= 0) {
      ctx.type = 'areahub';
    }
    return ctx;
  }
  var CTX = detectContext();

  /* ---------- ナレッジベース（拡充版） ---------- */
  var CTA_FORM  = { label: '無料査定を申し込む', href: '#form', primary: true };
  var CTA_TOP   = { label: 'トップページへ', href: '/', primary: false };
  var CTA_AREA  = { label: '全国エリア一覧', href: '/area/', primary: false };
  var CTA_GENRE = { label: '買取ジャンル一覧', href: '/genre/', primary: false };
  var CTA_FAQ   = { label: 'よくある質問へ', href: '#faq', primary: false };
  var CTA_SIM   = { label: '30秒 かんたん査定', href: '#sim', primary: false };

  var KB = {
    user: {
      title:  '買取AIサポート',
      greetTop: 'こんにちは！車の売却について、AIが24時間お答えします。\n下のボタンから、または直接ご質問ください。',
      greetArea: function(name){ return name + 'の買取について、AIがお答えします。エリア対応・査定・引取など何でもどうぞ。'; },
      greetGenre: function(name){ return name + 'について、AIがお答えします。相場・査定・買取の流れなどお気軽に。'; },
      chips: ['今いくらで売れる？', '事故車もOK？', '入金までの日数は？', '必要書類は？', 'しつこい営業は？', 'まとめて売却したい'],
      rules: [
        // 営業・対応
        { k: ['しつこい','勧誘','営業電話','安心','電話来ない'],
          a: 'ご安心ください。しつこい営業電話は一切ございません。査定結果はメールでご連絡し、査定後のキャンセルも無料です。',
          cta: [CTA_FORM] },

        // 税金・還付
        { k: ['還付','自動車税','重量税','税金','戻る'],
          a: '廃車（永久抹消登録）時は、**自動車税・自賠責保険料・重量税**の還付が受けられる場合があります。手続きも無料で代行いたします。' },

        // 手続き
        { k: ['名義変更','手続き','代行','面倒','移転'],
          a: '名義変更・廃車抹消などの手続きはすべて**無料で代行**します。書類の取得サポートもいたしますのでご安心ください。' },

        // 書類
        { k: ['書類','車検証','印鑑','用意','必要書類'],
          a: '**必要書類（基本）**\n・車検証\n・自賠責保険証\n・本人確認書類\n・印鑑（普通車は実印＋印鑑証明）\n揃っていなくてもご相談OK。取得サポートいたします。' },

        // 人気車種
        { k: ['ハイエース','ランクル','ジムニー','アルファード','人気','高く売れる'],
          a: 'ハイエース・ランドクルーザー・ジムニー・アルファードなどは**国内外で需要が高く**、高価買取が期待できます。過走行・年式が古くても高値がつきやすいです。',
          cta: [CTA_SIM, CTA_FORM] },

        // 旧車
        { k: ['旧車','絶版','ネオクラ','クラシック','希少','80年代','90年代'],
          a: '旧車・絶版車は**希少価値で高評価**。不動・レストアベースでも専門ルートで買取します。国内外のコレクター需要に応じて査定します。',
          cta: [CTA_FORM] },

        // 過走行
        { k: ['過走行','走行距離','10万','20万','多走行'],
          a: '走行距離が多くても買取可能です。特にハイエース・ランクルなど**海外需要の高い車種は過走行でも高値**が付きやすいです。' },

        // 車検切れ
        { k: ['車検切れ','車検','切れて'],
          a: '車検切れのままで査定・引取OK。公道を走れない場合は**レッカーで無料引取り**します。' },

        // ローン
        { k: ['ローン','残債','借金'],
          a: 'ローン残債がある車も買取可能です。残債精算の流れもサポートし、名義がローン会社の場合の手続きも代行いたします。',
          cta: [CTA_FORM] },

        // 相場・査定額
        { k: ['相場','いくら','高く','金額','査定額','価格'],
          a: '**30秒でわかる査定シミュレーション**がおすすめです。車種クラス・年式・走行距離・状態を選ぶだけで概算がわかります。正確な金額は無料査定で。',
          cta: [CTA_SIM, CTA_FORM] },

        // 費用
        { k: ['無料','費用','料金','手数料','タダ'],
          a: '**すべて無料です。**\n・査定料 0円\n・出張費 0円\n・手続き代行 0円\n・レッカー引取 0円\nお客様のご負担は一切ございません。' },

        // 事故・故障
        { k: ['事故','修復','不動','廃車','故障','水没','エンジン'],
          a: '事故車・修復歴・不動車・廃車・水没車など、他社で断られた車もぜひご相談ください。**専門ルート**で買取いたします。',
          cta: [CTA_FORM] },

        // 入金
        { k: ['入金','振込','支払','即日','いつ','スピード'],
          a: '書類・車両を確認のうえ、**3営業日以内に確実にお振込み**します。特に急ぎの場合はご相談ください。' },

        // キャンセル
        { k: ['キャンセル','断る','相談だけ','見積もりだけ'],
          a: '**査定だけ・ご相談だけでも大歓迎**です。査定後のキャンセルも無料。お気軽にどうぞ。' },

        // エリア
        { k: ['エリア','地域','出張','全国','対応地域','どこ'],
          a: '**全国47都道府県に対応**。お近くの提携業者が無料で出張査定に伺います。離島も対応可能です。',
          cta: [CTA_AREA, CTA_FORM] },

        // メール・受付
        { k: ['連絡','受付','時間','何時','24時間'],
          a: 'お問い合わせは**メール（kaitori@buymo.me）またはフォームで24時間受付**しております。ご返信は営業時間内に順次いたします。',
          cta: [CTA_FORM] },

        // 写真査定
        { k: ['写真','撮影','送る','スマホ','画像'],
          a: 'スマホで**外観（前後左右）・内装・メーター（走行距離）**の写真を撮ってお送りください。査定額をメールでご提示します。',
          cta: [CTA_FORM] },

        // まとめ売却
        { k: ['まとめ','複数','2台','法人','会社','事業所'],
          a: '**複数台のまとめ査定・法人売却**も大歓迎です。フリート・事業所の入れ替えなどもご相談ください。担当者がまとめて対応いたします。',
          cta: [CTA_FORM] },

        // LINE
        { k: ['LINE','ライン','SNS'],
          a: 'LINE公式アカウントでも査定相談を受付中です。写真の送付や気軽なご質問にもお答えします。' },

        // 引取
        { k: ['引取','レッカー','取りに来て','搬送'],
          a: '契約後は**業者がご自宅まで無料で引取り**に伺います。動かない車もレッカーで対応。日程は柔軟に調整可能です。' },

        // 個人情報
        { k: ['個人情報','安全','漏洩','プライバシー'],
          a: 'お客様の個人情報は**厳格に管理**しております。プライバシーマーク相当の運用で、目的外利用は一切いたしません。',
          cta: [{ label: 'プライバシーポリシー', href: '/privacy.html' }] },

        // 会員
        { k: ['会員','マイページ','ログイン','登録'],
          a: '会員登録（**無料**）で査定状況・買取進捗をマイページから確認できます。追加相談もかんたんです。',
          cta: [{ label: '無料で会員登録', href: '/member.html', primary: true }] },

        // 買取と下取りの違い
        { k: ['下取り','違い','比較','ディーラー'],
          a: 'ディーラー下取りより**買取の方が高値**になるケースが多いです。中間コストがない分、お客様に還元できます。まずは査定してみてください。',
          cta: [CTA_FORM] },

        // 高値のコツ
        { k: ['高く売る','コツ','タイミング','時期','ベスト'],
          a: '**高く売るコツ**：①走行10万km未満、②車検が残っている、③タイミングは3月・9月前、④洗車・車内清掃。まずは今の相場を確認しましょう。',
          cta: [CTA_SIM, CTA_FORM] },

        // よくある質問
        { k: ['質問','FAQ','よくある'],
          a: 'よくある質問ページで一括で確認できます。',
          cta: [CTA_FAQ] }
      ],
      fallback: 'お答えできる範囲を超えているかもしれません。詳しくは**無料査定フォーム**、または**kaitori@buymo.me** までお問い合わせください。',
      fallbackCTA: [CTA_FORM]
    },
    partner: {
      title: '加盟店AIサポート',
      greetTop: 'BUYMO加盟店向けAIサポートです。運営・査定・システムの疑問にお答えします。',
      chips: ['出品の流れは？', 'システムの使い方', '加盟したい', '集客は？'],
      rules: [
        { k: ['加盟','開業','費用','始め','応募'],      a: '加盟のご相談は本部まで直接お問い合わせください。費用・条件はプランにより異なります。' },
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
  function mdFormat(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /* ---------- Build widget ---------- */
  var root = el('div', 'cbot');
  // AIオペレーター(女性)の写真をパネル上部＆起動ボタン両方に使用
  var mascotSrc = '/assets/img/buymo/chatbot-avatar.png';
  // 相対パスで assets を解決（サブディレクトリからでも動くよう）
  var depth = (location.pathname.match(/\/[^\/]+/g) || []).length - 1;
  var prefix = depth > 0 ? '../'.repeat(depth) : '';
  mascotSrc = prefix + 'assets/img/buymo/chatbot-avatar.png';
  var chatIconSrc = prefix + 'assets/img/buymo/chatbot-avatar.png';

  root.innerHTML =
    '<div class="cbot-hint" id="cbotHint" hidden aria-hidden="true">' +
      '<button class="cbot-hint-x" aria-label="閉じる">×</button>' +
      '<span class="cbot-hint-text">何かご用はありますか？</span>' +
    '</div>' +
    '<button class="cbot-launch" aria-label="AIチャットを開く" aria-expanded="false">' +
      '<img class="cbot-launch-img" src="' + chatIconSrc + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';">' +
      '<span class="cbot-launch-ico" style="display:none">💬</span>' +
      '<span class="cbot-launch-badge" aria-hidden="true">AI</span>' +
      '<span class="cbot-launch-pulse" aria-hidden="true"></span>' +
    '</button>' +
    '<div class="cbot-panel" hidden role="dialog" aria-label="BUYMOチャットサポート">' +
      '<div class="cbot-head">' +
        '<img class="cbot-avatar" src="' + mascotSrc + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="cbot-head-text">' +
          '<span class="cbot-title"></span>' +
          '<span class="cbot-status"><span class="cbot-dot"></span>オンライン・AI応答</span>' +
        '</div>' +
        '<div class="cbot-mode">' +
          '<button data-mode="user">お客様</button>' +
          '<button data-mode="partner">加盟店</button>' +
        '</div>' +
        '<button class="cbot-x" aria-label="閉じる">×</button>' +
      '</div>' +
      '<div class="cbot-log" id="cbotLog" role="log" aria-live="polite"></div>' +
      '<div class="cbot-chips" id="cbotChips"></div>' +
      '<div class="cbot-quick">' +
        '<a class="cbot-quick-btn primary" href="#form">✏️ 無料査定</a>' +
        '<a class="cbot-quick-btn" href="mailto:kaitori@buymo.me">✉️ メール</a>' +
      '</div>' +
      '<form class="cbot-input" autocomplete="off">' +
        '<input id="cbotIn" placeholder="車のことなら何でもどうぞ…" aria-label="メッセージ入力" maxlength="300">' +
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
  function addMsg(role, text, cta) {
    var wrap = el('div', 'cbot-msg-wrap ' + role);
    if (role === 'bot') {
      var av = el('img', 'cbot-msg-avatar');
      av.src = mascotSrc;
      av.alt = '';
      av.onerror = function(){ this.style.display='none'; };
      wrap.appendChild(av);
    }
    var m = el('div', 'cbot-msg ' + role);
    m.innerHTML = mdFormat(text);

    if (cta && cta.length) {
      var ctaWrap = el('div', 'cbot-msg-cta');
      cta.forEach(function(c){
        var a = el('a', 'cbot-cta-btn' + (c.primary ? ' primary' : ''), esc(c.label) + ' →');
        a.href = c.href;
        ctaWrap.appendChild(a);
      });
      m.appendChild(ctaWrap);
    }
    wrap.appendChild(m);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function addTyping() {
    var wrap = el('div', 'cbot-msg-wrap bot');
    var av = el('img', 'cbot-msg-avatar');
    av.src = mascotSrc; av.alt = '';
    av.onerror = function(){ this.style.display='none'; };
    wrap.appendChild(av);
    var t = el('div', 'cbot-msg bot cbot-typing',
      '<span></span><span></span><span></span>');
    wrap.appendChild(t);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  /* ---------- Rule-based fallback（CTA付き） ---------- */
  function ruleAnswer(text) {
    var kb = KB[MODE]; var t = text.toLowerCase();
    for (var i = 0; i < kb.rules.length; i++) {
      var r = kb.rules[i];
      for (var j = 0; j < r.k.length; j++) {
        if (text.indexOf(r.k[j]) >= 0 || t.indexOf(r.k[j]) >= 0) {
          return { text: r.a, cta: r.cta || [] };
        }
      }
    }
    return { text: kb.fallback, cta: kb.fallbackCTA || [] };
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
      '&ctx='        + encodeURIComponent(CTX.type + ':' + CTX.slug) +
      '&h='          + encodeURIComponent(histJson) +
      '&callback='   + cbName;

    s.onerror = function () { finish(null); };
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
      if (aiReply) {
        // AIが答えた場合はCTAはなし（ただしフォームCTA付ける）
        var lower = aiReply.toLowerCase();
        var cta = [];
        if (lower.indexOf('査定') >= 0 || lower.indexOf('お申') >= 0 || lower.indexOf('お申し込み') >= 0) {
          cta = [CTA_FORM];
        }
        addMsg('bot', aiReply, cta);
        history.push({ role: 'assistant', content: aiReply });
      } else {
        var res = ruleAnswer(text);
        addMsg('bot', res.text, res.cta);
        history.push({ role: 'assistant', content: res.text });
      }
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

  /* ---------- Greeting based on context ---------- */
  function getGreeting(mode) {
    var kb = KB[mode];
    if (mode !== 'user') return kb.greetTop;
    if (CTX.type === 'area' && kb.greetArea) return kb.greetArea(CTX.name);
    if (CTX.type === 'genre' && kb.greetGenre) return kb.greetGenre(CTX.name);
    return kb.greetTop;
  }

  /* ---------- Mode switch ---------- */
  function setMode(m) {
    MODE = m; history = [];
    root.querySelector('.cbot-title').textContent = KB[m].title;
    root.querySelectorAll('.cbot-mode button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === m);
    });
    log.innerHTML = '';
    addMsg('bot', getGreeting(m));
    renderChips();
  }

  /* ---------- Hint bubble ("何かご用はありますか？") ---------- */
  var hint = root.querySelector('#cbotHint');
  var HINT_KEY = 'buymo_hint_dismissed';
  function showHint() {
    if (!hint) return;
    if (!panel.hidden) return; // パネル開いていたら出さない
    try { if (sessionStorage.getItem(HINT_KEY) === '1') return; } catch(e){}
    hint.hidden = false;
    hint.setAttribute('aria-hidden', 'false');
    // 12秒後に自動で閉じる
    setTimeout(hideHint, 12000);
  }
  function hideHint() {
    if (!hint) return;
    hint.hidden = true;
    hint.setAttribute('aria-hidden', 'true');
    try { sessionStorage.setItem(HINT_KEY, '1'); } catch(e){}
  }
  if (hint) {
    hint.querySelector('.cbot-hint-x').addEventListener('click', function(e){
      e.stopPropagation(); hideHint();
    });
    hint.querySelector('.cbot-hint-text').addEventListener('click', function(){
      hideHint();
      root.querySelector('.cbot-launch').click();
    });
    // 6秒後にヒント表示
    setTimeout(showHint, 6000);
  }

  /* ---------- Events ---------- */
  root.querySelector('.cbot-launch').addEventListener('click', function () {
    panel.hidden = false;
    this.setAttribute('aria-expanded', 'true');
    if (!log.children.length) setMode(MODE);
    setTimeout(function(){ input.focus(); }, 100);
    hideHint();
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

  // Escキーで閉じる
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- 外部トリガー：href="#chat" のリンクでチャット起動 ---------- */
  function openChat() {
    panel.hidden = false;
    root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'true');
    if (!log.children.length) setMode(MODE);
    setTimeout(function(){ input.focus(); }, 100);
  }
  window.BUYMO_OPEN_CHAT = openChat;
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href === '#chat' || href.endsWith('#chat')) {
      e.preventDefault();
      openChat();
    }
  });

  setMode(MODE);
})();
