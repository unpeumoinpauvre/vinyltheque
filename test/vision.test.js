/* Lecture par IA : ce qu'on envoie au modèle, ce qu'on fait de sa réponse, et
   le recoupement avec la base de disques. Aucun appel réseau : le modèle et
   MusicBrainz sont remplacés par des doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCovers, readRecord, tidyTracks, overlap, borrowSides, takeQuota } from '../src/vision.js';

const IMG = Buffer.from('fausse image').toString('base64');

const SLEEVE = {
  artist: 'The Hollow Pines', title: 'Harbor Lights', label: 'Larkspur Records',
  catalog_number: 'LKS 1042', year: '℗ 1978',
  tracks: [
    { side: 'A1', title: 'Harbor Lights' }, { side: 'A2', title: 'Paper Lanterns' },
    { side: 'A3', title: 'Low Tide' }, { side: 'B1', title: 'Winter Garden' },
    { side: 'B2', title: 'The Long Way Round' }
  ]
};

/* Double de l'API d'Anthropic : note les requêtes et rend `answer` comme le
   ferait le modèle (un bloc de réflexion, puis le texte JSON). */
function fakeClaude(log, answer, { status = 200, stop = 'end_turn', rejectFormat = false } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, headers: init.headers, body });
    const reply = (code, data) => ({ ok: code === 200, status: code, json: async () => data });
    if (rejectFormat && body.output_config) {
      return reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'output_config: Extra inputs are not permitted' } });
    }
    if (status !== 200) return reply(status, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const text = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return reply(200, {
      id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: stop,
      content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text }],
      usage: { input_tokens: 9000, output_tokens: 400 }
    });
  };
}

test('la requête : les deux photos, la clé, le format imposé', async () => {
  const log = [];
  const d = await readCovers({ front: IMG, back: IMG }, { fetchImpl: fakeClaude(log, SLEEVE), apiKey: 'sk-test' });
  const { url, headers, body } = log[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(headers['x-api-key'], 'sk-test');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(body.output_config.format.schema.required, ['artist', 'title', 'label', 'catalog_number', 'year', 'tracks']);
  const images = body.messages[0].content.filter((b) => b.type === 'image');
  assert.equal(images.length, 2);
  assert.deepEqual(images[0].source, { type: 'base64', media_type: 'image/jpeg', data: IMG });
  assert.equal(body.temperature, undefined, 'les modèles récents refusent temperature');

  assert.equal(d.title, 'Harbor Lights');
  assert.equal(d.catalog, 'LKS 1042');
  assert.equal(d.year, '1978', 'année extraite de « ℗ 1978 »');
  assert.equal(d.hasSides, true);
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'B1', 'B2']);
});

test('format imposé refusé (400) : second essai sans, JSON repris dans le texte', async () => {
  const log = [];
  const wrapped = 'Voici la fiche :\n```json\n' + JSON.stringify(SLEEVE) + '\n```';
  const d = await readCovers({ back: IMG }, { fetchImpl: fakeClaude(log, wrapped, { rejectFormat: true }), apiKey: 'k' });
  assert.equal(log.length, 2);
  assert.equal(log[1].body.output_config, undefined);
  assert.match(log[1].body.system, /one JSON object/);
  assert.equal(d.tracks.length, 5);
});

test('service en panne, refus, réponse coupée : une erreur, pas une fiche vide', async () => {
  await assert.rejects(readCovers({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE, { status: 529 }), apiKey: 'k' }), /Anthropic 529/);
  await assert.rejects(readCovers({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE, { stop: 'refusal' }), apiKey: 'k' }), /refusé/);
  await assert.rejects(readCovers({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE, { stop: 'max_tokens' }), apiKey: 'k' }), /interrompue/);
  await assert.rejects(readCovers({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE), apiKey: '' }), /ANTHROPIC_API_KEY/);
});

test('faces : écritures variées ramenées à A1, B2 ; liste sans faces numérotée', () => {
  const a = tidyTracks([{ side: 'a-1', title: 'Un' }, { side: 'Side A 2', title: 'Deux' }, { side: 'B', title: 'Trois' }, { side: 'b', title: 'Quatre' }]);
  assert.equal(a.hasSides, true);
  assert.deepEqual(a.tracks.map((t) => t.side), ['A1', 'A2', 'B1', 'B2']);

  const b = tidyTracks([{ side: '', title: 'Un' }, { side: '', title: 'Deux' }, { side: 'A3', title: '  ' }]);
  assert.equal(b.hasSides, false);
  assert.deepEqual(b.tracks, [{ side: '1', title: 'Un' }, { side: '2', title: 'Deux' }]);
});

const EDITION = {
  title: 'Harbor Lights', artist: 'The Hollow Pines', year: '1978', label: 'Larkspur Records', hasSides: true,
  tracks: [
    { side: 'A1', title: 'Harbor Lights' }, { side: 'A2', title: 'Paper Lanterns' }, { side: 'A3', title: 'Low Tide' },
    { side: 'B1', title: 'Winter Garden' }, { side: 'B2', title: 'The Long Way Round' }
  ]
};
const REISSUE = { ...EDITION, year: '2016', label: 'Larkspur Reissues' };
const CD = {
  ...EDITION, year: '1991', hasSides: false,
  tracks: [...EDITION.tracks, { title: 'Bonus Demo' }, { title: 'Radio Session' }].map((t, i) => ({ side: String(i + 1), title: t.title }))
};
const base = (...candidates) => async () => ({ found: true, ...candidates[0], candidates });

test('recoupement : la liste lue sur la pochette reste, la base la confirme', async () => {
  const asked = [];
  const lookup = async (q) => { asked.push(q); return base(REISSUE, EDITION)(); };
  const d = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE), apiKey: 'k', lookup });
  assert.deepEqual(asked[0], { title: 'Harbor Lights', artist: 'The Hollow Pines', catno: 'LKS 1042' });
  assert.equal(d.how, 'photo');
  assert.equal(d.confirmed, true);
  assert.equal(d.year, '1978', 'année imprimée, pas celle de la réédition');
  assert.equal(d.label, 'Larkspur Records');
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'B1', 'B2']);
});

test('pochette sans indication de face : faces reprises de la base', async () => {
  const flat = { ...SLEEVE, tracks: SLEEVE.tracks.map((t) => ({ side: '', title: t.title.toUpperCase() })) };
  const d = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], flat), apiKey: 'k', lookup: base(CD, EDITION) });
  assert.equal(d.how, 'photo+faces');
  assert.equal(d.hasSides, true);
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'B1', 'B2']);
  assert.equal(d.tracks[3].title, 'WINTER GARDEN', 'le titre lu est gardé');
});

test('liste absente des photos : celle de la base, pressage vinyle de préférence', async () => {
  const front = { ...SLEEVE, year: '', label: '', tracks: [] };
  const d = await readRecord({ front: IMG }, { fetchImpl: fakeClaude([], front), apiKey: 'k', lookup: base(CD, REISSUE, EDITION) });
  assert.equal(d.how, 'base');
  assert.equal(d.hasSides, true);
  assert.equal(d.tracks.length, 5);
  assert.equal(d.year, '1978', 'la plus ancienne des éditions : l\'année de l\'album');
});

test('la base parle d\'un autre disque, ou ne répond pas : la lecture seule', async () => {
  const other = { ...EDITION, tracks: [{ side: 'A1', title: 'Rien à voir' }, { side: 'B1', title: 'Autre chose' }] };
  const a = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], { ...SLEEVE, year: '' }), apiKey: 'k', lookup: base(other) });
  assert.equal(a.confirmed, false);
  assert.equal(a.year, '', 'pas d\'année prise sur un disque différent');
  assert.equal(a.tracks.length, 5);

  const b = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], SLEEVE), apiKey: 'k', lookup: async () => { throw new Error('MusicBrainz 503'); } });
  assert.equal(b.how, 'photo');
  assert.equal(b.tracks.length, 5);

  const c = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], { ...SLEEVE, title: '', artist: '', tracks: [] }), apiKey: 'k', lookup: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.deepEqual(c.tracks, []);
});

test('rapprochement des titres : le même d\'abord, un titre court ne vole pas la place d\'un long', () => {
  const edition = [{ side: 'A1', title: 'Ballade de Melody Nelson' }, { side: 'A2', title: 'Melody' }, { side: 'B1', title: 'En Melody' }];
  const read = [{ side: '1', title: 'Melody' }, { side: '2', title: 'Ballade de Melody Nelson' }, { side: '3', title: 'En Melody' }];
  assert.equal(overlap(read, edition), 1);
  assert.deepEqual(borrowSides(read, edition).map((t) => t.side), ['A2', 'A1', 'B1']);
  assert.equal(borrowSides([{ side: '1', title: 'Inconnu' }], edition), null);
});

test('plafonds : par compte et pour tout le site, remis à zéro chaque jour', () => {
  process.env.AI_USER_DAILY = '2'; process.env.AI_DAILY_LIMIT = '3';
  const d1 = new Date('2026-11-12T10:00:00Z'), d2 = new Date('2026-11-13T00:00:01Z');
  assert.equal(takeQuota(1, d1).ok, true);
  assert.equal(takeQuota(1, d1).ok, true);
  assert.deepEqual(takeQuota(1, d1), { ok: false, why: 'compte' });
  assert.equal(takeQuota(2, d1).ok, true);
  assert.deepEqual(takeQuota(3, d1), { ok: false, why: 'site' });
  assert.equal(takeQuota(1, d2).ok, true);
  delete process.env.AI_USER_DAILY; delete process.env.AI_DAILY_LIMIT;
});
