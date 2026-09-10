/* 書類発行・ダウンロード管理（本部） */
(function () {
  'use strict';
  HQ.nav('documents');
  // ロールに応じたヘッダー表示（加盟店も利用可）
  try { var r = AUTH.role && AUTH.role(); if (r === 'partner') { var t = document.getElementById('portalTitle'); if (t) t.textContent = '加盟店'; } } catch (e) {}

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

  /* ---- 印刷ウィンドウ共通（シンプル・枠なし） ---- */
  var A4_STYLE = [
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'body{font-family:"Noto Sans JP",sans-serif;font-size:11pt;color:#1a1a1a;padding:22mm 22mm;line-height:1.75;}',
    'h1{font-size:19pt;font-weight:900;text-align:center;letter-spacing:.16em;margin-bottom:7mm;}',
    'h2{font-size:11.5pt;font-weight:800;margin:7mm 0 1mm;color:#0e1b33;letter-spacing:.02em;}',   // 見出しは細い下線のみ（枠なし）
    'h2::after{content:"";display:block;height:2px;background:#0e1b33;width:100%;margin-top:1.5mm;opacity:.85;}',
    '.sub{text-align:center;color:#555;font-size:10pt;margin-bottom:8mm;line-height:1.85;}',
    'table{width:100%;border-collapse:collapse;margin:1mm 0 5mm;}',
    'td,th{border:none;border-bottom:1px solid #e7e9ee;padding:5.5px 2px;font-size:10.5pt;vertical-align:top;text-align:left;}',
    '.label{color:#5a6472;font-weight:700;width:34%;white-space:nowrap;background:none;}',
    '.wc{min-height:9mm;padding:1mm 0;}',
    '.wc-seal{display:flex;align-items:center;justify-content:space-between;gap:6mm;}',
    '.blank-hint{text-align:center;font-size:9pt;color:#999;padding:1mm 3mm;margin-bottom:6mm;}',
    '.sign-row{display:flex;gap:14mm;margin-top:11mm;}',
    '.sign-box{flex:1;padding:2mm 0;}',                                // 枠なし・署名は下線で受ける
    '.sign-box p{font-size:9pt;color:#5a6472;margin-bottom:9mm;font-weight:700;}',
    '.sign-line{border-bottom:1px solid #99a;margin-top:2mm;}',
    '.note{font-size:9pt;color:#666;margin-top:4mm;line-height:1.75;}',
    '.seal{display:inline-block;border:1px dashed #c3c8d0;width:20mm;height:20mm;text-align:center;line-height:20mm;font-size:9pt;color:#bfc4cc;}',
    '.terms h3{font-size:10.5pt;font-weight:700;margin:4mm 0 1.5mm;break-after:avoid;page-break-after:avoid;}',
    '.terms p{font-size:9.5pt;line-height:1.7;margin-bottom:1.5mm;text-align:justify;}',
    '.terms{margin-bottom:6mm;}',
    '.chk-list{list-style:none;margin:0 0 6mm;padding:0;}',
    '.chk-list li{font-size:10.5pt;line-height:1.85;padding:1.4mm 0;border-bottom:1px solid #eef0f3;}',
    '.chk-list li.chk-sub{border-bottom:0;color:#555;font-size:9.5pt;padding-left:7mm;}',
    '.chk-list.plain li{border-bottom:0;}',
    '.big-amt{font-size:20pt;font-weight:900;color:#0e1b33;letter-spacing:.02em;}',
    '.amt-band{margin:3mm 0 5mm;padding:4mm 6mm;background:#f6f8fb;border-radius:8px;display:flex;align-items:baseline;justify-content:space-between;}',
    '.amt-band .k{font-size:10.5pt;font-weight:700;color:#5a6472;}',
    'footer{position:fixed;bottom:8mm;left:0;right:0;text-align:center;font-size:9pt;color:#b3b8c0;}',
    '@media print{.no-print{display:none;} body{padding:16mm 18mm;} footer{position:fixed;} .sign-row{page-break-inside:avoid;}}'
  ].join('');
  // お礼はがき（郵便はがき 100×148mm）用のシンプルなスタイル
  var HAGAKI_STYLE = [
    '@page{size:100mm 148mm;margin:0;}',
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'body{font-family:"Noto Sans JP",serif;width:100mm;min-height:148mm;padding:12mm 11mm;color:#2a2622;background:#fffef9;line-height:1.9;}',
    '.hg-mark{font-size:9pt;letter-spacing:.3em;color:#a98b3e;font-weight:800;text-align:center;margin-bottom:3mm;}',
    '.hg-h{font-size:15pt;font-weight:900;text-align:center;letter-spacing:.14em;color:#1a1a1a;margin-bottom:5mm;}',
    '.hg-rule{height:1px;background:#e3d7bd;margin:0 auto 5mm;width:70%;}',
    '.hg-photo{text-align:center;margin:0 0 4mm;}',
    '.hg-photo img{max-width:66mm;max-height:42mm;object-fit:cover;border:1px solid #e3d7bd;padding:1.2mm;background:#fff;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.14);}',
    '.hg-photo .cap{display:block;font-size:8pt;color:#9a8a63;margin-top:1.5mm;letter-spacing:.05em;}',
    '.hg-body{font-size:10pt;line-height:2;text-align:justify;margin-bottom:6mm;}',
    '.hg-body.compact{font-size:9pt;line-height:1.8;margin-bottom:4mm;}',
    '.hg-to{font-size:11pt;font-weight:700;margin-bottom:5mm;}',
    '.hg-from{font-size:9pt;color:#555;text-align:right;line-height:1.7;margin-top:4mm;}',
    '.hg-from b{font-size:10.5pt;color:#1a1a1a;}',
    '.no-print{margin-top:6mm;text-align:center;}',
    '@media print{.no-print{display:none;} body{background:#fff;}}'
  ].join('');
  function printWin(title, body, style) {
    var css = (style === 'hagaki') ? HAGAKI_STYLE : A4_STYLE;
    var footer = (style === 'hagaki') ? '' : '<footer>BUYMO ／ 合同会社アイズ</footer>';
    var winSize = (style === 'hagaki') ? 'width=520,height=760' : 'width=760,height=760';
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + title + '</title><style>' + css + '</style></head><body>' +
      body + footer +
      '<p class="no-print" style="text-align:center;margin-top:12mm;"><button onclick="window.print()" style="padding:8px 28px;font-size:13px;cursor:pointer;border:none;background:#0e1b33;color:#fff;border-radius:8px;">印刷 / PDF保存</button>&nbsp;<button onclick="window.close()" style="padding:8px 20px;font-size:13px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:8px;">閉じる</button></p>' +
      '</body></html>';
    var w = window.open('', '_blank', winSize);
    w.document.write(html); w.document.close();
  }

  /* ======================================================
     書類テンプレート
  ====================================================== */

  /* ① 自動車売買契約書（約款付き・法的詳細版） */
  // 契約書専用の入力を読み取り（無ければ上部fill-barで補完）
  function getContract() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var base = getFields();
    return {
      caseId: base.caseId,
      date: g('ctDate') || nowStr(),
      koName: g('ctKoName') || base.name,
      koAddr: g('ctKoAddr') || base.address,
      koTel: g('ctKoTel'),
      carName: g('ctCarName'),
      carType: g('ctCarType'),
      carYear: g('ctCarYear'),
      vin: g('ctVin') || base.vin,
      plate: g('ctPlate') || base.plate,
      mileage: g('ctMileage'),
      color: g('ctColor'),
      price: g('ctPrice'),
      payMethod: g('ctPayMethod') || '銀行振込',
      payDue: g('ctPayDue'),
      bank: g('ctBank'),
      deliveryDate: g('ctDeliveryDate'),
      deliveryPlace: g('ctDeliveryPlace'),
      otsuName: g('ctOtsuName') || '合同会社アイズ（BUYMO）',
      otsuStaff: g('ctOtsuStaff'),
      otsuAddr: g('ctOtsuAddr') || '〒979-0204 福島県いわき市四倉町細谷字大町1番',
      otsuKobutsu: g('ctOtsuKobutsu') || '福島県公安委員会 第25121A010859号',
      note: g('ctNote')
    };
  }
  function yenText(v) { var n = Number(String(v).replace(/[^0-9.]/g, '')); return n ? ('金 ' + n.toLocaleString('en-US') + ' 円（税込）') : '金　　　　　　　　　円（税込）'; }
  function orBlank(s) { return esc(s) || '　'; }

  function docContract() {
    var v = getContract();
    var head =
      '<h1>自動車売買契約書</h1>' +
      '<p class="sub">売主（以下「甲」という。）と買主（以下「乙」という。）とは、下記の自動車（以下「本自動車」という。）の売買について、以下のとおり契約（以下「本契約」という。）を締結する。</p>';
    var parties =
      '<h2>当事者の表示</h2>' +
      '<table>' +
        '<tr><td class="label">甲（売主）氏名</td><td>' + orBlank(v.koName) + '</td></tr>' +
        '<tr><td class="label">甲 住所</td><td>' + orBlank(v.koAddr) + '</td></tr>' +
        '<tr><td class="label">甲 電話</td><td>' + orBlank(v.koTel) + '</td></tr>' +
        '<tr><td class="label">乙（買主）名称</td><td>' + orBlank(v.otsuName) + '</td></tr>' +
        '<tr><td class="label">乙 住所</td><td>' + orBlank(v.otsuAddr) + '</td></tr>' +
        '<tr><td class="label">乙 担当者</td><td>' + orBlank(v.otsuStaff) + '</td></tr>' +
        '<tr><td class="label">乙 古物商許可</td><td>' + orBlank(v.otsuKobutsu) + '</td></tr>' +
      '</table>';
    var car =
      '<h2>本自動車の表示</h2>' +
      '<table>' +
        '<tr><td class="label">車名</td><td>' + orBlank(v.carName) + '</td><td class="label">型式</td><td>' + orBlank(v.carType) + '</td></tr>' +
        '<tr><td class="label">年式</td><td>' + orBlank(v.carYear) + '</td><td class="label">走行距離</td><td>' + (v.mileage ? esc(v.mileage) + ' km' : '　') + '</td></tr>' +
        '<tr><td class="label">車台番号</td><td>' + orBlank(v.vin) + '</td><td class="label">登録番号</td><td>' + orBlank(v.plate) + '</td></tr>' +
        '<tr><td class="label">色</td><td>' + orBlank(v.color) + '</td><td class="label">売買代金</td><td style="font-weight:700;">' + yenText(v.price) + '</td></tr>' +
      '</table>';
    // 約款
    function art(n, title, body) { return '<h3>第' + n + '条（' + title + '）</h3>' + body; }
    var terms = '<div class="terms">' +
      art(1, '目的', '<p>甲は、本自動車を現状有姿にて乙に売り渡し、乙はこれを買い受けた。</p>') +
      art(2, '売買代金', '<p>本自動車の売買代金は、頭書記載の金額（税込）とする。</p>') +
      art(3, '代金の支払', '<p>乙は、売買代金を' + esc(v.payMethod) + 'により、' + (v.payDue ? esc(v.payDue) + 'まで' : '別途定める期日まで') + 'に甲へ支払う。' + (v.bank ? '振込先：' + esc(v.bank) + '。' : '') + '振込手数料は乙の負担とする。ただし、名義変更・必要書類の確認完了後の支払とすることができる。</p>') +
      art(4, '引渡し', '<p>甲は、' + (v.deliveryDate ? esc(v.deliveryDate) : '別途甲乙協議のうえ定める日') + 'に、' + (v.deliveryPlace ? esc(v.deliveryPlace) : '甲乙協議のうえ定める場所') + 'において、本自動車及び第7条の付帯書類を乙に引き渡す。引取りに要する費用は乙の負担とする。</p>') +
      art(5, '所有権の移転及び危険負担', '<p>本自動車の所有権は、売買代金の完済及び本自動車の引渡しが完了した時に、甲から乙へ移転する。引渡し前に生じた本自動車の滅失・毀損等の危険は甲が、引渡し後に生じたものは乙が負担する。</p>') +
      art(6, '名義変更等の手続', '<p>甲は、本自動車の移転登録（名義変更）又は抹消登録その他の手続に必要な書類（委任状・譲渡証明書・印鑑証明書等）を、乙の請求に応じ速やかに交付する。乙は、引渡し後速やかに自己の負担と責任において当該手続を行う。</p>') +
      art(7, '付帯書類の交付', '<p>甲は、引渡しに際し、自動車検査証、自動車損害賠償責任保険証明書、自動車リサイクル券、その他本自動車に関する書類を乙に交付する。</p>') +
      art(8, '甲の表明及び保証', '<p>甲は、乙に対し、次の各号を表明し保証する。<br>' +
        '（1）甲が本自動車の正当な所有者又は処分権限を有する者であること。<br>' +
        '（2）本自動車に、抵当権・所有権留保・リース・差押えその他乙の完全な所有権取得を妨げる負担が存在しないこと（存在する場合は事前に乙へ告知し、甲の責任と負担で解消する）。<br>' +
        '（3）走行距離計（メーター）の改ざんがないこと。<br>' +
        '（4）査定時に告知した事項に虚偽がなく、重大な修復歴・冠水歴等を隠していないこと。</p>') +
      art(9, '契約不適合責任', '<p>引渡し後に、第8条の表明保証に反する事実又は甲が故意・重過失により告知しなかった重大な瑕疵が判明した場合、乙は、相当期間を定めて代金の減額、損害の賠償又は本契約の解除を求めることができる。</p>') +
      art(10, '契約の解除', '<p>甲又は乙は、相手方が本契約に違反し、催告後相当期間内に是正しないときは、本契約を解除することができる。第8条の表明保証違反が判明した場合、乙は催告を要せず本契約を解除できる。</p>') +
      art(11, '反社会的勢力の排除', '<p>甲及び乙は、自己が暴力団等の反社会的勢力に該当せず、将来にわたり関係を持たないことを表明・確約する。これに反することが判明した場合、相手方は何らの催告なく本契約を解除でき、これによる損害を賠償する義務を負わない。</p>') +
      art(12, '個人情報の取扱い', '<p>乙は、本契約に関して知り得た甲の個人情報を、本取引の履行及び関連手続の目的の範囲内でのみ利用し、法令に従い適切に管理する。</p>') +
      art(13, '遅延損害金', '<p>乙が支払を遅延したときは、支払期日の翌日から支払済みまで年14.6％の割合による遅延損害金を甲に支払う。</p>') +
      art(14, '協議', '<p>本契約に定めのない事項又は解釈に疑義が生じた事項は、信義誠実の原則に従い甲乙協議のうえ解決する。</p>') +
      art(15, '合意管轄', '<p>本契約に関する紛争については、乙の本店所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。</p>') +
      '</div>';
    var special = '<h2>特記事項</h2><table><tr><td style="min-height:16mm;font-size:10pt;line-height:1.8;">' + (esc(v.note) || '　') + '</td></tr></table>';
    var sign =
      '<p class="note" style="margin-top:6mm;">本契約の成立を証するため本書2通を作成し、甲乙記名押印のうえ各1通を保有する。</p>' +
      '<p class="note">契約年月日：' + esc(v.date) + (v.caseId ? '　　案件ID：' + esc(v.caseId) : '') + '</p>' +
      '<div class="sign-row">' +
        '<div class="sign-box"><p>甲（売主）</p>住所：' + orBlank(v.koAddr) + '<br><br>氏名：' + orBlank(v.koName) + '　<span class="seal">印</span></div>' +
        '<div class="sign-box"><p>乙（買主）</p>住所：' + orBlank(v.otsuAddr) + '<br><br>名称：' + orBlank(v.otsuName) + '<br>担当：' + orBlank(v.otsuStaff) + '　<span class="seal">印</span></div>' +
      '</div>' +
      '<p class="note" style="margin-top:6mm;color:#888;">※本契約書はひな形です。実際のお取引内容・法令改正に合わせ、必要に応じて内容をご確認・調整のうえご利用ください。</p>';
    return head + parties + car + terms + special + sign;
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
      var r = HQ.calcSale(c);
      var method = r.method;
      var d = new Date(); var due = new Date(); due.setDate(due.getDate() + 7);
      function p(n) { return ('0' + n).slice(-2); }
      function ds(dt) { return dt.getFullYear() + '/' + p(dt.getMonth()+1) + '/' + p(dt.getDate()); }
      var rowsHtml;
      if (method === 'オークション') {
        rowsHtml = [
          '<tr><td class="label">① 買取金額（仕入れ）</td><td>' + yen(r.buyP) + '</td></tr>',
          '<tr><td class="label">② 精算書の金額（落札額）</td><td>' + yen(r.saleP) + '</td></tr>',
          '<tr><td class="label" style="background:#f9f0e6;">差引き（粗利）</td><td style="font-weight:700;">' + yen(r.profit) + '</td></tr>',
          '<tr><td class="label">出品代行手数料（税込）</td><td>' + yen(r.agencyFee) + '</td></tr>',
          '<tr><td class="label">成約手数料（粗利5%）</td><td>' + yen(r.commission) + '</td></tr>'
        ];
        if (r.shipping) rowsHtml.push('<tr><td class="label">陸送費</td><td>' + yen(r.shipping) + '</td></tr>');
        if (r.claimCost) rowsHtml.push('<tr><td class="label">クレーム処理費</td><td>' + yen(r.claimCost) + '</td></tr>');
        if (r.reListFee) rowsHtml.push('<tr><td class="label">再出品手数料</td><td>' + yen(r.reListFee) + '</td></tr>');
        rowsHtml.push('<tr><td class="label" style="background:#fde8e8;">本部手数料 合計</td><td style="color:#C0392B;font-weight:700;">' + yen(r.hqFee) + '</td></tr>');
        rowsHtml.push('<tr><td class="label" style="background:#e8f7ec;">加盟店受取額</td><td style="color:#15803d;font-weight:900;font-size:12pt;">' + yen(r.partnerNet) + '</td></tr>');
        rowsHtml = rowsHtml.join('');
      } else {
        rowsHtml = [
          '<tr><td class="label">① 買取金額（仕入れ）</td><td>' + yen(r.buyP) + '</td></tr>',
          '<tr><td class="label">② 精算書の金額（売却額）</td><td>' + yen(r.saleP) + '</td></tr>',
          '<tr><td class="label" style="background:#f9f0e6;">差引き（粗利）</td><td style="font-weight:700;">' + yen(r.profit) + '</td></tr>',
          '<tr><td class="label" style="background:#fde8e8;">本部手数料（一律・税抜）</td><td style="color:#C0392B;font-weight:700;">' + yen(r.hqFee) + '</td></tr>',
          '<tr><td class="label" style="background:#e8f7ec;">加盟店受取額</td><td style="color:#15803d;font-weight:900;font-size:12pt;">' + yen(r.partnerNet) + '</td></tr>'
        ].join('');
      }
      return '<h1>清 算 書</h1>' +
        '<p class="sub">発行日：' + ds(d) + '　支払期限：' + ds(due) + '（1週間以内）</p>' +
        '<table>' +
        '<tr><td class="label">案件ID</td><td>' + esc(c.id) + '</td></tr>' +
        '<tr><td class="label">お名前</td><td>' + esc(c.name || '—') + '</td></tr>' +
        '<tr><td class="label">ジャンル</td><td>' + esc(c.genre || '—') + '</td></tr>' +
        '<tr><td class="label">担当加盟店</td><td>' + esc(c.assignee || '—') + '</td></tr>' +
        '<tr><td class="label">売却方法</td><td>' + esc(method) + '</td></tr>' +
        '<tr><td class="label">申請状況</td><td>' + (c.saleApplied ? '申請済み ' + esc(c.saleAppliedAt || '') : '未申請') + '</td></tr>' +
        rowsHtml +
        '</table>' +
        '<p class="note" style="margin-top:6mm;">BUYMO ／ 合同会社アイズ　〒979-0204 福島県いわき市四倉町細谷字大町1番<br>お支払いは期限内にお振込みいたします。</p>';
    } else {
      return '<h1>清 算 書</h1><p style="text-align:center;margin-top:20mm;color:#888;">案件IDを選択し、案件詳細パネルで売却方法を設定してください。</p>';
    }
  }

  /* ⑥ 買取証明書（査定金額・査定日から5日以内有効） */
  function getBuyback() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var base = getFields();
    var ad = g('bbAssessDate'); // yyyy-mm-dd（未入力なら本日）
    var assessD = ad ? new Date(ad + 'T00:00:00') : new Date();
    if (isNaN(assessD.getTime())) assessD = new Date();
    var validD = new Date(assessD.getTime()); validD.setDate(validD.getDate() + 5);
    function fmt(d) { function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '年' + p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日'; }
    return {
      caseId: base.caseId, issueDate: nowStr(), assessDate: fmt(assessD), validDate: fmt(validD),
      name: g('bbName') || base.name, addr: g('bbAddr') || base.address,
      carName: g('bbCarName'), carType: g('bbCarType'), carYear: g('bbCarYear'), mileage: g('bbMileage'),
      vin: g('bbVin') || base.vin, plate: g('bbPlate') || base.plate, color: g('bbColor'), price: g('bbPrice'),
      issuer: g('bbIssuer') || '合同会社アイズ（BUYMO）', staff: g('bbStaff'), tel: g('bbTel'),
      issuerAddr: g('bbIssuerAddr') || '〒979-0204 福島県いわき市四倉町細谷字大町1番',
      kobutsu: g('bbKobutsu') || '福島県公安委員会 第25121A010859号', note: g('bbNote')
    };
  }
  function docBuyback() {
    var v = getBuyback();
    function amt(p) { var n = Number(String(p).replace(/[^0-9.]/g, '')); return n ? ('¥' + n.toLocaleString('en-US') + '（税込）') : '¥　　　　　　　　（税込）'; }
    return '<h1>買 取 証 明 書</h1>' +
      '<p class="sub">この度は査定のご依頼を賜り、誠にありがとうございます。下記のとおり買取金額を証明いたします。</p>' +
      '<table>' +
        '<tr><td class="label">発行日</td><td>' + esc(v.issueDate) + '</td></tr>' +
        '<tr><td class="label">査定日</td><td>' + esc(v.assessDate) + '</td></tr>' +
        '<tr><td class="label" style="background:#fff4e0;">有効期限</td><td style="font-weight:700;">' + esc(v.validDate) + ' まで（査定日から5日以内）</td></tr>' +
      '</table>' +
      '<h2>お客様（車両所有者）</h2>' +
      '<table><tr><td class="label">お名前</td><td>' + orBlank(v.name) + ' 様</td></tr>' +
      '<tr><td class="label">ご住所</td><td>' + orBlank(v.addr) + '</td></tr></table>' +
      '<h2>対象車両</h2>' +
      '<table>' +
        '<tr><td class="label" style="width:22%;">車名</td><td>' + orBlank(v.carName) + '</td><td class="label" style="width:22%;">型式</td><td>' + orBlank(v.carType) + '</td></tr>' +
        '<tr><td class="label">年式</td><td>' + orBlank(v.carYear) + '</td><td class="label">走行距離</td><td>' + (v.mileage ? esc(v.mileage) + ' km' : '　') + '</td></tr>' +
        '<tr><td class="label">登録番号</td><td>' + orBlank(v.plate) + '</td><td class="label">車台番号</td><td>' + orBlank(v.vin) + '</td></tr>' +
        '<tr><td class="label">色</td><td colspan="3">' + orBlank(v.color) + '</td></tr>' +
      '</table>' +
      '<h2>買取金額</h2>' +
      '<table><tr><td class="label" style="width:38%;">買取金額（税込）</td><td class="big-amt">' + amt(v.price) + '</td></tr></table>' +
      '<p class="note">※ 本証明書は上記査定日から <b>5日以内</b> 有効です。有効期限を過ぎた場合、相場変動・現車状態の再確認により買取金額が変わることがあります。<br>' +
      '※ 買取成立には、名義変更等に必要な書類のご準備が必要です（別紙「買取に必要な書類のご案内」をご確認ください）。<br>' +
      '※ 概算査定の場合、現車確認後に金額を確定いたします。' + (v.note ? '<br>※ ' + esc(v.note) : '') + '</p>' +
      '<h2>発行者</h2>' +
      '<table><tr><td class="label">名称</td><td>' + orBlank(v.issuer) + '</td></tr>' +
        '<tr><td class="label">住所</td><td>' + orBlank(v.issuerAddr) + '</td></tr>' +
        '<tr><td class="label">古物商許可</td><td>' + orBlank(v.kobutsu) + '</td></tr>' +
        '<tr><td class="label">担当者／連絡先</td><td>' + orBlank(v.staff) + (v.tel ? '　TEL: ' + esc(v.tel) : '') + '</td></tr>' +
        (v.caseId ? '<tr><td class="label">案件ID</td><td>' + esc(v.caseId) + '</td></tr>' : '') +
      '</table>' +
      '<div class="sign-row"><div class="sign-box" style="flex:0 0 62mm;"><p>発行者（社印）</p><br><br><span class="seal">印</span></div></div>';
  }

  /* ⑦ 必要書類のご案内（お客様用チェックリスト） */
  function getChecklist() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    return { type: g('clType') || '普通車', owner: g('clOwner') || '本人名義', action: g('clAction') || '名義変更（移転登録）', name: g('clName') || getFields().name };
  }
  function docChecklist() {
    var v = getChecklist();
    var kei = v.type.indexOf('軽') >= 0;
    var loan = v.owner.indexOf('ローン') >= 0 || v.owner.indexOf('リース') >= 0 || v.owner.indexOf('留保') >= 0;
    var other = v.owner.indexOf('他人') >= 0 || v.owner.indexOf('家族') >= 0;
    var haisha = v.action.indexOf('廃車') >= 0 || v.action.indexOf('抹消') >= 0;
    function chk(t) { return '<li>☐ ' + t + '</li>'; }
    var cust = [];
    if (!kei) { cust.push('印鑑証明書（発行から3か月以内・1通）'); cust.push('実印（各書類への押印用）'); }
    else { cust.push('認印（軽自動車は実印・印鑑証明は不要です）'); }
    cust.push('自動車検査証（車検証）の原本');
    cust.push('自動車税（種別割）納税証明書');
    cust.push('自賠責保険証明書（有効期限内のもの）');
    cust.push('自動車リサイクル券（預託済みのもの）');
    if (!kei && !haisha) cust.push('住民票（車検証の住所と現住所が異なる場合）');
    if (kei && !haisha) cust.push('ナンバープレート（管轄の運輸支局が変わる場合）');
    if (haisha) cust.push('ナンバープレート 前後2枚（返納します）');
    if (other) cust.push('所有者ご本人の 印鑑証明書・実印・委任状（名義人の方にご用意いただきます）');
    var loanBlk = loan ?
      ('<h2>ローン・リース中の場合（所有権留保）</h2>' +
        '<ul class="chk-list">' +
          '<li>☐ 所有権解除の書類一式（信販会社・ディーラーから取り寄せ）</li>' +
          '<li class="chk-sub">… 譲渡証明書（所有者の実印）／委任状／所有者の印鑑証明書</li>' +
          '<li>☐ ローンの完済（残債がある場合は完済が必要です）</li>' +
        '</ul>' +
        '<p class="note">※ 車検証の「所有者」欄に記載の会社へご連絡のうえ、上記書類をお取り寄せください。手続きのご案内は当社でも承ります。</p>')
      : '';
    var buymo = kei ? ['申請依頼書（当社様式にご署名・ご押印）'] : ['譲渡証明書（当社様式・実印をご押印）', '委任状（当社様式・実印をご押印）'];
    return '<h1>買取に必要な書類のご案内</h1>' +
      '<p class="sub">' + (v.name ? esc(v.name) + ' 様　' : '') + '（' + esc(v.type) + '・' + esc(v.owner) + '・' + esc(v.action) + '）</p>' +
      '<p style="font-size:10pt;margin-bottom:5mm;">お手続きにあたり、下記の書類のご準備をお願いいたします。ご不明な点は担当者までお気軽にお問い合わせください。</p>' +
      '<h2>お客様にご準備いただくもの</h2>' +
      '<ul class="chk-list">' + cust.map(chk).join('') + '</ul>' +
      loanBlk +
      '<h2>当社（BUYMO）でご用意する書類</h2>' +
      '<ul class="chk-list plain">' + buymo.map(function (t) { return '<li>・' + t + '（お客様には署名・押印のみお願いします）</li>'; }).join('') + '</ul>' +
      '<p class="note">※ 車種・お名義・お手続き内容により必要書類が異なる場合があります。最終的な要否は担当者がご案内いたします。<br>' +
      '※ 印鑑証明書・住民票はお近くの市区町村窓口またはコンビニ交付で取得できます。<br>' +
      '※ 本チェックリストはご準備の目安です。</p>' +
      '<div class="sign-row"><div class="sign-box"><p>担当者</p><br></div><div class="sign-box"><p>ご連絡先 TEL</p><br></div></div>';
  }

  /* ⑧ 領収書（本部・加盟店共通） */
  function getReceipt() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var base = getFields();
    return {
      caseId: base.caseId, no: g('rcNo'), date: g('rcDate') || nowStr(),
      to: g('rcTo') || base.name, amount: g('rcAmount'), tadashi: g('rcTadashi') || '自動車買取代金として',
      issuer: g('rcIssuer') || '合同会社アイズ（BUYMO）', issuerAddr: g('rcAddr') || '〒979-0204 福島県いわき市四倉町細谷字大町1番',
      kobutsu: g('rcKobutsu') || '福島県公安委員会 第25121A010859号', staff: g('rcStaff')
    };
  }
  function docReceipt() {
    var v = getReceipt();
    var n = Number(String(v.amount).replace(/[^0-9.]/g, ''));
    var amt = n ? ('¥ ' + n.toLocaleString('en-US') + ' －') : '¥ 　　　　　　　 －';
    var stamp = n >= 50000;
    return '<h1>領 収 書</h1>' +
      '<table style="margin-bottom:2mm;"><tr><td style="border:none;color:#5a6472;">No. ' + esc(v.no || '　') + '</td><td style="border:none;text-align:right;color:#5a6472;">発行日：' + esc(v.date) + '</td></tr></table>' +
      '<p style="font-size:13pt;font-weight:700;border-bottom:1px solid #333;padding-bottom:2mm;margin-bottom:5mm;">' + (v.to ? esc(v.to) + ' 様' : '　　　　　　　　　　 様') + '</p>' +
      '<div class="amt-band"><span class="k">金額（税込）</span><span class="big-amt">' + amt + '</span></div>' +
      '<p style="margin-bottom:5mm;">但し　' + esc(v.tadashi) + '</p>' +
      '<p style="margin-bottom:9mm;">上記正に領収いたしました。</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;">' +
        '<div style="font-size:9.5pt;color:#333;line-height:1.95;"><b style="font-size:11pt;">' + esc(v.issuer) + '</b><br>' + esc(v.issuerAddr) + '<br>古物商許可：' + esc(v.kobutsu) + (v.staff ? '<br>担当：' + esc(v.staff) : '') + '</div>' +
        '<div style="text-align:center;"><span class="seal">印</span></div>' +
      '</div>' +
      '<p class="note" style="margin-top:8mm;">' + (stamp ? '※ 課税文書に該当する場合は、所定の収入印紙を貼付・消印してください（自動車の買取＝仕入代金の支払は通常非課税ですが、念のためご確認ください）。<br>' : '') + (v.caseId ? '案件ID：' + esc(v.caseId) : '') + '</p>';
  }

  /* ⑨ 車両査定表（記入用・本部/加盟店共通） */
  function getAppraisal() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var base = getFields();
    return {
      caseId: base.caseId, date: g('apDate') || nowStr(), staff: g('apStaff'), tel: g('apTel'),
      name: base.name, addr: base.address, carName: g('apCarName'), carType: g('apCarType'),
      year: g('apYear'), firstReg: g('apFirstReg'), mileage: g('apMileage'), vin: base.vin,
      plate: base.plate, color: g('apColor'), shaken: g('apShaken'), price: g('apPrice')
    };
  }
  function docAppraisal() {
    var v = getAppraisal();
    function line(a) { return a.map(function (t) { return '☐ ' + t; }).join('　　'); }
    function cell(val) { return val ? esc(val) : '<span style="color:#c3c8d0;">（記入）</span>'; }
    return '<h1>車 両 査 定 表</h1>' +
      '<table><tr><td class="label">査定日</td><td>' + esc(v.date) + '</td><td class="label">担当者</td><td>' + cell(v.staff) + '</td></tr>' +
        '<tr><td class="label">案件ID</td><td>' + cell(v.caseId) + '</td><td class="label">連絡先</td><td>' + cell(v.tel) + '</td></tr></table>' +
      '<h2>お客様</h2>' +
      '<table><tr><td class="label">お名前</td><td>' + cell(v.name) + '</td></tr><tr><td class="label">ご住所</td><td>' + cell(v.addr) + '</td></tr></table>' +
      '<h2>車両情報</h2>' +
      '<table>' +
        '<tr><td class="label">車名</td><td>' + cell(v.carName) + '</td><td class="label">型式</td><td>' + cell(v.carType) + '</td></tr>' +
        '<tr><td class="label">年式</td><td>' + cell(v.year) + '</td><td class="label">初度登録</td><td>' + cell(v.firstReg) + '</td></tr>' +
        '<tr><td class="label">走行距離</td><td>' + (v.mileage ? esc(v.mileage) + ' km' : '<span style="color:#c3c8d0;">（記入）</span>') + '</td><td class="label">車検満了</td><td>' + cell(v.shaken) + '</td></tr>' +
        '<tr><td class="label">登録番号</td><td>' + cell(v.plate) + '</td><td class="label">車台番号</td><td>' + cell(v.vin) + '</td></tr>' +
        '<tr><td class="label">色</td><td colspan="3">' + cell(v.color) + '</td></tr>' +
      '</table>' +
      '<h2>状態チェック</h2>' +
      '<table>' +
        '<tr><td class="label">修復歴</td><td>☐ 無　　☐ 有（箇所：　　　　　　　）</td></tr>' +
        '<tr><td class="label">外装（キズ・凹み）</td><td>' + line(['良好', '小傷あり', '要補修']) + '　　メモ：</td></tr>' +
        '<tr><td class="label">内装（汚れ・臭い）</td><td>' + line(['良好', '喫煙', 'ペット', '汚れ']) + '</td></tr>' +
        '<tr><td class="label">機関（エンジン/AT）</td><td>' + line(['良好', '要点検', '不調']) + '</td></tr>' +
        '<tr><td class="label">電装・エアコン</td><td>' + line(['良好', '一部不良']) + '</td></tr>' +
        '<tr><td class="label">タイヤ残溝</td><td>前 　　mm ／ 後 　　mm　' + line(['交換不要', '要交換']) + '</td></tr>' +
        '<tr><td class="label">付属・装備</td><td>' + line(['スペアキー', '取説', '記録簿', 'ナビ', 'ETC', 'ドラレコ']) + '</td></tr>' +
        '<tr><td class="label">警告灯・その他</td><td>&nbsp;</td></tr>' +
      '</table>' +
      '<h2>査定メモ・加減点</h2>' +
      '<div style="border-bottom:1px solid #e7e9ee;height:11mm;"></div><div style="border-bottom:1px solid #e7e9ee;height:11mm;margin-bottom:4mm;"></div>' +
      '<div class="amt-band"><span class="k">査定金額（提示額・税込）</span><span class="big-amt">' + (v.price ? '¥ ' + Number(String(v.price).replace(/[^0-9.]/g, '')).toLocaleString('en-US') : '¥ 　　　　　　') + '</span></div>' +
      '<div class="sign-row"><div class="sign-box"><p>査定担当者</p><div class="sign-line"></div></div><div class="sign-box"><p>お客様 確認サイン</p><div class="sign-line"></div></div></div>';
  }

  /* ⑩ お礼はがき（郵便はがき100×148mm・お客様へ／思い出の写真を添付可） */
  var thanksImg = ''; // 添付画像のデータURL（思い出の写真）
  function getThanks() {
    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var base = getFields();
    return {
      name: g('tkName') || base.name, issuer: g('tkIssuer') || '合同会社アイズ（BUYMO）', store: g('tkStore'),
      staff: g('tkStaff'), tel: g('tkTel'), addr: g('tkAddr') || '〒979-0204 福島県いわき市四倉町細谷字大町1番',
      msg: g('tkMsg'), cap: g('tkCaption')
    };
  }
  function docThanks() {
    var v = getThanks();
    var def = 'この度は、数ある買取店の中から BUYMO をお選びいただき、誠にありがとうございました。\n' +
      '大切なお車をお譲りいただき、心より御礼申し上げます。名義変更等のお手続きは、責任をもって進めてまいります。\n' +
      'またお車のご売却・お乗り換えの際は、ぜひ当店にご用命くださいませ。スタッフ一同、心より感謝申し上げます。';
    var msg = v.msg || def;
    var photo = thanksImg ? ('<div class="hg-photo"><img src="' + thanksImg + '" alt="">' + (v.cap ? '<span class="cap">' + esc(v.cap) + '</span>' : '') + '</div>') : '';
    // 写真がある時は本文をやや小さめにしてはがき内に収める
    var bodyCls = thanksImg ? 'hg-body compact' : 'hg-body';
    return '<div class="hg-mark">THANK YOU</div>' +
      '<div class="hg-h">御 礼</div>' +
      '<div class="hg-rule"></div>' +
      photo +
      (v.name ? '<div class="hg-to">' + esc(v.name) + ' 様</div>' : '') +
      '<div class="' + bodyCls + '">' + esc(msg).replace(/\n/g, '<br>') + '</div>' +
      '<div class="hg-from"><b>' + esc(v.issuer) + (v.store ? '　' + esc(v.store) : '') + '</b><br>' + esc(v.addr) + (v.tel ? '<br>TEL：' + esc(v.tel) : '') + (v.staff ? '<br>担当：' + esc(v.staff) : '') + '</div>';
  }
  // お礼はがきの写真添付（縮小してデータURL化。プレビュー・削除に対応）
  function initThanksImage() {
    var inp = document.getElementById('tkImage'); if (!inp) return;
    var prev = document.getElementById('tkImgPreview'), rm = document.getElementById('tkImgRemove');
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var max = 1100, w = img.width, h = img.height;
          if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          try { cv.getContext('2d').drawImage(img, 0, 0, w, h); thanksImg = cv.toDataURL('image/jpeg', 0.85); }
          catch (err) { thanksImg = e.target.result; }
          if (prev) { prev.src = thanksImg; prev.hidden = false; }
          if (rm) rm.hidden = false;
        };
        img.onerror = function () { thanksImg = e.target.result; if (prev) { prev.src = thanksImg; prev.hidden = false; } if (rm) rm.hidden = false; };
        img.src = e.target.result;
      };
      reader.readAsDataURL(f);
    });
    if (rm) rm.addEventListener('click', function () { thanksImg = ''; inp.value = ''; if (prev) { prev.hidden = true; prev.src = ''; } rm.hidden = true; });
  }
  initThanksImage();

  /* ---- 全書類ルーター ---- */
  var DOCS = {
    'contract':                   { title: '売買契約書',            fn: docContract },
    'buyback':                    { title: '買取証明書',            fn: docBuyback },
    'receipt':                    { title: '領収書',                fn: docReceipt },
    'appraisal':                  { title: '車両査定表',            fn: docAppraisal },
    'checklist':                  { title: '買取に必要な書類のご案内', fn: docChecklist },
    'thanks':                     { title: 'お礼はがき',            fn: docThanks, style: 'hagaki' },
    'ownership-release':          { title: '所有権解除依頼書',        fn: docOwnershipRelease },
    'settlement':                 { title: '清算書',                fn: docSettlement }
  };
  window.printDoc = function (key) {
    var d = DOCS[key]; if (!d) return;
    printWin(d.title, d.fn(getFields()), d.style);
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

  /* 所有権解除 お問い合わせ先（主な所有権留保先）
     ※連絡先は車検証の「所有者」欄に記載の会社が正となるため、
       各社の最新窓口は公式サイトの「所有権解除」案内で確認できるよう検索リンクを付す。 */
  var OWNER_DATA = [
    ['トヨタファイナンス', 'メーカー系（トヨタ／レクサス）', 'トヨタ・レクサスのローン。完済後に解除書類を発行'],
    ['ダイハツ（各販売会社）', 'メーカー系（ダイハツ）', '所有者が販売会社名義の場合は購入店へ'],
    ['日産フィナンシャルサービス', 'メーカー系（日産）', '日産のオートローン'],
    ['ホンダファイナンス', 'メーカー系（ホンダ）', 'ホンダのオートローン'],
    ['スズキファイナンス', 'メーカー系（スズキ）', ''],
    ['三菱自動車ファイナンス', 'メーカー系（三菱）', ''],
    ['SUBARU（スバルファイナンス）', 'メーカー系（スバル）', ''],
    ['マツダ（オートローン）', 'メーカー系（マツダ）', '信販会社扱いの場合あり（車検証を確認）'],
    ['オリエントコーポレーション（オリコ）', '信販会社', 'オートローンの定番。所有権解除窓口あり'],
    ['ジャックス（JACCS）', '信販会社', ''],
    ['SMBCファイナンスサービス（旧セディナ）', '信販会社', '旧セディナ／OMC／クオーク'],
    ['アプラス', '信販会社', ''],
    ['プレミアグループ', '信販会社', '中古車オートローンで多い'],
    ['各ディーラー・中古車販売店', '販売店名義', '所有者欄が販売店の場合は購入店へ直接']
  ];
  var ownerBody = document.getElementById('ownerBody');
  if (ownerBody) {
    ownerBody.innerHTML = OWNER_DATA.map(function (r) {
      var q = 'https://www.google.com/search?q=' + encodeURIComponent(r[0].replace(/（.*?）/g, '') + ' 所有権解除');
      return '<tr><td style="font-weight:700;">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2] || '—') + '</td>' +
        '<td><a href="' + q + '" target="_blank" rel="noopener">所有権解除の案内を開く ↗</a></td></tr>';
    }).join('');
  }

  /* ---- 案件ロード（加盟店は自店の案件のみ） ---- */
  HQ.loadCases(function (list) {
    var role = (window.AUTH && AUTH.role) ? AUTH.role() : 'hq';
    var s = (window.AUTH && AUTH.get) ? AUTH.get() : null;
    var who = (s && s.store) ? s.store : '';
    var vis = (role === 'partner' && who) ? list.filter(function (c) { return c.assignee === who; }) : list;
    buildCaseSelect(vis);
  });
})();
