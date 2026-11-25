import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ShopifyHttpClient } from '../../src/adapters/shopify-http-client.js';

const server = setupServer();

describe('ShopifyHttpClient', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('fetches homepage, products, and collections over HTTP', async () => {
    server.use(
      http.get('https://demo-shop.com/', () =>
        HttpResponse.html('<html><title>Demo Shop</title><script src="https://cdn.shopify.com/x.js"></script></html>'),
      ),
      http.get('https://demo-shop.com/products.json', () =>
        HttpResponse.json({
          products: [{ id: 101, title: 'Canvas Tote', handle: 'canvas-tote', variants: [{ price: '35.00' }] }],
        }),
      ),
      http.get('https://demo-shop.com/collections.json', () =>
        HttpResponse.json({
          collections: [{ id: 201, title: 'Bags', handle: 'bags', products_count: 4 }],
        }),
      ),
    );

    const client = new ShopifyHttpClient();
    const home = await client.fetchStoreHomepage('demo-shop.com');
    const prods = await client.fetchStoreProducts('demo-shop.com', 10);
    const cols = await client.fetchStoreCollections('demo-shop.com', 10);

    expect(home.statusCode).toBe(200);
    expect(home.html).toContain('Demo Shop');
    expect(prods.status).toBe('ok');
    expect(prods.products).toHaveLength(1);
    expect(cols.status).toBe('ok');
    expect(cols.collections).toHaveLength(1);
  });

  it('gracefully handles HTTP 429 rate_limited and 404 disabled feeds', async () => {
    server.use(
      http.get('https://limited-shop.com/products.json', () =>
        HttpResponse.text('local_rate_limited', { status: 429 }),
      ),
      http.get('https://limited-shop.com/collections.json', () =>
        HttpResponse.text('Not Found', { status: 404 }),
      ),
    );

    const client = new ShopifyHttpClient();
    const prods = await client.fetchStoreProducts('limited-shop.com', 10);
    const cols = await client.fetchStoreCollections('limited-shop.com', 10);

    expect(prods).toEqual({ status: 'rate_limited', products: [] });
    expect(cols).toEqual({ status: 'disabled', collections: [] });
  });
});
