# Campus Connect — l'app de démo

Trouve avec qui jouer, apprendre ou créer sur le campus.
Projet étudiant IDRAC. Tout tourne dans le navigateur : pas de compte, pas de serveur, pas d'internet.

## Lancer l'app

1. Ouvre le dossier `app/`.
2. Double-clique sur `index.html`. L'app s'ouvre dans ton navigateur par défaut.
   Pour la démo, prends **Chrome** : c'est là qu'on a tout testé. Safari devrait marcher, mais on ne l'a pas essayé.
3. Passe Chrome en plein écran (`Ctrl + Cmd + F` sur Mac).

Ce que tu crées dans l'app (profil, participations, activités) reste sur cet ordinateur, dans ce navigateur.
Si le navigateur bloque le stockage (navigation privée très stricte, par exemple), l'app marche quand même,
mais rien n'est gardé quand tu fermes l'onglet. Un message te le dit au démarrage.

## Avant de passer devant le jury

- Remets la démo à zéro : **5 clics rapides sur le logo** (en moins de 3 secondes), puis « Remettre à zéro ».
  Tu reviens sur l'écran de Bienvenue, avec les données de départ.
- Les dates des activités sont recalculées à ce moment-là : elles tombent toujours dans les 7 jours qui viennent.
  Fais donc le reset le jour même, juste avant de passer.
- Ferme les autres onglets de l'app (un double-clic sur `index.html` en ouvre un nouveau à chaque fois).
- Vérifie que « Réduire les animations » est désactivé : Réglages Système > Accessibilité > Affichage.
  S'il est activé, l'app coupe presque tous les mouvements.
- Coupe les notifications du Mac (mode Ne pas déranger).

## Le scénario de démo, pas à pas (3 minutes)

1. **Bienvenue.** Le réseau du campus bouge en fond. Clique sur « Créer mon profil ».
2. **Étape 1 « D'abord, toi ».** Tape le prénom de Marissa, ou **double-clique sur le titre** de l'étape :
   tout se remplit (Marissa, Bachelor 2, sa bio). Clique sur « Continuer ».
3. **Étape 2 « Ce que tu aimes ».** Clique sur Guitare, Écriture, Lecture et règle les niveaux, ou double-clique
   sur le titre. « Continuer ».
4. **Étape 3 « Apprendre, transmettre ».** Je transmets : Guitare + Écriture. J'apprends : Piano.
   Ou double-clique sur le titre. Clique sur « Créer mon profil ».
5. **La révélation.** Écran « On a trouvé tes personnes 👀 » : Marissa au centre, puis Chris, Lucas et Sarah
   arrivent un par un avec la raison (« Chris peut t'apprendre le piano »). C'est le moment fort : laisse
   l'animation se finir, puis clique sur « C'est parti ».
6. **Accueil.** « Salut Marissa 👋 ». Juste en dessous, dans « Cette semaine », la jam de vendredi est en premier
   avec le badge « Pour toi » et la mention « Chris et Lucas y vont ». Plus bas, « Tes affinités » : Chris, Lucas, Sarah.
7. **La jam.** Clique sur la carte « Jam session — Piano & Guitare » (4/8), puis sur « Participer » :
   confettis, le compteur défile de 4 à 5, la jauge se remplit, l'avatar de Marissa rejoint les participants.
8. **Créer.** Clique sur le bouton « + » (ou « Créer une activité » dans la barre de gauche).
   **Double-clique sur le titre « Créer une activité »** : le formulaire se remplit avec
   « Écrire une chanson en groupe », mercredi 17h, Médiathèque, 6 places, tous niveaux.
   L'aperçu de la carte se met à jour à droite. Clique sur « Publier l'activité ».
9. **Impact.** Onglet « Impact » : les chiffres défilent, les pastilles vertes montrent ce qui a bougé depuis
   l'inscription de Marissa (inscrits +1, activités +1, participations +2, échanges de talents possibles +6).
   En dessous, le réseau du campus se déplie dès qu'il est à l'écran : Marissa (« Toi ») est au centre et
   pulse. Passe la souris sur un point pour voir le prénom (sur téléphone, touche-le).

Si tu as le temps : ouvre le profil de Chris (depuis l'Accueil), clique sur « Contacter », puis
« Envoyer la demande » : « Demande envoyée ✓ », et le compteur de connexions prend +1. En revenant sur
Impact, le lien entre Marissa et Chris s'allume dans le réseau.

## Raccourcis cachés (à ne pas montrer)

| Geste | Effet |
|---|---|
| 5 clics rapides sur le logo (moins de 3 s), depuis n'importe quel écran | Demande confirmation, puis remet la démo à zéro et revient sur Bienvenue |
| Double-clic sur le titre d'une étape d'inscription | Remplit cette étape avec le profil de Marissa |
| Double-clic sur le titre « Créer une activité » | Pré-remplit « Écrire une chanson en groupe », mercredi 17h, Médiathèque, 6 places |

Le double-clic marche aussi dans « Modifier mon profil ».

## Modifier les textes et les données

Ouvre les fichiers avec n'importe quel éditeur de texte (TextEdit en mode texte brut, VS Code…), enregistre,
puis recharge la page (`Cmd + R`).

### `js/copy.js` : les textes de l'app

L'accroche, le texte de Bienvenue, les 3 points forts, la phrase sur les données personnelles, le texte de la
page Impact, le message pré-rempli de « Contacter », les messages quand une liste est vide.
Change seulement ce qui est **entre guillemets** et garde la virgule en fin de ligne.
Attention aux apostrophes : dans un texte entre `'…'`, écris `\'` ; dans un texte entre `"…"`, écris `'` normalement.

### `js/data.js` : les données de démonstration

Catégories, passions, personnes, activités, connexions, lieux et filières. Chaque bloc est commenté.
- Une personne : `teach` (Je transmets, 3 maximum) doit faire partie de ses `passions` ; `learn` (J'apprends) 3 maximum.
- Une activité : `when: { weekday: 5, time: '17:30' }` veut dire vendredi 17h30 (1 = lundi … 7 = dimanche).
  L'organisateur doit être dans `participants`, et il ne faut pas plus de participants que `max`.
- `demo.marissa` et `demo.songActivity` servent aux raccourcis de double-clic.

**Important :** l'app copie ces données au premier lancement, puis travaille sur sa copie enregistrée.
Après une modification de `data.js`, fais un **reset** (5 clics sur le logo) pour voir le changement.
Si la page reste blanche après une modification, il manque sans doute une virgule ou un guillemet :
annule ta dernière modification.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page. Charge les scripts dans l'ordre : copy, data, store, fx, app |
| `css/styles.css` | Tout le style et les animations d'interface |
| `js/copy.js` | Les textes modifiables |
| `js/data.js` | Les données de démonstration |
| `js/store.js` | L'état de l'app, l'enregistrement, le calcul des affinités et des chiffres d'Impact |
| `js/fx.js` | Les grands moments animés : réseau de Bienvenue, révélation, confettis, compteurs, réseau du campus |
| `js/app.js` | Les écrans, la navigation et les clics |

Si `fx.js` manque ou plante, l'app marche quand même : la révélation s'affiche dans une fenêtre plus simple,
les compteurs restent animés, et le réseau du campus est masqué.

## Bon à savoir

- Le calcul des affinités : +3 si l'autre transmet ce que tu veux apprendre, +2 si tu transmets ce qu'il veut
  apprendre, +1 par passion en commun. On affiche les raisons en clair, jamais de pourcentage.
- « Pour toi » sur une activité : sa passion fait partie de tes passions ou de ce que tu veux apprendre.
- Les chiffres de la page Impact sont calculés en direct à partir des données de démonstration.
- Si ton ordinateur est réglé sur « Réduire les animations », l'app coupe la plupart des mouvements.
  Pour les forcer quand même pendant la démo : dans la console de Chrome, `localStorage.cc_fx_motion = 'full'`,
  puis recharge la page (supprime la clé pour revenir au réglage du Mac).
