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
}

interface Row {
  id: string;
  name: string;
  price: string;
  category: string | null;
  sort_order: number;
}

/** Product catalog, scoped to the credential's COLLECTION account. */
@Injectable()
export class ProductService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(accountId: string): Promise<ProductResponse[]> {
    const r = await this.pool.query<Row>(
      `SELECT id, name, price_ngwee::text AS price, category, sort_order
         FROM products WHERE account_id = $1 AND active = true
        ORDER BY sort_order, name`,
      [accountId],
    );
    return r.rows;
  }

  async create(accountId: string, input: { name: string; priceNgwee: bigint; category: string | null }): Promise<ProductResponse> {
    const r = await this.pool.query<Row>(
      `INSERT INTO products (account_id, name, price_ngwee, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price_ngwee::text AS price, category, sort_order`,
      [accountId, input.name, input.priceNgwee.toString(), input.category],
    );
    return r.rows[0];
  }

  async update(
    accountId: string,
    id: string,
    patch: { name: string | undefined; priceNgwee: bigint | undefined; category: string | null | undefined; active: boolean | undefined },
  ): Promise<ProductResponse> {
    const r = await this.pool.query<Row>(
      `UPDATE products
          SET name = COALESCE($3, name),
              price_ngwee = COALESCE($4, price_ngwee),
              category = COALESCE($5, category),
              active = COALESCE($6, active)
        WHERE id = $1 AND account_id = $2
      RETURNING id, name, price_ngwee::text AS price, category, sort_order`,
      [id, accountId, patch.name ?? null, patch.priceNgwee?.toString() ?? null, patch.category ?? null, patch.active ?? null],
    );
    if (r.rowCount === 0) throw new NotFoundError('product not found');
    return r.rows[0];
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
