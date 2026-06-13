import type { BetaMCPToolset } from '@anthropic-ai/sdk/resources/beta/messages';
import { describe, expect, it, vi } from 'vitest';

import type { Game, Player } from '../domain/types.js';
import type { LifiService } from '../services/lifiService.js';
import type { TradeExecutor } from '../services/tradeExecutor.js';
import type { TradeRepository } from '../repositories/tradeRepository.js';
import type { ViemReader } from '../services/viemClient.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { buildAgentRequestParams } from './agentRequest.js';
import { buildAgentTools, type ToolDeps } from './tools.js';

const game: Game = {
  id: 'g1',
  status: 'live',
  entryToken: '0xusdc',
  entryAmount: '1000000',
  durationSec: 3600,
  maxPlayers: 10,
  createdAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
};

const player: Player = {
  id: 'p1',
  gameId: 'g1',
  displayName: 'alice',
  unlinkAddress: 'unlink1',
  encMnemonic: 'enc',
  depositStatus: 'confirmed',
  createdAt: new Date().toISOString(),
};

function buildTools(): ReturnType<typeof buildAgentTools> {
  const deps: ToolDeps = {
    executor: {} as TradeExecutor,
    lifi: { getPrices: vi.fn(), getTokens: vi.fn(), getQuote: vi.fn() } as unknown as LifiService,
    viem: {} as ViemReader,
    trades: {} as TradeRepository,
    hub: {} as GameEventHub,
  };
  return buildAgentTools(
    {
      game,
      player,
      touchedTokens: new Set(['0xusdc']),
      gameOwnedAddresses: new Set<string>(),
      secondsRemaining: () => 1800,
      waitState: {},
    },
    deps,
  );
}

function toolNames(params: ReturnType<typeof buildAgentRequestParams>): string[] {
  return params.tools.map((tool) => ('name' in tool ? tool.name : (tool as BetaMCPToolset).type));
}

function baseInput() {
  return {
    model: 'claude-opus-4-8',
    maxTokens: 16000,
    maxIterations: 8,
    system: 'system',
    firstMessage: 'first',
    tools: buildTools(),
  };
}

describe('buildAgentRequestParams', () => {
  it('adds mcp_servers, the mcp_toolset entry, and the beta header, dropping REST market/quote tools when MCP is on', () => {
    const params = buildAgentRequestParams({
      ...baseInput(),
      lifiMcp: { enabled: true, url: 'https://mcp.li.quest/mcp', authorizationToken: 'k' },
    });
    expect(params.mcp_servers).toEqual([
      { type: 'url', name: 'lifi', url: 'https://mcp.li.quest/mcp', authorization_token: 'k' },
    ]);
    expect(params.betas).toEqual(['mcp-client-2025-11-20']);
    const names = toolNames(params);
    expect(names).toContain('mcp_toolset');
    expect(names).toContain('get_portfolio');
    expect(names).toContain('execute_swap');
    expect(names).toContain('execute_protocol_action');
    expect(names).toContain('get_time_remaining');
    expect(names).not.toContain('get_market');
    expect(names).not.toContain('get_swap_quote');
  });

  it('omits authorization_token when no LI.FI API key is set', () => {
    const params = buildAgentRequestParams({
      ...baseInput(),
      lifiMcp: { enabled: true, url: 'https://mcp.li.quest/mcp' },
    });
    expect(params.mcp_servers?.[0]).not.toHaveProperty('authorization_token');
  });

  it('omits MCP fields and keeps the full REST toolset when MCP is off', () => {
    const params = buildAgentRequestParams({
      ...baseInput(),
      lifiMcp: { enabled: false, url: 'https://mcp.li.quest/mcp' },
    });
    expect(params.mcp_servers).toBeUndefined();
    expect(params.betas).toBeUndefined();
    const names = toolNames(params);
    expect(names).not.toContain('mcp_toolset');
    expect(names).toEqual(
      expect.arrayContaining(['get_portfolio', 'get_market', 'get_swap_quote', 'execute_swap', 'get_time_remaining']),
    );
  });
});
