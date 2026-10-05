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
  madSkills: 'Mes Mad Skills',

  /* Page Impact */
  impactIntro: "Inscrits, activités, rencontres : ce qui se passe grâce à l'app. Les chiffres bougent à chaque inscription, participation ou prise de contact.",
  impactDisclaimer: 'Données de démonstration',

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
    search: 'Personne ne correspond. Essaie un autre mot ou une autre catégorie.',
    canTeachMe: 'Personne ne transmet encore ce que tu veux apprendre. Ça peut changer avec les prochains inscrits.',
    myActivities: "Tu ne participes à aucune activité pour l'instant.",
    organized: "Pas encore d'activité organisée.",
    teach: "Rien pour l'instant.",
    learn: "Rien pour l'instant.",
    topActivities: "Pas encore d'activité avec des participants."
  },

  footer: 'Projet étudiant IDRAC · démo'
};
