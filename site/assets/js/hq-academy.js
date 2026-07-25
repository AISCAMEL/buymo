/* アカデミー管理（本部）：動画URL設定・コース/レッスン追加 */
(function () {
  'use strict';
  HQ.nav('academy');

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var BASE_IDS = Academy.COURSES.map(function (c) { return c.id; });

  function isCustom(id) { return BASE_IDS.indexOf(id) < 0; }

  /* ---- 統計 ---- */
  function renderStats() {
    var all = Academy.allCourses();
    var ct = Academy.getContent();
    var videos = ct.videos || {};
    var totalLessons = all.reduce(function (n, c) { return n + c.lessons.length; }, 0);
    var filledVideos = Object.keys(videos).filter(function (k) { return !!videos[k]; }).length;
    var extraCourses = (ct.courses || []).length;
    document.getElementById('hqaStats').innerHTML =
      stat(all.length, 'コース数') + stat(totalLessons, 'レッスン数') + stat(filledVideos, '動画設定済み') + stat(extraCourses, '追加コース');
  }
  function stat(n, l) {
    return '<div class="hqa-stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>';
  }

  /* ---- コース一覧 ---- */
  function renderCourses() {
    var all = Academy.allCourses();
    var ct = Academy.getContent();
    var videos = ct.videos || {};
    var el = document.getElementById('courseList');
    el.innerHTML = all.map(function (c) {
      var custom = isCustom(c.id);
      var baseCount = custom ? 0 : Academy.COURSES.filter(function (bc) { return bc.id === c.id; }).map(function (bc) { return bc.lessons.length; })[0] || 0;
      var lessonRows = c.lessons.map(function (l, i) {
        var key = c.id + ':' + i;
        var url = videos[key] || '';
        var isExtra = !custom && i >= baseCount;
        return '<div class="hqa-lesson">' +
          '<div class="hqa-lesson-num">' + (i + 1) + '</div>' +
          '<div class="hqa-lesson-info">' +
            '<div class="hqa-lesson-title">' + esc(l.t) + (isExtra ? ' <span class="hqa-custom-badge">追加</span>' : '') + '</div>' +
            '<div class="hqa-video-row">' +
              '<input type="url" class="vid-input" data-id="' + esc(c.id) + '" data-idx="' + i + '" placeholder="https://www.youtube.com/embed/..." value="' + esc(url) + '"' + (url ? ' class="vid-input has-url"' : '') + ' />' +
              '<button class="hqa-btn-save" data-id="' + esc(c.id) + '" data-idx="' + i + '">保存</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      var addLessonRow =
        '<div class="hqa-add-lesson">' +
          '<input type="text" class="add-lesson-title" data-cid="' + esc(c.id) + '" placeholder="新しいレッスン名" style="width:200px;" />' +
          '<input type="url" class="add-lesson-video" data-cid="' + esc(c.id) + '" placeholder="動画URL（任意）" style="width:280px;" />' +
          '<input type="text" class="add-lesson-text" data-cid="' + esc(c.id) + '" placeholder="テキスト内容" style="width:220px;" />' +
          '<button class="hqa-btn-add add-lesson-btn" data-cid="' + esc(c.id) + '" style="margin-top:2px;">レッスンを追加</button>' +
        '</div>';

      var delBtn = custom ? '<button class="hqa-btn-del del-course-btn" data-cid="' + esc(c.id) + '">削除</button>' : '';

      return '<div class="hqa-course" id="course-' + esc(c.id) + '">' +
        '<div class="hqa-course-head">' +
          '<span class="hqa-course-ico">' + esc(c.icon || '📖') + '</span>' +
          '<span class="hqa-course-title">' + esc(c.title) + (custom ? ' <span class="hqa-custom-badge">カスタム</span>' : '') + '</span>' +
          '<span class="hqa-course-meta">' + c.lessons.length + ' レッスン</span>' +
          delBtn +
          '<span class="hqa-course-toggle">▼</span>' +
        '</div>' +
        '<div class="hqa-course-body">' + lessonRows + addLessonRow + '</div>' +
      '</div>';
    }).join('');

    /* アコーディオン */
    el.querySelectorAll('.hqa-course-head').forEach(function (head) {
      head.addEventListener('click', function (e) {
        if (e.target.closest('.hqa-btn-del')) return;
        var course = head.closest('.hqa-course');
        course.classList.toggle('open');
      });
    });

    /* 動画URL保存 */
    el.querySelectorAll('.hqa-btn-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var idx = Number(btn.getAttribute('data-idx'));
        var input = el.querySelector('.vid-input[data-id="' + id + '"][data-idx="' + idx + '"]');
        Academy.setVideo(id, idx, input.value.trim());
        input.classList.toggle('has-url', !!input.value.trim());
        btn.textContent = '保存済み ✓'; btn.classList.add('saved');
        setTimeout(function () { btn.textContent = '保存'; btn.classList.remove('saved'); }, 2000);
        renderStats();
      });
    });

    /* レッスン追加 */
    el.querySelectorAll('.add-lesson-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cid = btn.getAttribute('data-cid');
        var title = el.querySelector('.add-lesson-title[data-cid="' + cid + '"]').value.trim();
        if (!title) return;
        var video = el.querySelector('.add-lesson-video[data-cid="' + cid + '"]').value.trim();
        var text = el.querySelector('.add-lesson-text[data-cid="' + cid + '"]').value.trim();
        Academy.addLesson(cid, { t: title, video: video, text: text });
        renderAll();
      });
    });

    /* コース削除 */
    el.querySelectorAll('.del-course-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-cid');
        if (!confirm('コース「' + cid + '」を削除しますか？')) return;
        Academy.deleteCourse(cid);
        renderAll();
      });
    });
  }

  /* ---- コース追加フォーム ---- */
  document.getElementById('btnAddCourse').addEventListener('click', function () {
    var icon = document.getElementById('ncIcon').value.trim() || '📖';
    var id = document.getElementById('ncId').value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    var title = document.getElementById('ncTitle').value.trim();
    var desc = document.getElementById('ncDesc').value.trim();
    if (!id || !title) { alert('コースIDとタイトルは必須です'); return; }
    if (Academy.allCourses().some(function (c) { return c.id === id; })) { alert('同じIDのコースが既に存在します'); return; }
    Academy.addCourse({ id: id, icon: icon, title: title, desc: desc, lessons: [] });
    document.getElementById('ncIcon').value = '';
    document.getElementById('ncId').value = '';
    document.getElementById('ncTitle').value = '';
    document.getElementById('ncDesc').value = '';
    renderAll();
  });

  function renderAll() { renderStats(); renderCourses(); }
  renderAll();
})();
