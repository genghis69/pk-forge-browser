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
