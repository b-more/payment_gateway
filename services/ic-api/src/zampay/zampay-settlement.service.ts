// Sends the ZamPay settlement callback (PATCH /settlements/callback), the final
// step of the flow — issued only after an operator has wired the funds. The
// amount goes out as a decimal ZMW JSON number; the ngwee->decimal conversion is
// the one place precision matters and lives in zampay-money.

import type { ZampayClient } from './zampay.client';
import type { ZampayGlobalConfig } from './zampay.config';
import type { ZampayDestination } from './zampay-invoice.service';
import { ngweeToZmwNumber } from './zampay-money';

export interface ZampaySettlementCallbackInput {
  paymentReferenceNumber: string; // the operator's bank wire reference
  amountNgwee: bigint; // sum of the services in serviceIds
  currency: string;
  destination: ZampayDestination;
  serviceIds: string[];
  createdAt: string; // YYYY-MM-DD (the wire date)
}

export interface ZampaySettlementCallbackPayload {
  paymentReferenceNumber: string;
  amount: number; // decimal ZMW
  currency: string;
  bicCode: string;
  bankAccountNumber: string;
  sortCode: string;
  accountName: string;
  serviceIds: string[];
  createdAt: string;
}

export class ZampaySettlementService {
  constructor(
    private readonly client: ZampayClient,
    private readonly global: () => ZampayGlobalConfig,
  ) {}

  /** Build the exact callback payload ZamPay expects (unit-tested in isolation). */
  buildPayload(input: ZampaySettlementCallbackInput): ZampaySettlementCallbackPayload {
    return {
      paymentReferenceNumber: input.paymentReferenceNumber,
      amount: ngweeToZmwNumber(input.amountNgwee),
      currency: input.currency,
      bicCode: input.destination.bicCode,
      bankAccountNumber: input.destination.bankAccountNumber,
      sortCode: input.destination.sortCode,
      accountName: input.destination.accountName,
      serviceIds: input.serviceIds,
      createdAt: input.createdAt,
    };
  }

  /** Send the callback. Throws a ZampayError on failure (caller handles retry). */
  async sendCallback(input: ZampaySettlementCallbackInput): Promise<void> {
    const payload = this.buildPayload(input);
    await this.client.patch('/settlements/callback', payload, {
      IdentityName: this.global().identityName,
    });
  }
}
