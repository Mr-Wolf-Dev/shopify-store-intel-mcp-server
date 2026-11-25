import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runShopifyStoreExtraction,
  type ShopifyBillingEvent,
} from '../../src/adapters/apify-actor.js';
import { createShopifyMcpHttpServer } from '../../src/adapters/mcp-server.js';
import type { ShopifySource } from '../../src/ports/shopify-source.js';
import type { BillingMeter } from '../../src/shared/billing-meter.js';

const fakeSource: ShopifySource = {
  async fetchStoreHomepage(domain) {
    return {
      domain,
      finalUrl: `https://${domain}/`,
      statusCode: 200,
      html: `
        <html>
          <head>
            <title>${domain} Store</title>
            <script src="https://cdn.shopify.com/s/files/1/main.js"></script>
            <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
            <script>Shopify.theme = {"name":"Impulse","id":777}; Shopify.currency = {"active":"USD"};</script>
          </head>
          <body><a href="mailto:hello@${domain}">Contact</a></body>
        </html>
      `,
    };
  },
  async fetchStoreProducts() {
    return {
      status: 'ok',
      products: [
        {
          id: 1,
          title: 'Merino Sneaker',
          handle: 'merino-sneaker',
          vendor: 'Allbirds',
          product_type: 'Shoes',
          tags: ['sustainable'],
          variants: [{ price: '110.00', compare_at_price: '130.00', available: true }],
        },
      ],
    };
  },
  async fetchStoreCollections() {
    return {
      status: 'ok',
      collections: [{ id: 10, title: 'Footwear', handle: 'footwear', products_count: 8 }],
    };
  },
};

describe('Shopify Actor & Streamable HTTP MCP Server', () => {
  const charges: Array<{ eventName: ShopifyBillingEvent; count: number }> = [];
  const billing: BillingMeter<ShopifyBillingEvent> = {
    async charge(eventName, count = 1) {
      charges.push({ eventName, count });
    },
  };

  let baseUrl = '';
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = createShopifyMcpHttpServer({ source: fakeSource, billing });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
  });

  afterAll(async () => {
    await closeServer();
  });

  it('runs batch Actor extraction and charges store-analyzed + product-extracted', async () => {
    charges.length = 0;
    const pushed: unknown[] = [];

    const results = await runShopifyStoreExtraction(
      { domains: ['https://allbirds.com/'] },
      {
        source: fakeSource,
        billing,
        pushData: async (items) => {
          pushed.push(...items);
        },
      },
    );

    expect(results).toHaveLength(1);
    expect(pushed).toHaveLength(1);
    expect(results[0]?.themeName).toBe('Impulse');
    expect(results[0]?.appNames).toContain('Klaviyo');
    expect(charges).toEqual([
      { eventName: 'store-analyzed', count: 1 },
      { eventName: 'product-extracted', count: 1 },
    ]);
  });

  it('serves /health, /mcp/.well-known/glama.json, and all 3 MCP tools', async () => {
    charges.length = 0;
    const healthRes = await fetch(`${baseUrl}/health`);
    expect(healthRes.status).toBe(200);

    const glamaRes = await fetch(`${baseUrl}/mcp/.well-known/glama.json`);
    expect(glamaRes.status).toBe(200);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'analyze_shopify_store',
      'extract_shopify_products',
      'compare_shopify_stores',
    ]);

    const analyzeRes = await client.callTool({
      name: 'analyze_shopify_store',
      arguments: { domain: 'allbirds.com' },
    });
    const analyzeJson = JSON.parse(
      (analyzeRes.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}',
    );
    expect(analyzeJson.isShopify).toBe(true);
    expect(analyzeJson.appNames).toContain('Klaviyo');

    const prodRes = await client.callTool({
      name: 'extract_shopify_products',
      arguments: { domain: 'allbirds.com', keyword: 'merino', inStockOnly: true },
    });
    const prodJson = JSON.parse(
      (prodRes.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}',
    );
    expect(prodJson.matchedCount).toBe(1);

    const cmpRes = await client.callTool({
      name: 'compare_shopify_stores',
      arguments: { domains: ['allbirds.com', 'gymshark.com'] },
    });
    const cmpJson = JSON.parse(
      (cmpRes.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}',
    );
    expect(cmpJson.count).toBe(2);
    expect(charges).toEqual([
      { eventName: 'mcp-query', count: 1 },
      { eventName: 'mcp-query', count: 1 },
      { eventName: 'mcp-query', count: 1 },
    ]);

    await transport.close();
  });
});
