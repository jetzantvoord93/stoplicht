// Maakt eenmalig twee sleutelparen, die de workflow in de cache van GitHub Actions
// bewaart. Alleen de publieke helften komen in de repository.
//   .vapid/keys.json  Web Push (VAPID)        → meldingen/vapid-public.txt
//   .box/keys.json    versleutelen van codes  → meldingen/box-public.txt
import fs from "fs";
import crypto from "crypto";
import webpush from "web-push";

fs.mkdirSync(".vapid", { recursive: true });
if (!fs.existsSync(".vapid/keys.json")) {
  fs.writeFileSync(".vapid/keys.json", JSON.stringify(webpush.generateVAPIDKeys()));
  console.log("Nieuw VAPID-sleutelpaar gemaakt.");
}
const { publicKey } = JSON.parse(fs.readFileSync(".vapid/keys.json", "utf8"));
fs.writeFileSync("meldingen/vapid-public.txt", publicKey + "\n");

fs.mkdirSync(".box", { recursive: true });
if (!fs.existsSync(".box/keys.json")) {
  const kp = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  fs.writeFileSync(".box/keys.json", JSON.stringify({ privateJwk: kp.privateKey.export({ format: "jwk" }), publicJwk: kp.publicKey.export({ format: "jwk" }) }));
  console.log("Nieuw sleutelpaar voor codes gemaakt.");
}
const { publicJwk } = JSON.parse(fs.readFileSync(".box/keys.json", "utf8"));
fs.writeFileSync("meldingen/box-public.txt", JSON.stringify({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }) + "\n");
