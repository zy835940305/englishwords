/* logic.js — 内容生成与算法层
 * 纯规则生成，零外部依赖，同时支持浏览器 <script> 与 Node require()。
 * 原则：能规则推导的才生成，推导不出来的给中性兜底文案，不编造事实。
 */
var Logic = (function () {
  'use strict';

  /* =====================================================================
   * 1. 词性解析
   * ===================================================================== */
  var ABBR_MAP = {
    'modal v.': { tag: 'modal', zh: '情态动词' },
    'adj.': { tag: 'adj', zh: '形容词' },
    'adv.': { tag: 'adv', zh: '副词' },
    'prep.': { tag: 'prep', zh: '介词' },
    'pron.': { tag: 'pron', zh: '代词' },
    'conj.': { tag: 'conj', zh: '连词' },
    'num.': { tag: 'num', zh: '数词' },
    'art.': { tag: 'art', zh: '冠词' },
    'int.': { tag: 'int', zh: '感叹词' },
    'aux.': { tag: 'aux', zh: '助动词' },
    'vt.': { tag: 'v', zh: '及物动词' },
    'vi.': { tag: 'v', zh: '不及物动词' },
    'n.': { tag: 'n', zh: '名词' },
    'v.': { tag: 'v', zh: '动词' },
    'a.': { tag: 'adj', zh: '形容词' },
    'ad.': { tag: 'adv', zh: '副词' }
  };

  var POS_KEYS = Object.keys(ABBR_MAP).sort(function (a, b) { return b.length - a.length; });
  var POS_RE = new RegExp(
    '(?:' + POS_KEYS.map(function (k) {
      return k.replace(/\./g, '\\.').replace(/\s+/g, '\\s+');
    }).join('|') + ')',
    'gi'
  );

  function parsePOS(meaning) {
    var text = String(meaning == null ? '' : meaning);
    var out = [];
    var seen = {};
    var m;
    POS_RE.lastIndex = 0;
    while ((m = POS_RE.exec(text)) !== null) {
      var key = m[0].toLowerCase().replace(/\s+/g, ' ').replace(/\s+\./g, '.');
      var def = ABBR_MAP[key];
      if (!def) continue;
      if (!seen[def.tag]) {
        seen[def.tag] = 1;
        out.push({ abbr: key, tag: def.tag, zh: def.zh });
      }
    }
    return out;
  }

  function primaryTag(pos) {
    if (!pos) return '';
    if (typeof pos === 'string') return pos;
    if (Array.isArray(pos)) return pos.length ? pos[0].tag : '';
    if (pos.tag) return pos.tag;
    return '';
  }

  function posText(pos) {
    if (!Array.isArray(pos) || !pos.length) return '未标注词性';
    return pos.map(function (p) { return p.abbr + ' ' + p.zh; }).join('；');
  }

  /* =====================================================================
   * 2. 释义切分
   * ===================================================================== */
  function stripPOS(meaning) {
    return String(meaning == null ? '' : meaning).replace(POS_RE, ' ').replace(/\s+/g, ' ');
  }

  function cleanSegment(x) {
    return String(x)
      .replace(/^[^A-Za-z0-9\u4e00-\u9fa5（(]+/, '')
      .replace(/[\s&、，,；;:：]+$/, '')
      .trim();
  }

  function hasContent(x) {
    return /[\u4e00-\u9fa5A-Za-z0-9]/.test(x);
  }

  function splitMeanings(meaning) {
    var s = stripPOS(meaning);
    var parts = s.split(/[；;]/)
      .map(cleanSegment)
      .filter(function (x) { return x && hasContent(x); });
    if (!parts.length) {
      var one = cleanSegment(s);
      if (one && hasContent(one)) parts = [one];
    }
    return parts;
  }

  /* =====================================================================
   * 词形工具
   * ===================================================================== */
  function cleanBase(word) {
    var w = String(word == null ? '' : word);
    w = w.split('(')[0];
    w = w.split('（')[0];
    w = w.split('/')[0];
    w = w.trim().toLowerCase();
    return w;
  }

  function inflectable(base) {
    return /^[a-z][a-z-]*$/.test(base) && base.length > 0;
  }

  var NOUN_IRREG = {
    man: 'men', woman: 'women', child: 'children', foot: 'feet', tooth: 'teeth',
    goose: 'geese', mouse: 'mice', person: 'people', sheep: 'sheep', fish: 'fish',
    deer: 'deer', chinese: 'chinese', japanese: 'japanese', ox: 'oxen',
    policeman: 'policemen', fireman: 'firemen', postman: 'postmen', businessman: 'businessmen'
  };
  var NOUN_O_ES = { potato: 1, tomato: 1, hero: 1, echo: 1, Negro: 1, volcano: 1 };
  var NOUN_F_EXC = { roof: 'roofs', chief: 'chiefs', belief: 'beliefs', proof: 'proofs', safe: 'safes', gulf: 'gulfs' };
  var UNCOUNT = {
    advice: 1, information: 1, news: 1, furniture: 1, homework: 1, work: 1,
    money: 1, water: 1, milk: 1, bread: 1, rice: 1, music: 1, weather: 1,
    progress: 1, luck: 1, fun: 1, paper: 1, tea: 1, coffee: 1, food: 1
  };

  function nounPlural(base) {
    if (NOUN_IRREG[base]) return NOUN_IRREG[base];
    if (UNCOUNT[base]) return null;
    if (NOUN_F_EXC[base]) return NOUN_F_EXC[base];
    if (/(s|x|z|ch|sh)$/.test(base)) return base + 'es';
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
    if (/fe$/.test(base)) return base.slice(0, -2) + 'ves';
    if (/f$/.test(base)) return base.slice(0, -1) + 'ves';
    if (/o$/.test(base)) return (NOUN_O_ES[base] || NOUN_O_ES[base.charAt(0).toUpperCase() + base.slice(1)]) ? base + 'es' : base + 's';
    return base + 's';
  }

  var VERB_IRREG = {
    be: ['was/were', 'been'], go: ['went', 'gone'], do: ['did', 'done'], have: ['had', 'had'],
    take: ['took', 'taken'], get: ['got', 'got'], see: ['saw', 'seen'], come: ['came', 'come'],
    make: ['made', 'made'], give: ['gave', 'given'], find: ['found', 'found'],
    think: ['thought', 'thought'], buy: ['bought', 'bought'], teach: ['taught', 'taught'],
    run: ['ran', 'run'], write: ['wrote', 'written'], read: ['read', 'read'],
    say: ['said', 'said'], tell: ['told', 'told'], know: ['knew', 'known'],
    eat: ['ate', 'eaten'], drink: ['drank', 'drunk'], sing: ['sang', 'sung'],
    swim: ['swam', 'swum'], begin: ['began', 'begun'], break: ['broke', 'broken'],
    bring: ['brought', 'brought'], build: ['built', 'built'], catch: ['caught', 'caught'],
    choose: ['chose', 'chosen'], cut: ['cut', 'cut'], draw: ['drew', 'drawn'],
    drive: ['drove', 'driven'], fall: ['fell', 'fallen'], feel: ['felt', 'felt'],
    fight: ['fought', 'fought'], fly: ['flew', 'flown'], forget: ['forgot', 'forgotten'],
    grow: ['grew', 'grown'], hear: ['heard', 'heard'], hold: ['held', 'held'],
    keep: ['kept', 'kept'], leave: ['left', 'left'], lend: ['lent', 'lent'],
    lose: ['lost', 'lost'], meet: ['met', 'met'], pay: ['paid', 'paid'],
    put: ['put', 'put'], ride: ['rode', 'ridden'], ring: ['rang', 'rung'],
    rise: ['rose', 'risen'], sell: ['sold', 'sold'], send: ['sent', 'sent'],
    show: ['showed', 'shown'], sit: ['sat', 'sat'], sleep: ['slept', 'slept'],
    speak: ['spoke', 'spoken'], spend: ['spent', 'spent'], stand: ['stood', 'stood'],
    steal: ['stole', 'stolen'], wear: ['wore', 'worn'], win: ['won', 'won'],
    hurt: ['hurt', 'hurt'], let: ['let', 'let'], mean: ['meant', 'meant'],
    cost: ['cost', 'cost'], hit: ['hit', 'hit'], shine: ['shone', 'shone'],
    throw: ['threw', 'thrown'], wake: ['woke', 'woken'], understand: ['understood', 'understood']
  };
  var VERB_3RD_IRREG = { be: 'is', have: 'has', do: 'does', go: 'goes' };
  var DOUBLE_CONSONANT = {
    begin: 1, forget: 1, prefer: 1, regret: 1, permit: 1, admit: 1, control: 1,
    occur: 1, refer: 1, travel: 0
  };

  function isCVC(base) {
    return base.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(base);
  }
  function shouldDouble(base) {
    if (DOUBLE_CONSONANT[base] === 0) return false;
    if (DOUBLE_CONSONANT[base] === 1) return true;
    return base.length <= 4 && isCVC(base);
  }

  function verbThird(base) {
    if (VERB_3RD_IRREG[base]) return VERB_3RD_IRREG[base];
    if (/(s|x|z|ch|sh|o)$/.test(base)) return base + 'es';
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
    return base + 's';
  }
  function verbIng(base) {
    if (/ie$/.test(base)) return base.slice(0, -2) + 'ying';
    if (/e$/.test(base) && !/ee$/.test(base) && !/ye$/.test(base) && !/oe$/.test(base)) {
      return base.slice(0, -1) + 'ing';
    }
    if (shouldDouble(base)) return base + base.slice(-1) + 'ing';
    return base + 'ing';
  }
  function verbEd(base) {
    if (VERB_IRREG[base]) return VERB_IRREG[base][0];
    if (/e$/.test(base)) return base + 'd';
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ied';
    if (shouldDouble(base)) return base + base.slice(-1) + 'ed';
    return base + 'ed';
  }
  function verbPP(base) {
    if (VERB_IRREG[base]) return VERB_IRREG[base][1];
    return verbEd(base);
  }

  var ADJ_IRREG = {
    good: ['better', 'best'], well: ['better', 'best'], bad: ['worse', 'worst'],
    ill: ['worse', 'worst'], many: ['more', 'most'], much: ['more', 'most'],
    little: ['less', 'least'], far: ['farther/further', 'farthest/furthest'],
    old: ['older/elder', 'oldest/eldest']
  };

  function syllables(base) {
    var m = base.toLowerCase().match(/[aeiouy]+/g);
    var n = m ? m.length : 1;
    if (/e$/.test(base) && !/le$/.test(base) && n > 1) n -= 1;
    return n;
  }

  function adjDegree(base) {
    if (ADJ_IRREG[base]) return ADJ_IRREG[base];
    if (syllables(base) >= 3) return ['more ' + base, 'most ' + base];
    if (/[^aeiou]y$/.test(base)) return [base.slice(0, -1) + 'ier', base.slice(0, -1) + 'iest'];
    if (/e$/.test(base)) return [base + 'r', base + 'st'];
    if (isCVC(base)) return [base + base.slice(-1) + 'er', base + base.slice(-1) + 'est'];
    return [base + 'er', base + 'est'];
  }

  function inflections(word, pos) {
    var base = cleanBase(word);
    var tag = primaryTag(pos);
    var out = [];
    if (!inflectable(base)) {
      return { items: [], note: '该词条不是可变化词形，无需推导词形变化。' };
    }
    if (tag === 'n') {
      var pl = nounPlural(base);
      if (pl) out.push({ label: '复数', value: pl });
      else out.push({ label: '复数', value: '不可数名词，一般无复数形式' });
    } else if (tag === 'v' || tag === 'modal') {
      if (tag === 'v') {
        out.push({ label: '第三人称单数', value: verbThird(base) });
        out.push({ label: '现在分词', value: verbIng(base) });
        out.push({ label: '过去式', value: verbEd(base) });
        out.push({ label: '过去分词', value: verbPP(base) });
      } else {
        out.push({ label: '用法', value: '情态动词后接动词原形' });
      }
    } else if (tag === 'adj' || tag === 'adv') {
      var d = adjDegree(base);
      out.push({ label: '比较级', value: d[0] });
      out.push({ label: '最高级', value: d[1] });
    }
    return { items: out, note: out.length ? '' : '该词性无固定词形变化，重点记忆原形用法。' };
  }

  /* =====================================================================
   * 3. 高频搭配表（真实数据）
   * ===================================================================== */
  var COLLOCATIONS = {
    able: ['be able to do sth.'],
    about: ['talk about sth.', 'think about sth.', 'What about ...?'],
    above: ['above all', 'above zero'],
    accident: ['by accident', 'have an accident', 'a traffic accident'],
    according: ['according to ...'],
    across: ['go across the street', 'across from ...', 'come across'],
    afraid: ['be afraid of sth.', 'be afraid to do sth.'],
    advice: ['a piece of advice', 'ask sb. for advice', 'give sb. advice'],
    advise: ['advise sb. to do sth.', 'advise doing sth.'],
    after: ['after all', 'look after', 'day after day'],
    again: ['again and again', 'once again'],
    against: ['be against sth.', 'play against ...'],
    age: ['at the age of ...', 'for ages'],
    agree: ['agree with sb.', 'agree to do sth.', 'agree on sth.'],
    ahead: ['go ahead', 'ahead of ...'],
    all: ['all kinds of', 'all over the world', 'not at all', 'in all'],
    allow: ['allow sb. to do sth.', 'be allowed to do sth.'],
    along: ['get along with sb.', 'along the river'],
    already: ['have already done sth.'],
    also: ['not only ... but also ...'],
    amount: ['a large amount of', 'the amount of'],
    angry: ['be angry with sb.', 'be angry at sth.'],
    another: ['one after another', 'one another'],
    answer: ['answer the question', 'the answer to the question'],
    any: ['not ... any more', 'not ... any longer'],
    anything: ['anything else'],
    around: ['around the world', 'look around', 'show sb. around'],
    arrive: ['arrive at the station', 'arrive in Beijing'],
    as: ['as ... as ...', 'as soon as', 'as well as', 'such as'],
    ask: ['ask sb. for sth.', 'ask sb. to do sth.', 'ask about sth.'],
    attention: ['pay attention to ...'],
    away: ['far away', 'away from ...', 'right away'],
    back: ['come back', 'give back', 'look back'],
    bad: ['be bad for ...', 'be bad at ...', 'go bad'],
    because: ['because of ...'],
    become: ['become interested in ...'],
    before: ['before long', 'the day before yesterday'],
    begin: ['begin to do sth.', 'begin with ...', 'to begin with'],
    believe: ['believe in sb.', 'believe it or not'],
    below: ['below zero'],
    between: ['between A and B'],
    both: ['both ... and ...', 'both of them'],
    bring: ['bring up', 'bring back', 'bring out'],
    busy: ['be busy doing sth.', 'be busy with sth.'],
    by: ['by bus', 'by the way', 'one by one', 'by accident'],
    call: ['call sb. up', 'call on sb.', 'call back', 'be called ...'],
    can: ['can\'t help doing sth.'],
    care: ['care about ...', 'take care of ...', 'care for ...'],
    careful: ['be careful with ...', 'be careful of ...'],
    carry: ['carry on', 'carry out'],
    catch: ['catch up with ...', 'catch a cold', 'catch the bus'],
    change: ['change into ...', 'change one\'s mind', 'a change of ...'],
    cheer: ['cheer up', 'cheer sb. on'],
    choose: ['choose from ...', 'choose to do sth.'],
    clean: ['clean up', 'clean the room'],
    clear: ['clear up', 'make it clear'],
    close: ['close to ...', 'close down'],
    come: ['come true', 'come on', 'come from ...', 'come up with', 'come back'],
    compare: ['compare A with B'],
    consider: ['consider doing sth.'],
    continue: ['continue to do sth.', 'continue doing sth.'],
    cost: ['at the cost of ...', 'It costs sb. ...'],
    count: ['count on sb.', 'count down'],
    cover: ['be covered with ...', 'cover ... with ...'],
    cut: ['cut down', 'cut up', 'cut off'],
    deal: ['deal with ...', 'a great deal of', 'a big deal'],
    depend: ['depend on ...'],
    die: ['die of ...', 'die from ...', 'die out'],
    different: ['be different from ...'],
    difficult: ['have difficulty (in) doing sth.', 'be difficult to do sth.'],
    do: ['do one\'s best', 'do well in ...', 'have to do with ...'],
    dress: ['dress up', 'get dressed', 'dress oneself'],
    drive: ['drive sb. mad', 'drive away'],
    drop: ['drop in', 'drop out', 'drop by'],
    each: ['each other', 'each of them'],
    easy: ['take it easy', 'be easy to do sth.'],
    eat: ['eat up', 'eat out'],
    either: ['either ... or ...', 'either of them'],
    else: ['something else', 'or else', 'What else?'],
    end: ['in the end', 'at the end of ...', 'end up'],
    enough: ['enough to do sth.', 'good enough'],
    even: ['even if', 'even though', 'even more'],
    ever: ['ever since', 'Have you ever ...?'],
    example: ['for example', 'set an example'],
    except: ['except for ...', 'except that ...'],
    excited: ['be excited about ...'],
    far: ['so far', 'far away', 'as far as', 'far from ...'],
    feel: ['feel like doing sth.', 'feel free', 'feel at home'],
    few: ['a few', 'quite a few', 'only a few'],
    fill: ['fill in', 'fill out', 'be filled with ...'],
    find: ['find out', 'find it hard to do sth.'],
    finish: ['finish doing sth.'],
    fit: ['be fit for ...', 'keep fit'],
    fix: ['fix up', 'fix on ...'],
    follow: ['follow sb.', 'as follows'],
    for: ['for example', 'wait for ...', 'look for ...', 'thanks for ...'],
    forget: ['forget to do sth.', 'forget doing sth.', 'Don\'t forget ...'],
    free: ['be free', 'in one\'s free time', 'for free', 'set free'],
    from: ['from ... to ...', 'be from ...', 'far from ...'],
    full: ['be full of ...'],
    get: ['get up', 'get on', 'get off', 'get along with', 'get used to', 'get ready for', 'get together'],
    give: ['give up', 'give away', 'give back', 'give out', 'give in'],
    go: ['go on', 'go over', 'go through', 'go out', 'go away', 'go shopping'],
    good: ['be good at ...', 'be good for ...', 'be good to sb.', 'a good many'],
    grow: ['grow up', 'grow into ...'],
    hand: ['hand in', 'hand out', 'on the one hand'],
    happen: ['happen to do sth.', 'What happened to sb.?'],
    hard: ['work hard', 'It\'s hard to do sth.'],
    have: ['have to', 'have fun', 'have a good time', 'have a look'],
    hear: ['hear from sb.', 'hear of ...', 'hear about ...'],
    help: ['help sb. with sth.', 'help sb. (to) do sth.', 'can\'t help doing sth.', 'help oneself to ...'],
    here: ['here and there', 'Here you are.'],
    hold: ['hold on', 'hold up', 'hold a meeting'],
    hope: ['hope to do sth.', 'hope that ...', 'I hope so.'],
    how: ['How about ...?', 'how many', 'how much', 'how long', 'how often'],
    hurry: ['hurry up', 'in a hurry'],
    if: ['if only', 'as if', 'even if'],
    important: ['It\'s important to do sth.', 'be important for ...'],
    in: ['in the end', 'in fact', 'in front of', 'in order to', 'in time'],
    instead: ['instead of ...'],
    interest: ['be interested in ...', 'a place of interest'],
    join: ['join in', 'join the club'],
    just: ['just now', 'just a minute'],
    keep: ['keep doing sth.', 'keep on doing sth.', 'keep away from ...', 'keep in touch'],
    kind: ['a kind of', 'all kinds of', 'be kind to sb.', 'kind of'],
    know: ['know about ...', 'be known for ...', 'be known as ...'],
    last: ['at last', 'last time', 'the last one'],
    laugh: ['laugh at sb.', 'laugh out loud'],
    lead: ['lead to ...', 'lead a happy life'],
    learn: ['learn from sb.', 'learn about ...', 'learn to do sth.'],
    leave: ['leave for ...', 'leave sb. alone', 'leave behind'],
    less: ['less than', 'more or less'],
    let: ['let sb. do sth.', 'Let\'s ...'],
    like: ['would like to do sth.', 'feel like doing sth.', 'look like'],
    listen: ['listen to sb.', 'listen carefully'],
    little: ['a little', 'little by little', 'a little bit'],
    live: ['live on ...', 'live in ...', 'live a happy life'],
    long: ['as long as', 'long ago', 'before long', 'no longer'],
    look: ['look at', 'look for', 'look after', 'look up', 'look like', 'look forward to', 'look out', 'look over'],
    lose: ['lose one\'s way', 'lose weight', 'lose heart', 'be lost'],
    lot: ['a lot of', 'lots of', 'a lot'],
    make: ['make friends with sb.', 'make sure', 'make up', 'make it', 'be made of', 'be made from', 'be made in', 'make a decision'],
    many: ['many a', 'a good many', 'how many'],
    matter: ['What\'s the matter?', 'no matter ...'],
    may: ['may as well', 'may be'],
    mean: ['mean to do sth.', 'mean doing sth.', 'What do you mean?'],
    meet: ['meet with sb.', 'meet one\'s needs', 'Nice to meet you.'],
    mind: ['Never mind.', 'make up one\'s mind', 'mind doing sth.'],
    more: ['more and more', 'more than', 'no more', 'What\'s more,'],
    most: ['most of ...', 'at most'],
    much: ['how much', 'too much', 'so much'],
    name: ['in the name of ...', 'be named after ...'],
    need: ['need to do sth.', 'in need of ...', 'needn\'t'],
    never: ['Never mind.', 'Never too late to learn.'],
    next: ['next to ...', 'next time'],
    no: ['no longer', 'no more', 'No way!', 'no problem'],
    not: ['not only ... but also ...', 'not at all', 'not ... until ...'],
    nothing: ['nothing but ...', 'have nothing to do with ...'],
    now: ['now and then', 'right now', 'from now on'],
    number: ['a number of', 'the number of'],
    of: ['of course', 'a lot of', 'be proud of', 'instead of'],
    off: ['turn off', 'take off', 'get off', 'be off'],
    offer: ['offer to do sth.', 'offer sb. sth.'],
    often: ['how often', 'more often than not'],
    on: ['on time', 'on foot', 'on the way', 'on duty', 'on sale', 'on the other hand'],
    once: ['once upon a time', 'at once', 'once again', 'once a week'],
    one: ['one another', 'one by one', 'one of ...'],
    only: ['not only ... but also ...', 'only if'],
    open: ['open up', 'in the open air'],
    or: ['or so', 'either ... or ...', 'or else'],
    order: ['in order to', 'in order that', 'order sb. to do sth.'],
    other: ['each other', 'the other day', 'in other words'],
    out: ['find out', 'look out', 'go out', 'out of ...', 'run out of ...'],
    over: ['over there', 'all over', 'get over', 'come over'],
    own: ['on one\'s own', 'of one\'s own'],
    part: ['take part in ...', 'play a part in ...', 'in part'],
    pass: ['pass by', 'pass on', 'pass the exam'],
    pay: ['pay for ...', 'pay attention to ...', 'pay off'],
    pick: ['pick up', 'pick out'],
    place: ['take place', 'in place of ...', 'a place of interest'],
    play: ['play with ...', 'play a part in ...', 'play a role in ...'],
    please: ['be pleased with ...'],
    point: ['point at ...', 'point out', 'to the point'],
    practice: ['practice doing sth.', 'put ... into practice'],
    prefer: ['prefer A to B', 'prefer to do rather than do'],
    prepare: ['prepare for ...', 'be prepared for ...', 'prepare to do sth.'],
    present: ['at present', 'be present'],
    put: ['put on', 'put off', 'put up', 'put away', 'put out', 'put down'],
    quite: ['quite a few', 'quite a lot'],
    rather: ['rather than', 'would rather'],
    reach: ['reach for ...', 'reach an agreement'],
    read: ['read about ...', 'read aloud'],
    ready: ['be ready for ...', 'be ready to do sth.'],
    reason: ['the reason for ...', 'for some reason'],
    regard: ['regard ... as ...'],
    remember: ['remember to do sth.', 'remember doing sth.'],
    rest: ['have a rest', 'the rest of ...'],
    return: ['return to ...', 'in return'],
    right: ['right away', 'right now', 'all right', 'right here'],
    ring: ['ring up', 'ring off', 'ring back'],
    run: ['run away', 'run out of ...', 'run into ...', 'run after ...'],
    same: ['the same as ...', 'all the same', 'at the same time'],
    say: ['say to oneself', 'say goodbye to sb.', 'needless to say'],
    see: ['see off', 'see a doctor', 'see you'],
    seem: ['seem to do sth.', 'It seems that ...'],
    sell: ['sell out', 'sell well'],
    send: ['send for sb.', 'send up', 'send away'],
    set: ['set up', 'set off', 'set out', 'set an example'],
    shake: ['shake hands with sb.'],
    should: ['should have done sth.'],
    show: ['show off', 'show sb. around', 'show up', 'on show'],
    shut: ['shut down', 'shut up'],
    since: ['since then', 'ever since'],
    so: ['so ... that ...', 'so that', 'so far', 'so as to'],
    some: ['some day', 'some time', 'some ... others ...'],
    something: ['something else', 'something like ...', 'have something to do with ...'],
    soon: ['as soon as', 'sooner or later', 'how soon'],
    sound: ['sound like ...', 'sound good'],
    speak: ['speak to sb.', 'speak up', 'speak highly of ...'],
    spend: ['spend ... on sth.', 'spend ... (in) doing sth.'],
    stand: ['stand up', 'stand for ...', 'can\'t stand doing sth.'],
    start: ['start to do sth.', 'start with ...', 'to start with'],
    stay: ['stay up', 'stay away from ...', 'stay in touch'],
    stop: ['stop doing sth.', 'stop to do sth.', 'stop sb. from doing sth.'],
    such: ['such as', 'such ... that ...'],
    sure: ['be sure to do sth.', 'make sure', 'for sure'],
    take: ['take care of ...', 'take part in ...', 'take place', 'take off', 'take away', 'take out', 'take up', 'take after', 'take it easy'],
    talk: ['talk about ...', 'talk to sb.', 'talk with sb.'],
    tell: ['tell sb. sth.', 'tell a lie', 'tell the truth', 'tell sb. to do sth.'],
    than: ['more than', 'less than', 'rather than'],
    thank: ['thanks to ...', 'thank sb. for ...'],
    that: ['so ... that ...', 'now that', 'That\'s all.'],
    think: ['think of', 'think about', 'think over', 'think up'],
    though: ['as though', 'even though'],
    through: ['go through', 'get through', 'all through'],
    throw: ['throw away', 'throw at ...'],
    time: ['in time', 'on time', 'at times', 'at the same time', 'from time to time', 'have a good time'],
    to: ['look forward to ...', 'be used to ...', 'pay attention to ...', 'according to ...'],
    together: ['get together', 'put together', 'all together'],
    too: ['too ... to ...', 'too much', 'Me too.'],
    touch: ['keep in touch', 'get in touch with sb.'],
    try: ['try to do sth.', 'try doing sth.', 'try one\'s best', 'try on'],
    turn: ['turn on', 'turn off', 'turn up', 'turn down', 'turn around', 'in turn', 'take turns'],
    up: ['get up', 'give up', 'grow up', 'look up', 'make up', 'pick up', 'put up', 'set up', 'take up', 'wake up', 'hurry up'],
    use: ['used to do sth.', 'be used to doing sth.', 'be used for ...', 'make use of ...', 'in use'],
    very: ['very much', 'very well'],
    wait: ['wait for sb.', 'wait to do sth.', 'can\'t wait to do sth.'],
    wake: ['wake up', 'wake sb. up'],
    walk: ['take a walk', 'walk away', 'walk on'],
    want: ['want to do sth.', 'want sb. to do sth.'],
    watch: ['watch out', 'watch TV', 'watch for ...'],
    way: ['on the way', 'by the way', 'in a way', 'in the way', 'lose one\'s way', 'all the way'],
    wear: ['wear out', 'wear a smile'],
    welcome: ['welcome to ...', 'You\'re welcome.'],
    well: ['as well', 'as well as', 'well done', 'get on well with sb.'],
    what: ['What about ...?', 'What if ...?', 'What\'s more,', 'So what?'],
    when: ['when it comes to ...'],
    whether: ['whether ... or ...'],
    while: ['after a while', 'in a while', 'for a while'],
    why: ['Why not ...?'],
    wish: ['wish to do sth.', 'best wishes'],
    with: ['with the help of ...', 'get along with ...', 'be angry with sb.', 'agree with sb.', 'deal with ...', 'be filled with ...', 'play with ...'],
    without: ['without doubt', 'go without ...'],
    word: ['in a word', 'in other words', 'keep one\'s word', 'have a word with sb.'],
    work: ['work out', 'work on ...', 'work hard', 'at work', 'work as ...'],
    worry: ['worry about ...', 'be worried about ...', 'Don\'t worry.'],
    worth: ['be worth doing sth.', 'be worth it'],
    would: ['would like to do sth.', 'would rather', 'Would you mind ...?'],
    write: ['write down', 'write to sb.', 'write about ...', 'write back'],
    wrong: ['What\'s wrong?', 'go wrong', 'be wrong with ...'],
    year: ['year after year', 'all year round', 'last year'],
    yet: ['not ... yet', 'as yet'],
    young: ['young and old', 'as young as ...']
  };
  var COLLOCATION_COUNT = Object.keys(COLLOCATIONS).length;

  var PATTERN_BY_TAG = {
    n: ['a / an / the + ___（名词前需加冠词）', '数量词 + ___（如 some ___s / two ___s）', '___ + of ...（如 a ___ of ...）'],
    v: ['___ + 宾语（及物）', 'to ___ / ___ + 宾语', '___ + 介词（注意固定搭配的介词）'],
    adj: ['be + ___', '___ + 名词', 'be ___ + 介词（be ___ at / for / of ...）'],
    adv: ['动词 + ___', 'be + ___', '放句首或句末修饰整句'],
    prep: ['___ + 名词 / 代词', '常见于固定短语中（如 in / on / at 类搭配）'],
    pron: ['___ + 名词（作定语）', '动词后作宾语'],
    conj: ['句子 + ___ + 句子'],
    num: ['___ + 可数名词复数', 'the ___ + 名词'],
    art: ['___ + 可数名词单数'],
    int: ['用于句首，表达语气'],
    modal: ['情态动词 + 动词原形'],
    aux: ['助动词 + 动词'],
    '': ['注意它在句子中的位置与常见搭配']
  };

  function collocations(word, pos) {
    var base = cleanBase(word);
    var tag = primaryTag(pos);
    if (COLLOCATIONS[base]) {
      return { type: 'collocation', items: COLLOCATIONS[base].slice(0) };
    }
    var tpl = PATTERN_BY_TAG[tag] || PATTERN_BY_TAG[''];
    return { type: 'pattern', items: tpl.slice(0) };
  }

  function sentencePatterns(word, pos) {
    var tag = primaryTag(pos);
    var tpl = PATTERN_BY_TAG[tag] || PATTERN_BY_TAG[''];
    return tpl.slice(0);
  }

  /* =====================================================================
   * 4. 练习句
   * ===================================================================== */
  function practiceSentences(word, pos) {
    var raw = String(word == null ? '' : word).trim();
    var base = cleanBase(word) || raw;
    var tag = primaryTag(pos);
    var c = collocations(word, pos);
    if (c.type === 'collocation') {
      var phrase = c.items[0];
      return [
        'Try to use "' + base + '" together with the phrase "' + phrase + '".',
        'Can you use "' + base + '" in a sentence about your school life?'
      ];
    }
    var t = PATTERN_BY_TAG[tag] ? PATTERN_BY_TAG[tag][0] : PATTERN_BY_TAG[''][0];
    return [
      'I need to learn the word "' + base + '" today.',
      'Can you use "' + base + '" in a sentence? (句型参考：' + t + ')'
    ];
  }

  /* =====================================================================
   * 5. 编辑距离 / 相似词
   * ===================================================================== */
  function editDistance(a, b) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 2) return 99;
    var prev = new Array(lb + 1);
    var cur = new Array(lb + 1);
    var i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        var v = prev[j - 1] + cost;
        var d1 = prev[j] + 1;
        var d2 = cur[j - 1] + 1;
        if (d1 < v) v = d1;
        if (d2 < v) v = d2;
        cur[j] = v;
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[lb];
  }

  function normAllWords(allWords) {
    if (!Array.isArray(allWords)) return [];
    var list = [];
    for (var i = 0; i < allWords.length; i++) {
      var w = allWords[i];
      if (!w || typeof w.word !== 'string') continue;
      var b = cleanBase(w.word);
      if (!b || !/^[a-z][a-z-]*$/.test(b)) continue;
      list.push({ base: b, entry: w });
    }
    return list;
  }

  function shortMeaning(entry) {
    var parts = splitMeanings(entry.meaning);
    return parts.length ? parts[0] : String(entry.meaning || '');
  }

  function confusables(word, allWords) {
    var base = cleanBase(word);
    if (!base || !/^[a-z][a-z-]*$/.test(base)) return [];
    var list = normAllWords(allWords);
    var cands = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.base === base) continue;
      if (o.base.charAt(0) !== base.charAt(0)) continue;
      if (Math.abs(o.base.length - base.length) > 2) continue;
      var d = editDistance(base, o.base);
      if (d <= 2) cands.push({ d: d, base: o.base, entry: o.entry });
    }
    cands.sort(function (a, b) {
      if (a.d !== b.d) return a.d - b.d;
      return Math.abs(a.base.length - base.length) - Math.abs(b.base.length - base.length);
    });
    return cands.slice(0, 3).map(function (c) {
      return { word: c.entry.word, meaning: shortMeaning(c.entry), distance: c.d };
    });
  }

  var FAMILY_SUFFIXES = ['ing', 'ed', 'es', 'er', 'est', 'ly', 'tion', 'sion', 'ment', 'ness', 'ful', 'less', 's', 'd'];
  function stripSuffix(base) {
    for (var i = 0; i < FAMILY_SUFFIXES.length; i++) {
      var suf = FAMILY_SUFFIXES[i];
      if (base.length > suf.length + 1 && base.slice(-suf.length) === suf) {
        var stem = base.slice(0, -suf.length);
        if (suf === 'ing' && stem.slice(-1) === stem.charAt(stem.length - 2) && /[^aeiou]/.test(stem.slice(-1))) {
          stem = stem.slice(0, -1);
        }
        if (/[^aeiou]$/.test(stem) && (suf === 'er' || suf === 'est' || suf === 'ed' || suf === 'ing') && stem.slice(-1) === stem.charAt(stem.length - 2)) {
          stem = stem.slice(0, -1);
        }
        return stem;
      }
    }
    return base;
  }

  function wordFamily(word, allWords) {
    var base = cleanBase(word);
    if (!base || !/^[a-z][a-z-]*$/.test(base)) return [];
    var stem = stripSuffix(base);
    var list = normAllWords(allWords);
    var res = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.base === base || seen[o.base]) continue;
      var ostem = stripSuffix(o.base);
      var related = false;
      if (ostem === stem) related = true;
      else if (stem.length >= 3 && o.base.indexOf(stem) === 0 && o.base.length - stem.length <= 4) related = true;
      else if (ostem.length >= 3 && base.indexOf(ostem) === 0 && base.length - ostem.length <= 4) related = true;
      if (related) {
        seen[o.base] = 1;
        res.push({ word: o.entry.word, meaning: shortMeaning(o.entry) });
      }
    }
    res.sort(function (a, b) {
      return Math.abs(cleanBase(a.word).length - base.length) - Math.abs(cleanBase(b.word).length - base.length);
    });
    return res.slice(0, 5);
  }

  /* =====================================================================
   * 6. 拼写 / 发音提醒
   * ===================================================================== */
  function spellingTips(word) {
    var base = cleanBase(word);
    var tips = [];
    if (!base) return ['该词条不是单个单词，建议整体记忆。'];
    if (/(.)\1/.test(base)) {
      var mm = base.match(/(.)\1/g);
      tips.push('含连续重复字母（' + mm.join('、') + '），别写成单字母。');
    }
    if (/e$/.test(base) && base.length > 3) tips.push('以不发音的字母 e 结尾，加 -ing / -ed 时通常要先去 e。');
    if (/^(kn|wr)/.test(base)) tips.push('开头 ' + base.slice(0, 2) + ' 中，' + base.charAt(0) + ' 不发音（如 know / write 一类）。');
    if (/ph/.test(base)) tips.push('ph 发 /f/ 音，注意不是 p+h 分开读。');
    if (/gh/.test(base)) tips.push('gh 组合常不发音或发 /f/，按具体单词记忆。');
    if (/[^aeiou]y$/.test(base)) tips.push('以「辅音字母 + y」结尾，变复数 / 第三人称时把 y 变 i 再加后缀。');
    if (/tion$/.test(base) || /sion$/.test(base)) tips.push('结尾 -tion / -sion 是常见的名词后缀，拼写时别漏掉 i / s。');
    if (/(ough|augh)/.test(base)) tips.push('ough / augh 读音不规则，是易拼错的组合，建议整词记忆。');
    if (base.indexOf('-') > 0) tips.push('这是一个带连字符的复合词，注意连字符不能丢。');
    if (!tips.length) tips.push('该词拼写较规律，按字母组合分段记忆即可（如 ' + base.replace(/(.{3})/g, '$1 ').trim() + '）。');
    return tips;
  }

  function pronunciationTips(word, pos) {
    var base = cleanBase(word);
    var tag = primaryTag(pos);
    var tips = [];
    if (!base) return ['该词条不是单个单词，跟读时注意整体语调即可。'];
    if (/th/.test(base)) tips.push('th 有两种读法：/θ/（如 think）和 /ð/（如 this），注意舌尖轻触上齿。');
    if (/oo/.test(base)) tips.push('oo 常读 /uː/（如 zoo）或 /ʊ/（如 look），要按单词区分。');
    if (/ea/.test(base)) tips.push('ea 常读 /iː/（如 tea）或 /e/（如 bread），读音不统一。');
    if (/ou/.test(base)) tips.push('ou 常读 /aʊ/（如 out）或 /uː/（如 group），注意区分。');
    if (/ow/.test(base)) tips.push('ow 可读 /aʊ/（如 now）或 /əʊ/（如 know）。');
    if (/igh/.test(base)) tips.push('igh 中 gh 不发音，整体读 /aɪ/（如 night）。');
    if (/tion$/.test(base)) tips.push('-tion 读 /ʃn/（如 station）。');
    if (!tips.length) tips.push('该词拼写与读音较对应，建议对照音标逐音节跟读。');
    tips.push('重音位置无法仅凭拼写可靠推断，请以词典音标的 ˈ 重音符号为准，跟读模仿。');
    if (tag === 'n' && /^[a-z]+$/.test(base)) tips.push('名词重音通常在第一个音节，跟读时注意不要重读词尾。');
    return tips;
  }

  /* =====================================================================
   * 7. 复习重点 / 老师点拨
   * ===================================================================== */
  function reviewFocus(word, pos, opts) {
    opts = opts || {};
    var base = cleanBase(word) || String(word || '');
    var tag = primaryTag(pos);
    var core = opts.coreMeaning || '';
    var colloc = opts.collocations || null;
    var conf = opts.confusables || null;
    var focus = [];
    focus.push(core ? ('掌握核心释义：' + core) : ('先记牢「' + base + '」的中文意思和词性'));
    if (colloc && colloc.type === 'collocation' && colloc.items.length) {
      focus.push('记住高频搭配：' + colloc.items[0]);
    } else {
      var tpl = PATTERN_BY_TAG[tag] || PATTERN_BY_TAG[''];
      focus.push('留意它在句中的位置与句式：' + tpl[0]);
    }
    if (conf && conf.length) {
      focus.push('与易混词「' + conf[0].word + '」区分使用');
    } else {
      focus.push('注意拼写与发音细节，做到会读会写');
    }
    return focus;
  }

  function teacherTip(word, pos) {
    var base = cleanBase(word) || String(word || '');
    var tag = primaryTag(pos);
    switch (tag) {
      case 'n':
        return '名词先分清可数 / 不可数：可数名词单数前一般要加 a / an / the，变复数按规则词尾变化；不可数名词没有复数，用量词表达（如 a piece of ...）。做题时先判断它在句中是单数还是复数，再看谓语动词是否一致。';
      case 'v':
        return '动词是句子的核心：先判断及物还是不及物，再看时态。三单、过去式、过去分词要写对；很多动词靠固定介词区分意思（如 look at / look for / look after），记词时一定要把介词绑在一起记，别只背中文。';
      case 'adj':
        return '形容词常用来修饰名词或放在系动词后作表语（be / look / feel + 形容词）。注意比较级：短词加 -er / -est，长词用 more / most；同时注意它和介词的固定搭配，如 be good at / be afraid of。';
      case 'adv':
        return '副词主要修饰动词、形容词或整句，回答“怎么样 / 什么时候 / 在哪里”。注意它和形容词的位置区别：修饰动词时一般不夹在动词和宾语之间；频率副词（always / often / never）通常放在实义动词前、be 动词后。';
      case 'prep':
        return '介词后面必须接名词、代词或动名词（介词 + doing）。介词本身没有固定中文意思，靠搭配记忆：in / on / at 表时间地点的区别要背熟，固定短语里的介词不能随意更换。';
      case 'pron':
        return '代词注意主格 / 宾格 / 形容词性物主代词 / 名词性物主代词的区别，以及反身代词的使用场合。做题时先看它在句中作什么成分（主语用主格，宾语用宾格）。';
      case 'conj':
        return '连词用来连接词、短语或句子，注意它连接的两部分要结构一致（平行结构）。还要分清从属连词（because / although / if）不能和 so / but 连用等规则。';
      case 'num':
        return '数词注意基数词和序数词的写法与用法：序数词前一般加 the，表示“第几”；数词修饰可数名词复数。注意 13 / 30 一类的拼写区别。';
      case 'art':
        return '冠词是最容易失分的小词：a / an 看后面单词的读音（不是字母），the 表示特指。要牢记一些固定搭配里用不用冠词。';
      case 'int':
        return '感叹词多用于口语，表达语气和情感，一般独立于句子结构之外，注意在语境中的使用场合与语气。';
      case 'modal':
        return '情态动词（can / may / must / should 等）后面一定接动词原形，没有人称和数的变化。要会区分它们表达的语气：can 表能力 / 许可，must 表必须，may 表可能。';
      default:
        return '这是一个功能词或结构较特殊的词条：重点记它在句子中的位置和与前后词的搭配关系，结合例句整体记忆，比死记中文释义更有效。';
    }
  }

  /* =====================================================================
   * 8. 汇总：enhance
   * ===================================================================== */
  function enhance(entry, allWords) {
    if (!entry || typeof entry !== 'object') entry = { word: String(entry || ''), meaning: '' };
    var word = entry.word || '';
    var pos = parsePOS(entry.meaning);
    var meanings = splitMeanings(entry.meaning);
    var colloc = collocations(word, pos);
    var pSent = practiceSentences(word, pos);
    var conf = confusables(word, allWords || []);
    var fam = wordFamily(word, allWords || []);
    var infl = inflections(word, pos);
    var spell = spellingTips(word);
    var pron = pronunciationTips(word, pos);
    return {
      id: entry.id,
      letter: entry.letter,
      word: word,
      phonetic: entry.phonetic || '',
      meaning: entry.meaning || '',
      pos: pos,
      posText: posText(pos),
      coreMeaning: meanings[0] || entry.meaning || '',
      fullMeanings: meanings,
      collocations: colloc,
      practiceSentences: pSent,
      confusables: conf,
      wordFamily: fam,
      inflections: infl.items,
      inflectionsNote: infl.note || '',
      spellingTips: spell,
      pronunciationTips: pron,
      reviewFocus: reviewFocus(word, pos, {
        coreMeaning: meanings[0] || entry.meaning || '',
        collocations: colloc,
        confusables: conf
      }),
      teacherTip: teacherTip(word, pos)
    };
  }

  /* =====================================================================
   * 9. 每日选词（日期种子）
   * ===================================================================== */
  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seed) {
    var rnd = mulberry32(seed);
    var a = arr.slice(0);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function dailyPick(allWords, learnedIds, dateStr, count) {
    count = count || 25;
    var learned = {};
    (learnedIds || []).forEach(function (id) { learned[id] = 1; });
    var unlearned = [], learnedList = [];
    (allWords || []).forEach(function (w) {
      (learned[w.id] ? learnedList : unlearned).push(w);
    });
    if (!unlearned.length) { unlearned = learnedList; learnedList = []; }
    var seed = hashSeed(String(dateStr || ''));
    var pick = seededShuffle(unlearned, seed);
    if (pick.length < count) {
      var fill = seededShuffle(learnedList, seed ^ 0x9e3779b9);
      pick = pick.concat(fill);
    }
    return pick.slice(0, count).map(function (w) { return w.id; });
  }

  return {
    parsePOS: parsePOS,
    splitMeanings: splitMeanings,
    inflections: inflections,
    collocations: collocations,
    sentencePatterns: sentencePatterns,
    practiceSentences: practiceSentences,
    confusables: confusables,
    wordFamily: wordFamily,
    spellingTips: spellingTips,
    pronunciationTips: pronunciationTips,
    reviewFocus: reviewFocus,
    teacherTip: teacherTip,
    enhance: enhance,
    dailyPick: dailyPick,
    seededShuffle: seededShuffle,
    hashSeed: hashSeed,
    cleanBase: cleanBase,
    COLLOCATION_COUNT: COLLOCATION_COUNT
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Logic; }
if (typeof window !== 'undefined') { window.Logic = Logic; }
