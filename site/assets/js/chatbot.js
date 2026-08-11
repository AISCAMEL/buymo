/* ============================================================
   BUYMO チャットボット v3 — 強化版
   - AI（Claude Haiku via GAS）+ 拡充ルールベース
   - ページ文脈認識、リッチCTA返答、マスコット、クイックアクション
   - window.BUYMO_BOT_MODE = 'user' | 'partner' で初期モード切替
   ============================================================ */
(function () {
  'use strict';

  var GAS  = 'https://script.google.com/macros/s/AKfycbw1ccE2LLDDXBO0NQFunlFSM5fEd3tXlH62upLexy-6NQtjPvq4CYRrGJ8L5rqzng2AwA/exec';
  var MODE = (window.BUYMO_BOT_MODE === 'partner') ? 'partner' : 'user';
  var history = [];
  var STORAGE_KEY = 'buymoBotHistory';

  // 事前ゲート（連絡先収集）用
  var CONTACT_KEY = 'buymoBotContact';   // { name, email, phone }
  var SESSION_KEY = 'buymoBotSession';   // sessionId (per browser session)
  var contactInfo = null;
  var sessionId   = '';
  try {
    // 連絡先はセッション単位（新しいブラウザセッションでは毎回ゲートを表示する）
    // ※ 以前 localStorage に永続保存していたため、残っていれば破棄する
    contactInfo = JSON.parse(sessionStorage.getItem(CONTACT_KEY) || 'null');
    sessionId   = sessionStorage.getItem(SESSION_KEY) || '';
    try { localStorage.removeItem(CONTACT_KEY); } catch (e2) {}
  } catch (e) {}

  function newSessionId() {
    return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function fireAndForget(payload) {
    try {
      fetch(GAS, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }
  function sendChatLog(status) {
    if (!sessionId || !history.length) return;
    fireAndForget({
      type: 'buymo_chat_log',
      sessionId: sessionId,
      status: status || '進行中',
      messages: history.slice(-40)
    });
  }

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
      title:  'あゆか｜買取サポート',
      greetTop: 'こんにちは！BUYMO買取サポートの「あゆか」です😊\n車の売却について24時間お答えします。下のボタンから、または直接ご質問ください。',
      greetArea: function(name){ return 'BUYMO買取サポートの「あゆか」です😊\n' + name + 'の買取について、エリア対応・査定・引取など何でもどうぞ。'; },
      greetGenre: function(name){ return 'BUYMO買取サポートの「あゆか」です😊\n' + name + 'について、相場・査定・買取の流れなどお気軽に。'; },
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
          a: 'お客様の個人情報は**厳格に管理**しております。プライバシーポリシーに基づき適切に取り扱い、目的外利用は一切いたしません。',
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

        // 減額・後出し請求はないか（信頼系で重要）
        { k: ['減額','後から','後出し','追加請求','値下げ','ぼったく','だまさ','騙さ','安く買い叩'],
          a: 'ご契約後の**不当な減額・後出し請求は一切いたしません**。事前にお伺いした状態と大きく異なる隠れた事故歴などがない限り、ご提示額のままお支払いします。金額は書面でもご確認いただけます。',
          cta: [CTA_FORM] },

        // 出張査定の流れ・所要時間
        { k: ['出張査定','来てもらう','自宅','当日','所要','時間どれくらい','どのくらいかかる','立ち会い','立会'],
          a: '**出張査定は最短即日〜数日で調整**。当日は車両確認で**30分〜1時間ほど**です。ご自宅・職場・駐車場どこでもOK。査定額はその場、または後日メールでご提示します。',
          cta: [CTA_FORM] },

        // 査定額の有効期限
        { k: ['有効期限','いつまで','査定額の期限','キープ','取り置き'],
          a: '査定額は市場相場の変動があるため、目安として**提示日から約7日間**が有効です。お早めのご検討がおすすめですが、期限が過ぎても無料で再査定いたします。',
          cta: [CTA_FORM] },

        // 軽自動車・商用車・トラック
        { k: ['軽自動車','軽','商用','トラック','バン','ダンプ','重機','建機'],
          a: '軽自動車・商用車・トラック・重機まで幅広く買取OK。**軽は名義変更が普通車より簡単**（実印・印鑑証明が不要な場合が多い）でスピーディーです。まずはお気軽にご相談ください。',
          cta: [CTA_FORM] },

        // 輸入車・外車・EV/ハイブリッド
        { k: ['輸入車','外車','ベンツ','BMW','アウディ','EV','電気自動車','ハイブリッド','テスラ'],
          a: '輸入車・外車・EV・ハイブリッドも査定可能です。**専門ルート・海外需要**を踏まえて評価します。バッテリー状態や整備履歴があれば査定がスムーズです。',
          cta: [CTA_SIM, CTA_FORM] },

        // カスタム・改造車
        { k: ['改造','カスタム','マフラー','エアロ','社外','パーツ','ホイール'],
          a: 'カスタム・改造車も歓迎です。**社外パーツはプラス評価**になることも。純正パーツが残っていればあわせてお知らせください。車検非対応の改造でも買取可能です。',
          cta: [CTA_FORM] },

        // 名義が本人以外（家族・故人・他人）
        { k: ['名義','家族名義','親名義','他人名義','故人','相続','亡くな','本人以外'],
          a: 'ご本人以外の名義（ご家族・相続車など）でも売却可能です。**委任状や相続関係の書類**が必要になりますが、取得方法もサポートします。まずはご状況をお知らせください。',
          cta: [CTA_FORM] },

        // 契約後のキャンセル・クーリングオフ
        { k: ['契約後','クーリングオフ','解約','撤回','やっぱりやめ'],
          a: '査定後・ご契約前のキャンセルは**いつでも無料**です。ご契約後は引取や名義手続きが進むためキャンセルできない場合がありますが、事情があればまずご相談ください。' },

        // 買取か廃車か迷う
        { k: ['廃車にするか','廃車と買取','値段つかない','ゼロ円','価値ない'],
          a: '「もう価値がない」と思われる車でも、**部品取り・海外輸出ルート**で値段がつくことが多いです。廃車費用を払う前に、まず無料査定でご確認ください。',
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
    var s = esc(text);
    // 表の区切り行（|---|---|）は除去
    s = s.replace(/^\s*\|?[\s:\-|]+\|[\s:\-|]*$/gm, '');
    // 見出し（#, ##, ###…）→ 太字行
    s = s.replace(/^\s{0,3}#{1,6}\s*(.+?)\s*#*$/gm, '<strong>$1</strong>');
    // 箇条書き（- / * / ・）→ ・
    s = s.replace(/^\s*[-*]\s+/gm, '・');
    // マークダウンリンク [表示](URL) → 一時退避（後段の二重リンク化を防ぐ）
    var links = [];
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, t, u) {
      links.push('<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>');
      return '\u0000L' + (links.length - 1) + '\u0000';
    });
    // **bold**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 素のURL → リンク
    s = s.replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // メールアドレス → mailto
    s = s.replace(/([\w.-]+@[\w.-]+\.[\w]{2,})/g, '<a href="mailto:$1">$1</a>');
    // #form / #chat / #faq / #features / #company / #genres / #sim → 内部リンク
    s = s.replace(/#(form|chat|faq|features|company|genres|sim|top)\b/g,
      '<a href="#$1" data-cbot-anchor="$1">#$1</a>');
    // 退避したリンクを復元
    s = s.replace(/\u0000L(\d+)\u0000/g, function (m, i) { return links[+i]; });
    // 改行
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  /* ---------- Build widget ---------- */
  var root = el('div', 'cbot');
  // AIオペレーター(女性)の写真をパネル上部＆起動ボタン両方に使用
  // ルート配信サイトのため絶対パスで統一（ディレクトリURL /area/tokyo/ でも確実に解決）
  var mascotSrc   = '/assets/img/buymo/chatbot-avatar.png';
  var chatIconSrc = '/assets/img/buymo/chatbot-avatar.png';

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
        '<button class="cbot-x" aria-label="閉じる">×</button>' +
      '</div>' +

      /* ---- 事前ゲート: 連絡先入力 (初回のみ表示) ---- */
      '<form class="cbot-gate" id="cbotGate" hidden novalidate>' +
        '<div class="cbot-gate-intro">' +
          'はじめに、担当が対応できるようお名前とご連絡先をお伺いします。<br>' +
          '<small>チャット履歴は担当者が確認できるよう保管されます。</small>' +
        '</div>' +
        '<div class="cbot-gate-field">' +
          '<label for="cbotGName">お名前 <span class="cbot-req">必須</span></label>' +
          '<input id="cbotGName" type="text" autocomplete="name" placeholder="例：山田 太郎" required maxlength="40">' +
        '</div>' +
        '<div class="cbot-gate-field">' +
          '<label for="cbotGMail">メールアドレス <span class="cbot-req">必須</span></label>' +
          '<input id="cbotGMail" type="email" autocomplete="email" inputmode="email" placeholder="example@buymo.me" required maxlength="80">' +
        '</div>' +
        '<div class="cbot-gate-field">' +
          '<label for="cbotGTel">電話番号 <span class="cbot-opt">任意</span></label>' +
          '<input id="cbotGTel" type="tel" autocomplete="tel" inputmode="tel" placeholder="090-0000-0000" maxlength="20">' +
        '</div>' +
        '<p class="cbot-gate-err" id="cbotGErr"></p>' +
        '<button type="submit" class="cbot-gate-btn">チャットを開始する</button>' +
        '<p class="cbot-gate-note">同意して送信することで<a href="/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>に同意したものとみなします。</p>' +
      '</form>' +

      '<div class="cbot-log" id="cbotLog" role="log" aria-live="polite"></div>' +
      '<div class="cbot-chips" id="cbotChips"></div>' +
      '<div class="cbot-handoff-row" id="cbotHandoffRow" hidden>' +
        '<button type="button" class="cbot-handoff-cta" id="cbotHandoff">👤 担当者（人）に相談する</button>' +
      '</div>' +
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
  // 「担当者に相談」ボタンは “会話が進んでも解決しない時だけ” 表示する
  var userMsgCount = 0;   // ユーザー発言数
  var fallbackCount = 0;  // AIが答えられなかった回数
  var MSG_THRESHOLD = 5;      // これ以上やりとりが続いたら提示
  var FALLBACK_THRESHOLD = 2; // AIがこの回数答えられなかったら提示
  function revealHandoff(reason) {
    var row = document.getElementById('cbotHandoffRow');
    if (!row || !row.hidden) return;
    row.hidden = false;
    if (window.BuymoGA) window.BuymoGA.track('handoff_offered', { reason: reason || '' });
  }
  // お客様が明示的に「人に繋いでほしい」と言った時のキーワード
  var HUMAN_KW = ['担当者', '担当の方', '人と話', '人に繋', '人につな', 'オペレータ', 'スタッフと', '電話して', '電話で', '折り返し', '直接話', 'クレーム'];

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    userMsgCount++;
    input.value = '';
    chips.style.display = 'none';

    // ① お客様が明示的に「人に繋いでほしい」と言った時だけ即表示
    var hitHuman = HUMAN_KW.some(function (k) { return text.indexOf(k) >= 0; });
    if (hitHuman) revealHandoff('keyword');

    var typing = addTyping();
    aiAsk(text, function (aiReply) {
      typing.remove();
      if (aiReply) {
        var lower = aiReply.toLowerCase();
        var cta = [];
        if (lower.indexOf('査定') >= 0 || lower.indexOf('お申') >= 0 || lower.indexOf('お申し込み') >= 0) {
          cta = [CTA_FORM];
        }
        addMsg('bot', aiReply, cta);
        history.push({ role: 'assistant', content: aiReply });
      } else {
        // AIが答えられずフォールバック（未解決のサイン）
        fallbackCount++;
        var res = ruleAnswer(text);
        addMsg('bot', res.text, res.cta);
        history.push({ role: 'assistant', content: res.text });
      }
      // ② AIが繰り返し答えられない、または ③ 会話が長引いて解決しない場合のみ提示
      if (fallbackCount >= FALLBACK_THRESHOLD || userMsgCount >= MSG_THRESHOLD) {
        revealHandoff(fallbackCount >= FALLBACK_THRESHOLD ? 'repeat_fallback' : 'long_convo');
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
    // ページを一定量スクロールした後にヒント表示（全ページ共通）
    // 条件: ページの25%以上 または 700px 以上スクロール
    var hintShown = false;
    function maybeShowHint() {
      if (hintShown) return;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var docH = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight
      ) - window.innerHeight;
      var ratio = docH > 0 ? (y / docH) : 0;
      if (y >= 700 || ratio >= 0.25) {
        hintShown = true;
        window.removeEventListener('scroll', maybeShowHint);
        showHint();
      }
    }
    window.addEventListener('scroll', maybeShowHint, { passive: true });
    // スクロールが起きない短いページ用フォールバック（20秒後）
    setTimeout(function () {
      if (!hintShown) { hintShown = true; showHint(); }
    }, 20000);
  }

  /* ---------- 事前ゲート (連絡先入力) 制御 ---------- */
  var gateForm  = document.getElementById('cbotGate');
  var gateName  = document.getElementById('cbotGName');
  var gateMail  = document.getElementById('cbotGMail');
  var gateTel   = document.getElementById('cbotGTel');
  var gateErr   = document.getElementById('cbotGErr');
  var chatInput = root.querySelector('.cbot-input');
  var chatQuick = root.querySelector('.cbot-quick');

  function showGate() {
    if (gateForm) gateForm.hidden = false;
    log.style.display   = 'none';
    chips.style.display = 'none';
    if (chatInput) chatInput.style.display = 'none';
    if (chatQuick) chatQuick.style.display = 'none';
    setTimeout(function () { if (gateName) gateName.focus(); }, 100);
  }
  function hideGate() {
    if (gateForm) gateForm.hidden = true;
    log.style.display   = '';
    chips.style.display = '';
    if (chatInput) chatInput.style.display = '';
    if (chatQuick) chatQuick.style.display = '';
  }

  if (gateForm) {
    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      gateErr.textContent = '';
      var name  = (gateName.value || '').trim();
      var email = (gateMail.value || '').trim();
      var phone = (gateTel.value  || '').trim();
      if (!name)  { gateErr.textContent = 'お名前を入力してください。'; gateName.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        gateErr.textContent = 'メールアドレスを正しく入力してください。'; gateMail.focus(); return;
      }
      contactInfo = { name: name, email: email, phone: phone };
      sessionId   = newSessionId();
      try {
        // セッション単位で保持（永続化しない＝次回セッションでは再度ゲート表示）
        sessionStorage.setItem(CONTACT_KEY, JSON.stringify(contactInfo));
        sessionStorage.setItem(SESSION_KEY, sessionId);
      } catch (er) {}
      // GAS へ即通知 (fire-and-forget)
      fireAndForget({
        type: 'buymo_chat_start',
        sessionId: sessionId,
        name: name, email: email, phone: phone,
        page: location.href.slice(0, 200),
        ua:   (navigator.userAgent || '').slice(0, 200)
      });
      hideGate();
      if (!log.children.length) setMode(MODE);
      // 最初の一言を「〇〇様、ようこそ」に
      var greetMsg = name + ' 様、お待たせしました！\nお車のご売却について、どんな質問でもお気軽にどうぞ。';
      addMsg('bot', greetMsg);
      history.push({ role: 'assistant', content: greetMsg });
      setTimeout(function () { if (input) input.focus(); }, 100);
      resetIdleTimer();
    });
  }

  /* ---------- パネル開閉ヘルパー & CTA スクロール ---------- */
  function openPanel() {
    panel.hidden = false;
    root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'true');
    if (!contactInfo || !contactInfo.email) {
      // ゲート未通過 → 連絡先入力を表示
      showGate();
    } else {
      // ゲート通過済 → 通常のチャット
      hideGate();
      if (!sessionId) {
        sessionId = newSessionId();
        try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch (e) {}
      }
      if (!log.children.length) setMode(MODE);
      setTimeout(function(){ input.focus(); }, 100);
    }
    hideHint();
    resetIdleTimer();
  }
  function closePanel() {
    // 履歴を保存 (fire-and-forget)
    sendChatLog('進行中');
    panel.hidden = true;
    root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'false');
    clearIdleTimer();
  }
  // パネル内の #アンカーやCTAを押したら、パネル閉じて対象要素へスクロール
  panel.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    // ページ内アンカー (#form / #faq など) → 閉じてスクロール
    if (href.charAt(0) === '#' && href.length > 1 && href !== '#chat') {
      e.preventDefault();
      closePanel();
      var target = document.querySelector(href);
      if (target) {
        setTimeout(function () {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }
  });

  /* ---------- アイドルタイマー (60秒無操作) ---------- */
  var idleTimer, idlePrompted = false;
  function clearIdleTimer() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }
  function resetIdleTimer() {
    clearIdleTimer();
    if (panel.hidden) return;
    idlePrompted = false;
    idleTimer = setTimeout(showIdlePrompt, 60000);
  }
  function showIdlePrompt() {
    if (panel.hidden || idlePrompted) return;
    idlePrompted = true;
    var wrap = el('div', 'cbot-msg-wrap bot cbot-idle-wrap');
    var av = el('img', 'cbot-msg-avatar');
    av.src = mascotSrc; av.alt = ''; av.onerror = function(){ this.style.display='none'; };
    wrap.appendChild(av);
    var m = el('div', 'cbot-msg bot');
    m.innerHTML = 'その他ご質問はありますか？' +
      '<div class="cbot-idle-actions">' +
        '<button type="button" class="cbot-idle-btn primary" data-idle="continue">続ける</button>' +
        '<button type="button" class="cbot-idle-btn" data-idle="close">終了する</button>' +
      '</div>';
    wrap.appendChild(m);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    m.querySelector('[data-idle="continue"]').addEventListener('click', function () {
      wrap.remove();
      resetIdleTimer();
      input.focus();
    });
    m.querySelector('[data-idle="close"]').addEventListener('click', function () {
      addMsg('bot', 'ご利用ありがとうございました！\nまた気になることがあればいつでもお声がけください。');
      sendChatLog('終了');
      setTimeout(closePanel, 1200);
    });
  }

  // ページ離脱時: 履歴を確定送信
  window.addEventListener('beforeunload', function () {
    if (sessionId && history.length) {
      try {
        // sendBeacon が使えれば non-blocking で確実に送信
        var payload = JSON.stringify({
          type: 'buymo_chat_log', sessionId: sessionId,
          status: '中断(離脱)', messages: history.slice(-40)
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(GAS, new Blob([payload], { type: 'text/plain;charset=utf-8' }));
        } else {
          fireAndForget(JSON.parse(payload));
        }
      } catch (e) {}
    }
  });

  /* ---------- Events ---------- */
  root.querySelector('.cbot-launch').addEventListener('click', openPanel);
  root.querySelector('.cbot-x').addEventListener('click', closePanel);
  root.querySelectorAll('.cbot-mode button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  root.querySelector('.cbot-input').addEventListener('submit', function (e) {
    e.preventDefault(); send(input.value); resetIdleTimer();
  });
  input.addEventListener('input', resetIdleTimer);

  /* ---------- 「担当者に繋ぐ」ハンドオフ ---------- */
  // 営業時間判定（JST 平日 10:00〜19:00）
  function isBusinessHoursJST() {
    var now = new Date();
    // UTC→JST(+9)に補正して曜日/時を求める
    var jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    var day = jst.getDay();   // 0=日, 6=土
    var hour = jst.getHours();
    return (day >= 1 && day <= 5 && hour >= 10 && hour < 19);
  }

  var handoffBtn = document.getElementById('cbotHandoff');
  var handoffSent = false;
  if (handoffBtn) {
    handoffBtn.addEventListener('click', function () {
      if (handoffSent) {
        addMsg('bot', 'すでに担当者へ通知済みです。折り返しをお待ちください。');
        return;
      }
      if (!contactInfo || !contactInfo.email) {
        addMsg('bot', 'まずは連絡先（お名前・メール）のご入力をお願いします。');
        showGate();
        return;
      }
      var biz = isBusinessHoursJST();
      // 確認モーダル（営業時間内/外で文言を変える）
      var confirmWrap = el('div', 'cbot-msg-wrap bot cbot-handoff-confirm');
      var av = el('img', 'cbot-msg-avatar');
      av.src = mascotSrc; av.alt = ''; av.onerror = function () { this.style.display = 'none'; };
      confirmWrap.appendChild(av);
      var m = el('div', 'cbot-msg bot');
      m.innerHTML = biz
        ? ('いま担当者におつなぎできます。接続してもよろしいですか？<br>' +
           '<small>これまでの会話内容と連絡先を担当者へ共有します。営業時間内（平日10:00〜19:00）は、担当者がこのチャットで直接ご返信します。</small>' +
           '<div class="cbot-idle-actions">' +
             '<button type="button" class="cbot-idle-btn primary" data-hd="yes">担当者につなぐ</button>' +
             '<button type="button" class="cbot-idle-btn" data-hd="no">キャンセル</button>' +
           '</div>')
        : ('現在は営業時間外です（対応：平日10:00〜19:00）。<br>' +
           '<small>いまはAIが引き続きお答えします。担当者への引き継ぎをご希望の場合は、内容を記録し翌営業日にご連絡します。</small>' +
           '<div class="cbot-idle-actions">' +
             '<button type="button" class="cbot-idle-btn primary" data-hd="yes">翌営業日の連絡を希望</button>' +
             '<button type="button" class="cbot-idle-btn" data-hd="no">AIに続けて質問する</button>' +
           '</div>');
      confirmWrap.appendChild(m);
      log.appendChild(confirmWrap);
      log.scrollTop = log.scrollHeight;
      m.querySelector('[data-hd="no"]').addEventListener('click', function () {
        confirmWrap.remove();
        if (!biz) addMsg('bot', '承知しました。引き続きご質問をどうぞ！');
      });
      m.querySelector('[data-hd="yes"]').addEventListener('click', function () {
        confirmWrap.remove();
        handoffSent = true;
        handoffBtn.disabled = true;
        handoffBtn.textContent = biz ? '✅ 担当者に接続中' : '✅ 受付しました';
        // GAS へ送信（GAS側でも営業時間判定して通知を出し分け）
        fireAndForget({
          type: 'buymo_chat_handoff',
          sessionId: sessionId || '',
          name:  contactInfo.name  || '',
          email: contactInfo.email || '',
          phone: contactInfo.phone || '',
          pageUrl: location.href,
          pageTitle: document.title || '',
          businessHours: biz,
          messages: history.slice(-20)
        });
        if (biz) {
          addMsg('bot', '担当者におつなぎしています。少々お待ちください。\n\nこのチャット画面のまま、担当者からのご返信をお待ちいただけます。');
          startHandoffPolling();  // 担当者の返信をポーリング取得
        } else {
          addMsg('bot', '受け付けました。翌営業日（平日10:00〜）に担当者よりご連絡いたします。\n\nそれまでの間も、AIがお答えできますのでお気軽にどうぞ。');
        }
        if (window.BuymoGA) window.BuymoGA.track('chat_handoff', { session: sessionId, biz: biz });
      });
    });
  }

  // 担当者(Slack)からの返信を取得して画面に表示するポーリング（Phase 6）
  var handoffPollTimer = null, lastReplyTs = 0;
  function startHandoffPolling() {
    if (handoffPollTimer) return;
    var POLL_MS = 5000;
    handoffPollTimer = setInterval(function () {
      if (!sessionId || panel.hidden) return;
      var cb = '__hreply_' + Date.now();
      window[cb] = function (res) {
        try { delete window[cb]; } catch (e) {}
        if (res && res.replies && res.replies.length) {
          res.replies.forEach(function (r) {
            if (r.ts && r.ts > lastReplyTs) {
              lastReplyTs = r.ts;
              addMsg('bot', '👤 ' + (r.by || '担当者') + '：\n' + r.text);
            }
          });
        }
      };
      var s = document.createElement('script');
      s.src = GAS + '?action=chatreplies&session=' + encodeURIComponent(sessionId) +
              '&since=' + lastReplyTs + '&callback=' + cb;
      s.onerror = function () { try { delete window[cb]; } catch (e) {} };
      document.body.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 8000);
    }, POLL_MS);
  }

  // Escキーで閉じる
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      root.querySelector('.cbot-launch').setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- 外部トリガー：href="#chat" のリンクでチャット起動 ---------- */
  window.BUYMO_OPEN_CHAT = openPanel;
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href === '#chat' || href.endsWith('#chat')) {
      e.preventDefault();
      openPanel();
    }
  });

  setMode(MODE);
})();
