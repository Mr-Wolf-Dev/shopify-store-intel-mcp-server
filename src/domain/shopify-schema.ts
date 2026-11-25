import { z } from 'zod';

/**
 * Normalizes a store domain or URL into a clean lowercase hostname without path or protocol.
 */
export function normalizeStoreDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Store domain cannot be empty.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid store domain: "${raw}"`);
  }

  const hostname = parsed.hostname.replace(/\.+$/, '');
  if (!hostname || !hostname.includes('.')) {
    throw new Error(`Invalid store domain: "${raw}"`);
  }
  return hostname;
}

export const ActorInputSchema = z.object({
  domains: z
    .array(z.string().min(1))
    .default([])
    .transform((list) => Array.from(new Set(list.map(normalizeStoreDomain)))),
  includeProducts: z.boolean().default(true),
  maxProductsPerStore: z.number().int().min(1).max(250).default(50),
  includeCollections: z.boolean().default(true),
});

export type ActorInput = z.infer<typeof ActorInputSchema>;

export function parseActorInput(raw: unknown): ActorInput {
  return ActorInputSchema.parse(raw ?? {});
}

export const ProductFilterSchema = z.object({
  keyword: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  inStockOnly: z.boolean().default(false),
});

export type ProductFilter = z.infer<typeof ProductFilterSchema>;

export type AppCategory =
  | 'email_marketing'
  | 'reviews'
  | 'support'
  | 'subscriptions'
  | 'upsell'
  | 'loyalty'
  | 'analytics'
  | 'ads_pixel'
  | 'returns'
  | 'shipping'
  | 'popup';

export interface ShopifyAppDetection {
  name: string;
  category: AppCategory;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string | null;
  productType: string | null;
  priceMin: number | null;
  priceMax: number | null;
  compareAtPriceMax: number | null;
  onSale: boolean;
  available: boolean;
  variantCount: number;
  tags: string[];
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  productsCount: number | null;
  url: string;
  updatedAt: string | null;
}

export interface ShopifyPricingStats {
  productCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  onSaleCount: number;
  inStockCount: number;
  topVendors: Array<{ name: string; count: number }>;
  topProductTypes: Array<{ name: string; count: number }>;
}

export type CatalogFetchStatus = 'ok' | 'rate_limited' | 'disabled' | 'skipped' | 'error';

export interface ShopifyStoreIntel {
  domain: string;
  storeUrl: string;
  isShopify: boolean;
  myshopifyDomain: string | null;
  title: string | null;
  metaDescription: string | null;
  themeName: string | null;
  themeId: string | null;
  currency: string | null;
  countryCode: string | null;
  apps: ShopifyAppDetection[];
  appNames: string[];
  paymentMethods: string[];
  emails: string[];
  socialLinks: Record<string, string>;
  catalogStatus: CatalogFetchStatus;
  collectionsStatus: CatalogFetchStatus;
  pricingStats: ShopifyPricingStats;
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
  extractedAt: string;
}
