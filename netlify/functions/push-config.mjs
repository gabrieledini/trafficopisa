import { vapid } from "../lib/traffic.mjs";

export default async () => {
  try {
    const { publicKey } = await vapid();
    if (!publicKey) throw new Error("Chiave VAPID pubblica mancante");
    return Response.json({ publicKey });
  } catch (e) {
    console.error("push-config:", e);
    return Response.json({ error: "Configurazione push non disponibile: " + (e.message || e) }, { status: 500 });
  }
};
