/* 加盟店 支払い・積立管理
   ・加盟店ごとに 契約設定(加盟日/契約年数/月額積立) と 入金履歴 を管理
   ・積立累計・契約残高・途中解約時の一括請求額を自動計算
   ・保存は localStorage('buymo_payments')。加盟店リストは HQ.getStores() を共有 */
(function () {
  'use strict';
  HQ.nav('payments');

  var PKEY = 'buymo_payments';
  var stores = HQ.getStores();
  var db = load();
  var curName = null;

  function load() { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(PKEY, JSON.stringify(db)); } catch (e) {} }
  var yen = HQ.yen, esc = HQ.esc;

  // 契約レコード取得（無ければ初期化。加盟日は加盟店情報から引き継ぐ）
  function rec(name) {
    if (!db[name]) {
      var s = stores.filter(function (x) { return x.name === name; })[0] || {};
      var defMonthly = (window.HQ && HQ.FEES && HQ.FEES.franchiseMonthly) || 35000;
      db[name] = { joinDate: s.joinDate || '', years: 5, monthly: defMonthly, payments: [] };
    }
    if (!db[name].payments) db[name].payments = [];
    return db[name];
  }

  /* ---- 日付ヘルパー ---- */
  function pd(str) { if (!str) return null; var t = new Date(String(str).replace(/\//g, '-') + 'T00:00:00'); return isNaN(t) ? null : t; }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmt(d) { return d ? (d.getFullYear() + '/' + p2(d.getMonth() + 1) + '/' + p2(d.getDate())) : '—'; }
  function toInput(d) { return d ? (d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())) : ''; }
  function addYears(d, y) { if (!d) return null; var n = new Date(d.getTime()); n.setFullYear(n.getFullYear() + (Number(y) || 0)); return n; }
  function monthsBetween(a, b) { if (!a || !b) return 0; var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m -= 1; return m; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ---- 計算 ---- */
  function calc(r, atDate) {
    var monthly = Number(r.monthly) || 0;
    var years = Number(r.years) || 0;
    var totalMonths = years * 12;
    var contractTotal = monthly * totalMonths;
    var paid = (r.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    var join = pd(r.joinDate);
    var expire = addYears(join, years);
    var ref = atDate || new Date();
    var elapsed = join ? clamp(monthsBetween(join, ref), 0, totalMonths) : 0;
    var scheduled = monthly * elapsed;               // 今日(基準日)までに積み立てているべき額
    var arrears = Math.max(scheduled - paid, 0);      // 未収（滞納）
    var prepaid = Math.max(paid - scheduled, 0);      // 前受
    var remainMonths = totalMonths - elapsed;
    var remainSchedule = monthly * remainMonths;      // 残り期間の積立予定
    var lumpSum = Math.max(contractTotal - paid, 0);  // 解約時一括請求（＝未払い残高）
    var progress = contractTotal > 0 ? clamp(paid / contractTotal, 0, 1) : 0;
    return {
      monthly: monthly, years: years, totalMonths: totalMonths, contractTotal: contractTotal,
      paid: paid, join: join, expire: expire, elapsed: elapsed, scheduled: scheduled,
      arrears: arrears, prepaid: prepaid, remainMonths: remainMonths, remainSchedule: remainSchedule,
      lumpSum: lumpSum, progress: progress
    };
  }

  /* ---- 全加盟店サマリー ---- */
  function renderOverview() {
    var body = document.getElementById('ovBody');
    body.innerHTML = stores.map(function (s) {
      var r = rec(s.name); var c = calc(r);
      var pct = Math.round(c.progress * 100);
      return '<tr data-name="' + esc(s.name) + '"' + (s.name === curName ? ' class="sel"' : '') + '>' +
        '<td>🏪 ' + esc(s.name) + '</td>' +
        '<td>' + (c.join ? fmt(c.join) : '<span style="color:#c00">未設定</span>') + '</td>' +
        '<td class="num">' + yen(c.monthly) + '</td>' +
        '<td>' + (c.years || '—') + '年</td>' +
        '<td class="num">' + yen(c.contractTotal) + '</td>' +
        '<td class="num">' + yen(c.paid) + '</td>' +
        '<td class="num ov-remain">' + yen(c.lumpSum) + '</td>' +
        '<td><span class="ov-bar"><span style="width:' + pct + '%"></span></span>' + pct + '%</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8" class="pay-empty">加盟店がありません（加盟店管理で追加してください）</td></tr>';
  }

  /* ---- 詳細 ---- */
  function selectStore(name) {
    curName = name;
    document.getElementById('detail').hidden = false;
    var sel = document.getElementById('storeSel');
    sel.value = name;
    var r = rec(name);
    document.getElementById('pdName').textContent = '🏪 ' + name;
    document.getElementById('cJoin').value = toInput(pd(r.joinDate));
    document.getElementById('cYears').value = r.years || '';
    document.getElementById('cMonthly').value = r.monthly || '';
    // 契約書 補足フィールド
    var s0 = stores.filter(function (x) { return x.name === name; })[0] || {};
    document.getElementById('aAddr').value = r.addr || s0.area || '';
    document.getElementById('aRep').value = r.rep || r.manager || s0.manager || '';
    document.getElementById('aInitFee').value = (r.initFee != null ? r.initFee : '');
    document.getElementById('aRenewal').value = r.renewal || '1年ごとに自動更新';
    document.getElementById('aPenalty').value = r.penalty || 'なし';
    document.getElementById('aCourt').value = r.court || '福島地方裁判所いわき支部';
    document.getElementById('aPayday').value = r.payday || '末日';
    var cd = document.getElementById('cancelDate');
    if (!cd.value) cd.value = toInput(new Date());
    renderDetail();
    renderOverview();
  }

  function renderDetail() {
    if (!curName) return;
    var r = rec(curName); var c = calc(r);
    document.getElementById('cExpire').value = fmt(c.expire);

    // サマリーカード
    document.getElementById('summary').innerHTML =
      card('契約総額', yen(c.contractTotal), yen(c.monthly) + ' × ' + c.totalMonths + 'ヶ月') +
      card('既払い（積立累計）', yen(c.paid), (r.payments || []).length + '回の入金', 'paid') +
      card('残額（未払い）', yen(c.lumpSum), '契約総額 − 既払い', 'remain') +
      card('滞納/前受', (c.arrears > 0 ? '−' + yen(c.arrears) : (c.prepaid > 0 ? '+' + yen(c.prepaid) : '±0')),
        (c.arrears > 0 ? '未収あり' : (c.prepaid > 0 ? '前受あり' : '予定どおり'))) +
      '<div class="sum-progress"><div class="pmeta"><span>進捗 ' + Math.round(c.progress * 100) + '%（経過 ' + c.elapsed + '/' + c.totalMonths + 'ヶ月）</span><span>' + yen(c.paid) + ' / ' + yen(c.contractTotal) + '</span></div>' +
        '<div class="pbar"><span style="width:' + Math.round(c.progress * 100) + '%"></span></div></div>';

    renderCancel();
    renderHistory();
  }
  function card(lbl, val, sub, cls) {
    return '<div class="sum-card' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="sub">' + (sub || '') + '</div></div>';
  }

  function renderCancel() {
    var r = rec(curName);
    var cd = pd(document.getElementById('cancelDate').value) || new Date();
    var c = calc(r, cd);
    document.getElementById('cancelResult').innerHTML =
      '<div class="cancel-box">' +
        '<div class="lbl" style="font-size:12px;color:#7a4c48;font-weight:700;">解約日時点の一括請求額</div>' +
        '<div class="big">' + yen(c.lumpSum) + '</div>' +
        '<div class="desc">' +
          '契約満了：' + fmt(c.expire) + '（全' + c.totalMonths + 'ヶ月）／解約日時点の経過：' + c.elapsed + 'ヶ月<br>' +
          '内訳：残り期間の積立 ' + c.remainMonths + 'ヶ月 × ' + yen(c.monthly) + ' ＝ ' + yen(c.remainSchedule) +
          (c.arrears > 0 ? '　＋　未収（滞納）' + yen(c.arrears) : '') + '<br>' +
          '＝ 契約総額 ' + yen(c.contractTotal) + ' − 既払い ' + yen(c.paid) + ' ＝ <b>' + yen(c.lumpSum) + '</b>' +
        '</div>' +
      '</div>';
  }

  function renderHistory() {
    var r = rec(curName);
    var list = (r.payments || []).slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var run = 0;
    var body = document.getElementById('payBody');
    if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="pay-empty">まだ入金記録はありません。</td></tr>'; return; }
    body.innerHTML = list.map(function (p) {
      run += Number(p.amount) || 0;
      return '<tr>' +
        '<td>' + esc(p.date || '') + '</td>' +
        '<td class="num">' + yen(p.amount) + '</td>' +
        '<td class="num">' + yen(run) + '</td>' +
        '<td>' + esc(p.memo || '') + '</td>' +
        '<td><button class="pay-del" data-id="' + esc(p.id) + '">削除</button></td>' +
        '</tr>';
    }).join('');
  }

  /* ---- イベント ---- */
  // オーバービュー行クリックで選択
  document.getElementById('ovBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-name]'); if (!tr) return;
    selectStore(tr.getAttribute('data-name'));
    document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // ストア切替
  document.getElementById('storeSel').addEventListener('change', function () { selectStore(this.value); });

  // 契約設定の変更を保存
  function bindContract(id, key, isNum) {
    document.getElementById(id).addEventListener('change', function () {
      if (!curName) return;
      var r = rec(curName);
      r[key] = isNum ? (Number(this.value) || 0) : this.value;
      save(); renderDetail(); renderOverview();
    });
  }
  bindContract('cJoin', 'joinDate', false);
  bindContract('cYears', 'years', true);
  bindContract('cMonthly', 'monthly', true);
  bindContract('aAddr', 'addr', false);
  bindContract('aRep', 'rep', false);
  bindContract('aInitFee', 'initFee', true);
  bindContract('aRenewal', 'renewal', false);
  bindContract('aPenalty', 'penalty', false);
  bindContract('aCourt', 'court', false);
  bindContract('aPayday', 'payday', false);
  document.getElementById('cancelDate').addEventListener('change', renderCancel);

  /* ---- 加盟店契約書の発行（A4印刷） ---- */
  document.getElementById('btnAgreement').addEventListener('click', function () {
    if (!curName) { alert('加盟店を選択してください'); return; }
    printAgreement();
  });

  // 本部（甲）情報
  var HQ_INFO = {
    company: '合同会社アイズ（BUYMO本部）',
    addr: '〒979-0204 福島県いわき市四倉町細谷字大町1番',
    rep: '代表社員　吉田 一平'
  };

  function printAgreement() {
    var r = rec(curName); var c = calc(r);
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var addr = v('aAddr'), rep = v('aRep'), renewal = v('aRenewal') || '1年ごとに自動更新',
        penalty = v('aPenalty') || 'なし', court = v('aCourt') || '福島地方裁判所いわき支部',
        payday = v('aPayday') || '末日', territory = v('aTerritory');
    var initFee = Number(v('aInitFee')) || 0;
    var today = fmt(new Date());
    var FEES = (window.HQ && HQ.FEES) || { auctionSystemFee: 5000, directHqFee: 30000, auctionRate: 0.05 };
    var aucRate = Math.round((FEES.auctionRate || 0.05) * 100);
    var OL = function (items) { return '<ol class="ag-ol"><li>' + items.join('</li><li>') + '</li></ol>'; };

    // 条項（自動採番）: [条名, 本文HTML]
    var arts = [
      ['目的',
        '本契約は、甲（' + esc(HQ_INFO.company) + '）が運営する自動車買取・販売サービス「BUYMO」のフランチャイズ・システム（以下「本システム」という。）を、乙（' + esc(curName) + '）が利用して加盟店事業（自動車の買取及びオートオークション等を通じた売却。以下「本事業」という。）を行うにあたり、甲乙間の権利義務を定めることを目的とする。'],
      ['定義',
        '本契約において、次の各号の用語は、それぞれ当該各号に定める意味を有する。' +
        OL([
          '「本部アカウント」とは、甲が保有するオートオークションの会員資格（ID・パスワードその他の認証情報を含む。）をいう。',
          '「オークション取引」とは、乙が本部アカウントを利用して行う出品・入札・落札・売却・キャンセルその他一切の取引をいう。',
          '「クレーム」とは、買取又は売却に関し、顧客・購入者・落札者その他の第三者から乙又は甲に対してなされる苦情、返品・キャンセルの請求、契約不適合（瑕疵）の主張、損害賠償請求その他一切の紛争をいう。',
          '「本商圏」とは、第4条に定める乙の営業区域をいう。'
        ])],
      ['加盟店事業・許諾の範囲',
        '甲は、乙に対し、本契約の有効期間中、本商圏において本システムを利用して本事業を行う非独占的でない（本商圏においては第4条に従い独占的な）権利を許諾する。乙は、甲の定める運営マニュアル、料金表及び業務ルール（以下「本ルール」という。）を遵守して本事業を遂行する。乙は独立の事業者であり、本契約は甲乙間に雇用・代理・組合・パートナーシップの関係を生じさせるものではない。'],
      ['営業区域・商圏（重複の禁止）',
        '甲は、乙に対し、下記の営業区域における BUYMO加盟店としての営業権を付与する。' +
        '<div class="ag-inset">加盟店名（乙）：<b>' + esc(curName) + '</b><br>本商圏（営業区域）：<b>' + esc(territory || '（別途書面により定める区域）') + '</b></div>' +
        OL([
          '甲は、乙の書面による事前の承諾がない限り、本商圏と重複する区域について、他の加盟店に対し本事業の営業権を付与しない（商圏の重複を認めない）。',
          '乙は、原則として本商圏内において営業活動を行う。本商圏外の顧客に対応する必要が生じた場合は、事前に甲及び当該区域を担当する加盟店と調整するものとする。',
          '甲は、市場環境の変化その他合理的な理由があるときは、乙に対し30日前までに書面で通知したうえ、乙と協議して本商圏を変更することができる。'
        ])],
      ['契約期間・更新',
        '本契約の契約期間は、契約開始日を <b>' + fmt(c.join) + '</b> とし、<b>' + (c.years || '—') + '年間</b>（契約満了日：<b>' + fmt(c.expire) + '</b>）とする。期間満了の際は、' + esc(renewal) + 'により更新される。'],
      ['加盟金',
        (initFee > 0
          ? '乙は、本契約締結時に、加盟金として金 <b>' + yen(initFee) + '</b>（税込）を甲の指定する方法により支払う。加盟金は、理由の如何を問わず返還しない。'
          : '本契約における加盟金（初期費用）は発生しない。')],
      ['月額費用・積立',
        '乙は、甲に対し、本契約期間中、月額 <b>' + yen(c.monthly) + '</b>（税込）を、毎月 <b>' + esc(payday) + '</b> までに甲の指定する口座へ支払う。契約期間全体の支払総額は <b>' + yen(c.contractTotal) + '</b>（' + yen(c.monthly) + ' × ' + c.totalMonths + 'ヶ月）となる。振込手数料は乙の負担とする。'],
      ['中途解約',
        '乙が契約期間の途中で本契約を解約する場合、乙は、解約時点における残存期間分（残存月数 × 月額）に相当する額を、違約金として一括して甲に支払う。すなわち、契約支払総額から既払金を控除した残額（＝ 契約総額 − 既払金）を、解約日から10日以内に甲の指定する口座へ一括して支払う。既に支払われた金員は返還しない。' +
        (penalty && penalty !== 'なし' ? '　なお、前記に加え、別途違約金として ' + esc(penalty) + ' を申し受ける。' : '')],
      ['オークション会員資格（本部アカウント）の貸与及び管理',
        OL([
          '甲は、乙が本事業のうちオートオークションを通じた売却業務を行うため、本部アカウントの利用を乙に許諾する。乙は、本部アカウントを本事業の目的の範囲内でのみ利用し、オークション主催者の会員規約及び本ルールを遵守する。',
          '乙は、本部アカウントの認証情報を善良な管理者の注意をもって管理し、第三者に開示・貸与・漏洩してはならない。乙の管理不十分により甲又は第三者に損害が生じたときは、乙がこれを賠償する。',
          '本部アカウントを通じて乙が行ったオークション取引の結果（落札・売却・キャンセル・違約金等を含む。）は、すべて乙に帰属し、乙がその責任を負う。乙は、オークション主催者に対する債務についても、甲を免責し、自らの責任と負担において履行する。'
        ])],
      ['オークション取引の売上精算',
        OL([
          '乙が本部アカウントを通じて車両を売却したときは、甲は、売却代金（落札額）から本部手数料（システム利用料 <b>' + yen(FEES.auctionSystemFee) + '</b>／件及び成約手数料＝粗利の <b>' + aucRate + '％</b>）並びに陸送費・保管費等の実費を控除した残額を、乙の取り分として乙に支払う。',
          '甲の販路を利用した売却（直販）の場合、本部手数料は一律 <b>' + yen(FEES.directHqFee) + '</b>（税抜）とする。',
          '本部手数料及び実費の額は、甲が別途定める料金表によるものとし、経済情勢等に応じて改定されることがある。改定は乙への事前通知をもって効力を生じる。'
        ])],
      ['クレーム対応及び利益返還時の精算',
        '乙が本部アカウントを利用して行ったオークション取引その他の売却取引に関しクレームが生じた場合の対応及び費用負担は、次の各号による。' +
        OL([
          '<b>一次対応</b>：クレームの初動対応（受付、事実確認、相手方への一次連絡等）は、甲が行う。',
          '<b>二次対応</b>：一次対応の後の具体的な解決対応は、乙の判断と責任において行う。乙は、甲と協議のうえ、誠実かつ迅速に対応しなければならない。',
          '<b>利益返還を要する場合</b>：クレームの解決のために、売買代金の全部若しくは一部の返還、減額、修補費用の負担又は損害賠償その他の金銭的負担（以下「返還等」という。）が必要となったときは、乙がこれに対応し、その費用を負担する。',
          '<b>精算方法</b>：前号の場合、甲が当該取引について既に収受していた本部手数料等は、甲が乙に対して返還（現状への復帰）する。その上で、返還等に要する金員、ペナルティ費用並びに陸送費・保管費・再出品費その他の付随費用は、すべて乙の負担とする。したがって、乙が最終的に負担すべき額は、〔返還等の額 ＋ ペナルティ費用 ＋ 付随費用〕から〔甲が返還する本部手数料等〕を差し引いた額とし、既に乙へ支払われた売却利益をこれに充当し、なお不足があるときは、乙は甲の指定する期日までにこれを支払う。',
          '<b>乙不対応の場合</b>：乙が正当な理由なく二次対応又は返還等を行わないときは、甲は乙に代わってこれを行うことができ、甲がこれに要した一切の費用及び甲に生じた損害を乙に求償できる。'
        ])],
      ['乙の遵守事項',
        '乙は、本事業の遂行にあたり、次の各号を遵守する。' +
        OL([
          '古物営業法その他関係法令並びに本ルールを遵守し、必要な許認可（古物商許可等）を自らの責任で取得・維持すること。',
          '買取及び売却に際し、顧客・取引先に対して正確な説明を行い、甲又はBUYMOの信用を損なう行為をしないこと。',
          '甲の求めに応じ、案件・売却・クレーム対応等の状況を速やかに報告すること。'
        ])],
      ['商標・システム・ノウハウの利用',
        '乙は、本契約に基づき甲が許諾する範囲でのみ「BUYMO」の商標・ロゴ・システム・ノウハウを使用できる。乙は、これらに関する権利が甲に帰属することを確認し、契約終了後は直ちに使用を中止し、甲から貸与された資料・データ・アカウント等を返却又は廃棄する。'],
      ['秘密保持・個人情報・古物営業法の遵守',
        OL([
          '甲乙は、本契約を通じて知り得た相手方の営業上・技術上の秘密及び顧客情報を、契約期間中及び契約終了後も第三者に開示・漏洩してはならない。',
          '乙は、業務上取り扱う顧客の個人情報を、個人情報保護法その他関係法令及び甲の定める方針に従い適正に管理し、目的外に利用してはならない。',
          '乙は、古物営業法に基づく本人確認・帳簿記録等の義務を適正に履行する。'
        ])],
      ['競業避止義務',
        '乙は、本契約期間中及び本契約終了後1年間、甲の書面による事前の承諾なく、BUYMOと競合する自動車買取・売却事業を、自ら又は第三者を通じて行ってはならない。'],
      ['反社会的勢力の排除・表明保証',
        '甲乙は、自ら及び自らの役員等が暴力団その他の反社会的勢力でないこと、及び反社会的勢力と一切の関係を有しないことを表明し、将来にわたりこれを確約する。これに反することが判明した場合、相手方は何らの催告なく直ちに本契約を解除でき、これにより解除された当事者は相手方に生じた損害を賠償する。'],
      ['契約違反・ペナルティ・損害賠償',
        '乙が本契約若しくは本ルールに違反し、又は甲の信用を毀損する行為を行った場合、甲は相当の期間を定めて是正を勧告できる。期間内に是正されないときは、甲は本契約を解除し、第8条を準用して残存期間分の一括請求をし、併せて損害賠償（弁護士費用を含む。）を請求できる。甲又は乙が本契約に違反し相手方に損害を与えたときも同様に賠償の責任を負う。'],
      ['契約解除',
        '甲は、乙が次の各号のいずれかに該当したときは、催告のうえ（第3号・第4号は催告を要しない。）本契約を解除できる。この場合も中途解約に関する条項を準用する。' +
        OL([
          '月額費用その他の支払を2ヶ月以上遅滞したとき。',
          '本契約又は本ルールに重大な違反をしたとき。',
          '差押・仮差押・破産・民事再生等の申立てがあったとき。',
          '反社会的勢力に該当することが判明したとき。'
        ])],
      ['不可抗力',
        '天災地変、法令の改廃、オークション主催者のシステム障害その他甲乙の責めに帰さない事由により本契約上の義務の全部又は一部を履行できない場合、当該当事者は当該不履行につき責任を負わない。ただし、既に発生した金銭債務の履行を免れない。'],
      ['権利義務の譲渡禁止・存続条項',
        '乙は、甲の事前の書面による承諾なく、本契約上の地位又は権利義務を第三者に譲渡・貸与・担保提供してはならない。第11条（クレーム対応）、第14条（秘密保持・個人情報）、第15条（競業避止）及び本条は、本契約終了後もなお有効に存続する。'],
      ['準拠法・協議・合意管轄',
        '本契約は日本法を準拠法とする。本契約に定めのない事項及び疑義が生じた事項は、甲乙誠実に協議して解決する。協議が調わないときは、<b>' + esc(court) + '</b> を第一審の専属的合意管轄裁判所とする。']
    ];
    var art = arts.map(function (x, i) { return a('第' + (i + 1) + '条（' + x[0] + '）', x[1]); });

    // 契約条件サマリー（要点一覧）
    var summaryTable =
      '<table class="ag-summary"><tr><th colspan="2">契約条件のまとめ</th></tr>' +
      '<tr><td class="lbl">加盟店（乙）</td><td>' + esc(curName) + '</td></tr>' +
      '<tr><td class="lbl">営業区域・商圏</td><td>' + esc(territory || '（別途書面により定める）') + '（重複付与なし）</td></tr>' +
      '<tr><td class="lbl">契約期間</td><td>' + fmt(c.join) + ' 〜 ' + fmt(c.expire) + '（' + (c.years || '—') + '年 / ' + c.totalMonths + 'ヶ月）</td></tr>' +
      '<tr><td class="lbl">加盟金</td><td>' + (initFee > 0 ? yen(initFee) + '（税込・返還なし）' : 'なし') + '</td></tr>' +
      '<tr><td class="lbl">月額費用</td><td>' + yen(c.monthly) + '（税込）／毎月 ' + esc(payday) + ' 支払</td></tr>' +
      '<tr><td class="lbl">支払総額</td><td>' + yen(c.contractTotal) + '</td></tr>' +
      '<tr><td class="lbl">中途解約時</td><td>残存期間分を一括請求（＝契約総額 − 既払金）</td></tr>' +
      '<tr><td class="lbl">オークション手数料</td><td>システム利用料 ' + yen(FEES.auctionSystemFee) + '／件 ＋ 成約手数料（粗利×' + aucRate + '％）</td></tr>' +
      '<tr><td class="lbl">クレーム対応</td><td>一次＝本部／二次＝加盟店。利益返還時は本部手数料を返還し、返還額・ペナルティ等は加盟店負担</td></tr>' +
      '<tr><td class="lbl">更新</td><td>' + esc(renewal) + '</td></tr>' +
      '</table>';

    var body =
      '<div class="doc-title-main">加盟店契約書（フランチャイズ契約書）</div>' +
      '<p class="ag-lead">' + esc(HQ_INFO.company) + '（以下「甲」という。）と ' + esc(curName) + '（以下「乙」という。）は、BUYMO加盟店事業に関し、以下のとおり契約（以下「本契約」という。）を締結する。</p>' +
      '<table class="ag-parties"><tr><td class="lbl">甲（本部）</td><td>' + esc(HQ_INFO.company) + '<br>' + esc(HQ_INFO.addr) + '<br>' + esc(HQ_INFO.rep) + '</td></tr>' +
      '<tr><td class="lbl">乙（加盟店）</td><td>' + esc(curName) + '<br>' + esc(addr || '（住所）') + '<br>代表者：' + esc(rep || '　　　　　') + '</td></tr></table>' +
      summaryTable +
      art.join('') +
      '<p class="ag-close">本契約の成立を証するため、本書2通を作成し、甲乙記名押印のうえ各1通を保有する。</p>' +
      '<p class="ag-date">' + today + '</p>' +
      '<table class="ag-sign"><tr>' +
      '<td><div class="sh">甲（本部）</div>' + esc(HQ_INFO.company) + '<br><br>住所：' + esc(HQ_INFO.addr) + '<br><br>代表者：　　　　　　　　　　㊞</td>' +
      '<td><div class="sh">乙（加盟店）</div>' + esc(curName) + '<br><br>住所：' + esc(addr || '') + '<br><br>代表者：　　　　　　　　　　㊞</td>' +
      '</tr></table>';

    printWin('加盟店契約書 - ' + curName, body);
  }

  function a(title, text) { return '<div class="ag-art"><div class="ag-art-t">' + title + '</div><div class="ag-art-b">' + text + '</div></div>'; }

  function printWin(title, bodyHtml) {
    var w = window.open('', '_blank');
    if (!w) { alert('ポップアップがブロックされました。ポップアップを許可してください。'); return; }
    var css =
      '@page{size:A4;margin:16mm 15mm;}' +
      '*{box-sizing:border-box;} body{font-family:"Noto Sans JP","Yu Gothic",sans-serif;color:#111;line-height:1.85;font-size:10.5pt;margin:0;}' +
      '.doc-title-main{text-align:center;font-size:17pt;font-weight:900;letter-spacing:.1em;margin:0 0 16px;}' +
      '.ag-lead{font-size:10pt;margin:0 0 12px;}' +
      '.ag-parties{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:10pt;}' +
      '.ag-parties td{border:1px solid #333;padding:8px 10px;vertical-align:top;}' +
      '.ag-parties .lbl{width:110px;background:#f0f0f0;font-weight:700;white-space:nowrap;}' +
      '.ag-summary{width:100%;border-collapse:collapse;margin:0 0 16px;font-size:9.5pt;}' +
      '.ag-summary th{border:1px solid #333;padding:6px 10px;background:#0F766E;color:#fff;text-align:left;font-size:10pt;}' +
      '.ag-summary td{border:1px solid #333;padding:6px 10px;}' +
      '.ag-summary .lbl{width:110px;background:#f4f6f6;font-weight:700;white-space:nowrap;}' +
      '.ag-art{margin:0 0 9px;page-break-inside:avoid;}' +
      '.ag-art-t{font-weight:900;font-size:10.5pt;margin-bottom:2px;}' +
      '.ag-art-b{font-size:10pt;text-align:justify;}' +
      '.ag-ol{margin:3px 0 0;padding-left:1.5em;}' +
      '.ag-ol li{margin-bottom:3px;text-align:justify;}' +
      '.ag-inset{border:1px solid #333;background:#f7f9f9;padding:6px 10px;margin:5px 0;font-size:9.5pt;}' +
      '.ag-close{margin:16px 0 4px;font-size:10pt;}' +
      '.ag-date{text-align:right;margin:6px 0 18px;font-size:10pt;}' +
      '.ag-close,.ag-date,.ag-sign{page-break-inside:avoid;}' +
      '.ag-sign{width:100%;border-collapse:collapse;font-size:10pt;}' +
      '.ag-sign td{border:1px solid #333;padding:12px 12px 22px;width:50%;vertical-align:top;}' +
      '.ag-sign .sh{font-weight:900;margin-bottom:10px;}' +
      '@media print{.noprint{display:none;}}' +
      '.noprint{position:fixed;top:10px;right:10px;}' +
      '.noprint button{padding:8px 16px;font-size:13px;font-weight:700;border:none;border-radius:6px;background:#0F766E;color:#fff;cursor:pointer;margin-left:6px;}';
    w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + css + '</style></head><body>' +
      '<div class="noprint"><button onclick="window.print()">印刷 / PDF保存</button><button onclick="window.close()" style="background:#888;">閉じる</button></div>' +
      bodyHtml + '</body></html>');
    w.document.close();
  }

  // 入金追加
  document.getElementById('payAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!curName) return;
    var date = document.getElementById('pDate').value;
    var amount = Number(document.getElementById('pAmount').value) || 0;
    var memo = document.getElementById('pMemo').value.trim();
    if (!date || amount <= 0) { alert('入金日と金額を入力してください'); return; }
    var r = rec(curName);
    r.payments.push({ id: 'PM-' + Date.now(), date: date, amount: amount, memo: memo });
    save(); renderDetail(); renderOverview();
    this.reset();
  });

  // 入金削除
  document.getElementById('payBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.pay-del'); if (!btn) return;
    if (!confirm('この入金記録を削除しますか？')) return;
    var id = btn.getAttribute('data-id');
    var r = rec(curName);
    r.payments = r.payments.filter(function (p) { return p.id !== id; });
    save(); renderDetail(); renderOverview();
  });

  /* ---- CSV出力（全加盟店の入金明細） ---- */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  document.getElementById('btnCsv').addEventListener('click', function () {
    var rows = [['加盟店', '加盟日', '契約年数', '月額', '契約総額', '既払い', '残額(解約一括請求)', '入金日', '入金額', 'メモ']];
    stores.forEach(function (s) {
      var r = rec(s.name); var c = calc(r);
      var ps = (r.payments || []).slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
      if (!ps.length) {
        rows.push([s.name, fmt(c.join), c.years, c.monthly, c.contractTotal, c.paid, c.lumpSum, '', '', '']);
      } else {
        ps.forEach(function (p, i) {
          rows.push([i === 0 ? s.name : '', i === 0 ? fmt(c.join) : '', i === 0 ? c.years : '',
            i === 0 ? c.monthly : '', i === 0 ? c.contractTotal : '', i === 0 ? c.paid : '', i === 0 ? c.lumpSum : '',
            p.date, p.amount, p.memo || '']);
        });
      }
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var d = new Date(); var a = document.createElement('a');
    a.href = url; a.download = 'buymo-payments-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---- 初期化 ---- */
  (function init() {
    var sel = document.getElementById('storeSel');
    sel.innerHTML = stores.map(function (s) { return '<option>' + esc(s.name) + '</option>'; }).join('');
    renderOverview();
    // URLの ?store=店名 があればその加盟店を選択（加盟店管理からの導線）
    var want = '';
    try { want = decodeURIComponent((location.search.match(/[?&]store=([^&]+)/) || [])[1] || ''); } catch (e) {}
    var found = stores.filter(function (s) { return s.name === want; })[0];
    if (found) selectStore(found.name);
    else if (stores.length) selectStore(stores[0].name);
  })();
})();
