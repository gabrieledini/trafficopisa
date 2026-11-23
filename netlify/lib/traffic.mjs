import { getStore } from "@netlify/blobs";
import webpush from "web-push";

// Corridoio Viareggio–Pisa (lon/lat)
const BBOX = "10.20,43.69,10.46,43.92";
export const CAT = {0:"Evento",1:"Incidente",2:"Nebbia",3:"Condizioni pericolose",4:"Pioggia",5:"Ghiaccio",6:"Coda",7:"Corsia chiusa",8:"Strada chiusa",9:"Lavori",10:"Vento",11:"Allagamento",14:"Veicolo in panne"};

export const store = () => getStore("traffico");

const norm = s => String(s || "").toUpperCase().replace(/[\s.\-]/g, "");

function whichRoad(p) {
  const nums = (p.roadNumbers || []).map(norm);
  const txt = norm((p.from || "") + (p.to || "") + (p.events || []).map(e => e.description).join(""));
  if (nums.includes("A12")) return "a12";
  if (nums.some(n => n === "SS1" || n.startsWith("SS1VAR")) || txt.includes("AURELIA")) return "ss1";
  if (nums.includes("E80")) return "a12";
  return null;
}

// Geometria nel senso di marcia: latitudine che scende = verso Pisa, che sale = verso Viareggio
function direction(g) {
  if (!g || g.type !== "LineString" || g.coordinates.length < 2) return null;
  const a = g.coordinates[0], b = g.coordinates[g.coordinates.length - 1];
  const d = a[1] - b[1];
  if (Math.abs(d) < 0.001) return null;
  return d > 0 ? "pisa" : "viareggio";
}

export const DIR_LABEL = { pisa: "verso Pisa", viareggio: "verso Viareggio" };

// true dal lunedì al venerdì, ora italiana
export function isWeekday(date = new Date()) {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" }).format(date);
  return !["Sat", "Sun"].includes(d);
}

// Fasce orarie delle notifiche, ora italiana: [inizio, fine) in ore
export const NOTIFY_WINDOWS = [[7, 10], [16, 19]];

// true se l'ora italiana cade in una delle fasce di NOTIFY_WINDOWS
export function inNotifyWindow(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", hour: "numeric", hourCycle: "h23" }).format(date));
  return NOTIFY_WINDOWS.some(([a, b]) => h >= a && h < b);
}

export async function getTraffic() {
  const key = process.env.TOMTOM_KEY;
  if (!key) throw new Error("Variabile TOMTOM_KEY mancante su Netlify.");
  const fields = "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,iconCategory},from,to,length,delay,roadNumbers}}}";
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}&bbox=${BBOX}&fields=${encodeURIComponent(fields)}&language=it-IT&timeValidityFilter=present`;
  const r = await fetch(url);
  if (r.status === 401 || r.status === 403) throw new Error("Chiave TomTom non valida.");
  if (!r.ok) throw new Error(`TomTom ha risposto ${r.status}.`);
  const out = { a12: { pisa: [], viareggio: [] }, ss1: { pisa: [], viareggio: [] } };
  for (const i of (await r.json()).incidents || []) {
    const p = i.properties, road = whichRoad(p);
    if (!road) continue;
    const dir = direction(i.geometry);
    const item = {
      id: p.id,
      what: (p.events && p.events[0] && p.events[0].description) || CAT[p.iconCategory] || "Evento",
      from: p.from || "", to: p.to || "",
      km: p.length ? +(p.length / 1000).toFixed(1) : null,
      delayMin: p.delay ? Math.round(p.delay / 60) : null,
      magnitude: p.magnitudeOfDelay || 0,
      dirUnknown: dir === null
    };
    if (dir) out[road][dir].push(item);
    else { out[road].pisa.push(item); out[road].viareggio.push(item); }
  }
  return out;
}

// Chiavi VAPID generate al primo uso e salvate nei Blobs
export async function vapid() {
  let k = null;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    // Normalizza: niente spazi/virgolette, Base64 URL-safe senza padding "="
    const clean = v => v.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    k = { publicKey: clean(process.env.VAPID_PUBLIC_KEY), privateKey: clean(process.env.VAPID_PRIVATE_KEY) };
  }
  const s = store();
  if (!k) k = await s.get("vapid", { type: "json" });
  if (!k) {
    k = webpush.generateVAPIDKeys();
    await s.setJSON("vapid", k);
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:traffico@example.com", k.publicKey, k.privateKey);
  return k;
}

export { webpush };
