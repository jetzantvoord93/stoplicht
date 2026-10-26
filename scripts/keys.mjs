// Maakt eenmalig een VAPID-sleutelpaar in .vapid/keys.json. De workflow bewaart
// die map in de cache van GitHub Actions; alleen de publieke sleutel komt in de repository.
import fs from "fs";
import webpush from "web-push";

fs.mkdirSync(".vapid", { recursive: true });
if (!fs.existsSync(".vapid/keys.json")) {
  fs.writeFileSync(".vapid/keys.json", JSON.stringify(webpush.generateVAPIDKeys()));
  console.log("Nieuw sleutelpaar gemaakt.");
}
const { publicKey } = JSON.parse(fs.readFileSync(".vapid/keys.json", "utf8"));
fs.writeFileSync("meldingen/vapid-public.txt", publicKey + "\n");
