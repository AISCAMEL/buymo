/* 書類発行・ダウンロード管理（本部） */
(function () {
  'use strict';
  HQ.nav('documents');

  /* ---- 共通ヘルパー ---- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nowStr() {
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '年' + p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日';
  }
  function nowSlash() {
    var d = new Date(); function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
  }
  function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('en-US'); }

  /* ---- 入力フィールド読み取り ---- */
  function getFields() {
    return {
      caseId:  (document.getElementById('docCaseId') || {}).value || '',
      name:    (document.getElementById('docName') || {}).value || '',
      address: (document.getElementById('docAddress') || {}).value || '',
      vin:     (document.getElementById('docVin') || {}).value || '',
      plate:   (document.getElementById('docPlate') || {}).value || ''
    };
  }

  /* ---- 印刷ウィンドウ共通 ---- */
  var A4_STYLE = [
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'body{font-family:"Noto Sans JP",sans-serif;font-size:11pt;color:#111;padding:20mm 18mm;}',
    'h1{font-size:18pt;font-weight:900;text-align:center;margin-bottom:6mm;}',
    'h2{font-size:13pt;font-weight:700;margin-bottom:4mm;border-bottom:1px solid #aaa;padding-bottom:2mm;}',
    '.sub{text-align:center;color:#555;font-size:10pt;margin-bottom:8mm;}',
    'table{width:100%;border-collapse:collapse;margin-bottom:6mm;}',
    'td,th{border:1px solid #999;padding:5px 8px;font-size:10pt;vertical-align:top;}',
    '.label{background:#f4f6fa;font-weight:700;width:38%;}',
    '.sign-row{display:flex;gap:16mm;margin-top:10mm;}',
    '.sign-box{flex:1;border:1px solid #999;padding:4mm 6mm;min-height:28mm;}',
    '.sign-box p{font-size:9pt;color:#555;margin-bottom:2mm;}',
    '.note{font-size:9pt;color:#555;margin-top:4mm;}',
    '.seal{display:inline-block;border:1px solid #999;width:22mm;height:22mm;text-align:center;line-height:22mm;font-size:10pt;color:#aaa;margin-left:4mm;}',
    'footer{position:fixed;bottom:8mm;left:0;right:0;text-align:center;font-size:9pt;color:#aaa;}',
    '@media print{.no-print{display:none;} body{padding:0;} footer{position:fixed;}}'
  ].join('');
  function printWin(title, body) {
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + title + '</title><style>' + A4_STYLE + '</style></head><body>' +
      body +
      '<footer>BUYMO ／ 合同会社アイズ</footer>' +
      '<p class="no-print" style="text-align:center;margin-top:12mm;"><button onclick="window.print()" style="padding:8px 28px;font-size:13px;cursor:pointer;border:none;background:#0e1b33;color:#fff;border-radius:8px;">印刷する</button>&nbsp;<button onclick="window.close()" style="padding:8px 20px;font-size:13px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:8px;">閉じる</button></p>' +
      '</body></html>';
    var w = window.open('', '_blank', 'width=760,height=700');
    w.document.write(html); w.document.close();
  }

  /* ======================================================
     書類テンプレート
  ====================================================== */

  /* ① 売買契約書 */
  function docContract(f) {
    return '<h1>自動車売買契約書（買取）</h1>' +
      '<p class="sub">本契約書は甲（売主）と乙（BUYMO加盟店）との間で締結する車両売買に関するものです。</p>' +
      '<h2>1. 契約当事者</h2>' +
      '<table><tr><td class="label">甲（売主）</td><td>' + esc(f.name) + '<br>住所：' + esc(f.address) + '</td></tr>' +
      '<tr><td class="label">乙（買主）</td><td>BUYMO加盟店（担当者より署名欄に記入）</td></tr></table>' +
      '<h2>2. 対象車両</h2>' +
      '<table><tr><td class="label">車台番号</td><td>' + esc(f.vin) + '</td></tr>' +
      '<tr><td class="label">登録番号</td><td>' + esc(f.plate) + '</td></tr>' +
      '<tr><td class="label">買取価格</td><td style="font-weight:700;">金　　　　　　　　　　円（税込）</td></tr></table>' +
      '<h2>3. 特約条項</h2>' +
      '<table><tr><td style="font-size:10pt;line-height:1.8;">' +
        '① 甲は対象車両に関するすべての権利を乙に譲渡することに同意します。<br>' +
        '② 甲は本車両に抵当権・リース残債・所有権留保等の担保がないことを保証します（ある場合は別途協議）。<br>' +
        '③ 車検証・自賠責保険証書・リサイクル券等の書類は引渡し時に提出します。<br>' +
        '④ 本契約締結後のキャンセルは原則として認められません。<br>' +
        '⑤ 引渡し後に生じた故障・事故等の責任は乙が負います。' +
      '</td></tr></table>' +
      '<p class="note">契約日：' + nowStr() + '　　案件ID：' + esc(f.caseId) + '</p>' +
      '<div class="sign-row">' +
        '<div class="sign-box"><p>甲（売主）署名・捺印</p><br><br>署名：<br><br>印<span class="seal">印</span></div>' +
        '<div class="sign-box"><p>乙（買主）署名・捺印</p><br><br>BUYMO加盟店名：<br><br>担当者署名：<br><br>印<span class="seal">印</span></div>' +
      '</div>';
  }

  /* ② 委任状（移転登録用） */
  function docPoaTransfer(f) {
    return '<h1>委 任 状</h1>' +
      '<p class="sub">（自動車移転登録手続用）</p>' +
      '<p style="margin-bottom:6mm;">私は、下記の者を代理人と定め、下記自動車の移転登録手続きに関する一切の権限を委任します。</p>' +
      '<h2>委任する事項</h2>' +
      '<p style="margin-bottom:4mm;">自動車の移転登録（名義変更）に関する申請書類の作成・提出・受領に関する一切の行為</p>' +
      '<h2>対象車両</h2>' +
      '<table><tr><td class="label">登録番号（ナンバー）</td><td>' + esc(f.plate) + '</td></tr>' +
      '<tr><td class="label">車台番号</td><td>' + esc(f.vin) + '</td></tr></table>' +
      '<h2>委任者（旧所有者）</h2>' +
      '<table><tr><td class="label">氏名</td><td>' + esc(f.name) + '&nbsp;&nbsp;&nbsp;&nbsp;<span class="seal">印</span></td></tr>' +
      '<tr><td class="label">住所</td><td>' + esc(f.address) + '</td></tr>' +
      '<tr><td class="label">委任日</td><td>' + nowStr() + '</td></tr></table>' +
      '<h2>受任者（代理人）</h2>' +
      '<table><tr><td class="label">氏名・社名</td><td>BUYMO加盟店　担当：</td></tr>' +
      '<tr><td class="label">住所</td><td></td></tr></table>' +
      '<p class="note">※ この委任状は移転登録の申請手続のみに使用します。案件ID：' + esc(f.caseId) + '</p>';
  }

  /* ② 委任状（抹消登録用） */
  function docPoaCancel(f) {
    return '<h1>委 任 状</h1>' +
      '<p class="sub">（自動車抹消登録手続用）</p>' +
      '<p style="margin-bottom:6mm;">私は、下記の者を代理人と定め、下記自動車の抹消登録（一時・永久）手続きに関する一切の権限を委任します。</p>' +
      '<h2>委任する事項</h2>' +
      '<p style="margin-bottom:4mm;">自動車の抹消登録（一時抹消・永久抹消）に関する申請書類の作成・提出・受領に関する一切の行為</p>' +
      '<h2>対象車両</h2>' +
      '<table><tr><td class="label">登録番号（ナンバー）</td><td>' + esc(f.plate) + '</td></tr>' +
      '<tr><td class="label">車台番号</td><td>' + esc(f.vin) + '</td></tr></table>' +
      '<h2>委任者（所有者）</h2>' +
      '<table><tr><td class="label">氏名</td><td>' + esc(f.name) + '&nbsp;&nbsp;&nbsp;&nbsp;<span class="seal">印</span></td></tr>' +
      '<tr><td class="label">住所</td><td>' + esc(f.address) + '</td></tr>' +
      '<tr><td class="label">委任日</td><td>' + nowStr() + '</td></tr></table>' +
      '<h2>受任者（代理人）</h2>' +
      '<table><tr><td class="label">氏名・社名</td><td>BUYMO加盟店　担当：</td></tr>' +
      '<tr><td class="label">住所</td><td></td></tr></table>' +
      '<p class="note">※ この委任状は抹消登録の申請手続のみに使用します。案件ID：' + esc(f.caseId) + '</p>';
  }

  /* ③ 譲渡証明書 */
  function docTransferCert(f) {
    return '<h1>譲 渡 証 明 書</h1>' +
      '<p class="sub">（自動車の所有権を移転することを証明します）</p>' +
      '<table style="margin-bottom:8mm;">' +
      '<tr><td class="label">登録番号</td><td>' + esc(f.plate) + '</td></tr>' +
      '<tr><td class="label">車台番号</td><td>' + esc(f.vin) + '</td></tr>' +
      '</table>' +
      '<h2>譲渡人（売主）</h2>' +
      '<table><tr><td class="label">氏名</td><td>' + esc(f.name) + '&nbsp;&nbsp;&nbsp;&nbsp;<span class="seal">印</span></td></tr>' +
      '<tr><td class="label">住所</td><td>' + esc(f.address) + '</td></tr></table>' +
      '<h2>譲受人（買主）</h2>' +
      '<table><tr><td class="label">氏名・社名</td><td>BUYMO加盟店　担当：</td></tr>' +
      '<tr><td class="label">住所</td><td></td></tr></table>' +
      '<p style="margin:6mm 0;font-size:10pt;">上記の通り、対象車両の所有権を譲受人へ譲渡したことに相違ありません。</p>' +
      '<p class="note" style="text-align:right;">証明日：' + nowStr() + '　　案件ID：' + esc(f.caseId) + '</p>';
  }

  /* ④ 所有権解除依頼書 */
  function docOwnershipRelease(f) {
    return '<h1>所有権解除依頼書</h1>' +
      '<p style="margin-bottom:6mm;">下記の自動車に設定された所有権（ローン残債・リース等による担保）の解除をお願い申し上げます。</p>' +
      '<h2>対象車両</h2>' +
      '<table><tr><td class="label">登録番号</td><td>' + esc(f.plate) + '</td></tr>' +
      '<tr><td class="label">車台番号</td><td>' + esc(f.vin) + '</td></tr>' +
      '<tr><td class="label">使用者氏名</td><td>' + esc(f.name) + '</td></tr>' +
      '<tr><td class="label">使用者住所</td><td>' + esc(f.address) + '</td></tr></table>' +
      '<h2>解除依頼内容</h2>' +
      '<table><tr><td class="label">依頼内容</td><td>所有権留保の解除（移転登録・廃車手続のため）</td></tr>' +
      '<tr><td class="label">依頼日</td><td>' + nowStr() + '</td></tr></table>' +
      '<h2>依頼者</h2>' +
      '<table><tr><td class="label">氏名</td><td>' + esc(f.name) + '&nbsp;&nbsp;&nbsp;&nbsp;<span class="seal">印</span></td></tr>' +
      '<tr><td class="label">住所</td><td>' + esc(f.address) + '</td></tr>' +
      '<tr><td class="label">連絡先</td><td></td></tr></table>' +
      '<p class="note">※ 本書類は所有権者（金融機関・ディーラー等）へご提出ください。案件ID：' + esc(f.caseId) + '</p>' +
      '<div class="sign-row">' +
        '<div class="sign-box"><p>所有権者（受付）印</p><br><br><span class="seal">印</span></div>' +
        '<div class="sign-box"><p>解除確認日</p><br><br>　　　　年　　月　　日</div>' +
      '</div>';
  }

  /* ⑤ 清算書（ダッシュボードのprintSettlementと同等、フィールド入力版） */
  function docSettlement(f) {
    var c = findCaseFull(f.caseId);
    if (c && c.saleMethod) {
      var method = c.saleMethod;
      var buyP = Number(c.amount) || 0;
      var saleP = Number(c.salePrice) || 0;
      var profit = saleP - buyP;
      var hqFee = method === 'オークション' ? Math.round(Math.max(0, profit) * 0.05) : 30000;
      var partnerAmt = method === 'オークション' ? (profit - hqFee) : (saleP - hqFee);
      var d = new Date(); var due = new Date(); due.setDate(due.getDate() + 7);
      function p(n) { return ('0' + n).slice(-2); }
      function ds(dt) { return dt.getFullYear() + '/' + p(dt.getMonth()+1) + '/' + p(dt.getDate()); }
      return '<h1>清 算 書</h1>' +
        '<p class="sub">発行日：' + ds(d) + '　支払期限：' + ds(due) + '（1週間以内）</p>' +
        '<table>' +
        '<tr><td class="label">案件ID</td><td>' + esc(c.id) + '</td></tr>' +
        '<tr><td class="label">お名前</td><td>' + esc(c.name || '—') + '</td></tr>' +
        '<tr><td class="label">ジャンル</td><td>' + esc(c.genre || '—') + '</td></tr>' +
        '<tr><td class="label">担当加盟店</td><td>' + esc(c.assignee || '—') + '</td></tr>' +
        '<tr><td class="label">売却方法</td><td>' + esc(method) + '</td></tr>' +
        (method === 'オークション' ? [
          '<tr><td class="label">仕入れ価格</td><td>' + yen(buyP) + '</td></tr>',
          '<tr><td class="label">落札価格</td><td>' + yen(saleP) + '</td></tr>',
          '<tr><td class="label" style="background:#f9f0e6;">粗利</td><td style="font-weight:700;">' + yen(profit) + '</td></tr>',
          '<tr><td class="label" style="background:#fde8e8;">本部手数料（5%）</td><td style="color:#C0392B;font-weight:700;">' + yen(hqFee) + '</td></tr>',
          '<tr><td class="label" style="background:#e8f7ec;">加盟店受取額</td><td style="color:#15803d;font-weight:900;font-size:12pt;">' + yen(partnerAmt) + '</td></tr>'
        ].join('') : [
          '<tr><td class="label" style="background:#fde8e8;">本部手数料（固定）</td><td style="color:#C0392B;font-weight:700;">¥30,000</td></tr>'
        ].join('')) +
        '</table>' +
        '<p class="note" style="margin-top:6mm;">BUYMO ／ 合同会社アイズ　〒971-8138 福島県いわき市若葉台1丁目31-11<br>お支払いは期限内にお振込みいたします。</p>';
    } else {
      return '<h1>清 算 書</h1><p style="text-align:center;margin-top:20mm;color:#888;">案件IDを選択し、案件詳細パネルで売却方法を設定してください。</p>';
    }
  }

  /* ---- 全書類ルーター ---- */
  var DOCS = {
    'contract':                   { title: '売買契約書',      fn: docContract },
    'power-of-attorney-transfer': { title: '委任状（移転登録用）', fn: docPoaTransfer },
    'power-of-attorney-cancel':   { title: '委任状（抹消登録用）', fn: docPoaCancel },
    'transfer-cert':              { title: '譲渡証明書',      fn: docTransferCert },
    'ownership-release':          { title: '所有権解除依頼書',  fn: docOwnershipRelease },
    'settlement':                 { title: '清算書',          fn: docSettlement }
  };
  window.printDoc = function (key) {
    var d = DOCS[key]; if (!d) return;
    printWin(d.title, d.fn(getFields()));
  };

  /* ---- 案件セレクト ---- */
  var allCases = [];
  function findCaseFull(id) {
    for (var i = 0; i < allCases.length; i++) if (allCases[i].id === id) return allCases[i];
    return null;
  }
  function buildCaseSelect(cases) {
    allCases = cases;
    var sel = document.getElementById('docCaseId');
    sel.innerHTML = '<option value="">— 案件を選択 —</option>' +
      cases.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.id) + ' ' + esc(c.name || '') + ' ' + esc(c.genre ? '(' + c.genre + ')' : '') + '</option>'; }).join('');
    sel.addEventListener('change', function () {
      var c = findCaseFull(sel.value); if (!c) return;
      if (c.name) document.getElementById('docName').value = c.name;
    });
  }

  /* ---- 過誤納還付金 都道府県一覧 ---- */
  var REFUND_DATA = [
    ['北海道', '北海道総合振興局・振興局 各税務課', '各総合振興局に問い合わせ', 'https://www.pref.hokkaido.lg.jp/sm/zim/jidosha.html'],
    ['青森県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.aomori.lg.jp/soshiki/zeimu/'],
    ['岩手県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.iwate.jp/kensei/zeimu/'],
    ['宮城県', '県税事務所', '022-211-2338（宮城）', 'https://www.pref.miyagi.jp/soshiki/kenzei/'],
    ['秋田県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.akita.lg.jp/pages/cat000048/'],
    ['山形県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.yamagata.jp/020073/'],
    ['福島県', '県税事務所（いわき・郡山・会津 等）', 'いわき：0246-24-6001', 'https://www.pref.fukushima.lg.jp/sec/11055b/'],
    ['茨城県', '県税事務所', '029-301-2455（茨城）', 'https://www.pref.ibaraki.jp/somu/zeimu/'],
    ['栃木県', '県税事務所', '028-623-2103', 'https://www.pref.tochigi.lg.jp/m06/'],
    ['群馬県', '県税事務所', '027-226-2010', 'https://www.pref.gunma.jp/page/6597.html'],
    ['埼玉県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.saitama.lg.jp/a0207/'],
    ['千葉県', '県税事務所', '043-223-2111', 'https://www.pref.chiba.lg.jp/zeimu/'],
    ['東京都', '都税事務所', '03-5388-2970（都税総合案内）', 'https://www.tax.metro.tokyo.lg.jp/'],
    ['神奈川県', '県税事務所', '045-210-1111', 'https://www.pref.kanagawa.jp/docs/pb5/'],
    ['新潟県', '県税事務所', '025-280-5410', 'https://www.pref.niigata.lg.jp/sec/kenzei/'],
    ['富山県', '県税事務所', '076-431-4111', 'https://www.pref.toyama.jp/sections/1103/'],
    ['石川県', '県税事務所', '076-225-1355', 'https://www.pref.ishikawa.lg.jp/zeimu/'],
    ['福井県', '県税事務所', '0776-20-0521', 'https://www.pref.fukui.lg.jp/doc/zeimu/'],
    ['山梨県', '県税事務所', '055-223-1520', 'https://www.pref.yamanashi.jp/zeimu-c/'],
    ['長野県', '県税事務所', '各事務所に問い合わせ', 'https://www.pref.nagano.lg.jp/zeimu/'],
    ['岐阜県', '県税事務所', '058-272-1111', 'https://www.pref.gifu.lg.jp/page/7316.html'],
    ['静岡県', '県税事務所', '054-221-2042', 'https://www.pref.shizuoka.jp/soumu/so-140/'],
    ['愛知県', '県税事務所', '052-954-6114', 'https://www.pref.aichi.jp/zeimu/'],
    ['三重県', '県税事務所', '059-224-2118', 'https://www.pref.mie.lg.jp/ZEIMU/'],
    ['滋賀県', '県税事務所', '077-528-3520', 'https://www.pref.shiga.lg.jp/ippan/kurashi/kenzei/'],
    ['京都府', '府税事務所', '075-414-4506', 'https://www.pref.kyoto.jp/fusei/'],
    ['大阪府', '府税事務所', '06-6941-0351', 'https://www.pref.osaka.lg.jp/fumin/zeimu/'],
    ['兵庫県', '県税事務所', '078-362-4159', 'https://www.pref.hyogo.lg.jp/kenzei/'],
    ['奈良県', '県税事務所', '0742-22-1101', 'https://www.pref.nara.jp/55.htm'],
    ['和歌山県', '県税事務所', '073-441-3053', 'https://www.pref.wakayama.lg.jp/prefg/010200/'],
    ['鳥取県', '県税事務所', '0857-26-7349', 'https://www.pref.tottori.lg.jp/zeimu/'],
    ['島根県', '県税事務所', '0852-22-5441', 'https://www.pref.shimane.lg.jp/life/zeikin/'],
    ['岡山県', '県税事務所', '086-226-7323', 'https://www.pref.okayama.jp/page/1417.html'],
    ['広島県', '県税事務所', '082-228-2111', 'https://www.pref.hiroshima.lg.jp/soshiki/42/'],
    ['山口県', '県税事務所', '083-933-2350', 'https://www.pref.yamaguchi.lg.jp/cms/a14600/'],
    ['徳島県', '県税事務所', '088-621-2494', 'https://www.pref.tokushima.lg.jp/nozei/'],
    ['香川県', '県税事務所', '087-832-3400', 'https://www.pref.kagawa.lg.jp/zeimu/'],
    ['愛媛県', '県税事務所', '089-912-2490', 'https://www.pref.ehime.jp/h20200/'],
    ['高知県', '県税事務所', '088-823-9747', 'https://www.pref.kochi.lg.jp/zeimu/'],
    ['福岡県', '県税事務所', '092-651-1111', 'https://www.pref.fukuoka.lg.jp/contents/zeimu.html'],
    ['佐賀県', '県税事務所', '0952-25-7025', 'https://www.pref.saga.lg.jp/kiji00350432/'],
    ['長崎県', '県税事務所', '095-824-1111', 'https://www.pref.nagasaki.jp/s_zeimu/'],
    ['熊本県', '県税事務所', '096-383-0011', 'https://www.pref.kumamoto.jp/kiji_3186.html'],
    ['大分県', '県税事務所', '097-538-2270', 'https://www.pref.oita.jp/soshiki/14060/'],
    ['宮崎県', '県税事務所', '0985-26-7003', 'https://www.pref.miyazaki.lg.jp/zeimu/'],
    ['鹿児島県', '県税事務所', '099-286-2170', 'https://www.pref.kagoshima.jp/af01/'],
    ['沖縄県', '県税事務所', '098-866-2527', 'https://www.pref.okinawa.jp/site/somu/zeimu/']
  ];

  var refBody = document.getElementById('refundBody');
  if (refBody) {
    refBody.innerHTML = REFUND_DATA.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td>' +
        '<td><a href="' + esc(r[3]) + '" target="_blank" rel="noopener">公式サイト →</a></td></tr>';
    }).join('');
  }

  /* ---- 自賠責保険 問い合わせ先 ---- */
  var JIBAI_DATA = [
    ['東京海上日動火災保険', '0120-868-100', '9:00〜17:00（平日）', '廃車連絡センター'],
    ['損害保険ジャパン', '0120-727-110', '9:00〜17:00（平日）', '廃車返戻専用'],
    ['三井住友海上', '0570-200-655', '9:00〜17:00（平日）', ''],
    ['あいおいニッセイ同和損保', '0120-324-133', '9:00〜17:00（平日）', ''],
    ['富士火災（AIG）', '0120-225-655', '9:00〜18:00（平日）', ''],
    ['セゾン自動車火災', '0120-101-327', '9:00〜18:00（平日）', ''],
    ['チューリッヒ保険', '0120-009-179', '9:00〜17:30（平日）', '廃車還付'],
    ['ソニー損保', '0800-888-0100', '10:00〜19:00', ''],
    ['楽天損保', '0120-044-250', '9:00〜18:00（平日）', '']
  ];
  var jibaiBody = document.getElementById('jibaiBody');
  if (jibaiBody) {
    jibaiBody.innerHTML = JIBAI_DATA.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td style="font-weight:700;">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
    }).join('');
  }

  /* ---- 案件ロード ---- */
  HQ.loadCases(function (list) { buildCaseSelect(list); });
})();
