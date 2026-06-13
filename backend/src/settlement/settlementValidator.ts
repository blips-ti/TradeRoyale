import type { Settlement } from "../domain/types.js";

export interface ValidationResult {
  approved: boolean;
  reason: string;
}

// Extension point for CRE on-chain settlement validation (owned by teammates). The real
// validator verifies the computed settlement against on-chain state before any payout fires;
// plug it in here in place of NoopSettlementValidator (e.g. via SettlementService's ctor).
export interface SettlementValidator {
  validate(settlement: Settlement): Promise<ValidationResult>;
}

// Default validator: never approves, so payout stays gated until the CRE validator lands.
export class NoopSettlementValidator implements SettlementValidator {
  async validate(_settlement: Settlement): Promise<ValidationResult> {
    return { approved: false, reason: "CRE validation pending — owned by teammates" };
  }
}

export const noopSettlementValidator = new NoopSettlementValidator();
