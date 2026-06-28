import { Injectable } from '@nestjs/common';
import type { OperatingMode, Processor } from '../money/types';

export interface ProcessorRequest {
  msisdn?: string | null;
  amount: bigint;
  reference: string;
}

export interface ProcessorResult {
  status: 'SUCCESS' | 'FAILED';
  reference: string;
  failureReason?: string;
}

/**
 * Payment-processor gateway. SANDBOX accounts get deterministic simulated
 * responses and never reach a live MNO/card endpoint (TXN-5). PRODUCTION
 * dispatch is intentionally not wired in this build.
 */
@Injectable()
export class ProcessorService {
  async dispatch(
    mode: OperatingMode,
    processor: Processor,
    request: ProcessorRequest,
  ): Promise<ProcessorResult> {
    if (mode === 'SANDBOX') {
      return Promise.resolve(this.simulate(processor, request));
    }
    // Live MNO/card integration is out of scope for this build (TXN-5 boundary).
    throw new Error('live processor integration is not configured');
  }

  // Deterministic so tests can force either path: an MSISDN ending in 0000 declines.
  private simulate(processor: Processor, request: ProcessorRequest): ProcessorResult {
    const reference = `SIM-${processor}-${request.reference}`;
    if ((request.msisdn ?? '').endsWith('0000')) {
      return { status: 'FAILED', reference, failureReason: 'SIMULATED_DECLINE' };
    }
    return { status: 'SUCCESS', reference };
  }
}
