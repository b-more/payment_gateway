import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError } from '../money/errors';

export interface ProductResponse {
  id: string;
  name: string;
  price: string; // ngwee
  category: string | null;
  sort_order: number;
  has_image: boolean;
  barcode: string | null;
}

interface Row {
  id: string;
  name: string;
  price: string;
  category: string | null;
  sort_order: number;
  has_image: boolean;
  barcode: string | null;
}

const RETURNING =
  'id, name, price_ngwee::text AS price, category, sort_order, (image_data IS NOT NULL) AS has_image, barcode';

/** Product catalog, scoped to the credential's COLLECTION account. */
@Injectable()
export class ProductService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(accountId: string): Promise<ProductResponse[]> {
    const r = await this.pool.query<Row>(
      `SELECT ${RETURNING}
         FROM products WHERE account_id = $1 AND active = true
        ORDER BY sort_order, name`,
      [accountId],
    );
    return r.rows;
  }

  async create(
    accountId: string,
    input: { name: string; priceNgwee: bigint; category: string | null; barcode?: string | null; image?: Buffer | null; imageMime?: string | null },
  ): Promise<ProductResponse> {
    const r = await this.pool.query<Row>(
      `INSERT INTO products (account_id, name, price_ngwee, category, barcode, image_data, image_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${RETURNING}`,
      [accountId, input.name, input.priceNgwee.toString(), input.category, input.barcode ?? null, input.image ?? null, input.imageMime ?? null],
    );
    return r.rows[0];
  }

  async update(
    accountId: string,
    id: string,
    patch: {
      name: string | undefined;
      priceNgwee: bigint | undefined;
      category: string | null | undefined;
      active: boolean | undefined;
      barcode?: string | undefined;
      image?: Buffer | undefined;
      imageMime?: string | undefined;
    },
  ): Promise<ProductResponse> {
    // Image/barcode are only touched when supplied (COALESCE keeps the old).
    const r = await this.pool.query<Row>(
      `UPDATE products
          SET name = COALESCE($3, name),
              price_ngwee = COALESCE($4, price_ngwee),
              category = COALESCE($5, category),
              active = COALESCE($6, active),
              barcode = COALESCE($7, barcode),
              image_data = COALESCE($8, image_data),
              image_mime = COALESCE($9, image_mime)
        WHERE id = $1 AND account_id = $2
      RETURNING ${RETURNING}`,
      [
        id, accountId, patch.name ?? null, patch.priceNgwee?.toString() ?? null,
        patch.category ?? null, patch.active ?? null, patch.barcode ?? null, patch.image ?? null, patch.imageMime ?? null,
      ],
    );
    if (r.rowCount === 0) throw new NotFoundError('product not found');
    return r.rows[0];
  }

  /** Raw image bytes for one product (account-scoped), or null if it has none. */
  async getImage(accountId: string, id: string): Promise<{ data: Buffer; mime: string } | null> {
    const r = await this.pool.query<{ image_data: Buffer | null; image_mime: string | null }>(
      'SELECT image_data, image_mime FROM products WHERE id = $1 AND account_id = $2',
      [id, accountId],
    );
    if (r.rowCount === 0) throw new NotFoundError('product not found');
    const row = r.rows[0];
    if (!row.image_data) return null;
    return { data: row.image_data, mime: row.image_mime ?? 'application/octet-stream' };
  }

  /** Soft-delete: keep the row (past sales may reference it) but hide it. */
  async remove(accountId: string, id: string): Promise<void> {
    const r = await this.pool.query(
      "UPDATE products SET active = false WHERE id = $1 AND account_id = $2 AND active = true",
      [id, accountId],
    );
    if (r.rowCount === 0) throw new NotFoundError('product not found');
  }
}
