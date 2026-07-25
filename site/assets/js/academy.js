/* ============================================================
   BUYMO 加盟店アカデミー（動画＋テキスト学習）
   - コース/レッスンは COURSES を編集（video は YouTube等の埋め込みURL or 空）
   - 進捗は localStorage に保存。partner-academy.html（ハブ）と
     partner-course.html（受講画面）の両方で利用。
   ============================================================ */
window.Academy = (function () {
  'use strict';
  var PKEY = 'buymo_academy_progress';

  var COURSES = [
    { id: 'basic', icon: '🎓', title: '買取ビジネスの基礎', desc: 'BUYMOのモデルと全体像を理解する', lessons: [
      { t: 'BUYMOのビジネスモデル', video: '', text: '在庫を持たない買取・即時売却モデル。中間コストを抑え、相場より高い査定を実現します。加盟店は「集客は本部、対応は店舗」で役割分担します。' },
      { t: '取引の全体像（申込→入金）', video: '', text: '申込→無料出張査定→契約→名義変更等の手続き→入金。各ステップで対応履歴を残し、看板ボードで進捗管理します。' },
      { t: 'コンプライアンス（古物営業法）', video: '', text: '古物商許可・本人確認・取引記録の保存が必須。お客様の個人情報はプライバシーポリシーに従い適切に扱います。' }
    ]},
    { id: 'appraisal', icon: '🔍', title: '査定スキル', desc: '車両を正しく見極める', lessons: [
      { t: '外装・内装のチェック', video: '', text: 'キズ・へこみ・修復歴・内装の状態を確認。減点ポイントと加点ポイントを把握します。' },
      { t: '機関・電装の確認', video: '', text: 'エンジン・ミッション・電装・足回り。不動車/事故車の見立てと部品価値の考え方。' },
      { t: '相場の調べ方', video: '', text: '査定シミュレーター・オークション実績から相場を把握。需要の高い装備・カラーを評価に反映します。' }
    ]},
    { id: 'auction', icon: '🚗', title: '出品（オークション）マニュアル', desc: '出品票作成から落札まで', lessons: [
      { t: '出品の流れ', video: '', text: '申込→査定→出品票作成→会場搬入→セリ→落札→名義変更。各会場のルールに従います。' },
      { t: '出品票の作り方', video: '', text: '車両情報・評価点・修復歴・装備を正確に記載。減点項目は正直に記載することでクレームを防ぎます。' },
      { t: '陸送・名義変更の手配', video: '', text: 'ドアtoドアの陸送概算、名義変更・抹消登録の必要書類と段取り。' }
    ]},
    { id: 'sales', icon: '🤝', title: '接客・クロージング', desc: '成約率を高める対話', lessons: [
      { t: '電話・来店の初期対応', video: '', text: '安心感を与える挨拶と要件確認。出張査定の日程調整までをスムーズに。' },
      { t: '提示と反論処理', video: '', text: '金額提示の根拠を伝える。「他社が高い」への対応はトークスクリプト集を参照。' },
      { t: 'クロージング', video: '', text: '契約の流れと必要書類の案内、入金までの安心設計。' }
    ]},
    { id: 'system', icon: '💻', title: 'システム操作（看板/リード）', desc: '日々の案件管理', lessons: [
      { t: 'リードの確認と担当割当', video: '', text: 'リード一覧で新規を確認し、自店に割り当て。検索・フィルタの使い方。' },
      { t: '看板ボードでの進捗管理', video: '', text: 'カードをドラッグしてステージを移動。詳細パネルで対応履歴を記録します。' },
      { t: '会員マイページとの連動', video: '', text: 'ステージ更新はお客様のマイページにも反映。こまめな更新が信頼に繋がります。' }
    ]},
    { id: 'siteops', icon: '🖥️', title: 'サイト運用ビデオマニュアル', desc: 'BUYMOポータル・各ページの操作方法を動画で確認', lessons: [
      { t: 'ポータルログインと初期設定', video: '', text: 'ポータルログインURLの確認、パスワード変更、担当者名・メール設定。ログアウト方法とセキュリティの注意点。' },
      { t: '案件ボードの基本操作', video: '', text: 'ステージ列の見方・カードのドラッグ&ドロップでのステージ移動。カード色（通常・staleアラート）の意味。' },
      { t: '案件詳細パネルと対応履歴の記録', video: '', text: 'カードをクリックして詳細パネルを開く。金額・メモの編集と保存。対応履歴（タイムライン）へのメモ追加手順。' },
      { t: 'リード管理・担当割当', video: '', text: 'リード一覧ページでの新規確認。フィルタ・検索の使い方。担当店舗への割当変更方法。' },
      { t: 'お知らせの受信と対応', video: '', text: '本部からのお知らせはアカデミートップのアラートに表示。重要度（warn/info）の違いと優先対応の考え方。' },
      { t: 'コミュニティ・スクリプトの活用', video: '', text: 'コミュニティ掲示板での情報交換方法。トークスクリプト集の検索・印刷。本部への質問・エスカレーション方法。' }
    ]},
    { id: 'genres', icon: '🏷️', title: 'ジャンル別の買取知識', desc: '廃車・事故車・人気車種・旧車・パーツの勘所', lessons: [
      { t: '廃車・不動車の買取', video: '', text: '動かない車も部品取り・素材リサイクル・輸出で価値が付きます。抹消登録（永久/一時）・レッカー引取は無料代行。抹消時は自動車税・自賠責・重量税の還付が発生する場合があり、案内できると信頼に繋がります。' },
      { t: '事故車の見極め', video: '', text: '修復歴（骨格部位の修正・交換）の有無を確認。損傷していても部品単位で需要があります' },
      { t: '人気車種（ハイエース・ランクル等）', video: '', text: 'ハイエース・ランドクルーザー・ジムニー・アルファードは国内外で需要が高く、過走行・年式不問で高値が付きやすい代表格。商用・カスタム・ディーゼルも需要を見て加点評価します。' },
      { t: '旧車・希少車・絶版車', video: '', text: '旧車・ネオクラ・絶版車は希少価値で相場が一般車と大きく異なります。不動・レストアベースでも専門ルートで流通可能。価値が分かる査定で適正評価し、迷えば本部へエスカレーション。' },
      { t: 'パーツ・ホイールの買取', video: '', text: 'アルミホイール・タイヤ・カー用品は車本体が無くても単体で買取可能。BBS・RAYS・WORK等の人気ブランドは中古需要が高い。タイヤ付きセット・まとめ売りも歓迎します。' }
    ]}
  ];

  var QKEY = 'buymo_academy_passed';
  var PASS = 80; // 合格ライン(%)
  var QUIZ = {
    basic: [
      { q: 'BUYMOの基本ビジネスモデルは？', c: ['在庫を多数抱えて販売', '在庫を持たない買取・即時売却', '製造して販売'], a: 1 },
      { q: '車の買取（古物取引）に必須の許可は？', c: ['宅地建物取引業', '古物商許可', '建設業許可'], a: 1 },
      { q: '日々の案件の進捗管理に使うのは？', c: ['看板ボード', '給与計算表', '在庫一覧'], a: 0 }
    ],
    appraisal: [
      { q: '相場の把握に使えるのは？', c: ['星占い', '査定シミュレーター/オークション実績', '天気予報'], a: 1 },
      { q: '不動車・事故車の価値の考え方は？', c: ['必ず価値ゼロ', '部品・素材として価値がある', '常に廃棄のみ'], a: 1 },
      { q: '高査定につながりやすいのは？', c: ['人気の装備・カラー', '色あせ', '大きな損傷'], a: 0 }
    ],
    auction: [
      { q: '出品票で大切な姿勢は？', c: ['良い点だけ書く', '減点も正直に記載する', '空欄で出す'], a: 1 },
      { q: '出品の流れの最後は？', c: ['落札', '申込', '査定'], a: 0 },
      { q: '落札後に必要な手配は？', c: ['特になし', '陸送・名義変更の手配', '再出品のみ'], a: 1 }
    ],
    sales: [
      { q: '「他社の方が高い」への対応は？', c: ['すぐ諦める', '手数料無料など“総額”で比較訴求', '値引きだけで対抗'], a: 1 },
      { q: '金額提示で大切なのは？', c: ['根拠を伝える', '黙って渡す', '曖昧にする'], a: 0 },
      { q: '契約時に必要な書類は？', c: ['住民票のみ', '車検証・自賠責・本人確認・印鑑', '不要'], a: 1 }
    ],
    system: [
      { q: '新規リードはどこで確認する？', c: ['リード一覧', '給与明細', '在庫表'], a: 0 },
      { q: 'ステージ変更はどこに反映される？', c: ['どこにも反映されない', '会員マイページにも反映', '印刷物のみ'], a: 1 },
      { q: '対応メモの記録先は？', c: ['記録しない', '案件詳細パネルの対応履歴', '口頭のみ'], a: 1 }
    ],
    siteops: [
      { q: '案件ステージを変更するには？', c: ['メールで本部に依頼', 'カードをドラッグしてステージ列に移動', '電話で連絡'], a: 1 },
      { q: '対応メモはどこに記録する？', c: ['ノートに手書き', '案件詳細パネルの対応履歴（タイムライン）', '記録しない'], a: 1 },
      { q: '本部からの重要なお知らせはどこで確認する？', c: ['ポータルのアラート表示', '新聞', '掲示板のみ'], a: 0 }
    ],
    genres: [
      { q: '廃車（抹消）時にお客様へ案内できると良いものは？', c: ['税金・自賠責などの還付', '宝くじ', '保険の新規加入'], a: 0 },
      { q: 'ハイエースやランドクルーザーが高値になりやすい主因は？', c: ['国内外の高い需要・輸出', '色が必ず白だから', '必ず新車だから'], a: 0 },
      { q: '事故車の出品票での正しい姿勢は？', c: ['良い点だけ書く', '修復歴・損傷も正直に記載', '空欄にする'], a: 1 },
      { q: 'アルミホイールやタイヤは？', c: ['車本体が無いと買取不可', '単体・セットでも買取可能', '常に無価値'], a: 1 }
    ]
  };
  /* ---- 動的コンテンツ（本部ダッシュボードで管理） ---- */
  var CKEY = 'buymo_academy_content';
  function getContent() { try { return JSON.parse(localStorage.getItem(CKEY)) || {}; } catch (e) { return {}; } }
  function saveContent(c) { try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) {} }

  function allCourses() {
    var ct = getContent();
    var videos = ct.videos || {};
    var extraLessons = ct.extraLessons || {};
    var extraCourses = ct.courses || [];
    var merged = COURSES.map(function (c) {
      var lessons = c.lessons.map(function (l, i) {
        var v = videos[c.id + ':' + i];
        return v ? { t: l.t, video: v, text: l.text } : l;
      }).concat(extraLessons[c.id] || []);
      return { id: c.id, icon: c.icon, title: c.title, desc: c.desc, lessons: lessons };
    });
    return merged.concat(extraCourses);
  }

  function setVideo(courseId, lessonIdx, url) {
    var ct = getContent(); ct.videos = ct.videos || {};
    ct.videos[courseId + ':' + lessonIdx] = url; saveContent(ct);
  }
  function addCourse(course) {
    var ct = getContent(); ct.courses = ct.courses || [];
    ct.courses.push(course); saveContent(ct);
  }
  function addLesson(courseId, lesson) {
    var ct = getContent(); ct.extraLessons = ct.extraLessons || {};
    ct.extraLessons[courseId] = ct.extraLessons[courseId] || [];
    ct.extraLessons[courseId].push(lesson); saveContent(ct);
  }
  function deleteCourse(courseId) {
    var ct = getContent(); ct.courses = (ct.courses || []).filter(function(c) { return c.id !== courseId; }); saveContent(ct);
  }
  function deleteLesson(courseId, lessonIdx, isExtra) {
    var ct = getContent();
    if (isExtra) {
      var arr = ct.extraLessons && ct.extraLessons[courseId];
      if (arr) { arr.splice(lessonIdx, 0); ct.extraLessons[courseId] = arr; saveContent(ct); }
    }
  }

  function getPassed() { try { return JSON.parse(localStorage.getItem(QKEY)) || {}; } catch (e) { return {}; } }
  function setPassed(p) { try { localStorage.setItem(QKEY, JSON.stringify(p)); } catch (e) {} }
  function isPassed(id) { return !!getPassed()[id]; }
  function certNo(id, date) { return 'BUYMO-' + String(id).toUpperCase() + '-' + String(date).replace(/\//g, ''); }
  function todayStr() { var d = new Date(); function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()); }
  function learnerName() { try { var s = window.AUTH && AUTH.get && AUTH.get(); return (s && s.name) ? s.name : '受講者'; } catch (e) { return '受講者'; } }

  function getProgress() { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } }
  function setProgress(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} }
  function done(courseId) { var p = getProgress(); return (p[courseId] || []); }
  function isDone(courseId, idx) { return done(courseId).indexOf(idx) >= 0; }
  function complete(courseId, idx, on) {
    var p = getProgress(); var a = p[courseId] || [];
    var i = a.indexOf(idx);
    if (on && i < 0) a.push(idx);
    if (!on && i >= 0) a.splice(i, 1);
    p[courseId] = a; setProgress(p);
  }
  function pct(courseId) { var c = byId(courseId); if (!c) return 0; return Math.round(done(courseId).length / c.lessons.length * 100); }
  function byId(id) { var all = allCourses(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function overall() {
    var total = 0, dn = 0;
    allCourses().forEach(function (c) { total += c.lessons.length; dn += done(c.id).length; });
    return total ? Math.round(dn / total * 100) : 0;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ハブ描画 */
  function renderHub() {
    var grid = document.getElementById('academyGrid'); if (!grid) return;
    var ov = document.getElementById('overallPct'); if (ov) ov.textContent = overall() + '%';
    var ob = document.getElementById('overallBar'); if (ob) ob.style.width = overall() + '%';
    grid.innerHTML = allCourses().map(function (c) {
      var p = pct(c.id);
      var badge = isPassed(c.id) ? '<span class="ac-badge">🏅 修了</span>' : '';
      return '<a class="ac-card" href="partner-course.html?id=' + c.id + '">' +
        '<div class="ac-ico">' + c.icon + '</div>' +
        '<h3>' + esc(c.title) + badge + '</h3><p>' + esc(c.desc) + '</p>' +
        '<div class="ac-bar"><span style="width:' + p + '%"></span></div>' +
        '<div class="ac-meta">' + done(c.id).length + '/' + c.lessons.length + ' レッスン完了（' + p + '%）</div>' +
      '</a>';
    }).join('');
  }

  /* 受講画面描画 */
  function renderCourse() {
    var root = document.getElementById('courseRoot'); if (!root) return;
    var id; try { id = new URLSearchParams(location.search).get('id'); } catch (e) { id = null; }
    var c = byId(id) || COURSES[0];
    var cur = 0;

    function lessonHTML(l) {
      var media = l.video
        ? '<div class="cv-video"><iframe src="' + esc(l.video) + '" allowfullscreen loading="lazy"></iframe></div>'
        : '<div class="cv-video placeholder">▶ 動画（差し替え用プレースホルダー）</div>';
      return media + '<div class="cv-text">' + esc(l.text) + '</div>';
    }
    function draw() {
      document.getElementById('cvTitle').textContent = c.title;
      document.getElementById('cvList').innerHTML = c.lessons.map(function (l, i) {
        return '<li class="' + (i === cur ? 'active ' : '') + (isDone(c.id, i) ? 'done' : '') + '" data-i="' + i + '">' +
          '<span class="cv-check">' + (isDone(c.id, i) ? '✓' : (i + 1)) + '</span>' + esc(l.t) + '</li>';
      }).join('');
      document.getElementById('cvLessonTitle').textContent = c.lessons[cur].t;
      document.getElementById('cvBody').innerHTML = lessonHTML(c.lessons[cur]);
      var btn = document.getElementById('cvComplete');
      btn.textContent = isDone(c.id, cur) ? '完了済み（取り消す）' : 'このレッスンを完了にする';
      btn.classList.toggle('is-done', isDone(c.id, cur));
      document.getElementById('cvProg').textContent = done(c.id).length + '/' + c.lessons.length + '（' + pct(c.id) + '%）';
      var qz = document.getElementById('cvQuiz');
      if (qz) {
        if (pct(c.id) === 100) {
          var hasQuiz = !!(QUIZ[c.id] && QUIZ[c.id].length);
          qz.hidden = false;
          if (isPassed(c.id)) {
            qz.innerHTML = '🏅 このコースは修了済みです。<a href="partner-cert.html?id=' + c.id + '">修了証を表示</a>';
          } else if (hasQuiz) {
            qz.innerHTML = '全レッスン完了！<a class="cv-quiz-btn" href="partner-quiz.html?id=' + c.id + '">修了テストを受ける ›</a>';
          } else {
            qz.innerHTML = '全レッスン完了！<button class="cv-quiz-btn" id="cvPassBtn">修了にする（テストなし）</button>';
            document.getElementById('cvPassBtn').addEventListener('click', function () {
              var p = getPassed(); p[c.id] = { score: 100, date: todayStr(), no: certNo(c.id, todayStr()) }; setPassed(p); draw();
            });
          }
        } else { qz.hidden = true; }
      }
    }
    document.getElementById('cvList').addEventListener('click', function (e) {
      var li = e.target.closest('li'); if (!li) return; cur = Number(li.getAttribute('data-i')); draw();
    });
    document.getElementById('cvComplete').addEventListener('click', function () {
      complete(c.id, cur, !isDone(c.id, cur));
      if (cur < c.lessons.length - 1 && isDone(c.id, cur)) cur++;
      draw();
    });
    draw();
  }

  /* 修了テスト */
  function renderQuiz() {
    var root = document.getElementById('quizRoot'); if (!root) return;
    var id; try { id = new URLSearchParams(location.search).get('id'); } catch (e) { id = null; }
    var c = byId(id); var qs = QUIZ[id];
    if (!c || !qs) { root.innerHTML = '<p>コースが見つかりません。<a href="partner-academy.html">一覧へ</a></p>'; return; }
    function paint() {
      root.innerHTML =
        '<h1>修了テスト：' + esc(c.title) + '</h1>' +
        '<p class="portal-sub">全' + qs.length + '問・合格ライン' + PASS + '%。' + (isPassed(id) ? '（修了済み）' : '') + '</p>' +
        '<form id="quizForm" class="quiz-form">' +
          qs.map(function (q, i) {
            return '<div class="quiz-q"><p class="quiz-qt">Q' + (i + 1) + '. ' + esc(q.q) + '</p>' +
              q.c.map(function (ch, j) {
                return '<label class="quiz-opt"><input type="radio" name="q' + i + '" value="' + j + '"> ' + esc(ch) + '</label>';
              }).join('') + '</div>';
          }).join('') +
          '<button type="submit" class="quiz-submit">採点する</button>' +
          '<div class="quiz-result" id="quizResult" hidden></div>' +
        '</form>';
      document.getElementById('quizForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var correct = 0;
        qs.forEach(function (q, i) {
          var sel = document.querySelector('input[name="q' + i + '"]:checked');
          if (sel && Number(sel.value) === q.a) correct++;
        });
        var score = Math.round(correct / qs.length * 100);
        var res = document.getElementById('quizResult'); res.hidden = false;
        if (score >= PASS) {
          var date = todayStr();
          var p = getPassed(); p[id] = { score: score, date: date, no: certNo(id, date) }; setPassed(p);
          res.className = 'quiz-result pass';
          res.innerHTML = '🎉 合格！（' + score + '点）<br><a class="cv-quiz-btn" href="partner-cert.html?id=' + id + '">修了証を表示する ›</a>';
        } else {
          res.className = 'quiz-result fail';
          res.innerHTML = '不合格（' + score + '点）。もう一度挑戦しましょう。<button type="button" class="quiz-retry" id="quizRetry">やり直す</button>';
          document.getElementById('quizRetry').addEventListener('click', paint);
        }
        res.scrollIntoView && res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    paint();
  }

  /* 修了証 */
  function renderCert() {
    var root = document.getElementById('certRoot'); if (!root) return;
    var id; try { id = new URLSearchParams(location.search).get('id'); } catch (e) { id = null; }
    var c = byId(id); var rec = getPassed()[id];
    if (!c || !rec) {
      root.innerHTML = '<p class="cert-none">このコースはまだ修了していません。<br><a href="partner-quiz.html?id=' + (id || '') + '">修了テストを受ける</a></p>';
      return;
    }
    root.innerHTML =
      '<div class="cert">' +
        '<div class="cert-mark">🐮 BUYMO ACADEMY</div>' +
        '<div class="cert-title">修了証</div>' +
        '<p class="cert-lead">下記の者は所定の研修課程を修了したことを証します。</p>' +
        '<p class="cert-name">' + esc(learnerName()) + ' 殿</p>' +
        '<p class="cert-course">コース：' + esc(c.title) + '</p>' +
        '<div class="cert-row"><span>スコア：' + rec.score + '点</span><span>修了日：' + esc(rec.date) + '</span></div>' +
        '<div class="cert-row"><span>認定番号：' + esc(rec.no) + '</span><span>発行：合同会社アイズ（BUYMO）</span></div>' +
      '</div>' +
      '<div class="cert-actions"><button class="btn btn-primary" onclick="window.print()">印刷／PDF保存</button> <a class="cert-back" href="partner-academy.html">アカデミーへ戻る</a></div>';
  }

  return {
    COURSES: COURSES, allCourses: allCourses,
    renderHub: renderHub, renderCourse: renderCourse, renderQuiz: renderQuiz, renderCert: renderCert,
    overall: overall, isPassed: isPassed,
    setVideo: setVideo, addCourse: addCourse, addLesson: addLesson,
    deleteCourse: deleteCourse, getContent: getContent, saveContent: saveContent
  };
})();
