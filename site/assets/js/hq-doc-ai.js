/* 書類発行：書類の写真・PDF を AI で読み取って、書類の入力欄に転記する（本部のみ・AI業務.gs）
   車検証 → お名前（所有者）・住所・車名・型式・年式・車台番号・ナンバー
   印鑑証明・免許証 → お名前・住所（車検証の所有者と合っているかも確かめる） */
(function () {
  'use strict';
  var box = document.getElementById('docAi');
  if (!box) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var last = {};   // 読み取った書類（種類ごと）
  // 読み取った項目 → 書類の入力欄
  var MAP = {
    shaken: {
      owner_name: ['docName', 'ctKoName', 'bbName'], owner_addr: ['docAddress', 'ctKoAddr', 'bbAddr'],
      vin: ['docVin', 'ctVin', 'bbVin'], plate: ['docPlate', 'ctPlate', 'bbPlate'],
      carname: ['ctCarName', 'bbCarName'], model_code: ['ctCarType', 'bbCarType'], first_reg: ['ctCarYear', 'bbCarYear'], mileage: ['ctMileage', 'bbMileage']
    },
    inkan: { name: ['docName', 'ctKoName', 'bbName'], addr: ['docAddress', 'ctKoAddr', 'bbAddr'] },
    license: { name: ['docName', 'ctKoName', 'bbName'], addr: ['docAddress', 'ctKoAddr', 'bbAddr'] },
    other: { name: ['docName'], addr: ['docAddress'] }
  };
  function wait(n) {
    if (window.HQAI) { box.hidden = false; return; }
    if (n < 50) setTimeout(function () { wait(n + 1); }, 100);
  }
  wait(0);
  var file = document.getElementById('docAiFile'), kindSel = document.getElementById('docAiKind'), out = document.getElementById('docAiOut');
  function norm(s) { return String(s || '').replace(/[\s　]/g, ''); }
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    out.innerHTML = '<p class="dai-busy">🤖 読み取っています…（10〜30秒）</p>';
    HQAI.readDoc(f, kindSel.value).then(function (d) {
      file.value = '';
      if (!d || !d.ok) { out.innerHTML = '<p class="dai-err">⚠ ' + esc(HQAI.errText(d)) + '</p>'; return; }
      if (d.kind === 'shaken') d.fields.carname = [d.fields.maker, d.fields.model].filter(String).join(' ');
      last[d.kind] = d;
      show(d);
    });
  });
  function show(d) {
    var map = MAP[d.kind] || {};
    var names = Object.assign({ carname: '車名（メーカー＋車種）' }, d.names);
    var keys = Object.keys(d.fields).concat(d.kind === 'shaken' ? ['carname'] : []).filter(function (k, i, a) { return a.indexOf(k) === i && d.fields[k]; });
    var warn = [];
    if (d.kind === 'shaken' && d.fields.user_name && d.fields.owner_name && norm(d.fields.user_name) !== norm(d.fields.owner_name))
      warn.push('所有者（' + d.fields.owner_name + '）と使用者（' + d.fields.user_name + '）が違います。ローン会社やディーラーの名義なら、所有権解除の書類が必要です。');
    var sk = last.shaken && last.shaken.fields;
    if (d.kind !== 'shaken' && sk && sk.owner_name && d.fields.name && norm(sk.owner_name) !== norm(d.fields.name))
      warn.push('車検証の所有者（' + sk.owner_name + '）と、この書類のお名前（' + d.fields.name + '）が違います。名義を確認してください。');
    if (d.kind !== 'shaken' && sk && sk.owner_addr && d.fields.addr && norm(sk.owner_addr) !== norm(d.fields.addr))
      warn.push('車検証の住所と、この書類の住所が違います。引っ越しされている場合は、住民票（つながりがわかるもの）が必要です。');
    if (d.unclear && d.unclear.length) warn.push('読みにくかった項目：' + d.unclear.map(function (k) { return names[k] || k; }).join('、') + '（写真と見比べてください）');
    out.innerHTML = '<div class="dai-res"><b>📄 ' + esc(d.label) + '</b>' +
      (warn.length ? '<ul class="dai-warn">' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
      '<table class="dai-tbl">' + keys.map(function (k) {
        var to = map[k];
        return '<tr><td>' + (to ? '<input type="checkbox" data-k="' + k + '" checked>' : '') + '</td><th>' + esc(names[k] || k) + '</th><td><input type="text" data-v="' + k + '" value="' + esc(d.fields[k]) + '"></td></tr>';
      }).join('') + '</table>' +
      (d.note ? '<p class="dai-note">' + esc(d.note) + '</p>' : '') +
      '<div class="dai-btns"><button type="button" class="doc-btn" id="docAiApply">✓ チェックした項目を書類に入れる</button>' +
      '<button type="button" class="doc-btn outline" id="docAiNote">📝 案件のメモに残す</button></div>' +
      '<p class="dai-hint">内容は必ず書類の写真と見比べてください。入れたあとも、下の入力欄で直せます。</p></div>';
    document.getElementById('docAiApply').addEventListener('click', function () {
      var n = 0;
      out.querySelectorAll('[data-k]').forEach(function (c) {
        if (!c.checked) return;
        var k = c.getAttribute('data-k'), v = out.querySelector('[data-v="' + k + '"]').value.trim();
        (map[k] || []).forEach(function (id) {
          var el = document.getElementById(id);
          if (el && v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); n++; }
        });
      });
      this.textContent = '✓ ' + n + ' か所に入れました';
    });
    document.getElementById('docAiNote').addEventListener('click', function () {
      var id = (document.getElementById('docCaseId') || {}).value;
      if (!id) { window.alert('上の「案件IDで自動入力」で案件を選んでから押してください。'); return; }
      var text = 'AI読み取り（' + d.label + '）：' + keys.map(function (k) { return (names[k] || k) + '＝' + out.querySelector('[data-v="' + k + '"]').value.trim(); }).join('／');
      if (window.HQ && HQ.note) HQ.note(id, text.slice(0, 1500));
      this.textContent = '✓ ' + id + ' のメモに残しました';
    });
  }
})();
