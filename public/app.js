/* Vinylthèque — front-end */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { me: null, vinyls: [], filter: '', billing: null, ai: false };

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur réseau');
    err.status = res.status; err.code = data.code;
    throw err;
  }
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

/* Zone de la pochette dans la photo, ou null si la détection n'est pas fiable
   (on préfère garder la photo entière plutôt que couper la pochette). */
async function cropBox(file) {
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
    return { cv, sx, sy, sw, sh, frac: { x: sx / W, y: sy / H, w: sw / W, h: sh / H } };
  } catch { return null; }
}

/* Renvoie { blob, frac } : le JPEG recadré à envoyer et la zone gardée, en
   fractions de la photo d'origine. null si aucun recadrage n'est possible. */
async function cropCover(file) {
  const b = await cropBox(file);
  if (!b) return null;
  const scale = Math.min(1, 1400 / Math.max(b.sw, b.sh));
  const out = document.createElement('canvas');
  out.width = Math.round(b.sw * scale); out.height = Math.round(b.sh * scale);
  out.getContext('2d').drawImage(b.cv, Math.round(b.sx), Math.round(b.sy), Math.round(b.sw), Math.round(b.sh),
    0, 0, out.width, out.height);
  const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
  return blob ? { blob, frac: b.frac } : null;
}

/* La lecture des pochettes (OCR, colonnes, faces) vit dans reader.js. */

/* ------------------------------------------------------------- rendu UI */

function renderNav() {
  const p = location.pathname;
  const items = state.me
    ? [['/collection', 'Ma collection'], ['/recherche', 'Recherche'],
       ['/statistiques', 'Statistiques'], ['/abonnement', 'Abonnement']]
    : [['/', 'Accueil'], ['/guides', 'Guides'], ['/tarifs', 'Tarifs']];
  $('#mainnav').innerHTML = items
    .map(([href, label]) => `<a href="${href}" class="${p === href ? 'on' : ''}">${label}</a>`).join('');
  /* Les guides sont écrits par le serveur : on laisse le navigateur charger la
     page au lieu de la router côté client, sinon leur texte n'existerait pas. */
  $$('#mainnav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('/guides')) return;   // page écrite par le serveur
    a.onclick = (e) => { e.preventDefault(); go(href); };
  });
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

/* Les vignettes ne portent aucun lien ni aucun nom : on voit ce qui vient
   d'être ajouté au site, jamais à qui cela appartient. */
async function loadRecent() {
  const box = $('#home-recent');
  if (!box || box.dataset.done) return;
  try {
    const { vinyls } = await api('/api/recent');
    box.dataset.done = '1';
    const list = vinyls.slice(0, 6);          // six derniers albums, pas plus
    box.innerHTML = list.length
      ? list.map((v) => `<div class="rec">
          <div class="cov" style="background-image:url('/api/recent/${v.id}/cover')"></div>
          <div class="m"><div class="t">${esc(v.title)}</div>
            <div class="s">${esc(v.artist) || '—'}${v.year ? ' · ' + esc(v.year) : ''}</div></div>
        </div>`).join('')
      : `<p class="none">Aucun disque pour l'instant — le vôtre pourrait être le premier.</p>`;
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

/* Liste des titres, face par face : « Face A » puis ses pistes numérotées,
   « Face B »… Sans face connue, une simple liste numérotée. */
function tracksHtml(tracks) {
  const groups = Reader.groupBySide(tracks);
  const sided = groups.some((g) => g.letter);
  const block = (g) => `<section class="side-block">
      ${g.letter ? `<h4>Face ${esc(g.letter)}</h4>` : ''}
      <ol class="tracklist">${g.tracks.map((t) =>
        `<li><span class="n">${t.n}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>
    </section>`;
  return `<div class="sides${sided ? '' : ' flat'}">${groups.map(block).join('')}</div>`;
}

function showDetail(v) {
  if (!v) return;
  const own = Boolean(state.me);
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
    ${v.tracks?.length ? tracksHtml(v.tracks) : `<p class="hint">Aucun titre enregistré.</p>`}
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

/* Remplit artiste, année, label depuis une édition trouvée en ligne.
   onlyEmpty : ne touche pas à ce qui est déjà renseigné. */
function fillMeta(form, c, onlyEmpty) {
  const filled = [];
  const set = (field, value, label) => {
    if (!value) return;
    if (onlyEmpty && form[field].value.trim()) return;
    form[field].value = value;
    filled.push(label);
  };
  set('artist', c.artist, 'artiste');
  set('year', c.year, 'année');
  set('label', c.label, 'label');
  return filled;
}

async function lookupOnline(form) {
  const q = new URLSearchParams({ title: form.title.value.trim(), artist: form.artist.value.trim() });
  const d = await api('/api/lookup?' + q);
  if (!d.found) return [];
  return d.candidates?.length ? d.candidates : [d];
}

function showForm(v = null) {
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
          Recto (pochette)<br><small>Photo ou galerie</small>
          <input type="file" name="front" accept="image/*">
        </div>
        <div class="photo-slot">
          <img id="pv-back" ${v?.has_back ? `src="/api/vinyls/${v.id}/image/back"` : 'hidden'} alt="">
          Verso (liste des titres)<br><small>Photo ou galerie</small>
          <input type="file" name="back" accept="image/*">
        </div>
      </div>
      <label class="inline"><input type="checkbox" id="autocrop" checked> Recadrer automatiquement sur la pochette</label>
      <div class="actions" style="margin:0">
        <button type="button" class="btn primary" id="btn-ocr">Remplir automatiquement</button>
        <button type="button" class="btn" id="btn-online">Compléter depuis MusicBrainz</button>
      </div>
      <p class="hint" id="auto-status">${state.ai
        ? 'Ajoutez le recto et le verso : le nom, l\'artiste, l\'année, le label et les titres face par face se remplissent tout seuls.'
        : 'Lit le verso (titres, face A / face B), puis vérifie la liste avec MusicBrainz quand le disque y figure.'}</p>
      <label>Titres <small>(un par ligne : « A1. Titre », « B2. Titre »… ou une ligne « Face B » avant les titres de la face)</small>
        <textarea name="tracks">${esc(Reader.toText(v?.tracks || []))}</textarea></label>
      <div id="tracks-preview" class="preview"></div>
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
  const crops = { front: null, back: null };   // zone de la pochette dans la photo d'origine
  /* Champs corrigés à la main dans ce formulaire : la lecture automatique n'y touche plus. */
  const typed = new Set();
  for (const f of ['title', 'artist', 'year', 'label']) form[f].addEventListener('input', () => typed.add(f));
  let autoRead = false;                        // la lecture s'est déjà lancée d'elle-même

  /* Aperçu face par face de ce qui sera enregistré, mis à jour à la frappe. */
  const preview = () => {
    const list = Reader.fromText(form.tracks.value);
    $('#tracks-preview').innerHTML = list.length ? tracksHtml(list) : '';
  };
  const setTracks = (list) => { form.tracks.value = Reader.toText(list); preview(); };
  form.tracks.oninput = preview;
  preview();

  async function handlePhoto(kind) {
    const file = form[kind].files?.[0];
    const img = $(kind === 'front' ? '#pv-front' : '#pv-back');
    if (!file) { shots[kind] = null; crops[kind] = null; return; }
    status.textContent = 'Préparation de la photo…';
    const crop = $('#autocrop').checked ? await cropCover(file) : null;
    const blob = crop ? crop.blob : await reencode(file);   // même sans recadrage : métadonnées retirées
    status.textContent = (crop
      ? 'Photo recadrée sur la pochette'
      : 'Contour non détecté : photo gardée entière')
      + ' — métadonnées (lieu, appareil, date) supprimées.';
    shots[kind] = blob;
    crops[kind] = crop ? crop.frac : null;
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
    /* Les deux photos d'un nouveau disque sont là : la lecture part toute seule. */
    if (state.ai && !v && !autoRead && form.front.files?.[0] && form.back.files?.[0]) {
      autoRead = true;
      $('#btn-ocr').click();
    }
  }

  /* Lecture par l'IA : les deux photos partent au serveur, qui rend la fiche
     remplie. Photo entière (sans recadrage : rien ne doit manquer), 2000 px. */
  async function readWithAi() {
    const fd = new FormData();
    for (const kind of ['front', 'back']) {
      const file = form[kind].files?.[0];
      if (file) fd.set(kind, await reencode(file, 2000), kind + '.jpg');
    }
    if (v) fd.set('id', v.id);
    const d = await api('/api/read', { method: 'POST', body: fd });

    const done = [];
    const put = (field, value, label) => {
      if (!value || typed.has(field)) return;
      form[field].value = value;
      done.push(label);
    };
    put('title', d.title, 'nom'); put('artist', d.artist, 'artiste');
    put('year', d.year, 'année'); put('label', d.label, 'label');
    if (d.tracks?.length) {
      setTracks(d.tracks);
      const faces = new Set(d.tracks.map((t) => Reader.splitSide(t.side).letter).filter(Boolean)).size;
      const how = d.how === 'base' ? 'repris de MusicBrainz (liste absente des photos)'
        : 'lus sur la pochette' + (d.how === 'photo+faces' ? ', faces reprises de MusicBrainz' : '')
          + (d.confirmed ? ', confirmés par MusicBrainz' : '');
      done.push(`${d.tracks.length} titres ${how}${faces ? ` (${faces} face${faces > 1 ? 's' : ''})` : ''}`);
    }
    if (!done.length) {
      status.textContent = "Rien de lisible sur ces photos : reprenez-les bien à plat, sans reflet, ou saisissez le nom du vinyle.";
      return;
    }
    status.innerHTML = `<span class="ok">Rempli : ${done.map(esc).join(', ')}.</span> Vérifiez avant d'enregistrer.`
      + (d.tracks?.length && !d.hasSides ? " La pochette n'indique pas les faces : ajoutez une ligne « Face B » avant le premier titre de la face B." : '')
      + (d.tracks?.length ? '' : " La liste des titres n'est pas sur ces photos.");
  }

  form.front.onchange = () => handlePhoto('front');
  form.back.onchange  = () => handlePhoto('back');
  $('#autocrop').onchange = async () => { await handlePhoto('front'); await handlePhoto('back'); };

  /* Photo à lire : celle qu'on vient de choisir, dans sa définition d'origine
     (les petits caractères en dépendent) ; à défaut, celle déjà enregistrée sur
     la fiche, pour pouvoir relancer la lecture d'un disque déjà saisi. */
  async function source(kind) {
    const file = form[kind].files?.[0];
    if (file) return { file, crop: crops[kind] };
    if (v?.[kind === 'front' ? 'has_front' : 'has_back']) {
      const r = await fetch(`/api/vinyls/${v.id}/image/${kind}`, { credentials: 'same-origin' });
      if (r.ok) return { file: await r.blob(), crop: null };
    }
    return null;
  }

  $('#btn-ocr').onclick = async (e) => {
    if (e.target.disabled) return;
    e.target.disabled = true;
    const done = [];
    try {
      if (state.ai) {
        const any = ['front', 'back'].some((k) => form[k].files?.[0] || v?.[k === 'front' ? 'has_front' : 'has_back']);
        if (!any) { status.textContent = "Ajoutez d'abord au moins une photo."; return; }
        status.textContent = 'Lecture des photos… (une dizaine de secondes)';
        try { await readWithAi(); return; }
        catch (err) {
          /* IA indisponible ou plafond atteint : la lecture intégrée prend le relais. */
          console.warn('Lecture IA :', err.message);
          status.textContent = (err.code === 'quota' ? err.message : 'Lecture rapide indisponible.') + ' Lecture intégrée en cours…';
        }
      }
      const back = await source('back'), front = await source('front');
      if (!back && !front) { status.textContent = "Ajoutez d'abord au moins une photo."; return; }

      /* 1. verso → liste des titres, face par face */
      const src = back || front;
      const progress = (label) => (p) => { status.textContent = `${label}… ${p} %`; };
      status.textContent = 'Lecture de la liste des titres… 0 %';
      let page = await Reader.ocr(src.file, { crop: src.crop, flatten: true, onProgress: progress('Lecture de la liste des titres') });
      const best = (pg) => {
        const a = Reader.readTracks(pg);
        if (a.length >= 4) return a;
        const b = Reader.readTracks(pg, { minConf: 25 });       // photo floue : on accepte le douteux
        return b.length > a.length ? b : a;
      };
      let read = best(page);
      if (read.length < 3) {
        /* Rien de net : seconde lecture avec un simple réglage de contraste, qui
           réussit mieux sur certaines pochettes très illustrées. */
        const page2 = await Reader.ocr(src.file, { crop: src.crop, flatten: false, onProgress: progress('Seconde lecture') });
        const read2 = best(page2);
        if (read2.length > read.length) { read = read2; page = page2; }
      }

      /* 2. recto → nom de l'album, si le champ est vide */
      let frontPage = null;
      if (front && back && !form.title.value.trim()) {
        status.textContent = 'Lecture de la pochette… 0 %';
        frontPage = await Reader.ocr(front.file, { crop: front.crop, onProgress: progress('Lecture de la pochette') });
        const t = Reader.guessTitle(frontPage);
        if (t) { form.title.value = t; done.push('nom'); }
      }

      /* 3. MusicBrainz. La liste en ligne est plus propre que la lecture d'une
            photo, mais ce n'est pas forcément la même édition : on ne la prend que
            si ses titres se retrouvent sur la pochette. Sinon la lecture reste. */
      let tracks = read, how = read.length ? 'lus sur la photo' : '';
      if (form.title.value.trim()) {
        status.textContent = 'Vérification en ligne…';
        let cands = [];
        try { cands = await lookupOnline(form); } catch { /* hors ligne : la lecture suffit */ }
        const m = Reader.bestMatch(cands, page);
        if (m) {
          const c = m.candidate;
          if (m.overlap >= 0.5 || read.length < 3) {
            tracks = c.hasSides ? c.tracks : Reader.borrowSides(c.tracks, read);
            how = m.overlap >= 0.5 ? 'vérifiés avec MusicBrainz' : 'trouvés en ligne — photo peu lisible, à vérifier';
          }
          if (m.overlap >= 0.3 || read.length < 3) done.push(...fillMeta(form, c, true));
        }
      }
      /* 4. année et label encore vides : ceux repérés sur les photos */
      const pages = [page, frontPage].filter(Boolean);
      if (!form.year.value.trim()) {
        const y = pages.map(Reader.guessYear).find(Boolean);
        if (y) { form.year.value = y; done.push('année'); }
      }
      if (!form.label.value.trim()) {
        const l = pages.map(Reader.guessLabel).find(Boolean);
        if (l) { form.label.value = l; done.push('label'); }
      }

      if (tracks.length) {
        setTracks(tracks);
        const faces = new Set(tracks.map((t) => Reader.splitSide(t.side).letter).filter(Boolean)).size;
        done.unshift(`${tracks.length} titres ${how}${faces ? ` (${faces} face${faces > 1 ? 's' : ''})` : ''}`);
      }

      status.innerHTML = done.length
        ? `<span class="ok">Rempli : ${done.map(esc).join(', ')}.</span> Vérifiez et corrigez avant d'enregistrer.`
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
      const cands = await lookupOnline(form);
      if (!cands.length) { status.textContent = "Album introuvable en ligne — utilisez la lecture des photos."; return; }
      const c = cands[0];
      const filled = fillMeta(form, c, false);
      /* Édition sans faces (CD) : on garde celles déjà présentes dans le champ. */
      const list = c.hasSides ? c.tracks : Reader.borrowSides(c.tracks, Reader.fromText(form.tracks.value));
      setTracks(list);
      filled.push(`${list.length} titres`);
      status.innerHTML = `<span class="ok">Trouvé en ligne — rempli : ${filled.map(esc).join(', ')}.</span>`
        + (c.hasSides ? '' : " Cette édition n'indique pas les faces : ajoutez une ligne « Face B » avant le premier titre de la face B.");
    } catch (err) { status.textContent = 'Recherche indisponible : ' + err.message; }
    finally { e.target.disabled = false; }
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const fd = new FormData(form);
    fd.set('tracks', JSON.stringify(Reader.fromText(fd.get('tracks'))));
    for (const kind of ['front', 'back']) {
      fd.delete(kind);
      if (shots[kind]?.size) fd.set(kind, shots[kind], kind + '.jpg');
    }
    try {
      await api(v ? `/api/vinyls/${v.id}` : '/api/vinyls',
        { method: v ? 'PUT' : 'POST', body: fd });
      closeModal(); await loadMine();
    } catch (err) {
      const plein = /gratuite est complète/i.test(err.message);
      $('#f-error').innerHTML = esc(err.message)
        + (plein ? ' <button type="button" class="linky" id="go-pro">Voir les offres</button>' : '');
      const g = $('#go-pro');
      if (g) g.onclick = () => { closeModal(); go('/tarifs'); };
      btn.disabled = false;
    }
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

/* ---------------------------------------------------- tarifs & abonnement */

const PLANS = [
  { id: 'free', name: 'Gratuit', price: '0 €', per: 'pour toujours',
    features: ['LIMIT vinyles', 'Titres lus sur les photos', 'Recherche par album et par morceau',
               'Statistiques', 'Collection strictement privée'] },
  { id: 'monthly', name: 'Pro mensuel', price: '5 €', unit: '/ mois', per: 'sans engagement',
    features: ['Collection <b>sans limite</b>', 'Toutes les fonctions du gratuit',
               'Résiliable en un clic'] },
  { id: 'yearly', name: 'Pro annuel', price: '50 €', unit: '/ an', per: 'soit 4,17 € par mois',
    best: 'Deux mois offerts',
    features: ['Collection <b>sans limite</b>', 'Toutes les fonctions du gratuit',
               '<b>2 mois offerts</b> par rapport au mensuel'] }
];

async function loadBilling(force) {
  if (state.billing && !force) return state.billing;
  try { state.billing = await api('/api/billing/status'); } catch { state.billing = null; }
  return state.billing;
}

function planCard(p, b) {
  const pro = b?.plan === 'pro';
  const limit = b?.limit ?? 25;
  let label, action, cls = 'btn', disabled = '';

  if (p.id === 'free') {
    label = pro ? 'Inclus' : (state.me ? 'Votre offre actuelle' : 'Créer un compte');
    action = state.me ? '' : 'register';
    if (state.me) { disabled = 'disabled'; cls = 'btn ghost'; }
  } else if (b?.vip) {
    /* Compte offert : rien à payer, et pas de portail Stripe à ouvrir. */
    label = 'Inclus';
    action = '';
    disabled = 'disabled';
    cls = 'btn ghost';
  } else if (pro) {
    label = b.interval === p.id ? 'Votre abonnement' : 'Changer pour cette offre';
    action = 'portal';
    cls = b.interval === p.id ? 'btn ghost' : 'btn';
  } else {
    label = state.me ? "S'abonner" : 'Créer un compte';
    action = state.me ? p.id : 'register';
    cls = p.best ? 'btn gold' : 'btn';
  }

  return `<article class="plan${p.best ? ' best' : ''}">
    ${p.best ? `<span class="badge">${esc(p.best)}</span>` : ''}
    <h3>${esc(p.name)}</h3>
    <div class="price">${esc(p.price)}${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</div>
    <div class="per">${esc(p.per)}</div>
    <ul>${p.features.map((f) => `<li>${f.replace('LIMIT', `Jusqu'à <b>${limit}</b>`)}</li>`).join('')}</ul>
    <button class="${cls}" data-plan="${action}" ${disabled}>${esc(label)}</button>
  </article>`;
}

async function renderPlans(sel) {
  const box = $(sel);
  if (!box) return;
  const b = await loadBilling();
  box.innerHTML = PLANS.map((p) => planCard(p, b)).join('');
  $$(`${sel} [data-plan]`).forEach((btn) => btn.onclick = () => startPlan(btn));
}

async function startPlan(btn) {
  const what = btn.dataset.plan;
  const msg = $('#pricing-msg');
  if (!what) return;
  if (what === 'register') return openAuth('register');

  btn.disabled = true;
  const before = btn.textContent;
  btn.textContent = 'Ouverture…';
  if (msg) msg.textContent = '';
  try {
    const path = what === 'portal' ? '/api/billing/portal' : '/api/billing/checkout';
    const d = await api(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: what })
    });
    location.href = d.url;                     // page de paiement hébergée par Stripe
  } catch (e) {
    if (msg) msg.textContent = e.message;
    btn.disabled = false; btn.textContent = before;
  }
}

async function showPricing(mode) {
  const b = await loadBilling(true);
  const pro = b?.plan === 'pro';
  $('#pricing-title').textContent = mode === 'abonnement' ? 'Mon abonnement' : 'Tarifs';

  const st = $('#pricing-status');
  const params = new URLSearchParams(location.search);
  let note = '';
  if (params.get('paiement') === 'ok') {
    note = '<span class="ok">Merci ! Votre abonnement est actif. '
      + "S'il n'apparaît pas encore, patientez quelques secondes puis rechargez.</span>";
  } else if (params.get('paiement') === 'annule') {
    note = 'Paiement abandonné — rien n\'a été débité.';
  } else if (b?.vip) {
    note = 'Compte offert — collection sans limite, rien à payer.';
  } else if (pro && b.renewsAt) {
    const d = new Date(b.renewsAt).toLocaleDateString('fr-FR');
    note = b.cancels
      ? `Abonnement ${b.interval === 'yearly' ? 'annuel' : 'mensuel'} — actif jusqu'au ${d}, sans renouvellement.`
      : `Abonnement ${b.interval === 'yearly' ? 'annuel' : 'mensuel'} — prochain prélèvement le ${d}.`;
  } else if (state.me && b) {
    note = `Vous avez <b>${b.count}</b> disque${b.count > 1 ? 's' : ''} sur les <b>${b.limit}</b> du compte gratuit.`;
  }
  st.innerHTML = note;
  st.classList.toggle('hidden', !note);

  if (b && !b.ready) {
    $('#pricing-msg').textContent =
      "L'abonnement n'est pas encore ouvert : les offres sont affichées à titre indicatif.";
  } else {
    $('#pricing-msg').textContent = '';
  }
  await renderPlans('#pricing-page');
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

async function renderQuota() {
  const b = await loadBilling(true);
  let el = $('#quota');
  if (!el) {
    el = document.createElement('span');
    el.id = 'quota';
    $('.toolbar').insertBefore(el, $('#btn-add'));
  }
  if (!b || b.plan === 'pro') {
    el.className = 'quota';
    el.innerHTML = b?.vip ? '<b>Compte offert</b> · sans limite' : '<b>Pro</b> · sans limite';
    return;
  }
  const reste = b.limit - b.count;
  el.className = 'quota' + (reste <= 5 ? ' full' : '');
  el.innerHTML = `<b>${b.count}/${b.limit}</b> disques`
    + (reste <= 5 ? ` · <a href="/tarifs" id="quota-link">passer en Pro</a>` : '');
  const a = $('#quota-link');
  if (a) a.onclick = (e) => { e.preventDefault(); go('/tarifs'); };
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
  state.vinyls = d.vinyls;
  $('#collection-title').textContent = 'Ma collection';
  renderVerifyBanner();
  await renderQuota();
  renderGrid();
}

async function route() {
  const p = location.pathname;
  renderNav();
  if (p === '/guides') { show('#view-guides'); return; }
  /* Guides, pages institutionnelles et 404 : le contenu est déjà écrit dans le
     HTML par le serveur, on se contente d'afficher la vue correspondante. */
  if (p.startsWith('/guides/') || $('#guide-body')?.children.length) {
    show('#view-guide');
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

  if (p === '/tarifs' || p === '/abonnement') {
    show('#view-pricing');
    await showPricing(p === '/abonnement' ? 'abonnement' : 'tarifs');
    return;
  }
  if (!state.me) {
    if (p === '/login') { show('#view-auth'); return; }
    show('#view-home'); loadRecent(); renderPlans('#pricing-home'); return;
  }
  if (p === '/statistiques') {
    show('#view-stats');
    try { await loadStats(); } catch (e) { $('#stats-body').innerHTML = esc(e.message); }
    return;
  }
  if (p === '/recherche') {
    if (!state.vinyls.length) await loadMine();
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
  try { const d = await api('/api/me'); state.me = d.user; state.ai = Boolean(d.ai); } catch {}
  renderUserbox();
  route();
})();
