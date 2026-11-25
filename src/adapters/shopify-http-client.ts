import { gotScraping } from 'got-scraping';
import type { RawShopifyCollection, RawShopifyProduct } from '../domain/shopify-analyzer.js';
import type { CatalogFetchStatus } from '../domain/shopify-schema.js';
import type {
  CollectionsFetchResult,
  HomepageFetchResult,
  ProductsFetchResult,
  ShopifySource,
} from '../ports/shopify-source.js';

function mapErrorStatus(statusCode: number): CatalogFetchStatus {
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 401 || statusCode === 403 || statusCode === 404) return 'disabled';
  return 'error';
}

/**
 * HTTP-only Shopify store client using got-scraping with graceful fallback on rate-limited/disabled catalogs.
 */
export class ShopifyHttpClient implements ShopifySource {
  async fetchStoreHomepage(domain: string): Promise<HomepageFetchResult> {
    const url = `https://${domain}/`;
    const response = await gotScraping({
      url,
      http2: false,
      timeout: { request: 15000 },
      throwHttpErrors: false,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    return {
      domain,
      finalUrl: response.url || url,
      html: response.body ?? '',
      statusCode: response.statusCode,
    };
  }

  async fetchStoreProducts(domain: string, limit: number): Promise<ProductsFetchResult> {
    const safeLimit = Math.max(1, Math.min(250, limit));
    const url = `https://${domain}/products.json?limit=${safeLimit}`;

    try {
      const response = await gotScraping({
        url,
        http2: false,
        timeout: { request: 15000 },
        throwHttpErrors: false,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return { status: mapErrorStatus(response.statusCode), products: [] };
      }

      const parsed = JSON.parse(response.body) as { products?: RawShopifyProduct[] };
      if (!Array.isArray(parsed.products)) {
        return { status: 'disabled', products: [] };
      }
      return { status: 'ok', products: parsed.products };
    } catch {
      return { status: 'error', products: [] };
    }
  }

  async fetchStoreCollections(domain: string, limit: number): Promise<CollectionsFetchResult> {
    const safeLimit = Math.max(1, Math.min(250, limit));
    const url = `https://${domain}/collections.json?limit=${safeLimit}`;

    try {
      const response = await gotScraping({
        url,
        http2: false,
        timeout: { request: 15000 },
        throwHttpErrors: false,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return { status: mapErrorStatus(response.statusCode), collections: [] };
      }

      const parsed = JSON.parse(response.body) as { collections?: RawShopifyCollection[] };
      if (!Array.isArray(parsed.collections)) {
        return { status: 'disabled', collections: [] };
      }
      return { status: 'ok', collections: parsed.collections };
    } catch {
      return { status: 'error', collections: [] };
    }
  }
}
