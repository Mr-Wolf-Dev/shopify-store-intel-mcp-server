import type { Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  filterShopifyProducts,
  normalizeShopifyProducts,
  computePricingStats,
} from '../domain/shopify-analyzer.js';
import { normalizeStoreDomain } from '../domain/shopify-schema.js';
import type { ShopifySource } from '../ports/shopify-source.js';
import type { BillingMeter } from '../shared/billing-meter.js';
import { createMcpHttpServer } from '../shared/mcp-http-server.js';
import { analyzeSingleStore, type ShopifyBillingEvent } from './apify-actor.js';

export interface McpServerDependencies {
  source: ShopifySource;
  billing: BillingMeter<ShopifyBillingEvent>;
}

export function createConfiguredMcpServer(deps: McpServerDependencies): McpServer {
  const server = new McpServer({
    name: 'shopify-store-intel-mcp-server',
    version: '0.1.0',
  });

  server.registerTool(
    'analyze_shopify_store',
    {
      description:
        'Analyze a Shopify storefront: detect Shopify theme, 25+ installed apps & marketing pixels, payment/BNPL methods, contact emails, social links, and catalog pricing stats.',
      inputSchema: {
        domain: z.string().min(1).describe('Shopify store domain or URL (e.g. "allbirds.com")'),
        includeProducts: z.boolean().optional().describe('Fetch /products.json summary (default true)'),
        maxProducts: z.number().int().min(1).max(250).optional().describe('Max products to inspect (default 50)'),
        includeCollections: z.boolean().optional().describe('Fetch /collections.json (default true)'),
      },
    },
    async ({ domain, includeProducts, maxProducts, includeCollections }) => {
      const normalized = normalizeStoreDomain(domain);
      const intel = await analyzeSingleStore(normalized, deps.source, {
        includeProducts: includeProducts ?? true,
        maxProductsPerStore: maxProducts ?? 50,
        includeCollections: includeCollections ?? true,
      });
      await deps.billing.charge('mcp-query', 1);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(intel, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'extract_shopify_products',
    {
      description:
        'Extract and filter products from a Shopify store /products.json feed by keyword, vendor, product type, price range, or stock availability.',
      inputSchema: {
        domain: z.string().min(1).describe('Shopify store domain or URL'),
        keyword: z.string().optional().describe('Filter keyword in title, vendor, type, or tags'),
        vendor: z.string().optional().describe('Filter by vendor name'),
        productType: z.string().optional().describe('Filter by product type'),
        minPrice: z.number().min(0).optional().describe('Minimum price'),
        maxPrice: z.number().min(0).optional().describe('Maximum price'),
        inStockOnly: z.boolean().optional().describe('Return only available products'),
        limit: z.number().int().min(1).max(250).optional().describe('Max products to fetch (default 100)'),
      },
    },
    async ({ domain, keyword, vendor, productType, minPrice, maxPrice, inStockOnly, limit }) => {
      const normalized = normalizeStoreDomain(domain);
      const res = await deps.source.fetchStoreProducts(normalized, limit ?? 100);
      const allProducts = normalizeShopifyProducts(normalized, res.products, limit ?? 100);
      const filtered = filterShopifyProducts(allProducts, {
        keyword,
        vendor,
        productType,
        minPrice,
        maxPrice,
        inStockOnly: inStockOnly ?? false,
      });
      await deps.billing.charge('mcp-query', 1);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                domain: normalized,
                catalogStatus: res.status,
                totalFetched: allProducts.length,
                matchedCount: filtered.length,
                pricingStats: computePricingStats(filtered),
                products: filtered,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'compare_shopify_stores',
    {
      description:
        'Compare up to 5 Shopify stores side-by-side on theme, installed apps, payment methods, and pricing stats.',
      inputSchema: {
        domains: z.array(z.string().min(1)).min(1).max(5).describe('List of 1-5 Shopify store domains'),
        maxProductsPerStore: z.number().int().min(1).max(100).optional().describe('Products per store for price stats (default 30)'),
      },
    },
    async ({ domains, maxProductsPerStore }) => {
      const normalizedDomains = Array.from(new Set(domains.map(normalizeStoreDomain)));
      const comparisons = [];
      for (const d of normalizedDomains) {
        const intel = await analyzeSingleStore(d, deps.source, {
          includeProducts: true,
          maxProductsPerStore: maxProductsPerStore ?? 30,
          includeCollections: false,
        });
        comparisons.push({
          domain: intel.domain,
          isShopify: intel.isShopify,
          themeName: intel.themeName,
          currency: intel.currency,
          appCount: intel.apps.length,
          appNames: intel.appNames,
          paymentMethods: intel.paymentMethods,
          catalogStatus: intel.catalogStatus,
          pricingStats: intel.pricingStats,
        });
      }
      await deps.billing.charge('mcp-query', 1);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: comparisons.length, stores: comparisons }, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

/**
 * Creates a stateless Streamable HTTP MCP server compatible with Apify Standby mode.
 */
export function createShopifyMcpHttpServer(deps: McpServerDependencies): Server {
  return createMcpHttpServer({
    serviceName: 'shopify-store-intel-mcp-server',
    createServer: () => createConfiguredMcpServer(deps),
  });
}
