import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Banner } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { ProductQueryDto, ProductSort } from './dto/catalog-query.dto';

type ProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: { select: { name: true; slug: true } } };
}>;
export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
}
export interface ProductResponse {
  id: string;
  slug: string;
  name: string;
  scientificName: string | null;
  description: string;
  price: number;
  salePrice: number | null;
  images: string[];
  rating: number;
  reviewCount: number;
  stock: number;
  isAvailable: boolean;
  petSafe: boolean;
  height: string | null;
  light: string | null;
  water: string | null;
  difficulty: string | null;
  featured: boolean;
  category: { name: string; slug: string };
}
export interface ProductListResponse {
  items: ProductResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  banners(placement?: string): Promise<Banner[]> {
    return this.prisma.banner.findMany({ where: { active: true, ...(placement ? { placement: placement.toUpperCase() } : {}) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  async categories(): Promise<CategoryResponse[]> {
    return this.prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
  }

  async products(query: ProductQueryDto): Promise<ProductListResponse> {
    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.featured === undefined ? {} : { featured: query.featured }),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? { price: { gte: query.minPrice, lte: query.maxPrice } }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === ProductSort.PRICE_ASC
        ? [{ price: 'asc' }]
        : query.sort === ProductSort.PRICE_DESC
          ? [{ price: 'desc' }]
          : query.sort === ProductSort.RATING
            ? [{ rating: 'desc' }]
            : [{ featured: 'desc' }, { createdAt: 'desc' }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { category: { select: { name: true, slug: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: items.map((item) => this.mapProduct(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async product(idOrSlug: string): Promise<ProductResponse> {
    const item = await this.prisma.product.findFirst({
      where: { active: true, OR: [{ id: this.uuidOrImpossible(idOrSlug) }, { slug: idOrSlug }] },
      include: { category: { select: { name: true, slug: true } } },
    });
    if (!item)
      throw new BusinessException(
        ErrorCode.PRODUCT_NOT_FOUND,
        'Product not found',
        HttpStatus.NOT_FOUND,
      );
    return this.mapProduct(item);
  }

  private uuidOrImpossible(value: string): string {
    return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
      ? value
      : '00000000-0000-0000-0000-000000000000';
  }
  mapProduct(item: ProductWithCategory): ProductResponse {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      scientificName: item.scientificName,
      description: item.description,
      price: Number(item.price),
      salePrice: item.salePrice === null ? null : Number(item.salePrice),
      images: item.images,
      rating: Number(item.rating),
      reviewCount: item.reviewCount,
      stock: item.stock,
      isAvailable: item.stock > 0,
      petSafe: item.petSafe,
      height: item.height,
      light: item.light,
      water: item.water,
      difficulty: item.difficulty,
      featured: item.featured,
      category: item.category,
    };
  }
}
