/* 実PDF差込発行：アップロードされた実際の様式PDF（フラット）に案件情報を差し込む。
   ・pdf-lib + fontkit + 日本語フォント（IPAゴシック）を自己ホストで読み込み（初回のみ・約7MB、以後キャッシュ）。
   ・テンプレごとに差込位置（座標）を定義。長い文字は自動縮小。 */
(function () {
  'use strict';
  var V = 'assets/vendor/', F = 'assets/fonts/ipag.ttf', P = 'assets/pdf/';

  // 差込テンプレート定義（座標は pdf-lib＝左下原点・pt）
  var TEMPLATES = {
    joto: {
      name: '譲渡証明書（第21号様式）', file: P + 'joto-shomeisho.pdf?v=2',
      fields: [
        { k: 'carName', label: '車名', x: 66, y: 407, size: 9, maxW: 78 },
        { k: 'model', label: '型式', x: 142, y: 407, size: 9, maxW: 82 },
        { k: 'vin', label: '車台番号', x: 230, y: 407, size: 9, maxW: 92 },
        { k: 'engine', label: '原動機の型式', x: 330, y: 407, size: 9, maxW: 78 },
        { k: 'date', label: '譲渡年月日', x: 44, y: 322, size: 8, maxW: 70 },
        { k: 'sellerName', label: '譲渡人 氏名／名称', x: 120, y: 322, size: 9, maxW: 200 },
        { k: 'sellerAddr', label: '譲渡人 住所', x: 120, y: 308, size: 8, maxW: 210 },
        { k: 'note', label: '備考', x: 110, y: 118, size: 9, maxW: 380 }
      ]
    },
    ininjo: {
      name: '委任状', file: P + 'ininjo.pdf?v=2',
      fields: [
        { k: 'agentAddr', label: '受任者 住所', x: 300, y: 424, size: 9, maxW: 230 },
        { k: 'agentName', label: '受任者 氏名／名称', x: 300, y: 380, size: 9, maxW: 230 },
        { k: 'appType', label: '申請の別（移転／変更／抹消）', x: 452, y: 344, size: 9, maxW: 70 },
        { k: 'regNo', label: '自動車登録番号／車台番号', x: 360, y: 262, size: 9, maxW: 180 },
        { k: 'gYear', label: '年（令和）', x: 626, y: 211, size: 9, maxW: 22 },
        { k: 'gMonth', label: '月', x: 675, y: 211, size: 9, maxW: 22 },
        { k: 'gDay', label: '日', x: 721, y: 211, size: 9, maxW: 22 },
        { k: 'ownerName', label: '委任者 氏名／名称', x: 150, y: 143, size: 9, maxW: 270 },
        { k: 'ownerAddr', label: '委任者 住所', x: 150, y: 100, size: 8, maxW: 270 }
      ]
    }
  };

  var libsReady = false, fontBytes = null, PDFLib = null, fontkit = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.head.appendChild(s); }); }
  function ensureLibs(msg) {
    if (libsReady) return Promise.resolve();
    if (msg) msg.textContent = '準備中（初回はフォント読み込みに数秒）…';
    var chain = Promise.resolve();
    if (!window.PDFLib) chain = chain.then(function () { return loadScript(V + 'pdf-lib.min.js?v=1'); });
    if (!window.fontkit) chain = chain.then(function () { return loadScript(V + 'fontkit.umd.min.js?v=1'); });
    return chain
      .then(function () { PDFLib = window.PDFLib; fontkit = window.fontkit; return fetch(F).then(function (r) { return r.arrayBuffer(); }); })
      .then(function (buf) { fontBytes = buf; libsReady = true; });
  }

  function reiwa() { var d = new Date(); return { g: d.getFullYear() - 2018, m: d.getMonth() + 1, d: d.getDate() }; }
  function jDate() { var r = reiwa(); return '令和' + r.g + '年' + r.m + '月' + r.d + '日'; }

  function drawFit(page, font, text, f, PDFLib) {
    text = String(text == null ? '' : text).trim();
    if (!text) return;
    var s = f.size;
    while (s > 6 && font.widthOfTextAtSize(text, s) > f.maxW) s -= 0.5;
    page.drawText(text, { x: f.x, y: f.y, size: s, font: font, color: PDFLib.rgb(0.05, 0.05, 0.1) });
  }

  // mode: 'fillable'（書き込み可能なフォーム欄付きPDF・既定）／'flat'（文字を焼付け・編集不可）
  function generate(tplKey, values, msg, mode) {
    var tpl = TEMPLATES[tplKey]; if (!tpl) return;
    var fillable = (mode !== 'flat');
    if (msg) msg.textContent = fillable ? '書き込み可能PDFを生成中…（初回はフォント読み込みに数秒）' : '生成中…';
    ensureLibs(msg).then(function () {
      return fetch(tpl.file).then(function (r) { return r.arrayBuffer(); });
    }).then(function (tmplBytes) {
      return PDFLib.PDFDocument.load(tmplBytes).then(function (doc) {
        doc.registerFontkit(fontkit);
        // 書き込み可能フォームは、入力後の日本語も表示できるようフォントを全埋め込み（subsetしない）
        return doc.embedFont(fontBytes, { subset: !fillable }).then(function (font) {
          var page = doc.getPages()[0];
          if (fillable) {
            var form = doc.getForm();
            tpl.fields.forEach(function (f) {
              var tf;
              try { tf = form.createTextField(tplKey + '_' + f.k); }
              catch (e) { tf = form.createTextField(tplKey + '_' + f.k + '_' + Math.random().toString(36).slice(2, 6)); }
              var h = Math.max(13, (f.size || 9) + 6);
              tf.addToPage(page, {
                x: f.x - 2, y: f.y - 4, width: (f.maxW || 120) + 6, height: h,
                borderWidth: 0.75, borderColor: PDFLib.rgb(0.55, 0.68, 0.85),
                backgroundColor: PDFLib.rgb(0.96, 0.98, 1),
                font: font
              });
              try { tf.setFontSize(f.size || 9); } catch (e2) {}
              var val = values[f.k]; if (val != null && String(val) !== '') tf.setText(String(val));
              // 各フィールドの外観を日本語フォントで生成（Helveticaフォールバック回避）
              try { tf.updateAppearances(font); } catch (e3) {}
            });
            // ビューアで入力した日本語も表示できるよう、既定リソースに日本語フォントを設定
            try { form.updateFieldAppearances(font); } catch (e4) {}
            try {
              var acro = form.acroForm;
              if (acro && acro.dict && PDFLib.PDFBool) acro.dict.set(PDFLib.PDFName.of('NeedAppearances'), PDFLib.PDFBool.True);
            } catch (e5) {}
            // 保存時にpdf-libが既定フォント(WinAnsi)で再生成しないよう抑止
            return doc.save({ updateFieldAppearances: false });
          }
          tpl.fields.forEach(function (f) { drawFit(page, font, values[f.k], f, PDFLib); });
          return doc.save();
        });
      });
    }).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url;
      a.download = tpl.name.replace(/（.*?）/g, '') + (fillable ? '_記入用' : '') + '_' + (values.sellerName || values.ownerName || '発行') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      if (msg) { msg.textContent = fillable ? '✓ 書き込み可能PDFをダウンロードしました（PDFを開いて各欄に入力できます）' : '✓ ダウンロードしました'; setTimeout(function () { msg.textContent = ''; }, 3500); }
    }).catch(function (e) {
      if (msg) msg.textContent = '生成に失敗しました（' + (e && e.message ? e.message : 'エラー') + '）。時間をおいて再度お試しください。';
    });
  }

  /* ---- UI 構築 ---- */
  function boot() {
    var sec = document.getElementById('pdfFillSection'); if (!sec) return;
    var sel = document.getElementById('pfTemplate');
    var fieldsEl = document.getElementById('pfFields');
    var msg = document.getElementById('pfMsg');
    sel.innerHTML = Object.keys(TEMPLATES).map(function (k) { return '<option value="' + k + '">' + TEMPLATES[k].name + '</option>'; }).join('');

    function g(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    function carOfSelectedCase() {
      var id = g('docCaseId'); if (!id || !window.HQ) return {};
      var c = (HQ.getCasesLS() || []).filter(function (x) { return x.id === id; })[0] || {};
      var car = c.car || {};
      return { carName: [car.maker, car.model].filter(Boolean).join(' '), vin: car.vin || '', plate: '' , c: c };
    }
    function prefill(k) {
      var r = reiwa(); var car = carOfSelectedCase();
      var map = {
        joto: {
          carName: car.carName, model: '', vin: g('docVin'), engine: '', date: jDate(),
          sellerName: g('docName'), sellerAddr: g('docAddress'), note: ''
        },
        ininjo: {
          agentAddr: '福島県いわき市四倉町細谷字大町1番', agentName: '合同会社アイズ（BUYMO）', appType: '移転登録',
          regNo: g('docPlate') || g('docVin'), gYear: String(r.g), gMonth: String(r.m), gDay: String(r.d),
          ownerName: g('docName'), ownerAddr: g('docAddress')
        }
      };
      return map[k] || {};
    }
    function renderFields() {
      var k = sel.value, tpl = TEMPLATES[k], pv = prefill(k);
      fieldsEl.innerHTML = tpl.fields.map(function (f) {
        return '<label class="pf-f"><span>' + f.label + '</span><input data-k="' + f.k + '" type="text" value="' + (pv[f.k] ? String(pv[f.k]).replace(/"/g, '&quot;') : '') + '"></label>';
      }).join('');
    }
    sel.addEventListener('change', renderFields);
    // 案件選択や上部入力が変わったら未編集の前提で再プリフィル
    ['docCaseId', 'docName', 'docAddress', 'docVin', 'docPlate'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener('change', renderFields);
    });
    function collect() {
      var values = {};
      fieldsEl.querySelectorAll('input[data-k]').forEach(function (inp) { values[inp.getAttribute('data-k')] = inp.value; });
      return values;
    }
    document.getElementById('pfGen').addEventListener('click', function () {
      generate(sel.value, collect(), msg, 'fillable');
    });
    var flatBtn = document.getElementById('pfGenFlat');
    if (flatBtn) flatBtn.addEventListener('click', function () {
      generate(sel.value, collect(), msg, 'flat');
    });
    renderFields();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
