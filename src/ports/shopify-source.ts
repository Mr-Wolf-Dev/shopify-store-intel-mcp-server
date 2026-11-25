import type { RawShopifyCollection, RawShopifyProduct } from '../domain/shopify-analyzer.js';
import type { CatalogFetchStatus } from '../domain/shopify-schema.js';

export interface HomepageFetchResult {
  domain: string;
  finalUrl: string;
  html: string;
  statusCode: number;
}

export interface ProductsFetchResult {
  status: CatalogFetchStatus;
  products: RawShopifyProduct[];
}

export interface CollectionsFetchResult {
  status: CatalogFetchStatus;
  collections: RawShopifyCollection[];
}

export interface ShopifySource {
  fetchStoreHomepage(domain: string): Promise<HomepageFetchResult>;
  fetchStoreProducts(domain: string, limit: number): Promise<ProductsFetchResult>;
  fetchStoreCollections(domain: string, limit: number): Promise<CollectionsFetchResult>;
}
