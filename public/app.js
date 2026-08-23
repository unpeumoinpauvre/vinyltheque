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

const NOISE = /^(side|face|stereo|mono|all rights|tous droits|made in|printed|produced|produit|recorded|enregistr|℗|©|\(p\)|\(c\)|www\.|http)/i;

function parseTracksFromText(text) {
  const out = [];
  let side = '';
  for (let raw of String(text).split(/\r?\n/)) {
    let line = raw.replace(/[|_•·¤]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const sideHdr = line.match(/^(?:face|side|c[oô]t[ée])\s*([A-D1-4])\b/i);
    if (sideHdr) { side = sideHdr[1].toUpperCase(); continue; }
    if (/^[A-D]$/i.test(line)) { side = line.toUpperCase(); continue; }
    if (NOISE.test(line)) continue;

    let num = '';
    const m = line.match(/^([A-D]?\s?\d{1,2})\s*[.\)\-–:]?\s+(.*)$/);
    if (m) { num = m[1].replace(/\s/g, '').toUpperCase(); line = m[2]; }

    line = line
      .replace(/\(?\b\d{1,2}[:.'’]\d{2}\b\)?\s*$/, '')      // durée en fin de ligne
      .replace(/[\s.\-–_]+$/, '')
      .trim();

    if (line.length < 2 || line.length > 90) continue;
    if (!/[a-zA-ZÀ-ÿ]/.test(line)) continue;
    if (!m && out.length === 0) continue;                    // évite le bruit avant la 1re piste

    const label = /^[A-D]\d/.test(num) ? num : (side ? side + (num.replace(/\D/g, '') || out.length + 1) : num);
    out.push({ side: label, title: line });
  }
  return out.slice(0, 40);
}

async function ocrImage(file, onProgress) {
  const worker = await Tesseract.createWorker(['fra', 'eng'], 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress(Math.round(m.progress * 100))
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally { await worker.terminate(); }
}

/* ------------------------------------------------------------- rendu UI */

function renderUserbox() {
  const box = $('#userbox');
  if (state.me) {
    box.innerHTML = `<span>Connecté : <strong>${esc(state.me.username)}</strong></span>
      <a href="/collection" id="nav-mine">Ma collection</a>
      <button class="btn ghost" id="btn-logout">Déconnexion</button>`;
    $('#btn-logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; };
    $('#nav-mine').onclick = (e) => { e.preventDefault(); go('/collection'); };
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
        <button type="button" class="btn" id="btn-ocr">Lire les titres sur la photo</button>
        <button type="button" class="btn" id="btn-online">Compléter depuis MusicBrainz</button>
      </div>
      <p class="hint" id="auto-status">La lecture se fait sur la photo du verso (ou du recto si le verso est absent).</p>
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
    const file = form.back.files?.[0] || form.front.files?.[0];
    if (!file) { status.textContent = 'Choisis d\'abord une photo (de préférence le verso).'; return; }
    e.target.disabled = true;
    status.textContent = 'Lecture de la photo… 0 %';
    try {
      const text = await ocrImage(file, (p) => status.textContent = `Lecture de la photo… ${p} %`);
      const tracks = parseTracksFromText(text);
      if (tracks.length) {
        form.tracks.value = tracks.map((x) => `${x.side ? x.side + '. ' : ''}${x.title}`).join('\n');
        status.innerHTML = `<span class="ok">${tracks.length} titres détectés.</span> Vérifie et corrige si besoin.`;
      } else {
        form.tracks.value = text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
        status.textContent = 'Texte brut extrait — à nettoyer à la main.';
      }
    } catch (err) {
      status.textContent = 'Échec de la lecture : ' + err.message;
    } finally { e.target.disabled = false; }
  };

  $('#btn-online').onclick = async (e) => {
    if (!form.title.value.trim()) { status.textContent = 'Renseigne d\'abord le nom du vinyle.'; return; }
    e.target.disabled = true;
    status.textContent = 'Recherche en ligne…';
    try {
      const q = new URLSearchParams({ title: form.title.value, artist: form.artist.value });
      const d = await api('/api/lookup?' + q);
      if (!d.found) { status.textContent = 'Album introuvable en ligne — utilise la lecture de photo.'; return; }
      if (!form.artist.value) form.artist.value = d.artist || '';
      if (!form.year.value)   form.year.value   = d.year || '';
      if (!form.label.value)  form.label.value  = d.label || '';
      if (d.tracks?.length)
        form.tracks.value = d.tracks.map((x) => `${x.side}. ${x.title}`).join('\n');
      status.innerHTML = `<span class="ok">Trouvé : ${esc(d.artist)} — ${esc(d.title)} (${d.tracks.length} titres).</span>`;
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
  if (state.me) { show('#view-collection'); $('#btn-add').classList.remove('hidden'); await loadMine(); }
  else { show('#view-auth'); }
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
$('.brand').onclick = (e) => { e.preventDefault(); go('/'); };

(async () => {
  try { state.me = (await api('/api/me')).user; } catch {}
  renderUserbox();
  route();
})();
