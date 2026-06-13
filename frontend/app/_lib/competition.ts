export type Player = {
  id: string;
  name: string;
  address: string | null;
  joinedAt: number;
};

export type CompetitionMeta = {
  id: string;
  name: string;
  buyInUsd: number;
  durationMin: number;
  maxPlayers: number;
  playerCount: number;
  potUsd: number;
};

/** Mirror of the hardcoded competition in server.mjs (live fields come over socket). */
export const COMPETITION: CompetitionMeta = {
  id: "alpha-genesis",
  name: "Genesis Arena",
  buyInUsd: 20,
  durationMin: 30,
  maxPlayers: 50,
  playerCount: 0,
  potUsd: 0,
};

/** Static presentation fields (mocked competition copy). */
export const COMPETITION_DISPLAY = {
  tags: ["bonds", "crypto"],
  startsInLabel: "Starts now",
  lengthLabel: "Round length 30 min",
};
