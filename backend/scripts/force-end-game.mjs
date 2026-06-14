// One-off recovery: force a single stuck game to status 'ended' and move it out of the open +
// live indexes into the ended index. Touches ONLY tr:game:<id> + the three index sets — no
// player keys, no wipe. Usage: node --env-file=.env scripts/force-end-game.mjs <gameId>
import Redis from "ioredis";

const id = process.argv[2];
if (!id) throw new Error("usage: force-end-game.mjs <gameId>");
const url = process.env.REDIS_URL;
if (!url) throw new Error("REDIS_URL not set");

const r = new Redis(url);
const key = `tr:game:${id}`;
const raw = await r.get(key);
if (!raw) throw new Error(`game ${id} not found at ${key}`);
const game = JSON.parse(raw);
console.log("before:", { status: game.status, endsAt: game.endsAt });

game.status = "ended";
await r.set(key, JSON.stringify(game));
await r.srem("tr:games:open", id);
await r.srem("tr:games:live", id);
await r.sadd("tr:games:ended", id);

const after = JSON.parse(await r.get(key));
const inOpen = await r.sismember("tr:games:open", id);
const inLive = await r.sismember("tr:games:live", id);
const inEnded = await r.sismember("tr:games:ended", id);
console.log("after:", { status: after.status, inOpenIndex: inOpen, inLiveIndex: inLive, inEndedIndex: inEnded });
await r.quit();
