// Reads ZamPay invoices and turns them into settlement instructions.
//
// A collection carries a ZamPay reference (usually a transactionNumber, sometimes
// an invoiceNumber). We resolve it to one or more invoices, then group each
// invoice's services by their destination bank account — because the settlement
// callback is destination-centric (serviceIds + one account + a summed amount),
// not invoice-centric. Services on one invoice pointing at different accounts
// therefore become separate groups (and separate callbacks).

import { ZampayError } from './zampay.errors';
import type { ZampayClient } from './zampay.client';
import { zmwNumberToNgwee } from './zampay-money';

export interface ZampayDestination {
  bankAccountNumber: string;
  bicCode: string;
  sortCode: string;
  accountName: string;
  bankName: string;
}

export interface ZampaySettlementGroup {
  destination: ZampayDestination;
  serviceIds: string[];
  amountNgwee: bigint;
  currency: string;
}

export interface ZampayInvoiceResolution {
  invoiceNumber: string;
  transactionNumber: string | null;
  status: string; // e.g. "NotPaid" | "Paid"
  currency: string;
  groups: ZampaySettlementGroup[];
}

interface TxnResponse {
  number?: string;
  invoiceNumbers?: string[];
}

interface InvoiceServiceRow {
  id: string;
  amountDue: number; // decimal ZMW
  destinationAccount: ZampayDestination;
}
interface InvoiceResponse {
  invoiceNumber: string;
  status: string;
  currency: string;
  services?: InvoiceServiceRow[];
}

function destinationKey(d: ZampayDestination): string {
  return `${d.bicCode}|${d.bankAccountNumber}|${d.sortCode}`;
}

export class ZampayInvoiceService {
  constructor(private readonly client: ZampayClient) {}

  /**
   * Resolve a ZamPay reference to its invoice(s) and settlement groups. Tries the
   * transaction endpoint first (the usual case) and falls back to treating the
   * reference as an invoice number on a 404.
   */
  async resolve(reference: string): Promise<ZampayInvoiceResolution[]> {
    let invoiceNumbers: string[] = [];
    let transactionNumber: string | null = null;

    try {
      const txn = await this.client.get<TxnResponse>(`/transactions/${encodeURIComponent(reference)}`);
      transactionNumber = txn.body.number ?? reference;
      invoiceNumbers = txn.body.invoiceNumbers ?? [];
    } catch (e) {
      if (e instanceof ZampayError && e.kind === 'NOT_FOUND') {
        invoiceNumbers = [reference]; // the reference was itself an invoice number
      } else {
        throw e;
      }
    }

    const out: ZampayInvoiceResolution[] = [];
    for (const inv of invoiceNumbers) {
      out.push(await this.readInvoice(inv, transactionNumber));
    }
    return out;
  }

  private async readInvoice(
    invoiceNumber: string,
    transactionNumber: string | null,
  ): Promise<ZampayInvoiceResolution> {
    const res = await this.client.get<InvoiceResponse>(`/invoices/${encodeURIComponent(invoiceNumber)}`);
    const inv = res.body;

    const groups = new Map<string, ZampaySettlementGroup>();
    for (const s of inv.services ?? []) {
      const d = s.destinationAccount;
      const amt = zmwNumberToNgwee(s.amountDue);
      const key = destinationKey(d);
      const g = groups.get(key);
      if (g) {
        g.serviceIds.push(s.id);
        g.amountNgwee += amt;
      } else {
        groups.set(key, { destination: { ...d }, serviceIds: [s.id], amountNgwee: amt, currency: inv.currency });
      }
    }

    return {
      invoiceNumber: inv.invoiceNumber,
      transactionNumber,
      status: inv.status,
      currency: inv.currency,
      groups: [...groups.values()],
    };
  }

  /** Optional pre-wire destination validation. */
  async validateAccount(d: ZampayDestination): Promise<boolean> {
    const q = new URLSearchParams({
      bicCode: d.bicCode,
      bankAccountNumber: d.bankAccountNumber,
      sortCode: d.sortCode,
      accountName: d.accountName,
    });
    const res = await this.client.get<{ isValid?: boolean }>(`/accounts/validate?${q.toString()}`);
    return res.body.isValid === true;
  }
}
