/* Lecture par IA : ce qu'on envoie au modèle et ce qu'on fait de sa réponse.
   Aucun appel réseau : le modèle est remplacé par un double. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCovers, readRecord, tidyTracks, takeQuota } from '../src/vision.js';

const IMG = Buffer.from('fausse image').toString('base64');

const SLEEVE = {
  artist: 'The Hollow Pines', title: 'Harbor Lights', label: 'Larkspur Records', year: '℗ 1978',
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
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal('anthropic-workspace-id' in headers, false, 'pas d\'en-tête d\'espace de travail sans réglage');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(body.output_config.format.schema.required, ['artist', 'title', 'label', 'year', 'tracks']);
  const images = body.messages[0].content.filter((b) => b.type === 'image');
  assert.equal(images.length, 2);
  assert.deepEqual(images[0].source, { type: 'base64', media_type: 'image/jpeg', data: IMG });
  assert.equal(body.temperature, undefined, 'les modèles récents refusent temperature');

  assert.equal(d.title, 'Harbor Lights');
  assert.equal(d.year, '1978', 'année extraite de « ℗ 1978 »');
  assert.equal(d.hasSides, true);
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'B1', 'B2']);
});

test('clé sans espace de travail : ANTHROPIC_WORKSPACE_ID est transmis', async () => {
  process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_essai';
  const log = [];
  await readCovers({ back: IMG }, { fetchImpl: fakeClaude(log, SLEEVE), apiKey: 'k' });
  delete process.env.ANTHROPIC_WORKSPACE_ID;
  assert.equal(log[0].headers['anthropic-workspace-id'], 'wrkspc_essai');
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

test('la fiche rendue au formulaire : ce qui est lu sur la pochette, rien d\'autre', async () => {
  const log = [];
  const d = await readRecord({ back: IMG }, { fetchImpl: fakeClaude(log, SLEEVE), apiKey: 'k' });
  assert.deepEqual(Object.keys(d), ['title', 'artist', 'year', 'label', 'tracks', 'hasSides', 'how']);
  assert.equal(d.how, 'photo');
  assert.equal(d.year, '1978');
  assert.equal(d.label, 'Larkspur Records');
  assert.deepEqual(d.tracks.map((t) => t.side), ['A1', 'A2', 'A3', 'B1', 'B2']);
  assert.equal(log.length, 1, 'un seul appel : le modèle, aucune base de disques');
});

test('pochette sans faces indiquées, liste absente, photo illisible', async () => {
  const flat = { ...SLEEVE, tracks: SLEEVE.tracks.map((t) => ({ side: '', title: t.title })) };
  const a = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], flat), apiKey: 'k' });
  assert.equal(a.hasSides, false);
  assert.deepEqual(a.tracks.map((t) => t.side), ['1', '2', '3', '4', '5'], 'numérotée, sans face inventée');

  const b = await readRecord({ front: IMG }, { fetchImpl: fakeClaude([], { ...SLEEVE, tracks: [] }), apiKey: 'k' });
  assert.equal(b.how, '');
  assert.equal(b.title, 'Harbor Lights');
  assert.deepEqual(b.tracks, []);

  const c = await readRecord({ back: IMG }, { fetchImpl: fakeClaude([], { artist: '', title: '', label: '', year: '', tracks: [] }), apiKey: 'k' });
  assert.deepEqual(c, { title: '', artist: '', year: '', label: '', tracks: [], hasSides: false, how: '' });
});

test('compilation : chaque titre garde son interprète', async () => {
  const comp = {
    artist: 'Artistes divers', title: 'Chansons de Noël', label: 'Wagram Music', year: '2018',
    tracks: [
      { side: 'A1', title: 'Tino Rossi – Petit Papa Noël' }, { side: 'A2', title: 'Dalida – Douce Nuit, Sainte Nuit' },
      { side: 'B1', title: 'Tino Rossi – Il Est Né Le Divin Enfant' }, { side: 'B2', title: 'Dalida – Vive Le Vent' }
    ]
  };
  const log = [];
  const d = await readRecord({ back: IMG }, { fetchImpl: fakeClaude(log, comp), apiKey: 'k' });
  assert.match(log[0].body.system, /compilation/, 'la consigne en parle');
  assert.equal(d.artist, 'Artistes divers');
  assert.equal(d.tracks[0].title, 'Tino Rossi – Petit Papa Noël');
  assert.equal(d.hasSides, true);
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
