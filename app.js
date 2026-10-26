/* MSK Diagram Labeler (2026-10-25; on-picture answers 2026-10-25).
 * One page per brick: data/brick_NN.json holds 1-3 hand-drawn schematic
 * diagrams. Modes:
 *   Type it    - type each structure's name in a box ON the diagram
 *   Word bank  - drag (or tap) names from a bank onto the boxes on the diagram
 *   Functions  - a switch that instead shows numbered pins and asks for each
 *                structure's function from a function bank (numbered list)
 * "Instant feedback" judges each answer as soon as it is placed/entered.
 * No native dialogs anywhere (they freeze automation and annoy students).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var num = parseInt(params.get('b') || '1', 10);
  var mode = 'type', funcs = false, dIdx = 0, data = null, manifest = [];
  var state = {};      // key `${dIdx}|${kind}` -> {i: value}
  var checked = false, revealed = false, selChip = null, selSlot = null;
  var instant = false, judged = {};   // judged: typed answers committed this round
  try { instant = localStorage.getItem('mskl_instant') === '1'; } catch (e) {}
  try { funcs = localStorage.getItem('mskl_funcs') === '1'; } catch (e) {}

  var GENERIC = ['muscle', 'muscles', 'm', 'nerve', 'n', 'artery', 'a', 'vein', 'v', 'the',
                 'bone', 'of', 'and', 'joint', 'ligament', 'tendon'];

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function strip(s) { return norm(s).split(' ').filter(function (w) { return GENERIC.indexOf(w) < 0; }).join(' '); }
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function tol(s) { return s.length <= 4 ? 0 : s.length <= 7 ? 1 : s.length <= 14 ? 2 : 3; }

  function typedMatches(typed, label, labels) {
    var t = norm(typed), ts = strip(typed);
    if (!t) return false;
    var forms = [label.name].concat(label.accept || []).map(norm);
    for (var k = 0; k < forms.length; k++)
      if (lev(t, forms[k]) <= tol(forms[k])) return true;
    // Generic words ("muscle", "nerve"...) may be dropped only when that
    // still names exactly one structure in this diagram.
    if (!ts) return false;
    var mine = [label.name].concat(label.accept || []).map(strip);
    var hit = mine.some(function (f) { return f && lev(ts, f) <= tol(f); });
    if (!hit) return false;
    var others = labels.filter(function (o) { return o !== label; }).some(function (o) {
      return [o.name].concat(o.accept || []).map(strip).some(function (f) { return f && lev(ts, f) <= tol(f); });
    });
    return !others;
  }

  function shuffle(a, seed) {
    a = a.slice(); var s = seed || 1;
    for (var i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function kind() { return funcs ? 'func' : mode; }
  function key() { return dIdx + '|' + kind(); }
  function answers() { return state[key()] || (state[key()] = {}); }
  function diagram() { return data.diagrams[dIdx]; }
  function truth(lbl) { return kind() === 'func' ? lbl.function : lbl.name; }
  function hasAns(i) { var v = answers()[i]; return v != null && v !== ''; }

  function isRight(i) {
    var lbl = diagram().labels[i], v = answers()[i];
    if (v == null || v === '') return false;
    if (kind() === 'type') return typedMatches(v, lbl, diagram().labels);
    return v === truth(lbl);
  }
  function shown(i) {   // should this answer's right/wrong colour be visible?
    return hasAns(i) && (checked || (instant && (kind() !== 'type' || judged[i])));
  }

  // ---------- rendering ----------
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderFigure() {
    var d = diagram(), vb = d.viewBox.split(/\s+/).map(Number);
    var box = $('svgbox');
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + d.viewBox + '">' + d.svg + '<g id="pins"></g></svg><div class="overlay" id="overlay"></div>';
    var g = box.querySelector('#pins'), ov = $('overlay');
    var onPicture = kind() !== 'func';
    d.labels.forEach(function (lbl, i) {
      var px = lbl.lx != null ? lbl.lx : lbl.x, py = lbl.ly != null ? lbl.ly : lbl.y;
      if (lbl.lx != null) {
        g.appendChild(el('line', { x1: lbl.x, y1: lbl.y, x2: px, y2: py, 'class': 'lead' }));
        var dg = el('g', { 'class': 'pin', 'data-dot': i });
        dg.appendChild(el('circle', { cx: lbl.x, cy: lbl.y, r: 3.5, 'class': 'dot' }));
        g.appendChild(dg);
      }
      if (onPicture) {
        // A small anchor dot where the answer box sits; the box itself is HTML.
        var ad = el('g', { 'class': 'pin anchor', 'data-i': i });
        ad.appendChild(el('circle', { cx: px, cy: py, r: 4.5 }));
        g.appendChild(ad);
        var fx = (px - vb[0]) / vb[2], fy = (py - vb[1]) / vb[3];
        // Grow the box away from the drawing's centre, but inward near an edge.
        var right = fx >= 0.5 ? (fx < 0.86) : (fx < 0.14);
        var t = document.createElement(kind() === 'type' ? 'input' : 'div');
        t.className = 'tgt ' + (right ? 'grow-r' : 'grow-l');
        t.dataset.i = i;
        t.style.left = (fx * 100) + '%'; t.style.top = (fy * 100) + '%';
        if (kind() === 'type') {
          t.type = 'text'; t.autocomplete = 'off'; t.spellcheck = false; t.placeholder = '?';
          t.setAttribute('aria-label', 'Structure ' + (i + 1));
          t.value = answers()[i] || '';
          t.addEventListener('input', function () { answers()[i] = t.value; delete judged[i]; if (checked || instant) mark(); });
          t.addEventListener('blur', function () { if (instant && t.value.trim()) { judged[i] = 1; mark(); } });
          t.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (instant && t.value.trim()) { judged[i] = 1; mark(); }
            var all = ov.querySelectorAll('input.tgt'), nx = all[i + 1];
            if (nx) nx.focus(); else check();
          });
        } else {
          t.textContent = answers()[i] || 'drop here';
          if (answers()[i]) t.classList.add('filled');
          t.title = answers()[i] || '';
          t.addEventListener('click', function () {
            if (answers()[i] && !selChip) { delete answers()[i]; refresh(); return; }
            pickSlot(i);
          });
          t.addEventListener('dragover', function (e) { e.preventDefault(); t.classList.add('over'); });
          t.addEventListener('dragleave', function () { t.classList.remove('over'); });
          t.addEventListener('drop', function (e) { e.preventDefault(); t.classList.remove('over'); place(i, e.dataTransfer.getData('text/plain')); });
        }
        if (revealed) {
          var r = document.createElement('div');
          r.className = 'tgt-reveal ' + (right ? 'grow-r' : 'grow-l');
          r.style.left = t.style.left; r.style.top = t.style.top;
          r.textContent = lbl.name;
          ov.appendChild(r);
        }
        ov.appendChild(t);
      } else {
        var pin = el('g', { 'class': 'pin', 'data-i': i });
        pin.appendChild(el('circle', { cx: px, cy: py, r: 13 }));
        var tx = el('text', { x: px, y: py }); tx.textContent = i + 1;
        pin.appendChild(tx); g.appendChild(pin);
        pin.addEventListener('click', function () { pickSlot(i); });
        pin.addEventListener('dragover', function (e) { e.preventDefault(); });
        pin.addEventListener('drop', function (e) { e.preventDefault(); place(i, e.dataTransfer.getData('text/plain')); });
      }
    });
    $('figcap').textContent = d.title || '';
    if (onPicture) deoverlap();
  }

  // Keep answer boxes from covering each other: flip a colliding box to grow
  // the other way, then nudge it vertically until it is clear. The anchor dot
  // (and leader line) stay put, so the box still reads as belonging to it.
  function deoverlap() {
    var ov = $('overlay'); if (!ov) return;
    var boxes = Array.prototype.slice.call(ov.querySelectorAll('.tgt'));
    var placed = [];
    function hit(r) {
      return placed.some(function (q) { return r.left < q.right + 3 && r.right > q.left - 3 && r.top < q.bottom + 2 && r.bottom > q.top - 2; });
    }
    boxes.forEach(function (b) {
      b.style.marginTop = '0px';
      var r = b.getBoundingClientRect();
      if (hit(r)) {
        var flip = b.classList.contains('grow-r') ? 'grow-l' : 'grow-r';
        b.classList.remove('grow-r', 'grow-l'); b.classList.add(flip);
        r = b.getBoundingClientRect();
        if (hit(r)) {
          b.classList.remove('grow-r', 'grow-l'); b.classList.add(flip === 'grow-r' ? 'grow-l' : 'grow-r');
          var h = r.height + 3, tries = [h, -h, 2 * h, -2 * h, 3 * h, -3 * h, 4 * h, -4 * h, 5 * h, -5 * h];
          for (var t = 0; t < tries.length; t++) {
            b.style.marginTop = tries[t] + 'px';
            r = b.getBoundingClientRect();
            if (!hit(r)) break;
          }
        }
      }
      placed.push(b.getBoundingClientRect());
    });
  }
  window.addEventListener('resize', function () { if (data && kind() !== 'func') deoverlap(); });

  function renderPanel() {
    var d = diagram(), A = answers(), ol = $('answers');
    ol.innerHTML = '';
    var k = kind();
    $('stage').classList.toggle('wide', k !== 'func');
    $('hint').textContent = k === 'type'
      ? 'Type each structure’s name in its box on the diagram. Small typos are fine. Press Enter to move to the next box.'
      : k === 'bank' ? 'Drag a name onto its box on the diagram, or tap a name and then a box. Tap a filled box to clear it.'
      : 'Match each numbered structure to its function. Drag, or tap a function and then a slot.';
    if (k === 'func') {
      d.labels.forEach(function (lbl, i) {
        var li = document.createElement('li'); li.dataset.i = i;
        var n = document.createElement('div'); n.className = 'num'; n.textContent = i + 1;
        n.addEventListener('click', function () { pickSlot(i); });
        li.appendChild(n);
        var slot = document.createElement('div');
        slot.className = 'slot' + (A[i] ? ' filled' : ''); slot.textContent = A[i] || 'Drop here';
        slot.addEventListener('click', function () {
          if (A[i] && !selChip) { delete A[i]; refresh(); return; }
          pickSlot(i);
        });
        slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('over'); });
        slot.addEventListener('dragleave', function () { slot.classList.remove('over'); });
        slot.addEventListener('drop', function (e) { e.preventDefault(); slot.classList.remove('over'); place(i, e.dataTransfer.getData('text/plain')); });
        li.appendChild(slot);
        if (revealed) {
          var r = document.createElement('div'); r.className = 'reveal'; r.textContent = lbl.function;
          li.appendChild(r);
        }
        ol.appendChild(li);
      });
    }
    renderBank();
    mark();
  }

  function renderBank() {
    var bank = $('bank'); bank.innerHTML = '';
    if (kind() === 'type') return;
    var d = diagram(), A = answers();
    var used = {}; Object.keys(A).forEach(function (k) { used[A[k]] = (used[A[k]] || 0) + 1; });
    shuffle(d.labels.map(truth), num * 31 + dIdx * 7 + (kind() === 'func' ? 3 : 1)).forEach(function (v) {
      var chip = document.createElement('div');
      chip.className = 'chip'; chip.textContent = v; chip.draggable = true;
      if (used[v]) { chip.classList.add('used'); used[v]--; }
      if (selChip === v) chip.classList.add('sel');
      chip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', v); });
      chip.addEventListener('click', function () {
        selChip = selChip === v ? null : v;
        if (selChip && selSlot != null) { place(selSlot, selChip); return; }
        renderBank();
      });
      bank.appendChild(chip);
    });
  }

  function place(i, v) {
    if (!v) return;
    var A = answers();
    Object.keys(A).forEach(function (k) { if (A[k] === v && +k !== i) delete A[k]; });
    A[i] = v; selChip = null; selSlot = null; refresh();
  }

  function pickSlot(i) {
    if (kind() === 'type') { var inp = $('overlay').querySelectorAll('input.tgt')[i]; if (inp) inp.focus(); return; }
    if (selChip) { place(i, selChip); return; }
    selSlot = selSlot === i ? null : i; highlight(selSlot);
  }

  function highlight(i) {
    document.querySelectorAll('#answers li').forEach(function (li) { li.classList.toggle('sel', +li.dataset.i === i); });
    document.querySelectorAll('#pins .pin[data-i]').forEach(function (p) { p.classList.toggle('sel', +p.dataset.i === i); });
    document.querySelectorAll('#overlay .tgt').forEach(function (t) { t.classList.toggle('sel', +t.dataset.i === i); });
  }

  function mark() {
    var d = diagram(), ok = 0;
    d.labels.forEach(function (_, i) {
      var right = isRight(i);
      if (right) ok++;
      var targets = [document.querySelector('#answers li[data-i="' + i + '"]'),
                     document.querySelector('#pins .pin[data-i="' + i + '"]'),
                     document.querySelector('#overlay .tgt[data-i="' + i + '"]')];
      targets.forEach(function (e) {
        if (!e) return;
        e.classList.remove('ok', 'bad');
        if (shown(i)) e.classList.add(right ? 'ok' : 'bad');
      });
      var pin = document.querySelector('#pins .pin[data-i="' + i + '"]');
      if (pin) pin.classList.toggle('target', !checked && !instant && hasAns(i));
    });
    $('score').textContent = (checked || instant) ? ok : 0;
    $('total').textContent = d.labels.length;
    return ok;
  }

  function check() {
    checked = true;
    var ok = mark();
    if (ok === diagram().labels.length && window.atTrack) {
      try { window.atTrack('game_complete', { score: ok, total: ok, topic: data.title + ' / ' + kind() }); } catch (e) {}
    }
  }

  function refresh() { renderFigure(); renderPanel(); highlight(selSlot); }
  function resetRound() { checked = revealed = false; selChip = selSlot = null; judged = {}; $('reveal').textContent = 'Reveal answers'; }

  function renderTabs() {
    var t = $('dtabs'); t.innerHTML = '';
    if (data.diagrams.length < 2) return;
    data.diagrams.forEach(function (d, i) {
      var b = document.createElement('button');
      b.className = 'dtab' + (i === dIdx ? ' on' : ''); b.textContent = (i + 1) + '. ' + d.title;
      b.addEventListener('click', function () { dIdx = i; resetRound(); renderTabs(); refresh(); });
      t.appendChild(b);
    });
  }

  function syncModeButtons() {
    document.querySelectorAll('.mode').forEach(function (x) {
      x.classList.toggle('on', x.dataset.mode === mode);
      x.disabled = funcs;
      x.title = funcs ? 'Turn off Functions to name the structures' : '';
    });
  }

  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () { mode = b.dataset.mode; resetRound(); syncModeButtons(); refresh(); });
  });
  $('funcs').checked = funcs;
  $('funcs').addEventListener('change', function () {
    funcs = $('funcs').checked;
    try { localStorage.setItem('mskl_funcs', funcs ? '1' : '0'); } catch (e) {}
    resetRound(); syncModeButtons(); refresh();
  });
  $('instant').checked = instant;
  $('instant').addEventListener('change', function () {
    instant = $('instant').checked;
    try { localStorage.setItem('mskl_instant', instant ? '1' : '0'); } catch (e) {}
    if (instant && kind() === 'type') document.querySelectorAll('#overlay input.tgt').forEach(function (x) { if (x.value.trim()) judged[+x.dataset.i] = 1; });
    mark();
  });
  $('check').addEventListener('click', check);
  $('reveal').addEventListener('click', function () { revealed = !revealed; $('reveal').textContent = revealed ? 'Hide answers' : 'Reveal answers'; refresh(); });
  $('reset').addEventListener('click', function () { state[key()] = {}; resetRound(); refresh(); });

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  Promise.all([
    fetch('data/manifest.json').then(function (r) { return r.json(); }),
    fetch('data/brick_' + pad(num) + '.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    manifest = res[0]; data = res[1];
    document.title = data.title + ' | MSK Diagram Labeler';
    $('title').textContent = data.title;
    var at = manifest.findIndex(function (m) { return m.num === num; });
    var me = manifest[at];
    if (me) $('eyebrow').textContent = 'MSK Diagram Labeler · Week ' + me.week + ' Session ' + me.session;
    var prev = manifest[at - 1], next = manifest[at + 1];
    $('prev').href = prev ? 'play.html?b=' + prev.num : '#'; $('prev').setAttribute('aria-disabled', prev ? 'false' : 'true');
    $('next').href = next ? 'play.html?b=' + next.num : '#'; $('next').setAttribute('aria-disabled', next ? 'false' : 'true');
    syncModeButtons(); renderTabs(); refresh();
  }).catch(function () { $('title').textContent = 'Could not load this diagram.'; });
})();
