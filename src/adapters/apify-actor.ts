import { Actor } from 'apify';
import {
  analyzeStoreHtml,
  computePricingStats,
  normalizeShopifyCollections,
  normalizeShopifyProducts,
} from '../domain/shopify-analyzer.js';
import {
  parseActorInput,
  type ActorInput,
  type ShopifyStoreIntel,
} from '../domain/shopify-schema.js';
import type { ShopifySource } from '../ports/shopify-source.js';
import type { BillingMeter } from '../shared/billing-meter.js';

export type ShopifyBillingEvent = 'store-analyzed' | 'product-extracted' | 'mcp-query';

export interface ExtractionDependencies {
  source: ShopifySource;
  billing: BillingMeter<ShopifyBillingEvent>;
  pushData: (items: ShopifyStoreIntel[]) => Promise<void>;
}

/**
 * Analyzes a single Shopify store domain (HTML tech stack + optional products/collections).
 */
export async function analyzeSingleStore(
  domain: string,
  source: ShopifySource,
  options: Pick<ActorInput, 'includeProducts' | 'maxProductsPerStore' | 'includeCollections'>,
): Promise<ShopifyStoreIntel> {
  const homepage = await source.fetchStoreHomepage(domain);
  const htmlAnalysis = analyzeStoreHtml(homepage.html);

  const productsResult = options.includeProducts
    ? await source.fetchStoreProducts(domain, options.maxProductsPerStore)
    : { status: 'skipped' as const, products: [] };

  const collectionsResult = options.includeCollections
    ? await source.fetchStoreCollections(domain, 50)
    : { status: 'skipped' as const, collections: [] };

  const products = normalizeShopifyProducts(
    domain,
    productsResult.products,
    options.maxProductsPerStore,
  );
  const collections = normalizeShopifyCollections(domain, collectionsResult.collections);
  const pricingStats = computePricingStats(products);

  return {
    domain,
    storeUrl: homepage.finalUrl,
    isShopify: htmlAnalysis.isShopify,
    myshopifyDomain: htmlAnalysis.myshopifyDomain,
    title: htmlAnalysis.title,
    metaDescription: htmlAnalysis.metaDescription,
    themeName: htmlAnalysis.themeName,
    themeId: htmlAnalysis.themeId,
    currency: htmlAnalysis.currency,
    countryCode: htmlAnalysis.countryCode,
    apps: htmlAnalysis.apps,
    appNames: htmlAnalysis.apps.map((a) => a.name),
    paymentMethods: htmlAnalysis.paymentMethods,
    emails: htmlAnalysis.emails,
    socialLinks: htmlAnalysis.socialLinks,
    catalogStatus: productsResult.status,
    collectionsStatus: collectionsResult.status,
    pricingStats,
    products,
    collections,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Validates input, analyzes each Shopify store, pushes to dataset, and charges PPE events.
 */
export async function runShopifyStoreExtraction(
  rawInput: unknown,
  deps: ExtractionDependencies,
): Promise<ShopifyStoreIntel[]> {
  const input = parseActorInput(rawInput);
  if (input.domains.length === 0) {
    return [];
  }

  const results: ShopifyStoreIntel[] = [];
  let totalProducts = 0;

  for (const domain of input.domains) {
    const intel = await analyzeSingleStore(domain, deps.source, input);
    results.push(intel);
    totalProducts += intel.products.length;
  }

  if (results.length > 0) {
    await deps.pushData(results);
    await deps.billing.charge('store-analyzed', results.length);
  }
  if (totalProducts > 0) {
    await deps.billing.charge('product-extracted', totalProducts);
  }

  return results;
}

/**
 * Runs the standard batch Apify Actor extraction mode.
 */
export async function runActorBatch(
  source: ShopifySource,
  billing: BillingMeter<ShopifyBillingEvent>,
): Promise<void> {
  const input = await Actor.getInput();
  await runShopifyStoreExtraction(input, {
    source,
    billing,
    pushData: async (items) => {
      await Actor.pushData(items);
    },
  });
}
