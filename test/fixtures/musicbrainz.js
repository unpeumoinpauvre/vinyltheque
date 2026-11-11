/* Réponses au format de l'API MusicBrainz (ws/2, fmt=json), pour un disque fictif.
   Trois éditions du même album : le CD (numéros 1–10, sans faces), le 33 tours
   d'origine (A1…B5) et une réédition vinyle avec un titre bonus. */

const credit = [{ name: 'The Hollow Pines', joinphrase: '', artist: { id: 'a-1', name: 'The Hollow Pines' } }];
const TITLES = ['Midnight at the Harbor', 'Paper Lanterns', 'The Long Way Round', 'Sugar and Smoke',
  'Hold the Line Tonight', 'Winter Garden', 'Carousel Days', 'Nobody Told the Rain', 'Blue Kitchen Radio',
  'Last Train to Anywhere'];
const track = (number, position, title) => ({
  id: `t-${number}`, number, position, title, length: 240000, recording: { id: `r-${position}`, title }
});

export const search = {
  created: '2026-01-01T00:00:00.000Z', count: 3, offset: 0,
  releases: [
    {
      id: 'rel-cd', score: 100, title: 'Harbor Lights', status: 'Official', date: '1991-04-02', country: 'US',
      'artist-credit': credit, 'release-group': { id: 'rg-1', 'primary-type': 'Album' },
      'track-count': 10, media: [{ format: 'CD', 'disc-count': 1, 'track-count': 10 }]
    },
    {
      id: 'rel-lp', score: 100, title: 'Harbor Lights', status: 'Official', date: '1978-09-15', country: 'GB',
      'artist-credit': credit, 'release-group': { id: 'rg-1', 'primary-type': 'Album' },
      'track-count': 10, media: [{ format: '12" Vinyl', 'disc-count': 0, 'track-count': 10 }]
    },
    {
      id: 'rel-other', score: 61, title: 'Harbor Lights Forever', status: 'Official', date: '2003', country: 'DE',
      'artist-credit': [{ name: 'Die Hafenband', artist: { id: 'a-2', name: 'Die Hafenband' } }],
      'release-group': { id: 'rg-2', 'primary-type': 'Album' },
      'track-count': 12, media: [{ format: 'CD', 'disc-count': 1, 'track-count': 12 }]
    }
  ]
};

export const releases = {
  'rel-lp': {
    id: 'rel-lp', title: 'Harbor Lights', status: 'Official', date: '1978-09-15', country: 'GB',
    'artist-credit': credit,
    'release-group': { id: 'rg-1', 'first-release-date': '1978-09-15', 'primary-type': 'Album' },
    'label-info': [{ 'catalog-number': 'LAR 1047', label: { id: 'l-1', name: 'Larkspur Records' } }],
    media: [{
      position: 1, format: '12" Vinyl', title: '', 'track-count': 10, 'track-offset': 0,
      tracks: TITLES.map((t, i) => track(i < 5 ? `A${i + 1}` : `B${i - 4}`, i + 1, t))
    }]
  },
  'rel-cd': {
    id: 'rel-cd', title: 'Harbor Lights', status: 'Official', date: '1991-04-02', country: 'US',
    'artist-credit': credit,
    'release-group': { id: 'rg-1', 'first-release-date': '1978-09-15', 'primary-type': 'Album' },
    'label-info': [{ 'catalog-number': 'LARCD 1047', label: { id: 'l-1', name: 'Larkspur Records' } }],
    media: [{
      position: 1, format: 'CD', title: '', 'track-count': 10, 'track-offset': 0,
      tracks: TITLES.map((t, i) => track(String(i + 1), i + 1, t))
    }]
  }
};

/* Double album : deux supports, faces A/B puis C/D. */
export const doubleLp = {
  id: 'rel-2lp', title: 'Northern Relay', date: '1996', country: 'XE',
  'artist-credit': [{ name: 'Meridian Drift', artist: { id: 'a-3', name: 'Meridian Drift' } }],
  'label-info': [{ label: { id: 'l-2', name: 'Glasshouse' } }],
  media: [
    { position: 1, format: '12" Vinyl', tracks: [track('A1', 1, 'Opening Signal'), track('A2', 2, 'Glass Horizon'), track('B1', 3, 'Second Light'), track('B2', 4, 'Tidal Lock')] },
    { position: 2, format: '12" Vinyl', tracks: [track('C1', 1, 'Northern Relay'), track('C2', 2, 'Slow Orbit'), track('D', 3, 'Afterimage')] }
  ]
};
