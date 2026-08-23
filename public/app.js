/* Vinylthèque — front-end */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { me: null, vinyls: [], filter: '', publicUser: null };

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur réseau');
  return data;
}

/* -------------------------------------------------- recadrage automatique */

async function toCanvas(file, max = 1600) {
  // imageOrientation : on applique la rotation EXIF maintenant, sinon la photo
  // se retrouverait couchée une fois les métadonnées retirées.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return cv;
}

/* La pochette est la zone texturée de la photo ; le fond (table, mur, drap)
   est lisse. On mesure l'énergie des contours ligne par ligne et colonne par
   colonne, et on garde la plage centrale où cette énergie est forte. */
function coverBox(cv) {
  const S = 520;
  const sc = Math.min(1, S / Math.max(cv.width, cv.height));
  const w = Math.max(60, Math.round(cv.width * sc));
  const h = Math.max(60, Math.round(cv.height * sc));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++)
    g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  const rows = new Float32Array(h), cols = new Float32Array(w);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const m = Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + w] - g[p - w]);
      rows[y] += m; cols[x] += m;
    }
  }

  const span = (arr, n) => {
    const k = Math.max(1, Math.round(n * 0.01));
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { sum += arr[j]; cnt++; }
      sm[i] = sum / cnt;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) if (sm[i] > peak) peak = sm[i];
    const th = peak * 0.20;
    let a = 0, b = n - 1;
    while (a < n - 1 && sm[a] < th) a++;
    while (b > a && sm[b] < th) b--;
    return [a, b];
  };

  const [y0, y1] = span(rows, h), [x0, x1] = span(cols, w);
  const k = 1 / sc;
  return { x0: x0 * k, y0: y0 * k, x1: (x1 + 1) * k, y1: (y1 + 1) * k };
}

/* Ré-encode la photo via un canvas : le JPEG produit ne contient aucune
   métadonnée (EXIF/GPS/appareil/date, IPTC, XMP, vignette). */
async function reencode(file, max = 1600) {
  const cv = await toCanvas(file, max);
  return await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
}

/* Renvoie un JPEG recadré, ou null si la détection n'est pas fiable
   (on préfère garder la photo entière plutôt que couper la pochette). */
async function cropCover(file) {
  try {
    const cv = await toCanvas(file, 1600);
    const W = cv.width, H = cv.height;
    let { x0, y0, x1, y1 } = coverBox(cv);
    let bw = x1 - x0, bh = y1 - y0;

    if (bw < W * 0.35 || bh < H * 0.35) return null;          // détection trop petite
    if (bw > W * 0.96 && bh > H * 0.96) return null;          // rien à retirer

    const m = Math.min(W, H) * 0.008;                          // petite marge
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(W, x1 + m); y1 = Math.min(H, y1 + m);
    bw = x1 - x0; bh = y1 - y0;

    let sx = x0, sy = y0, sw = bw, sh = bh;
    const ratio = bw / bh;
    if (ratio > 0.8 && ratio < 1.25) {                         // pochette carrée : on égalise
      const side = Math.min(Math.max(bw, bh), W, H);
      const cx = Math.min(Math.max((x0 + x1) / 2, side / 2), W - side / 2);
      const cy = Math.min(Math.max((y0 + y1) / 2, side / 2), H - side / 2);
      sx = cx - side / 2; sy = cy - side / 2; sw = sh = side;
    }

    const scale = Math.min(1, 1400 / Math.max(sw, sh));
    const out = document.createElement('canvas');
    out.width = Math.round(sw * scale); out.height = Math.round(sh * scale);
    out.getContext('2d').drawImage(cv, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
      0, 0, out.width, out.height);
    return await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
  } catch { return null; }
}

/* ------------------------------------------------------------ OCR photo */

const NOISE_RE = /^(stereo|mono|\d{2,3}\s?(rpm|t\/min)|all rights|tous droits|made in|printed|manufactur|distribut|executive produc|recorded at|enregistr|master(ed|ing) (by|at)|mix(ed|ing) (by|at)|remaster|artwork|design by|photograph|publish|licen|under exclusive|marketing by|total time|dur[ée]e totale|℗|©|\(p\)\s|\(c\)\s|www\.|http|[0-9]{8,})/i;

const SIDE_RE   = /^(?:face|side|c[oô]t[ée])\s*[:.\-]?\s*([A-D1-4])\b/i;
const LABEL_RE  = /\b(records?|recordings?|music|musik|entertainment|editions?|productions?)\b/i;
const SEQ = 'ABCDEFGH';

function stripEdges(t) {
  return t.replace(/^[^0-9A-Za-zÀ-ÿ(«"]+/, '').replace(/[\s.,;:'"«»\-–_\[\]{}|]+$/, '').trim();
}

/* Rejette le bruit d'OCR sans être trop gourmand : on ne compte comme
   « fragment » que les morceaux d'une seule lettre ou chiffre, pas la
   ponctuation (&, -, /) qui est normale dans un titre. */
function looksLikeTitle(t, raw = t) {
  if (NOISE_RE.test(raw)) return false;                 // mention légale avant nettoyage
  if (LABEL_RE.test(t) && /\b(19|20)\d{2}\b/.test(t)) return false;  // « ℗ 2013 X Records »
  if (t.length < 3 || t.length > 110) return false;
  const letters = (t.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  if (letters < 3 || letters / t.length < 0.5) return false;
  const words = t.split(/\s+/).filter((w) => /[a-zA-ZÀ-ÿ0-9]/.test(w));
  const tiny = words.filter((w) => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').length <= 1).length;
  if (words.length >= 4 && tiny / words.length > 0.4) return false;
  if (/^[IVX]+$/i.test(t)) return false;
  return !NOISE_RE.test(t);
}

function parseTracks(lines, minConf = 50) {
  const out = [];
  const counts = {};
  const used = new Set();
  let side = '';

  /* Une pochette double réutilise « SIDE A / SIDE B » sur le second
     disque : on décale alors vers la lettre libre suivante (A B puis C D). */
  const takeSide = (letter) => {
    let i = SEQ.indexOf(letter);
    if (i < 0) return letter;
    while (i < SEQ.length && used.has(SEQ[i])) i++;
    const L = SEQ[i] || letter;
    used.add(L);
    return L;
  };

  for (const raw of lines) {
    if ((raw.conf ?? 100) < minConf) continue;
    const rawLine = String(raw.text).replace(/[|_•·¤~^“”]/g, ' ').replace(/\s+/g, ' ').trim();
    let line = stripEdges(rawLine);
    if (!line) continue;

    const sh = line.match(SIDE_RE);
    if (sh) { side = takeSide(sh[1].toUpperCase()); continue; }
    if (/^[A-D]$/.test(line)) { side = takeSide(line); continue; }

    let num = '';
    const m = line.match(/^([A-D]?\s?\d{1,2})\s*[.\)\-–:]\s+(.*)$/);
    if (m) { num = m[1].replace(/\s/g, '').toUpperCase(); line = m[2]; }

    line = stripEdges(line
      .replace(/\(?\b\d{1,2}[:.'’]\d{2}\b\)?\s*$/, '')   // durée en fin de ligne
    );

    if (!looksLikeTitle(line, rawLine)) continue;
    if (out.some((o) => o.title.toLowerCase() === line.toLowerCase())) continue;

    const key = side || '_';
    counts[key] = (counts[key] || 0) + 1;
    out.push({
      side: /^[A-D]\d/.test(num) ? num
        : side ? side + (num.replace(/\D/g, '') || counts[key])
        : num,
      title: line
    });
  }
  return out.slice(0, 60);
}

/* Titre de l'album = le texte le plus grand de la pochette recto. */
function guessTitle(lines) {
  const cands = lines
    .map((l) => ({ ...l, text: stripEdges(String(l.text).replace(/\s+/g, ' ')) }))
    .filter((l) => (l.conf ?? 0) >= 45 && l.text.length >= 2 && l.text.length <= 60
      && /[a-zA-ZÀ-ÿ]{2}/.test(l.text) && !NOISE_RE.test(l.text))
    .sort((a, b) => (b.h || 0) - (a.h || 0));
  return cands[0]?.text || '';
}

const guessYear = (lines) => (lines.map((l) => l.text).join(' ').match(/\b(19|20)\d{2}\b/) || [''])[0];

function guessLabel(lines) {
  const hit = lines.find((l) => (l.conf ?? 0) >= 55 && LABEL_RE.test(l.text) && l.text.length <= 45);
  if (!hit) return '';
  return stripEdges(String(hit.text).replace(/\s+/g, ' ')
    .replace(/^(?:[℗©]|\((?:p|c)\)|\s)+/i, '')      // « ℗ », « (P) »
    .replace(/^(?:19|20)\d{2}\s*/, '')              // année en tête
    .replace(/\s*(?:19|20)\d{2}$/, ''));            // année en fin
}

/* Met la photo en niveaux de gris, étire le contraste, agrandit,
   et inverse si le texte est clair sur fond sombre (Tesseract lit
   beaucoup mieux du texte foncé sur fond clair). */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 2400 / Math.max(bmp.width, bmp.height)));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; sum += g;
  }
  const px = d.length / 4, mean = sum / px;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > px * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > px * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo), dark = mean < 120;

  for (let i = 0; i < d.length; i += 4) {
    let g = ((d[i] - lo) / span) * 255;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    if (dark) g = 255 - g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

async function ocrLines(file, onProgress) {
  const source = await prepare(file);
  const worker = await Tesseract.createWorker(['fra', 'eng'], 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress(Math.round(m.progress * 100))
  });
  try {
    await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(source, {}, { text: true, blocks: true });
    const lines = [];
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) =>
      lines.push({
        text: l.text,
        conf: l.confidence ?? 100,
        h: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0
      }))));
    if (!lines.length) (data.text || '').split('\n').forEach((t) => lines.push({ text: t, conf: 100, h: 0 }));
    return lines;
  } finally { await worker.terminate(); }
}

/* ------------------------------------------------------------- rendu UI */

function renderNav() {
  const p = location.pathname;
  const items = state.me
    ? [['/collection', 'Ma collection'], ['/recherche', 'Recherche'], ['/statistiques', 'Statistiques']]
    : [['/', 'Accueil']];
  $('#mainnav').innerHTML = items
    .map(([href, label]) => `<a href="${href}" class="${p === href ? 'on' : ''}">${label}</a>`).join('');
  $$('#mainnav a').forEach((a) => a.onclick = (e) => { e.preventDefault(); go(a.getAttribute('href')); });
}

function renderUserbox() {
  const box = $('#userbox');
  if (state.me) {
    box.innerHTML = `<span>${esc(state.me.username)}</span>
      <button class="btn ghost" id="btn-logout">Déconnexion</button>`;
    $('#btn-logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; };
  } else {
    box.innerHTML = `<button class="btn gold" id="nav-login">Se connecter</button>`;
    $('#nav-login').onclick = () => openAuth('login');
  }
  renderNav();
}

/* ------------------------------------------------------- page d'accueil */

async function loadRecent() {
  const box = $('#home-recent');
  if (box.dataset.done) return;
  try {
    const { vinyls } = await api('/api/recent');
    box.dataset.done = '1';
    const list = vinyls.slice(0, 6);          // six derniers albums, pas plus
    box.innerHTML = list.length
      ? list.map((v) => `<div class="rec">
          <div class="cov" style="background-image:url('/api/vinyls/${v.id}/image/front')"></div>
          <div class="m"><div class="t">${esc(v.title)}</div>
            <div class="s">${esc(v.artist) || '—'}${v.year ? ' · ' + esc(v.year) : ''}</div></div>
        </div>`).join('')
      : `<p class="none">Aucune collection publique pour l'instant — la vôtre pourrait être la première.</p>`;
  } catch { box.innerHTML = ''; }
}

function vinylCard(v) {
  const cover = v.has_front
    ? `style="background-image:url('/api/vinyls/${v.id}/image/front')"`
    : '';
  return `<article class="vinyl" data-id="${v.id}">
    <div class="cover" ${cover}>${v.has_front ? '' : '♪'}</div>
    <div class="meta">
      <div class="t">${esc(v.title)}</div>
      <div class="a">${esc(v.artist) || '—'}</div>
      <div class="y">${[v.year, v.label].filter(Boolean).map(esc).join(' · ')}${
        v.tracks?.length ? ` · ${v.tracks.length} titres` : ''}</div>
    </div>
  </article>`;
}

function renderGrid() {
  const f = state.filter.toLowerCase();
  const list = state.vinyls.filter((v) => !f ||
    [v.title, v.artist, v.label, v.year, ...(v.tracks || []).map((t) => t.title)]
      .join(' ').toLowerCase().includes(f));
  $('#grid').innerHTML = list.map(vinylCard).join('');
  $('#empty').classList.toggle('hidden', list.length > 0);
  $$('#grid .vinyl').forEach((el) =>
    el.onclick = () => showDetail(state.vinyls.find((v) => v.id === +el.dataset.id)));
}

/* ------------------------------------------------------- modale & fiche */

const modal = $('#modal');
const openModal = (html) => { $('#modal-body').innerHTML = html; modal.classList.remove('hidden'); };
const closeModal = () => modal.classList.add('hidden');
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

function showDetail(v) {
  if (!v) return;
  const own = state.me && !state.publicUser;
  openModal(`
    <h2 style="margin:0 4px 2px 0">${esc(v.title)}</h2>
    <div class="chips">
      ${v.artist ? `<span>${esc(v.artist)}</span>` : ''}
      ${v.year ? `<span>${esc(v.year)}</span>` : ''}
      ${v.label ? `<span>${esc(v.label)}</span>` : ''}
    </div>
    <div class="detail-photos">
      ${v.has_front ? `<img src="/api/vinyls/${v.id}/image/front" alt="Recto">` : ''}
      ${v.has_back ? `<img src="/api/vinyls/${v.id}/image/back" alt="Verso">` : ''}
    </div>
    ${v.notes ? `<p class="hint">${esc(v.notes)}</p>` : ''}
    <h3 style="margin:16px 0 0;font-size:15px">Titres</h3>
    ${v.tracks?.length
      ? `<ul class="tracklist">${v.tracks.map((t) =>
          `<li><span class="side">${esc(t.side || '')}</span>${esc(t.title)}</li>`).join('')}</ul>`
      : `<p class="hint">Aucun titre enregistré.</p>`}
    ${own ? `<div class="actions">
      <button class="btn" id="d-edit">Modifier</button>
      <button class="btn danger" id="d-del">Supprimer</button>
    </div>` : ''}
  `);
  if (own) {
    $('#d-edit').onclick = () => showForm(v);
    $('#d-del').onclick = async () => {
      if (!confirm(`Supprimer « ${v.title} » ?`)) return;
      await api(`/api/vinyls/${v.id}`, { method: 'DELETE' });
      closeModal(); await loadMine();
    };
  }
}

/* ----------------------------------------------------- formulaire vinyle */

/* Complète les champs depuis MusicBrainz.
   onlyEmpty : ne touche pas à ce qui est déjà renseigné.
   keepTracks : garde la liste lue sur la photo si elle est déjà fournie. */
async function completeOnline(form, { onlyEmpty = true, keepTracks = false } = {}) {
  const q = new URLSearchParams({ title: form.title.value, artist: form.artist.value });
  const d = await api('/api/lookup?' + q);
  if (!d.found) return [];
  const filled = [];
  const set = (field, value, label) => {
    if (!value) return;
    if (onlyEmpty && form[field].value.trim()) return;
    form[field].value = value;
    filled.push(label);
  };
  set('artist', d.artist, 'artiste');
  set('year', d.year, 'année');
  set('label', d.label, 'label');
  const current = form.tracks.value.split('\n').filter((l) => l.trim()).length;
  if (d.tracks?.length && (!keepTracks || current < d.tracks.length - 2)) {
    form.tracks.value = d.tracks.map((x) => `${x.side}. ${x.title}`).join('\n');
    filled.push(`${d.tracks.length} titres (en ligne)`);
  }
  return filled;
}

function showForm(v = null) {
  const t = (v?.tracks || []).map((x) => `${x.side ? x.side + '. ' : ''}${x.title}`).join('\n');
  openModal(`
    <h2 style="margin:0 0 14px">${v ? 'Modifier le vinyle' : 'Ajouter un vinyle'}</h2>
    <form id="f-vinyl" class="stack">
      <div class="row">
        <label>Nom du vinyle *<input name="title" required value="${esc(v?.title)}"></label>
        <label>Artiste<input name="artist" value="${esc(v?.artist)}"></label>
      </div>
      <div class="row">
        <label>Année<input name="year" inputmode="numeric" value="${esc(v?.year)}"></label>
        <label>Label<input name="label" value="${esc(v?.label)}"></label>
      </div>
      <div class="photos">
        <div class="photo-slot">
          <img id="pv-front" ${v?.has_front ? `src="/api/vinyls/${v.id}/image/front"` : 'hidden'} alt="">
          Recto (pochette)
          <input type="file" name="front" accept="image/*" capture="environment">
        </div>
        <div class="photo-slot">
          <img id="pv-back" ${v?.has_back ? `src="/api/vinyls/${v.id}/image/back"` : 'hidden'} alt="">
          Verso (liste des titres)
          <input type="file" name="back" accept="image/*" capture="environment">
        </div>
      </div>
      <label class="inline"><input type="checkbox" id="autocrop" checked> Recadrer automatiquement sur la pochette</label>
      <div class="actions" style="margin:0">
        <button type="button" class="btn primary" id="btn-ocr">Remplir automatiquement</button>
        <button type="button" class="btn" id="btn-online">Compléter depuis MusicBrainz</button>
      </div>
      <p class="hint" id="auto-status">Lit les deux photos (titres, nom, année, label) puis complète ce qui manque via MusicBrainz.</p>
      <label>Titres <small>(un par ligne — « A1. Titre » ou juste le titre)</small>
        <textarea name="tracks">${esc(t)}</textarea></label>
      <label>Notes<textarea name="notes" style="min-height:60px">${esc(v?.notes)}</textarea></label>
      <p class="error" id="f-error"></p>
      <div class="actions">
        <button class="btn primary" type="submit">${v ? 'Enregistrer' : 'Ajouter à ma collection'}</button>
        <button class="btn ghost" type="button" data-close>Annuler</button>
      </div>
    </form>`);

  const form = $('#f-vinyl');
  const status = $('#auto-status');
  const shots = { front: null, back: null };   // ce qui sera réellement envoyé

  async function handlePhoto(kind) {
    const file = form[kind].files?.[0];
    const img = $(kind === 'front' ? '#pv-front' : '#pv-back');
    if (!file) { shots[kind] = null; return; }
    status.textContent = 'Préparation de la photo…';
    let blob = $('#autocrop').checked ? await cropCover(file) : null;
    const cropped = !!blob;
    if (!blob) blob = await reencode(file);   // même sans recadrage : métadonnées retirées
    status.textContent = (cropped
      ? 'Photo recadrée sur la pochette'
      : 'Contour non détecté : photo gardée entière')
      + ' — métadonnées (lieu, appareil, date) supprimées.';
    shots[kind] = blob;
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
  }

  form.front.onchange = () => handlePhoto('front');
  form.back.onchange  = () => handlePhoto('back');
  $('#autocrop').onchange = async () => { await handlePhoto('front'); await handlePhoto('back'); };

  $('#btn-ocr').onclick = async (e) => {
    const back  = shots.back  || form.back.files?.[0];
    const front = shots.front || form.front.files?.[0];
    if (!back && !front) { status.textContent = "Ajoutez d'abord au moins une photo."; return; }
    e.target.disabled = true;
    const done = [];
    try {
      /* 1. verso → liste des titres */
      let backLines = [];
      if (back || front) {
        const src = back || front;
        status.textContent = 'Lecture de la liste des titres… 0 %';
        backLines = await ocrLines(src, (p) => status.textContent = `Lecture de la liste des titres… ${p} %`);
        let tracks = parseTracks(backLines, 50);
        if (tracks.length < 4) tracks = parseTracks(backLines, 25);
        if (tracks.length) {
          form.tracks.value = tracks.map((x) => `${x.side ? x.side + '. ' : ''}${x.title}`).join('\n');
          done.push(`${tracks.length} titres`);
        }
      }

      /* 2. recto → nom de l'album, si le champ est vide */
      let frontLines = [];
      if (front && back && !form.title.value.trim()) {
        status.textContent = 'Lecture de la pochette… 0 %';
        frontLines = await ocrLines(front, (p) => status.textContent = `Lecture de la pochette… ${p} %`);
        const t = guessTitle(frontLines);
        if (t) { form.title.value = t; done.push('nom'); }
      }

      /* 3. année et label repérés sur les photos */
      const all = backLines.concat(frontLines);
      if (!form.year.value.trim()) {
        const y = guessYear(all);
        if (y) { form.year.value = y; done.push('année'); }
      }
      if (!form.label.value.trim()) {
        const l = guessLabel(all);
        if (l) { form.label.value = l; done.push('label'); }
      }

      /* 4. MusicBrainz complète ce qui manque encore */
      if (form.title.value.trim()) {
        status.textContent = 'Recherche en ligne pour compléter…';
        const filled = await completeOnline(form, { onlyEmpty: true, keepTracks: true });
        if (filled.length) done.push(...filled);
      }

      status.innerHTML = done.length
        ? `<span class="ok">Rempli : ${done.join(', ')}.</span> Vérifiez et corrigez avant d'enregistrer.`
        : "Rien de lisible sur ces photos. Renseignez le nom du vinyle et utilisez « Compléter depuis MusicBrainz ».";
    } catch (err) {
      status.textContent = 'Échec de la lecture : ' + err.message;
    } finally { e.target.disabled = false; }
  };

  $('#btn-online').onclick = async (e) => {
    if (!form.title.value.trim()) { status.textContent = "Renseignez d'abord le nom du vinyle."; return; }
    e.target.disabled = true;
    status.textContent = 'Recherche en ligne…';
    try {
      const filled = await completeOnline(form, { onlyEmpty: false, keepTracks: false });
      status.innerHTML = filled.length
        ? `<span class="ok">Trouvé en ligne — rempli : ${filled.join(', ')}.</span>`
        : "Album introuvable en ligne — utilise la lecture des photos.";
    } catch (err) { status.textContent = 'Recherche indisponible : ' + err.message; }
    finally { e.target.disabled = false; }
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const fd = new FormData(form);
    const tracks = fd.get('tracks').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^([A-D]?\d{1,2})\s*[.\)\-–:]\s*(.+)$/);
      return m ? { side: m[1].toUpperCase(), title: m[2] } : { side: '', title: l };
    });
    fd.set('tracks', JSON.stringify(tracks));
    for (const kind of ['front', 'back']) {
      fd.delete(kind);
      if (shots[kind]?.size) fd.set(kind, shots[kind], kind + '.jpg');
    }
    try {
      await api(v ? `/api/vinyls/${v.id}` : '/api/vinyls',
        { method: v ? 'PUT' : 'POST', body: fd });
      closeModal(); await loadMine();
    } catch (err) { $('#f-error').textContent = err.message; btn.disabled = false; }
  };
}

/* ------------------------------------------------------------ recherche */

const norm = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function highlight(text, q) {
  const t = String(text ?? '');
  const i = norm(t).indexOf(norm(q));
  if (!q || i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
}

function thumb(v) {
  return v.has_front
    ? `<div class="thumb" style="background-image:url('/api/vinyls/${v.id}/image/front')"></div>`
    : `<div class="thumb">♪</div>`;
}

function searchCollection(q) {
  const n = norm(q);
  const albums = state.vinyls.filter((v) =>
    [v.title, v.artist, v.label, v.year].some((f) => norm(f).includes(n)));
  const tracks = [];
  for (const v of state.vinyls)
    for (const t of v.tracks || [])
      if (norm(t.title).includes(n)) tracks.push({ v, t });
  return { albums, tracks };
}

function renderSearch() {
  const q = $('#q').value.trim();
  const box = $('#search-results');
  if (q.length < 2) {
    box.innerHTML = `<p class="res-empty">${state.vinyls.length} disque(s) dans votre collection. Tapez au moins 2 lettres.</p>`;
    return;
  }
  const { albums, tracks } = searchCollection(q);
  if (!albums.length && !tracks.length) {
    box.innerHTML = `<p class="res-empty">Rien trouvé pour « ${esc(q)} » — vous ne l'avez pas encore.</p>`;
    return;
  }
  let html = '';
  if (albums.length) {
    html += `<div class="res-group"><h3>Albums (${albums.length})</h3>` + albums.map((v) => `
      <div class="res" data-id="${v.id}">${thumb(v)}
        <div class="txt">
          <div class="l1">${highlight(v.title, q)}</div>
          <div class="l2">${highlight(v.artist || '—', q)}${
            [v.year, v.label].filter(Boolean).length ? ' · ' + [v.year, v.label].filter(Boolean).map(esc).join(' · ') : ''}</div>
        </div>
      </div>`).join('') + `</div>`;
  }
  if (tracks.length) {
    html += `<div class="res-group"><h3>Morceaux (${tracks.length})</h3>` + tracks.map(({ v, t }) => `
      <div class="res" data-id="${v.id}">${thumb(v)}
        <div class="txt">
          <div class="l1">${highlight(t.title, q)}</div>
          <div class="l2">sur <strong>${esc(v.title)}</strong>${v.artist ? ' — ' + esc(v.artist) : ''}${
            t.side ? ' · face ' + esc(t.side) : ''}</div>
        </div>
      </div>`).join('') + `</div>`;
  }
  box.innerHTML = html;
  $$('#search-results .res').forEach((el) =>
    el.onclick = () => showDetail(state.vinyls.find((v) => v.id === +el.dataset.id)));
}

/* --------------------------------------------------------- statistiques */

function barList(rows, key) {
  if (!rows.length) return '<p class="hint">Pas encore de donnée.</p>';
  const max = Math.max(...rows.map((r) => r.n));
  return rows.map((r) => `<div class="bar">
    <b>${esc(r[key] || '—')}</b><i style="width:${Math.round((r.n / max) * 100)}%"></i><em>${r.n}</em>
  </div>`).join('');
}

async function loadStats() {
  const box = $('#stats-body');
  box.innerHTML = '<p class="hint">Calcul…</p>';
  const d = await api('/api/stats');
  const moyenne = d.total.disques ? (d.total.titres / d.total.disques).toFixed(1) : '0';
  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${d.total.disques}</b><span>disques</span></div>
      <div class="kpi"><b>${d.total.titres}</b><span>titres enregistrés</span></div>
      <div class="kpi"><b>${moyenne}</b><span>titres par disque</span></div>
      <div class="kpi"><b>${d.artistes.length ? d.artistes[0].n : 0}</b>
        <span>disques du plus représenté${d.artistes.length ? ' : ' + esc(d.artistes[0].artist) : ''}</span></div>
    </div>
    <div class="statgrid">
      <div class="statbox"><h3>Par décennie</h3>${barList(d.decennies, 'decennie')}</div>
      <div class="statbox"><h3>Artistes les plus présents</h3>${barList(d.artistes, 'artist')}</div>
      <div class="statbox"><h3>Labels les plus présents</h3>${barList(d.labels, 'label')}</div>
    </div>`;
}

/* ----------------------------------------------------------- navigation */

async function openAuth(tab) {
  await go('/login');
  const t = $$('.tab').find((x) => x.dataset.tab === tab);
  if (t) t.click();
}

function show(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(view).classList.remove('hidden');
  document.body.classList.toggle('home', view === '#view-home');
}

function renderVerifyBanner() {
  const line = $('#verify-line');
  if (!state.me || state.me.email_verified) { line.classList.add('hidden'); return; }
  line.classList.remove('hidden');
  line.innerHTML = `Adresse e-mail non confirmée — sans elle, impossible de récupérer votre mot de passe.
    <button class="linky" id="resend">Renvoyer l'e-mail</button>`;
  $('#resend').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Envoi…';
    try {
      await api('/api/verify/resend', { method: 'POST' });
      line.innerHTML = 'E-mail envoyé. Regardez votre boîte de réception (et les indésirables).';
    } catch (err) { line.innerHTML = 'Envoi impossible : ' + esc(err.message); }
  };
}

async function loadMine() {
  const d = await api('/api/vinyls');
  state.vinyls = d.vinyls; state.publicUser = null;
  $('#collection-title').textContent = 'Ma collection';
  const url = `${location.origin}/u/${state.me.username}`;
  $('#share-line').classList.remove('hidden');
  $('#share-line').innerHTML = `Page publique : <code>${esc(url)}</code>
     <button class="btn ghost" id="copy">Copier le lien</button>
     <label style="flex-direction:row;align-items:center;gap:6px;color:inherit">
       <input type="checkbox" id="vis" ${state.me.is_public ? 'checked' : ''} style="width:auto"> visible publiquement
     </label>`;
  $('#copy').onclick = () => navigator.clipboard.writeText(url).then(() => $('#copy').textContent = 'Copié !');
  $('#vis').onchange = async (e) => {
    const r = await api('/api/me/visibility', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: e.target.checked })
    });
    state.me.is_public = r.is_public;
  };
  renderVerifyBanner();
  renderGrid();
}

async function loadPublic(username) {
  const d = await api('/api/u/' + encodeURIComponent(username));
  state.vinyls = d.vinyls; state.publicUser = d.owner.username;
  $('#collection-title').textContent = `Collection de ${d.owner.username}`;
  $('#share-line').classList.add('hidden');
  $('#btn-add').classList.add('hidden');
  renderGrid();
}

async function route() {
  const p = location.pathname;
  renderNav();
  const m = p.match(/^\/u\/([^/]+)$/);
  if (m) {
    show('#view-collection');
    try { await loadPublic(decodeURIComponent(m[1])); }
    catch (e) { $('#grid').innerHTML = ''; $('#empty').textContent = e.message; $('#empty').classList.remove('hidden'); }
    return;
  }
  if (p === '/verifier') {
    const token = new URLSearchParams(location.search).get('token');
    try {
      const d = await api('/api/verify?token=' + encodeURIComponent(token || ''));
      state.me = d.user; renderUserbox();
      await go('/collection');
      flash('Adresse confirmée, merci !');
    } catch (e) {
      show('#view-auth');
      $('#auth-error').textContent = e.message;
    }
    return;
  }
  if (p === '/motdepasse') { show('#view-reset'); return; }

  if (!state.me) {
    if (p === '/login') { show('#view-auth'); return; }
    show('#view-home'); loadRecent(); return;
  }
  if (p === '/statistiques') {
    show('#view-stats');
    try { await loadStats(); } catch (e) { $('#stats-body').innerHTML = esc(e.message); }
    return;
  }
  if (p === '/recherche') {
    if (!state.vinyls.length || state.publicUser) await loadMine();
    show('#view-search');
    renderSearch();
    $('#q').focus();
    return;
  }
  show('#view-collection');
  $('#btn-add').classList.remove('hidden');
  await loadMine();
}

function flash(msg) {
  const line = $('#verify-line');
  line.classList.remove('hidden');
  line.style.color = 'var(--ok)';
  line.textContent = msg;
  setTimeout(() => { line.style.color = ''; renderVerifyBanner(); }, 6000);
}

async function go(path) { history.pushState({}, '', path); await route(); }
window.addEventListener('popstate', route);

/* ------------------------------------------------------------ démarrage */

$$('.tab').forEach((t) => t.onclick = () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#form-login').classList.toggle('hidden', t.dataset.tab !== 'login');
  $('#form-register').classList.toggle('hidden', t.dataset.tab !== 'register');
  $('#auth-error').textContent = '';
});

for (const [id, url] of [['#form-login', '/api/login'], ['#form-register', '/api/register']]) {
  $(id).onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      state.me = d.user; renderUserbox(); go('/collection');
    } catch (err) { $('#auth-error').textContent = err.message; }
  };
}

$$('[data-go]').forEach((b) => b.onclick = () => openAuth(b.dataset.go));
$$('[data-scroll]').forEach((b) => b.onclick = () =>
  $(b.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

$('#home-search').onsubmit = async (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (!state.me) {
    await openAuth('register');
    $('#auth-error').innerHTML = q
      ? `<span class="ok">Créez votre compte, puis « ${esc(q)} » sera cherché dans votre collection.</span>`
      : '<span class="ok">Créez votre compte pour commencer votre collection.</span>';
    return;
  }
  await go('/recherche');
  $('#q').value = q;
  renderSearch();
};
$('#btn-add').onclick = () => showForm();
$('#show-forgot').onclick = () => {
  $('#form-login').classList.add('hidden');
  $('#form-forgot').classList.remove('hidden');
  $('#auth-error').textContent = '';
};
$('#back-login').onclick = () => {
  $('#form-forgot').classList.add('hidden');
  $('#form-login').classList.remove('hidden');
  $('#auth-error').textContent = '';
};
$('#form-forgot').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await api('/api/forgot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e.target.email.value })
    });
    $('#auth-error').innerHTML = '<span class="ok">Si un compte existe avec cette adresse, ' +
      'le lien vient de partir. Il est valable une heure.</span>';
  } catch (err) { $('#auth-error').textContent = err.message; }
  finally { btn.disabled = false; }
};

$('#form-reset').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const d = await api('/api/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: new URLSearchParams(location.search).get('token'),
        password: e.target.password.value
      })
    });
    state.me = d.user; renderUserbox(); go('/collection');
  } catch (err) { $('#reset-msg').textContent = err.message; btn.disabled = false; }
};

$('#search').oninput = (e) => { state.filter = e.target.value; renderGrid(); };
$('#q').oninput = renderSearch;
$('.brand').onclick = (e) => { e.preventDefault(); go('/'); };

(async () => {
  try { state.me = (await api('/api/me')).user; } catch {}
  renderUserbox();
  route();
})();
