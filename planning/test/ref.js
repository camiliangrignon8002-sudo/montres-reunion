// Charge les données de référence pour les tests : fichier en clair s'il existe, sinon déchiffrement avec PLANNING_CODE.
const fs = require("fs"), path = require("path"), vm = require("vm");
const plain = path.join(__dirname, "..", "src", "reference.js");
if (fs.existsSync(plain)) require(plain);
else {
  const { webcrypto: crypto } = require("crypto");
  const L = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "reference.enc.json"), "utf8"));
  const code = process.env.PLANNING_CODE;
  if (!code) throw new Error("PLANNING_CODE requis pour les tests (données de l'équipe chiffrées).");
  const { execFileSync } = require("child_process");
  const out = execFileSync(process.execPath, ["-e", `
    const { webcrypto: c } = require("crypto");
    (async () => { const L = ${JSON.stringify(L)};
      const raw = await c.subtle.importKey("raw", new TextEncoder().encode(process.env.PLANNING_CODE.trim().toLowerCase()), "PBKDF2", false, ["deriveKey"]);
      const k = await c.subtle.deriveKey({ name: "PBKDF2", salt: Buffer.from(L.salt, "base64"), iterations: L.iter, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      process.stdout.write(JSON.parse(new TextDecoder().decode(await c.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(L.iv, "base64") }, k, Buffer.from(L.data, "base64")))).source);
    })();`], { env: process.env }).toString();
  vm.runInThisContext(out);
  void crypto;
}
module.exports = globalThis.PlanningReference;
