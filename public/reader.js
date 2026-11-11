/* Vinylthèque — lecture du verso d'une pochette.

   Tesseract rend des mots avec leur position. Le texte brut, lui, ne dit rien de la
   mise en page : sur un verso à deux colonnes, « 1. Titre A      1. Titre B » arrive
   sur une seule ligne. On reconstruit donc la page nous-mêmes :

     1. segments  — une ligne est coupée là où un grand blanc sépare deux colonnes ;
     2. colonnes  — les segments alignés et proches forment une colonne, lue de haut
                    en bas, les colonnes d'une même bande de gauche à droite ;
     3. pistes    — numéros (1., A1, 01), durées et en-têtes de face disent quelles
                    lignes sont des titres ; le reste (crédits, mentions) est écarté ;
     4. faces     — en-tête « SIDE ONE / FACE B », préfixe A1/B2, numérotation qui
                    repart à 1, ou à défaut une face par colonne.

   Les fonctions de mise en page sont pures (aucun accès au navigateur) : elles sont
   testées telles quelles par `npm test`. */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ vocabulaire */

  const NOISE_RE = /^(stereo|st[ée]r[ée]o|mono|\d{2,3}\s?(rpm|t\/min|tours)|all rights|tous droits|made in|fabriqu|printed|imprim|manufactur|distribu|executive produc|produced by|produit par|production|r[ée]alis|arrang|recorded|enregistr|engineer|ing[ée]nieur|prise de son|master(ed|ing)|mix(ed|ing|age)|remaster|artwork|design|conception|photo|publish|[ée]dit(ions|é)|licen|under exclusive|marketing|total time|dur[ée]e totale|all songs|all tracks|all titles|paroles|musique|words and music|written by|compos|thanks|merci|℗|©|®|\(p\)\s|\(c\)\s|www\.|http|lc\s?\d|[0-9]{8,})/i;
  const LABEL_RE = /\b(records?|recordings?|music|musik|entertainment|editions?|productions?|disques)\b/i;

  const SIDE_WORDS = {
    one: 1, two: 2, three: 3, four: 4, un: 1, une: 1, deux: 2, trois: 3, quatre: 4,
    eins: 1, zwei: 2, uno: 1, dos: 2, due: 2, i: 1, ii: 2, iii: 3, iv: 4,
    1: 1, 2: 2, 3: 3, 4: 4
  };
  const SIDE_RE = /^(?:(?:face|side|c[oô]t[eé]|seite|lado|cara|lato)\s*[:.\-–]?\s*(one|two|three|four|une?|deux|trois|quatre|eins|zwei|uno|dos|due|[1-4]|i{1,3}|iv|[a-h])(?![a-zà-ÿ0-9'’])|([a-h])[\s\-]?side(?![a-zà-ÿ0-9]))\s*([:.\-–]*)\s*(.*)$/i;
  const SEQ = 'ABCDEFGH';

  /* Une durée : 4:12, (4:12), [4:12], 4'12, 4′12″. Le point (4.12) n'est admis
     qu'en fin de ligne, où il ne peut pas être confondu avec un numéro. */
  const DUR = "[(\\[]?\\b\\d{1,2}\\s?[:'’′]\\s?\\d{2}\\b[\"”″]?[)\\]]?";
  const DUR_END_RE = new RegExp('(?:\\s|^)(?:' + DUR + '|[(\\[]?\\d{1,2}\\.\\d{2}[)\\]]?)\\s*$');
  const DUR_ONLY_RE = new RegExp('^(?:' + DUR + '|[(\\[]?\\d{1,2}\\.\\d{2}[)\\]]?)$');
  const DUR_ANY_RE = new RegExp(DUR, 'g');

  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[s.length >> 1];
  };

  function stripEdges(t) {
    return String(t)
      .replace(/^[^0-9A-Za-zÀ-ÿ(«"'’]+/, '')
      .replace(/[\s.,;:'"«»\-–—_\[\]{}|*•·]+$/, '')
      .trim();
  }

  /* ---------------------------------------------------------- 1. segments */

  /* Repart des mots, pas des lignes de Tesseract : selon le réglage, celui-ci rend
     tantôt une ligne qui traverse deux colonnes, tantôt un numéro séparé de son
     titre. Un mot prolonge un segment s'il est sur la même ligne et à moins de
     2,4 hauteurs de lettre du mot précédent ; au-delà, c'est une autre colonne. */
  function toSegments(page, { minWordConf = 25, minConf = 0 } = {}) {
    const words = [];
    for (const line of page.lines || []) {
      /* Sur une ligne de biais, Tesseract rend parfois des boîtes de mots deux fois
         trop hautes : on les ramène à la hauteur de la ligne. */
      const lh = (line.y1 ?? 0) - (line.y0 ?? 0);
      for (const w of line.words || []) {
        const text = String(w.text ?? '').trim();
        let y0 = w.y0, y1 = w.y1;
        if (lh > 0 && y1 - y0 > lh * 1.3) { y0 = Math.max(y0, line.y0 - lh * 0.1); y1 = Math.min(y1, line.y1 + lh * 0.1); }
        const h = y1 - y0;
        if (!text || h <= 0 || w.x1 <= w.x0) continue;
        if ((w.conf ?? 100) < minWordConf) continue;          // pointillés, taches, grain du carton
        words.push({ text, conf: w.conf ?? 100, x0: w.x0, y0, x1: w.x1, y1, h });
      }
    }
    words.sort((a, b) => (a.x0 - b.x0) || (a.y0 - b.y0));

    const segs = [];
    for (const w of words) {
      let best = null, bestGap = Infinity;
      for (const s of segs) {
        const last = s.words[s.words.length - 1];
        const hh = Math.max(s.h, w.h);
        const gap = w.x0 - last.x1;
        /* Les boîtes de Tesseract débordent parfois sur le mot voisin : un léger
           recouvrement est admis tant que le mot commence bien plus à droite. */
        if (gap < -1.6 * hh || w.x0 <= last.x0 || gap > 2.4 * s.h) continue;
        /* même ligne : recouvrement vertical avec la fin du segment (la photo
           peut être de biais, on ne compare donc qu'aux derniers mots) */
        const ov = Math.min(w.y1, s.ty1) - Math.max(w.y0, s.ty0);
        if (ov < 0.5 * Math.min(w.h, s.ty1 - s.ty0)) continue;
        if (w.h > 2.2 * s.h || s.h > 3.5 * w.h) continue;      // corps trop différents
        if (gap < bestGap) { best = s; bestGap = gap; }
      }
      if (best) {
        best.words.push(w);
        best.h = Math.max(best.h, Math.min(w.h, best.h * 1.4));
        if (w.h >= 0.6 * best.h) { best.ty0 = w.y0; best.ty1 = w.y1; }
      } else segs.push({ words: [w], h: w.h, ty0: w.y0, ty1: w.y1 });
    }

    for (const s of segs) {
      s.text = s.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
      s.x0 = Math.min(...s.words.map((w) => w.x0)); s.x1 = Math.max(...s.words.map((w) => w.x1));
      s.y0 = median(s.words.map((w) => w.y0)); s.y1 = median(s.words.map((w) => w.y1));
      s.h = Math.max(1, s.y1 - s.y0);
      s.conf = s.words.reduce((t, w) => t + w.conf, 0) / s.words.length;
      s.hasDur = false;
    }

    /* Une durée isolée (alignée au bord de la colonne, après des pointillés) est
       rattachée au titre le plus proche à sa gauche sur la même ligne. Les
       segments douteux sont écartés avant : des pointillés mal lus ne doivent
       pas capter la durée à la place du titre. */
    const out = [];
    const sure = segs.filter((s) => s.conf >= minConf
      || (s.conf >= 25 && s.text.length <= 12 && isHeader(s.text)));   // « FACE A » court et un peu flou
    const titles = sure.filter((s) => !DUR_ONLY_RE.test(s.text));
    for (const s of sure) {
      if (!DUR_ONLY_RE.test(s.text)) { out.push(s); continue; }
      let host = null;
      for (const t of titles) {
        if (t.x1 > s.x0) continue;
        const ov = Math.min(t.y1, s.y1) - Math.max(t.y0, s.y0);
        if (ov < 0.4 * Math.min(t.h, s.h)) continue;
        if (!host || t.x1 > host.x1) host = t;
      }
      if (host) host.hasDur = true;
    }
    return out;
  }

  /* ---------------------------------------------------------- 2. colonnes */

  /* Un segment rejoint la colonne dont le dernier élément est juste au-dessus et
     aligné avec lui (à gauche, au centre ou à droite), dans un corps voisin. Le
     grand titre de l'album, bien plus gros, reste donc hors de la liste. */
  function toColumns(segs) {
    const sorted = [...segs].sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
    const cols = [];
    for (const s of sorted) {
      let best = null, bestD = Infinity;
      /* Un en-tête de face ouvre toujours un nouveau bloc : sur un double album, la
         face D ne doit pas se coller sous la face B. */
      if (!isHeader(s.text)) for (const c of cols) {
        const last = c.segs[c.segs.length - 1];
        const hh = Math.max(s.h, last.h);
        const gap = s.y0 - last.y1;
        if (gap < -0.6 * hh || gap > 3.4 * hh) continue;
        const ratio = s.h / last.h;
        if (ratio < 0.55 || ratio > 1.8) continue;
        const tol = 1.3 * hh;
        /* Alignement jugé sur les trois dernières lignes : une piste dont le numéro
           a disparu dans une ombre commence plus à droite, la suivante revient. */
        let d = Infinity;
        for (const ref of c.segs.slice(-3)) {
          const dLeft = Math.abs(s.x0 - ref.x0);
          const dMid = Math.abs((s.x0 + s.x1) / 2 - (ref.x0 + ref.x1) / 2);
          const dRight = Math.abs(s.x1 - ref.x1);
          d = Math.min(d, dLeft, dMid + tol * 0.25, dRight + tol * 0.5);
        }
        if (d <= tol && d < bestD) { best = c; bestD = d; }
      }
      if (best) best.segs.push(s);
      else cols.push({ segs: [s] });
    }
    for (const c of cols) {
      c.x0 = Math.min(...c.segs.map((s) => s.x0)); c.x1 = Math.max(...c.segs.map((s) => s.x1));
      c.y0 = Math.min(...c.segs.map((s) => s.y0)); c.y1 = Math.max(...c.segs.map((s) => s.y1));
    }

    /* Bandes horizontales : les colonnes qui se chevauchent en hauteur se lisent de
       gauche à droite ; les bandes, de haut en bas (double album en grille 2×2). */
    cols.sort((a, b) => a.y0 - b.y0);
    const bands = [];
    for (const c of cols) {
      const band = bands[bands.length - 1];
      const hgt = Math.max(1, c.y1 - c.y0);
      const overlap = band ? Math.min(band.y1, c.y1) - Math.max(band.y0, c.y0) : -1;
      if (band && overlap > 0.35 * Math.min(hgt, band.y1 - band.y0)) {
        band.cols.push(c); band.y1 = Math.max(band.y1, c.y1);
      } else bands.push({ cols: [c], y0: c.y0, y1: c.y1 });
    }
    const out = [];
    for (const band of bands) {
      band.cols.sort((a, b) => a.x0 - b.x0);
      out.push(...band.cols);
    }
    out.forEach((c, i) => { c.id = i; });
    return out;
  }

  /* ---------------------------------------------------- lecture d'une ligne */

  function sideLetter(token) {
    const t = String(token).toLowerCase();
    if (/^[a-h]$/.test(t) && !(t in SIDE_WORDS)) return t.toUpperCase();
    const n = SIDE_WORDS[t];
    if (n) return SEQ[n - 1];
    return /^[a-h]$/.test(t) ? t.toUpperCase() : '';
  }

  const isHeader = (text) => { const r = readLine(text); return !!r.header && !r.rest; };

  /* Chiffre pris pour une lettre après la lettre de face : « AS » pour A5, « Bl » pour B1. */
  const LOOKALIKE = { S: 5, s: 5, l: 1, I: 1, i: 1, '|': 1, '!': 1, Z: 2, z: 2, O: 0, o: 0, B: 8, G: 6, b: 6, g: 9, q: 9, T: 7 };

  /* Renvoie ce que dit une ligne : en-tête de face, numéro de piste, durée, titre. */
  function readLine(raw) {
    let text = String(raw).replace(/[|_¤~^“”„]/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/^[^0-9A-Za-zÀ-ÿ(«"'’]+/, '');
    const out = { raw: text, header: '', rest: '', letter: '', num: null, kind: '', hasDur: false };
    if (!text) return out;

    const sh = text.match(SIDE_RE);
    if (sh) {
      const letter = sideLetter(sh[1] || sh[2]);
      const sep = sh[3], rest = (sh[4] || '').trim();
      /* Un en-tête est seul sur sa ligne, ou suivi de « : » ou d'une piste numérotée.
         « Side A Blues » ou « Face B of the Moon » restent des titres. */
      if (letter && (!rest || sep || /^\d{1,2}\s*[.)]/.test(rest))) {
        out.header = letter; out.rest = rest;
        return out;
      }
    }
    if (/^[A-H]$/.test(text)) { out.header = text; return out; }

    let body = text, m;
    const lead = body.match(/^[(\[]?\d{1,2}[:'’′]\d{2}[)\]]?\s+(\S.*)$/);
    if (lead) { out.hasDur = true; body = lead[1]; }           // « 3:05 Titre » : durée, pas numéro
    if ((m = body.match(/^([A-Ha-h])\s?[.\-]?\s?(\d{1,2})\s*[.)\]:\-–]+\s*(\S.*)$/))
      || (m = body.match(/^([A-H])(\d{1,2})\s+(\S.*)$/))) {
      out.letter = m[1].toUpperCase(); out.num = +m[2]; out.kind = 'letter'; body = m[3];
    } else if ((m = body.match(/^([A-H])([Il|])\s*[.)]\s*(\S.*)$/))) {
      out.letter = m[1]; out.num = 1; out.kind = 'letter'; body = m[3];       // « Al. » lu pour « A1. »
    } else if ((m = body.match(/^(\d{1,2})\s*[.)\]:\-–]+\s*(\S.*)$/))) {
      out.num = +m[1]; out.kind = 'punct'; body = m[2];
    } else if ((m = body.match(/^[Il|]\s?[.)]\s+(\S.*)$/))) {
      out.num = 1; out.kind = 'punct'; body = m[1];                             // « l. » lu pour « 1. »
    } else if ((m = body.match(/^(\d{1,2})\s+(\S.*)$/))) {
      out.num = +m[1]; out.kind = 'bare'; out.bareBody = m[2];                  // à confirmer par la suite
    }

    if (DUR_END_RE.test(body)) { out.hasDur = true; }
    out.body = body;
    return out;
  }

  /* --------------------------------------------------- nettoyage d'un titre */

  const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to',
    'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'ou', 'à', 'au', 'aux', 'en', 'dans', 'sur', 'pour']);

  /* « RUN LIKE THUNDER » → « Run Like Thunder ». Ne touche qu'aux lignes entièrement
     en capitales ; les chiffres romains y restent en capitales (« Part II »). */
  function titleCase(t) {
    const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length < 4 || letters !== letters.toUpperCase()) return t;
    return t.toLowerCase().split(/(\s+|-)/).map((w, i) => {
      if (!w.trim() || w === '-') return w;
      if (/^[ivx]+$/.test(w) && w.length <= 4) return w.toUpperCase();          // chiffres romains, « I »
      if (i > 0 && SMALL.has(w)) return w;
      return w.replace(/^((?:[ldjnmtscqu]{1,2}['’])?)([a-zà-ÿ])/, (_, p, c) =>
        (p ? p.charAt(0).toUpperCase() + p.slice(1) : '') + c.toUpperCase());
    }).join('');
  }

  function cleanTitle(body) {
    let t = String(body);
    t = t.replace(/\s*(?:\.{2,}|…|\s[.·]{1}(?:\s[.·]){2,}|_{2,}|-{3,}).*$/, '');   // pointillés de conduite
    t = t.replace(DUR_END_RE, ' ');
    t = t.replace(DUR_END_RE, ' ');
    /* Crédit d'auteur en fin de ligne : (Lennon/McCartney), (E. Brandt), (Dupont, Martin). */
    t = t.replace(/\s*[(\[](?=[^)\]]*(?:\/|,|&|\b[A-Z]\.\s?[A-Z]|\b[B-HJ-Z]\s[A-Z][a-zà-ÿ]))[^)\]]{2,60}[)\]]\s*$/, '');
    t = t.replace(/\s+/g, ' ');
    return titleCase(stripEdges(t));
  }

  /* Écarte le bruit sans être gourmand : assez de lettres, pas une mention légale. */
  function looksLikeTitle(t, raw, strict) {
    if (NOISE_RE.test(raw || t) || NOISE_RE.test(t)) return false;
    if (LABEL_RE.test(t) && /\b(19|20)\d{2}\b/.test(t)) return false;
    if (t.length < 2 || t.length > 110) return false;
    const letters = (t.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    if (letters < 2 || letters / t.length < 0.45) return false;
    const words = t.split(/\s+/).filter((w) => /[a-zA-ZÀ-ÿ0-9]/.test(w));
    const tiny = words.filter((w) => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').length <= 1).length;
    if (words.length >= 4 && tiny / words.length > 0.4) return false;
    if (strict) {
      if (t.length > 64 || words.length > 10) return false;        // une phrase, pas un titre
      if (/[.:;]\s+\S/.test(t) && words.length > 5) return false;   // plusieurs phrases
      if (/,\s/.test(t) && /\b(bass|basse|drums|batterie|piano|guitar|guitare|vocals?|voix|chant|saxophone|sax|trumpet|trompette|keyboards?|claviers?|percussions?|violin|violon)\b/i.test(t)) return false;
    }
    return true;
  }

  /* ---------------------------------------- listes « à la suite » (en ligne) */

  /* Certains versos enchaînent les titres dans un paragraphe :
     « SIDE 1: 1. Titre (4:12) 2. Titre (3:47) … ». On recolle alors la colonne en
     un seul texte et on la redécoupe sur les numéros, les durées et les puces. */
  function isFlow(col) {
    let hits = 0;
    for (const s of col.segs) {
      const t = s.text.replace(DUR_ANY_RE, ' ¦ ');
      const nums = [...t.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+\S/g)].map((x) => +x[1]);
      let seq = 0;
      for (let i = 1; i < nums.length; i++) if (nums[i] === nums[i - 1] + 1) seq++;
      const durs = (t.match(/¦\s*\S/g) || []).length;
      if (seq >= 1 || durs >= 2) hits++;
    }
    return hits >= 1;
  }

  function expandFlow(col) {
    const text = col.segs.map((s) => s.text).join(' ')
      .replace(/[|_¤~^“”„]/g, ' ')
      .replace(DUR_ANY_RE, ' ¦ ')
      .replace(/\s[•·*]\s/g, ' ¦ ')
      .replace(/\s+/g, ' ');
    const items = [];
    const HEAD = /(?:^|\s)((?:face|side|c[oô]t[eé]|seite|lado|cara)\s*[:.\-–]?\s*(?:one|two|three|four|une?|deux|trois|quatre|[1-4]|i{1,3}|iv|[a-h]))\s*[:.\-–]*(?=\s|$)/gi;
    let chunks = [], last = 0, m;
    while ((m = HEAD.exec(text))) {
      if (m.index > last) chunks.push({ text: text.slice(last, m.index) });
      chunks.push({ header: sideLetter(m[1].replace(/^(?:face|side|c[oô]t[eé]|seite|lado|cara)\s*[:.\-–]?\s*/i, '')) });
      last = m.index + m[0].length;
    }
    if (last < text.length) chunks.push({ text: text.slice(last) });

    for (const ch of chunks) {
      if (ch.header) { items.push({ header: ch.header }); continue; }
      let expected = 1;
      for (const piece of ch.text.split('¦')) {
        const marks = [...piece.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+(?=\S)/g)]
          .filter((x) => { const n = +x[1]; if (n === expected || n === 1) { expected = n + 1; return true; } return false; });
        if (!marks.length) {
          if (piece.trim()) items.push({ text: piece.trim(), hasDur: true });
          continue;
        }
        const head = piece.slice(0, marks[0].index).trim();
        if (head) items.push({ text: head, hasDur: true });
        marks.forEach((mk, i) => {
          const start = mk.index + mk[0].length;
          const end = i + 1 < marks.length ? marks[i + 1].index : piece.length;
          const body = piece.slice(start, end).trim();
          if (body) items.push({ text: body, num: +mk[1], hasDur: true });
        });
      }
    }
    return items;
  }

  /* ------------------------------------------------- 3. pistes et 4. faces */

  function readTracks(page, opts = {}) {
    const minConf = opts.minConf ?? 45;
    const segs = toSegments(page, { minWordConf: Math.min(25, minConf), minConf });
    const cols = toColumns(segs);

    /* Chaque ligne, dans l'ordre de lecture, avec ce qu'elle dit. */
    const rows = [];
    for (const col of cols) {
      if (isFlow(col)) {
        for (const it of expandFlow(col)) {
          if (it.header) rows.push({ col: col.id, header: it.header, flow: true });
          else rows.push({
            col: col.id, flow: true, raw: it.text, body: it.text, hasDur: !!it.hasDur,
            num: it.num ?? null, kind: it.num != null ? 'punct' : '', letter: ''
          });
        }
        continue;
      }
      for (const s of col.segs) {
        const r = readLine(s.text);
        if (!r.raw) continue;
        r.col = col.id; r.h = s.h; r.hasDur = r.hasDur || s.hasDur;
        if (r.header) {
          rows.push({ col: col.id, header: r.header });
          if (r.rest) {
            const r2 = readLine(r.rest);
            r2.col = col.id; r2.h = s.h; r2.hasDur = r2.hasDur || s.hasDur;
            if (r2.raw && !r2.header) rows.push(r2);
          }
        } else rows.push(r);
      }
    }

    /* Un numéro sans ponctuation (« 1 Titre ») n'est retenu que s'il prolonge une
       suite : sinon « 7 Rings » ou « 99 Luftballons » perdraient leur chiffre. */
    const lastNum = {};
    rows.forEach((r, i) => {
      if (r.header) { lastNum[r.col] = 0; return; }
      if (r.kind === 'bare') {
        const prev = lastNum[r.col] || 0;
        const next = rows.slice(i + 1).find((x) => x.col === r.col && !x.header);
        const follows = r.num === prev + 1 && (prev > 0 || (next && next.num === 2) || r.num === 1 && !next);
        const starts = r.num === 1 && next && next.num === 2;
        if (follows || starts) { r.kind = 'punct'; r.body = r.bareBody; }
        else { r.kind = ''; r.num = null; }
      }
      if (r.num != null) lastNum[r.col] = r.num;
    });

    const lines = rows.filter((r) => !r.header);
    const nLetter = lines.filter((r) => r.kind === 'letter').length;
    const nNum = lines.filter((r) => r.kind === 'punct').length;
    const nDur = lines.filter((r) => r.hasDur).length;
    const nHead = rows.filter((r) => r.header).length;
    const mode = nLetter >= 2 ? 'letter' : nNum >= 3 ? 'number' : nDur >= 3 ? 'duration'
      : nHead >= 1 ? 'header' : 'loose';

    /* Liste à préfixe A1/B2 : « AS Titre » est un A5 mal lu, « Bl Titre » un B1,
       pourvu que la ligne voisine le confirme. */
    if (mode === 'letter') {
      rows.forEach((r, i) => {
        if (r.header || r.num != null) return;
        const m = String(r.body ?? r.raw).match(/^([A-H])([A-Za-z|!])\s*[.)]?\s+(\S.*)$/);
        if (!m || !(m[2] in LOOKALIKE)) return;
        const n = LOOKALIKE[m[2]];
        const prev = rows.slice(0, i).reverse().find((x) => !x.header && x.num != null);
        const next = rows.slice(i + 1).find((x) => !x.header && x.num != null);
        const fits = (prev && prev.letter === m[1] && prev.num === n - 1)
          || (next && next.letter === m[1] && next.num === n + 1)
          || (n === 1 && prev && prev.letter && prev.letter !== m[1]);
        if (fits) { r.letter = m[1]; r.num = n; r.kind = 'letter'; r.body = m[3]; }
      });
    }

    /* Dans une liste numérotée, les lignes sans numéro coincées entre n et n+k+1
       sont les k pistes dont l'OCR a perdu le chiffre (ombre, reflet, pliure). */
    if (mode === 'letter' || mode === 'number') {
      const lines2 = rows.filter((r) => !r.header);
      for (let i = 0; i < lines2.length; i++) {
        const a = lines2[i];
        if (a.num == null) continue;
        let j = i + 1;
        while (j < lines2.length && lines2[j].num == null) j++;
        const b = lines2[j], k = j - i - 1;
        if (!b || k < 1 || k > 3 || b.num !== a.num + k + 1 || a.letter !== b.letter) continue;
        for (let t = 1; t <= k; t++) {
          const r = lines2[i + t];
          r.num = a.num + t; r.kind = a.kind; r.letter = a.letter; r.filled = true;
          r.body = String(r.body ?? r.raw).replace(/^\S{1,2}\s?[.)]\s+(?=\S)/, '');   // reste d'un numéro mal lu
        }
      }
    }

    const headed = new Set();          // colonnes où un en-tête de face a déjà été lu
    const kept = [];
    for (const r of rows) {
      if (r.header) { headed.add(r.col); kept.push(r); continue; }
      const strong = r.kind === 'letter' || r.kind === 'punct';
      let ok;
      if (mode === 'letter') ok = r.kind === 'letter' || (strong && nLetter < 3);
      else if (mode === 'number') ok = strong;
      else if (mode === 'duration') ok = r.hasDur || strong;
      else if (mode === 'header') ok = headed.has(r.col);
      else ok = true;
      if (!ok) continue;
      const title = cleanTitle(r.body ?? r.raw);
      if (!looksLikeTitle(title, r.raw, !(strong || r.hasDur))) continue;
      kept.push({ ...r, title });
    }

    /* Les titres d'une liste sont composés dans le même corps : une ligne nettement
       plus petite (crédits) ou plus grosse (nom de l'album) que les autres sort. */
    const bodies = kept.filter((r) => !r.header && r.h).map((r) => r.h);
    const body = median(bodies);
    let list = bodies.length >= 4
      ? kept.filter((r) => r.header || !r.h || (r.h >= 0.6 * body && r.h <= 1.7 * body))
      : kept;

    /* Sans aucun repère (ni numéro, ni durée, ni en-tête), on ne garde que les
       colonnes qui ressemblent à une liste : au moins trois lignes courtes. */
    if (mode === 'loose') {
      const perCol = {};
      list.forEach((r) => { (perCol[r.col] = perCol[r.col] || []).push(r); });
      const good = new Set(Object.keys(perCol).filter((c) => perCol[c].length >= 3).map(Number));
      list = list.filter((r) => good.has(r.col));
    }

    /* Faces. */
    const used = new Set();
    const takeSide = (letter) => {
      let i = SEQ.indexOf(letter);
      if (i < 0) return letter;
      while (i < SEQ.length && used.has(SEQ[i])) i++;      // double album : « Side 1 / 2 » deux fois
      const L = SEQ[i] || letter;
      used.add(L);
      return L;
    };

    const tracks = [];
    let side = '', prevNum = 0, run = 0, sinceHeader = 0;
    for (const r of list) {
      if (r.header) { side = takeSide(r.header); prevNum = 0; run++; sinceHeader = 0; continue; }
      if (r.kind === 'letter') {
        if (side !== r.letter) { side = r.letter; used.add(side); run++; }
      } else if (r.num != null && prevNum > 0 && r.num <= prevNum && r.num <= 2 && sinceHeader > 0) {
        /* la numérotation repart : face suivante */
        if (side) side = takeSide(SEQ[Math.min(SEQ.indexOf(side) + 1, SEQ.length - 1)]);
        run++;
      }
      if (r.num != null) prevNum = r.num;
      sinceHeader++;
      const prev = tracks[tracks.length - 1];
      if (prev && prev.title.toLowerCase() === r.title.toLowerCase() && prev.run === run) continue;
      tracks.push({ sideLetter: side, num: r.num, title: r.title, col: r.col, run });
    }

    /* Aucune face nommée : on la déduit des reprises de numérotation, sinon des
       colonnes (deux colonnes de titres = deux faces). */
    if (tracks.length && !tracks.some((t) => t.sideLetter)) {
      const key = tracks.some((t) => t.run !== tracks[0].run) ? 'run' : 'col';
      const groups = [...new Set(tracks.map((t) => t[key]))];
      const sizes = groups.map((g) => tracks.filter((t) => t[key] === g).length);
      if (groups.length >= 2 && groups.length <= 4 && Math.min(...sizes) >= 2)
        tracks.forEach((t) => { t.sideLetter = SEQ[groups.indexOf(t[key])]; });
    } else if (tracks.some((t) => !t.sideLetter)) {
      /* Des pistes lues avant le premier en-tête : si celui-ci est « B », l'en-tête
         « A » a été manqué et ces pistes sont la face précédente. */
      const first = tracks.findIndex((t) => t.sideLetter);
      const at = SEQ.indexOf(tracks[first].sideLetter);
      const before = at > 0 ? SEQ[at - 1] : tracks[first].sideLetter;
      for (let i = 0; i < first; i++) tracks[i].sideLetter = before;
    }

    /* Petits caractères : « 2'48 » est parfois lu « 248 ». Si presque toutes les
       lignes finissent par trois ou quatre chiffres, ce sont des durées. */
    const tail = /\s+\d{3,4}$/;
    if (tracks.length >= 3 && tracks.filter((t) => tail.test(t.title)).length >= 0.6 * tracks.length)
      tracks.forEach((t) => { t.title = stripEdges(t.title.replace(tail, '')); });

    const count = {};
    return tracks.slice(0, 60).map((t) => {
      const k = t.sideLetter || '_';
      count[k] = (count[k] || 0) + 1;
      const n = t.num != null && t.num >= count[k] && t.num <= count[k] + 2 ? t.num : count[k];
      count[k] = n;
      return { side: t.sideLetter ? t.sideLetter + n : String(n), title: t.title };
    });
  }

  /* ---------------------------------------------------- nom, année, label */

  /* Titre de l'album = le texte le plus grand de la pochette recto. */
  function guessTitle(page) {
    const cands = toSegments(page, { minConf: 45 })
      .map((s) => ({ h: s.h, text: stripEdges(s.text) }))
      .filter((s) => s.text.length >= 2 && s.text.length <= 60
        && /[a-zA-ZÀ-ÿ]{2}/.test(s.text) && !NOISE_RE.test(s.text))
      .sort((a, b) => b.h - a.h);
    return cands[0]?.text || '';
  }

  /* Texte de la page dans l'ordre de lecture, une ligne reconstruite par ligne. */
  function pageText(page) {
    return toColumns(toSegments(page, { minConf: 40 }))
      .map((c) => c.segs.map((s) => s.text).join('\n')).join('\n');
  }

  /* « ℗ & © 1978 Larkspur Records. All rights reserved » : l'année et le nom qui
     suivent le signe de copyright sont ceux du disque. Une date d'enregistrement
     (« recorded March 1977 ») ou un éditeur (« published by … Music ») ne le sont pas. */
  const COPY_RE = /(?:[℗©®]|\((?:p|c)\))\s*(?:(?:&|et|and)\s*(?:[℗©®]|\((?:p|c)\))\s*)?((?:19[2-9]|20[0-4])\d)\b[ \t,]*([^\n.;]*)/gi;

  function guessYear(page) {
    const text = pageText(page);
    const m = new RegExp(COPY_RE.source, 'gi').exec(text);
    if (m) return m[1];
    const years = (text.match(/\b(?:19[2-9]|20[0-4])\d\b/g) || []).map(Number)
      .filter((y) => y <= new Date().getFullYear());
    return years.length ? String(Math.max(...years)) : '';
  }

  function guessLabel(page) {
    const text = pageText(page);
    for (const m of text.matchAll(new RegExp(COPY_RE.source, 'gi'))) {
      const name = stripEdges(m[2]
        .replace(/\s+(?:all\s+\S+\s+reserved|all rights|tous droits|made in|fabriqu|distribu|unauthori[sz]ed|manufactur|under licen|sous licen).*$/i, ''));
      if (name.length >= 2 && name.length <= 40 && /[a-zA-ZÀ-ÿ]{2}/.test(name)) return name;
    }
    /* À défaut : une ligne courte faite de noms propres, « Blue Note Records ». */
    const hit = text.split('\n').find((l) => {
      const words = l.trim().split(/\s+/);
      return l.length <= 40 && words.length >= 2 && words.length <= 4 && LABEL_RE.test(l)
        && words.every((w) => /^[A-ZÀ-Ý0-9]/.test(w))
        && !/publish|[ée]dit|songs|titles|rights|droits|\b(bmi|ascap|sacem|gema)\b|music\s*\(/i.test(l);
    });
    if (!hit) return '';
    return stripEdges(hit
      .replace(/^(?:[℗©®]|\((?:p|c)\)|[&\s])+/i, '')
      .replace(/^(?:19|20)\d{2}\s*/, '')
      .replace(/\s*(?:19|20)\d{2}$/, ''));
  }

  /* --------------------------------------- rapprochement avec la base en ligne */

  const fold = (s) => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  /* Part des titres d'une tracklist en ligne que l'on retrouve dans le texte lu
     sur la photo. Sert à dire « c'est bien ce disque » avant de remplacer la
     lecture par la liste en ligne, plus propre. */
  function overlap(onlineTracks, pageOrText) {
    const text = ' ' + fold(typeof pageOrText === 'string' ? pageOrText
      : (pageOrText.lines || []).map((l) => (l.words || []).map((w) => w.text).join(' ')).join(' ')) + ' ';
    if (!onlineTracks?.length) return 0;
    let hit = 0;
    for (const t of onlineTracks) {
      const f = fold(t.title).replace(/\s*\b(remaster(ed)?|live|version|mono|stereo|edit)\b.*$/, '').trim();
      if (f.length >= 3 && text.includes(' ' + f + ' ')) { hit++; continue; }
      const words = f.split(' ').filter((w) => w.length > 2);
      if (words.length >= 2 && words.filter((w) => text.includes(' ' + w + ' ')).length / words.length >= 0.75) hit += 0.75;
    }
    return hit / onlineTracks.length;
  }

  /* Deux titres sont-ils le même, à une faute de lecture près ? */
  function sameTitle(a, b) {
    const x = fold(a), y = fold(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) return true;
    const m = x.length, n = y.length;
    if (Math.abs(m - n) > 0.3 * Math.max(m, n)) return false;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = cur;
    }
    return 1 - prev[n] / Math.max(m, n) >= 0.8;
  }

  /* Parmi les éditions proposées en ligne, celle qui colle le mieux à la photo.
     À recouvrement égal, on préfère une édition qui connaît ses faces. */
  function bestMatch(candidates, pageOrText) {
    let best = null;
    for (const c of candidates || []) {
      const ov = overlap(c.tracks, pageOrText);
      const score = ov + (c.hasSides ? 0.08 : 0);
      if (!best || score > best.score) best = { candidate: c, overlap: ov, score };
    }
    return best;
  }

  /* Une édition en ligne sans faces (CD, numérique) reçoit celles lues sur la
     photo : chaque titre prend la face du titre lu qui lui correspond. Si trop
     peu de titres se retrouvent, ou si les faces ne se suivent pas (A, B, A…),
     on ne touche à rien. */
  function borrowSides(online, read) {
    if (!online?.length || !read?.length) return online;
    const letters = online.map((t) => {
      const hit = read.find((r) => sameTitle(t.title, r.title));
      return hit ? splitSide(hit.side).letter : '';
    });
    if (letters.filter(Boolean).length < 0.6 * online.length) return online;
    for (let i = 1; i < letters.length; i++) if (!letters[i]) letters[i] = letters[i - 1];
    for (let i = letters.length - 2; i >= 0; i--) if (!letters[i]) letters[i] = letters[i + 1];
    for (let i = 1; i < letters.length; i++) if (letters[i] < letters[i - 1]) return online;
    const count = {};
    return online.map((t, i) => {
      count[letters[i]] = (count[letters[i]] || 0) + 1;
      return { side: letters[i] + count[letters[i]], title: t.title };
    });
  }

  /* ------------------------------------------------- affichage et saisie */

  /* « A1 », « b 2 », « 3 » → { letter, n } */
  function splitSide(side) {
    const m = String(side || '').toUpperCase().match(/^([A-H])?\s*(\d{1,2})?$/);
    return m ? { letter: m[1] || '', n: m[2] ? +m[2] : null } : { letter: '', n: null };
  }

  /* Regroupe une liste de pistes par face, dans l'ordre où elles apparaissent. */
  function groupBySide(tracks) {
    const groups = [];
    for (const t of tracks || []) {
      const { letter, n } = splitSide(t.side);
      let g = groups[groups.length - 1];
      if (!g || g.letter !== letter) { g = { letter, tracks: [] }; groups.push(g); }
      g.tracks.push({ n: n ?? g.tracks.length + 1, title: t.title, side: t.side });
    }
    return groups;
  }

  /* Texte du champ « Titres » : une piste par ligne, une ligne vide entre deux faces. */
  function toText(tracks) {
    return groupBySide(tracks)
      .map((g) => g.tracks.map((t) => (t.side ? t.side + '. ' : '') + t.title).join('\n'))
      .join('\n\n');
  }

  /* Relit le champ « Titres ». Accepte « A1. Titre », « A1 Titre », « 1. Titre »,
     « Titre », et les lignes d'en-tête « Face A » / « Side B » tapées à la main. */
  function fromText(text) {
    const out = [];
    let side = '';
    const count = {};
    for (const rawLine of String(text || '').split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const r = readLine(line);
      if (r.header && !r.rest) { side = r.header; continue; }
      let letter = '', n = null, title = line;
      const m = line.match(/^([A-Ha-h])?\s?(\d{1,2})\s*[.)\-–:]\s*(.+)$/) || line.match(/^([A-Ha-h])(\d{1,2})\s+(.+)$/);
      if (m) { letter = (m[1] || '').toUpperCase(); n = +m[2]; title = m[3].trim(); }
      letter = letter || side;
      const k = letter || '_';
      count[k] = n ?? (count[k] || 0) + 1;
      out.push({ side: letter ? letter + count[k] : (n != null ? String(n) : ''), title });
    }
    return out;
  }

  /* ------------------------------------------------ navigateur : Tesseract */

  /* Photo → canvas noir sur blanc pour Tesseract. `crop` est une zone en fractions
     de l'image ; on part de la photo d'origine, pas de la version réduite envoyée
     au serveur : les petits caractères en dépendent.

     Avec `flatten`, le fond est aplani : chaque pixel est comparé à la moyenne de
     son voisinage, et seul l'écart (l'encre) est gardé. Un dégradé, un reflet ou
     une ombre portée ne font donc plus disparaître la moitié du texte, comme le
     fait un simple réglage de contraste global. Les très gros caractères, plus
     épais que le voisinage, s'évident : on ne s'en sert que pour le verso. */
  async function prepare(file, { crop = null, maxSide = 2600, flatten = false } = {}) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(c.x * bmp.width), sy = Math.round(c.y * bmp.height);
    const sw = Math.max(1, Math.round(c.w * bmp.width)), sh = Math.max(1, Math.round(c.h * bmp.height));
    const long = Math.max(sw, sh);
    const scale = long > maxSide ? maxSide / long : Math.min(2, Math.max(1, 2200 / long));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    bmp.close?.();

    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++)
      gray[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;

    if (flatten) flattenInk(gray, w, h); else stretch(gray);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) d[i] = d[i + 1] = d[i + 2] = gray[p];
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* Contraste étiré sur toute l'image, inversé si le fond est sombre. */
  function stretch(g) {
    const hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < g.length; i++) { hist[g[i]]++; sum += g[i]; }
    const px = g.length, mean = sum / px;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > px * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > px * 0.02) { hi = v; break; } }
    const span = Math.max(1, hi - lo), dark = mean < 120;
    for (let i = 0; i < g.length; i++) {
      let v = ((g[i] - lo) / span) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      g[i] = dark ? 255 - v : v;
    }
  }

  /* Fond aplani, en place : g devient « blanc − encre ».

     Aucune hypothèse sur le sens du texte : clair sur sombre ou sombre sur clair,
     c'est l'écart au fond qui compte, pas son signe. Une pochette peut donc mêler
     les deux (cartouche blanc sur fond noir) sans qu'une moitié disparaisse.

       1. fond approché = moyenne locale ;
       2. tout ce qui s'en écarte nettement est de l'encre : on recalcule le fond
          sans elle, sinon le papier autour des lettres sortirait gris ;
       3. encre = écart à ce fond propre, étiré jusqu'au noir. */
  function flattenInk(g, w, h) {
    const K = 8, sw = Math.ceil(w / K), sh = Math.ceil(h / K), n = sw * sh;
    const r = Math.max(4, Math.round(Math.max(sw, sh) / 28));          // voisinage ≈ 1/14 du côté

    const sum = new Float32Array(n), cnt = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const row = (y / K | 0) * sw, o = y * w;
      for (let x = 0; x < w; x++) { const q = row + (x / K | 0); sum[q] += g[o + x]; cnt[q]++; }
    }
    const mean = new Float32Array(n);
    for (let i = 0; i < n; i++) mean[i] = sum[i] / (cnt[i] || 1);
    const bg1 = boxBlur(boxBlur(mean, sw, sh, r), sw, sh, r);

    /* Écart maximal par case, puis élargi aux cases voisines : c'est l'échelle
       locale du contraste du texte. */
    const peak = new Float32Array(n);
    const line = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      lerpRow(bg1, sw, sh, K, y, w, line);
      const row = (y / K | 0) * sw, o = y * w;
      for (let x = 0; x < w; x++) {
        let dv = g[o + x] - line[x]; if (dv < 0) dv = -dv;
        const q = row + (x / K | 0);
        if (dv > peak[q]) peak[q] = dv;
      }
    }
    const scale = maxFilter(peak, sw, sh, 3);

    /* Fond recalculé sur le papier seul. */
    const pSum = new Float32Array(n), pCnt = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      lerpRow(bg1, sw, sh, K, y, w, line);
      const row = (y / K | 0) * sw, o = y * w;
      for (let x = 0; x < w; x++) {
        const v = g[o + x];
        let dv = v - line[x]; if (dv < 0) dv = -dv;
        const q = row + (x / K | 0);
        if (dv <= 14 || dv <= 0.5 * scale[q]) { pSum[q] += v; pCnt[q]++; }
      }
    }
    const bs = boxBlur(boxBlur(pSum, sw, sh, r), sw, sh, r);
    const bc = boxBlur(boxBlur(pCnt, sw, sh, r), sw, sh, r);
    const bg2 = new Float32Array(n);
    for (let i = 0; i < n; i++) bg2[i] = bc[i] > 0.5 ? bs[i] / bc[i] : bg1[i];

    /* Encre, puis étirement : les 0,4 % de pixels les plus encrés donnent le noir. */
    const hist = new Uint32Array(256);
    for (let y = 0; y < h; y++) {
      lerpRow(bg2, sw, sh, K, y, w, line);
      const o = y * w;
      for (let x = 0; x < w; x++) {
        let dv = g[o + x] - line[x]; if (dv < 0) dv = -dv;
        if (dv > 255) dv = 255;
        g[o + x] = dv; hist[dv | 0]++;
      }
    }
    let acc = 0, top = 255;
    const total = w * h;
    for (let v = 255; v > 0; v--) { acc += hist[v]; if (acc > total * 0.004) { top = v; break; } }
    const gain = 255 / Math.max(30, top * 0.85);
    for (let p = 0; p < total; p++) {
      const v = 255 - g[p] * gain;
      g[p] = v < 0 ? 0 : v;
    }
  }

  /* Ligne y d'une carte basse résolution, interpolée à la pleine largeur. */
  function lerpRow(map, sw, sh, K, y, w, out) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / K - 0.5));
    const y0 = fy | 0, ay = fy - y0, r0 = y0 * sw, r1 = Math.min(sh - 1, y0 + 1) * sw;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / K - 0.5));
      const x0 = fx | 0, ax = fx - x0, x1 = Math.min(sw - 1, x0 + 1);
      out[x] = (map[r0 + x0] * (1 - ax) + map[r0 + x1] * ax) * (1 - ay)
        + (map[r1 + x0] * (1 - ax) + map[r1 + x1] * ax) * ay;
    }
  }

  function maxFilter(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[y * w + k] > m) m = src[y * w + k];
      tmp[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x];
      out[y * w + x] = m;
    }
    return out;
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      let sum = 0, n = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { sum += src[y * w + x]; n++; }
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / n;
        const add = x + r + 1, del = x - r;
        if (add < w) { sum += src[y * w + add]; n++; }
        if (del >= 0) { sum -= src[y * w + del]; n--; }
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { sum += tmp[y * w + x]; n++; }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / n;
        const add = y + r + 1, del = y - r;
        if (add < h) { sum += tmp[add * w + x]; n++; }
        if (del >= 0) { sum -= tmp[del * w + x]; n--; }
      }
    }
    return out;
  }

  /* Le lecteur de pochettes pèse près d'un mégaoctet : il ne se télécharge
     qu'au moment où l'on demande vraiment une lecture. */
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let loading = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = TESSERACT_URL;
        tag.onload = resolve;
        tag.onerror = () => {
          loading = null;
          reject(new Error("Le lecteur de pochettes n'a pas pu être chargé. Vérifiez votre connexion."));
        };
        document.head.appendChild(tag);
      });
    }
    return loading;
  }

  /* Lit une photo et renvoie la page : { w, h, lines: [{ text, conf, x0…, words }] }. */
  async function ocr(file, { crop = null, onProgress = () => {}, psm = '11', maxSide = 2600, flatten = false } = {}) {
    await loadTesseract();
    const source = await prepare(file, { crop, maxSide, flatten });
    const worker = await root.Tesseract.createWorker(['fra', 'eng'], 1, {
      logger: (m) => m.status === 'recognizing text' && onProgress(Math.round(m.progress * 100))
    });
    try {
      await worker.setParameters({
        user_defined_dpi: '300', preserve_interword_spaces: '1', tessedit_pageseg_mode: psm
      });
      const { data } = await worker.recognize(source, {}, { text: true, blocks: true });
      const lines = [];
      const box = (b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
      (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
        const words = (l.words || []).map((w) => ({ text: w.text, conf: w.confidence ?? 100, ...box(w.bbox) }));
        if (words.length) lines.push({ text: String(l.text).trim(), conf: l.confidence ?? 100, ...box(l.bbox), words });
      })));
      return { w: source.width, h: source.height, lines };
    } finally { await worker.terminate(); }
  }

  root.Reader = {
    toSegments, toColumns, readLine, cleanTitle, titleCase, looksLikeTitle, readTracks,
    guessTitle, guessYear, guessLabel, overlap, fold, sameTitle, bestMatch, borrowSides,
    splitSide, groupBySide, toText, fromText,
    prepare, ocr
  };
})(typeof window !== 'undefined' ? window : globalThis);
