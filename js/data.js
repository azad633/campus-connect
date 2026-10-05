/* Campus Connect — données de démonstration (seed).
 * Script classique : pas d'import, pas de module. Chargé après copy.js, avant store.js.
 * Ces données sont copiées dans l'état au premier lancement (et après un reset).
 * Ensuite, seul l'état enregistré dans le navigateur compte.
 *
 * Équipe projet (Mad Skills confirmées) :
 *   Chris = piano · Armani = foot · Ewan = bricolage + sports de combat
 *   Marissa = guitare + écriture (pas dans le seed : elle s'inscrit pendant la démo).
 * Tous les autres profils sont fictifs.
 */
window.CC = window.CC || {};

CC.data = {

  /* 8 catégories, liste fermée.
   * color : couleur franche (barres, pastilles, bordures).
   * tint  : fond doux pour les chips (texte foncé #1A1730 dessus). */
  categories: [
    { id: 'sport',    label: 'Sport',                      emoji: '⚽', color: '#22A06B', tint: '#E3F5EC' },
    { id: 'musique',  label: 'Musique',                    emoji: '🎵', color: '#9B59D0', tint: '#F1E8FA' },
    { id: 'arts',     label: 'Arts & création',            emoji: '🎨', color: '#E5539A', tint: '#FCE6F0' },
    { id: 'ecriture', label: 'Écriture & lecture',         emoji: '✍️', color: '#C98A0B', tint: '#FBF0D9' },
    { id: 'langues',  label: 'Langues & voyage',           emoji: '🌍', color: '#1C9FD6', tint: '#E0F2FA' },
    { id: 'tech',     label: 'Tech & IA',                  emoji: '💻', color: '#3B6FE0', tint: '#E4ECFC' },
    { id: 'business', label: 'Business & entrepreneuriat', emoji: '💼', color: '#0F9E94', tint: '#DEF3F1' },
    { id: 'jeux',     label: 'Jeux & loisirs',             emoji: '🎮', color: '#E8743B', tint: '#FDEBDF' }
  ],

  /* Passions. withArticle sert à écrire des phrases naturelles :
   * « Chris peut t'apprendre le piano », « Tu peux lui apprendre la guitare ». */
  passions: [
    // Sport
    { id: 'foot',          label: 'Foot',             emoji: '⚽', cat: 'sport', withArticle: 'le foot' },
    { id: 'basket',        label: 'Basket',           emoji: '🏀', cat: 'sport', withArticle: 'le basket' },
    { id: 'running',       label: 'Running',          emoji: '🏃', cat: 'sport', withArticle: 'le running' },
    { id: 'musculation',   label: 'Muscu',            emoji: '🏋️', cat: 'sport', withArticle: 'la muscu' },
    { id: 'sports-combat', label: 'Sports de combat', emoji: '🥊', cat: 'sport', withArticle: 'les sports de combat' },
    { id: 'escalade',      label: 'Escalade',         emoji: '🧗', cat: 'sport', withArticle: "l'escalade" },
    // Musique
    { id: 'guitare',             label: 'Guitare',       emoji: '🎸', cat: 'musique', withArticle: 'la guitare' },
    { id: 'piano',               label: 'Piano',         emoji: '🎹', cat: 'musique', withArticle: 'le piano' },
    { id: 'chant',               label: 'Chant',         emoji: '🎤', cat: 'musique', withArticle: 'le chant' },
    { id: 'batterie',            label: 'Batterie',      emoji: '🥁', cat: 'musique', withArticle: 'la batterie' },
    { id: 'production-musicale', label: 'Prod musicale', emoji: '🎧', cat: 'musique', withArticle: 'la prod musicale' },
    // Arts & création
    { id: 'bricolage',     label: 'Bricolage & DIY', emoji: '🔨', cat: 'arts', withArticle: 'le bricolage' },
    { id: 'dessin',        label: 'Dessin',          emoji: '✏️', cat: 'arts', withArticle: 'le dessin' },
    { id: 'photo',         label: 'Photo',           emoji: '📷', cat: 'arts', withArticle: 'la photo' },
    { id: 'montage-video', label: 'Montage vidéo',   emoji: '🎬', cat: 'arts', withArticle: 'le montage vidéo' },
    { id: 'theatre',       label: 'Théâtre',         emoji: '🎭', cat: 'arts', withArticle: 'le théâtre' },
    { id: 'danse',         label: 'Danse',           emoji: '💃', cat: 'arts', withArticle: 'la danse' },
    // Écriture & lecture
    { id: 'ecriture',    label: 'Écriture',      emoji: '✍️', cat: 'ecriture', withArticle: "l'écriture" },
    { id: 'lecture',     label: 'Lecture',       emoji: '📚', cat: 'ecriture', withArticle: 'la lecture' },
    { id: 'slam',        label: 'Slam & poésie', emoji: '🎙️', cat: 'ecriture', withArticle: 'le slam' },
    { id: 'bd-manga',    label: 'BD & mangas',   emoji: '📖', cat: 'ecriture', withArticle: 'la BD' },
    { id: 'journalisme', label: 'Journalisme',   emoji: '📰', cat: 'ecriture', withArticle: 'le journalisme' },
    // Langues & voyage
    { id: 'anglais',  label: 'Anglais',  emoji: '🇬🇧', cat: 'langues', withArticle: "l'anglais" },
    { id: 'espagnol', label: 'Espagnol', emoji: '🇪🇸', cat: 'langues', withArticle: "l'espagnol" },
    { id: 'italien',  label: 'Italien',  emoji: '🇮🇹', cat: 'langues', withArticle: "l'italien" },
    { id: 'japonais', label: 'Japonais', emoji: '🇯🇵', cat: 'langues', withArticle: 'le japonais' },
    { id: 'voyage',   label: 'Voyage',   emoji: '✈️', cat: 'langues', withArticle: 'le voyage' },
    // Tech & IA
    { id: 'ia',            label: 'IA',            emoji: '🤖', cat: 'tech', withArticle: "l'IA" },
    { id: 'code',          label: 'Code',          emoji: '💻', cat: 'tech', withArticle: 'le code' },
    { id: 'data',          label: 'Excel & data',  emoji: '📊', cat: 'tech', withArticle: 'Excel' },
    { id: 'cybersecurite', label: 'Cybersécurité', emoji: '🔐', cat: 'tech', withArticle: 'la cybersécurité' },
    { id: 'no-code',       label: 'No-code',       emoji: '🧩', cat: 'tech', withArticle: 'le no-code' },
    // Business & entrepreneuriat
    { id: 'entrepreneuriat', label: 'Entrepreneuriat', emoji: '🚀', cat: 'business', withArticle: "l'entrepreneuriat" },
    { id: 'reseaux-sociaux', label: 'Réseaux sociaux', emoji: '📱', cat: 'business', withArticle: 'les réseaux sociaux' },
    { id: 'bourse',          label: 'Bourse',          emoji: '📈', cat: 'business', withArticle: 'la bourse' },
    { id: 'prise-de-parole', label: 'Prise de parole', emoji: '🗣️', cat: 'business', withArticle: 'la prise de parole' },
    { id: 'evenementiel',    label: 'Événementiel',    emoji: '🎉', cat: 'business', withArticle: "l'événementiel" },
    // Jeux & loisirs
    { id: 'jeux-video',      label: 'Jeux vidéo',      emoji: '🎮', cat: 'jeux', withArticle: 'les jeux vidéo' },
    { id: 'echecs',          label: 'Échecs',          emoji: '♟️', cat: 'jeux', withArticle: 'les échecs' },
    { id: 'jeux-de-societe', label: 'Jeux de société', emoji: '🎲', cat: 'jeux', withArticle: 'les jeux de société' },
    { id: 'cuisine',         label: 'Cuisine',         emoji: '🍳', cat: 'jeux', withArticle: 'la cuisine' },
    { id: 'cinema',          label: 'Cinéma & séries', emoji: '🍿', cat: 'jeux', withArticle: 'le cinéma' }
  ],

  /* Niveau d'une passion : 1 Débutant · 2 Intermédiaire · 3 Confirmé.
   * teach (« Je transmets » / « Mes Mad Skills ») : 3 max, pris dans ses passions.
   * learn (« J'apprends ») : 3 max, n'importe quelle passion. */
  people: [
    // ——— Équipe projet ———
    {
      id: 'chris', firstName: 'Chris', lastName: '', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'piano', level: 3 }, { id: 'cinema', level: 2 }, { id: 'guitare', level: 1 }],
      teach: ['piano'],
      learn: ['guitare'],
      bio: "Je joue du piano depuis des années, surtout seul chez moi. J'aimerais jouer avec d'autres, et un guitariste ou deux, ce serait parfait.",
      team: true, photo: null
    },
    {
      id: 'armani', firstName: 'Armani', lastName: '', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'foot', level: 3 }, { id: 'running', level: 2 }, { id: 'musculation', level: 2 }],
      teach: ['foot'],
      learn: ['espagnol'],
      bio: "Foot le jeudi au city stade. Il manque toujours deux ou trois joueurs, donc viens, même si tu n'as pas joué depuis le collège.",
      team: true, photo: null
    },
    {
      id: 'ewan', firstName: 'Ewan', lastName: '', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'sports-combat', level: 3 }, { id: 'bricolage', level: 3 }, { id: 'musculation', level: 2 }],
      teach: ['sports-combat', 'bricolage'],
      learn: ['prise-de-parole', 'cuisine'],
      bio: "Sports de combat plusieurs fois par semaine. Le reste du temps, je bricole : vélos, meubles récupérés, tout ce qui se démonte.",
      team: true, photo: null
    },

    // ——— Étudiants (fictifs) ———
    {
      id: 'lucas', firstName: 'Lucas', lastName: 'M.', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'guitare', level: 3 }, { id: 'chant', level: 2 }, { id: 'ecriture', level: 1 }],
      teach: ['guitare', 'chant'],
      learn: ['ecriture', 'production-musicale'],
      bio: "Guitare depuis le collège, surtout du folk. J'ai plein de mélodies dans mon téléphone, jamais les paroles qui vont avec.",
      team: false, photo: null
    },
    {
      id: 'sarah', firstName: 'Sarah', lastName: 'B.', role: 'etudiant', program: 'Bachelor 3',
      passions: [{ id: 'piano', level: 3 }, { id: 'danse', level: 2 }],
      teach: ['piano'],
      learn: ['espagnol', 'photo'],
      bio: "Dix ans de conservatoire, puis j'ai tout arrêté. Je m'y remets doucement. Je peux t'aider à démarrer au piano.",
      team: false, photo: null
    },
    {
      id: 'ines', firstName: 'Inès', lastName: 'K.', role: 'etudiant', program: 'Bachelor 1',
      passions: [{ id: 'running', level: 3 }, { id: 'espagnol', level: 3 }, { id: 'voyage', level: 2 }],
      teach: ['running', 'espagnol'],
      learn: ['photo', 'sports-combat'],
      bio: "Je cours tous les midis, souvent seule. Tu peux venir, je ne vais pas vite. Et je parle espagnol à la maison.",
      team: false, photo: null
    },
    {
      id: 'yanis', firstName: 'Yanis', lastName: 'B.', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'foot', level: 3 }, { id: 'musculation', level: 3 }, { id: 'jeux-video', level: 2 }],
      teach: ['musculation'],
      learn: ['anglais', 'sports-combat'],
      bio: "Foot le jeudi, muscu le reste de la semaine. Mon anglais est catastrophique et mon stage commence en janvier.",
      team: false, photo: null
    },
    {
      id: 'chloe', firstName: 'Chloé', lastName: 'D.', role: 'etudiant', program: 'Master 1',
      passions: [{ id: 'photo', level: 3 }, { id: 'voyage', level: 2 }, { id: 'cinema', level: 2 }],
      teach: ['photo'],
      learn: ['montage-video', 'bricolage'],
      bio: "Photo argentique et numérique. Je cherche des gens qui acceptent de poser, ou juste de marcher avec moi.",
      team: false, photo: null
    },
    {
      id: 'mehdi', firstName: 'Mehdi', lastName: 'A.', role: 'etudiant', program: 'Bachelor 3',
      passions: [{ id: 'entrepreneuriat', level: 3 }, { id: 'prise-de-parole', level: 2 }, { id: 'no-code', level: 1 }],
      teach: ['entrepreneuriat', 'prise-de-parole'],
      learn: ['code', 'ia'],
      bio: "On lance une marque de t-shirts à trois. Je peux t'aider sur un business plan. Moi, il me faut quelqu'un pour le site.",
      team: false, photo: null
    },
    {
      id: 'lea', firstName: 'Léa', lastName: 'P.', role: 'etudiant', program: 'Bachelor 1',
      passions: [{ id: 'lecture', level: 3 }, { id: 'ecriture', level: 2 }, { id: 'theatre', level: 1 }],
      teach: ['ecriture'],
      learn: ['theatre', 'anglais'],
      bio: "Je lis surtout des romans et j'écris des nouvelles que je ne montre à personne. Cette année, je tente le théâtre.",
      team: false, photo: null
    },
    {
      id: 'hugo', firstName: 'Hugo', lastName: 'L.', role: 'etudiant', program: 'Master 2',
      passions: [{ id: 'echecs', level: 3 }, { id: 'jeux-de-societe', level: 3 }, { id: 'cinema', level: 2 }],
      teach: ['echecs', 'jeux-de-societe'],
      learn: ['cuisine', 'bricolage'],
      bio: "Échecs en ligne le soir, jeux de société le week-end. Je ne laisse pas gagner, mais j'explique les règles.",
      team: false, photo: null
    },
    {
      id: 'camille', firstName: 'Camille', lastName: 'R.', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'chant', level: 3 }, { id: 'theatre', level: 3 }, { id: 'danse', level: 1 }],
      teach: ['chant', 'theatre'],
      learn: ['piano'],
      bio: "Chant et théâtre depuis le lycée. J'aimerais apprendre le piano pour pouvoir m'accompagner seule.",
      team: false, photo: null
    },
    {
      id: 'theo', firstName: 'Théo', lastName: 'G.', role: 'etudiant', program: 'Bachelor 3',
      passions: [{ id: 'jeux-video', level: 3 }, { id: 'montage-video', level: 3 }, { id: 'production-musicale', level: 2 }, { id: 'code', level: 1 }],
      teach: ['jeux-video', 'montage-video', 'production-musicale'],
      learn: ['code', 'ia'],
      bio: "J'organise les tournois au foyer et je monte des vidéos de jeu. Je veux comprendre comment marche l'IA, pas juste m'en servir.",
      team: false, photo: null
    },
    {
      id: 'nour', firstName: 'Nour', lastName: 'H.', role: 'etudiant', program: 'Bachelor 1',
      passions: [{ id: 'dessin', level: 3 }, { id: 'bd-manga', level: 3 }, { id: 'japonais', level: 1 }],
      teach: ['dessin'],
      learn: ['japonais', 'photo'],
      bio: "Je dessine un peu tout le temps, surtout du manga. J'apprends le japonais toute seule, lentement.",
      team: false, photo: null
    },
    {
      id: 'amadou', firstName: 'Amadou', lastName: 'D.', role: 'etudiant', program: 'Master 1',
      passions: [{ id: 'basket', level: 3 }, { id: 'reseaux-sociaux', level: 3 }, { id: 'evenementiel', level: 2 }],
      teach: ['basket', 'reseaux-sociaux'],
      learn: ['bourse'],
      bio: "Basket deux fois par semaine, et je gère les réseaux d'une asso. La bourse m'intrigue, je n'y connais rien.",
      team: false, photo: null
    },
    {
      id: 'emma', firstName: 'Emma', lastName: 'V.', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'anglais', level: 3 }, { id: 'voyage', level: 3 }, { id: 'running', level: 2 }],
      teach: ['anglais'],
      learn: ['italien', 'cuisine'],
      bio: "Un an à Dublin, l'anglais est resté. Je peux t'aider pour tes oraux. En échange, je cherche quelqu'un pour l'italien.",
      team: false, photo: null
    },
    {
      id: 'rayan', firstName: 'Rayan', lastName: 'T.', role: 'etudiant', program: 'Bachelor 1',
      passions: [{ id: 'escalade', level: 3 }, { id: 'code', level: 2 }, { id: 'cybersecurite', level: 1 }],
      teach: ['escalade'],
      learn: ['cybersecurite', 'anglais'],
      bio: "Escalade en salle le mardi soir, débutants bienvenus. Je code un peu, et la cybersécurité m'attire de plus en plus.",
      team: false, photo: null
    },
    {
      id: 'jade', firstName: 'Jade', lastName: 'F.', role: 'etudiant', program: 'Bachelor 3',
      passions: [{ id: 'cuisine', level: 3 }, { id: 'evenementiel', level: 3 }, { id: 'reseaux-sociaux', level: 2 }],
      teach: ['cuisine', 'evenementiel'],
      learn: ['guitare', 'prise-de-parole'],
      bio: "J'organise des soirées pour une asso et je cuisine pour décompresser. J'ai une guitare chez moi qui prend la poussière.",
      team: false, photo: null
    },
    {
      id: 'maxime', firstName: 'Maxime', lastName: 'C.', role: 'etudiant', program: 'Master 2',
      passions: [{ id: 'bourse', level: 3 }, { id: 'data', level: 3 }, { id: 'foot', level: 2 }],
      teach: ['bourse', 'data'],
      learn: ['espagnol'],
      bio: "En alternance en contrôle de gestion, Excel toute la journée. Je reprends l'espagnol à zéro, sois indulgent.",
      team: false, photo: null
    },
    {
      id: 'sofia', firstName: 'Sofia', lastName: 'N.', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'italien', level: 3 }, { id: 'danse', level: 3 }, { id: 'cinema', level: 1 }],
      teach: ['italien', 'danse'],
      learn: ['ecriture'],
      bio: "Je viens de Turin. Je te donne des cours d'italien volontiers. J'aimerais écrire mieux en français.",
      team: false, photo: null
    },
    {
      id: 'baptiste', firstName: 'Baptiste', lastName: 'J.', role: 'etudiant', program: 'Bachelor 3',
      passions: [{ id: 'batterie', level: 3 }, { id: 'foot', level: 2 }, { id: 'jeux-video', level: 1 }],
      teach: ['batterie'],
      learn: ['production-musicale'],
      bio: "Batteur dans un groupe de reprises. Je voudrais faire mes propres sons sur ordi. Le foot, c'est pour souffler.",
      team: false, photo: null
    },
    {
      id: 'kenza', firstName: 'Kenza', lastName: 'M.', role: 'etudiant', program: 'Master 1',
      passions: [{ id: 'journalisme', level: 3 }, { id: 'lecture', level: 2 }, { id: 'reseaux-sociaux', level: 1 }],
      teach: ['journalisme'],
      learn: ['montage-video', 'ia'],
      bio: "J'écris pour un média étudiant et je lis pas mal d'essais. Je veux apprendre le montage pour passer à la vidéo.",
      team: false, photo: null
    },
    {
      id: 'antoine', firstName: 'Antoine', lastName: 'S.', role: 'etudiant', program: 'Master 1',
      passions: [{ id: 'ia', level: 3 }, { id: 'no-code', level: 3 }, { id: 'code', level: 2 }],
      teach: ['ia', 'no-code'],
      learn: ['espagnol', 'escalade'],
      bio: "En alternance dans une start-up, je monte des petits outils avec l'IA tous les jours. Je te montre comment je fais, sans jargon.",
      team: false, photo: null
    },

    // ——— Profs (fictifs) — program = matière ———
    {
      id: 'elena', firstName: 'Elena', lastName: 'G.', role: 'prof', program: 'Espagnol',
      passions: [{ id: 'espagnol', level: 3 }, { id: 'cuisine', level: 2 }, { id: 'voyage', level: 2 }],
      teach: ['espagnol'],
      learn: ['photo'],
      bio: "Le jeudi midi, je fais parler espagnol à la cafét'. Ce n'est pas un cours : on se trompe, personne ne note.",
      team: false, photo: null
    },
    {
      id: 'karim', firstName: 'Karim', lastName: 'B.', role: 'prof', program: 'Entrepreneuriat',
      passions: [{ id: 'entrepreneuriat', level: 3 }, { id: 'prise-de-parole', level: 3 }, { id: 'running', level: 2 }],
      teach: ['entrepreneuriat', 'prise-de-parole'],
      learn: ['ia'],
      bio: "J'accompagne les projets étudiants. Si tu as une idée, même floue, viens m'en parler avant d'écrire un business plan.",
      team: false, photo: null
    },
    {
      id: 'nathalie', firstName: 'Nathalie', lastName: 'R.', role: 'prof', program: 'Marketing digital',
      passions: [{ id: 'reseaux-sociaux', level: 3 }, { id: 'lecture', level: 2 }, { id: 'photo', level: 1 }],
      teach: ['reseaux-sociaux'],
      learn: ['ia'],
      bio: "Je lis beaucoup, je photographie un peu, et j'essaie de comprendre ce que l'IA change à mon métier.",
      team: false, photo: null
    },
    {
      id: 'olivier', firstName: 'Olivier', lastName: 'T.', role: 'prof', program: 'Contrôle de gestion',
      passions: [{ id: 'data', level: 3 }, { id: 'echecs', level: 2 }, { id: 'piano', level: 1 }],
      teach: ['data', 'echecs'],
      learn: ['piano'],
      bio: "Excel n'a presque plus de secrets pour moi. Aux échecs, je suis moyen. Au piano, c'est pire, mais je m'accroche.",
      team: false, photo: null
    }
  ],

  /* Activités. when.weekday : 1 = lundi … 7 = dimanche.
   * Au premier lancement, when devient la prochaine date réelle de ce jour-là.
   * kind 'atelier' = animé par un prof. L'organisateur fait partie des participants. */
  activities: [
    {
      id: 'basket-3x3', title: 'Basket 3x3', emoji: '🏀', cat: 'sport', passion: 'basket', kind: 'activite',
      when: { weekday: 1, time: '12:30' }, place: 'City stade (5 min)', max: 6, level: 'confirme',
      description: "3x3 sur un demi-terrain, matchs de 10 minutes. Ça va assez vite, mieux vaut avoir déjà un peu joué.",
      organizerId: 'amadou', participants: ['amadou', 'yanis', 'rayan']
    },
    {
      id: 'initiation-combat', title: 'Initiation sports de combat', emoji: '🥊', cat: 'sport', passion: 'sports-combat', kind: 'activite',
      when: { weekday: 1, time: '18:30' }, place: 'City stade (5 min)', max: 10, level: 'debutant',
      description: "Garde, déplacements, coups sur pattes d'ours, sans combat entre nous. Prends une tenue de sport et de l'eau, j'apporte les gants.",
      organizerId: 'ewan', participants: ['ewan', 'yanis', 'ines', 'armani']
    },
    {
      id: 'running-midi', title: 'Running du midi', emoji: '🏃', cat: 'sport', passion: 'running', kind: 'activite',
      when: { weekday: 2, time: '12:30' }, place: 'Parc à côté du campus', max: 12, level: 'tous',
      description: "5 km à allure tranquille, on attend tout le monde. Départ devant l'entrée du parc, retour avant 13h30.",
      organizerId: 'ines', participants: ['ines', 'emma', 'karim']
    },
    {
      id: 'atelier-ia', title: "Atelier : crée ta première app avec l'IA", emoji: '🤖', cat: 'tech', passion: 'ia', kind: 'activite',
      when: { weekday: 2, time: '18:00' }, place: 'Salle B204', max: 15, level: 'debutant',
      description: "On construit une petite app avec un assistant IA, sans savoir coder. Viens avec ton ordi chargé et une idée, même vague.",
      organizerId: 'antoine', participants: ['antoine', 'mehdi', 'theo', 'kenza', 'nathalie', 'jade']
    },
    {
      id: 'club-lecture', title: 'Club lecture', emoji: '📚', cat: 'ecriture', passion: 'lecture', kind: 'activite',
      when: { weekday: 3, time: '12:30' }, place: 'Médiathèque', max: 10, level: 'tous',
      description: "Chacun présente en cinq minutes un livre qu'il a aimé, ou détesté. On repart avec des idées de lecture pour le mois.",
      organizerId: 'lea', participants: ['lea', 'kenza', 'nathalie']
    },
    {
      id: 'atelier-velo', title: 'Atelier bricolage : répare ton vélo', emoji: '🔨', cat: 'arts', passion: 'bricolage', kind: 'activite',
      when: { weekday: 3, time: '14:00' }, place: 'Parc à côté du campus', max: 8, level: 'tous',
      description: "Crevaison, freins qui frottent, chaîne qui saute : amène ton vélo, on le répare ensemble. J'apporte les outils et les rustines.",
      organizerId: 'ewan', participants: ['ewan', 'hugo', 'chloe']
    },
    {
      id: 'tournoi-mario-kart', title: 'Tournoi Mario Kart', emoji: '🎮', cat: 'jeux', passion: 'jeux-video', kind: 'activite',
      when: { weekday: 3, time: '18:30' }, place: 'Foyer BDE', max: 8, level: 'tous',
      description: "Tournoi en poules sur Switch, manettes fournies. Trois courses par manche, finale sur la Route Arc-en-ciel.",
      organizerId: 'theo', participants: ['theo', 'yanis', 'hugo', 'rayan', 'nour', 'baptiste', 'amadou', 'sofia']
    },
    {
      id: 'cafe-espagnol', title: 'Café conversation en espagnol', emoji: '🇪🇸', cat: 'langues', passion: 'espagnol', kind: 'atelier',
      when: { weekday: 4, time: '12:30' }, place: "Cafét'", max: 12, level: 'tous',
      description: "Une heure pour parler espagnol autour d'un café, sans notes ni copies à rendre. Débutants bienvenus, on s'adapte.",
      organizerId: 'elena', participants: ['elena', 'armani', 'sarah', 'maxime', 'ines']
    },
    {
      id: 'foot-5v5', title: 'Match de foot 5v5', emoji: '⚽', cat: 'sport', passion: 'foot', kind: 'activite',
      when: { weekday: 4, time: '18:00' }, place: 'City stade (5 min)', max: 10, level: 'tous',
      description: "Match amical, on fait les équipes sur place et on tourne aux cages. Prends des chaussures pour le synthétique et de l'eau.",
      organizerId: 'armani', participants: ['armani', 'yanis', 'baptiste', 'amadou', 'maxime', 'rayan', 'theo']
    },
    {
      id: 'pitch-projets', title: 'Pitch ton projet en 2 minutes', emoji: '🚀', cat: 'business', passion: 'entrepreneuriat', kind: 'atelier',
      when: { weekday: 5, time: '12:30' }, place: 'Amphi A', max: 30, level: 'tous',
      description: "Tu présentes ton idée en deux minutes, la salle pose des questions. Si ton idée n'est pas finie, c'est justement le bon moment.",
      organizerId: 'karim', participants: ['karim', 'mehdi', 'jade', 'amadou', 'antoine']
    },
    {
      id: 'jam-piano-guitare', title: 'Jam session — Piano & Guitare', emoji: '🎹🎸', cat: 'musique', passion: 'guitare', kind: 'activite',
      when: { weekday: 5, time: '17:30' }, place: 'Foyer BDE', max: 8, level: 'tous',
      description: "Le piano du foyer, des guitares, et une voix si quelqu'un se lance. On choisit les morceaux sur place. Trois accords suffisent.",
      organizerId: 'chris', participants: ['chris', 'lucas', 'camille', 'baptiste']
    }
  ],

  /* Connexions déjà créées (demandes de contact acceptées). */
  connections: [
    ['chris', 'lucas'],
    ['chris', 'camille'],
    ['armani', 'yanis'],
    ['armani', 'maxime'],
    ['ewan', 'yanis'],
    ['ewan', 'hugo'],
    ['lucas', 'baptiste'],
    ['chloe', 'nour'],
    ['ines', 'emma'],
    ['jade', 'amadou'],
    ['mehdi', 'karim'],
    ['antoine', 'theo'],
    ['emma', 'sofia']
  ],

  /* Listes pour les formulaires. */
  places: ["Cafét'", 'Foyer BDE', 'Salle B204', 'Amphi A', 'City stade (5 min)', 'Parc à côté du campus', 'Médiathèque'],
  programs: ['Bachelor 1', 'Bachelor 2', 'Bachelor 3', 'Master 1', 'Master 2'],
  levels: { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Confirmé' },
  activityLevels: { tous: 'Tous niveaux', debutant: 'Débutant', confirme: 'Confirmé' },
  weekdays: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], // index 0 = weekday 1

  /* Raccourcis cachés de la démo (SPEC §7). */
  demo: {
    // Double-clic sur le titre d'une étape d'inscription.
    marissa: {
      firstName: 'Marissa', lastName: '', role: 'etudiant', program: 'Bachelor 2',
      passions: [{ id: 'guitare', level: 3 }, { id: 'ecriture', level: 3 }, { id: 'lecture', level: 2 }],
      teach: ['guitare', 'ecriture'],
      learn: ['piano'],
      bio: "Je joue de la guitare depuis plusieurs années et j'écris des textes. J'aimerais rencontrer des gens qui aiment la musique.",
      visible: true
    },
    // Double-clic sur le titre « Créer une activité ».
    songActivity: {
      title: 'Écrire une chanson en groupe', emoji: '✍️🎸', cat: 'ecriture', passion: 'ecriture', kind: 'activite',
      when: { weekday: 3, time: '17:00' }, place: 'Médiathèque', max: 6, level: 'tous',
      description: "On part d'une mélodie à la guitare et on écrit le texte ensemble. Pas besoin d'avoir déjà écrit."
    }
  }
};
