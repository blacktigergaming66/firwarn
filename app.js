/* Yanobeam — map logic */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const wrap = $('#mapWrap'), layer = $('#mapLayer'), img = $('#mapImg');
const markersEl = $('#markers'), pinEl = $('#pin'), youEl = $('#you');
const popup = $('#popup'), sheet = $('#sheet'), banner = $('#banner');
const confirmBar = $('#confirm'), fab = $('#fab'), sendBtn = $('#send');

const KEY = 'yanobeam.reports.v1';
const TYPES = {
  crash:      { label: 'Car crash',       icon: '#ic-crash',  color: '#E8352B' },
  stopped:    { label: 'Stopped car',     icon: '#ic-stopped',color: '#F59E0B', tri: true },
  police:     { label: 'Police control',  icon: '#ic-police', color: '#2F6FED' },
  undercover: { label: 'Undercover',      icon: '#ic-uc',     color: '#8A9099' }
};
const BRANDS = { ETK: 'ETK', BRKL: 'Bruckell', GVRL: 'Gavril', OTHERS: 'Others' };
const YOU = { fx: 0.545, fy: 0.135 };
const PLACES = [
  { n: 'Firwood town center', fx: .57, fy: .10 }, { n: 'Main Street', fx: .54, fy: .13 },
  { n: 'Harbor', fx: .87, fy: .57 },            { n: 'Sawmill', fx: .20, fy: .30 },
  { n: 'Fire station', fx: .60, fy: .16 },       { n: 'Farmhouse', fx: .33, fy: .80 },
  { n: 'Firewatch tower', fx: .13, fy: .18 },    { n: 'Service area', fx: .72, fy: .66 },
  { n: 'Haunted house', fx: .78, fy: .33 },      { n: 'River bridge', fx: .45, fy: .85 }
];

let WORLD = { w: 0, h: 0 }, fit = 1, minS = 1, maxS = 1;
let view = { x: 0, y: 0, s: 1 };
let mode = 'idle';           // idle | pinning | confirming | reporting
let pin = null;              // {x,y} world px
let sel = null;              // {type, brand?}
let tab = 'warnings';
let reports = [], points = 0, hintShown = false;
let popupWorld = null, popupId = null, tween = null;

/* ---------- storage ---------- */
function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY));
    if (j && Array.isArray(j.reports)) { reports = j.reports; points = j.points | 0; hintShown = !!j.hint; return true; }
  } catch (e) {}
  return false;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ reports, points, hint: hintShown })); } catch (e) {}
}
function seed() {
  const now = Date.now(), m = 60000;
  reports = [
    { id: 's1', fx: .56, fy: .12, type: 'police', t: now - 8 * m, confirms: 2, mine: false },
    { id: 's2', fx: .09, fy: .62, type: 'crash', t: now - 4 * m, confirms: 0, mine: false },
    { id: 's3', fx: .83, fy: .56, type: 'stopped', t: now - 16 * m, confirms: 1, mine: false },
    { id: 's4', fx: .35, fy: .06, type: 'undercover', brand: 'GVRL', t: now - 22 * m, confirms: 0, mine: false },
    { id: 's5', fx: .50, fy: .80, type: 'police', t: now - 12 * m, confirms: 0, mine: false }
  ];
}

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function title(r) {
  const t = TYPES[r.type] || TYPES.crash;
  return r.type === 'undercover' ? 'Undercover · ' + (BRANDS[r.brand] || 'Others') : t.label;
}
function age(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 50) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function coords(w) {
  const lat = 44.10 - (w.y / WORLD.h) * 0.0184;
  const lon = -70.35 + (w.x / WORLD.w) * 0.0256;
  return lat.toFixed(5) + ', ' + lon.toFixed(5);
}
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2750);
}

/* ---------- view ---------- */
function fitView() {
  fit = Math.min(wrap.clientWidth / WORLD.w, wrap.clientHeight / WORLD.h);
  minS = fit * 0.92; maxS = fit * 9;
  view.s = fit;
  view.x = (wrap.clientWidth - WORLD.w * fit) / 2;
  view.y = (wrap.clientHeight - WORLD.h * fit) / 2;
}
function apply() {
  layer.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
  layer.style.setProperty('--inv', 1 / view.s);
  updateScale();
  if (popupWorld) positionPopup();
}
function toWorld(cx, cy) {
  const r = wrap.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s };
}
function screenOf(w) { return { x: view.x + w.x * view.s, y: view.y + w.y * view.s }; }
function zoomAt(sx, sy, ns) {
  ns = clamp(ns, minS, maxS);
  const wx = (sx - view.x) / view.s, wy = (sy - view.y) / view.s;
  view.x = sx - wx * ns; view.y = sy - wy * ns; view.s = ns;
  apply();
}
function flyTo(fx, fy) {
  const w = { x: fx * WORLD.w, y: fy * WORLD.h };
  const ts = clamp(Math.max(view.s, fit * 2.6), minS, maxS);
  const r = wrap.getBoundingClientRect();
  tween = {
    t0: performance.now(), dur: 550,
    from: { x: view.x, y: view.y, s: view.s },
    to: { x: r.width / 2 - w.x * ts, y: r.height / 2 - w.y * ts, s: ts }
  };
  requestAnimationFrame(step);
}
function step(now) {
  if (!tween) return;
  const p = clamp((now - tween.t0) / tween.dur, 0, 1);
  const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  view.x = tween.from.x + (tween.to.x - tween.from.x) * e;
  view.y = tween.from.y + (tween.to.y - tween.from.y) * e;
  view.s = tween.from.s + (tween.to.s - tween.from.s) * e;
  apply();
  if (p < 1) requestAnimationFrame(step); else tween = null;
}
function updateScale() {
  if (!WORLD.w) return;
  const mPerPx = 2048 / (WORLD.w * view.s);   // map is 2.048 km across
  const opts = [25, 50, 100, 200, 500, 1000, 2000];
  let m = opts[0];
  for (const o of opts) if (o / mPerPx <= 72) m = o;
  $('#sBar').style.width = Math.round(m / mPerPx) + 'px';
  $('#sTxt').textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
}

/* ---------- image ---------- */
function onImgOk() {
  WORLD = { w: img.naturalWidth || 1600, h: img.naturalHeight || 1600 };
  fitView(); apply(); render(); updateFoot();
  youEl.style.left = (YOU.fx * WORLD.w) + 'px';
  youEl.style.top = (YOU.fy * WORLD.h) + 'px';
  if (!hintShown) {
    hintShown = true; save();
    setTimeout(() => toast('Tip: tap the red button to drop a pin'), 900);
  }
}
function onImgErr() {
  if (!img.dataset.tried) { img.dataset.tried = '1'; img.src = 'map.jpg'; return; }
  if (!img.dataset.ph) {
    img.dataset.ph = '1';
    img.src = placeholder();
    toast('map.png not found — showing placeholder');
  }
}
function placeholder() {
  const c = document.createElement('canvas'); c.width = c.height = 1600;
  const g = c.getContext('2d');
  g.fillStyle = '#CFE3C8'; g.fillRect(0, 0, 1600, 1600);
  g.fillStyle = '#A9D4A2';
  for (const b of [[120,180,300,240],[700,120,380,260],[200,900,420,320],[900,850,480,380],[520,480,340,260]])
    g.beginPath(), g.roundRect(b[0], b[1], b[2], b[3], 90), g.fill();
  g.fillStyle = '#A8CBE8';
  g.fillRect(1420, 0, 180, 1600); g.fillRect(0, 1340, 1600, 260);
  g.strokeStyle = '#F5C96B'; g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(140, 140); g.lineTo(1460, 140); g.lineTo(1460, 1460); g.lineTo(140, 1460); g.closePath(); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 14;
  g.beginPath(); g.moveTo(800, 60); g.lineTo(700, 900); g.lineTo(400, 1400); g.stroke();
  g.beginPath(); g.moveTo(140, 700); g.lineTo(1400, 620); g.stroke();
  g.beginPath(); g.moveTo(300, 1460); g.lineTo(500, 900); g.lineTo(1420, 1000); g.stroke();
  g.fillStyle = '#D8DBDF'; g.fillRect(640, 90, 420, 260);
  return c.toDataURL('image/png');
}

/* ---------- markers ---------- */
function markerHTML(r) {
  const t = TYPES[r.type] || TYPES.crash;
  const x = r.fx * WORLD.w, y = r.fy * WORLD.h;
  const badge = t.tri
    ? '<span class="badge tri"><svg viewBox="0 0 48 48"><use href="' + t.icon + '"/></svg></span>'
    : '<span class="badge" style="background:' + t.color + '"><svg viewBox="0 0 48 48"><use href="' + t.icon + '"/></svg></span>';
  return '<div class="marker" data-id="' + r.id + '" style="left:' + x + 'px;top:' + y + 'px" ' +
    'role="button" aria-label="' + title(r) + '">' + badge +
    (r.confirms ? '<span class="cnt">' + r.confirms + '</span>' : '') + '</div>';
}
function render() { markersEl.innerHTML = reports.map(markerHTML).join(''); }
function updateFoot() {
  let near = 0;
  for (const r of reports) {
    const dx = r.fx - YOU.fx, dy = r.fy - YOU.fy;
    if (dx * dx + dy * dy < 0.0144) near++;
  }
  $('#footL').textContent = 'Firwood, Maine · ' + near + ' report' + (near === 1 ? '' : 's') + ' nearby';
  $('#footR').hidden = points < 1;
  $('#pts').textContent = points;
}

/* ---------- popup ---------- */
function openPopup(id) {
  const r = reports.find(x => x.id === id); if (!r) return;
  popupId = id; popupWorld = { x: r.fx * WORLD.w, y: r.fy * WORLD.h };
  const t = TYPES[r.type] || TYPES.crash;
  const badge = t.tri
    ? '<span class="badge tri"><svg viewBox="0 0 48 48"><use href="' + t.icon + '"/></svg></span>'
    : '<span class="badge" style="background:' + t.color + '"><svg viewBox="0 0 48 48"><use href="' + t.icon + '"/></svg></span>';
  popup.innerHTML =
    '<div class="pHead">' + badge + '<div><b>' + title(r) + '</b><small>reported ' + age(r.t) + '</small></div></div>' +
    (r.confirms ? '<div class="pMeta">' + r.confirms + ' driver' + (r.confirms === 1 ? '' : 's') + ' confirmed this</div>' : '') +
    '<div class="pActs"><button data-act="still">Still there</button>' +
    (r.mine ? '<button class="danger" data-act="remove">Remove</button>' : '') + '</div>';
  popup.hidden = false;
  positionPopup();
}
function positionPopup() {
  const s = screenOf(popupWorld), r = wrap.getBoundingClientRect();
  popup.style.left = clamp(s.x, 140, r.width - 140) + 'px';
  popup.style.top = Math.max(s.y, 150) + 'px';
}
function closePopup() { popup.hidden = true; popupId = null; popupWorld = null; }
popup.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !popupId) return;
  const r = reports.find(x => x.id === popupId); if (!r) return;
  if (b.dataset.act === 'still') { r.confirms = (r.confirms | 0) + 1; save(); render(); openPopup(r.id); toast('Confirmed — thanks!'); }
  if (b.dataset.act === 'remove') { reports = reports.filter(x => x.id !== r.id); save(); render(); closePopup(); updateFoot(); toast('Report removed'); }
});

/* ---------- pin / modes ---------- */
function setPin(w) {
  pin = { x: clamp(w.x, 0, WORLD.w), y: clamp(w.y, 0, WORLD.h) };
  pinEl.hidden = false;
  pinEl.style.left = pin.x + 'px'; pinEl.style.top = pin.y + 'px';
  pinEl.querySelector('svg').style.animation = 'none';
  void pinEl.offsetWidth;
  pinEl.querySelector('svg').style.animation = '';
  $('#posTxt').textContent = coords(pin);
  $('#posTxt2').textContent = coords(pin);
}
function toIdle() {
  mode = 'idle'; pin = null; pinEl.hidden = true;
  confirmBar.hidden = true; banner.hidden = true;
  document.body.classList.remove('pinning', 'confirming', 'sheetopen');
  fab.querySelector('.bang').hidden = false; fab.querySelector('.xIco').hidden = true;
}
function startPinning() {
  mode = 'pinning'; banner.hidden = false;
  document.body.classList.add('pinning');
  fab.querySelector('.bang').hidden = true; fab.querySelector('.xIco').hidden = false;
}
function handleMapClick(cx, cy) {
  closePopup();
  if (mode !== 'pinning' && mode !== 'confirming') return;
  setPin(toWorld(cx, cy));
  mode = 'confirming';
  document.body.classList.add('confirming');
  confirmBar.hidden = false;
}

/* ---------- sheet ---------- */
function openSheet() {
  mode = 'reporting';
  document.body.classList.remove('confirming');
  document.body.classList.add('sheetopen');
  confirmBar.hidden = true;
  setTab(tab);
  sheet.classList.add('open');
}
function closeSheet() { sheet.classList.remove('open'); }
function setTab(t) {
  tab = t;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.pane').forEach(p => p.hidden = p.dataset.pane !== t);
}
function markSel(el) {
  $$('.opt.sel,.flat.sel').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
  sendBtn.disabled = false;
}
$$('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$$('.opt').forEach(b => b.onclick = () => {
  if (b.dataset.type === 'undercover') {
    $('#policeOpts').hidden = true; $('#brandPick').hidden = false; return;
  }
  sel = { type: b.dataset.type };
  markSel(b);
});
$$('.flat[data-brand]').forEach(b => b.onclick = () => {
  sel = { type: 'undercover', brand: b.dataset.brand };
  markSel(b);
});
$('#brandBack').onclick = () => {
  $('#brandPick').hidden = true; $('#policeOpts').hidden = false;
};
sendBtn.onclick = () => {
  if (!sel || !pin) return;
  const r = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    fx: pin.x / WORLD.w, fy: pin.y / WORLD.h,
    type: sel.type, brand: sel.brand, t: Date.now(), confirms: 0, mine: true
  };
  reports.push(r); points++; save();
  render(); updateFoot();
  const el = markersEl.querySelector('[data-id="' + r.id + '"]');
  if (el) el.classList.add('pop');
  closeSheet(); toIdle();
  toast(title(r) + ' sent — nice one!');
};
$('#sClose').onclick = () => { closeSheet(); toIdle(); };

/* ---------- chrome events ---------- */
fab.onclick = () => { if (mode === 'idle') startPinning(); else { closeSheet(); toIdle(); } };
$('#bannerX').onclick = () => { closeSheet(); toIdle(); };
$('#cCancel').onclick = () => toIdle();
$('#cOk').onclick = () => openSheet();

$('#zin').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, view.s * 1.4);
$('#zout').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, view.s / 1.4);
$('#loc').onclick = () => flyTo(YOU.fx, YOU.fy);

markersEl.addEventListener('click', e => {
  const m = e.target.closest('.marker'); if (!m) return;
  openPopup(m.dataset.id);
});

/* ---------- pan / pinch / click ---------- */
const pts = new Map();
let drag = null, moved = 0, downT = 0, pinch = null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

wrap.addEventListener('pointerdown', e => {
  if (e.target.closest('.ui')) return;
  tween = null;
  if (!popup.hidden) closePopup();
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    moved = 0; downT = Date.now();
    try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
  } else if (pts.size === 2) {
    drag = null;
    const [a, b] = [...pts.values()];
    pinch = { d: dist(a, b) };
  }
});
wrap.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2 && pinch) {
    const [a, b] = [...pts.values()];
    const r = wrap.getBoundingClientRect();
    zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, view.s * (dist(a, b) / pinch.d));
    pinch.d = dist(a, b);
    moved += 99;
    return;
  }
  if (drag && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    view.x += dx; view.y += dy;
    apply();
  }
});
function endPtr(e) {
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (drag && e.pointerId === drag.id) {
    if (moved < 8 && Date.now() - downT < 600) handleMapClick(e.clientX, e.clientY);
    drag = null;
  }
}
wrap.addEventListener('pointerup', endPtr);
wrap.addEventListener('pointercancel', endPtr);

wrap.addEventListener('wheel', e => {
  e.preventDefault(); tween = null;
  const r = wrap.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, view.s * Math.exp(-e.deltaY * 0.0018));
}, { passive: false });

wrap.addEventListener('dblclick', e => {
  const r = wrap.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, view.s * 1.6);
});

/* ---------- search ---------- */
const q = $('#q'), results = $('#results');
function showResults() {
  const v = q.value.trim().toLowerCase();
  const list = PLACES.filter(p => !v || p.n.toLowerCase().includes(v)).slice(0, 6);
  results.innerHTML = list.length
    ? list.map(p => '<button data-fx="' + p.fx + '" data-fy="' + p.fy + '">' + p.n + '</button>').join('')
    : '<div class="none">No places found</div>';
  results.hidden = false;
}
function hideResults() { results.hidden = true; }
q.addEventListener('focus', showResults);
q.addEventListener('input', showResults);
q.addEventListener('blur', () => setTimeout(hideResults, 150));
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const b = results.querySelector('button'); if (b) b.click(); }
  if (e.key === 'Escape') { q.blur(); hideResults(); }
});
results.addEventListener('mousedown', e => e.preventDefault());
results.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  flyTo(parseFloat(b.dataset.fx), parseFloat(b.dataset.fy));
  q.value = ''; hideResults();
});

/* ---------- keyboard ---------- */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (sheet.classList.contains('open')) { closeSheet(); toIdle(); }
    else if (!popup.hidden) closePopup();
    else if (mode !== 'idle') toIdle();
  }
  if (e.key === '+' || e.key === '=') $('#zin').click();
  if (e.key === '-') $('#zout').click();
});

/* ---------- misc ---------- */
window.addEventListener('resize', () => { if (WORLD.w) { fitView(); apply(); } });

let online = 287;
setInterval(() => {
  online = clamp(online + Math.round(Math.random() * 7 - 3), 180, 560);
  $('#onlineN').textContent = online;
}, 4000);

setInterval(() => { if (popupId) openPopup(popupId); }, 60000);

/* ---------- boot ---------- */
if (!load()) { seed(); save(); }
img.addEventListener('load', onImgOk);
img.addEventListener('error', onImgErr);
if (img.complete) { if (img.naturalWidth) onImgOk(); else onImgErr(); }
})();
