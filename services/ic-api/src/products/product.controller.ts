import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../api/api-auth.guard';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { ApiAuthHeaders } from '../api/swagger';
import { CurrentCredential } from '../api/request-context';
import type { CredentialContext } from '../credentials/credential.service';
import { ProductService, type ProductResponse } from './product.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

// Product catalog for the POS terminal. Device/API-key auth; scoped to the
// credential's account, so all terminals on that account share one catalog.
@ApiTags('products')
@ApiAuthHeaders()
@Controller('products')
@UseGuards(RateLimitGuard, ApiAuthGuard)
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List the catalog' })
  list(@CurrentCredential() cred: CredentialContext): Promise<ProductResponse[]> {
    return this.products.list(cred.accountId);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a product' })
  create(@CurrentCredential() cred: CredentialContext, @Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.products.create(cred.accountId, {
      name: dto.name,
      priceNgwee: BigInt(dto.price),
      category: dto.category ?? null,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a product' })
  update(
    @CurrentCredential() cred: CredentialContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(cred.accountId, id, {
      name: dto.name,
      priceNgwee: dto.price ? BigInt(dto.price) : undefined,
      category: dto.category,
      active: dto.active,
    });
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a product' })
  async remove(@CurrentCredential() cred: CredentialContext, @Param('id') id: string): Promise<{ ok: true }> {
    await this.products.remove(cred.accountId, id);
    return { ok: true };
  }
}
