/**
 * Conversion d'URL d'assets -> chemins virtuels CheerpJ.
 * /app pointe sur la RACINE du domaine, pas sur celle du sous-site GitHub Pages.
 * Aucun chemin absolu /toolchains : préserve le préfixe /pk-forge-browser/.
 */
export function toolchainUrl(relativePath, moduleUrl) {
 if (typeof relativePath !== "string" ||
     !/^[a-z0-9._/-]+$/i.test(relativePath) ||
     relativePath.split("/").some(part => part === ".." || part === "." || part === "")) {
   throw Error("Chemin d'outil invalide : " + relativePath);
 }
 return new URL(relativePath, new URL("../toolchains/", moduleUrl));
}
export function toCheerpJPath(relativePath, moduleUrl) {
 const url = toolchainUrl(relativePath, moduleUrl);
 if (!["https:", "http:"].includes(url.protocol)) throw Error("Serveur HTTP(S) requis pour CheerpJ.");
 return "/app" + url.pathname;
}
export function kotlinJarRelative(name) {
 if (!/^[a-z0-9_.-]+\.jar$/i.test(name)) throw Error("Nom de bibliothèque Kotlin invalide : " + name);
 return "kotlin/2.2.20/jars/" + name;
}
export function d8JarRelative(version, name) {
 if (!/^[0-9.]+$/.test(version) || !/^[a-z0-9_.-]+\.jar$/i.test(name)) throw Error("D8 : version ou nom invalide.");
 return "r8/" + version + "/" + name;
}
export async function checkToolchainFiles(manifest, moduleUrl, fetchFn) {
 if (!manifest || !Array.isArray(manifest.jars) || !manifest.jars.length) throw Error("Catalogue Kotlin vide.");
 if (typeof fetchFn !== "function") throw Error("Fonction réseau absente.");
 const paths = manifest.jars.map(kotlinJarRelative);
 if (manifest.d8Jar) paths.push(d8JarRelative(manifest.d8Version, manifest.d8Jar));
 const results = await Promise.all(paths.map(async relative => {
  const url = toolchainUrl(relative, moduleUrl);
  try {
   const response = await fetchFn(url, {method:"HEAD", cache:"no-store"});
   return response.ok ? null : {url:url.href, status:response.status};
  } catch (error) {
   return {url:url.href,status:String(error?.message || error)};
  }
 }));
 return results.filter(Boolean);
}
