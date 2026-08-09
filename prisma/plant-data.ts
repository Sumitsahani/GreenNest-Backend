type PlantSeed = {
  category: string;
  categorySlug: string;
  slug: string;
  name: string;
  scientificName: string;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  stock: number;
  height: string;
  light: string;
  water: string;
  difficulty: string;
  featured: boolean;
  petSafe: boolean;
  image: string;
};

export const plantCatalog: PlantSeed[] = [
  {
    category: 'Air Purifying',
    categorySlug: 'air-purifying',
    slug: 'golden-pothos',
    name: 'Golden Pothos',
    scientificName: 'Epipremnum aureum',
    description: 'A resilient trailing vine with heart-shaped green and gold leaves.',
    price: 449,
    rating: 4.8,
    reviewCount: 211,
    stock: 28,
    height: '25–45 cm',
    light: 'Low to bright indirect',
    water: '7–10 days',
    difficulty: 'Easy',
    featured: true,
    petSafe: false,
    image: '/catalog/golden-pothos.png',
  },
  {
    category: 'Indoor',
    categorySlug: 'indoor',
    slug: 'zz-plant',
    name: 'ZZ Plant',
    scientificName: 'Zamioculcas zamiifolia',
    description: 'Glossy upright foliage that thrives with minimal attention.',
    price: 699,
    rating: 4.8,
    reviewCount: 194,
    stock: 22,
    height: '45–70 cm',
    light: 'Low to bright indirect',
    water: '14–20 days',
    difficulty: 'Easy',
    featured: true,
    petSafe: false,
    image: '/catalog/zz-plant.png',
  },
  {
    category: 'Air Purifying',
    categorySlug: 'air-purifying',
    slug: 'rubber-plant',
    name: 'Rubber Plant',
    scientificName: 'Ficus elastica',
    description: 'Bold glossy foliage and an upright habit for modern interiors.',
    price: 799,
    rating: 4.7,
    reviewCount: 167,
    stock: 19,
    height: '60–90 cm',
    light: 'Bright indirect',
    water: '7–10 days',
    difficulty: 'Easy',
    featured: false,
    petSafe: false,
    image: '/catalog/rubber-plant.png',
  },
  {
    category: 'Air Purifying',
    categorySlug: 'air-purifying',
    slug: 'spider-plant',
    name: 'Spider Plant',
    scientificName: 'Chlorophytum comosum',
    description: 'Arching striped leaves and charming plantlets in an easy-care form.',
    price: 399,
    rating: 4.7,
    reviewCount: 153,
    stock: 25,
    height: '25–40 cm',
    light: 'Medium indirect',
    water: '5–7 days',
    difficulty: 'Easy',
    featured: false,
    petSafe: true,
    image: '/catalog/spider-plant.png',
  },
  {
    category: 'Palms',
    categorySlug: 'palms',
    slug: 'areca-palm',
    name: 'Areca Palm',
    scientificName: 'Dypsis lutescens',
    description: 'Feathery fronds create a soft tropical statement indoors.',
    price: 1099,
    rating: 4.8,
    reviewCount: 226,
    stock: 16,
    height: '90–120 cm',
    light: 'Bright indirect',
    water: '5–7 days',
    difficulty: 'Medium',
    featured: true,
    petSafe: true,
    image: '/catalog/areca-palm.png',
  },
  {
    category: 'Palms',
    categorySlug: 'palms',
    slug: 'bamboo-palm',
    name: 'Bamboo Palm',
    scientificName: 'Chamaedorea seifrizii',
    description: 'Slender clustered stems and graceful green palm foliage.',
    price: 999,
    rating: 4.6,
    reviewCount: 118,
    stock: 14,
    height: '80–120 cm',
    light: 'Medium indirect',
    water: '7 days',
    difficulty: 'Medium',
    featured: false,
    petSafe: true,
    image: '/catalog/bamboo-palm.png',
  },
];
