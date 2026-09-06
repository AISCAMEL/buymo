/* 加盟店 書類・情報（契約書/免許証/保証人/古物商）を1社ずつ管理
   ・機密画像/PDFはシステムに保存せず、Google Drive等の共有リンクで管理
   ・入力は自動保存（localStorage＋GAS 加盟店書類シート） */
(function () {
  HQ.nav('hqNav');
  var storeSel = document.getElementById('docStore');
  var msg = document.getElementById('docMsg');
  var updated = document.getElementById('docUpdated');
  var inputs = Array.prototype.slice.call(document.querySelectorAll('[data-sec][data-k]'));
  var opens = Array.prototype.slice.call(document.querySelectorAll('.doc-open'));
  var cur = '';          // 現在選択中の加盟店名
  var data = {};         // 現在の書類データ
  var timer = null;

  /* 加盟店セレクトを構築 */
  var stores = HQ.getStores() || [];
  if (!stores.length) {
    storeSel.innerHTML = '<option value="">（加盟店が未登録です）</option>';
  } else {
    storeSel.innerHTML = stores.map(function (s) {
      return '<option value="' + HQ.esc(s.name) + '">' + HQ.esc(s.name) + '</option>';
    }).join('');
  }

  /* URLパラメータ ?store=NAME を初期選択 */
  var qs = new URLSearchParams(location.search);
  var want = qs.get('store') || '';
  if (want && stores.some(function (s) { return s.name === want; })) storeSel.value = want;

  /* ネスト値の getter/setter（"license.frontUrl" 形式） */
  function val(sec, k) { return (data[sec] && data[sec][k]) ? data[sec][k] : ''; }
  function setVal(sec, k, v) { if (!data[sec]) data[sec] = {}; data[sec][k] = v; }

  /* 画面へ反映 */
  function render() {
    inputs.forEach(function (el) {
      el.value = val(el.getAttribute('data-sec'), el.getAttribute('data-k'));
    });
    opens.forEach(function (a) {
      var path = (a.getAttribute('data-open') || '').split('.');
      var u = val(path[0], path[1]);
      if (u) { a.href = u; a.classList.add('ready'); }
      else { a.removeAttribute('href'); a.classList.remove('ready'); }
    });
    updated.textContent = data.updated ? ('最終更新：' + data.updated) : '';
  }

  /* 読み込み */
  function load() {
    cur = storeSel.value;
    data = {};
    if (!cur) { render(); return; }
    msg.textContent = '読み込み中…';
    HQ.loadPartnerDocs(cur, function (d) {
      data = (d && typeof d === 'object') ? d : {};
      msg.textContent = '';
      render();
    });
  }

  /* 保存（500ms デバウンス） */
  function scheduleSave() {
    if (!cur) return;
    clearTimeout(timer);
    msg.textContent = '保存中…';
    timer = setTimeout(function () {
      data.updated = new Date().toLocaleString('ja-JP');
      HQ.savePartnerDocs(cur, data);
      updated.textContent = '最終更新：' + data.updated;
      msg.textContent = '✓ 保存しました';
      setTimeout(function () { msg.textContent = ''; }, 1600);
    }, 500);
  }

  /* 入力イベント */
  inputs.forEach(function (el) {
    el.addEventListener('input', function () {
      setVal(el.getAttribute('data-sec'), el.getAttribute('data-k'), el.value.trim());
      // URLフィールドはリンクの活性状態も即時更新
      opens.forEach(function (a) {
        var path = (a.getAttribute('data-open') || '').split('.');
        if (path[0] === el.getAttribute('data-sec') && path[1] === el.getAttribute('data-k')) {
          var u = el.value.trim();
          if (u) { a.href = u; a.classList.add('ready'); }
          else { a.removeAttribute('href'); a.classList.remove('ready'); }
        }
      });
      scheduleSave();
    });
  });

  storeSel.addEventListener('change', load);
  load();
})();
