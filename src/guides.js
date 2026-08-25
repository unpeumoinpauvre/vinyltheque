/* Contenu éditorial de la rubrique Guides.

   Le site public ne compte que deux pages depuis que les collections sont
   privées : ces articles lui donnent des pages à indexer qui répondent à ce
   que cherchent réellement les collectionneurs, sans exposer la moindre
   donnée d'utilisateur. Le texte vit ici, dans le dépôt, et non en base :
   il se relit et se corrige comme du code. */

export const GUIDES = [
  {
    slug: 'cataloguer-sa-collection-de-vinyles',
    title: 'Comment cataloguer sa collection de vinyles',
    description: "Une méthode simple pour recenser ses disques sans y passer ses week-ends : "
      + 'par où commencer, quoi noter, et comment ne plus racheter deux fois le même album.',
    updated: '2026-08-25',
    lede: "Passé une centaine de disques, la mémoire ne suffit plus. On rachète un album qu'on "
      + "possède déjà, on cherche vingt minutes une face B dont on ne sait plus sur quel disque "
      + "elle se trouve. Cataloguer sa collection règle ces deux problèmes — à condition de ne "
      + 'pas se lancer dans un chantier qu\'on abandonnera au troisième bac.',
    sections: [
      {
        h: 'Commencer par ce que vous écoutez, pas par le début',
        p: ["L'erreur classique est de vouloir tout saisir dans l'ordre, en partant du premier "
          + 'bac. Au bout de cinquante disques, la corvée l\'emporte et le catalogue reste à moitié '
          + 'vide — donc inutilisable, puisqu\'on ne sait jamais si l\'absence d\'un titre signifie '
          + 'qu\'on ne l\'a pas ou qu\'on ne l\'a pas encore saisi.',
          'Prenez le problème à l\'envers : commencez par les disques que vous sortez le plus '
          + 'souvent, puis par les achats récents, et saisissez chaque nouvelle acquisition le jour '
          + 'où elle entre chez vous. Le reste se rattrape par petites sessions. Un catalogue '
          + 'partiel mais à jour sur ce qui compte vaut mieux qu\'un catalogue exhaustif abandonné.']
      },
      {
        h: 'Les cinq informations qui servent vraiment',
        p: ['Un catalogue trop détaillé décourage la saisie. En pratique, cinq champs suffisent à '
          + 'répondre à toutes les questions du quotidien :',
          "Le titre de l'album et l'artiste, évidemment. L'année, pour distinguer les rééditions "
          + "des pressages d'origine. Le label, qui identifie souvent l'édition à lui seul. Et "
          + 'surtout la liste des titres, face par face : c\'est elle qui permet de retrouver un '
          + 'morceau dont on a oublié sur quel disque il figure.',
          'Tout le reste — état de la pochette, prix d\'achat, lieu d\'acquisition — n\'a de sens '
          + 'que si vous revendez ou assurez votre collection. Ajoutez ces champs plus tard, si le '
          + 'besoin apparaît.']
      },
      {
        h: 'Photographier plutôt que recopier',
        p: ['Recopier à la main une liste de seize titres, c\'est quatre minutes par disque et une '
          + 'faute de frappe garantie. Photographier le recto et le verso prend dix secondes, et le '
          + "verso contient presque toujours la liste complète des morceaux.",
          "C'est le principe de Vinylthèque : vous prenez les deux photos, le texte de la pochette "
          + "est lu automatiquement et les titres, l'artiste, l'année et le label se remplissent "
          + 'seuls. Vous n\'avez plus qu\'à corriger ce que la lecture a mal interprété — en général '
          + 'une ligne ou deux sur une pochette chargée.']
      },
      {
        h: 'Ranger le catalogue, pas seulement les disques',
        p: ['Un catalogue ne sert que si l\'on peut y chercher. Vérifiez que le vôtre répond aux '
          + 'trois questions qui reviennent sans cesse : est-ce que je possède déjà cet album ? '
          + 'sur quel disque se trouve ce morceau ? qu\'est-ce que j\'ai de ce label ou de cette '
          + 'décennie ?',
          "Si votre outil répond aux trois, l'ordre physique des bacs devient secondaire : rangez "
          + 'par artiste, par label ou par humeur, vous retrouverez de toute façon.']
      }
    ]
  },

  {
    slug: 'reconnaitre-un-premier-pressage',
    title: 'Reconnaître un premier pressage',
    description: 'Label, numéro de catalogue, code-barres, gravures dans le sillon : les indices '
      + "qui distinguent une édition d'origine d'une réédition, et leurs limites.",
    updated: '2026-08-25',
    lede: "Un premier pressage et une réédition peuvent se ressembler à s'y méprendre dans un bac. "
      + "L'écart de valeur, lui, va parfois de un à dix. Voici les indices à vérifier, du plus "
      + 'accessible au plus technique — et ce qu\'ils ne prouvent pas.',
    sections: [
      {
        h: 'Le code-barres : le tri le plus rapide',
        p: ["Les codes-barres n'apparaissent sur les pochettes qu'à partir du milieu des années "
          + '1980. Un album des années 1960 ou 1970 dont la pochette porte un code-barres est donc '
          + "une réédition, sans discussion possible. C'est le contrôle le plus rapide, et il "
          + 'élimine une grande partie des candidats en quelques secondes.',
          "L'inverse n'est pas vrai : l'absence de code-barres ne garantit rien, beaucoup de "
          + "rééditions anciennes n'en portent pas."]
      },
      {
        h: 'Le label et son graphisme',
        p: ['Les maisons de disques ont changé la pastille centrale au fil des décennies : couleur, '
          + 'typographie, position du logo, mentions légales en périphérie. Ces changements sont '
          + "datés et documentés par les collectionneurs, label par label.",
          'Un pressage Blue Note, Vertigo ou Harvest se date ainsi avec une bonne précision, à '
          + "condition de comparer avec une référence fiable plutôt qu'avec un souvenir."]
      },
      {
        h: 'Les gravures dans le sillon de sortie',
        p: ["Entre la fin du dernier morceau et l'étiquette centrale se trouve une zone lisse : le "
          + 'sillon de sortie, ou <i>deadwax</i>. On y trouve des numéros de matrice gravés ou '
          + "estampés, qui identifient la laque et le stamper ayant servi au pressage.",
          'Ces numéros sont souvent le seul moyen de distinguer deux tirages visuellement '
          + 'identiques. On y trouve aussi parfois la signature de l\'ingénieur de gravure — les '
          + "initiales d'un graveur réputé suffisent à faire monter la cote d'une édition.",
          'Le sujet mérite son propre guide : voyez « Lire les gravures du sillon de sortie ».']
      },
      {
        h: 'Les mentions administratives',
        p: ["Le pays de fabrication, l'adresse de la maison de disques, la mention de droits, la "
          + "présence ou non d'un numéro de dépôt légal : autant de détails qui changent d'une "
          + "édition à l'autre et qu'une réédition reproduit rarement à l'identique.",
          'Une pochette imprimée dans un pays différent de celui du label d\'origine indique '
          + 'presque toujours une édition locale, ni première ni nécessairement moins bonne — les '
          + 'pressages japonais des années 1970, par exemple, sont souvent supérieurs à l\'original.']
      },
      {
        h: 'Ce que « premier pressage » ne veut pas dire',
        p: ["Premier ne signifie ni meilleur son, ni meilleur état. Une première édition écoutée "
          + 'mille fois sur une platine mal réglée sonnera moins bien qu\'une réédition soignée. La '
          + "rareté fait le prix, pas la qualité d'écoute.",
          'Achetez d\'abord pour écouter. La chasse au premier pressage est un plaisir en soi, mais '
          + 'c\'est un autre plaisir.']
      }
    ]
  },

  {
    slug: 'lire-les-gravures-du-sillon',
    title: 'Lire les gravures du sillon de sortie',
    description: "Numéros de matrice, codes de stamper, signatures de graveurs : comment déchiffrer "
      + 'ce qui est inscrit entre le dernier morceau et l\'étiquette.',
    updated: '2026-08-25',
    lede: 'Inclinez un disque sous une lampe et regardez la zone lisse qui précède l\'étiquette : '
      + 'des caractères y sont gravés à la main ou estampés à la machine. Ils racontent la '
      + 'fabrication du disque que vous tenez, et permettent souvent de le dater à l\'année près.',
    sections: [
      {
        h: 'Où regarder, et comment',
        p: ['La zone concernée s\'appelle le sillon de sortie, ou <i>deadwax</i> en anglais : '
          + "l'espace lisse entre la fin de la musique et l'étiquette centrale. Les inscriptions y "
          + 'sont peu profondes et souvent minuscules.',
          'Une lumière rasante et une inclinaison du disque suffisent la plupart du temps ; une '
          + 'loupe aide pour les gravures fines. Notez ce que vous lisez face A et face B '
          + 'séparément, elles diffèrent presque toujours.']
      },
      {
        h: 'Le numéro de matrice',
        p: ["C'est l'inscription principale : un code qui identifie la laque d'origine, donc la "
          + "session de gravure. Il reprend souvent le numéro de catalogue de l'album, suivi d'un "
          + 'suffixe indiquant la face et la version de la gravure.',
          "Deux exemplaires portant des matrices différentes viennent de gravures différentes, même "
          + "si les pochettes sont identiques. C'est ce qui permet de distinguer un tirage d'origine "
          + "d'un retirage ultérieur."]
      },
      {
        h: 'Les codes de stamper',
        p: ['Certains labels ajoutent des repères correspondant aux étapes de la chaîne de '
          + 'fabrication — mère, stamper — parfois codés en lettres plutôt qu\'en chiffres. Ils '
          + 'indiquent à quelle place dans le tirage se situe votre exemplaire.',
          'Ces systèmes sont propres à chaque maison de disques et à chaque usine : il faut une '
          + "table de correspondance pour les interpréter, il n'existe pas de règle universelle."]
      },
      {
        h: 'Les signatures de graveurs',
        p: ["Les ingénieurs de gravure signent parfois leur travail dans le sillon de sortie : des "
          + "initiales, un prénom, le nom du studio. Certaines de ces signatures sont recherchées "
          + "par les collectionneurs, qui associent à un graveur donné une certaine façon de faire "
          + 'sonner un disque.',
          'Une mention manuscrite plutôt qu\'estampée indique généralement une gravure ancienne, '
          + 'faite à l\'outil sur la laque.']
      },
      {
        h: 'Noter ce qu\'on lit',
        p: ['Ces codes ne servent que si on les retrouve. Recopiez-les dans les notes de votre '
          + "catalogue, face par face, dès l'achat : c'est au moment de vendre, d'assurer ou de "
          + 'comparer deux exemplaires qu\'on regrette de ne pas l\'avoir fait.']
      }
    ]
  },

  {
    slug: 'nettoyer-un-disque-vinyle',
    title: 'Nettoyer un disque vinyle sans l\'abîmer',
    description: 'Ce qui décrasse vraiment un sillon, ce qui ne sert à rien, et ce qui endommage le '
      + 'disque de façon irréversible.',
    updated: '2026-08-25',
    lede: 'Les craquements ne viennent pas toujours de rayures : le plus souvent, c\'est de la '
      + 'poussière et des résidus au fond du sillon. Un nettoyage correct fait disparaître une '
      + 'bonne partie du bruit de fond. Un mauvais nettoyage, lui, marque le disque pour de bon.',
    sections: [
      {
        h: 'Avant chaque écoute : la brosse',
        p: ['Une brosse antistatique en fibres de carbone, passée sur le disque en rotation avant '
          + 'la lecture, retire la poussière déposée en surface. C\'est le geste le plus rentable : '
          + 'trois secondes, et il évite que la pointe de lecture n\'enfonce les particules dans le '
          + 'sillon.',
          'Brossez dans le sens du sillon, jamais en travers.']
      },
      {
        h: 'Le nettoyage humide',
        p: ["Pour un disque d'occasion ou visiblement encrassé, il faut un liquide. De l'eau "
          + 'distillée — pas de l\'eau du robinet, dont le calcaire se dépose dans le sillon — avec '
          + 'quelques gouttes d\'un produit prévu pour les disques, appliquée avec un chiffon en '
          + 'microfibre propre, toujours dans le sens du sillon.',
          'Séchez ensuite complètement, sur un support propre, avant de remettre le disque dans sa '
          + 'pochette. Un disque rangé humide développe des traces et des moisissures.']
      },
      {
        h: 'Ce qu\'il ne faut pas faire',
        p: ['Pas de produit ménager, pas de liquide vaisselle, pas de lingettes : les tensioactifs '
          + 'et les parfums laissent un film qui craque à la lecture.',
          "Pas de mouvement circulaire en travers du sillon, qui crée des micro-rayures visibles en "
          + 'lumière rasante. Pas d\'alcool sur les disques anciens en gomme-laque, les fameux 78 '
          + 'tours : il dissout la matière. Sur un vinyle moderne, l\'alcool isopropylique très '
          + 'dilué se discute, mais dans le doute abstenez-vous : le risque est pour vous, le '
          + 'bénéfice est marginal.',
          "Et ne nettoyez pas l'étiquette centrale, qui est en papier."]
      },
      {
        h: 'Les pochettes intérieures',
        p: ['Nettoyer un disque pour le glisser dans une pochette papier d\'origine poussiéreuse '
          + 'n\'a pas de sens. Remplacez les pochettes intérieures en papier par des pochettes '
          + 'antistatiques doublées, et conservez l\'originale à plat dans la pochette extérieure '
          + "si elle a une valeur — la plupart des pochettes intérieures imprimées en ont une."]
      }
    ]
  },

  {
    slug: 'ranger-et-conserver-ses-vinyles',
    title: 'Ranger et conserver ses vinyles',
    description: 'Position, température, humidité, protections : les conditions qui font qu\'une '
      + 'collection traverse trente ans sans se déformer.',
    updated: '2026-08-25',
    lede: "Un vinyle est une galette de plastique souple prise entre deux cartons. Ce qui l'abîme "
      + "sur la durée n'est presque jamais l'écoute : c'est la façon dont il passe les vingt-trois "
      + 'heures restantes.',
    sections: [
      {
        h: 'À la verticale, toujours',
        p: ['Un disque stocké à plat, sous le poids de ceux du dessus, se voile lentement et de '
          + "façon irréversible. Rangez toujours à la verticale, bien droit : une pile inclinée "
          + 'produit le même effet en plus lent.',
          "Serrez modérément — assez pour que les disques se tiennent, pas au point de forcer pour "
          + "en extraire un. Des séparateurs tous les vingt à trente disques évitent l'affaissement "
          + 'en bout de rangée.']
      },
      {
        h: 'Température et humidité',
        p: ['Le vinyle se déforme à la chaleur : un disque laissé derrière une vitre ou près d\'un '
          + 'radiateur peut se voiler en une après-midi. Visez une pièce tempérée et stable, à '
          + "l'écart du soleil direct.",
          "L'humidité, elle, s'attaque aux pochettes : moisissures, taches, décollement des "
          + 'coutures. Une cave humide ou un grenier non isolé sont les deux pires endroits d\'un '
          + 'logement pour une collection.']
      },
      {
        h: 'Les protections qui servent',
        p: ['Des pochettes extérieures transparentes protègent le carton du frottement et de la '
          + 'poussière ; ce sont elles qui préservent la valeur d\'une édition rare.',
          'Des pochettes intérieures antistatiques doublées remplacent avantageusement le papier '
          + 'd\'origine, qui raye à force de va-et-vient.',
          "Enfin, retirez le film plastique d'emballage des disques neufs que vous comptez garder : "
          + "en se rétractant avec le temps, il déforme la pochette."]
      },
      {
        h: 'Savoir ce qu\'on a',
        p: ["La meilleure conservation ne remplace pas un inventaire. En cas de dégât des eaux, de "
          + "vol ou d'incendie, un assureur demande une liste — et une liste faite après coup, de "
          + 'mémoire, oublie toujours les disques les plus anciens.',
          'Photographier chaque pochette au moment où elle entre dans la collection règle la '
          + 'question une fois pour toutes.']
      }
    ]
  }
,

  {
    slug: 'assurer-sa-collection-de-vinyles',
    title: 'Assurer sa collection de vinyles',
    description: "Ce que demande un assureur en cas de sinistre, comment constituer l'inventaire "
      + 'qui fera foi, et les erreurs qui font refuser une indemnisation.',
    updated: '2026-08-25',
    lede: "Dégât des eaux, incendie, cambriolage : le jour où ça arrive, l'assureur ne demande pas "
      + "combien vous estimez votre collection, il demande de quoi elle était faite. Et une liste "
      + 'reconstituée de mémoire après le sinistre ne vaut pas grand-chose.',
    sections: [
      {
        h: 'Le problème du plafond',
        p: ["Une collection de disques n'est presque jamais couverte comme telle par un contrat "
          + "d'assurance habitation standard. Elle tombe dans le mobilier ordinaire, souvent avec "
          + 'un plafond global et parfois une limite par objet. Trois cents disques à trente euros '
          + 'pièce dépassent vite ce que le contrat prévoit sans le dire.',
          'La plupart des contrats prévoient une catégorie « objets de valeur » ou « collections », '
          + 'soumise à déclaration au-delà d\'un certain montant. Lisez la vôtre : c\'est le seul '
          + 'document qui compte, et il diffère d\'un assureur à l\'autre.']
      },
      {
        h: 'Ce qui fait preuve, ce qui ne fait pas preuve',
        p: ['Un assureur indemnise ce que vous pouvez démontrer avoir possédé. En pratique, il '
          + 'accepte des factures d\'achat, des photographies datées, une estimation faite par un '
          + 'professionnel, et un inventaire tenu avant le sinistre.',
          "Ce qui ne suffit pas : une liste tapée après coup, un souvenir approximatif, une capture "
          + "d'écran d'un site de cotation sans lien avec vos exemplaires. Un disque n'a de valeur "
          + 'que par son pressage et son état — c\'est votre exemplaire qu\'il faut documenter, pas '
          + 'l\'album en général.']
      },
      {
        h: 'L\'inventaire qui tient',
        p: ["Pour chaque disque, quatre éléments suffisent : une photo du recto, une photo du "
          + 'verso, les informations d\'identification (titre, artiste, année, label) et, pour les '
          + 'pièces qui comptent, les gravures du sillon de sortie qui identifient le pressage '
          + 'exact.',
          "L'essentiel est que l'inventaire soit <strong>antérieur</strong> au sinistre et "
          + "<strong>hors des murs</strong>. Un classeur papier rangé à côté des bacs brûle avec "
          + 'eux ; un fichier sur l\'ordinateur du salon disparaît avec l\'ordinateur. Un '
          + 'inventaire en ligne, lui, survit à la maison.']
      },
      {
        h: 'Le tenir sans y passer ses soirées',
        p: ['Personne ne photographie trois cents pochettes en une fois. La méthode qui fonctionne '
          + 'est celle des guides précédents : commencez par les pièces qui ont le plus de valeur, '
          + 'puis saisissez chaque nouvelle acquisition le jour où elle entre chez vous.',
          "C'est précisément ce que fait Vinylthèque : deux photos, et les informations "
          + "d'identification se remplissent seules. Votre collection reste privée — elle n'est "
          + 'consultable que depuis votre compte — mais elle existe ailleurs que chez vous.']
      },
      {
        h: 'Une précaution',
        p: ["Je ne suis pas courtier en assurance et ce guide ne remplace pas la lecture de votre "
          + 'contrat. Avant de vous croire couvert, appelez votre assureur, demandez le plafond '
          + 'applicable aux collections et ce qu\'il exige comme justificatif. La réponse tient en '
          + 'cinq minutes et évite une très mauvaise surprise.']
      }
    ]
  },

  {
    slug: 'estimer-la-valeur-d-un-vinyle',
    title: 'Estimer la valeur d\'un disque vinyle',
    description: 'Pourquoi deux exemplaires du même album valent dix fois moins l\'un que l\'autre, '
      + 'et comment lire une cote sans se tromper de disque.',
    updated: '2026-08-25',
    lede: "La question « combien vaut cet album ? » n'a pas de réponse. La bonne question est "
      + '« combien vaut <em>cet exemplaire</em> ? » — et l\'écart entre les deux se compte souvent '
      + 'en centaines d\'euros.',
    sections: [
      {
        h: 'Trois facteurs, dans cet ordre',
        p: ['<strong>Le pressage</strong> d\'abord. Une édition d\'origine et une réédition des '
          + 'années 2010 portent le même titre, la même pochette, parfois le même numéro de '
          + 'catalogue — et pas du tout le même prix. Tant que vous n\'avez pas identifié votre '
          + 'pressage, toute estimation est une loterie.',
          "<strong>L'état</strong> ensuite, celui du disque et celui de la pochette, notés "
          + "séparément. Le barème employé par les collectionneurs va de Mint (neuf, jamais joué) à "
          + 'Poor. Entre un exemplaire Near Mint et le même en Very Good, le prix peut être divisé '
          + 'par trois.',
          '<strong>La rareté réelle</strong> enfin, qui n\'est pas la rareté ressentie. Un album '
          + 'culte tiré à des millions d\'exemplaires ne vaut presque rien ; un disque oublié tiré '
          + 'à cinq cents peut valoir cher.']
      },
      {
        h: 'Identifier le pressage avant de chercher un prix',
        p: ["C'est l'étape que tout le monde saute, et c'est celle qui détermine le résultat. "
          + 'Vérifiez la présence d\'un code-barres, le graphisme de l\'étiquette centrale, le pays '
          + 'de fabrication, et surtout les numéros de matrice gravés dans le sillon de sortie.',
          'Nos deux guides détaillent la méthode : « Reconnaître un premier pressage » et « Lire '
          + 'les gravures du sillon de sortie ».']
      },
      {
        h: 'Lire une cote correctement',
        p: ['Les bases de données de collectionneurs affichent des fourchettes de prix constatés. '
          + "Deux pièges : on regarde le prix <strong>demandé</strong> par des vendeurs plutôt que "
          + 'le prix <strong>réellement payé</strong>, et on compare son exemplaire à une autre '
          + 'édition.',
          'Fiez-vous aux ventes conclues, sur une période récente, et pour un état comparable au '
          + 'vôtre. Une seule vente exceptionnelle ne fait pas un prix de marché.']
      },
      {
        h: 'Ce qui fait chuter un prix',
        p: ["Une pochette écrite au stylo, un autocollant de disquaire arraché en emportant le "
          + 'carton, un disque voilé, un insert manquant — encart, poster, feuillet de paroles. '
          + 'Beaucoup d\'acheteurs considèrent qu\'un exemplaire incomplet n\'est plus le même '
          + 'objet.',
          'À l\'inverse, un exemplaire scellé d\'origine se vend plus cher — mais la question de '
          + 'son authenticité se pose, le rescellage existe.']
      },
      {
        h: 'Quand faire estimer par un professionnel',
        p: ["Pour un disque isolé, une base de collectionneurs suffit. Pour une collection entière, "
          + "pour une succession ou pour une déclaration d'assurance, une estimation écrite par un "
          + 'disquaire spécialisé ou un commissaire-priseur a une valeur que votre propre calcul '
          + "n'aura jamais.",
          'Dans les deux cas, l\'inventaire photographié est le point de départ : sans lui, '
          + "personne ne peut estimer quoi que ce soit à distance."]
      }
    ]
  },

  {
    slug: 'vendre-une-collection-heritee',
    title: 'Vendre une collection de vinyles héritée',
    description: 'Vous récupérez les disques d\'un parent et vous ne connaissez rien au vinyle : '
      + 'les étapes, dans l\'ordre, pour ne pas brader ce qui a de la valeur.',
    updated: '2026-08-25',
    lede: "On vous a laissé six cartons de disques. Vous n'y connaissez rien, un acheteur propose "
      + "de tout reprendre en bloc pour deux cents euros et de vous débarrasser. C'est souvent une "
      + 'très mauvaise affaire — et il y a une manière simple de le savoir avant de dire oui.',
    sections: [
      {
        h: 'Ne vendez pas en bloc avant d\'avoir regardé',
        p: ["L'achat au lot est le moyen le plus courant de faire une bonne affaire sur le dos de "
          + "quelqu'un qui ignore ce qu'il possède. Dans une collection de plusieurs centaines de "
          + 'disques, la valeur est presque toujours concentrée dans quelques dizaines d\'entre '
          + 'eux : le reste se vend au poids.',
          'Vous n\'avez pas besoin de devenir expert. Vous avez besoin de repérer les vingt ou '
          + 'trente disques qui portent la valeur.']
      },
      {
        h: 'Première passe : trier grossièrement',
        p: ["Mettez de côté ce qui sort de l'ordinaire : les pochettes ouvrantes, les coffrets, les "
          + 'disques avec encarts ou posters, les pressages étrangers, les albums que vous ne '
          + 'connaissez pas du tout — les valeurs se cachent plus souvent dans le jazz, le rock '
          + 'progressif, le funk rare ou les pressages japonais que dans les grands succès de '
          + 'variété que tout le monde possédait.',
          'Écartez sans état d\'âme les disques rayés, voilés ou aux pochettes détrempées : leur '
          + 'valeur marchande est proche de zéro quel que soit le titre.']
      },
      {
        h: 'Deuxième passe : documenter',
        p: ['Photographiez le recto et le verso de chaque disque mis de côté, et notez les '
          + 'gravures du sillon de sortie pour les plus prometteurs. C\'est ce dossier qui vous '
          + 'permettra de demander plusieurs avis sans transporter les cartons, et de comparer les '
          + 'offres sur la même base.',
          'Un inventaire photographié sert aussi en cas de succession partagée entre héritiers : '
          + 'il évite les discussions sur ce qui était dans les cartons.']
      },
      {
        h: 'Troisième passe : faire estimer, plusieurs fois',
        p: ['Demandez au moins trois avis : un disquaire spécialisé en occasion, une plateforme de '
          + 'vente entre collectionneurs, et si l\'ensemble paraît important, un '
          + 'commissaire-priseur. Les écarts entre ces trois canaux sont considérables.',
          'Vendre soi-même rapporte davantage mais demande du temps, un emballage sérieux et la '
          + 'gestion des litiges. Vendre en bloc à un professionnel rapporte moins mais règle tout '
          + "en une fois. Le bon choix dépend de ce que vous préférez dépenser : du temps ou de "
          + 'l\'argent.']
      },
      {
        h: 'Et si vous gardez',
        p: ["Rien ne vous oblige à vendre. Beaucoup de gens découvrent la collection d'un parent, "
          + "la cataloguent, et finissent par en garder une partie. Dans ce cas, l'inventaire que "
          + 'vous venez de constituer devient votre point de départ — et vous saurez au moins ce '
          + 'que vous avez décidé de garder.']
      }
    ]
  }
];

export const guideBySlug = (slug) => GUIDES.find((g) => g.slug === slug);
