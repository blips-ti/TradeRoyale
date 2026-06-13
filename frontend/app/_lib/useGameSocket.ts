"use client";

import * as React from "react";
import type { GameEvent } from "./types";
import { API_URL } from "./api";

/** ws://…/ws base, derived from the API URL unless overridden. */
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  `${API_URL.replace(/^http/, "ws")}/ws`;

type Status = "connecting" | "open" | "closed";

/**
 * Subscribes to the backend's per-game event stream (`/ws/games/:gameId`).
 * Calls `onEvent` for every GameEvent. Auto-reconnects with backoff.
 * Pass `gameId = null` to stay disconnected.
 */
export function useGameSocket(gameId: string | null, onEvent: (e: GameEvent) => void) {
  const [status, setStatus] = React.useState<Status>("closed");
  const cbRef = React.useRef(onEvent);
  cbRef.current = onEvent;

  React.useEffect(() => {
    if (!gameId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(`${WS_URL}/games/${gameId}`);
      ws.onopen = () => {
        retry = 0;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        try {
          cbRef.current(JSON.parse(ev.data) as GameEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setStatus("closed");
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, Math.min(1000 * retry, 5000));
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [gameId]);

  return { status, connected: status === "open" };
}
