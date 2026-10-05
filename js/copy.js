/* Campus Connect — textes de l'app.
 * Marissa : tu peux modifier tout ce qui est entre guillemets.
 * Garde les guillemets et la virgule en fin de ligne, c'est tout.
 * Chargé en premier (avant data.js).
 */
window.CC = window.CC || {};

CC.copy = {
  appName: 'Campus Connect',
  tagline: 'Joue, apprends, transmets.',

  /* Page Bienvenue */
  welcomeTitle: 'Trouve avec qui jouer, apprendre ou créer.',
  welcomeText: "Sur le campus, tu croises des centaines de personnes sans savoir ce qu'elles aiment faire. Ici, tu le sais, et tu peux les retrouver dès cette semaine.",
  welcomePoints: [
    'Tu dis ce que tu aimes, ce que tu veux apprendre et ce que tu sais transmettre.',
    "L'app te montre avec qui ça colle, et pourquoi.",
    'Tu rejoins une activité sur le campus, ou tu lances la tienne.'
  ],

  /* Inscription */
  onboardingIntro: 'Trois étapes, deux minutes. Tu pourras tout modifier ensuite.',
  privacyLine: "Version démo : tes infos restent sur cet appareil, rien n'est envoyé. En V2, on ne gardera que le nécessaire et tu pourras supprimer ton profil.",
  /* Mode live (SPEC §9) : les infos partent dans la base partagée et s'affichent sur l'écran projeté. */
  privacyLineLive: "Démo en direct : ton prénom, ta filière, ta bio et tes passions sont visibles par la classe, y compris sur l'écran projeté. Décoche la case au-dessus pour rester discret·e. Tout est effacé après la démo.",
  madSkills: 'Mes Mad Skills',

  /* Page Impact */
  impactIntro: "Inscrits, activités, rencontres : ce qui se passe grâce à l'app. Les chiffres bougent à chaque inscription, participation ou prise de contact.",
  impactDisclaimer: 'Données de démonstration',
  /* Mode live : que des vraies personnes, tout compte. */
  impactDisclaimerLive: "En direct : chaque inscription, participation et prise de contact s'ajoute ici.",

  /* Bouton « Contacter » : message pré-rempli.
   * passionLabel peut être un libellé (« Piano ») ou un id (« piano »), ou vide. */
  contactTemplate: function (fromName, toName, passionLabel) {
    var hello = 'Salut ' + toName + ' ! Moi, c\'est ' + fromName + '. ';
    var end = 'Tu serais dispo cette semaine ?';
    if (!passionLabel) {
      return hello + 'J\'ai vu ton profil sur Campus Connect et je me suis dit qu\'on pourrait se rencontrer. ' + end;
    }
    var subject = passionLabel;
    var list = (window.CC && CC.data && CC.data.passions) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].label === passionLabel || list[i].id === passionLabel) {
        subject = list[i].withArticle;
        break;
      }
    }
    return hello + 'J\'ai vu ton profil sur Campus Connect, ça me dirait qu\'on se retrouve pour ' + subject + '. ' + end;
  },
  contactSent: 'Demande envoyée ✓',
  contactV2: 'La messagerie complète arrive en V2.',

  /* Quand une liste est vide */
  emptyStates: {
    activities: "Rien de prévu pour l'instant. Lance la première activité de la semaine.",
    forYou: "Rien qui colle à tes passions cette semaine. Tu peux créer l'activité qui manque.",
    category: "Rien dans cette catégorie pour l'instant.",
    affinities: 'Ajoute des passions ou ce que tu veux apprendre, on te proposera des gens.',
    /* Mode live, personne encore en affinité (début de démo). {cat} = ta catégorie préférée. */
    affinitiesLiveTitle: 'Tes affinités arrivent',
    affinitiesLive: 'Personne ne partage encore tes passions, mais ça change à chaque inscription. En attendant, voilà ce qui se passe côté {cat}.',
    affinitiesLiveNone: "Personne ne partage encore tes passions, mais ça change à chaque inscription. Rien n'est prévu côté {cat} pour l'instant : lance la première activité.",
    search: 'Personne ne correspond. Essaie un autre mot ou une autre catégorie.',
    canTeachMe: 'Personne ne transmet encore ce que tu veux apprendre. Ça peut changer avec les prochains inscrits.',
    myActivities: "Tu ne participes à aucune activité pour l'instant.",
    organized: "Pas encore d'activité organisée.",
    teach: "Rien pour l'instant.",
    learn: "Rien pour l'instant.",
    topActivities: "Pas encore d'activité avec des participants."
  },

  /* Mode live, début de démo : aucune activité, peu d'inscrits. {cat} = une catégorie (« ⚽ Sport »). */
  emptyLive: {
    weekTitle: "Rien de prévu pour l'instant",
    week: "La semaine est encore vide. Lance la première activité : un foot, un café, une révision, ce que tu veux. Tout le campus la verra en direct.",
    allTitle: "Aucune activité pour l'instant",
    all: "Lance la première : elle s'affichera ici, chez tout le monde, et sur l'écran du campus.",
    catTitle: "Rien côté {cat} pour l'instant",
    cat: 'Lance la première activité de cette catégorie, les autres pourront la rejoindre.',
    forYouTitle: "Rien pour toi pour l'instant",
    forYou: "Personne n'a encore lancé d'activité autour de tes passions. Lance la tienne : ceux qui les partagent la verront avec le badge « Pour toi ».",
    forYouNear: 'Rien qui colle pile à tes passions. Côté {cat}, il y a déjà ça :',
    peopleTitle: "Pour l'instant, il n'y a que toi ici",
    people: "Les profils arrivent en direct dès que la classe scanne le QR code. En attendant, lance une activité : c'est ce qui fait venir du monde.",
    chatsTitle: 'Pas encore de discussion',
    chats: "Chaque activité a sa discussion pour s'organiser : où, quand, qui ramène quoi. Lance la première, la discussion s'ouvre avec ceux qui viennent.",
    myActs: "Tu ne participes à aucune activité pour l'instant. Personne n'en a encore lancé : à toi de jouer.",
    topTitle: 'Les premières activités arrivent…',
    top: "Le top se remplit dès qu'une activité est lancée.",
    graphAlone: "Pour l'instant, il n'y a que toi. Chaque nouvel inscrit apparaît ici en direct.",
    wallTop: 'Les premières activités arrivent…',
    wallTopSub: "Lance la tienne depuis l'app : elle s'affiche ici.",
    wallScan: 'Scanne pour apparaître ici',
    adminFeed: "Rien pour l'instant. Montre le QR code : chaque arrivée s'affiche ici."
  },

  footer: 'Projet étudiant IDRAC · démo'
};
