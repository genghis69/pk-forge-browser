# APK Forge Browser Edition

Compilateur expérimental **dans le navigateur** utilisant [Google Pack](https://github.com/google/pack), une bibliothèque Rust (Apache-2.0) compilée en WebAssembly.

- Aucun ZIP utilisateur n'est envoyé à un serveur : JSZip décompresse en local, Google Pack assemble et signe en local.
- **Prend en charge uniquement les projets Android sans code natif**, en particulier les ressources de cadrans Wear OS au format compatible Google Pack.
- **Ne compile pas Java/Kotlin/Gradle** et ne remplace pas Android Studio, D8 ou AAPT2.
- La compilation du moteur WebAssembly a lieu une fois sur GitHub Actions. La génération d'un APK compatible a lieu ensuite entièrement dans Chrome.

## Mise en route

Le workflow `.github/workflows/build-wasm.yml` compile Google Pack au premier push et publie un ZIP nommé `apk-forge-browser-avec-wasm` dans les Artifacts de GitHub Actions.

Pour l'hébergement automatique, dans **Settings > Pages > Build and deployment > Source**, sélectionner **GitHub Actions**. Sans cette activation, la compilation réussit désormais et produit l'archive ZIP, mais saute la publication. Après activation, chaque nouveau push publie automatiquement le site à https://genghis69.github.io/pk-forge-browser/.

S'il reste une erreur de déploiement Pages, les Artifacts du job `build` permettent quand même de récupérer le site compilé (HTML+JS+WASM).

## Périmètre

1. Import ZIP, analyse Gradle + ressources + AndroidManifest.
2. Validation `android:hasCode="false"`, absence de Java/Kotlin et présence des ressources.
3. Chargement de `pack_wasm.js` et `pack_wasm_bg.wasm` construits sur GitHub.
4. Web Crypto crée une clé RSA éphémère et un certificat autosigné.
5. Google Pack construit et signe un vrai ZIP/APK, proposé au téléchargement.

Les APK signés avec une clé temporaire ne sont pas destinés aux mises à jour d'une application déjà installée : chaque exécution crée une nouvelle clé. Cette version vise l'expérimentation, pas la publication Play Store.

## Projets tiers

- Google Pack (Apache-2.0) : https://github.com/google/pack, commit `7b60931e4058d892344ac57e49fcb582fd349b76`
- JSZip 3.10.1 (MIT) chargé depuis jsDelivr : https://stuk.github.io/jszip/
- Le workflow conserve la licence de Google Pack dans la distribution.

## Diagnostic Java et Kotlin

Le bouton Compiler reste désactivé lorsque le ZIP contient des sources Java ou Kotlin : ces compilateurs ainsi que D8 ne sont pas encore intégrés. Le site indique maintenant les composants manquants et permet d’exporter un rapport JSON. Pour tester la chaîne réellement disponible, utiliser le bouton **Charger un projet compatible de démonstration**. Il crée un ZIP de cadran Wear OS sans code localement puis permet d’essayer Google Pack dans le navigateur.

## Analyse correcte du projet Kotlin

L'analyseur privilégie `src/main/AndroidManifest.xml` et `app/build.gradle.kts`. Les répertoires Gradle générés (`build/`, `.gradle/`, etc.) sont exclus de la détection des entrées de compilation. Les APK et DEX présents dans un ZIP ne sont **jamais** pris comme substituts aux sources. Pour un projet comme ELM327 Universal OBD2 v4.0.1, Kotlin 2.2.20, AGP 8.13.2, Gradle 9.3.0, Java 17, dépendances AndroidX et USB serial sont identifiés. La compilation Kotlin n'est toujours pas intégrée.

## Kotlin 2.2.20 dans le navigateur (laboratoire)

Le pipeline télécharge les JAR Kotlin et les vérifie sous Java 17 avant de les publier dans `toolchains/kotlin/2.2.20`. L'interface est désormais équipée d'un laboratoire CheerpJ pour essayer la compilation `ForgeProof.kt` en `.class`, puis éventuellement D8 en `classes.dex`. La compatibilité effective dans Chrome demeure à tester et ne doit pas être confondue avec les validations de GitHub Actions. Les projets Android Kotlin/Gradle complets nécessitent encore `android.jar`, AAPT2, les dépendances Maven et un assembleur APK avec DEX.

## Correction CheerpJ sur GitHub Pages

Le chemin virtuel `/app/` de CheerpJ correspond à la racine du domaine. Sur ce dépôt GitHub Pages, les JAR Kotlin sont servis sous `/pk-forge-browser/toolchains/`, donc le classpath correct commence par `/app/pk-forge-browser/toolchains/`. `src/toolchain-paths.mjs` déduit le chemin depuis l’URL réelle du module, sans hardcoder le nom du dépôt, et vérifie chaque JAR (HEAD) avant de démarrer Java. Les tests automatisés couvrent GitHub Pages, une installation locale sous `/cmpl/` et un hébergement à la racine. Le bouton D8 est désactivé jusqu’à la production effective de ForgeProof.class. Cela résout les erreurs de chargement 404 observées, mais ne démontre pas encore la réussite de la compilation Kotlin sous CheerpJ.
