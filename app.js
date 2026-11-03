/* app.js — 交互、路由、状态、localStorage 持久化
 * 依赖：words.js 暴露全局 WORDS；logic.js 暴露全局 Logic。
 * 零外部依赖，全部相对路径。
 */
(function () {
  'use strict';

  var WORDS = (typeof window !== 'undefined' && window.WORDS) || [];
  var APP_VERSION = '1.2.0';
  var DAILY_COUNT = 25;
  var K = {
    learned: 'tjw_learned',
    wrong: 'tjw_wrong',
    settings: 'tjw_settings',
    today: 'tjw_today',
    stats: 'tjw_stats'
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

  // 每日学习记录：{ 'YYYY-MM-DD': { learned: [id...], right: n, total: n } }
  var stats = readJSON(K.stats, {});
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) stats = {};

  function saveStats() { writeJSON(K.stats, stats); }
  function statOf(key) {
    var s = stats[key];
    if (!s || typeof s !== 'object' || Array.isArray(s)) { s = { learned: [], right: 0, total: 0 }; stats[key] = s; }
    if (!Array.isArray(s.learned)) s.learned = [];
    if (typeof s.right !== 'number') s.right = 0;
    if (typeof s.total !== 'number') s.total = 0;
    return s;
  }
  function isActiveDay(key) {
    var s = stats[key];
    return !!(s && (((s.learned || []).length) || s.total));
  }
  function streakDays() {
    var n = 0;
    var d = new Date();
    if (!isActiveDay(fmtDate(d))) d.setDate(d.getDate() - 1); // 今天还没活动，从昨天起算
    while (isActiveDay(fmtDate(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

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
  function fmtDate(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function todayStr() { return fmtDate(new Date()); }
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

  /* ---------------- 发音（零依赖，走系统语音合成） ---------------- */
  var SPEAK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M4 9h3.2L12 5.2v13.6L7.2 15H4z" fill="currentColor"/>' +
    '<path d="M15.5 8.6a4.2 4.2 0 0 1 0 6.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  function speak(text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return;
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      toast('当前环境不支持朗读');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(t);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) { toast('朗读失败'); }
  }

  function speakBtn(word) {
    return '<button class="speak" data-speak="' + esc(word) + '" type="button" aria-label="朗读 ' + esc(word) + '">' + SPEAK_SVG + '</button>';
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
        '<div class="w-word">' + esc(e.word) + speakBtn(e.word) + '</div>' +
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
    var sp = root.querySelector('[data-speak]');
    if (sp) sp.addEventListener('click', function (ev) {
      ev.stopPropagation();
      speak(sp.getAttribute('data-speak'));
    });
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
    var s = statOf(todayStr());
    if (i >= 0) {
      learned.splice(i, 1);
      var si = s.learned.indexOf(w.id);
      if (si >= 0) s.learned.splice(si, 1);
      saveStats();
      toast('已取消标记');
    } else {
      learned.push(w.id);
      if (s.learned.indexOf(w.id) < 0) s.learned.push(w.id);
      saveStats();
      toast('已标记为已学 ✓');
    }
    saveLearned();
    updateTodayProgress();
  }

  /* ---------------- 复习视图（范围 + 听说读写四题型） ---------------- */
  var quiz = null;
  var QUIZ_TYPES = ['read', 'listen', 'write', 'speak'];
  var SCOPE_LABEL = { today: '今天的', learned: '全部已学', wrong: '错词本' };
  var TYPE_LABEL = { mix: '综合', read: '读', listen: '听', write: '写', speak: '说' };
  var MIC_LABEL = '开始朗读';

  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">' +
    '<path d="M4 9h3.2L12 5.2v13.6L7.2 15H4z" fill="currentColor"/>' +
    '<path d="M15.5 8.6a4.2 4.2 0 0 1 0 6.8M18.4 6a7.6 7.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  function normWord(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z]/g, ''); }

  function matchSpoken(transcript, target) {
    var t = String(transcript == null ? '' : transcript).toLowerCase();
    var parts = t.replace(/[^a-z\s']/g, ' ').split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].replace(/[^a-z]/g, '') === target) return true;
    }
    return normWord(t) === target;
  }

  // 干扰项：优先取同词性/同首字母的词，不足则全库随机
  function distractorWords(w, n) {
    var pos = Logic.parsePOS(w.meaning);
    var tag = pos.length ? pos[0].tag : '';
    var first = Logic.cleanBase(w.word).charAt(0);
    var pool = WORDS.filter(function (x) {
      if (x.id === w.id) return false;
      var xtag = Logic.parsePOS(x.meaning);
      return (tag && xtag.length && xtag[0].tag === tag) || (first && Logic.cleanBase(x.word).charAt(0) === first);
    });
    if (pool.length < n) pool = WORDS.filter(function (x) { return x.id !== w.id; });
    return Logic.seededShuffle(pool, Logic.hashSeed(String(w.id))).slice(0, n);
  }

  function quizPool(scope) {
    var ids;
    if (scope === 'today') {
      ids = statOf(todayStr()).learned.slice();       // 今天标记已学的
      if (!ids.length) ids = todayState.ids.slice();  // 今天还没标记 → 拿今天这 25 个词
    } else if (scope === 'wrong') {
      ids = wrongBook.slice();
    } else {
      ids = learned.slice();
      if (ids.length < 10) return WORDS.slice(0);     // 已学不足 10 个 → 全库兜底
    }
    return ids.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function buildQuiz(opts) {
    if (Array.isArray(opts)) opts = { ids: opts };  // 兼容旧调用 buildQuiz(idList)
    opts = opts || {};
    var scope = opts.scope || 'learned';
    var type = opts.type || 'mix';
    var pool = (opts.ids && opts.ids.length)
      ? opts.ids.map(function (id) { return byId[id]; }).filter(Boolean)
      : quizPool(scope);
    var seed = Logic.hashSeed(todayStr() + '#quiz#' + scope + '#' + type + '#' + pool.length);
    var picked = Logic.seededShuffle(pool, seed).slice(0, Math.min(10, pool.length));

    var questions = picked.map(function (w, qi) {
      var e = Logic.enhance(w, WORDS);
      var t = (type === 'mix') ? QUIZ_TYPES[(seed + qi) % QUIZ_TYPES.length] : type;
      var q = { entry: w, e: e, type: t, options: null, answered: false, ok: false, given: null };
      if (t === 'read') {
        q.options = distractorWords(w, 3).map(function (x) {
          return { id: x.id, text: Logic.splitMeanings(x.meaning)[0] || x.meaning };
        });
        q.options.push({ id: w.id, text: e.coreMeaning });
        q.options = Logic.seededShuffle(q.options, Logic.hashSeed('opt' + w.id));
      } else if (t === 'listen') {
        q.options = distractorWords(w, 3).map(function (x) { return { id: x.id, text: x.word }; });
        q.options.push({ id: w.id, text: w.word });
        q.options = Logic.seededShuffle(q.options, Logic.hashSeed('opt' + w.id));
      }
      return q;
    });
    return { scope: scope, type: type, questions: questions, index: 0, right: 0 };
  }

  function renderQuizSegs() {
    var scope = quiz ? quiz.scope : 'today';
    var type = quiz ? quiz.type : 'mix';
    document.querySelectorAll('#scopeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-scope') === scope);
    });
    document.querySelectorAll('#typeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-qtype') === type);
    });
  }

  function quizEmptyMsg() {
    if (quiz && quiz.scope === 'wrong') return '错词本是空的。先去其它范围做几道题吧。';
    if (quiz && quiz.scope === 'today') return '今天还没有单词可练。';
    return '暂无可复习的单词。';
  }

  function qStemHTML(q) {
    var e = q.e;
    var label = {
      read: '选择正确的中文释义',
      listen: '点击播放，选出你听到的单词',
      write: '根据中文释义拼写出英文单词',
      speak: '朗读下面的单词'
    }[q.type];
    var h = '<div class="quiz-q glass"><div class="q-label">' + esc(label) + '</div>';
    if (q.type === 'listen') {
      h += '<button class="play-big" data-play="1" type="button" aria-label="播放读音">' + PLAY_SVG + '</button>' +
        '<div class="q-phon">没听清可重复点击</div>';
    } else if (q.type === 'write') {
      h += '<div class="q-cn">' + esc(e.coreMeaning) + '</div>' +
        (e.posText ? '<div class="q-phon">' + esc(e.posText) + '</div>' : '');
    } else {
      h += '<div class="q-word">' + esc(e.word) + speakBtn(e.word) + '</div>' +
        '<div class="q-phon">' + esc(e.phonetic) + '</div>';
    }
    h += '</div>';
    return h;
  }

  function qOptionsHTML(q) {
    return q.options.map(function (op, i) {
      var cls = 'opt';
      if (q.answered) {
        if (op.id === q.e.id) cls += ' is-right';
        else if (op.id === q.given) cls += ' is-wrong';
      }
      return '<button class="' + cls + '" data-opt="' + esc(op.id) + '" type="button"' + (q.answered ? ' disabled' : '') + '>' +
        '<span class="idx">' + 'ABCD'.charAt(i) + '</span>' +
        '<span' + (q.type === 'listen' ? ' class="opt-en"' : '') + '>' + esc(op.text) + '</span></button>';
    }).join('');
  }

  function qAnswerArea(q) {
    if (q.type === 'read' || q.type === 'listen') return qOptionsHTML(q);

    if (q.type === 'write') {
      var cls = 'q-input' + (q.answered ? (q.ok ? ' is-right' : ' is-wrong') : '');
      return '<div class="q-write">' +
        '<input class="' + cls + '" id="qInput" type="text" value="' + esc(q.answered ? (q.given || '') : '') + '"' +
        ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
        ' placeholder="在这里拼写英文单词"' + (q.answered ? ' disabled' : '') + '>' +
        (q.answered ? '' : '<button class="btn btn-primary btn-wide" id="qCheck" type="button" style="margin-top:10px">检查</button>') +
        '</div>';
    }

    // speak
    if (q.answered) {
      return '<div class="q-answer-line">' + (q.ok ? '✓ 记作读对' : '✕ 记作没读对') + '</div>';
    }
    var h = '<div class="speak-btns">' +
      '<button class="btn btn-ghost" id="qDemo" type="button">听示范读音</button>';
    if (speechSupported()) h += '<button class="btn btn-ghost" id="qMic" type="button">' + MIC_LABEL + '</button>';
    h += '</div>';
    if (!speechSupported()) {
      h += '<div class="speak-note">此设备不支持语音识别，请自己判断是否读对。</div>';
    }
    h += '<div class="self-row">' +
      '<button class="btn btn-ghost" data-self="1" type="button">读对了</button>' +
      '<button class="btn btn-ghost" data-self="0" type="button">没读对</button></div>';
    return h;
  }

  function qExplainHTML(q) {
    var e = q.e;
    var head;
    if (q.type === 'write') {
      head = q.ok ? '<div class="ok-line">✓ 拼写正确</div>'
        : '<div class="bad-line">✕ 拼写有误，正确拼写：' + esc(e.word) + '</div>';
    } else if (q.type === 'speak') {
      head = q.ok ? '<div class="ok-line">✓ 读对了</div>'
        : '<div class="bad-line">✕ 没读对，正确单词：' + esc(e.word) + '</div>';
    } else if (q.type === 'listen') {
      head = q.ok ? '<div class="ok-line">✓ 听音正确</div>'
        : '<div class="bad-line">✕ 听错了，正确单词：' + esc(e.word) + '</div>';
    } else {
      head = q.ok ? '<div class="ok-line">✓ 回答正确</div>'
        : '<div class="bad-line">✕ 回答错误，正确释义：' + esc(e.coreMeaning) + '</div>';
    }

    var h = '<div class="explain glass">' + head;
    // 听/说题型题干里没给中文释义，这里补上
    if (q.type === 'listen' || q.type === 'speak') {
      h += '<div class="sect"><div class="sect-title">释义</div><div class="meaning-full">' +
        esc(e.posText ? (e.posText + '｜' + e.fullMeanings.join('；')) : e.fullMeanings.join('；')) + '</div></div>';
    }
    h += '<div class="sect"><div class="sect-title">高频搭配</div>' +
      (e.collocations.type === 'collocation'
        ? chips(e.collocations.items, 'en')
        : chips(Logic.sentencePatterns(e.word, e.pos))) + '</div>';
    h += '<div class="sect"><div class="sect-title">练习句</div>' + listHTML(e.practiceSentences) + '</div>';
    if (q.type === 'speak' || q.type === 'listen') {
      h += '<div class="sect"><div class="sect-title">发音提醒</div>' + listHTML(e.pronunciationTips) + '</div>';
    }
    h += '<div class="teacher-box"><strong style="color:var(--c2)">老师点拨：</strong>' + esc(e.teacherTip) + '</div>';
    h += '<div class="sect" style="margin-top:14px"><button class="btn btn-primary btn-wide" id="quizNext" type="button">' +
      (quiz.index + 1 >= quiz.questions.length ? '查看结果' : '下一题') + '</button></div>';
    h += '</div>';
    return h;
  }

  function renderReview() {
    var host = $('reviewHost');
    if (!quiz) quiz = buildQuiz({ scope: 'today', type: 'mix' });
    renderQuizSegs();

    if (!quiz.questions.length) {
      host.innerHTML = '<div class="glass panel quiz-empty">' + esc(quizEmptyMsg()) + '</div>';
      return;
    }
    if (quiz.index >= quiz.questions.length) {
      host.innerHTML = '<div class="glass panel" style="text-align:center">' +
        '<div class="s-num" style="font-size:40px">' + quiz.right + ' / ' + quiz.questions.length + '</div>' +
        '<div class="muted" style="margin:10px 0 18px">本轮「' + esc(SCOPE_LABEL[quiz.scope] || '') + ' · ' + esc(TYPE_LABEL[quiz.type] || '') + '」完成</div>' +
        '<button class="btn btn-primary btn-wide" id="quizRestart" type="button">再来一轮</button></div>';
      $('quizRestart').addEventListener('click', function () {
        quiz = buildQuiz({ scope: quiz.scope, type: quiz.type });
        renderReview();
      });
      return;
    }

    var q = quiz.questions[quiz.index];
    var html = '<div class="score-line"><span>第 ' + (quiz.index + 1) + ' / ' + quiz.questions.length + ' 题</span>' +
      '<span>答对 ' + quiz.right + '</span></div>';
    html += qStemHTML(q);
    html += qAnswerArea(q);
    if (q.answered) html += qExplainHTML(q);
    else html += '<div class="muted" style="text-align:center;margin-top:16px">答完后会显示讲解与老师点拨</div>';
    host.innerHTML = html;

    bindQuiz(host, q);
    if (q.type === 'listen' && !q.answered) speak(q.e.word);
  }

  function bindQuiz(host, q) {
    host.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { answerChoice(parseInt(b.getAttribute('data-opt'), 10)); });
    });
    var sp = host.querySelector('[data-speak]');
    if (sp) sp.addEventListener('click', function (ev) { ev.stopPropagation(); speak(sp.getAttribute('data-speak')); });
    var pb = host.querySelector('[data-play]');
    if (pb) pb.addEventListener('click', function () { speak(q.e.word); });
    var demo = $('qDemo');
    if (demo) demo.addEventListener('click', function () { speak(q.e.word); });
    var input = $('qInput');
    if (input && !q.answered) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); submitWrite(); }
      });
    }
    var check = $('qCheck');
    if (check) check.addEventListener('click', submitWrite);
    var mic = $('qMic');
    if (mic) mic.addEventListener('click', startSpeech);
    host.querySelectorAll('[data-self]').forEach(function (b) {
      b.addEventListener('click', function () { finishQuestion(b.getAttribute('data-self') === '1', 'self'); });
    });
    var next = $('quizNext');
    if (next) next.addEventListener('click', function () { quiz.index++; renderReview(); });
  }

  function answerChoice(optId) {
    var q = quiz.questions[quiz.index];
    if (q.answered) return;
    finishQuestion(optId === q.e.id, optId);
  }

  function submitWrite() {
    var q = quiz.questions[quiz.index];
    if (!q || q.answered || q.type !== 'write') return;
    var input = $('qInput');
    var val = input ? input.value : '';
    if (!String(val).trim()) { toast('先拼写一下再检查'); return; }
    finishQuestion(normWord(val) === normWord(Logic.cleanBase(q.e.word)), String(val).trim());
  }

  // 统一判分：对错入统计、错词本增删，然后重绘
  function finishQuestion(ok, given) {
    var q = quiz.questions[quiz.index];
    if (q.answered) return;
    q.answered = true;
    q.ok = !!ok;
    q.given = given;
    var cid = q.e.id;
    var s = statOf(todayStr());
    s.total++;
    if (ok) {
      quiz.right++;
      s.right++;
      var wi = wrongBook.indexOf(cid);
      if (wi >= 0) { wrongBook.splice(wi, 1); saveWrong(); }
    } else {
      if (wrongBook.indexOf(cid) < 0) { wrongBook.push(cid); saveWrong(); }
    }
    saveStats();
    renderReview();
  }

  /* ---------------- 语音识别（说的题型；不可用则退化为自评） ---------------- */
  var SRClass = (typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
  var recog = null;

  function speechSupported() { return !!SRClass; }

  function resetMicBtn() {
    var b = $('qMic');
    if (b) { b.classList.remove('is-rec'); b.textContent = MIC_LABEL; }
  }

  function startSpeech() {
    var q = quiz && quiz.questions[quiz.index];
    if (!q || q.answered) return;
    if (!SRClass) { toast('当前浏览器不支持语音识别'); return; }
    if (recog) { try { recog.abort(); } catch (e) { /* ignore */ } }
    var r;
    try { r = new SRClass(); } catch (e) { toast('语音识别不可用'); return; }
    recog = r;
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 5;

    var btn = $('qMic');
    if (btn) { btn.classList.add('is-rec'); btn.textContent = '正在听…'; }

    r.onresult = function (ev) {
      var alts = [];
      try {
        var res = ev.results[0];
        for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      } catch (e) { /* ignore */ }
      var target = normWord(Logic.cleanBase(q.e.word));
      var ok = alts.some(function (t) { return matchSpoken(t, target); });
      toast(ok ? '识别成功 ✓' : ('识别为：' + (alts[0] || '（空）')));
      finishQuestion(ok, alts.join(' / '));
    };
    r.onerror = function (ev) {
      var m = (ev && ev.error) || 'unknown';
      if (m === 'not-allowed' || m === 'service-not-allowed') toast('麦克风未授权，请用下方自评');
      else if (m === 'no-speech') toast('没听到声音，再试一次');
      else toast('语音识别失败（' + m + '），请用下方自评');
      resetMicBtn();
    };
    r.onend = function () { resetMicBtn(); };
    try { r.start(); } catch (e) { toast('无法启动语音识别'); resetMicBtn(); }
  }

  function setQuizScope(scope) {
    if (quiz && quiz.scope === scope) return;
    quiz = buildQuiz({ scope: scope, type: quiz ? quiz.type : 'mix' });
    renderReview();
  }

  function setQuizType(type) {
    if (quiz && quiz.type === type) return;
    quiz = buildQuiz({ scope: quiz ? quiz.scope : 'today', type: type });
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

  /* ---------------- 错词本（独立页） ---------------- */
  function renderWrong() {
    var host = $('wrongHost');
    var ids = wrongBook.filter(function (id) { return byId[id]; });
    if (!ids.length) {
      host.innerHTML = '<div class="glass panel" style="text-align:center;color:var(--muted)">错词本是空的。去「复习」做几道题吧。</div>';
      return;
    }
    var n = Math.min(10, ids.length);
    var html = '<div class="score-line"><span>共 ' + ids.length + ' 个错词</span><span>答对一次即自动移出</span></div>';
    html += '<button class="btn btn-primary btn-wide" id="wrongRedo" type="button" style="margin-bottom:12px">重做错题（' + n + ' 题）</button>';
    html += ids.map(function (id) {
      var w = byId[id];
      return '<div class="wrow" data-wid="' + esc(id) + '">' +
        '<span class="rw-word">' + esc(w.word) + '</span>' +
        '<span class="rw-phon">' + esc(w.phonetic) + '</span>' +
        '<span class="rw-meaning">' + esc(Logic.splitMeanings(w.meaning)[0] || w.meaning) + '</span>' +
        '<button class="rw-del" data-del="' + esc(id) + '" type="button" aria-label="移出错词本">✕</button>' +
        '</div>';
    }).join('');
    host.innerHTML = html;

    $('wrongRedo').addEventListener('click', function () {
      quiz = buildQuiz({ scope: 'wrong' });
      switchTab('review');
    });
    host.querySelectorAll('[data-wid]').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-del]')) return;
        openSheet(parseInt(row.getAttribute('data-wid'), 10));
      });
    });
    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = parseInt(b.getAttribute('data-del'), 10);
        var i = wrongBook.indexOf(id);
        if (i >= 0) { wrongBook.splice(i, 1); saveWrong(); }
        toast('已移出错词本');
        renderWrong();
      });
    });
  }

  /* ---------------- 学习统计 / 复习日历 ---------------- */
  var calMonth = null;

  function last7Days() {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var s = stats[fmtDate(d)] || {};
      out.push({
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        count: (s.learned || []).length
      });
    }
    return out;
  }

  function statsHTML() {
    var days = last7Days();
    var max = 1;
    days.forEach(function (d) { if (d.count > max) max = d.count; });
    var t = stats[todayStr()] || { right: 0, total: 0 };
    var tTotal = t.total || 0;
    var rate = tTotal ? Math.round((t.right || 0) / tTotal * 100) : 0;

    var h = '<div class="panel glass">';
    h += '<div class="streak-line"><span class="streak-num">' + streakDays() + '</span><span class="muted">天连续学习</span></div>';
    h += '<div class="progress-text" style="margin-bottom:4px"><span style="font-size:14px">今日答题</span>' +
      '<span class="muted">' + (tTotal ? ((t.right || 0) + ' / ' + tTotal + ' · 正确率 ' + rate + '%') : '还没做题') + '</span></div>';
    h += '<div class="muted" style="margin:14px 0 8px">近 7 天学习量</div>';
    h += '<div class="spark">' + days.map(function (d) {
      var pct = d.count ? Math.max(Math.round(d.count / max * 100), 10) : 0;
      return '<div class="spark-col">' +
        '<div class="spark-track"><div class="spark-bar' + (d.count ? '' : ' is-zero') + '" style="height:' + (d.count ? pct : 3) + '%"></div></div>' +
        '<div class="spark-lab">' + d.label + '</div></div>';
    }).join('') + '</div>';
    h += '</div>';
    return h;
  }

  function calendarHTML() {
    var now = new Date();
    if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
    var y = calMonth.y, m = calMonth.m;
    var startWd = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var todayKey = todayStr();

    var h = '<div class="cal-wrap">';
    h += '<div class="cal-head"><div class="cal-title">' + y + ' 年 ' + (m + 1) + ' 月</div>' +
      '<div class="cal-nav"><button type="button" data-cal="-1" aria-label="上个月">‹</button>' +
      '<button type="button" data-cal="1" aria-label="下个月">›</button></div></div>';
    h += '<div class="cal-grid">';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) {
      h += '<div class="cal-wd">' + w + '</div>';
    });
    var i;
    for (i = 0; i < startWd; i++) h += '<div class="cal-cell is-empty"></div>';
    for (i = 1; i <= daysInMonth; i++) {
      var key = fmtDate(new Date(y, m, i));
      var cls = 'cal-cell';
      if (isActiveDay(key)) cls += ' is-on';
      if (key === todayKey) cls += ' is-today';
      if (key > todayKey) cls += ' is-future';
      h += '<div class="' + cls + '">' + i + '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------------- 进度导出 / 导入 ---------------- */
  function exportProgress() {
    var payload = {
      app: 'tianjin-english-words',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      learned: learned,
      wrong: wrongBook,
      settings: settings,
      stats: stats
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'tjw-progress-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出进度文件');
    } catch (e) { toast('导出失败'); }
  }

  function importProgressFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('文件不是合法 JSON'); return; }
      if (!data || typeof data !== 'object' || !Array.isArray(data.learned)) { toast('文件格式不正确'); return; }
      if (!window.confirm('导入将覆盖当前学习进度，确定继续吗？')) return;
      learned = data.learned.filter(function (id) { return byId[id]; });
      wrongBook = Array.isArray(data.wrong) ? data.wrong.filter(function (id) { return byId[id]; }) : [];
      if (data.settings && typeof data.settings === 'object') {
        settings.hideCn = !!data.settings.hideCn;
        settings.expandDetail = !!data.settings.expandDetail;
      }
      stats = (data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats)) ? data.stats : {};
      writeJSON(K.learned, learned);
      writeJSON(K.wrong, wrongBook);
      writeJSON(K.settings, settings);
      writeJSON(K.stats, stats);
      todayState = { date: todayStr(), ids: Logic.dailyPick(WORDS, learned, todayStr(), DAILY_COUNT) };
      writeJSON(K.today, todayState);
      todayIndex = 0;
      quiz = null;
      calMonth = null;
      renderToday(); renderLibrary(); renderWrong(); renderMe();
      toast('导入成功：已学 ' + learned.length + ' · 错词 ' + wrongBook.length);
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(file);
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

    html += statsHTML();

    html += '<div class="panel glass"><div class="sect-title">复习日历</div>' + calendarHTML() + '</div>';

    html += '<div class="panel glass"><div class="progress-text"><span style="font-size:15px">错词本</span>' +
      '<span class="muted">' + wrongCount + ' 个</span></div>' +
      '<button class="btn btn-ghost btn-wide" id="goWrong" type="button" style="margin-top:10px">打开错词本</button></div>';

    html += '<div class="panel glass"><div class="sect-title">进度备份</div>' +
      '<div class="muted" style="margin-bottom:10px">学习进度只存本机浏览器。导出为文件后可换设备导入恢复。</div>' +
      '<div class="io-row"><button class="btn btn-primary" id="exportBtn" type="button">导出进度</button>' +
      '<button class="btn btn-ghost" id="importBtn" type="button">导入进度</button></div>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden></div>';

    html += '<button class="btn danger btn-wide" id="resetBtn" type="button">重置学习进度</button>';

    html += '<div class="ver-line muted">版本 v' + APP_VERSION + ' · 词库 ' + total + ' 条 · 学习进度存于本机</div>';

    $('meHost').innerHTML = html;

    $('goWrong').addEventListener('click', function () { switchTab('wrong'); });

    $('exportBtn').addEventListener('click', exportProgress);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) importProgressFile(f);
      ev.target.value = '';
    });

    $('meHost').querySelectorAll('[data-cal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var delta = parseInt(b.getAttribute('data-cal'), 10);
        var m = calMonth.m + delta, y = calMonth.y;
        if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
        calMonth = { y: y, m: m };
        renderMe();
      });
    });

    $('resetBtn').addEventListener('click', function () {
      if (window.confirm('确定要清空全部学习进度与错词本吗？此操作不可撤销。')) {
        if (window.confirm('再次确认：重置后「已学」「错词本」「今日进度」「统计」都会清空。继续？')) {
          learned = []; wrongBook = []; stats = {};
          writeJSON(K.learned, learned);
          writeJSON(K.wrong, wrongBook);
          writeJSON(K.stats, stats);
          localStorage.removeItem(K.today);
          todayState = { date: todayStr(), ids: Logic.dailyPick(WORDS, learned, todayStr(), DAILY_COUNT) };
          writeJSON(K.today, todayState);
          todayIndex = 0;
          quiz = null;
          calMonth = null;
          renderToday(); renderLibrary(); renderWrong(); renderMe();
          toast('已重置学习进度');
        }
      }
    });
  }

  /* ---------------- 路由 ---------------- */
  var currentTab = 'today';
  var VIEW_TITLE = { today: '今日学习', review: '复习测验', library: '浏览词库', wrong: '错词本', me: '我的进度' };

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
    else if (tab === 'wrong') renderWrong();
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
    $('todayPractice').addEventListener('click', function () {
      quiz = buildQuiz({ scope: 'today', type: 'mix' });
      switchTab('review');
    });

    $('quizBar').addEventListener('click', function (ev) {
      var s = ev.target.closest('[data-scope]');
      if (s) { setQuizScope(s.getAttribute('data-scope')); return; }
      var t = ev.target.closest('[data-qtype]');
      if (t) setQuizType(t.getAttribute('data-qtype'));
    });

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
