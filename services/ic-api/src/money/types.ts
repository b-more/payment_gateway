// Shared domain enums (mirror the §4 schema enum types).

export type Processor = 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'ZED_MOBILE' | 'VISA';
export type AccountType = 'COLLECTION' | 'DISBURSEMENT' | 'OVA' | 'BANK';
export type OperatingMode = 'SANDBOX' | 'PRODUCTION';
export type TransactionType = 'COLLECTION' | 'DISBURSEMENT';
export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REVERSED'
  | 'EXPIRED';
export type LedgerEntryType = 'CREDIT' | 'DEBIT';
export type ChargeType = 'FIXED' | 'PERCENTAGE' | 'TIERED';
export type ChargeFulfiller = 'SOURCE' | 'MERCHANT';
export type ActorScope = 'SYSTEM' | 'MERCHANT';
