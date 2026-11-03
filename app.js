/* app.js — 交互、路由、状态、localStorage 持久化
 * 依赖：words.js 暴露全局 WORDS；logic.js 暴露全局 Logic。
 * 零外部依赖，全部相对路径。
 */
(function () {
  'use strict';

  var WORDS = (typeof window !== 'undefined' && window.WORDS) || [];
  var APP_VERSION = '1.0.0';
  var DAILY_COUNT = 25;
  var K = {
    learned: 'tjw_learned',
    wrong: 'tjw_wrong',
    settings: 'tjw_settings',
    today: 'tjw_today'
  };

  /* ---------------- 存储 ---------------- */
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
  }

  var learned = readJSON(K.learned, []);        // [id, ...]
  var wrongBook = readJSON(K.wrong, []);        // [id, ...]
  var settings = readJSON(K.settings, { hideCn: false, expandDetail: false });
  if (typeof settings.hideCn !== 'boolean') settings.hideCn = false;
  if (typeof settings.expandDetail !== 'boolean') settings.expandDetail = false;

  function learnedSet() { var s = {}; learned.forEach(function (id) { s[id] = 1; }); return s; }
  function isLearned(id) { return learned.indexOf(id) >= 0; }
  function saveLearned() { writeJSON(K.learned, learned); }
  function saveWrong() { writeJSON(K.wrong, wrongBook); }

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }
  var byId = {};
  WORDS.forEach(function (w) { byId[w.id] = w; });

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1600);
  }

  /* ---------------- 今日队列 ---------------- */
  var todayState = readJSON(K.today, null);
  if (!todayState || todayState.date !== todayStr() || !Array.isArray(todayState.ids)) {
    todayState = {
      date: todayStr(),
      ids: Logic.dailyPick(WORDS, learned, todayStr(), DAILY_COUNT)
    };
    writeJSON(K.today, todayState);
  }
  var todayIndex = 0;

  /* ---------------- 单词卡渲染 ---------------- */
  function meaningLine(e) {
    return e.posText ? (e.posText + '｜' + e.coreMeaning) : e.coreMeaning;
  }

  function chips(items, cls) {
    return '<div class="chips">' + items.map(function (t) {
      return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>';
    }).join('') + '</div>';
  }

  function listHTML(items) {
    return '<ul class="list">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }

  function detailHTML(e, open) {
    var html = '<div class="detail' + (open ? ' is-open' : '') + '" data-detail>' + '<div class="detail-inner">';

    // 完整释义
    html += '<div class="sect"><div class="sect-title">完整释义</div><div class="meaning-full">' +
      esc(e.fullMeanings.join('；') || e.meaning) + '</div></div>';

    // 高频搭配 / 练习短语
    html += '<div class="sect"><div class="sect-title">高频搭配 / 练习短语' +
      (e.collocations.type === 'collocation' ? '<span class="tag">真实搭配</span>' : '<span class="tag">句型模板</span>') +
      '</div>';
    if (e.collocations.type === 'collocation') {
      html += chips(e.collocations.items, 'en');
    } else {
      html += '<div class="tip-text">本词暂无收录的固定搭配，属规则句式，请参考下方「推荐句型」练习。</div>';
    }
    html += '</div>';

    // 推荐句型 / 练习模板
    var pats = Logic.sentencePatterns(e.word, e.pos);
    html += '<div class="sect"><div class="sect-title">推荐句型 / 练习模板<span class="tag">通用模板</span></div>' +
      chips(pats) + '</div>';

    // 练习句
    html += '<div class="sect"><div class="sect-title">练习句</div>' + listHTML(e.practiceSentences) + '</div>';

    // 词形变化
    html += '<div class="sect"><div class="sect-title">词形变化</div>';
    if (e.inflections.length) {
      html += '<dl class="kv">' + e.inflections.map(function (it) {
        return '<dt>' + esc(it.label) + '</dt><dd>' + esc(it.value) + '</dd>';
      }).join('') + '</dl>';
    } else {
      html += '<div class="tip-text">' + esc(e.inflectionsNote || '无固定词形变化。') + '</div>';
    }
    html += '</div>';

    // 发音提醒
    html += '<div class="sect"><div class="sect-title">发音提醒</div>' + listHTML(e.pronunciationTips) + '</div>';
    // 拼写提醒
    html += '<div class="sect"><div class="sect-title">拼写提醒</div>' + listHTML(e.spellingTips) + '</div>';

    // 易混提醒
    html += '<div class="sect"><div class="sect-title">易混提醒</div>';
    if (e.confusables.length) {
      html += listHTML(e.confusables.map(function (c) { return c.word + '：' + c.meaning; }));
    } else {
      html += '<div class="tip-text">词库中暂无拼写高度相近的词，注意与同音词区分即可。</div>';
    }
    html += '</div>';

    // 词族联想
    html += '<div class="sect"><div class="sect-title">词族联想</div>';
    if (e.wordFamily.length) {
      html += listHTML(e.wordFamily.map(function (c) { return c.word + '：' + c.meaning; }));
    } else {
      html += '<div class="tip-text">词库中暂无同词根的派生词。</div>';
    }
    html += '</div>';

    // 复习重点
    html += '<div class="sect"><div class="sect-title">复习重点</div>' + listHTML(e.reviewFocus) + '</div>';

    html += '</div></div>';
    return html;
  }

  function cardHTML(e, opts) {
    opts = opts || {};
    var hidden = !!settings.hideCn;
    var open = (opts.forceOpen !== undefined) ? opts.forceOpen : settings.expandDetail;
    return '<article class="wcard glass" data-card="' + esc(e.id) + '">' +
      '<div class="wcard-head"><div>' +
        '<div class="w-word">' + esc(e.word) + '</div>' +
        '<div class="w-phon">' + esc(e.phonetic) + '</div>' +
        '<span class="w-pos">' + esc(e.posText) + '</span>' +
      '</div><div class="w-ltr">' + esc(e.letter || '') + '</div></div>' +
      '<div class="w-core' + (hidden ? ' is-hidden' : '') + '" data-core>' + esc(e.coreMeaning) + '</div>' +
      '<button class="detail-toggle" type="button" data-dtoggle>' + (open ? '收起详解' : '展开详解') + '</button>' +
      detailHTML(e, open) +
    '</article>';
  }

  function bindCardInteractions(root) {
    var core = root.querySelector('[data-core]');
    if (core) {
      core.addEventListener('click', function () {
        if (core.classList.contains('is-hidden')) core.classList.remove('is-hidden');
      });
    }
    var btn = root.querySelector('[data-dtoggle]');
    if (btn) {
      btn.addEventListener('click', function () {
        var d = root.querySelector('[data-detail]');
        var willOpen = !d.classList.contains('is-open');
        d.classList.toggle('is-open', willOpen);
        btn.textContent = willOpen ? '收起详解' : '展开详解';
      });
    }
  }

  /* ---------------- 今日视图 ---------------- */
  function currentWord() {
    var id = todayState.ids[todayIndex];
    return byId[id];
  }

  function updateTodayProgress() {
    var done = 0;
    todayState.ids.forEach(function (id) { if (isLearned(id)) done++; });
    $('todayCounter').textContent = (todayIndex + 1) + ' / ' + todayState.ids.length;
    $('todayDone').textContent = '今日已学 ' + done;
    $('todayBar').style.width = Math.round(((todayIndex + 1) / todayState.ids.length) * 100) + '%';
    var w = currentWord();
    $('todayMark').textContent = w && isLearned(w.id) ? '取消已学' : '标记已学';
  }

  function renderToday() {
    var host = $('todayCardHost');
    var w = currentWord();
    if (!w) { host.innerHTML = '<div class="glass panel">暂无单词。</div>'; return; }
    var e = Logic.enhance(w, WORDS);
    host.innerHTML = cardHTML(e);
    bindCardInteractions(host);
    updateTodayProgress();
    syncSwitches();
    host.querySelector('[data-card]').style.animation = 'none';
    // 触发重排后再播放动画（切换词卡时）
    void host.offsetWidth;
    host.querySelector('[data-card]').style.animation = '';
  }

  function syncSwitches() {
    var t1 = $('toggleCn'), t2 = $('toggleDetail');
    t1.classList.toggle('is-on', settings.hideCn);
    t1.textContent = settings.hideCn ? '显示中文' : '遮住中文';
    t2.classList.toggle('is-on', settings.expandDetail);
    t2.textContent = settings.expandDetail ? '收起详解' : '展开详解';
  }

  function gotoToday(delta) {
    var n = todayIndex + delta;
    if (n < 0) { toast('已经是第一个了'); return; }
    if (n >= todayState.ids.length) { toast('今天这 25 个词已过完'); return; }
    todayIndex = n;
    renderToday();
  }

  function toggleMark() {
    var w = currentWord();
    if (!w) return;
    var i = learned.indexOf(w.id);
    if (i >= 0) { learned.splice(i, 1); toast('已取消标记'); }
    else { learned.push(w.id); toast('已标记为已学 ✓'); }
    saveLearned();
    updateTodayProgress();
  }

  /* ---------------- 复习视图 ---------------- */
  var quiz = null;

  function buildQuiz() {
    var pool = learned.map(function (id) { return byId[id]; }).filter(Boolean);
    if (pool.length < 10) pool = WORDS.slice(0);
    var seed = Logic.hashSeed(todayStr() + '#quiz#' + pool.length);
    var picked = Logic.seededShuffle(pool, seed).slice(0, Math.min(10, pool.length));
    var questions = picked.map(function (w) {
      var e = Logic.enhance(w, WORDS);
      var tag = e.pos.length ? e.pos[0].tag : '';
      var first = Logic.cleanBase(w.word).charAt(0);
      var distract = WORDS.filter(function (x) {
        if (x.id === w.id) return false;
        var xe = { pos: Logic.parsePOS(x.meaning) };
        var xtag = xe.pos.length ? xe.pos[0].tag : '';
        var xfirst = Logic.cleanBase(x.word).charAt(0);
        return (tag && xtag === tag) || (first && xfirst === first);
      });
      if (distract.length < 3) distract = WORDS.filter(function (x) { return x.id !== w.id; });
      var ds = Logic.seededShuffle(distract, Logic.hashSeed(String(w.id))).slice(0, 3);
      var options = ds.map(function (x) { return { id: x.id, text: Logic.splitMeanings(x.meaning)[0] || x.meaning }; });
      options.push({ id: w.id, text: e.coreMeaning });
      options = Logic.seededShuffle(options, Logic.hashSeed('opt' + w.id));
      return { entry: w, e: e, options: options, chosen: null };
    });
    return { questions: questions, index: 0, right: 0 };
  }

  function renderReview() {
    var host = $('reviewHost');
    if (!quiz) quiz = buildQuiz();

    if (!quiz.questions.length) {
      host.innerHTML = '<div class="glass panel quiz-empty">暂无可复习的单词。</div>';
      return;
    }
    if (quiz.index >= quiz.questions.length) {
      host.innerHTML = '<div class="glass panel" style="text-align:center">' +
        '<div class="s-num" style="font-size:40px">' + quiz.right + ' / ' + quiz.questions.length + '</div>' +
        '<div class="muted" style="margin:10px 0 18px">本轮复习完成</div>' +
        '<button class="btn btn-primary btn-wide" id="quizRestart" type="button">再来一轮</button></div>';
      $('quizRestart').addEventListener('click', function () { quiz = buildQuiz(); renderReview(); });
      return;
    }

    var q = quiz.questions[quiz.index];
    var e = q.e;
    var answered = q.chosen !== null;

    var html = '<div class="score-line"><span>第 ' + (quiz.index + 1) + ' / ' + quiz.questions.length + ' 题</span>' +
      '<span>答对 ' + quiz.right + '</span></div>';
    html += '<div class="quiz-q glass"><div class="q-label">选择正确的中文释义</div>' +
      '<div class="q-word">' + esc(e.word) + '</div>' +
      '<div class="q-phon">' + esc(e.phonetic) + '</div></div>';

    html += q.options.map(function (op, i) {
      var cls = 'opt';
      if (answered) {
        if (op.id === e.id) cls += ' is-right';
        else if (op.id === q.chosen) cls += ' is-wrong';
      }
      return '<button class="' + cls + '" data-opt="' + esc(op.id) + '" type="button"' + (answered ? ' disabled' : '') + '>' +
        '<span class="idx">' + 'ABCD'.charAt(i) + '</span><span>' + esc(op.text) + '</span></button>';
    }).join('');

    if (answered) {
      var ok = q.chosen === e.id;
      html += '<div class="explain glass">' +
        (ok ? '<div class="ok-line">✓ 回答正确</div>' : '<div class="bad-line">✕ 回答错误，正确释义：' + esc(e.coreMeaning) + '</div>') +
        '<div class="sect"><div class="sect-title">高频搭配</div>' +
          (e.collocations.type === 'collocation'
            ? chips(e.collocations.items, 'en')
            : chips(Logic.sentencePatterns(e.word, e.pos))) +
        '</div>' +
        '<div class="sect"><div class="sect-title">练习句</div>' + listHTML(e.practiceSentences) + '</div>' +
        '<div class="teacher-box"><strong style="color:var(--c2)">老师点拨：</strong>' + esc(e.teacherTip) + '</div>' +
        '<div class="sect" style="margin-top:14px"><button class="btn btn-primary btn-wide" id="quizNext" type="button">' +
          (quiz.index + 1 >= quiz.questions.length ? '查看结果' : '下一题') + '</button></div>' +
        '</div>';
    } else {
      html += '<div class="muted" style="text-align:center;margin-top:16px">答完后会显示讲解与老师点拨</div>';
    }

    host.innerHTML = html;

    host.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { answerQuiz(parseInt(b.getAttribute('data-opt'), 10)); });
    });
    var next = $('quizNext');
    if (next) next.addEventListener('click', function () { quiz.index++; renderReview(); });
  }

  function answerQuiz(optId) {
    var q = quiz.questions[quiz.index];
    if (q.chosen !== null) return;
    q.chosen = optId;
    var correctId = q.e.id;
    if (optId === correctId) {
      quiz.right++;
      var wi = wrongBook.indexOf(correctId);
      if (wi >= 0) { wrongBook.splice(wi, 1); saveWrong(); }
    } else {
      if (wrongBook.indexOf(correctId) < 0) { wrongBook.push(correctId); saveWrong(); }
    }
    renderReview();
  }

  /* ---------------- 词库视图 ---------------- */
  var libQuery = '';

  function matchEntry(w, q) {
    if (!q) return true;
    var word = Logic.cleanBase(w.word);
    if (word.indexOf(q) >= 0) return true;
    if (String(w.word).toLowerCase().indexOf(q) >= 0) return true;
    if (String(w.meaning).indexOf(q) >= 0) return true;
    return false;
  }

  function renderLibrary() {
    var host = $('libraryHost');
    var q = libQuery.trim().toLowerCase();
    var list = WORDS.filter(function (w) { return matchEntry(w, q); });
    $('libMeta').textContent = q ? ('搜索到 ' + list.length + ' 个词条') : ('共 ' + WORDS.length + ' 个词条');

    if (!list.length) {
      host.innerHTML = '<div class="glass panel" style="text-align:center;color:var(--muted)">没有匹配的词条</div>';
      return;
    }
    var html = '';
    var curLetter = null;
    list.forEach(function (w) {
      var letter = w.letter || '#';
      if (letter !== curLetter) {
        curLetter = letter;
        html += '<div class="letter-head">' + esc(letter) + '</div>';
      }
      html += '<div class="wrow" data-wid="' + esc(w.id) + '">' +
        '<span class="rw-word">' + esc(w.word) + '</span>' +
        '<span class="rw-phon">' + esc(w.phonetic) + '</span>' +
        (isLearned(w.id) ? '<span class="rw-star">✓</span>' : '') +
        '<span class="rw-meaning">' + esc(Logic.splitMeanings(w.meaning)[0] || w.meaning) + '</span>' +
        '</div>';
    });
    host.innerHTML = html;

    host.querySelectorAll('[data-wid]').forEach(function (row) {
      row.addEventListener('click', function () { openSheet(parseInt(row.getAttribute('data-wid'), 10)); });
    });
  }

  /* ---------------- 单词详情弹层 ---------------- */
  function openSheet(id) {
    var w = byId[id];
    if (!w) return;
    var e = Logic.enhance(w, WORDS);
    var sheet = $('wordSheet');
    var panel = sheet.querySelector('.sheet-panel');
    $('sheetHost').innerHTML = cardHTML(e, { forceOpen: true });
    sheet.hidden = false;
    if (panel) panel.scrollTop = 0;
    var card = $('sheetHost').querySelector('[data-card]');
    bindCardInteractions(card);
    var toggle = card.querySelector('.detail-toggle');
    if (toggle) toggle.style.display = 'none';
  }
  function closeSheet() {
    var sheet = $('wordSheet');
    var panel = sheet.querySelector('.sheet-panel');
    sheet.hidden = true;
    $('sheetHost').innerHTML = '';
    if (panel) panel.scrollTop = 0;
  }

  /* ---------------- 我的视图 ---------------- */
  function renderMe() {
    var total = WORDS.length;
    var learnedCount = learned.filter(function (id) { return byId[id]; }).length;
    var pct = total ? Math.round((learnedCount / total) * 1000) / 10 : 0;
    var todayWordDone = todayState.ids.filter(function (id) { return isLearned(id); }).length;
    var wrongCount = wrongBook.filter(function (id) { return byId[id]; }).length;

    var html = '<div class="stat-grid">' +
      '<div class="stat glass"><div class="s-num">' + total + '</div><div class="s-label">总词数</div></div>' +
      '<div class="stat glass"><div class="s-num">' + learnedCount + '</div><div class="s-label">已学数量</div></div>' +
      '<div class="stat glass"><div class="s-num">' + pct + '%</div><div class="s-label">已学比例</div></div>' +
      '<div class="stat glass"><div class="s-num">' + todayWordDone + ' / ' + todayState.ids.length + '</div><div class="s-label">今日已学</div></div>' +
      '</div>';

    html += '<div class="panel glass"><div class="progress-text"><span style="font-size:15px">学习进度</span>' +
      '<span class="muted">' + learnedCount + ' / ' + total + '</span></div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>';

    html += '<div class="panel glass"><div class="progress-text"><span style="font-size:15px">错词本</span>' +
      '<span class="muted">' + wrongCount + ' 个</span></div>' +
      (wrongCount
        ? '<div class="chips" style="margin-top:10px">' + wrongBook.filter(function (id) { return byId[id]; }).map(function (id) {
            return '<span class="chip" data-goword="' + esc(id) + '">' + esc(byId[id].word) + '</span>';
          }).join('') + '</div>'
        : '<div class="muted" style="margin-top:8px">还没有错题，去「复习」做几道题吧。</div>') +
      '</div>';

    html += '<button class="btn danger btn-wide" id="resetBtn" type="button">重置学习进度</button>';

    html += '<div class="ver-line muted">版本 v' + APP_VERSION + ' · 词库 ' + total + ' 条 · 学习进度存于本机</div>';

    $('meHost').innerHTML = html;

    $('resetBtn').addEventListener('click', function () {
      if (window.confirm('确定要清空全部学习进度与错词本吗？此操作不可撤销。')) {
        if (window.confirm('再次确认：重置后「已学」「错词本」「今日进度」都会清空。继续？')) {
          learned = []; wrongBook = [];
          writeJSON(K.learned, learned); writeJSON(K.wrong, wrongBook);
          localStorage.removeItem(K.today);
          todayState = { date: todayStr(), ids: Logic.dailyPick(WORDS, learned, todayStr(), DAILY_COUNT) };
          writeJSON(K.today, todayState);
          todayIndex = 0;
          quiz = null;
          renderToday(); renderLibrary(); renderMe();
          toast('已重置学习进度');
        }
      }
    });

    $('meHost').querySelectorAll('[data-goword]').forEach(function (c) {
      c.addEventListener('click', function () { openSheet(parseInt(c.getAttribute('data-goword'), 10)); });
    });
  }

  /* ---------------- 路由 ---------------- */
  var currentTab = 'today';
  var VIEW_TITLE = { today: '今日学习', review: '复习测验', library: '浏览词库', me: '我的进度' };

  function switchTab(tab) {
    if (tab === currentTab) {
      // 重复点击仍重绘，保证数据最新
    }
    currentTab = tab;
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.getAttribute('data-view') === tab);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === tab);
    });
    $('topSub').textContent = VIEW_TITLE[tab] || '';
    if (tab === 'today') renderToday();
    else if (tab === 'review') renderReview();
    else if (tab === 'library') renderLibrary();
    else if (tab === 'me') renderMe();
    document.querySelector('.main').scrollTop = 0;
  }

  /* ---------------- 绑定 ---------------- */
  function bindGlobal() {
    $('tabbar').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.tab');
      if (btn) switchTab(btn.getAttribute('data-tab'));
    });

    $('todayPrev').addEventListener('click', function () { gotoToday(-1); });
    $('todayNext').addEventListener('click', function () { gotoToday(1); });
    $('todayMark').addEventListener('click', toggleMark);

    $('toggleCn').addEventListener('click', function () {
      settings.hideCn = !settings.hideCn;
      writeJSON(K.settings, settings);
      renderToday();
    });
    $('toggleDetail').addEventListener('click', function () {
      settings.expandDetail = !settings.expandDetail;
      writeJSON(K.settings, settings);
      renderToday();
    });

    var input = $('searchInput');
    var clear = $('searchClear');
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var v = input.value;
      clear.hidden = !v;
      timer = setTimeout(function () { libQuery = v; renderLibrary(); }, 120);
    });
    clear.addEventListener('click', function () {
      input.value = ''; libQuery = ''; clear.hidden = true; renderLibrary();
    });

    $('sheetClose').addEventListener('click', closeSheet);
    $('wordSheet').addEventListener('click', function (ev) {
      if (ev.target.getAttribute && ev.target.getAttribute('data-close')) closeSheet();
    });

    // iPad 键盘收起等场景：点空白处不做特殊处理
  }

  /* ---------------- Service Worker ---------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    try {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* 静默忽略 */ });
    } catch (e) { /* 静默忽略 */ }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!WORDS.length) {
      document.getElementById('todayCardHost').innerHTML =
        '<div class="glass panel">词库未加载（words.js 读取失败）。</div>';
      return;
    }
    bindGlobal();
    switchTab('today');
    registerSW();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
