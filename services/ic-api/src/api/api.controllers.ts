import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionService } from '../transactions/transaction.service';
import { toNgwee } from '../money/money';
import { NotFoundError } from '../money/errors';
import { ApiAuthGuard } from './api-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { ApiReadService, type BalanceResponse, type SettlementResponse } from './read.service';
import { serializeTransaction, type TransactionResponse } from './serializers';
import { ApiAuthHeaders, ApiIdempotencyHeader } from './swagger';
import {
  AuthedRequest,
  CurrentCredential,
  getClientIp,
  requireIdempotencyKey,
} from './request-context';
import { environmentToMode } from '../credentials/crypto';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { airtelGlobalConfig } from '../airtel/airtel.config';
import { CollectionDto } from './dto/collection.dto';
import { DisbursementDto } from './dto/disbursement.dto';
import { ReverseDto } from './dto/reverse.dto';
import type { CredentialContext } from '../credentials/credential.service';

// Every /v1 controller is gated by rate limiting (SEC-API6) then HMAC auth
// (SEC-API2/3/4). All work is scoped to the authenticated credential's account.

@ApiTags('collections')
@ApiAuthHeaders()
@Controller('collections')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class CollectionsController {
  constructor(
    private readonly txns: TransactionService,
    private readonly airtel: AirtelDispatchService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Initiate a collection (customer → merchant)' })
  async create(
    @CurrentCredential() cred: CredentialContext,
    @Body() dto: CollectionDto,
    @Req() req: AuthedRequest,
  ): Promise<TransactionResponse> {
    const idempotencyKey = requireIdempotencyKey(req);
    const record = await this.txns.processTransaction({
      accountId: cred.accountId,
      type: 'COLLECTION',
      processor: dto.processor,
      amount: toNgwee(dto.amount),
      msisdn: dto.msisdn ?? null,
      idempotencyKey,
      collectionReference: dto.collectionReference ?? null,
      environment: environmentToMode(cred.environment),
      actorId: cred.credentialId,
    });

    // Live Airtel dispatch: only for a fresh PROCESSING, PRODUCTION AIRTEL
    // collection, and only when enabled. Otherwise behaviour is unchanged
    // (returns PROCESSING; resolution comes via callback/reconciliation).
    if (
      airtelGlobalConfig().enabled &&
      dto.processor === 'AIRTEL' &&
      record.status === 'PROCESSING' &&
      record.environment === 'PRODUCTION' &&
      dto.msisdn
    ) {
      await this.airtel.dispatchCollection({
        id: record.id,
        msisdn: dto.msisdn,
        amountNgwee: record.amount,
        reference: dto.collectionReference ?? record.id,
      });
      // Return the latest state (dispatch may have resolved it synchronously).
      return serializeTransaction(await this.txns.getForAccount(cred.accountId, record.id));
    }
    return serializeTransaction(record);
  }
}

@ApiTags('disbursements')
@ApiAuthHeaders()
@Controller('disbursements')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class DisbursementsController {
  constructor(private readonly txns: TransactionService) {}

  @Post()
  @HttpCode(200)
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Initiate a disbursement (merchant → customer)' })
  async create(
    @CurrentCredential() cred: CredentialContext,
    @Body() dto: DisbursementDto,
    @Req() req: AuthedRequest,
  ): Promise<TransactionResponse> {
    const idempotencyKey = requireIdempotencyKey(req);
    const record = await this.txns.processTransaction({
      accountId: cred.accountId,
      type: 'DISBURSEMENT',
      processor: dto.processor,
      amount: toNgwee(dto.amount),
      msisdn: dto.msisdn,
      idempotencyKey,
      collectionReference: dto.collectionReference ?? null,
      environment: environmentToMode(cred.environment),
      actorId: cred.credentialId,
    });
    return serializeTransaction(record);
  }
}

@ApiTags('transactions')
@ApiAuthHeaders()
@Controller('transactions')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class TransactionsController {
  constructor(private readonly txns: TransactionService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Check transaction status' })
  async status(
    @CurrentCredential() cred: CredentialContext,
    @Param('id') id: string,
  ): Promise<TransactionResponse> {
    const record = await this.txns.getForAccount(cred.accountId, id);
    return serializeTransaction(record);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @ApiIdempotencyHeader()
  @ApiOperation({ summary: 'Reverse a successful transaction' })
  async reverse(
    @CurrentCredential() cred: CredentialContext,
    @Param('id') id: string,
    @Body() dto: ReverseDto,
    @Req() req: AuthedRequest,
  ): Promise<TransactionResponse> {
    requireIdempotencyKey(req); // IDEM-1
    const record = await this.txns.reverseTransaction({
      transactionId: id,
      accountId: cred.accountId,
      actorId: cred.credentialId,
      reason: dto.reason ?? null,
      ipAddress: getClientIp(req),
    });
    return serializeTransaction(record);
  }
}

@ApiTags('accounts')
@ApiAuthHeaders()
@Controller('accounts')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class AccountsController {
  constructor(private readonly read: ApiReadService) {}

  @Get(':id/balance')
  @ApiOperation({ summary: 'Float/balance enquiry' })
  async balance(
    @CurrentCredential() cred: CredentialContext,
    @Param('id') id: string,
  ): Promise<BalanceResponse> {
    if (id !== cred.accountId) {
      throw new NotFoundError(`account not found: ${id}`); // scope to the key's account (NN-6)
    }
    return this.read.getBalance(cred.accountId);
  }
}

@ApiTags('settlements')
@ApiAuthHeaders()
@Controller('settlements')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class SettlementsController {
  constructor(private readonly read: ApiReadService) {}

  @Get()
  @ApiOperation({ summary: 'List settlements for the account' })
  async list(@CurrentCredential() cred: CredentialContext): Promise<SettlementResponse[]> {
    return this.read.listSettlements(cred.accountId);
  }
}
