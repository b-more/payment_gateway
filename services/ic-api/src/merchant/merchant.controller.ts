import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
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
import { MerchantCollectDto, PayoutRejectDto } from './dto/collect.dto';
import { CreateMerchantUserDto, AssignRoleDto, SetUserStatusDto } from './dto/user.dto';
import { PayoutService } from './payout.service';
import { MerchantUserService } from './merchant-user.service';
import { DeviceService, type DeviceSummary } from '../devices/device.service';
import { CreateDeviceDto } from '../devices/dto/create-device.dto';
import { TransactionService } from '../transactions/transaction.service';
import { assertRailReady } from '../transactions/rails';
import { toNgwee } from '../money/money';
import { serializeTransaction, type TransactionResponse } from '../api/serializers';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { airtelGlobalConfig } from '../airtel/airtel.config';
import { MtnDispatchService } from '../mtn/mtn-dispatch.service';
import { mtnGlobalConfig } from '../mtn/mtn.config';
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
    private readonly mtn: MtnDispatchService,
    private readonly payouts: PayoutService,
    private readonly memberUsers: MerchantUserService,
    private readonly devices: DeviceService,
  ) {}

  private merchantId(principal: Principal): string {
    return MerchantReadService.requireMerchant(principal.merchantId);
  }

  // ── Collections (§6.2) — initiate a collection from the portal ──

  @Post('accounts/:id/collect')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN', 'MERCHANT_INITIATOR') // initiator runs collections (parity with disburse)
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

    // PRODUCTION: refuse before any float is debited if the rail can't dispatch —
    // otherwise the transaction sits PROCESSING forever with the money gone.
    assertRailReady(dto.processor);

    const record = await this.txns.processTransaction(input);
    if (record.status === 'PROCESSING') {
      const reference = dto.reference ?? record.id;
      // Debit the payer the GROSS, matching the public /v1/collections path.
      // Under SOURCE the customer owes amount + charge; sending `amount` here
      // would credit the merchant the full amount and leave nothing for the
      // fee. Under MERCHANT the two are equal.
      const payerOwes = record.totalAmount;
      if (dto.processor === 'AIRTEL') {
        await this.airtel.dispatchCollection({ id: record.id, msisdn: dto.msisdn, amountNgwee: payerOwes, reference });
      } else {
        await this.mtn.dispatchCollection({ id: record.id, msisdn: dto.msisdn, amountNgwee: payerOwes, externalId: reference });
      }
      return serializeTransaction(await this.txns.getForAccount(accountId, record.id));
    }
    return serializeTransaction(record);
  }

  // ── Payouts (maker-checker, SEC-Z4) ──

  @Post('accounts/:id/disburse')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN', 'MERCHANT_INITIATOR') // maker: requests the payout
  @ApiOperation({ summary: 'Request a payout (parked for an approver to release)' })
  async disburse(
    @Param('id') accountId: string,
    @Body() dto: MerchantCollectDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ id: string; status: string }> {
    const merchantId = this.merchantId(p);
    await this.read.assertOwnedAccount(merchantId, accountId);
    return this.payouts.requestPayout({
      merchantId,
      accountId,
      processor: dto.processor,
      amountNgwee: toNgwee(dto.amount),
      msisdn: dto.msisdn,
      reference: dto.reference ?? null,
      requestedBy: p.userId,
    });
  }

  @Get('payout-requests')
  @Roles('MERCHANT_ADMIN', 'MERCHANT_INITIATOR', 'MERCHANT_APPROVER')
  @ApiOperation({ summary: 'List payout requests (add ?status=pending for the approval queue)' })
  listPayouts(@CurrentPrincipal() p: Principal, @Query('status') status?: string): Promise<unknown[]> {
    return this.payouts.list(this.merchantId(p), status === 'pending');
  }

  @Post('payout-requests/:id/approve')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN', 'MERCHANT_APPROVER') // checker: releases the payout
  @ApiOperation({ summary: 'Approve + dispatch a payout (must differ from the requester)' })
  approvePayout(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<TransactionResponse> {
    return this.payouts.approve({ requestId: id, merchantId: this.merchantId(p), approverId: p.userId });
  }

  @Post('payout-requests/:id/reject')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN', 'MERCHANT_APPROVER')
  @ApiOperation({ summary: 'Reject a pending payout (must differ from the requester)' })
  rejectPayout(
    @Param('id') id: string,
    @Body() dto: PayoutRejectDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ ok: true }> {
    return this.payouts.reject({ requestId: id, merchantId: this.merchantId(p), approverId: p.userId, reason: dto.reason });
  }

  @Post('payout-requests/:id/cancel')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN', 'MERCHANT_INITIATOR')
  @ApiOperation({ summary: 'Cancel your own pending payout request' })
  cancelPayout(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<{ ok: true }> {
    return this.payouts.cancel({ requestId: id, merchantId: this.merchantId(p), userId: p.userId });
  }

  @Get('accounts/:id/transactions/:txnId/status')
  @ApiOperation({ summary: 'Poll a collection/disbursement status (re-enquires the rail on read)' })
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
    if (mtnGlobalConfig().enabled) {
      try {
        await this.mtn.resolveByTransactionId(txnId);
      } catch {
        // ditto
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

  @Get('zampay/settlements')
  @ApiOperation({ summary: 'GSB (ZamPay) settlements — read-only, ?search= by batch ref / IBR / invoice' })
  zampaySettlements(
    @CurrentPrincipal() p: Principal,
    @Query('search') search?: string,
  ): Promise<unknown[]> {
    return this.read.zampaySettlements(this.merchantId(p), search ?? null);
  }

  @Get('credentials')
  @ApiOperation({ summary: 'API credentials (public metadata only)' })
  credentials(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.read.listCredentials(this.merchantId(p));
  }

  // ── Terminals (Z100 POS device registration) ──

  @Get('devices')
  @ApiOperation({ summary: 'List this merchant’s registered POS terminals' })
  listDevices(@CurrentPrincipal() p: Principal): Promise<DeviceSummary[]> {
    return this.devices.listDevices(this.merchantId(p));
  }

  @Post('devices')
  @HttpCode(201)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Register a POS terminal; returns a one-time activation code' })
  async registerDevice(
    @CurrentPrincipal() p: Principal,
    @Body() dto: CreateDeviceDto,
  ): Promise<{ device_id: string; label: string; activation_code: string; activation_expires_at: string }> {
    const d = await this.devices.createDevice({
      merchantId: this.merchantId(p),
      accountId: dto.accountId,
      label: dto.label,
      actorId: p.userId,
    });
    return { device_id: d.deviceId, label: d.label, activation_code: d.activationCode, activation_expires_at: d.activationExpiresAt };
  }

  @Post('devices/:id/revoke')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Revoke a terminal (its credential stops working immediately)' })
  async revokeDevice(@CurrentPrincipal() p: Principal, @Param('id') id: string): Promise<{ ok: true }> {
    await this.devices.revokeDevice({ deviceId: id, merchantId: this.merchantId(p), actorId: p.userId });
    return { ok: true };
  }

  // ── User management (§6.2) — merchant admin staffs their own account ──

  @Get('users')
  @ApiOperation({ summary: 'Sub-users under this merchant, with their roles' })
  users(@CurrentPrincipal() p: Principal): Promise<unknown[]> {
    return this.memberUsers.list(this.merchantId(p));
  }

  @Get('roles')
  @ApiOperation({ summary: 'Roles a merchant admin can assign' })
  merchantRoles(): Array<{ name: string; description: string }> {
    return this.memberUsers.roles();
  }

  @Post('users')
  @HttpCode(201)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Add a user and assign roles (initiator/approver/…)' })
  createUser(@CurrentPrincipal() p: Principal, @Body() dto: CreateMerchantUserDto): Promise<{ userId: string }> {
    return this.memberUsers.create({
      merchantId: this.merchantId(p),
      actorId: p.userId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      password: dto.password,
      roles: dto.roles,
    });
  }

  @Post('users/:id/roles')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Grant a role to a user' })
  async assignUserRole(
    @CurrentPrincipal() p: Principal,
    @Param('id') userId: string,
    @Body() dto: AssignRoleDto,
  ): Promise<{ ok: true }> {
    await this.memberUsers.assignRole(this.merchantId(p), userId, dto.role, p.userId);
    return { ok: true };
  }

  @Delete('users/:id/roles/:role')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Revoke a role from a user' })
  async removeUserRole(
    @CurrentPrincipal() p: Principal,
    @Param('id') userId: string,
    @Param('role') role: string,
  ): Promise<{ ok: true }> {
    await this.memberUsers.removeRole(this.merchantId(p), userId, role, p.userId);
    return { ok: true };
  }

  @Post('users/:id/status')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Activate or suspend a user' })
  async setUserStatus(
    @CurrentPrincipal() p: Principal,
    @Param('id') userId: string,
    @Body() dto: SetUserStatusDto,
  ): Promise<{ ok: true }> {
    await this.memberUsers.setStatus(this.merchantId(p), userId, dto.status, p.userId);
    return { ok: true };
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

  @Get('accounts/:id/webhook-secret')
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Reveal the webhook signing secret (to verify X-Instacompay-Signature)' })
  webhookSecret(
    @CurrentPrincipal() p: Principal,
    @Param('id') accountId: string,
  ): Promise<{ webhookSecret: string }> {
    return this.read.webhookSecret(this.merchantId(p), accountId);
  }

  @Post('accounts/:id/webhook-secret/rotate')
  @HttpCode(200)
  @Roles('MERCHANT_ADMIN')
  @ApiOperation({ summary: 'Rotate the webhook signing secret (old signatures stop verifying)' })
  rotateWebhookSecret(
    @CurrentPrincipal() p: Principal,
    @Param('id') accountId: string,
  ): Promise<{ webhookSecret: string }> {
    return this.read.rotateWebhookSecret(this.merchantId(p), accountId, p.userId);
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
