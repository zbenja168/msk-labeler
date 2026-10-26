/* MSK Diagram Labeler (2026-10-25).
 * One page per brick: data/brick_NN.json holds 1-3 hand-drawn schematic
 * diagrams, each with numbered pins. Three modes:
 *   type: type each structure's name (typo-tolerant, accepts listed aliases)
 *   bank: drag or tap names from a word bank onto the pins
 *   func: match each structure to its function from a function bank
 * No native dialogs anywhere (they freeze automation and annoy students).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var num = parseInt(params.get('b') || '1', 10);
  var mode = 'type', dIdx = 0, data = null, manifest = [];
  var state = {};      // key `${dIdx}|${mode}` -> {i: value}
  var checked = false, revealed = false, selChip = null, selSlot = null;
  // Instant feedback: judge each answer as soon as it is placed (bank modes)
  // or committed with Enter / leaving the box (type mode). Remembered per device.
  var instant = false, judged = {};   // judged: type-mode indices committed this round
  try { instant = localStorage.getItem('mskl_instant') === '1'; } catch (e) {}

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

  function key() { return dIdx + '|' + mode; }
  function answers() { return state[key()] || (state[key()] = {}); }
  function diagram() { return data.diagrams[dIdx]; }
  function truth(lbl) { return mode === 'func' ? lbl.function : lbl.name; }

  function isRight(i) {
    var lbl = diagram().labels[i], v = answers()[i];
    if (v == null || v === '') return false;
    if (mode === 'type') return typedMatches(v, lbl, diagram().labels);
    return v === truth(lbl);
  }

  // ---------- rendering ----------
  function renderSvg() {
    var d = diagram();
    var box = $('svgbox');
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + d.viewBox + '">' + d.svg + '<g id="pins"></g></svg>';
    var g = box.querySelector('#pins');
    d.labels.forEach(function (lbl, i) {
      var px = lbl.lx != null ? lbl.lx : lbl.x, py = lbl.ly != null ? lbl.ly : lbl.y;
      var ns = 'http://www.w3.org/2000/svg';
      if (lbl.lx != null) {
        var ln = document.createElementNS(ns, 'line');
        ln.setAttribute('x1', lbl.x); ln.setAttribute('y1', lbl.y); ln.setAttribute('x2', px); ln.setAttribute('y2', py);
        ln.setAttribute('class', 'lead'); g.appendChild(ln);
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', lbl.x); dot.setAttribute('cy', lbl.y); dot.setAttribute('r', 3.5);
        dot.setAttribute('class', 'dot');
        var dg = document.createElementNS(ns, 'g'); dg.setAttribute('class', 'pin'); dg.appendChild(dot); g.appendChild(dg);
      }
      var pin = document.createElementNS(ns, 'g');
      pin.setAttribute('class', 'pin'); pin.setAttribute('data-i', i);
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', px); c.setAttribute('cy', py); c.setAttribute('r', 13);
      var tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', px); tx.setAttribute('y', py); tx.textContent = i + 1;
      pin.appendChild(c); pin.appendChild(tx); g.appendChild(pin);
      pin.addEventListener('click', function () { pickSlot(i); });
      pin.addEventListener('dragover', function (e) { e.preventDefault(); });
      pin.addEventListener('drop', function (e) { e.preventDefault(); place(i, e.dataTransfer.getData('text/plain')); });
    });
    $('figcap').textContent = d.title || '';
  }

  function renderPanel() {
    var d = diagram(), A = answers(), ol = $('answers');
    ol.innerHTML = '';
    $('hint').textContent = mode === 'type'
      ? 'Type the name of each numbered structure. Small typos are fine. Press Enter to move down.'
      : mode === 'bank' ? 'Drag a name onto a numbered slot or pin, or tap a name and then a slot. Tap a filled slot to clear it.'
      : 'Match each numbered structure to its function. Drag, or tap a function and then a slot.';
    d.labels.forEach(function (lbl, i) {
      var li = document.createElement('li'); li.dataset.i = i;
      var n = document.createElement('div'); n.className = 'num'; n.textContent = i + 1;
      n.addEventListener('click', function () { pickSlot(i); });
      li.appendChild(n);
      if (mode === 'type') {
        var inp = document.createElement('input');
        inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false;
        inp.placeholder = 'Structure ' + (i + 1); inp.value = A[i] || '';
        inp.addEventListener('input', function () { A[i] = inp.value; delete judged[i]; if (checked || instant) mark(); });
        inp.addEventListener('blur', function () { if (instant && inp.value.trim()) { judged[i] = 1; mark(); } });
        inp.addEventListener('focus', function () { highlight(i); });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); if (instant && inp.value.trim()) { judged[i] = 1; mark(); } var nx = ol.querySelectorAll('input')[i + 1]; if (nx) nx.focus(); else check(); }
        });
        li.appendChild(inp);
      } else {
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
      }
      if (revealed) {
        var r = document.createElement('div'); r.className = 'reveal'; r.textContent = truth(lbl);
        li.appendChild(r);
      }
      ol.appendChild(li);
    });
    renderBank();
    mark();
  }

  function renderBank() {
    var bank = $('bank'); bank.innerHTML = '';
    if (mode === 'type') return;
    var d = diagram(), A = answers();
    var used = {}; Object.keys(A).forEach(function (k) { used[A[k]] = (used[A[k]] || 0) + 1; });
    shuffle(d.labels.map(truth), num * 31 + dIdx * 7 + (mode === 'func' ? 3 : 1)).forEach(function (v) {
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
    if (mode === 'type') { var inp = $('answers').querySelectorAll('input')[i]; if (inp) inp.focus(); return; }
    if (selChip) { place(i, selChip); return; }
    selSlot = selSlot === i ? null : i; highlight(selSlot);
  }

  function highlight(i) {
    document.querySelectorAll('#answers li').forEach(function (li) { li.classList.toggle('sel', +li.dataset.i === i); });
    document.querySelectorAll('#pins .pin[data-i]').forEach(function (p) { p.classList.toggle('sel', +p.dataset.i === i); });
  }

  function mark() {
    var d = diagram(), ok = 0;
    d.labels.forEach(function (_, i) {
      var right = isRight(i), has = answers()[i] != null && answers()[i] !== '';
      if (right) ok++;
      var li = document.querySelector('#answers li[data-i="' + i + '"]');
      var pin = document.querySelector('#pins .pin[data-i="' + i + '"]');
      [li, pin].forEach(function (el) {
        if (!el) return;
        el.classList.remove('ok', 'bad');
        if (has && (checked || (instant && (mode !== 'type' || judged[i])))) el.classList.add(right ? 'ok' : 'bad');
      });
      if (pin) pin.classList.toggle('target', !checked && !instant && has);
    });
    $('score').textContent = (checked || instant) ? ok : 0;
    $('total').textContent = d.labels.length;
    return ok;
  }

  function check() {
    checked = true;
    var ok = mark();
    if (ok === diagram().labels.length && window.atTrack) {
      try { window.atTrack('game_complete', { score: ok, total: ok, topic: data.title + ' / ' + mode }); } catch (e) {}
    }
  }

  function refresh() { renderPanel(); highlight(selSlot); }

  function renderTabs() {
    var t = $('dtabs'); t.innerHTML = '';
    if (data.diagrams.length < 2) return;
    data.diagrams.forEach(function (d, i) {
      var b = document.createElement('button');
      b.className = 'dtab' + (i === dIdx ? ' on' : ''); b.textContent = (i + 1) + '. ' + d.title;
      b.addEventListener('click', function () { dIdx = i; checked = revealed = false; selChip = selSlot = null; judged = {}; renderAll(); });
      t.appendChild(b);
    });
  }

  function renderAll() { renderTabs(); renderSvg(); refresh(); }

  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.mode; checked = revealed = false; selChip = selSlot = null; judged = {};
      document.querySelectorAll('.mode').forEach(function (x) { x.classList.toggle('on', x === b); });
      refresh();
    });
  });
  $('instant').checked = instant;
  $('instant').addEventListener('change', function () {
    instant = $('instant').checked;
    try { localStorage.setItem('mskl_instant', instant ? '1' : '0'); } catch (e) {}
    if (instant && mode === 'type') document.querySelectorAll('#answers input').forEach(function (x, i) { if (x.value.trim()) judged[i] = 1; });
    mark();
  });
  $('check').addEventListener('click', check);
  $('reveal').addEventListener('click', function () { revealed = !revealed; $('reveal').textContent = revealed ? 'Hide answers' : 'Reveal answers'; refresh(); });
  $('reset').addEventListener('click', function () { state[key()] = {}; judged = {}; checked = revealed = false; $('reveal').textContent = 'Reveal answers'; selChip = selSlot = null; refresh(); });

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
    renderAll();
  }).catch(function () { $('title').textContent = 'Could not load this diagram.'; });
})();
