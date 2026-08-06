/* ============================================================
   BUYMO 認証（フロント）
   - 業務ページ（本部/加盟店）にログインゲートをかける
   - ログインはメールアドレスの許可リスト方式（パスワード不要・サーバー不要）
     許可メールは下の STAFF_HQ / STAFF_PARTNER を編集して追加する
   - 会員（お客様）マイページは別方式（member 側で GAS の authcheck を使用）
   ============================================================ */
window.AUTH = (function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwdClZM_NxxnEYz0DRQLFv9WAPV7zgoIhwHeTI73UDT1yC3Tt7BUU-H-Cx9JyKnMFb7nA/exec';
  var KEY = 'buymo_session';
  var TTL = 8 * 3600 * 1000;

  function now() { return new Date().getTime(); }
  function get() { try { var s = JSON.parse(localStorage.getItem(KEY)); return (s && s.exp > now()) ? s : null; } catch (e) { return null; } }
  function set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function role() { var s = get(); return s ? s.role : null; }
  function token() { var s = get(); return s ? s.token : ''; }

  function home(r) { return r === 'partner' ? 'hq.html?role=partner' : (r === 'member' ? 'member.html' : 'hq-dashboard.html'); }

  /* 本部/加盟店の許可メール（ここに追加するだけでログインできます）
     ※ メールアドレス方式・パスワード不要。小文字で記載。 */
  var STAFF_HQ = ['info@aisjaltd.com', 'kaitori@buymo.me', 'test@buymo.me'];
  var STAFF_PARTNER = []; // 例: 'store-iwaki@example.com'

  function staffRoleOf(email) {
    email = String(email || '').trim().toLowerCase();
    if (STAFF_HQ.indexOf(email) >= 0) return 'hq';
    if (STAFF_PARTNER.indexOf(email) >= 0) return 'partner';
    return null;
  }

  // 本部/加盟店ログイン（メール許可リストで判定。サーバー不要）
  function login(email, pw, r, cb) {
    email = (email || '').trim();
    if (!email) { cb(false, 'メールアドレスを入力してください'); return; }
    var role = staffRoleOf(email);
    if (!role) { cb(false, '登録されていないメールアドレスです。本部にご確認ください。'); return; }
    if (r === 'hq' && role !== 'hq') { cb(false, '本部権限がありません。「加盟店でログイン」をご利用ください。'); return; }
    var eff = (r === 'partner' && role === 'hq') ? 'partner' : role; // 本部は加盟店ページも閲覧可
    set({ token: 'staff-' + Math.random().toString(36).slice(2), role: eff, name: email, email: email, exp: now() + TTL });
    cb(true);
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
