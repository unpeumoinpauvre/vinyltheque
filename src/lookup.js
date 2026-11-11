/* Recherche d'un disque dans MusicBrainz.

   Deux choses comptent ici :

   - les faces. MusicBrainz range les pistes par support (« medium » = un disque),
     pas par face. La face est dans le numéro de piste des pressages vinyle :
     « A1 », « A2 », « B1 »… C'est ce numéro qu'on lit. Compter par support
     donnerait « A1 … A10 » pour un 33 tours entier, sans jamais de face B.

   - l'édition. Un album a souvent dix éditions (CD, réédition, import) dont les
     listes diffèrent. On renvoie les meilleures candidates, vinyles d'abord ; le
     navigateur garde celle qui correspond à ce qu'il a lu sur la photo. */

import net from 'node:net';

/* Node essaie les adresses IPv4 et IPv6 d'un site tour à tour et n'accorde que
   250 ms à chaque essai. MusicBrainz est hébergé en Europe : depuis un serveur
   lointain la connexion met plus longtemps à s'ouvrir, et la recherche échouait
   avant même d'avoir commencé (« fetch failed », ETIMEDOUT). */
net.setDefaultAutoSelectFamilyAttemptTimeout?.(3000);

/* Adresse de l'API : celle de MusicBrainz, ou celle d'un miroir (MUSICBRAINZ_URL). */
const MB = (process.env.MUSICBRAINZ_URL || 'https://musicbrainz.org/ws/2').replace(/\/+$/, '');
const HEADERS = {
  'User-Agent': 'Vinyltheque/1.1 ( https://www.vinyltheque.com )',
  Accept: 'application/json'
};

const fold = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/œ/g, 'oe').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/* 1 = identique, 0,75 = l'un contient l'autre, sinon part de mots communs. */
export function similarity(a, b) {
  const x = fold(a), y = fold(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.75;
  const wx = new Set(x.split(' ')), wy = new Set(y.split(' '));
  let common = 0;
  for (const w of wx) if (wy.has(w)) common++;
  return 0.6 * common / Math.max(wx.size, wy.size);
}

const isVinyl = (r) => (r.media ?? []).some((m) => /vinyl|shellac|acetate|flexi/i.test(m.format ?? ''));

/* Classe les résultats d'une recherche : bon titre, bon artiste, vinyle, officiel. */
export function rankReleases(releases, { title, artist }) {
  return (releases ?? [])
    .map((r) => {
      const t = similarity(r.title, title);
      const credit = (r['artist-credit'] ?? []).map((a) => a.name ?? a.artist?.name ?? '').join(' ');
      const a = artist ? similarity(credit, artist) : 0.5;
      let score = 50 * t + 30 * a;
      if (isVinyl(r)) score += 18;
      if ((r.media ?? []).some((m) => /12"/.test(m.format ?? ''))) score += 4;
      if (r.status === 'Official') score += 5;
      if (r.status === 'Bootleg' || r.status === 'Pseudo-Release') score -= 12;
      score += Math.min(5, (r.score ?? 0) / 20);
      return { r, t, a, score };
    })
    .filter((c) => c.t >= 0.5 && (!artist || c.a >= 0.3))
    .sort((x, y) => y.score - x.score)
    .map((c) => c.r);
}

/* Pistes d'une édition, avec leur face quand le pressage la donne.
   « A1 », « A-1 », « a2 », « B » (une seule piste sur la face), « AA1 »… */
export function tracksFromRelease(release) {
  const media = release?.media ?? [];
  const out = [];
  const perSide = {};
  let lettered = 0, total = 0;

  media.forEach((medium) => {
    (medium.tracks ?? []).forEach((t) => {
      const title = String(t.title ?? t.recording?.title ?? '').trim();
      if (!title) return;
      total++;
      const m = String(t.number ?? '').trim().toUpperCase().match(/^([A-Z])[A-Z]?\s?[-.]?\s?(\d{1,2})?$/);
      if (m) {
        lettered++;
        const letter = m[1];
        const n = m[2] ? Number(m[2]) : (perSide[letter] ?? 0) + 1;
        perSide[letter] = n;
        out.push({ side: `${letter}${n}`, title });
      } else out.push({ side: '', title });
    });
  });

  /* Pas de faces (CD, numérique, ou vinyle saisi « 1, 2, 3 ») : numérotation
     continue, sans lettre. Mieux vaut pas de face qu'une face inventée. */
  const hasSides = total > 0 && lettered === total;
  if (!hasSides) out.forEach((t, i) => { t.side = String(i + 1); });
  return { tracks: out.slice(0, 60), hasSides };
}

function summarize(detail, fallback = {}) {
  const { tracks, hasSides } = tracksFromRelease(detail);
  const credit = (detail['artist-credit'] ?? [])
    .map((a) => (a.name ?? a.artist?.name ?? '') + (a.joinphrase ?? '')).join('').trim();
  return {
    mbid: detail.id,
    title: detail.title ?? fallback.title ?? '',
    artist: credit || fallback.artist || '',
    year: String(detail.date ?? detail['release-group']?.['first-release-date'] ?? '').slice(0, 4),
    label: (detail['label-info'] ?? []).map((l) => l.label?.name).filter(Boolean)[0] ?? '',
    format: (detail.media ?? []).map((m) => m.format).filter(Boolean)[0] ?? '',
    country: detail.country ?? '',
    hasSides,
    tracks
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lucene = (s) => String(s).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();

/* Dans la recherche de MusicBrainz, « format » se compare en entier : un 33 tours
   y est « 12" Vinyl », et format:"Vinyl" tout court ne le trouve pas. */
const VINYL = '(' + ['12" Vinyl', '7" Vinyl', '10" Vinyl', 'Vinyl']
  .map((f) => `format:"${f.replace(/"/g, '\\"')}"`).join(' OR ') + ')';

/* MusicBrainz demande au plus une requête par seconde et par adresse, et répond
   503 au-delà. Toutes les requêtes du serveur passent donc par cette file, quel
   que soit le nombre de visiteurs qui cherchent en même temps. */
let nextSlot = 0;
async function slot(interval) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + interval;
  if (wait) await sleep(wait);
}

/* MusicBrainz répond aussi 503 quand il est chargé, même à un visiteur sage :
   on patiente et on redemande, deux fois au plus. Une connexion qui échoue a
   droit aux mêmes essais ; une réponse qui n'arrive pas en 9 s, non. */
async function getJson(url, fetchImpl, interval, pause) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(pause * attempt);
    await slot(interval);
    try {
      const r = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(9000) });
      if (r.ok) return await r.json();
      failure = new Error(`MusicBrainz ${r.status}`);
      if (r.status !== 503 && r.status !== 429) break;
    } catch (e) {
      failure = e;
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') break;
    }
  }
  throw failure;
}

/* Mémoire courte : le même disque est souvent demandé deux fois de suite
   (lecture auto, puis bouton « Compléter »). Épargne aussi MusicBrainz. */
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;

/**
 * Cherche un disque. Renvoie { found: false } ou
 * { found: true, ...meilleure, candidates: [jusqu'à 3 éditions, la meilleure d'abord] }.
 * Deux à quatre requêtes vers MusicBrainz, espacées d'une seconde (davantage
 * s'il faut en redemander une).
 */
export async function lookupRelease({ title, artist = '' }, { fetchImpl = fetch, interval = 1050, pause = 1200 } = {}) {
  const key = fold(title) + '|' + fold(artist);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const base = [`release:"${lucene(title)}"`, artist ? `artist:"${lucene(artist)}"` : ''].filter(Boolean);
  const search = async (extra) => {
    const q = [...base, ...extra].join(' AND ');
    const data = await getJson(`${MB}/release?query=${encodeURIComponent(q)}&fmt=json&limit=12`, fetchImpl, interval, pause);
    return data.releases ?? [];
  };

  /* Les pressages vinyle d'abord ; à défaut seulement, n'importe quelle édition. */
  let found = rankReleases(await search([VINYL]), { title, artist });
  if (!found.length) found = rankReleases(await search([]), { title, artist });
  if (!found.length) return remember(key, { found: false });

  /* On ouvre les éditions une à une, jusqu'à en tenir une avec ses faces et,
     si possible, une seconde pour comparer. Trois ouvertures au plus. */
  const candidates = [];
  for (const r of found.slice(0, 3)) {
    let detail;
    try {
      detail = await getJson(`${MB}/release/${r.id}?inc=recordings+artist-credits+labels+release-groups&fmt=json`, fetchImpl, interval, pause);
    } catch { continue; }
    const c = summarize(detail, { title: r.title, artist });
    if (!c.tracks.length) continue;
    candidates.push(c);
    if (candidates.filter((x) => x.hasSides).length >= 2) break;
  }
  if (!candidates.length) return remember(key, { found: false });

  candidates.sort((a, b) => Number(b.hasSides) - Number(a.hasSides));
  return remember(key, { found: true, ...candidates[0], candidates });
}

function remember(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return value;
}
