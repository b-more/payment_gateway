import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentPrincipal, RequireScope, Roles, type Principal } from '../auth/principal';
import { randomUUID } from 'node:crypto';
import { MerchantReadService } from './merchant-read.service';
import { ReportService } from '../reports/report.service';
import { CreateReportDto } from '../reports/report.dto';
import { ValidationError } from '../money/errors';
import { UpdateSettingsDto } from './dto/merchant.dto';
import { MerchantCollectDto } from './dto/collect.dto';
import { TransactionService } from '../transactions/transaction.service';
import { toNgwee } from '../money/money';
import { serializeTransaction, type TransactionResponse } from '../api/serializers';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { airtelGlobalConfig } from '../airtel/airtel.config';
import type { GeneratedCredential } from '../credentials/credential.service';

// Merchant portal API (§6.2). MERCHANT realm; every handler is scoped to the
// principal's merchant id at the data layer (NN-6/SEC-Z2).
@ApiTags('merchant')
@Controller('merchant')
@RequireScope('MERCHANT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantController {
  constructor(
    private readonly read: MerchantReadService,
    private readonly reports: ReportService,
    private readonly txns: TransactionService,
    private readonly airtel: AirtelDispatchService,
  ) {}

  private merchantId(principal: Principal): string {
    return MerchantReadService.requireMerchant(principal.merchantId);
  }

  // ── Collections (§6.2) — initiate a collection from the portal ──

  @Post('accounts/:id/collect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Initiate a collection from one of your accounts' })
  async collect(
    @Param('id') accountId: string,
    @Body() dto: MerchantCollectDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<TransactionResponse> {
    const merchantId = this.merchantId(p);
    const { operatingMode } = await this.read.assertOwnedAccount(merchantId, accountId);
    const input = {
      accountId,
      type: 'COLLECTION' as const,
      processor: dto.processor,
      amount: toNgwee(dto.amount),
      msisdn: dto.msisdn,
      idempotencyKey: randomUUID(),
      collectionReference: dto.reference ?? null,
      environment: operatingMode,
      actorId: p.userId,
    };

    // SANDBOX: simulate + resolve immediately so merchants see a result (TXN-5).
    if (operatingMode === 'SANDBOX') {
      return serializeTransaction(await this.txns.processAndSettle(input));
    }

    // PRODUCTION: create the PROCESSING transaction, then dispatch live.
    const record = await this.txns.processTransaction(input);
    if (airtelGlobalConfig().enabled && dto.processor === 'AIRTEL' && record.status === 'PROCESSING') {
      await this.airtel.dispatchCollection({
        id: record.id,
        msisdn: dto.msisdn,
        amountNgwee: record.amount,
        reference: dto.reference ?? record.id,
      });
      return serializeTransaction(await this.txns.getForAccount(accountId, record.id));
    }
    return serializeTransaction(record);
  }

  @Get('accounts/:id/transactions/:txnId/status')
  @ApiOperation({ summary: 'Poll a collection status (re-enquires the rail on read)' })
  async transactionStatus(
    @Param('id') accountId: string,
    @Param('txnId') txnId: string,
    @CurrentPrincipal() p: Principal,
  ): Promise<TransactionResponse> {
    const merchantId = this.merchantId(p);
    await this.read.assertOwnedAccount(merchantId, accountId);
    // Resolve-on-read: if the collection is still in flight, ask Airtel now so the
    // portal updates in real time (the reconcile job is the backstop).
    if (airtelGlobalConfig().enabled) {
      try {
        await this.airtel.resolveByTransactionId(txnId);
      } catch {
        // Enquiry failure must not break a status read.
      }
    }
    return serializeTransaction(await this.txns.getForAccount(accountId, txnId));
  }

  // ── Reports (§6.2.5), scoped to this merchant ──

  @Post('reports')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a report (scoped to this merchant)' })
  createReport(@CurrentPrincipal() p: Principal, @Body() dto: CreateReportDto): Promise<{ id: string }> {
    return this.reports.createReport({
      merchantId: this.merchantId(p),
      name: dto.name,
      reportType: dto.reportType,
      from: dto.from,
      to: dto.to,
      actorId: p.userId,
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'List this merchant’s reports' })
  listReports(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.reports.listReports(this.merchantId(p));
  }

  @Get('reports/:id/export')
  @ApiOperation({ summary: 'Download a report as CSV' })
  async exportReport(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } = await this.reports.exportCsv(id, this.merchantId(p));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('reports/:id/pdf')
  @ApiOperation({ summary: 'Download a report as a branded PDF' })
  async exportReportPdf(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, pdf } = await this.reports.exportPdf(id, this.merchantId(p));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Merchant dashboard (scoped)' })
  dashboard(@CurrentPrincipal() p: Principal): Promise<unknown> {
    return this.read.dashboard(this.merchantId(p));
  }

  @Get('accounts')
  @ApiOperation({ summary: 'This merchant’s accounts' })
  accounts(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.read.accounts(this.merchantId(p));
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transaction history (scoped, filterable)' })
  transactions(
    @CurrentPrincipal() p: Principal,
    @Query('msisdn') msisdn?: string,
    @Query('reference') reference?: string,
    @Query('processor') processor?: string,
    @Query('status') status?: string,
  ): Promise<unknown[]> {
    return this.read.transactions(this.merchantId(p), {
      msisdn: msisdn ?? null,
      reference: reference ?? null,
      processor: processor ?? null,
      status: status ?? null,
    });
  }

  @Get('settlements')
  @ApiOperation({ summary: 'Settlement history (scoped)' })
  settlements(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.read.settlements(this.merchantId(p));
  }

  @Get('credentials')
  @ApiOperation({ summary: 'API credentials (public metadata only)' })
  credentials(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.read.listCredentials(this.merchantId(p));
  }

  @Get('users')
  @ApiOperation({ summary: 'Sub-users under this merchant' })
  users(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.read.users(this.merchantId(p));
  }

  @Put('accounts/:id/settings')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Update webhook URL + IP whitelist' })
  updateSettings(
    @CurrentPrincipal() p: Principal,
    @Param('id') accountId: string,
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ accountId: string }> {
    return this.read.updateSettings(
      this.merchantId(p),
      accountId,
      { callbackUrl: dto.callbackUrl ?? null, ipWhitelist: dto.ipWhitelist ?? null },
      p.userId,
    );
  }

  @Post('accounts/:id/credentials/:env/regenerate')
  @HttpCode(201)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Regenerate a credential pair (old keys revoked)' })
  regenerate(
    @CurrentPrincipal() p: Principal,
    @Param('id') accountId: string,
    @Param('env') env: string,
  ): Promise<GeneratedCredential> {
    if (env !== 'SANDBOX' && env !== 'LIVE') throw new ValidationError('env must be SANDBOX or LIVE');
    return this.read.regenerateCredential(this.merchantId(p), accountId, env, p.userId);
  }
}
