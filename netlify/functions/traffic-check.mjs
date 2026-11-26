import { getTraffic, store, vapid, webpush, inNotifyWindow, DIR_LABEL } from "../lib/traffic.mjs";

// Soglia ritardo in minuti (default 15), sovrascrivibile da Netlify con NOTIFY_MIN_DELAY
const MIN_DELAY_SEC = +(process.env.NOTIFY_MIN_DELAY || 15) * 60;

export default async () => {
  // Lunedì–venerdì (ed eventuale fascia oraria): fuori finestra non interroga TomTom
  if (!inNotifyWindow()) return;

  await vapid();
  const s = store();
  const traffic = await getTraffic();
  const seen = (await s.get("seen", { type: "json" })) || {};
  const now = Date.now();

  // Solo eventi oltre la soglia; un evento sotto soglia non viene segnato come visto,
  // così se il ritardo cresce oltre i 15 minuti la notifica parte al controllo successivo
  const fresh = [];
  for (const road of ["a12", "ss1"]) {
    for (const dir of ["pisa", "viareggio"]) {
      for (const i of traffic[road][dir]) {
        if (i.delaySec <= MIN_DELAY_SEC) continue;
        const k = `${i.id}:${dir}`;
        if (seen[k]) continue;
        seen[k] = now;
        fresh.push({ road, dir, ...i });
      }
    }
  }
  for (const k in seen) if (now - seen[k] > 6 * 3600e3) delete seen[k];
  await s.setJSON("seen", seen);
  if (!fresh.length) return;

  const { blobs } = await s.list({ prefix: "subs/" });
  for (const b of blobs) {
    const rec = await s.get(b.key, { type: "json" });
    if (!rec) continue;
    for (const i of fresh) {
      const name = i.road === "a12" ? "A12" : "Aurelia";
      const where = i.dirUnknown ? "direzione non certa" : DIR_LABEL[i.dir];
      const body = [`+${i.delayMin} min`, i.from && i.to ? `${i.from} → ${i.to}` : ""].filter(Boolean).join(", ");
      try {
        await webpush.sendNotification(rec.subscription,
          JSON.stringify({ title: `${name} ${where}: ${i.what}`, body, tag: `${i.id}:${i.dir}` }), { TTL: 1800 });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await s.delete(b.key); break; }
        console.error("push", e.statusCode, e.body);
      }
    }
  }
};

export const config = { schedule: "*/5 * * * *" };
