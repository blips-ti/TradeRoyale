import { z } from 'zod';

// Base mainnet USDC (matches CHAIN_ID 8453 / mainnet RPC defaults). Base Sepolia testnet USDC
// is 0x036CbD53842c5426634e7929541eC2318f3dCF7e (use it only with a Base Sepolia setup).
const DEFAULT_ENTRY_TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Base mainnet USDC + WETH — the LI.FI-tradeable set (entry token first).
const DEFAULT_TRADEABLE_TOKENS =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x4200000000000000000000000000000000000006';
const DEFAULT_AGENT_MODEL = 'claude-opus-4-8';
// Continuous per-player loop pacing: floor between turns (cost backstop), default wait when the
// agent doesn't call the wait tool, and an optional hard turn cap per player per game (0 = off).
const DEFAULT_MIN_LOOP_INTERVAL_MS = 10_000;
const DEFAULT_WAIT_SECONDS = 30;
const DEFAULT_AGENT_MAX_TURNS_PER_GAME = 0;
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_MAX_SLIPPAGE_BPS = 100;
const DEFAULT_LIFI_MCP_URL = 'https://mcp.li.quest/mcp';
const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_OCTAV_API_URL = 'https://api.octav.fi/v1';
// 1 USDC (6 decimals) — liquidation skips dust positions below this USDC-equivalent.
const DEFAULT_LIQUIDATION_MIN_USDC = '1000000';

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address');
// Accepts "true"/"false" (case-insensitive) from the env string; defaults to true.
const booleanFlag = z
  .string()
  .transform((value) => value.trim().toLowerCase() !== 'false')
  .pipe(z.boolean());

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // Comma-separated browser-origin allowlist for CORS, or '*' for any. Defaults to the
  // local FE (3000/3001) + the Vercel deployment; override per-environment as needed.
  CORS_ORIGINS: z
    .string()
    .min(1)
    .default('http://localhost:3000,http://localhost:3001,https://trade-royale-project.vercel.app'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  UNLINK_API_KEY: z.string().min(1, 'UNLINK_API_KEY is required'),
  // The default is still the TESTNET value: Unlink's published supported-chains list only
  // names testnet environments (no Base-mainnet env name yet). Before a real Base-mainnet game,
  // set UNLINK_ENVIRONMENT to the Base-mainnet environment name obtained from Unlink — the rest
  // of the network defaults (CHAIN_ID/RPC/entry token) are already Base mainnet.
  UNLINK_ENVIRONMENT: z.string().min(1).default('base-sepolia'),
  ENTRY_TOKEN_ADDRESS: evmAddress.default(DEFAULT_ENTRY_TOKEN_ADDRESS),
  MNEMONIC_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'MNEMONIC_ENCRYPTION_KEY must be 32 bytes of hex (64 chars)'),
  DEPOSIT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Optional at boot — only the Anthropic client (lazy-built when a game starts) needs it.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AGENT_MODEL: z.string().min(1).default(DEFAULT_AGENT_MODEL),
  // Minimum ms between an agent's turns — enforced even if the agent asks to wait less.
  MIN_LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_MIN_LOOP_INTERVAL_MS),
  // Seconds the loop waits after a turn when the agent didn't call the wait tool.
  DEFAULT_WAIT_SECONDS: z.coerce.number().int().positive().default(DEFAULT_WAIT_SECONDS),
  // Hard cap on turns per player per game (cost bound). 0 = unlimited.
  AGENT_MAX_TURNS_PER_GAME: z.coerce.number().int().min(0).default(DEFAULT_AGENT_MAX_TURNS_PER_GAME),
  LIFI_API_KEY: z.string().min(1).optional(),
  CHAIN_ID: z.coerce.number().int().positive().default(DEFAULT_CHAIN_ID),
  // Display / portfolio-seed set of well-known Base tokens — NOT a trade whitelist. The
  // agent may trade any token LI.FI can quote on Base; this only seeds get_market and the
  // initial portfolio read (the entry token).
  TRADEABLE_TOKENS: z
    .string()
    .min(1)
    .default(DEFAULT_TRADEABLE_TOKENS)
    .transform((value) => value.split(',').map((token) => token.trim().toLowerCase()))
    .pipe(z.array(evmAddress).min(1, 'TRADEABLE_TOKENS must list at least one address')),
  MAX_SLIPPAGE_BPS: z.coerce.number().int().positive().max(10_000).default(DEFAULT_MAX_SLIPPAGE_BPS),
  // Link the agent to LI.FI's hosted MCP server via the Anthropic MCP connector.
  AGENT_USE_LIFI_MCP: booleanFlag.default('true'),
  LIFI_MCP_URL: z.string().url().default(DEFAULT_LIFI_MCP_URL),
  // Privy server-wallet credentials — optional at boot (the client is lazy-built); only
  // required once a game starts and players need a trading wallet.
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  // Public Base RPC for erc20 reads (allowance/balance/multicall) and receipt waits.
  BASE_RPC_URL: z.string().url().default(DEFAULT_BASE_RPC_URL),
  // Octav NAV API (Phase-3 independent cross-check). Optional at boot — lazy client; only
  // hit at settlement. Key carried as Authorization: Bearer.
  OCTAV_API_KEY: z.string().min(1).optional(),
  OCTAV_API_URL: z.string().url().default(DEFAULT_OCTAV_API_URL),
  // Liquidation dust floor: positions worth less than this base-unit USDC value are skipped.
  LIQUIDATION_MIN_USDC: z
    .string()
    .regex(/^[0-9]+$/, 'LIQUIDATION_MIN_USDC must be a base-unit integer string')
    .default(DEFAULT_LIQUIDATION_MIN_USDC),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    // Fail fast with a readable report; never print the raw process.env (leaks secrets).
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

export const env = loadEnv();
