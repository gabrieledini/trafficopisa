import { getTraffic, store, vapid, webpush, isWeekday, DIR_LABEL } from "../lib/traffic.mjs";

export default async () => {
  // Notifiche solo dal lunedì al venerdì: nel weekend non interroga nemmeno TomTom
  if (!isWeekday()) return;

  await vapid();
  const s = store();
  const traffic = await getTraffic();
  const seen = (await s.get("seen", { type: "json" })) || {};
  const now = Date.now();

  const fresh = [];
  for (const road of ["a12", "ss1"]) {
    for (const dir of ["pisa", "viareggio"]) {
      for (const i of traffic[road][dir]) {
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
      if (i.magnitude < rec.minmag && i.magnitude !== 4) continue;
      const name = i.road === "a12" ? "A12" : "Aurelia";
      const where = i.dirUnknown ? "direzione non certa" : DIR_LABEL[i.dir];
      const body = [i.from && i.to ? `${i.from} → ${i.to}` : "", i.delayMin ? `+${i.delayMin} min` : ""].filter(Boolean).join(", ");
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
