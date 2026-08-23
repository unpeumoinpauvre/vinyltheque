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

function renderUserbox() {
  const box = $('#userbox');
  if (state.me) {
    box.innerHTML = `<span>Connecté : <strong>${esc(state.me.username)}</strong></span>
      <a href="/collection" id="nav-mine">Ma collection</a>
      <a href="/recherche" id="nav-search">Recherche</a>
      <button class="btn ghost" id="btn-logout">Déconnexion</button>`;
    $('#btn-logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; };
    $('#nav-mine').onclick = (e) => { e.preventDefault(); go('/collection'); };
    $('#nav-search').onclick = (e) => { e.preventDefault(); go('/recherche'); };
  } else {
    box.innerHTML = `<a href="/login" id="nav-login">Connexion</a>`;
    $('#nav-login').onclick = (e) => { e.preventDefault(); go('/login'); };
  }
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

  form.front.onchange = (e) => preview(e.target, '#pv-front');
  form.back.onchange  = (e) => preview(e.target, '#pv-back');
  function preview(input, sel) {
    const f = input.files?.[0];
    if (f) { const img = $(sel); img.src = URL.createObjectURL(f); img.hidden = false; }
  }

  $('#btn-ocr').onclick = async (e) => {
    const back  = form.back.files?.[0];
    const front = form.front.files?.[0];
    if (!back && !front) { status.textContent = "Ajoute d'abord au moins une photo."; return; }
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
        ? `<span class="ok">Rempli : ${done.join(', ')}.</span> Vérifie et corrige avant d'enregistrer.`
        : "Rien de lisible sur ces photos. Renseigne le nom du vinyle et utilise « Compléter depuis MusicBrainz ».";
    } catch (err) {
      status.textContent = 'Échec de la lecture : ' + err.message;
    } finally { e.target.disabled = false; }
  };

  $('#btn-online').onclick = async (e) => {
    if (!form.title.value.trim()) { status.textContent = "Renseigne d'abord le nom du vinyle."; return; }
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
    if (!fd.get('front')?.size) fd.delete('front');
    if (!fd.get('back')?.size)  fd.delete('back');
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
    box.innerHTML = `<p class="res-empty">${state.vinyls.length} disque(s) dans ta collection. Tape au moins 2 lettres.</p>`;
    return;
  }
  const { albums, tracks } = searchCollection(q);
  if (!albums.length && !tracks.length) {
    box.innerHTML = `<p class="res-empty">Rien trouvé pour « ${esc(q)} » — tu ne l'as pas encore.</p>`;
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

/* ----------------------------------------------------------- navigation */

function show(view) { $$('.view').forEach((v) => v.classList.add('hidden')); $(view).classList.remove('hidden'); }

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
  const m = p.match(/^\/u\/([^/]+)$/);
  if (m) {
    show('#view-collection');
    try { await loadPublic(decodeURIComponent(m[1])); }
    catch (e) { $('#grid').innerHTML = ''; $('#empty').textContent = e.message; $('#empty').classList.remove('hidden'); }
    return;
  }
  if (!state.me) { show('#view-auth'); return; }
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

function go(path) { history.pushState({}, '', path); route(); }
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

$('#btn-add').onclick = () => showForm();
$('#search').oninput = (e) => { state.filter = e.target.value; renderGrid(); };
$('#q').oninput = renderSearch;
$('.brand').onclick = (e) => { e.preventDefault(); go('/'); };

(async () => {
  try { state.me = (await api('/api/me')).user; } catch {}
  renderUserbox();
  route();
})();
