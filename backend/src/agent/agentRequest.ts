import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type {
  BetaMCPToolset,
  BetaRequestMCPServerURLDefinition,
  BetaToolRunnerParams,
} from '@anthropic-ai/sdk/resources/beta/messages';

import { MCP_REPLACED_TOOL_NAMES } from './tools.js';

const LIFI_MCP_SERVER_NAME = 'lifi';
// Connector version that takes mcp_servers + mcp_toolset; the 2025-04-04 variant is deprecated.
const MCP_CLIENT_BETA = 'mcp-client-2025-11-20';

export interface LifiMcpConfig {
  enabled: boolean;
  url: string;
  authorizationToken?: string;
}

export interface AgentRequestInput {
  model: string;
  maxTokens: number;
  maxIterations: number;
  system: string;
  firstMessage: string;
  tools: BetaRunnableTool[];
  lifiMcp: LifiMcpConfig;
}

// Pure builder for the toolRunner() params. Centralizes the LI.FI MCP wiring so it can be
// asserted without hitting the API: when MCP is on it adds mcp_servers + the mcp_toolset
// entry + the beta header and drops the REST tools MCP supersedes; when off it keeps the
// full REST toolset and emits no MCP fields.
export function buildAgentRequestParams(input: AgentRequestInput): BetaToolRunnerParams {
  const base: BetaToolRunnerParams = {
    model: input.model,
    max_tokens: input.maxTokens,
    // Thinking OFF: the agent must act, not narrate a long internal analysis.
    thinking: { type: 'disabled' },
    system: input.system,
    tools: input.tools,
    max_iterations: input.maxIterations,
    messages: [{ role: 'user', content: input.firstMessage }],
  };
  if (!input.lifiMcp.enabled) return base;

  const mcpServer: BetaRequestMCPServerURLDefinition = {
    type: 'url',
    name: LIFI_MCP_SERVER_NAME,
    url: input.lifiMcp.url,
    // Bearer token is included only when present (raises the LI.FI rate limit tier).
    ...(input.lifiMcp.authorizationToken ? { authorization_token: input.lifiMcp.authorizationToken } : {}),
  };
  const mcpToolset: BetaMCPToolset = { type: 'mcp_toolset', mcp_server_name: LIFI_MCP_SERVER_NAME };
  const replaced = new Set<string>(MCP_REPLACED_TOOL_NAMES);

  return {
    ...base,
    tools: [...input.tools.filter((tool) => !replaced.has(tool.name)), mcpToolset],
    mcp_servers: [mcpServer],
    betas: [MCP_CLIENT_BETA],
  };
}
