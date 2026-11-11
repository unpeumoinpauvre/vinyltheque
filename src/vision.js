/* Lecture d'une pochette par une IA (Claude, API d'Anthropic).

   On lui montre le recto et le verso ; elle rend ce qui y est imprimé : artiste,
   titre, label, numéro de catalogue, année, et la liste des titres face par face.
   On recoupe ensuite avec MusicBrainz, qui sert à trois choses : confirmer la
   liste, donner les faces quand la pochette ne les indique pas, et fournir la
   liste quand elle n'est pas imprimée sur les photos (elle est parfois sur le
   macaron du disque seulement).

   La liste lue sur la pochette passe avant celle de la base : c'est ce disque-là
   que la personne a entre les mains, pas une autre édition. */

import sharp from 'sharp';
import { lookupRelease, similarity } from './lookup.js';

const API = () => (process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5';
const EFFORT = () => process.env.AI_EFFORT || 'medium';

export const visionReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

const PROMPT = `You read photographs of vinyl record sleeves for a record-collection app.
You receive one or two photos of the same record: the front of the sleeve, the back, or both.
Report what is printed on these photos.

- artist, title: the artist and the album title as printed. Use normal capitalisation even when the sleeve is in capitals. Keep the original language and its accents.
- label: the record company (for example "Philips", "Blue Note"). Empty string if not visible.
- catalog_number: the catalogue number as printed (for example "PCS 7088", "6325 071"). Not the barcode. Empty string if not visible.
- year: the four-digit year printed for this record (the ℗ or © line; the earliest one if there are several). Empty string if no year is printed.
- tracks: every track, in playing order, exactly as listed on the sleeve.
  - side: the side letter followed by the position on that side: "A1", "A2", "B1"… "Side One", "Side 1", "Face A", "Face 1", "Seite 1", "Lado A" all mean side A; the next side is B; double albums continue with C and D.
  - If the sleeve lists the tracks without saying where the sides change, give every track an empty side ("").
  - title: the track title only. No track number, no duration, no writer or publisher credits, no performer notes. Normal capitalisation, original language and accents.
- If the track list is not printed on these photos, return an empty tracks list. Never list tracks from memory: only what you can read here.
- If the photos do not show a record sleeve, or nothing can be read, return empty strings and an empty list.`;

const SCHEMA = {
  type: 'object',
  properties: {
    artist: { type: 'string' },
    title: { type: 'string' },
    label: { type: 'string' },
    catalog_number: { type: 'string' },
    year: { type: 'string' },
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { side: { type: 'string' }, title: { type: 'string' } },
        required: ['side', 'title'],
        additionalProperties: false
      }
    }
  },
  required: ['artist', 'title', 'label', 'catalog_number', 'year', 'tracks'],
  additionalProperties: false
};

/* Photo prête pour l'IA : redressée, 2000 px au plus (au-delà le modèle la
   réduit de toute façon), sans métadonnées. */
export async function forVision(buf) {
  const out = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return out.toString('base64');
}

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* Le texte rendu par le modèle, en objet. Sans schéma imposé, il peut être
   entouré de quelques mots ou d'une clôture de code : on prend l'accolade. */
function parseJson(text) {
  try { return JSON.parse(text); } catch { /* on cherche l'objet dans le texte */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('réponse sans JSON');
  return JSON.parse(text.slice(a, b + 1));
}

/* Faces : « A1 », « a-2 », « Side B 3 », « B »… ramenés à « A1 ». Une liste sans
   aucune face est numérotée 1, 2, 3 : mieux vaut pas de face qu'une face inventée. */
export function tidyTracks(list) {
  const rows = (Array.isArray(list) ? list : [])
    .map((t) => ({ raw: str(t?.side, 12).toUpperCase(), title: str(t?.title) }))
    .filter((t) => t.title)
    .slice(0, 60);
  const perSide = {};
  let lettered = 0;
  for (const t of rows) {
    const m = t.raw.match(/^(?:SIDE|FACE|SEITE|LADO|C[ÔO]T[ÉE])?\s*([A-H])\s*[-.]?\s*(\d{1,2})?$/);
    if (!m) { t.side = ''; continue; }
    const n = m[2] ? Number(m[2]) : (perSide[m[1]] ?? 0) + 1;
    perSide[m[1]] = n;
    t.side = m[1] + n;
    lettered++;
  }
  const hasSides = rows.length > 0 && lettered === rows.length;
  return {
    hasSides,
    tracks: rows.map((t, i) => ({ side: hasSides ? t.side : String(i + 1), title: t.title }))
  };
}

/**
 * Montre les photos au modèle. Renvoie
 * { artist, title, label, catalog, year, tracks: [{ side, title }], hasSides }.
 */
export async function readCovers({ front, back }, { fetchImpl = fetch, apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!apiKey) throw new Error('clé ANTHROPIC_API_KEY absente');
  const content = [];
  const add = (label, b64) => content.push(
    { type: 'text', text: label },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
  if (front) add('Front of the sleeve:', front);
  if (back) add('Back of the sleeve:', back);
  if (!content.length) throw new Error('aucune photo');
  content.push({ type: 'text', text: 'Read this record sleeve.' });

  const call = async (strict) => {
    const body = {
      model: MODEL(),
      max_tokens: 8000,
      system: strict ? PROMPT
        : PROMPT + '\n\nAnswer with one JSON object and nothing else, with exactly these keys: '
          + 'artist, title, label, catalog_number, year, tracks (a list of {"side", "title"}).',
      messages: [{ role: 'user', content }]
    };
    if (strict) body.output_config = { effort: EFFORT(), format: { type: 'json_schema', schema: SCHEMA } };
    const t0 = Date.now();
    const r = await fetchImpl(`${API()}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(`Anthropic ${r.status} : ${str(data?.error?.message, 300) || 'sans détail'}`);
      e.status = r.status;
      throw e;
    }
    const u = data.usage ?? {};
    console.log(`[ia] ${data.model ?? body.model} — ${u.input_tokens ?? '?'} jetons lus, ${u.output_tokens ?? '?'} écrits, ${Date.now() - t0} ms`);
    if (data.stop_reason === 'refusal') throw new Error('le modèle a refusé de lire ces photos');
    if (data.stop_reason === 'max_tokens') throw new Error('réponse du modèle interrompue');
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseJson(text);
  };

  let raw;
  try { raw = await call(true); }
  catch (e) {
    /* Requête refusée telle quelle (paramètre non reconnu par ce modèle) : on
       redemande sans format imposé, la consigne suffit à obtenir le JSON. */
    if (e.status !== 400) throw e;
    console.error('[ia] format imposé refusé, nouvel essai sans :', e.message);
    raw = await call(false);
  }

  const { tracks, hasSides } = tidyTracks(raw?.tracks);
  return {
    artist: str(raw?.artist),
    title: str(raw?.title),
    label: str(raw?.label),
    catalog: str(raw?.catalog_number, 40),
    year: (str(raw?.year, 20).match(/\b(19|20)\d{2}\b/) ?? [''])[0],
    tracks,
    hasSides
  };
}

/* ------------------------------------------------- recoupement avec la base */

/* Où se trouve ce titre dans une édition : le même d'abord, sinon un titre qui
   le contient (« Melody » ne doit pas prendre la place de « Ballade de Melody
   Nelson » quand « Melody » existe aussi). */
function find(list, title) {
  let i = list.findIndex((e) => similarity(e.title, title) === 1);
  if (i < 0) i = list.findIndex((e) => similarity(e.title, title) >= 0.75);
  return i;
}

/* Part des titres lus sur la pochette qu'on retrouve dans une édition. */
export function overlap(read, edition) {
  if (!read.length || !edition.length) return 0;
  const left = [...edition];
  let hit = 0;
  for (const t of read) {
    const i = find(left, t.title);
    if (i >= 0) { hit++; left.splice(i, 1); }
  }
  return hit / read.length;
}

/* Donne aux titres lus les faces d'une édition qui les indique. Un titre non
   retrouvé prend la face du titre de même rang, si les deux listes ont la même
   longueur ; sinon on renonce (null) plutôt que de deviner. */
export function borrowSides(read, edition) {
  const left = edition.map((e, i) => ({ ...e, i }));
  const out = read.map((t) => {
    const i = find(left, t.title);
    return i >= 0 ? { side: left.splice(i, 1)[0].side, title: t.title } : null;
  });
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    if (read.length !== edition.length) return null;
    out[i] = { side: edition[i].side, title: read[i].title };
  }
  return out;
}

/**
 * Lecture complète d'un disque : l'IA lit les photos, MusicBrainz recoupe.
 * Renvoie { title, artist, year, label, tracks, hasSides, how, confirmed }
 *   how : 'photo' (liste lue sur la pochette), 'photo+faces' (lue, faces prises
 *         dans la base), 'base' (liste absente des photos, prise dans la base),
 *         '' (aucune liste).
 */
export async function readRecord(images, { lookup = lookupRelease, ...deps } = {}) {
  const ai = await readCovers(images, deps);
  const out = {
    title: ai.title, artist: ai.artist, year: ai.year, label: ai.label,
    tracks: ai.tracks, hasSides: ai.hasSides,
    how: ai.tracks.length ? 'photo' : '', confirmed: false
  };
  if (!ai.title) return out;

  let found = null;
  try { found = await lookup({ title: ai.title, artist: ai.artist, catno: ai.catalog }); }
  catch (e) { console.error('[ia] recoupement MusicBrainz impossible :', e.message); }
  const cands = found?.found ? (found.candidates?.length ? found.candidates : [found]) : [];
  if (!cands.length) return out;

  /* L'édition la plus proche de ce qu'on a lu ; à égalité, celle de la même
     année, puis celle qui indique ses faces. */
  const scored = cands
    .map((c) => ({ c, o: overlap(ai.tracks, c.tracks), y: Boolean(ai.year && c.year === ai.year) }))
    .sort((a, b) => b.o - a.o || Number(b.y) - Number(a.y) || Number(b.c.hasSides) - Number(a.c.hasSides));
  const best = scored[0];

  if (ai.tracks.length >= 3) {
    if (best.o >= 0.6) {
      out.confirmed = true;
      if (!ai.hasSides && best.c.hasSides) {
        const withSides = borrowSides(ai.tracks, best.c.tracks);
        if (withSides) { out.tracks = withSides; out.hasSides = true; out.how = 'photo+faces'; }
      }
    }
  } else {
    /* Liste absente des photos (ou illisible) : celle de la base, en préférant
       un pressage vinyle qui donne ses faces. */
    const pick = scored.find((s) => s.c.hasSides) ?? best;
    out.tracks = pick.c.tracks; out.hasSides = pick.c.hasSides; out.how = 'base';
  }

  /* Année et label : ce qui est imprimé sur la pochette d'abord. Sinon ceux de
     la base, seulement si elle parle bien du même disque ; pour l'année, la
     plus ancienne des éditions retenues (l'année de l'album, pas d'une réédition). */
  const trusted = scored.filter((s) => (ai.tracks.length >= 3 ? s.o >= 0.6 : true)).map((s) => s.c);
  if (!out.year) out.year = trusted.map((c) => c.year).filter(Boolean).sort()[0] ?? '';
  if (!out.label) out.label = trusted.map((c) => c.label).find(Boolean) ?? '';
  if (!out.artist) out.artist = trusted.map((c) => c.artist).find(Boolean) ?? '';
  return out;
}

/* ------------------------------------------------------------------ plafonds */

/* Chaque lecture coûte quelques centimes : un plafond par compte et un plafond
   global, par jour, gardent la dépense bornée même si le site est sollicité. */
const USER_DAILY = () => Number(process.env.AI_USER_DAILY || 40);
const SITE_DAILY = () => Number(process.env.AI_DAILY_LIMIT || 300);
let day = '', counts = new Map(), total = 0;

export function takeQuota(userId, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (today !== day) { day = today; counts = new Map(); total = 0; }
  if (total >= SITE_DAILY()) return { ok: false, why: 'site' };
  const n = counts.get(userId) ?? 0;
  if (n >= USER_DAILY()) return { ok: false, why: 'compte' };
  counts.set(userId, n + 1); total++;
  return { ok: true };
}
