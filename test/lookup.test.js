/* Recherche en ligne : faces lues dans les numéros de piste, choix de l'édition. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tracksFromRelease, rankReleases, lookupRelease, similarity } from '../src/lookup.js';
import { search, releases, doubleLp } from './fixtures/musicbrainz.js';

test('un 33 tours : les faces viennent des numéros A1…B5, pas du support', () => {
  const { tracks, hasSides } = tracksFromRelease(releases['rel-lp']);
  assert.equal(hasSides, true);
  assert.deepEqual(tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5']);
  assert.equal(tracks[5].title, 'Winter Garden');
});

test('un CD : numérotation continue, aucune face inventée', () => {
  const { tracks, hasSides } = tracksFromRelease(releases['rel-cd']);
  assert.equal(hasSides, false);
  assert.deepEqual(tracks.map((t) => t.side), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
});

test('un double album : A, B sur le premier disque, C, D sur le second', () => {
  const { tracks, hasSides } = tracksFromRelease(doubleLp);
  assert.equal(hasSides, true);
  assert.deepEqual(tracks.map((t) => t.side), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1']);
});

test('classement : le bon album en vinyle avant le CD, l\'homonyme écarté', () => {
  const ranked = rankReleases(search.releases, { title: 'Harbor Lights', artist: 'The Hollow Pines' });
  assert.deepEqual(ranked.map((r) => r.id), ['rel-lp', 'rel-cd']);
  assert.ok(similarity('Harbor Lights', 'harbor  lights!') === 1);
});

/* Faux MusicBrainz. Comme le vrai, il compare « format » en entier : un 33 tours
   est « 12" Vinyl », et format:"Vinyl" seul ne le trouve pas.
   `vinyl: false` simule un album qui n'existe qu'en CD ; `busy: n` répond 503
   aux n premières demandes. */
function fakeFetch(log, { vinyl = true, busy = 0 } = {}) {
  return async (url) => {
    log.push(url);
    const u = new URL(url);
    const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (busy-- > 0) return reply({ error: 'Your requests are exceeding the allowable rate limit.' }, 503);
    if (u.pathname.endsWith('/release')) {
      const q = u.searchParams.get('query');
      if (/^catno:/.test(q)) return reply({ releases: /catno:"LKS 1042"/.test(q) ? search.releases.filter((r) => r.id === 'rel-lp') : [] });
      if (!/Harbor Lights/i.test(q)) return reply({ releases: [] });
      const formats = [...q.matchAll(/format:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
      return reply({
        releases: search.releases.filter((r) => {
          const isVinyl = /Vinyl/.test(r.media[0].format);
          if (isVinyl && !vinyl) return false;
          return !formats.length || r.media.some((m) => formats.includes(m.format));
        })
      });
    }
    const id = u.pathname.split('/').pop();
    return releases[id] ? reply(releases[id]) : reply({ error: 'Not Found' }, 404);
  };
}

test('recherche complète : le pressage vinyle, avec ses faces', async () => {
  const log = [];
  const d = await lookupRelease({ title: 'Harbor Lights', artist: 'The Hollow Pines' }, { fetchImpl: fakeFetch(log), interval: 0 });
  assert.equal(d.found, true);
  assert.equal(d.artist, 'The Hollow Pines');
  assert.equal(d.year, '1978');
  assert.equal(d.label, 'Larkspur Records');
  assert.equal(d.hasSides, true);
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5']);
  assert.deepEqual(d.candidates.map((c) => c.mbid), ['rel-lp']);
  assert.equal(log.length, 2, 'une recherche, une fiche');

  /* seconde demande identique : servie de mémoire, sans nouvelle requête */
  await lookupRelease({ title: 'harbor lights', artist: 'the hollow pines' }, { fetchImpl: fakeFetch(log), interval: 0 });
  assert.equal(log.length, 2);
});

test('album sans pressage vinyle connu : le CD, sans faces inventées', async () => {
  const d = await lookupRelease({ title: 'Harbor Lights', artist: '' }, { fetchImpl: fakeFetch([], { vinyl: false }), interval: 0 });
  assert.equal(d.found, true);
  assert.equal(d.hasSides, false);
  assert.equal(d.format, 'CD');
  assert.deepEqual(d.tracks.map((t) => t.side), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
});

test('MusicBrainz chargé (503) : on redemande au lieu d\'abandonner', async () => {
  const log = [];
  const d = await lookupRelease({ title: 'Harbor Lights', artist: 'Hollow Pines' },
    { fetchImpl: fakeFetch(log, { busy: 2 }), interval: 0, pause: 0 });
  assert.equal(d.found, true);
  assert.equal(d.hasSides, true);
  assert.equal(log.length, 4, 'deux refus, puis la recherche et la fiche');

  await assert.rejects(
    lookupRelease({ title: 'Harbor Lights', artist: 'Pines' }, { fetchImpl: fakeFetch([], { busy: 9 }), interval: 0, pause: 0 }),
    /MusicBrainz 503/);
});

test('numéro de catalogue lu sur la pochette : le pressage exact, sans autre recherche', async () => {
  const log = [];
  const d = await lookupRelease({ title: 'Harbor Lights', artist: 'The Hollow Pines', catno: 'LKS 1042' }, { fetchImpl: fakeFetch(log), interval: 0 });
  assert.equal(d.found, true);
  assert.match(new URL(log[0]).searchParams.get('query'), /^catno:"LKS 1042"$/);
  assert.equal(log.length, 2, 'la recherche par numéro, puis la fiche');
  assert.equal(d.hasSides, true);

  /* numéro inconnu de la base : on retombe sur la recherche par titre */
  const log2 = [];
  const e = await lookupRelease({ title: 'Harbor Lights', artist: 'The Hollow Pines', catno: 'ZZ 999' }, { fetchImpl: fakeFetch(log2), interval: 0 });
  assert.equal(e.found, true);
  assert.equal(log2.length, 3);
});

test('disque inconnu', async () => {
  const d = await lookupRelease({ title: 'Introuvable', artist: '' }, { fetchImpl: fakeFetch([]), interval: 0 });
  assert.deepEqual(d, { found: false });
});
