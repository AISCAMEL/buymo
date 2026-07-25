/* ============================================================
   BUYMO 認証（フロント）
   - 業務ページ（本部/加盟店）にログインゲートをかける
   - ENDPOINT 未設定：デモ認証（メール+任意PWでログイン）
   - ENDPOINT 設定時：GAS の doGet(action=login) でセッショントークン取得
   ※ セキュリティの前提・限界は docs/BUYMO_認証設計.md を参照
   ============================================================ */
window.AUTH = (function () {
  'use strict';
  var ENDPOINT = ''; // 例: https://script.google.com/macros/s/XXXX/exec（空ならデモ）
  var KEY = 'buymo_session';
  var TTL = 8 * 3600 * 1000;

  function now() { return new Date().getTime(); }
  function get() { try { var s = JSON.parse(localStorage.getItem(KEY)); return (s && s.exp > now()) ? s : null; } catch (e) { return null; } }
  function set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function role() { var s = get(); return s ? s.role : null; }
  function token() { var s = get(); return s ? s.token : ''; }

  function home(r) { return r === 'partner' ? 'hq.html?role=partner' : (r === 'member' ? 'member.html' : 'hq-dashboard.html'); }

  function login(email, pw, r, cb) {
    email = (email || '').trim();
    if (!email || !pw) { cb(false, 'メールとパスワードを入力してください'); return; }
    if (!ENDPOINT) {
      set({ token: 'demo-' + Math.random().toString(36).slice(2), role: r || 'hq', name: email, email: email, exp: now() + TTL });
      cb(true); return;
    }
    window.__login = function (d) {
      if (d && d.ok) { set({ token: d.token, role: d.role || r, name: d.name || email, email: email, exp: now() + (d.ttl || TTL) }); cb(true); }
      else cb(false, (d && d.error) || 'ログインに失敗しました');
    };
    var s = document.createElement('script');
    s.src = ENDPOINT + '?action=login&email=' + encodeURIComponent(email) + '&pw=' + encodeURIComponent(pw) + '&role=' + encodeURIComponent(r || '') + '&callback=__login';
    s.onerror = function () { cb(false, '接続に失敗しました'); };
    document.body.appendChild(s);
  }

  function logout() {
    var s = get(); clear();
    if (ENDPOINT && s) { var x = document.createElement('script'); x.src = ENDPOINT + '?action=logout&t=' + encodeURIComponent(s.token); (document.body || document.documentElement).appendChild(x); }
  }

  function allowed(s, req) {
    if (!s) return false;
    if (!req || req === 'any') return true;
    if (s.role === 'hq') return true;              // 本部は全権限
    if (req === 'staff') return s.role === 'partner' || s.role === 'hq';
    return s.role === req;
  }
  function guard(req) {
    var s = get();
    if (allowed(s, req)) return true;
    if (s) { location.replace(home(s.role)); }     // ログイン済だが権限不足→自分のホームへ
    else { location.replace('portal-login.html'); } // 未ログイン→ログインへ
    return false;
  }

  // ログアウトリンクの共通処理
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.portal-logout,[data-logout]');
    if (a) { e.preventDefault(); logout(); location.replace('portal-login.html'); }
  });

  return { login: login, logout: logout, guard: guard, role: role, token: token, get: get, home: home };
})();
