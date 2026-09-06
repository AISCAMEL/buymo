/* 接客アシスト（AI添削）：スタッフの下書きを、お客様へ送る丁寧・正確な案内文に書き直す
   GAS: GET ?action=reword&q=<下書き>&ctx=<客の発言>&tone=<丁寧/簡潔/謝罪>&callback=... → {text} */
(function () {
  HQ.nav('chatassist');
  // 役割に応じてタイトル表示
  try { var r = AUTH.role && AUTH.role(); if (r === 'partner') { var t = document.getElementById('portalTitle'); if (t) t.textContent = '加盟店'; } } catch (e) {}

  var ENDPOINT = HQ.ENDPOINT;
  var draftEl = document.getElementById('caDraft');
  var ctxEl = document.getElementById('caCtx');
  var toneEl = document.getElementById('caTone');
  var resEl = document.getElementById('caResult');
  var runBtn = document.getElementById('caRun');
  var copyBtn = document.getElementById('caCopy');
  var redoBtn = document.getElementById('caRedo');

  function jsonp(url, cb) {
    var name = '__reword_' + Math.random().toString(36).slice(2);
    var s = document.createElement('script');
    var done = false;
    window[name] = function (d) { done = true; try { delete window[name]; } catch (e) { window[name] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); cb(d); };
    s.onerror = function () { if (!done) { done = true; if (s.parentNode) s.parentNode.removeChild(s); cb(null); } };
    s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
    document.body.appendChild(s);
    setTimeout(function () { if (!done) s.onerror(); }, 20000);
  }

  function run() {
    var draft = (draftEl.value || '').trim();
    if (!draft) { draftEl.focus(); return; }
    if (!ENDPOINT) { resEl.textContent = 'サーバー未接続のため添削できません。'; resEl.className = 'ca-result'; return; }
    resEl.textContent = '添削中… ✨'; resEl.className = 'ca-result loading';
    runBtn.disabled = true; copyBtn.disabled = true; redoBtn.disabled = true;
    var url = ENDPOINT + '?action=reword' +
      '&q=' + encodeURIComponent(draft) +
      '&ctx=' + encodeURIComponent((ctxEl.value || '').trim()) +
      '&tone=' + encodeURIComponent(toneEl.value || '');
    jsonp(url, function (d) {
      runBtn.disabled = false;
      if (d && d.text) {
        resEl.textContent = d.text; resEl.className = 'ca-result';
        copyBtn.disabled = false; redoBtn.disabled = false;
      } else {
        resEl.textContent = '添削できませんでした。時間をおいて再度お試しください（AIが混み合っている場合があります）。';
        resEl.className = 'ca-result';
      }
    });
  }

  runBtn.addEventListener('click', run);
  redoBtn.addEventListener('click', run);
  copyBtn.addEventListener('click', function () {
    var txt = resEl.textContent || '';
    if (!txt) return;
    function ok() { var o = copyBtn.textContent; copyBtn.textContent = '✓ コピーしました'; setTimeout(function () { copyBtn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, function () { fallback(txt); ok(); });
    } else { fallback(txt); ok(); }
  });
  function fallback(txt) {
    var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }
  // Ctrl/Cmd + Enter で実行
  draftEl.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
})();
