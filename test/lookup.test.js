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

/* Faux MusicBrainz : `vinyl: false` simule un album qui n'existe qu'en CD. */
function fakeFetch(log, { vinyl = true } = {}) {
  return async (url) => {
    log.push(url);
    const u = new URL(url);
    const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (u.pathname.endsWith('/release')) {
      const q = u.searchParams.get('query');
      if (!/Harbor Lights/i.test(q)) return reply({ releases: [] });
      const wantsVinyl = /format:"Vinyl"/.test(q);
      return reply({
        releases: search.releases.filter((r) => {
          const isVinyl = /Vinyl/.test(r.media[0].format);
          return wantsVinyl ? vinyl && isVinyl : vinyl || !isVinyl;
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

test('disque inconnu', async () => {
  const d = await lookupRelease({ title: 'Introuvable', artist: '' }, { fetchImpl: fakeFetch([]), interval: 0 });
  assert.deepEqual(d, { found: false });
});
