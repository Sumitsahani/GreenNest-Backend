import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { ProductQueryDto } from './dto/catalog-query.dto';
import type { CategoryResponse, ProductListResponse, ProductResponse } from './catalog.service';
import type { Banner } from '@prisma/client';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('banners') @ApiOperation({ summary: 'List active app banners by placement' }) banners(@Query('placement') placement?: string): Promise<Banner[]> { return this.catalog.banners(placement); }
  @Get('categories')
  @ApiOperation({ summary: 'List active shop categories' })
  categories(): Promise<CategoryResponse[]> {
    return this.catalog.categories();
  }
  @Get('products')
  @ApiOperation({ summary: 'Search, filter, sort and paginate products' })
  products(@Query() query: ProductQueryDto): Promise<ProductListResponse> {
    return this.catalog.products(query);
  }
  @Get('products/:id') @ApiOperation({ summary: 'Get product details by UUID or slug' }) product(
    @Param('id') id: string,
  ): Promise<ProductResponse> {
    return this.catalog.product(id);
  }
}
