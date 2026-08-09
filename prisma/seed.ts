import { PrismaClient } from '@prisma/client';
import { plantCatalog } from './plant-data';

const prisma = new PrismaClient();
const generatedPlantSlugs = new Set([
  'monstera',
  'snake',
  'peace-lily',
  'fiddle',
  'golden-pothos',
  'zz-plant',
  'rubber-plant',
  'spider-plant',
  'areca-palm',
  'bamboo-palm',
]);

const catalog = [
  {
    category: 'Indoor',
    categorySlug: 'indoor',
    slug: 'monstera',
    name: 'Monstera Deliciosa',
    scientificName: 'Monstera deliciosa',
    description: 'Bold split leaves bring a lush architectural feel to bright indoor spaces.',
    price: 899,
    rating: 4.8,
    reviewCount: 240,
    stock: 24,
    height: '55–70 cm',
    light: 'Indirect',
    water: 'Weekly',
    difficulty: 'Easy',
    featured: true,
    petSafe: false,
    image:
      'https://images.unsplash.com/photo-1614594575810-77dffa5bdb1f?auto=format&fit=crop&w=900&q=85',
  },
  {
    category: 'Air Purifying',
    categorySlug: 'air-purifying',
    slug: 'snake',
    name: 'Snake Plant',
    scientificName: 'Dracaena trifasciata',
    description:
      'A sculptural and resilient plant that stays beautiful with very little attention.',
    price: 649,
    rating: 4.9,
    reviewCount: 318,
    stock: 31,
    height: '45–60 cm',
    light: 'Low–bright',
    water: '12 days',
    difficulty: 'Easy',
    featured: true,
    petSafe: false,
    image:
      'https://images.unsplash.com/photo-1593482892290-f54927ae2bb1?auto=format&fit=crop&w=900&q=85',
  },
  {
    category: 'Flowering',
    categorySlug: 'flowering',
    slug: 'peace-lily',
    name: 'Peace Lily',
    scientificName: 'Spathiphyllum',
    description: 'Elegant white blooms and deep green foliage create an instantly calming corner.',
    price: 749,
    rating: 4.7,
    reviewCount: 186,
    stock: 18,
    height: '40–55 cm',
    light: 'Filtered',
    water: '5 days',
    difficulty: 'Medium',
    featured: false,
    petSafe: false,
    image:
      'https://images.unsplash.com/photo-1593691509543-c55fb32e5cee?auto=format&fit=crop&w=900&q=85',
  },
  {
    category: 'Indoor',
    categorySlug: 'indoor',
    slug: 'fiddle',
    name: 'Fiddle Leaf Fig',
    scientificName: 'Ficus lyrata',
    description: 'A statement plant with broad glossy leaves, curated for modern interiors.',
    price: 1199,
    rating: 4.6,
    reviewCount: 142,
    stock: 12,
    height: '70–90 cm',
    light: 'Bright',
    water: 'Weekly',
    difficulty: 'Medium',
    featured: true,
    petSafe: true,
    image:
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=85',
  },
  ...plantCatalog,
];

async function main(): Promise<void> {
  await prisma.banner.upsert({
    where: { slug: 'home-garden' },
    update: { active: true, imageUrl: '/banners/home-garden.png' },
    create: {
      slug: 'home-garden',
      placement: 'HOME',
      eyebrow: "TODAY'S GARDEN",
      title: 'Everything is\ngrowing beautifully.',
      imageUrl: '/banners/home-garden.png',
      route: '/(tabs)/garden',
    },
  });
  await prisma.banner.upsert({
    where: { slug: 'my-garden' },
    update: { active: true, imageUrl: '/banners/my-garden.png' },
    create: {
      slug: 'my-garden',
      placement: 'GARDEN',
      eyebrow: 'GARDEN HEALTH',
      title: 'Everything is growing',
      imageUrl: '/banners/my-garden.png',
      route: '/(tabs)/garden',
    },
  });
  await prisma.banner.upsert({
    where: { slug: 'gardening-services' },
    update: { active: true, imageUrl: '/banners/gardening-services.png' },
    create: {
      slug: 'gardening-services',
      placement: 'SERVICES',
      eyebrow: 'GREENNEST EXPERTS',
      title: 'Your garden deserves a professional touch.',
      imageUrl: '/banners/gardening-services.png',
      route: '/screen/book-gardener',
    },
  });
  await prisma.product.deleteMany({ where: { slug: { notIn: [...generatedPlantSlugs] } } });
  for (const [index, item] of catalog.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: item.categorySlug },
      update: { name: item.category, active: true },
      create: { name: item.category, slug: item.categorySlug, sortOrder: index },
    });
    const { category: _category, categorySlug: _categorySlug, image, ...product } = item;
    const productImage = generatedPlantSlugs.has(item.slug) ? `/catalog/${item.slug}.png` : image;
    await prisma.product.upsert({
      where: { slug: item.slug },
      update: { ...product, images: [productImage], categoryId: category.id },
      create: { ...product, images: [productImage], categoryId: category.id },
    });
  }
  await prisma.category.deleteMany({ where: { products: { none: {} } } });
  const services = [
    {
      slug: 'maintenance',
      title: 'Plant Maintenance',
      category: 'Plant Care',
      description: 'Pruning, cleaning, feeding and a complete health check.',
      durationMinutes: 90,
      price: 799,
      icon: 'leaf-outline',
      inclusions: ['Health check', 'Pruning', 'Plant nutrition', 'Personalised care plan'],
    },
    {
      slug: 'repotting',
      title: 'Repotting',
      category: 'Plant Care',
      description: 'Fresh soil, the right pot and gentle root care.',
      durationMinutes: 60,
      price: 499,
      icon: 'flower-outline',
      inclusions: ['Root check', 'Fresh potting mix', 'Repotting', 'After-care plan'],
    },
    {
      slug: 'pest',
      title: 'Pest Control',
      category: 'Protection',
      description: 'Safe treatment and prevention by a plant specialist.',
      durationMinutes: 60,
      price: 999,
      icon: 'shield-checkmark-outline',
      inclusions: ['Pest inspection', 'Safe treatment', 'Isolation plan', 'Follow-up advice'],
    },
  ];
  for (const service of services)
    await prisma.gardeningService.upsert({
      where: { slug: service.slug },
      update: service,
      create: service,
    });
  await prisma.gardener.upsert({
    where: { identityNumber: 'GN-EXP-1042' },
    update: { active: true, verified: true },
    create: {
      name: 'Arjun Kumar',
      identityNumber: 'GN-EXP-1042',
      phoneMasked: '+91 ••••••4821',
      rating: 4.9,
      jobsCompleted: 328,
    },
  });
}

main().finally(() => prisma.$disconnect());
