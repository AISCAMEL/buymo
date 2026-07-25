/* 実挙動検証：jsdom で各HTMLを読み込みインラインJSを実行して結果を検証
   外部<script src>は順序通りにインライン展開してから解析（読み込み順の保証）。 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = require("path").join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}

function inlineScripts(html) {
  return html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
    const p = path.join(SITE, src);
    if (!fs.existsSync(p)) return m;
    const code = fs.readFileSync(p, "utf8").replace(/<\/script>/g, "<\\/script>");
    return "<script>\n" + code + "\n</script>";
  });
}

function load(file, { storage } = {}) {
  const html = inlineScripts(fs.readFileSync(path.join(SITE, file), "utf8"));
  const vc = new VirtualConsole();
  let pageError = null;
  vc.on("jsdomError", e => {
    // ナビゲーション未実装は想定内（未ログイン時のlocation遷移）
    if (!/Not implemented:.*navigation/.test(e.message)) pageError = e.message;
  });
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://example.com/" + file,
    virtualConsole: vc,
    beforeParse(win) {
      if (storage) for (const k in storage) win.localStorage.setItem(k, storage[k]);
      win.fetch = () => Promise.resolve({ ok: true });
      win.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  return { win: dom.window, doc: dom.window.document, getError: () => pageError };
}

function fire(win, el, type) { el.dispatchEvent(new win.Event(type, { bubbles: true })); }

(() => {
  console.log("index.html（購入総額シミュ）");
  {
    const { win, doc, getError } = load("index.html");
    ok("AucSim 公開", !!win.AucSim);
    const bid = doc.getElementById("bid");
    bid.value = "1400000"; fire(win, bid, "input");
    ok("総額が計算される (#rTotal)", /¥1,5\d\d,\d00/.test(doc.getElementById("rTotal").textContent), doc.getElementById("rTotal").textContent);
    ok("おトク額が表示", /万円/.test(doc.getElementById("rSave").textContent));
    // 納車先で陸送費が変わる（ゼロ社水準）
    doc.getElementById("region").value = "大阪"; fire(win, doc.getElementById("region"), "change");
    ok("納車先で陸送費が反映 (#rShip)", doc.getElementById("rShip").textContent === "¥82,000", doc.getElementById("rShip").textContent);
    ok("ページエラーなし", !getError(), getError());
  }

  console.log("sell.html（出品手取りシミュ）");
  {
    const { win, doc, getError } = load("sell.html");
    const med = doc.getElementById("sMed");
    med.value = "1200000"; fire(win, med, "input");
    ok("手取りが計算される (#sNet=¥1,129,200)", doc.getElementById("sNet").textContent === "¥1,129,200", doc.getElementById("sNet").textContent);
    ok("相場レンジ表示", /〜/.test(doc.getElementById("sRange").textContent));
    ok("ページエラーなし", !getError(), getError());
  }

  console.log("shipping.html（陸送シミュ）");
  {
    const { win, doc, getError } = load("shipping.html");
    doc.getElementById("from").value = "東京";
    doc.getElementById("to").value = "北海道";
    doc.querySelector('input[name="cls"][value="suv"]').checked = true;
    fire(win, doc.getElementById("to"), "change");
    ok("陸送費が計算される (東京→北海道/SUV=¥167,000)", doc.getElementById("rCost").textContent === "¥167,000", doc.getElementById("rCost").textContent);
    ok("ページエラーなし", !getError(), getError());
  }

  console.log("login.html（登録フロー）");
  {
    const { win, getError } = load("login.html");
    ok("AucAuth 公開", !!win.AucAuth);
    win.AucAuth.register({ name: "テスト太郎", email: "t@example.com", plan: "スタンダード" });
    ok("登録でユーザー保存", win.AucAuth.current() && win.AucAuth.current().name === "テスト太郎");
    ok("サンプル注文が投入(購入+出品)", win.AucAuth.orders().length >= 3);
    ok("ページエラーなし", !getError(), getError());
  }

  console.log("mypage.html（ログイン済み・出品申込）");
  {
    const storage = {
      auc_user: JSON.stringify({ name: "山田花子", email: "h@example.com", plan: "スタンダード", since: "2026-06-13" }),
      auc_orders: JSON.stringify([{ id: "OD-2041", kind: "buy", car: "ヤリス", status: "shipping", total: 1614000, progress: 75, date: "2026-06-02", memo: "" }])
    };
    const { win, doc, getError } = load("mypage.html", { storage });
    ok("ログイン名を表示", /山田花子/.test(doc.getElementById("hello").textContent), doc.getElementById("hello").textContent);
    ok("注文一覧を描画", doc.querySelectorAll("#orderList .order").length >= 1);
    doc.getElementById("zCar").value = "セレナ";
    doc.getElementById("zMed").value = "1000000";
    fire(win, doc.getElementById("zMed"), "input");
    ok("出品手取り即時計算 (#zNet)", /¥\d{3},\d00/.test(doc.getElementById("zNet").textContent), doc.getElementById("zNet").textContent);
    fire(win, doc.getElementById("sellForm"), "submit");
    ok("出品申込で注文追加(SL-)", /SL-/.test(doc.getElementById("orderList").innerHTML));
    ok("種別バッジ(購入/出品)表示", /出品/.test(doc.getElementById("orderList").innerHTML) && /購入/.test(doc.getElementById("orderList").innerHTML));
    // ローン仮申込：月々計算とAI一次判定
    doc.getElementById("lAmt").value = "1500000"; fire(win, doc.getElementById("lAmt"), "input");
    ok("ローン月々支払い計算 (#lMonthly)", /¥[\d,]+ \/月/.test(doc.getElementById("lMonthly").textContent), doc.getElementById("lMonthly").textContent);
    ok("ローンAI一次判定表示 (#lGrade)", /[ABCD]（/.test(doc.getElementById("lGrade").textContent), doc.getElementById("lGrade").textContent);
    fire(win, doc.getElementById("loanForm"), "submit");
    ok("ローン仮申込で受付表示", /受け付け/.test(doc.getElementById("loanAlert").textContent), doc.getElementById("loanAlert").textContent);
    // 相場見積り依頼：マイページに反映（一覧に追加）
    doc.getElementById("qCar").value = "アルファード 2020 4万km";
    fire(win, doc.getElementById("quoteForm"), "submit");
    ok("相場見積り依頼が一覧に反映(QT-)", /QT-/.test(doc.getElementById("quoteList").innerHTML), doc.getElementById("quoteList").innerHTML.slice(0,60));
    ok("相場見積りの状態=回答待ち", /回答待ち/.test(doc.getElementById("quoteList").innerHTML));
    ok("ページエラーなし", !getError(), getError());
  }

  console.log("mypage.html（未ログイン→誘導）");
  {
    const { win } = load("mypage.html");
    ok("未ログイン判定", !win.AucAuth.current());
  }

  console.log("\n==== 結果: " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})();
