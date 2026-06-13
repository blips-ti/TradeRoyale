import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages';

import { env } from '../env.js';
import type { Game, Player, Trade } from '../domain/types.js';
import { TradeRepository } from '../repositories/tradeRepository.js';
import { isNativeToken, lifiService, LifiService } from '../services/lifiService.js';
import { viemReader, ViemReader } from '../services/viemClient.js';
import { gameEventHub, GameEventHub } from '../ws/gameEventHub.js';
import { buildAgentRequestParams } from './agentRequest.js';
import { getAnthropicClient } from './anthropicClient.js';
import { buildFirstMessage, buildSystemPrompt, type PromptTokenSummary } from './prompts.js';
import { buildAgentTools } from './tools.js';

const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 16_000;
const MS_PER_SEC = 1000;
const RECENT_TRADES_SHOWN = 10;

export interface AgentTickResult {
  playerId: string;
  summary: string;
  // Union of the player's prior touched tokens and any traded this turn (lowercased Base
  // addresses); the runner persists this so the next turn's portfolio reads the right set.
  touchedTokens: string[];
  // Seconds the agent asked to wait before its next turn via the wait tool (undefined if it
  // never called wait); the loop clamps this to [floor, time-remaining].
  requestedWaitSeconds?: number;
}

// Runs one Claude tool-runner conversation for a single player. Self-contained: a failure
// here is caught by the AgentRunner so one player's error never affects another.
export class TradingAgent {
  constructor(
    private readonly viem: ViemReader = viemReader,
    private readonly lifi: LifiService = lifiService,
    private readonly trades: TradeRepository = new TradeRepository(),
    private readonly hub: GameEventHub = gameEventHub,
  ) {}

  // Runs ONE bounded-context agent turn (fresh portfolio + recent-trades summary each turn,
  // never one growing conversation). `gameOwnedAddresses` is the wallet-isolation denyset; the
  // `signal` (from the per-player loop) aborts both the loop sleep and this in-flight turn.
  async runTick(
    game: Game,
    player: Player,
    gameOwnedAddresses: string[],
    signal?: AbortSignal,
  ): Promise<AgentTickResult> {
    const secondsRemaining = this.secondsRemaining(game);
    const tokens = await this.lifi.getTokens();
    const promptTokens: PromptTokenSummary[] = tokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      priceUSD: token.priceUSD,
    }));
    // Seed with the entry token plus whatever the player has already traded.
    const touchedTokens = new Set<string>([
      game.entryToken.toLowerCase(),
      ...(player.touchedTokens ?? []).map((token) => token.toLowerCase()),
    ]);
    const waitState: { requestedSeconds?: number } = {};

    const system = buildSystemPrompt({
      entryToken: game.entryToken,
      tradeableTokens: promptTokens,
      secondsRemaining,
      chainId: env.CHAIN_ID,
      lifiMcpEnabled: env.AGENT_USE_LIFI_MCP,
      walletAddress: player.privyWalletAddress,
      strategyPrompt: player.strategyPrompt,
    });
    const firstMessage = buildFirstMessage({
      portfolioJson: await this.portfolioJson(player, touchedTokens),
      recentTradesSummary: await this.recentTradesSummary(game.id, player.id),
      secondsRemaining,
      lastAgentSummary: player.lastAgentSummary,
      liveInstruction: player.pendingInstruction,
    });

    const tools = buildAgentTools({
      game,
      player,
      touchedTokens,
      gameOwnedAddresses: new Set(gameOwnedAddresses.map((address) => address.toLowerCase())),
      secondsRemaining: () => this.secondsRemaining(game),
      waitState,
    });

    const params = buildAgentRequestParams({
      model: env.AGENT_MODEL,
      maxTokens: MAX_TOKENS,
      maxIterations: MAX_TOOL_ITERATIONS,
      system,
      firstMessage,
      tools,
      lifiMcp: {
        enabled: env.AGENT_USE_LIFI_MCP,
        url: env.LIFI_MCP_URL,
        authorizationToken: env.LIFI_API_KEY,
      },
    });

    const client = getAnthropicClient();
    // stream:true so the runner yields a BetaMessageStream per turn — we relay token-by-token
    // text/thinking deltas and tool calls to the arena, so the agent visibly types + acts live.
    const runner = client.beta.messages.toolRunner(
      { ...params, stream: true },
      signal ? { signal } : undefined,
    );
    this.hub.broadcastToPlayer('agent_thinking', game.id, player.id, {});
    let finalMessage: BetaMessage | undefined;
    for await (const stream of runner) {
      stream.on('text', (delta) => this.streamDelta(game.id, player.id, delta));
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          // Surface the token pair (when the tool has one) so the arena shows what it's doing.
          const input = (block.input ?? {}) as Record<string, unknown>;
          this.hub.broadcastToPlayer('agent_log', game.id, player.id, {
            kind: 'tool',
            tool: block.name,
            fromToken: typeof input.fromToken === 'string' ? input.fromToken : undefined,
            toToken: typeof input.toToken === 'string' ? input.toToken : undefined,
          });
        }
      });
      finalMessage = await stream.finalMessage();
      // End of this assistant turn — the arena finalizes the current streaming bubble.
      this.hub.broadcastToPlayer('agent_log', game.id, player.id, { kind: 'turn_end' });
    }
    if (!finalMessage) throw new Error('Agent produced no messages');
    const summary = this.extractSummary(finalMessage.content);
    this.hub.broadcastToPlayer('agent_update', game.id, player.id, { summary });
    return {
      playerId: player.id,
      summary,
      touchedTokens: [...touchedTokens],
      requestedWaitSeconds: waitState.requestedSeconds,
    };
  }

  // Relay a token delta of the agent's reasoning to the arena (assembled into a typing bubble).
  private streamDelta(gameId: string, playerId: string, text: string): void {
    if (text) this.hub.broadcastToPlayer('agent_log', gameId, playerId, { kind: 'reasoning_delta', text });
  }

  private extractSummary(content: Array<{ type: string; text?: string }>): string {
    const text = content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text.trim())
      .filter((line) => line.length > 0)
      .join(' ');
    return text || 'No action taken this tick.';
  }

  private async portfolioJson(player: Player, touchedTokens: Set<string>): Promise<string> {
    if (!player.privyWalletAddress) return JSON.stringify({ balances: {}, prices: {} });
    const tokenList = [...touchedTokens];
    const erc20Tokens = tokenList.filter((token) => !isNativeToken(token));
    const balances = await this.viem.getErc20Balances(erc20Tokens, player.privyWalletAddress);
    balances.native = await this.viem.getNativeBalance(player.privyWalletAddress);
    const prices = await this.lifi.getPrices(tokenList);
    return JSON.stringify({ balances, prices });
  }

  private async recentTradesSummary(gameId: string, playerId: string): Promise<string> {
    const trades = await this.trades.listForPlayer(gameId, playerId);
    if (trades.length === 0) return 'None yet.';
    return trades
      .slice(-RECENT_TRADES_SHOWN)
      .map((trade) => this.formatTrade(trade))
      .join('\n');
  }

  private formatTrade(trade: Trade): string {
    return `- ${trade.fromAmount} ${trade.fromToken} -> ${trade.toToken} (min ${trade.toAmountMin}) via ${trade.tool} [${trade.status}]`;
  }

  private secondsRemaining(game: Game): number {
    if (!game.endsAt) return 0;
    const remainingMs = new Date(game.endsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(remainingMs / MS_PER_SEC));
  }
}

export const tradingAgent = new TradingAgent();
