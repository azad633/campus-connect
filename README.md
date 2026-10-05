# Campus Connect — l'app de démo

Trouve avec qui jouer, apprendre ou créer sur le campus.
Projet étudiant IDRAC. Tout tourne dans le navigateur, sans compte. Deux modes :
- **local** (clés vides dans `js/config.js`) : pas de serveur, pas d'internet, tout reste sur l'appareil ;
- **live** (clés Supabase remplies) : les inscriptions et les participations sont partagées en direct entre
  les téléphones de la classe et l'écran projeté. Voir « Mode live » plus bas.

## Lancer l'app

1. Ouvre le dossier `app/`.
2. Double-clique sur `index.html`. L'app s'ouvre dans ton navigateur par défaut.
   Pour la démo, prends **Chrome** : c'est là qu'on a tout testé. Safari devrait marcher, mais on ne l'a pas essayé.
3. Passe Chrome en plein écran (`Ctrl + Cmd + F` sur Mac).

En mode local, ce que tu crées dans l'app (profil, participations, activités) reste sur cet ordinateur, dans ce navigateur.
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
- **En mode live**, les 5 clics ne vident que le MacBook : ce que les autres ont créé reste dans la base partagée
  (la fenêtre de confirmation le dit). Après la **dernière répétition**, il faut donc vider la base, sinon la
  Marissa de la répétition apparaît une deuxième fois pendant la démo. Dans cet ordre :
  1. Supabase → **SQL Editor** → `select public.cc_reset();` → **Run** ;
  2. recharge le panel organisateur (`#/admin`, voir plus bas) ;
  3. sur le MacBook, les 5 clics sur le logo.
  Les téléphones déjà inscrits reviennent d'eux-mêmes à la Bienvenue (au plus tard une minute après, ou dès qu'on
  rouvre l'onglet). Le MacBook relié à Ewan reste Ewan : son profil repart tout seul dans la base.
  Détails et modération d'un profil : `../supabase/README.md`.

## Mode live (démo en classe)

- **Ewan est le seul compte au départ** (demande d'Ewan, 5 oct.) : l'app démarre avec son profil et **aucune
  activité**, ni conversation, ni connexion. Tout le reste vient des vrais inscrits, qui créent leur compte en
  scannant le QR code. Les personnes et activités de démo de `js/data.js` ne servent qu'au mode local (V1).
- Tant qu'il n'y a pas d'activité, chaque écran vide invite à « Créer la première activité » (accueil, Activités,
  Explorer, Discussions, Impact) ; le mur affiche Ewan au centre avec « Scanne pour apparaître ici ».
- Les compteurs (mur, panel, Impact) comptent tout le monde, Ewan compris : ils démarrent à « 1 inscrit ».
- À l'inscription, la ligne sur les données change : elle dit que le prénom, la filière, la bio et les passions
  sont visibles par la classe et sur l'écran projeté. Si quelqu'un décoche « Mon profil est visible par le campus »,
  il compte dans les chiffres, mais les autres ne voient son prénom ni sur le mur, ni dans les affinités, ni dans
  les annonces d'inscription ; dans les participants, il apparaît comme « Masqué ».
- Le texte du message « Contacter » reste sur le téléphone : il n'est jamais envoyé dans la base.
- L'écran projeté (le mur) n'a pas de lien dans l'app : il s'ouvre depuis le panel organisateur (section suivante).
- **Déploiement** : copie **tout** le dossier `app/` (par exemple `rsync -a --delete app/ <copie>/`), sinon le mode
  live échoue sans rien dire. Après la mise en ligne, vérifie que `js/config.js`, `js/sync.js` et
  `js/vendor/qrcode.js` répondent bien (pas d'erreur 404).

## Panel organisateur (pour Ewan)

Le mur projeté et le suivi en direct sont réservés à l'organisateur.

1. Sur le MacBook de démo, ouvre l'adresse de l'app suivie de `#/admin` (par exemple `…/campus-connect/#/admin`).
   Pas besoin d'être inscrit : ton profil existe déjà.
2. Tape le code organisateur. Il n'est écrit ni dans l'app ni ici : il est noté dans `DEVIR.md`, dans le dossier du
   projet (ce fichier n'est pas mis en ligne). Cet appareil garde ensuite l'accès : `#/admin` ouvre directement le panel.
3. Le panel montre :
   - **Continuer en tant qu'Ewan** (mode live) : le MacBook prend ton profil et l'accueil s'ouvre. Tu peux alors
     participer, écrire dans les discussions et créer des activités, comme tout le monde. Le panel affiche ensuite
     « Connecté en tant qu'Ewan », avec **Délier cet appareil** pour revenir à un appareil sans profil.
     Ton profil est fixe (le même partout) : il ne se modifie pas depuis l'app ;
   - **l'aperçu du mur**, c'est-à-dire ce que la classe verra ;
   - **Lancer la projection** : le mur passe en plein écran. **Échap** ramène au panel. Sur le mur, **Q** (ou un clic
     sur le QR code) affiche le QR code en géant, et **Q** le referme. Si la souris ne bouge pas pendant 3 secondes,
     le curseur et les boutons du mur disparaissent ;
   - **En direct** : qui s'inscrit, qui participe à quoi, les activités créées, les contacts et les messages du chat.
     Chaque message a un bouton **Masquer** : il disparaît aussitôt pour tout le monde (voir « Discussions » plus bas).
     Les filtres trient par type. Un profil masqué y reste anonyme, comme sur le mur, parce que le
     panel peut être projeté. Les vrais inscrits arrivés avant l'ouverture de la page sont listés sous « Déjà inscrits » ;
   - **les compteurs** (en live : tout le monde, toi compris ; en local : sans les profils de démo) et **l'état de la
     connexion** : LIVE, mode local ou hors ligne ;
   - **Simulation (répétition)**, **en mode local seulement** : de faux participants arrivent sur le mur pour répéter
     sans téléphones. Elle n'existe pas en mode live (aucun faux participant ne peut apparaître devant la classe).
4. **Quitter le mode organisateur** (en haut à droite) retire l'accès sur cet appareil : il faudra retaper le code.

Sans le code, `#/live` renvoie à l'accueil et `#/admin` demande le code. Cette protection ne marche que dans le
navigateur : elle évite que la classe tombe sur le mur ou sur le panel, mais le site et sa clé sont publics, donc ce
n'est pas une vraie sécurité. Les 5 clics sur le logo marchent aussi dans le panel : l'appareil repart de zéro et tu
restes sur le panel.

## Discussions (chat d'activité)

Chaque activité a sa discussion, pour s'organiser : où se retrouver, qui ramène quoi. Ce n'est pas une messagerie
générale : pas de messages privés, une discussion par activité.

- **Qui la voit** : seulement les participants (organisateur compris). Les autres voient, sur la page de l'activité,
  « Rejoins l'activité pour discuter avec le groupe ». Après « Participer », le bloc « Discussion du groupe » s'ouvre
  avec les derniers messages ; « Je ne viens plus » le referme.
- **L'écran de discussion** (`#/chat/…`) : bulles, prénom, heure, champ en bas. **Entrée** envoie. Sur téléphone, le
  champ reste collé au clavier. Une discussion vide propose des débuts de message (« On se retrouve où ? »…).
  300 caractères au plus par message.
- **Mes discussions** : l'icône bulle en haut à droite (téléphone) ou « Discussions » dans la barre de gauche.
  La pastille orange compte les messages non lus. Ce qui est lu est gardé sur l'appareil.
- **En direct** : un nouveau message arrive sans recharger ; ailleurs dans l'app, un petit toast le signale (seulement
  aux participants de cette activité).
- **Démo (mode local seulement)** : la jam, le verre au bar du jeudi et le pique-nique ont déjà quelques messages
  (données de démo, jamais envoyées dans la base). Marissa les voit dès qu'elle rejoint la jam. En mode live, aucune
  discussion au départ.
- **Modération** : dans le panel organisateur, « Masquer » à côté du message. Un message masqué ne peut pas être
  rétabli depuis l'app (seulement depuis le dashboard Supabase).
- Comme le reste de la démo, la base est ouverte en écriture : la restriction aux participants est faite par l'app,
  pas par la base. Pour la vraie base, il faut d'abord exécuter `supabase/migration-v1.2.sql` (voir `supabase/README.md`).

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
   Juste en dessous, la « Discussion du groupe » s'ouvre : Chris, Lucas et Camille s'organisent déjà.
   Si tu as le temps : « Ouvrir la discussion », écris « Je ramène ma guitare aussi ! » et appuie sur Entrée.
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
| Double-clic sur le titre d'une étape d'inscription (mode local) | Remplit cette étape avec le profil de Marissa |
| Double-clic sur le titre « Créer une activité » (mode local) | Pré-remplit « Écrire une chanson en groupe », mercredi 17h, Médiathèque, 6 places |
| `#/admin` à la fin de l'adresse, puis le code | Panel organisateur : « Continuer en tant qu'Ewan » (live), aperçu du mur, projection, flux en direct, simulation (local) |

Le double-clic marche aussi dans « Modifier mon profil ». En mode live, les deux double-clics ne font rien : chacun
crée son vrai profil et ses vraies activités.

## Modifier les textes et les données

Ouvre les fichiers avec n'importe quel éditeur de texte (TextEdit en mode texte brut, VS Code…), enregistre,
puis recharge la page (`Cmd + R`).

### `js/copy.js` : les textes de l'app

L'accroche, le texte de Bienvenue, les 3 points forts, la phrase sur les données personnelles, le texte de la
page Impact, le message pré-rempli de « Contacter », les messages quand une liste est vide.
Change seulement ce qui est **entre guillemets** et garde la virgule en fin de ligne.
Attention aux apostrophes : dans un texte entre `'…'`, écris `\'` ; dans un texte entre `"…"`, écris `'` normalement.

### `js/data.js` : les données de démonstration

Catégories, passions, personnes, activités, connexions, messages des discussions, lieux et filières. Chaque bloc est commenté.
- Une personne : `teach` (Je transmets, 3 maximum) doit faire partie de ses `passions` ; `learn` (J'apprends) 3 maximum.
- Une activité : `when: { weekday: 5, time: '17:30' }` veut dire vendredi 17h30 (1 = lundi … 7 = dimanche).
  L'organisateur doit être dans `participants`, et il ne faut pas plus de participants que `max`.
- Un message : `activityId` (l'activité), `personId` (un participant de cette activité), `ago` (il y a combien de
  minutes) et `body` (300 caractères maximum).
- `demo.marissa` et `demo.songActivity` servent aux raccourcis de double-clic.

**Important :** l'app copie ces données au premier lancement, puis travaille sur sa copie enregistrée.
Après une modification de `data.js`, fais un **reset** (5 clics sur le logo) pour voir le changement.
Si la page reste blanche après une modification, il manque sans doute une virgule ou un guillemet :
annule ta dernière modification.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page. Charge les scripts dans l'ordre : config, copy, data, store, sync, fx, app |
| `js/config.js` | Les clés Supabase. Vides = mode local |
| `css/styles.css` | Tout le style et les animations d'interface |
| `js/copy.js` | Les textes modifiables |
| `js/data.js` | Les données de démonstration |
| `js/store.js` | L'état de l'app, l'enregistrement, le calcul des affinités et des chiffres d'Impact, les messages du chat |
| `js/sync.js` | Le mode live : envoi vers Supabase, réception en direct (messages compris), file d'attente hors ligne. Inactif en mode local |
| `js/fx.js` | Les grands moments animés : réseau de Bienvenue, révélation, confettis, compteurs, réseau du campus |
| `js/app.js` | Les écrans, la navigation et les clics, dont les discussions, le mur projeté et le panel organisateur |
| `js/vendor/qrcode.js` | Le générateur de QR code de l'écran projeté (MIT, aucun appel réseau) |

Si `fx.js` manque ou plante, l'app marche quand même : la révélation s'affiche dans une fenêtre plus simple,
les compteurs restent animés, et le réseau du campus est masqué.

## Bon à savoir

- Le calcul des affinités : +3 si l'autre transmet ce que tu veux apprendre, +2 si tu transmets ce qu'il veut
  apprendre, +1 par passion en commun. On affiche les raisons en clair, jamais de pourcentage.
- « Pour toi » sur une activité : sa passion fait partie de tes passions ou de ce que tu veux apprendre.
- Créer une activité : après la catégorie, on choisit une passion de la liste ou « ✨ Autre chose » (texte libre,
  40 caractères, avec un emoji au choix ; sinon celui de la catégorie). Une activité libre est « Pour toi » seulement
  si son texte correspond à une passion connue (« Padel », « afterwork », « Guitares »…).
- Le lieu est toujours écrit par l'organisateur (60 caractères, obligatoire). Les lieux de `data.js` ne sont que
  des suggestions : un clic remplit le champ.
- Les chiffres de la page Impact sont calculés en direct à partir des données de démonstration.
- Si ton ordinateur est réglé sur « Réduire les animations », l'app coupe la plupart des mouvements.
  Pour les forcer quand même pendant la démo : dans la console de Chrome, `localStorage.cc_fx_motion = 'full'`,
  puis recharge la page (supprime la clé pour revenir au réglage du Mac).
