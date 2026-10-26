// Verstuurt de stoplicht-herinneringen. Draait elk half uur via GitHub Actions
// (cron "1 * * * *" en "31 * * * *"). Elke run is verantwoordelijk voor de
// herinneringstijden in het half uur vóór zijn geplande tijdstip, zodat een
// vertraagde run geen melding mist of dubbel verstuurt.
//
// Meldingscodes staan in meldingen/codes.txt (één per regel). Het VAPID-sleutelpaar
// staat in .vapid/keys.json, dat de workflow uit de Actions-cache haalt.
//
// Omgeving:
//   PUSH_CONFIG        optioneel: meldingscodes, overschrijft codes.txt
//   SCHEDULE           de cron-regel die deze run startte (door GitHub gevuld)
//   FORCE              "true" = stuur direct een testmelding

import fs from "fs";
import crypto from "crypto";
import webpush from "web-push";
import "../tips.js";

const TZ = "Europe/Amsterdam";
const WINDOW_MIN = 30;
const readRepoFile = rel => { try { return fs.readFileSync(new URL(rel, import.meta.url), "utf8").trim(); } catch { return ""; } };

// Versleutelde code uit de app: "enc1.<vingerafdruk>.<payload>", ECDH P-256 + HKDF + AES-256-GCM.
export function decryptCode(line, privateJwk) {
  const p = JSON.parse(Buffer.from(line.split(".")[2], "base64url").toString("utf8"));
  const shared = crypto.diffieHellman({
    privateKey: crypto.createPrivateKey({ key: privateJwk, format: "jwk" }),
    publicKey: crypto.createPublicKey({ key: p.epk, format: "jwk" }),
  });
  const key = Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("stoplicht-code"), 32));
  const ct = Buffer.from(p.ct, "base64url");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(p.iv, "base64url"));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
}

export function decodeCode(code, boxJwk) {
  if (code.startsWith("enc1.")) {
    if (!boxJwk) throw new Error("versleutelde code, maar sleutel ontbreekt (.box/keys.json)");
    code = decryptCode(code, boxJwk);
  }
  const json = Buffer.from(code.trim(), "base64url").toString("utf8");
  const c = JSON.parse(json);
  if (!c.e || !c.k?.p256dh || !c.k?.auth) throw new Error("ongeldige meldingscode");
  return { sub: { endpoint: c.e, keys: { p256dh: c.k.p256dh, auth: c.k.auth } }, times: Array.isArray(c.t) && c.t.length ? c.t : ["09:00", "14:00", "20:00"] };
}

function zonedParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, +x.value]));
  return p;
}
function offsetMin(date) {
  const p = zonedParts(date);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000;
}
// Een lokale tijd (Amsterdam) op een lokale datum omzetten naar een UTC-tijdstip.
function localToUtc(y, m, d, hh, mm) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - offsetMin(guess) * 60000);
}

// Het geplande tijdstip van deze run: het laatste moment <= nu met de cron-minuut.
export function slotFor(now, cronMinute) {
  const s = new Date(now); s.setUTCSeconds(0, 0); s.setUTCMinutes(cronMinute);
  if (s > now) s.setTime(s.getTime() - 3600e3);
  return s;
}

// Welke herinneringen (index in times) vallen in (slot - 30 min, slot]?
export function dueIndexes(times, slot) {
  const out = [];
  const lo = slot.getTime() - WINDOW_MIN * 60000, hi = slot.getTime();
  for (const back of [0, 1]) {
    const day = zonedParts(new Date(slot.getTime() - back * 864e5));
    times.forEach((t, i) => {
      const [hh, mm] = t.split(":").map(Number);
      const at = localToUtc(day.year, day.month, day.day, hh, mm).getTime();
      if (at > lo && at <= hi) out.push(i);
    });
  }
  return [...new Set(out)];
}

export function tipOfDay(date) {
  const p = zonedParts(date);
  const days = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 864e5);
  return globalThis.TIPS[(days * 7) % globalThis.TIPS.length];
}

export function payloadFor(index, count, date) {
  const tip = tipOfDay(date);
  const msgs = [
    { title: "Stoplicht · ochtend", body: `Hoe sta je ervoor? Tip van vandaag: ${tip.t}` },
    { title: "Stoplicht · middag", body: "Even inchecken: groen, oranje of rood?" },
    { title: "Stoplicht · avond", body: "Hoe was je dag? Vul je kleur in en kijk wat hielp." },
  ];
  const m = count === 3 ? msgs[index] : index === 0 ? msgs[0] : { title: "Stoplicht", body: "Tijd voor je check-in: groen, oranje of rood?" };
  return { ...m, url: "./?bron=melding", tag: "stoplicht-" + index };
}

const report = [];
const log = (...a) => { const line = a.join(" "); report.push(line); console.log(line); };

async function main() {
  const codes = (process.env.PUSH_CONFIG || readRepoFile("../meldingen/codes.txt")).split(/\s+/).filter(Boolean);
  if (!codes.length) { console.log("Nog geen meldingscode in meldingen/codes.txt. Niets te doen."); return; }
  const keys = JSON.parse(readRepoFile("../.vapid/keys.json") || "null");
  if (!keys) throw new Error("Sleutelpaar ontbreekt (.vapid/keys.json).");
  webpush.setVapidDetails("https://github.com/jetzantvoord93/stoplicht", keys.publicKey, keys.privateKey);
  const box = JSON.parse(readRepoFile("../.box/keys.json") || "null");

  const now = new Date();
  const force = process.env.FORCE === "true";
  const cronMinute = parseInt((process.env.SCHEDULE || "").trim().split(/\s+/)[0], 10);
  if (!force && Number.isNaN(cronMinute)) { console.log("Geen schema en geen test: niets te doen."); return; }
  const slot = force ? now : slotFor(now, cronMinute);

  let failed = 0, sent = 0;
  for (const code of codes) {
    let cfg;
    try { cfg = decodeCode(code, box && box.privateJwk); } catch (e) { log("Meldingscode overgeslagen:", e.message); failed++; continue; }
    const due = force ? [-1] : dueIndexes(cfg.times, slot);
    for (const i of due) {
      const payload = i === -1 ? { title: "Stoplicht", body: "Testmelding: meldingen werken.", url: "./?bron=melding", tag: "stoplicht-test" } : payloadFor(i, cfg.times.length, now);
      try {
        await webpush.sendNotification(cfg.sub, JSON.stringify(payload), { TTL: 3 * 3600, urgency: "high" });
        sent++; log(`Verstuurd: ${payload.title}`);
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) log("Dit abonnement is verlopen. Zet meldingen opnieuw aan in de app en stuur de nieuwe code.");
        else log("Versturen mislukt:", String(e.statusCode || ""), String(e.body || e.message).slice(0, 300));
      }
    }
  }
  log(`Slot ${slot.toISOString()}: ${sent} verstuurd, ${failed} mislukt.`);
  if (force || failed) fs.writeFileSync(new URL("../meldingen/status.txt", import.meta.url), `${new Date().toISOString()}\n${report.join("\n")}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exitCode = 1; });
