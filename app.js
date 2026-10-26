/* MSK Diagram Labeler (2026-10-25; on-picture answers + function layer).
 * One page per brick: data/brick_NN.json holds 1-3 hand-drawn schematic
 * diagrams. Every answer goes ON the picture, next to its structure:
 *   Type it    - type each structure's name in its box
 *   Word bank  - drag (or tap) each name from the bank onto its box
 *   Functions  - a switch that ADDS a second box under each name box for the
 *                structure's function; the functions join the bank (in Type
 *                it mode the bank holds just the functions)
 * "Instant feedback" judges each answer as soon as it is placed/entered.
 * No native dialogs anywhere (they freeze automation and annoy students).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var num = parseInt(params.get('b') || '1', 10);
  var mode = 'type', funcs = false, dIdx = 0, data = null, manifest = [];
  var state = {};      // key `${dIdx}|type`, `${dIdx}|bank`, `${dIdx}|func` -> {i: value}
  var checked = false, revealed = false;
  var selChip = null;  // {kind: 'name'|'func', v: text}
  var selSlot = null;  // {kind, i}
  var instant = false, judged = {};   // judged: typed names committed this round
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

  // ---------- state ----------
  function diagram() { return data.diagrams[dIdx]; }
  function store(k) { var kk = dIdx + '|' + k; return state[kk] || (state[kk] = {}); }
  function names() { return store(mode); }       // typed or banked names
  function fns() { return store('func'); }       // placed functions
  function filled(v) { return v != null && v !== ''; }

  function nameRight(i) {
    var lbl = diagram().labels[i], v = names()[i];
    if (!filled(v)) return false;
    return mode === 'type' ? typedMatches(v, lbl, diagram().labels) : v === lbl.name;
  }
  function funcRight(i) { return fns()[i] === diagram().labels[i].function; }
  function nameShown(i) { return filled(names()[i]) && (checked || (instant && (mode !== 'type' || judged[i]))); }
  function funcShown(i) { return filled(fns()[i]) && (checked || instant); }

  // ---------- rendering ----------
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function dropZone(node, kindOf, i) {
    node.addEventListener('dragover', function (e) { e.preventDefault(); node.classList.add('over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault(); node.classList.remove('over');
      var raw = e.dataTransfer.getData('text/plain');
      try { var c = JSON.parse(raw); place(i, c.kind, c.v); } catch (err) { /* foreign drag */ }
    });
  }

  function renderFigure() {
    var d = diagram(), vb = d.viewBox.split(/\s+/).map(Number);
    var box = $('svgbox');
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + d.viewBox + '">' + d.svg + '<g id="pins"></g></svg><div class="overlay" id="overlay"></div>';
    var g = box.querySelector('#pins'), ov = $('overlay');
    d.labels.forEach(function (lbl, i) {
      var px = lbl.lx != null ? lbl.lx : lbl.x, py = lbl.ly != null ? lbl.ly : lbl.y;
      if (lbl.lx != null) {
        g.appendChild(el('line', { x1: lbl.x, y1: lbl.y, x2: px, y2: py, 'class': 'lead' }));
        var dg = el('g', { 'class': 'pin' });
        dg.appendChild(el('circle', { cx: lbl.x, cy: lbl.y, r: 3.5, 'class': 'dot' }));
        g.appendChild(dg);
      }
      var ad = el('g', { 'class': 'pin anchor', 'data-i': i });
      ad.appendChild(el('circle', { cx: px, cy: py, r: 4.5 }));
      g.appendChild(ad);

      var fx = (px - vb[0]) / vb[2], fy = (py - vb[1]) / vb[3];
      // Grow away from the drawing's centre, but inward near an edge.
      var right = fx >= 0.5 ? (fx < 0.86) : (fx < 0.14);
      var wrap = document.createElement('div');
      wrap.className = 'tgtwrap ' + (right ? 'grow-r' : 'grow-l') + (funcs ? ' two' : '');
      wrap.dataset.i = i;
      wrap.style.left = (fx * 100) + '%'; wrap.style.top = (fy * 100) + '%';

      // name box
      var A = names(), t;
      if (mode === 'type') {
        t = document.createElement('input');
        t.className = 'tgt name'; t.type = 'text'; t.autocomplete = 'off'; t.spellcheck = false; t.placeholder = '?';
        t.setAttribute('aria-label', 'Name of structure ' + (i + 1));
        t.value = A[i] || '';
        t.addEventListener('input', function () { A[i] = t.value; delete judged[i]; if (checked || instant) mark(); });
        t.addEventListener('blur', function () { if (instant && t.value.trim()) { judged[i] = 1; mark(); } });
        t.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (instant && t.value.trim()) { judged[i] = 1; mark(); }
          var all = ov.querySelectorAll('input.tgt'), nx = all[Array.prototype.indexOf.call(all, t) + 1];
          if (nx) nx.focus(); else check();
        });
        if (selChip && selChip.kind === 'name') t.classList.add('hint');
      } else {
        t = document.createElement('div');
        t.className = 'tgt name' + (A[i] ? ' filled' : '');
        t.textContent = A[i] || 'name'; t.title = A[i] || '';
        t.addEventListener('click', function () { tapSlot('name', i); });
      }
      t.dataset.i = i; t.dataset.kind = 'name';
      dropZone(t, 'name', i);
      wrap.appendChild(t);

      // function box (Functions switch)
      if (funcs) {
        var F = fns();
        var f = document.createElement('div');
        f.className = 'tgt func' + (F[i] ? ' filled' : '');
        f.textContent = F[i] || 'function'; f.title = F[i] || '';
        f.dataset.i = i; f.dataset.kind = 'func';
        f.addEventListener('click', function () { tapSlot('func', i); });
        dropZone(f, 'func', i);
        wrap.appendChild(f);
      }

      if (revealed) {
        var r = document.createElement('div');
        r.className = 'tgt-reveal';
        r.textContent = lbl.name + (funcs ? ' — ' + lbl.function : '');
        r.title = r.textContent;
        wrap.appendChild(r);
      }
      ov.appendChild(wrap);
    });
    $('figcap').textContent = d.title || '';
    deoverlap();
  }

  // Keep answer groups from covering each other: flip a colliding group to
  // grow the other way, then nudge it vertically until it is clear. The anchor
  // dot (and leader line) stay put, so the boxes still read as belonging to it.
  function deoverlap() {
    var ov = $('overlay'); if (!ov) return;
    var boxes = Array.prototype.slice.call(ov.querySelectorAll('.tgtwrap'));
    var placed = [];
    function hit(r) {
      return placed.some(function (q) { return r.left < q.right + 3 && r.right > q.left - 3 && r.top < q.bottom + 2 && r.bottom > q.top - 2; });
    }
    boxes.forEach(function (b) {
      b.style.marginTop = '0px';
      var r = b.getBoundingClientRect();
      if (hit(r)) {
        var orig = b.classList.contains('grow-r') ? 'grow-r' : 'grow-l', flip = orig === 'grow-r' ? 'grow-l' : 'grow-r';
        b.classList.remove(orig); b.classList.add(flip);
        r = b.getBoundingClientRect();
        if (hit(r)) {
          b.classList.remove(flip); b.classList.add(orig);
          var h = Math.min(r.height, 30) + 3, tries = [];
          for (var k = 1; k <= 8; k++) tries.push(k * h, -k * h);
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
  window.addEventListener('resize', function () { if (data) deoverlap(); });

  function renderPanel() {
    $('stage').classList.add('wide');
    $('answers').innerHTML = '';
    $('hint').textContent =
      (mode === 'type' ? 'Type each structure’s name in its box on the diagram. Small typos are fine; press Enter for the next box.'
                       : 'Drag each name onto its box on the diagram, or tap a name and then a box. Tap a filled box to clear it.') +
      (funcs ? ' Then drop each function into the smaller box under the name.' : '');
    renderBank();
    mark();
  }

  function chipGroup(title, kindOf, values, used, seed) {
    var wrap = document.createElement('div'); wrap.className = 'bankgroup';
    var h = document.createElement('div'); h.className = 'bankhead'; h.textContent = title;
    wrap.appendChild(h);
    var row = document.createElement('div'); row.className = 'bankrow';
    shuffle(values, seed).forEach(function (v) {
      var chip = document.createElement('div');
      chip.className = 'chip ' + kindOf; chip.textContent = v; chip.draggable = true;
      if (used[v]) { chip.classList.add('used'); used[v]--; }
      if (selChip && selChip.kind === kindOf && selChip.v === v) chip.classList.add('sel');
      chip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: kindOf, v: v })); });
      chip.addEventListener('click', function () {
        selChip = (selChip && selChip.kind === kindOf && selChip.v === v) ? null : { kind: kindOf, v: v };
        if (selChip && selSlot) { place(selSlot.i, selChip.kind, selChip.v); return; }
        renderBank(); highlight();
      });
      row.appendChild(chip);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function countUsed(obj) { var u = {}; Object.keys(obj).forEach(function (k) { u[obj[k]] = (u[obj[k]] || 0) + 1; }); return u; }

  function renderBank() {
    var bank = $('bank'); bank.innerHTML = '';
    var labs = diagram().labels;
    if (mode === 'bank') bank.appendChild(chipGroup('Names', 'name', labs.map(function (l) { return l.name; }), countUsed(names()), num * 31 + dIdx * 7 + 1));
    if (funcs) bank.appendChild(chipGroup('Functions', 'func', labs.map(function (l) { return l.function; }), countUsed(fns()), num * 31 + dIdx * 7 + 3));
  }

  // Place a chip on structure i. A name dropped on a function box (or the
  // reverse) goes to the matching box of the same structure.
  function place(i, kindOf, v) {
    if (!filled(v)) return;
    if (kindOf === 'name' && mode === 'type') {   // typing mode has no name chips
      return;
    }
    var A = kindOf === 'func' ? fns() : names();
    Object.keys(A).forEach(function (k) { if (A[k] === v && +k !== i) delete A[k]; });
    A[i] = v; selChip = null; selSlot = null;
    refresh();
  }

  function tapSlot(kindOf, i) {
    var A = kindOf === 'func' ? fns() : names();
    if (selChip) { place(i, selChip.kind, selChip.v); return; }
    if (A[i]) { delete A[i]; refresh(); return; }
    selSlot = (selSlot && selSlot.i === i && selSlot.kind === kindOf) ? null : { kind: kindOf, i: i };
    highlight();
  }

  function highlight() {
    document.querySelectorAll('#overlay .tgt').forEach(function (t) {
      var on = selSlot && +t.dataset.i === selSlot.i && t.dataset.kind === selSlot.kind;
      t.classList.toggle('sel', !!on);
    });
  }

  function mark() {
    var d = diagram(), ok = 0;
    d.labels.forEach(function (_, i) {
      var nr = nameRight(i), fr = funcs && funcRight(i);
      if (nr) ok++;
      if (fr) ok++;
      var nb = document.querySelector('#overlay .tgt.name[data-i="' + i + '"]');
      var fb = document.querySelector('#overlay .tgt.func[data-i="' + i + '"]');
      var dot = document.querySelector('#pins .pin.anchor[data-i="' + i + '"]');
      [nb, fb, dot].forEach(function (e) { if (e) e.classList.remove('ok', 'bad'); });
      if (nb && nameShown(i)) nb.classList.add(nr ? 'ok' : 'bad');
      if (fb && funcShown(i)) fb.classList.add(fr ? 'ok' : 'bad');
      var states = [];
      if (nameShown(i)) states.push(nr);
      if (funcs && funcShown(i)) states.push(fr);
      if (dot && states.length) dot.classList.add(states.every(Boolean) ? 'ok' : 'bad');
    });
    $('score').textContent = (checked || instant) ? ok : 0;
    $('total').textContent = d.labels.length * (funcs ? 2 : 1);
    return ok;
  }

  function check() {
    checked = true;
    var ok = mark();
    if (ok === d_total() && window.atTrack) {
      try { window.atTrack('game_complete', { score: ok, total: ok, topic: data.title + ' / ' + mode + (funcs ? '+functions' : '') }); } catch (e) {}
    }
  }
  function d_total() { return diagram().labels.length * (funcs ? 2 : 1); }

  function refresh() { renderFigure(); renderPanel(); highlight(); }
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
    document.querySelectorAll('.mode').forEach(function (x) { x.classList.toggle('on', x.dataset.mode === mode); });
  }

  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () { mode = b.dataset.mode; resetRound(); syncModeButtons(); refresh(); });
  });
  $('funcs').checked = funcs;
  $('funcs').addEventListener('change', function () {
    funcs = $('funcs').checked;
    try { localStorage.setItem('mskl_funcs', funcs ? '1' : '0'); } catch (e) {}
    selChip = selSlot = null; refresh();
  });
  $('instant').checked = instant;
  $('instant').addEventListener('change', function () {
    instant = $('instant').checked;
    try { localStorage.setItem('mskl_instant', instant ? '1' : '0'); } catch (e) {}
    if (instant && mode === 'type') document.querySelectorAll('#overlay input.tgt').forEach(function (x) { if (x.value.trim()) judged[+x.dataset.i] = 1; });
    mark();
  });
  $('check').addEventListener('click', check);
  $('reveal').addEventListener('click', function () { revealed = !revealed; $('reveal').textContent = revealed ? 'Hide answers' : 'Reveal answers'; refresh(); });
  $('reset').addEventListener('click', function () { state[dIdx + '|' + mode] = {}; state[dIdx + '|func'] = {}; resetRound(); refresh(); });

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
