import { getTraffic } from "../lib/traffic.mjs";

export default async () => {
  try {
    return Response.json({ updated: new Date().toISOString(), ...(await getTraffic()) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
};
