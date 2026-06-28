import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction, isUniqueViolation } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { ConflictError, NotFoundError, ValidationError } from '../money/errors';

export const ONBOARDING_RECEIVED_MESSAGE =
  'We have received your merchant onboarding application. Our team will review your application and contact you within 24–48 hours.';

const ALLOWED_DOC_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB per document
const MAX_DOCS = 8;

export interface ApplicationDocument {
  type: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}

export interface ApplicationInput {
  merchant: {
    name: string;
    merchantType: 'PUBLIC' | 'PRIVATE';
    email: string;
    phone?: string | null;
    tradingName?: string | null;
    registrationNumber?: string | null;
    tpin?: string | null;
    address?: string | null;
    city?: string | null;
    website?: string | null;
    description?: string | null;
  };
  admin: { name: string; email: string; phone?: string | null };
  documents?: ApplicationDocument[];
}

export type ReviewDecision = 'APPROVED' | 'REJECTED';

interface RoleRow {
  id: string;
}

/**
 * Merchant onboarding lifecycle (§5.1): public application with KYC documents
 * (ONB-1) and compliance review (ONB-3). Runs under the admin/onboarding DB role.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** ONB-1: public application creates a PENDING merchant, its INVITED admin user, and stores KYC docs. */
  async submitApplication(input: ApplicationInput): Promise<{ merchantId: string }> {
    const documents = input.documents ?? [];
    if (documents.length > MAX_DOCS) {
      throw new ValidationError(`too many documents (max ${MAX_DOCS})`);
    }
    // Decode + validate every document before opening a transaction.
    const decoded = documents.map((doc) => {
      if (!ALLOWED_DOC_TYPES.has(doc.contentType)) {
        throw new ValidationError(`unsupported document type: ${doc.contentType}`);
      }
      const bytes = Buffer.from(doc.dataBase64, 'base64');
      if (bytes.length === 0) throw new ValidationError(`empty document: ${doc.fileName}`);
      if (bytes.length > MAX_DOC_BYTES) {
        throw new ValidationError(`document too large: ${doc.fileName} (max 5MB)`);
      }
      return { type: doc.type, fileName: doc.fileName, contentType: doc.contentType, bytes };
    });

    const m = input.merchant;
    let result: { merchantId: string };
    try {
      result = await withTransaction(this.pool, async (client) => {
        const merchant = await client.query<{ id: string }>(
          `INSERT INTO merchants
             (name, merchant_type, email, phone, status, kyc_status,
              trading_name, registration_number, tpin, address, city, website, description)
           VALUES ($1,$2,$3,$4,'PENDING','UNVERIFIED',$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            m.name, m.merchantType, m.email, m.phone ?? null,
            m.tradingName ?? null, m.registrationNumber ?? null, m.tpin ?? null,
            m.address ?? null, m.city ?? null, m.website ?? null, m.description ?? null,
          ],
        );
        const merchantId = merchant.rows[0].id;

        const user = await client.query<{ id: string }>(
          `INSERT INTO users (scope, merchant_id, name, email, phone, status)
           VALUES ('MERCHANT', $1, $2, $3, $4, 'INVITED') RETURNING id`,
          [merchantId, input.admin.name, input.admin.email, input.admin.phone ?? null],
        );

        const role = await client.query<RoleRow>("SELECT id FROM roles WHERE name = 'MERCHANT_ADMIN'");
        if (role.rowCount === 0) {
          throw new Error('MERCHANT_ADMIN role missing — run migration 0006');
        }
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
          user.rows[0].id, role.rows[0].id,
        ]);

        for (const doc of decoded) {
          await client.query(
            `INSERT INTO merchant_documents (merchant_id, doc_type, file_name, content_type, byte_size, content)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [merchantId, doc.type, doc.fileName, doc.contentType, doc.bytes.length, doc.bytes],
          );
        }

        await this.audit.write(client, {
          actorScope: 'MERCHANT',
          action: 'MERCHANT_REGISTERED',
          target: merchantId,
          metadata: { email: input.merchant.email, documents: decoded.length },
        });
        return { merchantId };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('an account with this admin email already exists');
      }
      throw error;
    }

    // Best-effort acknowledgement to the email(s) entered on the application, so
    // the applicant always gets a confirmation (the welcome mail comes later, at
    // account provisioning). Never throws — a mail failure can't fail onboarding.
    const recipients = [
      ...new Set([input.admin.email, input.merchant.email].map((e) => e.trim()).filter(Boolean)),
    ];
    await this.email.sendApplicationReceived({ to: recipients, merchantName: input.merchant.name });

    return result;
  }

  /** ONB-3: compliance approves or rejects a pending application (audit-logged). */
  async reviewApplication(input: {
    merchantId: string;
    decision: ReviewDecision;
    actorId: string;
    reason?: string | null;
  }): Promise<{ merchantId: string; status: ReviewDecision }> {
    const outcome = await withTransaction(this.pool, async (client: PoolClient) => {
      const found = await client.query<{ status: string; name: string; email: string }>(
        'SELECT status, name, email FROM merchants WHERE id = $1 FOR UPDATE',
        [input.merchantId],
      );
      if (found.rowCount === 0) {
        throw new NotFoundError(`merchant not found: ${input.merchantId}`);
      }
      const merchant = found.rows[0];
      if (merchant.status !== 'PENDING') {
        throw new ConflictError(`merchant is not PENDING (${merchant.status})`);
      }
      if (input.decision === 'REJECTED' && (!input.reason || input.reason.trim() === '')) {
        throw new ValidationError('a reason is required when declining a merchant');
      }

      const approved = input.decision === 'APPROVED';
      await client.query(
        `UPDATE merchants
            SET status = $1, kyc_status = $2, review_reason = $3
          WHERE id = $4`,
        [input.decision, approved ? 'VERIFIED' : 'FAILED', input.reason ?? null, input.merchantId],
      );
      await client.query('UPDATE merchant_documents SET status = $1 WHERE merchant_id = $2', [
        approved ? 'VERIFIED' : 'REJECTED', input.merchantId,
      ]);
      // Notify the email(s) on file: the business email + the invited admin user(s).
      const contacts = await client.query<{ email: string }>(
        "SELECT email FROM users WHERE merchant_id = $1 AND scope = 'MERCHANT'",
        [input.merchantId],
      );
      const recipients = [
        ...new Set(
          [merchant.email, ...contacts.rows.map((r) => r.email)].map((e) => e.trim()).filter(Boolean),
        ),
      ];
      await this.audit.write(client, {
        actorId: input.actorId,
        actorScope: 'SYSTEM',
        action: approved ? 'MERCHANT_APPROVED' : 'MERCHANT_REJECTED',
        target: input.merchantId,
        metadata: input.reason ? { reason: input.reason } : {},
      });
      return { merchantName: merchant.name, recipients };
    });

    // Best-effort notification after commit — a mail failure can't fail the review.
    if (input.decision === 'APPROVED') {
      await this.email.sendApplicationApproved({
        to: outcome.recipients,
        merchantName: outcome.merchantName,
      });
    } else {
      await this.email.sendApplicationRejected({
        to: outcome.recipients,
        merchantName: outcome.merchantName,
        reason: (input.reason ?? '').trim(),
      });
    }

    return { merchantId: input.merchantId, status: input.decision };
  }
}
