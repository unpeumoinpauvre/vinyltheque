/* Pages institutionnelles : à propos, mentions légales, confidentialité,
   conditions de vente.

   Elles sont écrites côté serveur, comme les guides, pour exister sans
   JavaScript. Les informations que je n'ai pas — adresse postale, numéro
   d'immatriculation, adresse de contact — sont marquées À COMPLÉTER plutôt
   qu'inventées : une mention légale fausse est pire qu'une mention absente. */

const TODO = (quoi) => `<mark class="todo">[à compléter : ${quoi}]</mark>`;

export const SOCIETE = 'Kollector, LLC';
export const CONTACT = TODO('adresse e-mail de contact');

export const PAGES = [
  {
    slug: 'a-propos',
    nav: 'À propos',
    title: 'À propos',
    description: "Qui édite Vinylthèque, pourquoi le service existe et comment il fonctionne.",
    indexable: true,
    sections: [
      {
        h: 'Pourquoi ce site',
        p: ["Passé une centaine de disques, on ne sait plus ce qu'on possède. On rachète un album "
          + "qu'on a déjà, on cherche pendant vingt minutes sur quelle face se trouve un morceau. "
          + 'Vinylthèque existe pour régler ces deux problèmes, sans transformer le catalogage en '
          + 'corvée de saisie.',
          "D'où le principe : vous photographiez le recto et le verso d'un disque, le texte de la "
          + "pochette est lu automatiquement, et les titres, l'artiste, l'année et le label se "
          + 'remplissent seuls. Vous corrigez ce qui a mal été lu, et c\'est tout.']
      },
      {
        h: 'Comment ça marche techniquement',
        p: ["La lecture des pochettes se fait dans votre navigateur, par reconnaissance de "
          + "caractères : les photos ne partent pas sur un service tiers d'analyse d'images. Les "
          + 'informations manquantes sont complétées à partir de MusicBrainz, la base de données '
          + 'musicale ouverte.',
          'Avant publication, chaque photo est recadrée sur la pochette et réencodée : toutes les '
          + "métadonnées du fichier d'origine, y compris la localisation et le modèle d'appareil, "
          + 'disparaissent au passage.']
      },
      {
        h: 'Qui est derrière',
        p: [`Vinylthèque est édité par ${SOCIETE}. Une question, une remarque, un bug ? Écrivez à `
          + `${CONTACT}.`]
      }
    ]
  },

  {
    slug: 'mentions-legales',
    nav: 'Mentions légales',
    title: 'Mentions légales',
    description: "Éditeur, hébergeur et informations légales du site Vinylthèque.",
    indexable: true,
    sections: [
      {
        h: 'Éditeur du site',
        p: [`Le site vinyltheque.com est édité par <strong>${SOCIETE}</strong>.`,
          `Siège social : ${TODO('adresse postale complète')}.`,
          `Immatriculation : ${TODO('numéro d\'immatriculation et État de constitution')}.`,
          `Directeur de la publication : ${TODO('nom du responsable de la publication')}.`,
          `Contact : ${CONTACT}.`]
      },
      {
        h: 'Hébergement',
        p: ["Le site est hébergé par Railway Corp., 80 Bogart Street, Brooklyn, NY 11206, "
          + "États-Unis. Le nom de domaine est enregistré auprès d'OVH SAS, 2 rue Kellermann, "
          + '59100 Roubaix, France, et la résolution DNS est assurée par Cloudflare, Inc.']
      },
      {
        h: 'Propriété intellectuelle',
        p: ["Les textes, l'interface et le code du site sont la propriété de son éditeur. Les "
          + 'photographies de pochettes envoyées par les utilisateurs restent la propriété de '
          + 'ceux-ci ; les pochettes elles-mêmes demeurent la propriété de leurs ayants droit '
          + 'respectifs, et leur reproduction ici relève de l\'usage privé du collectionneur.',
          'Les métadonnées musicales proviennent de MusicBrainz et sont utilisées selon les termes '
          + 'de cette base de données.']
      },
      {
        h: 'Signaler un contenu',
        p: [`Pour signaler un contenu qui porterait atteinte à vos droits, écrivez à ${CONTACT} en `
          + 'précisant l\'adresse de la page concernée et la nature du problème.']
      }
    ]
  },

  {
    slug: 'confidentialite',
    nav: 'Confidentialité',
    title: 'Politique de confidentialité',
    description: "Quelles données Vinylthèque collecte, pourquoi, combien de temps, et comment "
      + 'exercer vos droits.',
    indexable: true,
    sections: [
      {
        h: 'Ce que nous collectons',
        p: ['<strong>Votre compte</strong> : adresse e-mail, nom d\'utilisateur et mot de passe. '
          + 'Le mot de passe n\'est jamais stocké en clair, seulement sous forme d\'empreinte '
          + 'chiffrée (bcrypt) qui ne permet pas de le retrouver.',
          '<strong>Votre collection</strong> : les informations que vous saisissez sur vos disques '
          + '(titre, artiste, année, label, liste des pistes) et les photographies que vous '
          + 'envoyez. Les métadonnées des fichiers photo sont supprimées avant enregistrement.',
          '<strong>Votre abonnement</strong>, le cas échéant : identifiant client et identifiant '
          + "d'abonnement fournis par Stripe, ainsi que la date de renouvellement. <strong>Aucune "
          + 'donnée bancaire ne transite par nos serveurs ni n\'y est stockée</strong> : le '
          + 'paiement se déroule entièrement sur les pages hébergées par Stripe.',
          '<strong>La mesure d\'audience</strong> : nombre de visites et pages consultées, via une '
          + 'instance Umami que nous hébergeons nous-mêmes. Umami ne dépose aucun cookie et ne '
          + 'construit aucun profil individuel — c\'est pourquoi ce site n\'affiche pas de bandeau '
          + 'de consentement.']
      },
      {
        h: 'Qui y a accès',
        p: ["Votre collection n'est consultable que depuis votre compte. Aucun autre utilisateur, "
          + "aucun moteur de recherche n'y a accès. Seule exception : les six derniers disques "
          + 'ajoutés au site apparaissent sur la page d\'accueil, sans jamais indiquer à qui ils '
          + 'appartiennent.',
          'Nous ne vendons ni ne louons aucune donnée. Les seuls tiers qui en traitent une partie '
          + "sont ceux qui font fonctionner le service : Railway (hébergement), Stripe (paiement), "
          + 'Resend (envoi des e-mails de compte) et Cloudflare (résolution DNS).']
      },
      {
        h: 'Combien de temps',
        p: ['Vos données sont conservées tant que votre compte existe. À la suppression du compte, '
          + 'la collection et les photographies sont effacées. Les pièces comptables liées à un '
          + 'abonnement sont conservées le temps imposé par les obligations comptables '
          + 'applicables.']
      },
      {
        h: 'Vos droits',
        p: ["Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et "
          + "d'opposition sur vos données. La plupart s'exercent directement depuis votre compte : "
          + 'vous pouvez modifier ou supprimer chaque disque et fermer votre compte.',
          `Pour toute autre demande, écrivez à ${CONTACT}. Si la réponse ne vous satisfait pas, `
          + 'vous pouvez saisir l\'autorité de protection des données de votre pays de résidence — '
          + 'en France, la CNIL.']
      }
    ]
  },

  {
    slug: 'conditions',
    nav: 'Conditions',
    title: 'Conditions générales de vente et d\'utilisation',
    description: "Les règles d'utilisation de Vinylthèque, les tarifs de l'abonnement Pro, la "
      + 'résiliation et le droit de rétractation.',
    indexable: true,
    sections: [
      {
        h: 'Objet',
        p: [`Les présentes conditions régissent l'utilisation du site vinyltheque.com, édité par `
          + `${SOCIETE}. Créer un compte vaut acceptation de ces conditions.`]
      },
      {
        h: 'Le service',
        p: ["Vinylthèque permet de cataloguer une collection de disques vinyles à partir de "
          + 'photographies. La reconnaissance automatique des textes de pochette est une aide à la '
          + 'saisie : elle comporte des erreurs, et il vous appartient de vérifier les '
          + 'informations enregistrées.',
          'Le service est fourni en l\'état. Nous nous efforçons d\'en assurer la continuité sans '
          + 'garantir une disponibilité ininterrompue.']
      },
      {
        h: 'Offres et tarifs',
        p: ['L\'offre gratuite permet de cataloguer jusqu\'à FREE_LIMIT disques, sans limite de '
          + 'durée et sans moyen de paiement.',
          "Au-delà, l'abonnement <strong>Vinylthèque Pro</strong> supprime cette limite. Il coûte "
          + '<strong>5 € par mois</strong> ou <strong>50 € par an</strong>, toutes taxes '
          + 'éventuelles comprises. L\'abonnement annuel revient à deux mois offerts par rapport '
          + 'au mensuel.',
          "Le paiement est traité par Stripe. L'abonnement se renouvelle automatiquement à échéance "
          + 'jusqu\'à résiliation.']
      },
      {
        h: 'Résiliation',
        p: ['Vous pouvez résilier à tout moment depuis votre espace abonnement, en un clic. La '
          + "résiliation prend effet à la fin de la période déjà payée : vous conservez l'accès "
          + 'jusque-là, et aucun nouveau prélèvement n\'a lieu.',
          'Après résiliation, votre collection reste accessible. Si elle dépasse la limite '
          + 'gratuite, vous ne pouvez plus ajouter de disque, mais rien n\'est supprimé.']
      },
      {
        h: 'Droit de rétractation',
        p: ["Conformément au droit de la consommation applicable aux contrats conclus à distance, "
          + 'un consommateur résidant dans l\'Union européenne dispose d\'un délai de quatorze '
          + 'jours pour se rétracter. En souscrivant, vous demandez l\'exécution immédiate du '
          + 'service ; la rétractation reste possible dans ce délai, le montant éventuellement dû '
          + 'étant alors calculé au prorata de la période utilisée.',
          `Pour exercer ce droit, écrivez à ${CONTACT}.`]
      },
      {
        h: 'Vos contenus',
        p: ['Vous restez propriétaire des photographies et des informations que vous enregistrez. '
          + 'Vous nous accordez uniquement le droit technique de les stocker et de vous les '
          + 'afficher.',
          "Vous vous engagez à n'envoyer que des photographies que vous avez prises ou dont vous "
          + 'avez le droit de disposer, et à ne pas utiliser le service à des fins illicites.']
      },
      {
        h: 'Droit applicable',
        p: [`Les présentes conditions sont soumises au droit ${TODO('droit applicable et juridiction compétente')}. `
          + "Un consommateur conserve en tout état de cause le bénéfice des dispositions "
          + 'impératives de son pays de résidence.']
      }
    ]
  }
];

export const pageBySlug = (slug) => PAGES.find((p) => p.slug === slug);
