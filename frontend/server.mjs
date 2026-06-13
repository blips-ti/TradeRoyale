import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/* ──────────────────────────────────────────────────────────────────────────
   Hardcoded competition (the one live arena for the MVP).
   Buy-in $20, 30-minute round. Pot = players * buyIn.
   ────────────────────────────────────────────────────────────────────────── */
const COMPETITION = {
  id: "alpha-genesis",
  name: "Genesis Arena",
  buyInUsd: 20,
  durationMin: 30,
  maxPlayers: 50,
};

/* roster: competitionId -> Map<socketId, player>  */
const rosters = new Map([[COMPETITION.id, new Map()]]);
/* socketId -> competitionId (for disconnect cleanup) */
const socketComp = new Map();

function rosterArray(compId) {
  const m = rosters.get(compId);
  if (!m) return [];
  // De-dupe by player id (a player may open multiple tabs) — keep earliest join.
  const byId = new Map();
  for (const p of m.values()) {
    const prev = byId.get(p.id);
    if (!prev || p.joinedAt < prev.joinedAt) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

function meta(compId) {
  const players = rosterArray(compId);
  return {
    ...COMPETITION,
    playerCount: players.length,
    potUsd: players.length * COMPETITION.buyInUsd,
  };
}

function broadcast(io, compId) {
  io.to(compId).emit("arena:roster", rosterArray(compId));
  io.to(compId).emit("arena:meta", meta(compId));
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    // Subscribe a spectator to the arena's live roster without joining the pot.
    socket.on("arena:watch", (compId = COMPETITION.id) => {
      socket.join(compId);
      socket.emit("arena:roster", rosterArray(compId));
      socket.emit("arena:meta", meta(compId));
    });

    // Join the competition (commit the buy-in — money flow is stubbed for now).
    socket.on("arena:join", ({ competitionId = COMPETITION.id, player } = {}) => {
      if (!player || !player.id) return;
      const m = rosters.get(competitionId) ?? new Map();
      rosters.set(competitionId, m);
      socket.join(competitionId);
      socketComp.set(socket.id, competitionId);
      m.set(socket.id, {
        id: player.id,
        name: player.name ?? "Anon",
        address: player.address ?? null,
        joinedAt: Date.now(),
      });
      broadcast(io, competitionId);
    });

    socket.on("arena:leave", () => {
      const compId = socketComp.get(socket.id);
      if (!compId) return;
      rosters.get(compId)?.delete(socket.id);
      socketComp.delete(socket.id);
      socket.leave(compId);
      broadcast(io, compId);
    });

    socket.on("disconnect", () => {
      const compId = socketComp.get(socket.id);
      if (!compId) return;
      rosters.get(compId)?.delete(socket.id);
      socketComp.delete(socket.id);
      broadcast(io, compId);
    });
  });

  httpServer.listen(port, () => {
    console.log(`👑 TradeRoyale ready on http://${hostname}:${port}  (Next + Socket.IO)`);
  });
});
