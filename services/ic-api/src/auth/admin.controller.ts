import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CurrentPrincipal, RequireScope, Roles, type Principal } from './principal';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AccountProvisioningService, type ProvisionResult } from '../onboarding/account-provisioning.service';
import { FloatService } from '../float/float.service';
import { TransactionService } from '../transactions/transaction.service';
import { AdminReadService, type DashboardSummary, type CommissionSummary } from './admin-read.service';
import { AccountConfigService } from './admin-config.service';
import { UserAdminService } from './user-admin.service';
import { SecurityService } from './security.service';
import { NotificationsService } from './notifications.service';
import { ReportService } from '../reports/report.service';
import { CreateReportDto } from '../reports/report.dto';
import { ChargeConfigDto, AdminSettingsDto, ModeDto } from './dto/admin-config.dto';
import { CreateUserDto, AssignRoleDto, CreateRoleDto } from './dto/user-admin.dto';
import { ZampayBatchReferenceDto } from './dto/zampay-batch-reference.dto';
import { serializeTransaction, type TransactionResponse } from '../api/serializers';
import { toNgwee } from '../money/money';
import { getClientIp } from '../api/request-context';
import type { AuthedPortalRequest } from './principal';
import { Req } from '@nestjs/common';
import {
  AirtelDisburseDto,
  FloatCreditDto,
  FloatRejectDto,
  ProvisionDto,
  ReviewDto,
  SettlementConfirmDto,
  SettlementFailDto,
} from './dto/auth.dto';
import { SettlementService } from '../settlements/settlement.service';
import { ZampayOrchestrationService } from '../zampay/zampay-orchestration.service';
import { ApplicationDto } from '../onboarding/dto/application.dto';
import { AirtelKycService } from '../airtel/airtel-kyc.service';
import { AirtelBalanceService, type BalanceType } from '../airtel/airtel-balance.service';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { MtnDispatchService } from '../mtn/mtn-dispatch.service';

// Admin portal actions, gated server-side (SEC-Z1). All require the SYSTEM realm
// and the elevated role each operation calls for (SEC-Z3). This is where the
// onboarding/float admin actions deferred from §5.1 are finally exposed.
@ApiTags('admin')
@Controller('admin')
@RequireScope('SYSTEM')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly provisioning: AccountProvisioningService,
    private readonly floats: FloatService,
    private readonly settlements: SettlementService,
    private readonly zampay: ZampayOrchestrationService,
    private readonly transactions: TransactionService,
    private readonly read: AdminReadService,
    private readonly config: AccountConfigService,
    private readonly users: UserAdminService,
    private readonly security: SecurityService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportService,
    private readonly airtelKyc: AirtelKycService,
    private readonly airtelBalance: AirtelBalanceService,
    private readonly airtelDispatch: AirtelDispatchService,
    private readonly mtnDispatch: MtnDispatchService,
  ) {}

  // ── Airtel operations (§ integration) — staff-only ────────────────────────

  @Get('airtel/kyc/:msisdn')
  @Roles('ADMIN', 'COMPLIANCE') // KYC is personal data (SEC-Z3)
  @ApiOperation({ summary: 'Validate an Airtel payer (KYC pre-check)' })
  airtelKycLookup(@Param('msisdn') msisdn: string): Promise<unknown> {
    return this.airtelKyc.validatePayer(msisdn);
  }

  @Get('airtel/balance')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Airtel wallet balance (feature-flagged)' })
  airtelBalanceEnquiry(@Query('type') type?: string): Promise<unknown> {
    const t: BalanceType = type === 'DISB' ? 'DISB' : 'COLL';
    return this.airtelBalance.balance(t);
  }

  @Post('airtel/disbursements/:txnId/dispatch')
  @HttpCode(200)
  @Roles('ADMIN') // disbursements move money out — human approval gate (SEC-Z4)
  @ApiOperation({ summary: 'Approve + dispatch an Airtel B2C disbursement' })
  async airtelDispatchDisbursement(
    @Param('txnId') txnId: string,
    @Body() dto: AirtelDisburseDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    // The admin acting here IS the approval; record who approved it.
    return this.airtelDispatch.dispatchDisbursement(
      { id: txnId, msisdn: dto.msisdn, amountNgwee: toNgwee(dto.amount), reference: dto.reference ?? txnId },
      `admin:${principal.userId}`,
    );
  }

  @Post('mtn/disbursements/:txnId/dispatch')
  @HttpCode(200)
  @Roles('ADMIN') // disbursements move money out — human approval gate (SEC-Z4)
  @ApiOperation({ summary: 'Approve + dispatch an MTN disbursement' })
  async mtnDispatchDisbursement(
    @Param('txnId') txnId: string,
    @Body() dto: AirtelDisburseDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    return this.mtnDispatch.dispatchDisbursement(
      { id: txnId, msisdn: dto.msisdn, amountNgwee: toNgwee(dto.amount), externalId: dto.reference ?? txnId },
      `admin:${principal.userId}`,
    );
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Operator alert centre (derived alerts)' })
  alerts(): Promise<unknown> {
    return this.notifications.list();
  }

  // ── Reports (§6.1.5) ──

  @Post('reports')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a report (records type + date range)' })
  createReport(
    @Body() dto: CreateReportDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    return this.reports.createReport({
      merchantId: null,
      name: dto.name,
      reportType: dto.reportType,
      from: dto.from,
      to: dto.to,
      actorId: principal.userId,
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'List reports' })
  listReports(): Promise<unknown[]> {
    return this.reports.listReports(null);
  }

  @Get('reports/:id/export')
  @ApiOperation({ summary: 'Download a report as CSV' })
  async exportReport(@Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { filename, csv } = await this.reports.exportCsv(id, null);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get('reports/:id/pdf')
  @ApiOperation({ summary: 'Download a report as a branded PDF' })
  async exportReportPdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { filename, pdf } = await this.reports.exportPdf(id, null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  // ── Security: audit log + sessions (§6.1.6) ──

  @Get('audit-logs')
  @Roles('ADMIN', 'AUDITOR', 'COMPLIANCE')
  @ApiOperation({ summary: 'View the append-only audit log' })
  auditLogs(@Query('action') action?: string): Promise<unknown[]> {
    return this.security.listAuditLogs({ action: action ?? null });
  }

  @Get('sessions')
  @Roles('ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List active portal sessions' })
  sessions(): Promise<unknown[]> {
    return this.security.listSessions();
  }

  @Post('sessions/:id/revoke')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Revoke a session' })
  async revokeSession(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.security.revokeSession(id, principal.userId);
    return { ok: true };
  }

  @Post('users/:id/sessions/revoke-all')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Force-logout a user (revoke all their sessions)' })
  revokeUserSessions(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ revoked: number }> {
    return this.security.revokeUserSessions(id, principal.userId);
  }

  // ── User Management (§6.1.9) ──

  @Get('users')
  @ApiOperation({ summary: 'List users with roles' })
  listUsers(@Query('scope') scope?: string): Promise<unknown[]> {
    return this.users.listUsers(scope === 'SYSTEM' || scope === 'MERCHANT' ? scope : null);
  }

  @Post('users')
  @HttpCode(201)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a user (name, email, scope, role, initial password)' })
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ userId: string }> {
    return this.users.createUser(
      {
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? null,
        scope: dto.scope,
        merchantId: dto.merchantId ?? null,
        role: dto.role,
        password: dto.password,
      },
      principal.userId,
    );
  }

  @Post('users/:id/roles')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.users.assignRole(id, dto.role, principal.userId);
    return { ok: true };
  }

  @Delete('users/:id/roles/:role')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remove a role from a user' })
  async removeRole(
    @Param('id') id: string,
    @Param('role') role: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.users.removeRole(id, role, principal.userId);
    return { ok: true };
  }

  @Get('roles')
  @ApiOperation({ summary: 'List roles' })
  listRoles(): Promise<unknown[]> {
    return this.users.listRoles();
  }

  @Post('roles')
  @HttpCode(201)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add a custom role' })
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ name: string }> {
    return this.users.createRole(dto.name, dto.description ?? null, principal.userId);
  }

  // ── Reads (any SYSTEM user / AUDITOR+) ──

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard summary metrics' })
  dashboard(@Query('accountId') accountId?: string): Promise<DashboardSummary> {
    return this.read.dashboard({ accountId: accountId ?? null });
  }

  @Get('commission')
  @Roles('ADMIN', 'FINANCE', 'AUDITOR') // Instacom revenue — financial roles only
  @ApiOperation({ summary: 'Commission earned, with breakdown by rail and merchant' })
  commission(): Promise<CommissionSummary> {
    return this.read.commission();
  }

  @Get('merchants')
  @ApiOperation({ summary: 'List merchants' })
  listMerchants(): Promise<unknown[]> {
    return this.read.listMerchants();
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Merchant detail with KYC documents and accounts' })
  merchantDetail(@Param('id') id: string): Promise<unknown> {
    return this.read.merchantDetail(id);
  }

  @Get('merchants/:id/documents/:docId')
  @ApiOperation({ summary: 'Download a merchant KYC document' })
  async merchantDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.read.merchantDocument(id, docId);
    if (!doc) {
      res.status(404).json({ error: 'document not found' });
      return;
    }
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/[^\w.\-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(doc.content);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List transactions' })
  listTransactions(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
  ): Promise<unknown[]> {
    return this.read.listTransactions({ status: status ?? null, accountId: accountId ?? null });
  }

  @Get('settlements')
  @ApiOperation({ summary: 'List settlements' })
  listSettlements(): Promise<unknown[]> {
    return this.read.listSettlements();
  }

  // ── ZamPay (GSB) settlement monitor (§ integration). The reconcile job
  // resolves invoices and sends the payment-confirmation callback to GSB
  // automatically; this is a read-only view of that activity. ──

  @Get('zampay/settlements')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'List/search ZamPay settlements (?status=, ?search= by batch ref / IBR / invoice / account)' })
  listZampaySettlements(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<unknown[]> {
    return this.read.listZampaySettlements(status ?? null, search ?? null);
  }

  @Post('zampay/settlements/:id/retry')
  @HttpCode(200)
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Retry a FAILED ZamPay settlement — re-arms resolve/callback for the next run' })
  async retryZampaySettlement(
    @Param('id') id: string,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ id: string; status: 'RETRYING' }> {
    await this.zampay.retryCallback(id, p.userId);
    return { id, status: 'RETRYING' };
  }

  @Post('zampay/settlements/:id/batch-reference')
  @HttpCode(200)
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Record the bank batch reference for a ZamPay settlement' })
  async setZampayBatchReference(
    @Param('id') id: string,
    @Body() dto: ZampayBatchReferenceDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ id: string; ok: true }> {
    await this.zampay.setBankBatchReference(id, dto.bankBatchReference ?? null, p.userId);
    return { id, ok: true };
  }

  // ── Settlement lifecycle (§5.8). The scheduled job (ic-settlement-run) also
  // calls runAll; these let an operator drive it from the admin portal. FINANCE
  // is the role defined for "float credit/debit and settlements". ──

  @Post('settlements/run')
  @HttpCode(200)
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Run settlement now — creates a PENDING settlement per account (SET-1)' })
  runSettlements(@CurrentPrincipal() p: Principal): Promise<{ created: number }> {
    return this.settlements.runAll(p.userId);
  }

  @Post('settlements/:id/confirm')
  @HttpCode(200)
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Confirm a settlement was paid to the bank — PENDING → SETTLED (SET-2/3)' })
  confirmSettlement(
    @Param('id') id: string,
    @Body() dto: SettlementConfirmDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ settlementId: string; status: 'SETTLED' }> {
    return this.settlements.confirmSettlement({
      settlementId: id,
      actorId: p.userId,
      bankReference: dto.bankReference ?? null,
    });
  }

  @Post('settlements/:id/fail')
  @HttpCode(200)
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Mark a settlement failed — funds return to settleable on the next run (SET-2)' })
  failSettlement(
    @Param('id') id: string,
    @Body() dto: SettlementFailDto,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ settlementId: string; status: 'FAILED' }> {
    return this.settlements.failSettlement({ settlementId: id, actorId: p.userId, reason: dto.reason });
  }

  @Get('float-requests')
  @ApiOperation({ summary: 'List float credit requests (dual control)' })
  listFloatRequests(@Query('status') status?: string): Promise<unknown[]> {
    return this.read.listFloatRequests(status ?? 'PENDING_APPROVAL');
  }

  @Get('float-requests/:id/proof')
  @ApiOperation({ summary: 'Download a float credit request proof of payment' })
  async floatProof(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const doc = await this.read.floatRequestProof(id);
    if (!doc) {
      res.status(404).json({ error: 'proof not found' });
      return;
    }
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/[^\w.\-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(doc.content);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List all accounts with float balances' })
  listAccounts(): Promise<unknown[]> {
    return this.read.listAccounts();
  }

  @Get('accounts/:id/ledger')
  @ApiOperation({ summary: 'Per-account float ledger' })
  accountLedger(@Param('id') id: string): Promise<unknown[]> {
    return this.read.accountLedger(id);
  }

  @Get('accounts/:id/config')
  @ApiOperation({ summary: 'Account configuration (mode, charge configs, settings)' })
  accountConfig(@Param('id') id: string): Promise<unknown> {
    return this.config.getAccountConfig(id);
  }

  // ── Manage Account / Configurations (§6.1.2) ──

  @Put('accounts/:id/charge-config')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add or update a charge configuration for a processor' })
  upsertChargeConfig(
    @Param('id') id: string,
    @Body() dto: ChargeConfigDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ accountId: string; processor: string }> {
    return this.config.upsertChargeConfig(
      id,
      {
        processor: dto.processor,
        chargeFulfiller: dto.chargeFulfiller,
        chargeType: dto.chargeType,
        fixedValue: dto.fixedValue ?? null,
        percentValue: dto.percentValue ?? null,
        ovaAccountRef: dto.ovaAccountRef ?? null,
      },
      principal.userId,
    );
  }

  @Put('accounts/:id/settings')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Set callback URL + IP whitelist' })
  updateAccountSettings(
    @Param('id') id: string,
    @Body() dto: AdminSettingsDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ accountId: string }> {
    return this.config.updateSettings(
      id,
      { callbackUrl: dto.callbackUrl ?? null, ipWhitelist: dto.ipWhitelist ?? null },
      principal.userId,
    );
  }

  @Post('accounts/:id/mode')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Toggle operating mode (SANDBOX/PRODUCTION)' })
  setMode(
    @Param('id') id: string,
    @Body() dto: ModeDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ accountId: string; operatingMode: string }> {
    return this.config.setMode(id, dto.mode, principal.userId);
  }

  // ── Mutations (role-gated, SEC-Z3) ──

  @Post('merchants')
  @HttpCode(201)
  @Roles('ADMIN', 'COMPLIANCE')
  @ApiOperation({ summary: 'Create a merchant (admin-initiated onboarding)' })
  async createMerchant(@Body() dto: ApplicationDto): Promise<{ merchantId: string }> {
    return this.onboarding.submitApplication({
      merchant: {
        name: dto.merchant.name,
        merchantType: dto.merchant.merchantType,
        email: dto.merchant.email,
        phone: dto.merchant.phone ?? null,
      },
      admin: { name: dto.admin.name, email: dto.admin.email, phone: dto.admin.phone ?? null },
    });
  }

  @Post('transactions/:id/reverse')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reverse a transaction — LEDGER CORRECTION ONLY, does not refund the customer',
    description:
      'Adjusts float and marks the transaction REVERSED. It does NOT send money back to the ' +
      'customer’s wallet. To actually refund someone, create a disbursement to their number for ' +
      'the amount they paid. Admin-only: the merchant API deliberately does not expose this.',
  })
  async reverse(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedPortalRequest,
  ): Promise<TransactionResponse> {
    const record = await this.transactions.reverseAsAdmin({
      transactionId: id,
      actorId: principal.userId,
      ipAddress: getClientIp(req),
    });
    return serializeTransaction(record);
  }

  @Post('merchants/:id/review')
  @HttpCode(200)
  @Roles('COMPLIANCE', 'ADMIN') // merchant approval (SEC-Z3, ONB-3)
  @ApiOperation({ summary: 'Approve or reject a merchant application' })
  async review(
    @Param('id') merchantId: string,
    @Body() dto: ReviewDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ merchantId: string; status: string }> {
    return this.onboarding.reviewApplication({
      merchantId,
      decision: dto.decision,
      actorId: principal.userId,
      reason: dto.reason ?? null,
    });
  }

  @Post('merchants/:id/accounts')
  @HttpCode(201)
  @Roles('ADMIN') // credential generation (SEC-Z3, ONB-4)
  @ApiOperation({ summary: 'Provision an account + SANDBOX/LIVE credentials' })
  async provision(
    @Param('id') merchantId: string,
    @Body() dto: ProvisionDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProvisionResult> {
    return this.provisioning.provisionAccount({
      merchantId,
      accountType: dto.accountType,
      actorId: principal.userId,
    });
  }

  @Post('merchants/:id/reset-credentials')
  @HttpCode(200)
  @Roles('ADMIN') // portal access reset (SEC-Z3, §7.1)
  @ApiOperation({ summary: "Reset the merchant's portal login and email new credentials" })
  async resetMerchantCredentials(
    @Param('id') merchantId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ sentTo: string[] }> {
    return this.provisioning.resetPortalCredentials({ merchantId, actorId: principal.userId });
  }

  @Post('accounts/:id/promote')
  @HttpCode(200)
  @Roles('ADMIN') // mode change (SEC-Z3, ONB-8)
  @ApiOperation({ summary: 'Promote an account to PRODUCTION' })
  async promote(
    @Param('id') accountId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ accountId: string; operatingMode: string }> {
    return this.provisioning.promoteAccount({ accountId, actorId: principal.userId });
  }

  @Post('accounts/:id/float-credit')
  @HttpCode(200)
  @Roles('FINANCE', 'ADMIN') // float credit (SEC-Z3, FLOAT-2)
  @ApiOperation({ summary: 'Credit float (posts, or parks for dual control)' })
  async creditFloat(
    @Param('id') accountId: string,
    @Body() dto: FloatCreditDto,
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedPortalRequest,
  ): Promise<
    { posted: true; ledgerId: string; balanceAfter: string } | { posted: false; requestId: string }
  > {
    const result = await this.floats.creditFloat({
      accountId,
      amount: toNgwee(dto.amount),
      actorId: principal.userId,
      ipAddress: getClientIp(req),
      proof: {
        fileName: dto.proofFileName,
        contentType: dto.proofContentType,
        dataBase64: dto.proofDataBase64,
      },
    });
    // Serialize bigint balance to a string (JSON can't carry bigint, NN-1).
    return result.posted
      ? { posted: true, ledgerId: result.ledgerId, balanceAfter: result.balanceAfter.toString() }
      : { posted: false, requestId: result.requestId };
  }

  @Post('float-requests/:id/approve')
  @HttpCode(200)
  @Roles('ADMIN') // checker (SEC-Z4, FLOAT-3) — a different role from the FINANCE maker
  @ApiOperation({ summary: 'Approve a parked float credit (second approver)' })
  async approveFloat(
    @Param('id') requestId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedPortalRequest,
  ): Promise<{ posted: true; ledgerId: string; balanceAfter: string }> {
    const result = await this.floats.approveFloatCredit({
      requestId,
      approverId: principal.userId,
      ipAddress: getClientIp(req),
    });
    return { posted: true, ledgerId: result.ledgerId, balanceAfter: result.balanceAfter.toString() };
  }

  @Post('float-requests/:id/reject')
  @HttpCode(200)
  @Roles('ADMIN') // the checker may also decline a parked credit
  @ApiOperation({ summary: 'Reject a parked float credit' })
  async rejectFloat(
    @Param('id') requestId: string,
    @Body() dto: FloatRejectDto,
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedPortalRequest,
  ): Promise<{ ok: true }> {
    return this.floats.rejectFloatCredit({
      requestId,
      rejectorId: principal.userId,
      reason: dto.reason,
      ipAddress: getClientIp(req),
    });
  }
}
