import { createHash } from "node:crypto";
import { store } from "../lib/traffic.mjs";

const idOf = endpoint => "subs/" + createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

export default async (req) => {
  const body = await req.json().catch(() => null);
  const sub = body && body.subscription;
  if (!sub || !sub.endpoint) return Response.json({ error: "Iscrizione non valida" }, { status: 400 });
  const s = store();
  if (req.method === "DELETE") {
    await s.delete(idOf(sub.endpoint));
    return Response.json({ ok: true });
  }
  const minmag = [1, 2, 3].includes(+body.minmag) ? +body.minmag : 2;
  await s.setJSON(idOf(sub.endpoint), { subscription: sub, minmag });
  return Response.json({ ok: true });
};
