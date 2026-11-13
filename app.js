/* firwarn — live road reports for BeamNG East Coast
   map engine + crosshair + shared live feed (MantleDB) */

(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const wrap = $('#mapWrap'), layer = $('#mapLayer'), img = $('#mapImg');
const markersEl = $('#markers'), crossEl = $('#cross'), popup = $('#popup');
const sheet = $('#sheet'), banner = $('#banner'), confirmBar = $('#confirm');
const fab = $('#fab'), sendBtn = $('#send');

/* ---------- config ---------- */
const LS = {
  names: 'firwarn.names.v1',
  cur: 'firwarn.username.v1',
  cache: 'firwarn.cache.v1'
};
const API = 'https://mantledb.sh/v2/firwarn-live/state';
const POLL_FAST = 9000;    // right after activity
const POLL_SLOW = 30000;   // idle
const REPORT_TTL = 24 * 3600 * 1000;

const TYPES = {
  crash:    { label: 'Car crash',      img: 'icons/crash.png',   bg: '#FDECEA' },
  stopped:  { label: 'Stopped car',    img: 'icons/stopped.png', bg: '#FFF6E5' },
  police:   { label: 'Police control', img: 'icons/police.png',  bg: '#EAF1FE' },
  unmarked: { label: 'Unmarked',       gray: true }
};
const BRANDS = { ETK: 'ETK', GVRL: 'Gavril', BRKL: 'Bruckell', OTHR: 'Other' };
const PLACES = [
  { n: 'Firwood town center', fx: .57, fy: .10 }, { n: 'Main Street', fx: .54, fy: .13 },
  { n: 'Harbor', fx: .87, fy: .57 },            { n: 'Sawmill', fx: .20, fy: .30 },
  { n: 'Fire station', fx: .60, fy: .16 },       { n: 'Farmhouse', fx: .33, fy: .80 },
  { n: 'Firewatch tower', fx: .13, fy: .18 },    { n: 'Service area', fx: .72, fy: .66 },
  { n: 'Haunted house', fx: .78, fy: .33 },      { n: 'River bridge', fx: .45, fy: .85 }
];

/* ---------- state ---------- */
let WORLD = { w: 0, h: 0 }, fit = 1, minS = 1, maxS = 1;
let view = { x: 0, y: 0, s: 1 };
let mode = 'idle';              // idle | pinning | confirming | reporting
let cross = null;               // {x,y} world px — moves ONLY on map click
let sel = null;                 // {type, brand?}
let tab = 'warnings';
let reports = [];               // shared live reports
let username = null;
let popupId = null, popupWorld = null, tween = null;
let pollTimer = null, fastUntil = 0, writing = false;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function title(r) {
  const t = TYPES[r.type] || TYPES.crash;
  return r.type === 'unmarked' ? 'Unmarked · ' + (BRANDS[r.brand] || 'Other') : t.label;
}
function age(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
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
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2300);
  setTimeout(() => el.remove(), 2650);
}
function badgeHTML(r, size) {
  const t = TYPES[r.type] || TYPES.crash;
  if (t.gray) {
    const inner = r.brand === 'OTHR'
      ? '<svg viewBox="0 0 48 48"><use href="#ic-darkcar"/></svg>'
      : '<b>' + (r.brand || 'OTHR') + '</b>';
    return '<span class="mk gray"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + inner + '</span>';
  }
  return '<span class="mk" style="background:' + t.bg + '"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' +
    '<img src="' + t.img + '" alt=""></span>';
}

/* ---------- username ---------- */
function loadNames() {
  try { return JSON.parse(localStorage.getItem(LS.names)) || []; } catch (e) { return []; }
}
function saveName(n) {
  const list = loadNames().filter(x => x.toLowerCase() !== n.toLowerCase());
  list.unshift(n);
  try { localStorage.setItem(LS.names, JSON.stringify(list.slice(0, 8))); } catch (e) {}
}
function showUserChip() {
  $('#uname').textContent = username;
  $('#uav').textContent = username.slice(0, 1).toUpperCase();
}
function openNameModal() {
  const prev = loadNames();
  const box = $('#prevNames');
  if (prev.length) {
    box.hidden = false;
    box.innerHTML = '<div style="flex-basis:100%;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#666E78;margin-bottom:2px">your last username' + (prev.length > 1 ? 's' : '') + '</div>' +
      prev.map(n => '<button data-n="' + n.replace(/"/g, '&quot;') + '">' + n + '</button>').join('');
  } else box.hidden = true;
  $('#nameModal').hidden = false;
  setTimeout(() => $('#nameIn').focus(), 60);
}
function setUserName(n) {
  username = n;
  try { localStorage.setItem(LS.cur, n); } catch (e) {}
  saveName(n);
  showUserChip();
  $('#nameModal').hidden = true;
  toast('hey ' + n + ' — you\'re all set');
}
$('#prevNames').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]'); if (b) setUserName(b.dataset.n);
});
$('#nameGo').onclick = () => {
  const v = $('#nameIn').value.trim().replace(/\s+/g, ' ').slice(0, 16);
  if (v.length < 2) { $('#nameIn').focus(); toast('at least 2 characters'); return; }
  setUserName(v);
};
$('#nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#nameGo').click(); });

/* username menu in top bar */
$('#userChip').onclick = e => {
  e.stopPropagation();
  const m = $('#userMenu');
  if (!m.hidden) { m.hidden = true; return; }
  const prev = loadNames().filter(n => n !== username);
  m.innerHTML = '<div class="umT">signed in as</div>' +
    '<button class="cur"><span class="uav">' + username.slice(0, 1).toUpperCase() + '</span>' + username + '</button>' +
    (prev.length ? '<div class="umT">switch</div>' + prev.map(n =>
      '<button data-n="' + n.replace(/"/g, '&quot;') + '"><span class="uav" style="background:#8A9099">' + n.slice(0, 1).toUpperCase() + '</span>' + n + '</button>').join('') : '') +
    '<button class="umNew" data-new="1">+ use a different name</button>';
  m.hidden = false;
};
$('#userMenu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $('#userMenu').hidden = true;
  if (b.dataset.new) { openNameModal(); return; }
  if (b.dataset.n) { setUserName(b.dataset.n); }
});
document.addEventListener('click', e => {
  if (!e.target.closest('#userMenu') && !e.target.closest('#userChip')) $('#userMenu').hidden = true;
});

/* ---------- view ---------- */
function fitView() {
  fit = Math.min(wrap.clientWidth / WORLD.w, wrap.clientHeight / WORLD.h);
  minS = fit * 0.9; maxS = fit * 11;                 // nice deep zoom
  view.s = fit;
  view.x = (wrap.clientWidth - WORLD.w * fit) / 2;
  view.y = (wrap.clientHeight - WORLD.h * fit) / 2;
}
function apply() {
  layer.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
  layer.style.setProperty('--inv', 1 / view.s);
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
  const ts = clamp(Math.max(view.s, fit * 2.8), minS, maxS);
  const r = wrap.getBoundingClientRect();
  tween = {
    t0: performance.now(), dur: 560,
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

/* ---------- image ---------- */
function onImgOk() {
  WORLD = { w: img.naturalWidth || 1600, h: img.naturalHeight || 1600 };
  fitView(); apply(); render(); updateFoot();
  if (!cross) setCross({ x: WORLD.w / 2, y: WORLD.h / 2 }, false);
}
function onImgErr() {
  if (!img.dataset.ph) {
    img.dataset.ph = '1';
    img.src = placeholder();
    toast('map.png missing — showing placeholder');
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
  g.beginPath(); g.moveTo(140,140); g.lineTo(1460,140); g.lineTo(1460,1460); g.lineTo(140,1460); g.closePath(); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 14;
  g.beginPath(); g.moveTo(800,60); g.lineTo(700,900); g.lineTo(400,1400); g.stroke();
  g.beginPath(); g.moveTo(140,700); g.lineTo(1400,620); g.stroke();
  g.beginPath(); g.moveTo(300,1460); g.lineTo(500,900); g.lineTo(1420,1000); g.stroke();
  return c.toDataURL('image/png');
}

/* ---------- live feed (MantleDB) ---------- */
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return list.filter(r => r && typeof r === 'object' && r.id && r.type && TYPES[r.type] && (now - r.t) < REPORT_TTL)
    .map(r => ({
      id: String(r.id).slice(0, 20),
      fx: clamp(+r.fx || 0, 0, 1), fy: clamp(+r.fy || 0, 0, 1),
      type: r.type, brand: r.brand ? String(r.brand).slice(0, 8) : undefined,
      by: String(r.by || '?').slice(0, 16),
      t: +r.t || now,
      yes: Array.isArray(r.yes) ? [...new Set(r.yes.map(String))].slice(0, 200) : [],
      no: Array.isArray(r.no) ? [...new Set(r.no.map(String))].slice(0, 200) : []
    }));
}
function cacheWrite() {
  try { localStorage.setItem(LS.cache, JSON.stringify(reports.slice(0, 80))); } catch (e) {}
}
function cacheRead() {
  try {
    const c = JSON.parse(localStorage.getItem(LS.cache));
    if (Array.isArray(c)) { reports = sanitize(c); render(); renderFeed(); updateFoot(); }
  } catch (e) {}
}
function setLive(state) {
  const p = $('#live');
  p.classList.remove('on', 'off');
  if (state === 'on') { p.classList.add('on'); $('#liveTxt').textContent = 'live'; }
  else if (state === 'off') { p.classList.add('off'); $('#liveTxt').textContent = 'offline'; }
  else $('#liveTxt').textContent = 'connecting…';
}
async function pull() {
  try {
    const r = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const incoming = sanitize(d.reports);
    // merge: keep newest per id, add anything we haven't seen
    const map = new Map(reports.map(x => [x.id, x]));
    for (const inc of incoming) {
      const mine = map.get(inc.id);
      if (!mine) map.set(inc.id, inc);
      else map.set(inc.id, { ...mine, ...inc, yes: [...new Set([...mine.yes, ...inc.yes])], no: [...new Set([...mine.no, ...inc.no])] });
    }
    // drop reports the server no longer has (someone pruned them)
    const serverIds = new Set(incoming.map(x => x.id));
    for (const id of [...map.keys()]) if (!serverIds.has(id) && Date.now() - map.get(id).t > 120000 && !map.get(id)._mine) map.delete(id);
    reports = [...map.values()].sort((a, b) => b.t - a.t);
    cacheWrite(); render(); renderFeed(); updateFoot();
    setLive('on');
    return true;
  } catch (e) {
    setLive('off');
    return false;
  }
}
async function push(mutate) {
  if (writing) return false;
  writing = true;
  try {
    const r = await fetch(API, { cache: 'no-store' });
    let server = [];
    if (r.ok) { const d = await r.json(); server = sanitize(d.reports); }
    // merge server + local, then apply the mutation
    const map = new Map(server.map(x => [x.id, x]));
    for (const loc of reports) {
      const s = map.get(loc.id);
      if (!s) map.set(loc.id, loc);
      else map.set(loc.id, { ...s, ...loc, yes: [...new Set([...s.yes, ...loc.yes])], no: [...new Set([...s.no, ...loc.no])] });
    }
    let next = [...map.values()];
    next = mutate(next) || next;
    next = sanitize(next).sort((a, b) => b.t - a.t).slice(0, 60);
    const w = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: next, updated: Date.now() })
    });
    if (!w.ok) throw new Error(w.status);
    reports = next;
    cacheWrite(); render(); renderFeed(); updateFoot();
    bumpFast();
    setLive('on');
    return true;
  } catch (e) {
    setLive('off');
    toast('couldn\'t reach the feed — saved locally');
    return false;
  } finally { writing = false; }
}
function bumpFast() { fastUntil = Date.now() + 45000; schedulePoll(1200); }
function schedulePoll(delay) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (!document.hidden) await pull();
    schedulePoll(Date.now() < fastUntil ? POLL_FAST : POLL_SLOW);
  }, delay);
}

/* ---------- markers ---------- */
function markerHTML(r) {
  const x = r.fx * WORLD.w, y = r.fy * WORLD.h;
  const yes = r.yes.length, no = r.no.length;
  const badge = badgeHTML(r);
  let cnt = '';
  if (yes) cnt = '<span class="cnt">' + yes + '</span>';
  else if (no) cnt = '<span class="cnt no">' + no + '</span>';
  return '<div class="marker" data-id="' + r.id + '" style="left:' + x + 'px;top:' + y + 'px" ' +
    'role="button" aria-label="' + title(r) + '">' + badge + cnt +
    '<span class="ttl">' + title(r) + ' · ' + age(r.t) + '</span></div>';
}
function render() { if (WORLD.w) markersEl.innerHTML = reports.map(markerHTML).join(''); }
function updateFoot() {
  const near = cross ? reports.filter(r => Math.hypot(r.fx - cross.x / WORLD.w, r.fy - cross.y / WORLD.h) < 0.12).length : 0;
  $('#footL').textContent = 'Firwood, Maine · ' + reports.length + ' live report' + (reports.length === 1 ? '' : 's') +
    (near ? ' · ' + near + ' near your crosshair' : '');
  $('#feedN').textContent = reports.length;
}

/* ---------- feed panel ---------- */
function renderFeed() {
  const list = $('#feedList');
  if (!reports.length) {
    list.innerHTML = '<div class="fEmpty">nothing reported yet.<br>be the first — hit the red button.</div>';
    return;
  }
  list.innerHTML = reports.map(r => {
    const yesOn = username && r.yes.includes(username);
    const noOn = username && r.no.includes(username);
    return '<div class="fItem" data-id="' + r.id + '">' + badgeHTML(r, 32) +
      '<div class="fMeta"><b>' + title(r) + '</b><small>' + r.by + ' · ' + age(r.t) + '</small></div>' +
      '<div class="fVotes">' +
      '<button class="vBtn yes' + (yesOn ? ' on' : '') + '" data-v="yes" title="accept"><svg><use href="#ic-check"/></svg>' + r.yes.length + '</button>' +
      '<button class="vBtn no' + (noOn ? ' on' : '') + '" data-v="no" title="not there"><svg><use href="#ic-no"/></svg>' + r.no.length + '</button>' +
      '</div></div>';
  }).join('');
}
$('#feedBtn').onclick = () => {
  const f = $('#feed');
  f.hidden = !f.hidden;
  if (!f.hidden) renderFeed();
};
$('#feedX').onclick = () => { $('#feed').hidden = true; };
$('#feedList').addEventListener('click', e => {
  const b = e.target.closest('.vBtn'); if (!b) return;
  vote(b.closest('.fItem').dataset.id, b.dataset.v);
});
async function vote(id, side) {
  if (!username) { openNameModal(); return; }
  const r = reports.find(x => x.id === id); if (!r) return;
  const other = side === 'yes' ? 'no' : 'yes';
  const had = r[side].includes(username);
  // optimistic
  r[side] = had ? r[side].filter(n => n !== username) : [...r[side], username];
  r[other] = r[other].filter(n => n !== username);
  render(); renderFeed();
  if (popupId === id) openPopup(id);
  const ok = await push(() => {});
  if (ok && !had) toast(side === 'yes' ? 'accepted — ' + r.by + ' sees your check' : 'marked as not there');
}

/* ---------- popup ---------- */
function openPopup(id) {
  const r = reports.find(x => x.id === id); if (!r) return;
  popupId = id; popupWorld = { x: r.fx * WORLD.w, y: r.fy * WORLD.h };
  const yesOn = username && r.yes.includes(username);
  const noOn = username && r.no.includes(username);
  const mine = r.by === username;
  popup.innerHTML =
    '<div class="pHead">' + badgeHTML(r, 38) + '<div><b>' + title(r) + '</b><small>' + r.by + ' · ' + age(r.t) + '</small></div></div>' +
    '<div class="pMeta">' +
    (r.yes.length || r.no.length
      ? '✓ ' + r.yes.length + ' accept' + (r.yes.length === 1 ? 's' : '') + ' · ✗ ' + r.no.length + ' say' + (r.no.length === 1 ? 's' : '') + ' no'
      : 'no one has checked this yet') + '</div>' +
    '<div class="pActs">' +
    '<button class="yes' + (yesOn ? ' on' : '') + '" data-v="yes"><svg><use href="#ic-check"/></svg>Accept ' + (r.yes.length || '') + '</button>' +
    '<button class="no' + (noOn ? ' on' : '') + '" data-v="no"><svg><use href="#ic-no"/></svg>Not ' + (r.no.length || '') + '</button>' +
    (mine ? '<button class="danger" data-act="remove">delete</button>' : '') +
    '</div>';
  popup.hidden = false;
  positionPopup();
}
function positionPopup() {
  const s = screenOf(popupWorld), r = wrap.getBoundingClientRect();
  popup.style.left = clamp(s.x, 150, r.width - 150) + 'px';
  popup.style.top = Math.max(s.y, 160) + 'px';
}
function closePopup() { popup.hidden = true; popupId = null; popupWorld = null; }
popup.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !popupId) return;
  if (b.dataset.v) { vote(popupId, b.dataset.v); return; }
  if (b.dataset.act === 'remove') {
    const id = popupId;
    push(list => list.filter(x => x.id !== id));
    closePopup();
    toast('report deleted');
  }
});

/* ---------- crosshair + modes ---------- */
function setCross(w, animate) {
  cross = { x: clamp(w.x, 0, WORLD.w), y: clamp(w.y, 0, WORLD.h) };
  crossEl.hidden = false;
  crossEl.style.left = cross.x + 'px';
  crossEl.style.top = cross.y + 'px';
  if (animate) {
    crossEl.classList.remove('bump'); void crossEl.offsetWidth; crossEl.classList.add('bump');
  }
  $('#posTxt').textContent = coords(cross);
  $('#posTxt2').textContent = coords(cross);
  updateFoot();
}
function toIdle() {
  mode = 'idle';
  confirmBar.hidden = true; banner.hidden = true;
  document.body.classList.remove('pinning', 'confirming', 'sheetopen');
  sheet.classList.remove('open');
  fab.querySelector('.bang').hidden = false; fab.querySelector('.xIco').hidden = true;
}
function startPinning() {
  mode = 'pinning'; banner.hidden = false;
  document.body.classList.add('pinning');
  fab.querySelector('.bang').hidden = true; fab.querySelector('.xIco').hidden = false;
}
function handleMapClick(cx, cy) {
  closePopup();
  if (mode === 'reporting') return;
  setCross(toWorld(cx, cy), true);       // crosshair moves ONLY here
  mode = 'confirming';
  document.body.classList.add('confirming');
  confirmBar.hidden = false;
  banner.hidden = true;
}

/* ---------- sheet ---------- */
function openSheet() {
  mode = 'reporting';
  document.body.classList.remove('confirming', 'pinning');
  document.body.classList.add('sheetopen');
  confirmBar.hidden = true; banner.hidden = true;
  fab.querySelector('.bang').hidden = false; fab.querySelector('.xIco').hidden = true;
  setTab(tab);
  sheet.classList.add('open');
}
function setTab(t) {
  tab = t;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.pane').forEach(p => p.hidden = p.dataset.pane !== t);
}
function markSel(el) {
  $$('.opt.sel').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
  sendBtn.disabled = false;
}
$$('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$$('.opt').forEach(b => b.onclick = () => {
  sel = { type: b.dataset.type, brand: b.dataset.brand };
  markSel(b);
});
sendBtn.onclick = async () => {
  if (!sel || !cross) return;
  if (!username) { openNameModal(); return; }
  sendBtn.disabled = true;
  const r = {
    id: uid(),
    fx: cross.x / WORLD.w, fy: cross.y / WORLD.h,
    type: sel.type, brand: sel.brand,
    by: username, t: Date.now(),
    yes: [], no: []
  };
  reports = [r, ...reports];
  const ok = await push(() => {});
  const el = markersEl.querySelector('[data-id="' + r.id + '"]');
  if (el) el.classList.add('pop');
  closeSheet(); toIdle();
  toast(ok ? title(r) + ' is live — everyone sees it' : title(r) + ' queued for when you\'re back online');
  sel = null;
  $$('.opt.sel').forEach(x => x.classList.remove('sel'));
  sendBtn.disabled = true;
};
function closeSheet() { sheet.classList.remove('open'); }
$('#sClose').onclick = () => { closeSheet(); toIdle(); };

/* ---------- chrome events ---------- */
fab.onclick = () => {
  if (mode === 'idle') startPinning();
  else { closeSheet(); toIdle(); }
};
$('#bannerX').onclick = () => toIdle();
$('#cCancel').onclick = () => toIdle();
$('#cOk').onclick = () => openSheet();
$('#zin').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, view.s * 1.45);
$('#zout').onclick = () => zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, view.s / 1.45);

markersEl.addEventListener('click', e => {
  const m = e.target.closest('.marker'); if (!m) return;
  openPopup(m.dataset.id);
});
// double-tap an icon → open it (accept / decline / counts) and don't zoom the map
markersEl.addEventListener('dblclick', e => {
  const m = e.target.closest('.marker'); if (!m) return;
  e.stopPropagation();
  openPopup(m.dataset.id);
  const p = popup.querySelector('.pActs');
  if (p) p.classList.add('flash');
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
    : '<div class="none">no places found</div>';
  results.hidden = false;
}
q.addEventListener('focus', showResults);
q.addEventListener('input', showResults);
q.addEventListener('blur', () => setTimeout(() => { results.hidden = true; }, 150));
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const b = results.querySelector('button'); if (b) b.click(); }
  if (e.key === 'Escape') { q.blur(); results.hidden = true; }
});
results.addEventListener('mousedown', e => e.preventDefault());
results.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  flyTo(parseFloat(b.dataset.fx), parseFloat(b.dataset.fy));
  q.value = ''; results.hidden = true;
});

/* ---------- keyboard ---------- */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#nameModal').hidden) return;
    if (sheet.classList.contains('open')) { closeSheet(); toIdle(); }
    else if (!$('#feed').hidden) $('#feed').hidden = true;
    else if (!popup.hidden) closePopup();
    else if (mode !== 'idle') toIdle();
  }
  if (e.key === '+' || e.key === '=') $('#zin').click();
  if (e.key === '-') $('#zout').click();
});

/* ---------- misc ---------- */
window.addEventListener('resize', () => { if (WORLD.w) { fitView(); apply(); } });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { pull(); schedulePoll(1500); }
});
setInterval(() => { if (popupId) openPopup(popupId); if (!$('#feed').hidden) renderFeed(); }, 45000);

/* ---------- boot ---------- */
try { username = localStorage.getItem(LS.cur); } catch (e) {}
if (username) showUserChip(); else openNameModal();

cacheRead();                       // show last-known reports instantly
img.addEventListener('load', onImgOk);
img.addEventListener('error', onImgErr);
if (img.complete) { if (img.naturalWidth) onImgOk(); else onImgErr(); }

pull().then(() => schedulePoll(POLL_SLOW));
})();
