import { vapid } from "../lib/traffic.mjs";

export default async () => Response.json({ publicKey: (await vapid()).publicKey });
