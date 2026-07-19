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
import { NotFoundError, ValidationError } from '../money/errors';
import { assertRailReady } from '../transactions/rails';
import { ApiAuthGuard } from './api-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { ApiReadService, type BalanceResponse, type SettlementResponse } from './read.service';
import { serializeTransaction, type TransactionResponse } from './serializers';
import { ApiAuthHeaders, ApiIdempotencyHeader } from './swagger';
import {
  AuthedRequest,
  CurrentCredential,
  requireIdempotencyKey,
} from './request-context';
import { environmentToMode } from '../credentials/crypto';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { MtnDispatchService } from '../mtn/mtn-dispatch.service';
import { CollectionDto } from './dto/collection.dto';
import { DisbursementDto } from './dto/disbursement.dto';
import type { CredentialContext } from '../credentials/credential.service';

// Every /v1 controller is gated by rate limiting (SEC-API6) then auth
// (SEC-API2/3/4). All work is scoped to the authenticated credential's account.

@ApiTags('collections')
@ApiAuthHeaders()
@Controller('collections')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class CollectionsController {
  constructor(
    private readonly txns: TransactionService,
    private readonly airtel: AirtelDispatchService,
    private readonly mtn: MtnDispatchService,
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
    const environment = environmentToMode(cred.environment);
    const input = {
      accountId: cred.accountId,
      type: 'COLLECTION' as const,
      processor: dto.processor,
      amount: toNgwee(dto.amount),
      msisdn: dto.msisdn ?? null,
      idempotencyKey,
      collectionReference: dto.collectionReference ?? null,
      environment,
      actorId: cred.credentialId,
    };

    // The rail check runs in BOTH environments: sandbox must not accept a rail
    // that production would reject, or an integrator certifies against a rail
    // that fails the day they go live.
    assertRailReady(dto.processor);

    // SANDBOX simulates and settles, so integrators can exercise the full
    // lifecycle (PROCESSING -> SUCCESS) without a live rail or any float.
    if (environment === 'SANDBOX') {
      return serializeTransaction(await this.txns.processAndSettle(input));
    }

    if (!dto.msisdn) throw new ValidationError('msisdn is required for a production collection');

    const record = await this.txns.processTransaction(input);
    if (record.status === 'PROCESSING') {
      const reference = dto.collectionReference ?? record.id;
      if (dto.processor === 'AIRTEL') {
        await this.airtel.dispatchCollection({ id: record.id, msisdn: dto.msisdn, amountNgwee: record.amount, reference });
      } else {
        await this.mtn.dispatchCollection({ id: record.id, msisdn: dto.msisdn, amountNgwee: record.amount, externalId: reference });
      }
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
  constructor(
    private readonly txns: TransactionService,
    private readonly airtel: AirtelDispatchService,
    private readonly mtn: MtnDispatchService,
  ) {}

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
    const environment = environmentToMode(cred.environment);
    const input = {
      accountId: cred.accountId,
      type: 'DISBURSEMENT' as const,
      processor: dto.processor,
      amount: toNgwee(dto.amount),
      msisdn: dto.msisdn,
      idempotencyKey,
      collectionReference: dto.collectionReference ?? null,
      environment,
      actorId: cred.credentialId,
    };

    // Checked in both environments so sandbox can't certify a rail that
    // production would reject (see the collections handler).
    assertRailReady(dto.processor);

    if (environment === 'SANDBOX') {
      return serializeTransaction(await this.txns.processAndSettle(input));
    }

    const record = await this.txns.processTransaction(input);
    // Actually push the money out. Without this the transaction sat PROCESSING
    // forever with float debited and nothing ever sent to the customer.
    if (record.status === 'PROCESSING') {
      const reference = dto.collectionReference ?? record.id;
      const actor = `api:${cred.credentialId}`;
      if (dto.processor === 'AIRTEL') {
        await this.airtel.dispatchDisbursement({ id: record.id, msisdn: dto.msisdn, amountNgwee: record.amount, reference }, actor);
      } else {
        await this.mtn.dispatchDisbursement({ id: record.id, msisdn: dto.msisdn, amountNgwee: record.amount, externalId: reference }, actor);
      }
      return serializeTransaction(await this.txns.getForAccount(cred.accountId, record.id));
    }
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
