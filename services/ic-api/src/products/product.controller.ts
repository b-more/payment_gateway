import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
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
      barcode: dto.barcode ?? null,
      image: dto.image ? Buffer.from(dto.image, 'base64') : null,
      imageMime: dto.imageMime ?? null,
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
      barcode: dto.barcode,
      image: dto.image ? Buffer.from(dto.image, 'base64') : undefined,
      imageMime: dto.imageMime,
    });
  }

  @Get(':id/image')
  @ApiExcludeEndpoint()
  @Header('Cache-Control', 'private, max-age=86400')
  async image(
    @CurrentCredential() cred: CredentialContext,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const img = await this.products.getImage(cred.accountId, id);
    if (!img) throw new NotFoundException('no image');
    res.type(img.mime).send(img.data);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a product' })
  async remove(@CurrentCredential() cred: CredentialContext, @Param('id') id: string): Promise<{ ok: true }> {
    await this.products.remove(cred.accountId, id);
    return { ok: true };
  }
}
