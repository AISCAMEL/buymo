/* 本部の AI（どの本部の画面にも、右下に「🤖 AI」を出す）
   ・AI アシスタント：話しかけると、返事と「操作の候補」を出す。候補は［実行］を押したときだけ行う
   ・書類の読み取り：HQAI.readDoc(file, kind) で、車検証・印鑑証明などを読み取って項目に分ける
   ・AI は「BUYMO 車買取 LINE AI応答」の GAS（AI業務.gs）。合言葉は「車買取LINE」の画面と同じもの（この端末に保存） */
window.HQAI = (function () {
  'use strict';
  var GAS = 'https://script.google.com/macros/s/AKfycbxvgXV0kse1pFJVq1oonuOt3LBIrKPOC8VrZKAjduIjGx7UR4JcWg64Gh03r4jdYfVqxw/exec';
  var KEY_LS = 'buymo_kaitori_line_key';
  var HIST_LS = 'buymo_ai_chat';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function key() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function ensureKey() {
    if (key()) return true;
    var v = window.prompt('本部の AI を使うための合言葉を入れてください。\n（「BUYMO 車買取 LINE AI応答」の GAS で showAdminKey を実行するとログに出ます。「車買取LINE」の画面と同じものです）');
    if (!v || !v.trim()) return false;
    try { localStorage.setItem(KEY_LS, v.trim()); } catch (e) {}
    return true;
  }
  function call(action, extra) {
    var body = { action: action, key: key() };
    for (var k in extra) body[k] = extra[k];
    return fetch(GAS + '?api=admin', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.error === 'key') { try { localStorage.removeItem(KEY_LS); } catch (e) {} }
        return d;
      });
  }
  function errText(d) {
    var e = d && d.error;
    return { key: '合言葉が違います。もう一度入れてください。', nokey: 'GAS に ANTHROPIC_API_KEY が入っていません。', action: 'GAS の「コード.gs」「AI業務.gs」を最新にして、新バージョンでデプロイしてください。',
      ai: 'AI が返事できませんでした。少しおいてもう一度お試しください。', size: 'ファイルが大きすぎます。', type: '写真（JPEG・PNG）か PDF を選んでください。', parse: '読み取った内容を整理できませんでした。もう一度お試しください。' }[e] || '通信できませんでした。少しおいてもう一度お試しください。';
  }

  /* ---------- 書類の読み取り ---------- */
  // 写真は長い辺 2000px の JPEG に小さくしてから送る（PDF はそのまま）
  function fileToPayload(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('read')); };
      if (file.type === 'application/pdf') {
        rd.onload = function () { resolve({ mime: 'application/pdf', data: String(rd.result).split(',')[1] }); };
        rd.readAsDataURL(file); return;
      }
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 2000, w = img.width, h = img.height, r = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement('canvas'); cv.width = Math.round(w * r); cv.height = Math.round(h * r);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve({ mime: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.88).split(',')[1] });
        };
        img.onerror = function () { reject(new Error('image')); };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  // kind：'shaken'（車検証）／'inkan'（印鑑証明）／'license'（免許証）／'auto'（自動で判断）
  function readDoc(file, kind) {
    if (!ensureKey()) return Promise.resolve({ ok: false, error: 'key' });
    return fileToPayload(file).then(function (p) {
      return call('aiRead', { kind: kind || 'auto', mime: p.mime, data: p.data });
    }).catch(function () { return { ok: false, error: 'net' }; });
  }

  /* ---------- AI アシスタント ---------- */
  var state = { open: false, busy: false, msgs: [] };
  try { state.msgs = JSON.parse(sessionStorage.getItem(HIST_LS) || '[]') || []; } catch (e) { state.msgs = []; }
  function saveHist() { try { sessionStorage.setItem(HIST_LS, JSON.stringify(state.msgs.slice(-30))); } catch (e) {} }
  var pageKey = '';

  function memoShort(m) {
    var t = String(m || '');
    var car = t.match(/車両[：:]\s*([^\n]+)/);
    return (car ? car[1] : t.split('\n')[0] || '').slice(0, 80);
  }
  function context() {
    var cases = (window.HQ && HQ.getCasesLS ? HQ.getCasesLS() : []) || [];
    var today = new Date();
    return {
      page: pageKey,
      staff: !!(window.AUTH && AUTH.isAdmin && !AUTH.isAdmin()),
      stores: ((window.HQ && HQ.getStores ? HQ.getStores() : []) || []).map(function (s) { return s.name; }),
      cases: cases.slice(0, 150).map(function (c) {
        var d = c.date ? Math.floor((today - new Date(String(c.date).replace(/\//g, '-') + 'T00:00:00')) / 86400000) : '';
        return { id: c.id, 受付: c.date, 経過日数: d, お名前: c.name, ステージ: c.stage, 担当: c.assignee || '未割当', 金額: c.amount || 0, ジャンル: c.genre || '', メモ: memoShort(c.memo), 写真: (c.carPhotos || []).length };
      }),
      line: window.HQAI_LINE || null,
      extra: window.HQAI_EXTRA || ''
    };
  }

  function mount(key) {
    pageKey = key || '';
    if (document.getElementById('aiFab')) return;
    var css = document.createElement('style');
    css.textContent =
      '#aiFab{position:fixed;right:18px;bottom:18px;z-index:200;border:0;border-radius:999px;background:#0A6B3C;color:#fff;font-weight:800;font-size:15px;padding:12px 18px;box-shadow:0 6px 18px rgba(10,107,60,.35);cursor:pointer;}' +
      '#aiPanel{position:fixed;right:18px;bottom:76px;z-index:201;width:min(420px,calc(100vw - 24px));max-height:min(640px,calc(100vh - 100px));display:none;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(15,42,77,.25);overflow:hidden;font-size:14px;}' +
      '#aiPanel.open{display:flex;}' +
      '.ai-h{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0F2A4D;color:#fff;font-weight:700;}.ai-h button{margin-left:auto;background:none;border:0;color:#fff;font-size:18px;cursor:pointer;}' +
      '.ai-h small{font-weight:400;opacity:.8;}' +
      '.ai-log{flex:1;overflow:auto;padding:12px;background:#F6F8FB;}' +
      '.ai-m{margin:0 0 10px;padding:9px 11px;border-radius:10px;white-space:pre-wrap;line-height:1.6;word-break:break-word;}' +
      '.ai-u{background:#E6F4EC;margin-left:36px;}.ai-a{background:#fff;border:1px solid #e3e7ee;margin-right:16px;}' +
      '.ai-act{margin:6px 0 0;padding:8px 10px;border:1px dashed #0A6B3C;border-radius:8px;background:#FAFFFC;font-size:13px;}' +
      '.ai-act b{display:block;margin-bottom:4px;}.ai-act textarea{width:100%;min-height:90px;border:1px solid #d6dbe3;border-radius:6px;padding:6px;font:inherit;font-size:13px;}' +
      '.ai-act button{margin-top:6px;margin-right:6px;border:1px solid #0A6B3C;background:#0A6B3C;color:#fff;border-radius:6px;padding:5px 10px;font-weight:700;font-size:12.5px;cursor:pointer;}' +
      '.ai-act button.o{background:#fff;color:#0A6B3C;}.ai-act.done{opacity:.6;border-style:solid;}' +
      '.ai-q{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;}.ai-q button{border:1px solid #d6dbe3;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;}' +
      '.ai-in{display:flex;gap:6px;padding:10px 12px;border-top:1px solid #eef0f4;}.ai-in textarea{flex:1;resize:none;height:44px;border:1px solid #d6dbe3;border-radius:8px;padding:8px;font:inherit;font-size:14px;}' +
      '.ai-in button{border:0;background:#0A6B3C;color:#fff;border-radius:8px;padding:0 14px;font-weight:700;cursor:pointer;}' +
      '.ai-busy{color:#6b7a90;font-size:13px;padding:0 0 8px;}' +
      '@media print{#aiFab,#aiPanel{display:none!important;}}';
    document.head.appendChild(css);
    var fab = document.createElement('button');
    fab.id = 'aiFab'; fab.type = 'button'; fab.textContent = '🤖 AI';
    fab.setAttribute('aria-label', 'AI アシスタントを開く');
    var panel = document.createElement('section');
    panel.id = 'aiPanel'; panel.setAttribute('aria-label', 'AI アシスタント');
    panel.innerHTML = '<div class="ai-h">🤖 AI アシスタント <small>操作は［実行］を押したときだけ</small><button type="button" data-ai="close" aria-label="閉じる">×</button></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-q" id="aiQuick"></div>' +
      '<div class="ai-in"><textarea id="aiText" placeholder="例：CS-7004 を査定中にして／今日の引取りは？／田中様に査定額の連絡を下書きして"></textarea><button type="button" id="aiSend">送る</button></div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    fab.addEventListener('click', function () { toggle(true); });
    panel.querySelector('[data-ai="close"]').addEventListener('click', function () { toggle(false); });
    document.getElementById('aiSend').addEventListener('click', function () { send(document.getElementById('aiText').value); });
    document.getElementById('aiText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(this.value); });
    var quick = ['今日やることをまとめて', '滞留している案件は？', '担当が決まっていない案件は？', 'この画面の使い方を教えて'];
    document.getElementById('aiQuick').innerHTML = quick.map(function (q) { return '<button type="button">' + esc(q) + '</button>'; }).join('') + '<button type="button" data-clear>会話を消す</button>';
    document.getElementById('aiQuick').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-clear')) { state.msgs = []; saveHist(); render(); return; }
      send(b.textContent);
    });
    render();
  }
  function toggle(v) {
    state.open = v;
    document.getElementById('aiPanel').classList.toggle('open', v);
    document.getElementById('aiFab').style.display = v ? 'none' : '';
    if (v) setTimeout(function () { var t = document.getElementById('aiText'); if (t) t.focus(); }, 50);
  }

  function findCase(id) {
    var cs = (window.HQ && HQ.getCasesLS ? HQ.getCasesLS() : []) || [];
    for (var i = 0; i < cs.length; i++) if (String(cs[i].id).toUpperCase() === String(id).toUpperCase()) return cs[i];
    return null;
  }
  var GO = { today: 'hq-today.html', board: 'hq.html?role=hq', leads: 'hq-leads.html', kaitoriline: 'hq-kaitori-line.html', chatassist: 'hq-chat-assist.html', documents: 'hq-documents.html', auctions: 'hq-auctions.html', stores: 'hq-stores.html', activity: 'hq-partner-activity.html', recruit: 'hq-recruit.html', notices: 'hq-notices.html', manual: 'hq-manual.html' };
  function actLabel(a) {
    var c = a.id ? findCase(a.id) : null, who = c ? '（' + (c.name || '') + '）' : '';
    switch (a.type) {
      case 'stage': return '🗂️ ' + a.id + who + ' のステージを「' + a.stage + '」にする';
      case 'assign': return '🏪 ' + a.id + who + ' の担当を「' + a.assignee + '」にする';
      case 'amount': return '💴 ' + a.id + who + ' の査定額を ¥' + Number(a.amount || 0).toLocaleString('en-US') + ' にする';
      case 'note': return '📝 ' + a.id + who + ' にメモを残す：「' + a.text + '」';
      case 'open': return '🔎 ' + a.id + who + ' を開く';
      case 'go': return '➡️ 「' + a.page + '」の画面を開く';
      case 'draft': return '✉️ ' + (a.to || 'お客様') + 'に送る文の下書き' + (a.id ? '（' + a.id + who + '）' : '');
    }
    return '';
  }
  function runAction(a) {
    var c = a.id ? findCase(a.id) : null;
    if (['stage', 'assign', 'amount', 'note', 'open'].indexOf(a.type) >= 0 && !c) { window.alert(a.id + ' が見つかりません。案件ボードを一度開いて、読み込み直してください。'); return false; }
    if (a.type === 'stage') {
      if ((window.HQ && HQ.STAGES || []).indexOf(a.stage) < 0) { window.alert('ステージ名が正しくありません：' + a.stage); return false; }
      HQ.upsertCase(Object.assign({}, c, { stage: a.stage })); HQ.note(c.id, 'AIアシスタントでステージを「' + a.stage + '」に変更'); return true;
    }
    if (a.type === 'assign') { HQ.upsertCase(Object.assign({}, c, { assignee: a.assignee })); HQ.note(c.id, 'AIアシスタントで担当を「' + a.assignee + '」に'); return true; }
    if (a.type === 'amount') { HQ.upsertCase(Object.assign({}, c, { amount: Number(a.amount) || 0 })); HQ.note(c.id, 'AIアシスタントで査定額を ' + a.amount + ' 円に'); return true; }
    if (a.type === 'note') { HQ.note(c.id, String(a.text || '')); return true; }
    if (a.type === 'open') { location.href = 'hq.html?role=hq&case=' + encodeURIComponent(c.id); return true; }
    if (a.type === 'go') { location.href = GO[a.page] || 'hq-today.html'; return true; }
    return false;
  }

  function render() {
    var log = document.getElementById('aiLog');
    if (!log) return;
    if (!state.msgs.length) {
      log.innerHTML = '<p class="ai-m ai-a">こんにちは。本部の仕事をお手伝いします。\n・「今日やることをまとめて」\n・「CS-7004 を査定中にして」\n・「田中様に査定額の連絡を下書きして」\nのように話しかけてください。案件を変える操作は、［実行］を押したときだけ行います。</p>';
      return;
    }
    log.innerHTML = state.msgs.map(function (m, i) {
      if (m.role === 'user') return '<p class="ai-m ai-u">' + esc(m.content) + '</p>';
      var acts = (m.actions || []).map(function (a, k) {
        var done = m.done && m.done[k];
        if (a.type === 'draft') {
          return '<div class="ai-act"><b>' + esc(actLabel(a)) + '</b><textarea data-draft="' + i + '-' + k + '">' + esc(a.text || '') + '</textarea>' +
            '<button type="button" data-copy="' + i + '-' + k + '">コピーする</button>' + (a.id ? '<button type="button" class="o" data-run="' + i + '-' + k + '" data-open="' + esc(a.id) + '">案件を開く</button>' : '') + '</div>';
        }
        return '<div class="ai-act' + (done ? ' done' : '') + '"><b>' + esc(actLabel(a)) + '</b>' +
          (done ? '✓ 実行しました' : '<button type="button" data-run="' + i + '-' + k + '">実行</button><button type="button" class="o" data-skip="' + i + '-' + k + '">やめる</button>') + '</div>';
      }).join('');
      return '<div class="ai-m ai-a">' + esc(m.content) + acts + '</div>';
    }).join('') + (state.busy ? '<p class="ai-busy">考えています…</p>' : '');
    log.scrollTop = log.scrollHeight;
    log.querySelectorAll('[data-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-run').split('-'), m = state.msgs[+p[0]], a = m.actions[+p[1]];
        if (b.hasAttribute('data-open')) { location.href = 'hq.html?role=hq&case=' + encodeURIComponent(b.getAttribute('data-open')); return; }
        if (!window.confirm(actLabel(a) + '\nこの操作を実行しますか？')) return;
        if (runAction(a)) { m.done = m.done || {}; m.done[+p[1]] = true; saveHist(); render(); }
      });
    });
    log.querySelectorAll('[data-skip]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-skip').split('-'), m = state.msgs[+p[0]]; m.actions.splice(+p[1], 1); saveHist(); render(); });
    });
    log.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = log.querySelector('[data-draft="' + b.getAttribute('data-copy') + '"]');
        if (!t) return;
        var done = function () { b.textContent = 'コピーしました'; setTimeout(function () { b.textContent = 'コピーする'; }, 2500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, function () { t.select(); document.execCommand('copy'); done(); });
        else { t.select(); document.execCommand('copy'); done(); }
      });
    });
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text || state.busy) return;
    if (!ensureKey()) return;
    if (!state.open) toggle(true);
    state.msgs.push({ role: 'user', content: text });
    document.getElementById('aiText').value = '';
    state.busy = true; render();
    var history = state.msgs.map(function (m) { return { role: m.role, content: m.content }; });
    call('aiAssist', { messages: history, context: context() }).then(function (d) {
      state.busy = false;
      if (!d || !d.ok) { state.msgs.push({ role: 'assistant', content: '⚠ ' + errText(d), actions: [] }); }
      else state.msgs.push({ role: 'assistant', content: d.reply || '（返事がありませんでした）', actions: d.actions || [] });
      saveHist(); render();
    }).catch(function () {
      state.busy = false; state.msgs.push({ role: 'assistant', content: '⚠ ' + errText(null), actions: [] }); saveHist(); render();
    });
  }

  return { mount: mount, call: call, readDoc: readDoc, ensureKey: ensureKey, errText: errText, ask: function (t) { send(t); }, open: function () { toggle(true); } };
})();
