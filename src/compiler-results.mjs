/**
 * Validates actual Java .class or Android DEX results.
 * CheerpJ's Java main can return 0 after a child-thread exception: exit code is not sufficient.
 */
export async function validateCompilerArtifact(blob, type) {
 const magic = type === "class" ? [0xca,0xfe,0xba,0xbe] : type === "dex" ? [0x64,0x65,0x78,0x0a] : null;
 if (!magic) throw Error("Type d'artefact inconnu");
 if (!blob || typeof blob.slice !== "function" || typeof blob.arrayBuffer !== "function")
   throw Error("Le compilateur n'a produit aucun fichier "+(type==="class"?".class":"classes.dex")+". Une exception Java peut survenir même si le code de retour est 0 ; consulte les erreurs Java dans F12.");
 if (blob.size < 8)
   throw Error("Fichier produit vide ou incomplet ("+blob.size+" octets).");
 const prefix=new Uint8Array(await blob.slice(0,4).arrayBuffer());
 if (!magic.every((byte,i)=>prefix[i]===byte))
   throw Error("Fichier "+type+" invalide : signature binaire incorrecte.");
 return blob;
}
