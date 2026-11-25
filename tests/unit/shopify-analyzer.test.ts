import { describe, expect, it } from 'vitest';
import {
  analyzeStoreHtml,
  computePricingStats,
  filterShopifyProducts,
  normalizeShopifyCollections,
  normalizeShopifyProducts,
} from '../../src/domain/shopify-analyzer.js';
import { normalizeStoreDomain, parseActorInput } from '../../src/domain/shopify-schema.js';

describe('shopify-schema', () => {
  it('normalizes URLs and deduplicates domains', () => {
    expect(normalizeStoreDomain('https://www.Allbirds.com/products/runner')).toBe('www.allbirds.com');
    const parsed = parseActorInput({
      domains: ['https://gymshark.com/', 'GYMSHARK.COM'],
      maxProductsPerStore: 20,
    });
    expect(parsed.domains).toEqual(['gymshark.com']);
    expect(parsed.maxProductsPerStore).toBe(20);
  });
});

describe('shopify-analyzer', () => {
  it('extracts Shopify theme, apps, pixels, payments, socials, and emails from HTML', () => {
    const html = `
      <html>
        <head>
          <title>Acme Outdoor Gear</title>
          <meta name="description" content="Trail shoes and apparel">
          <script src="https://cdn.shopify.com/s/files/1/app.js"></script>
          <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
          <script src="https://cdn.judge.me/assets/installed.js"></script>
          <script src="https://config.gorgias.chat/gorgias-chat-bundle.js"></script>
          <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
          <script src="https://x.klarnacdn.net/kp/lib/v1/api.js"></script>
          <script>
            Shopify.theme = {"name":"Dawn","id":123456789};
            Shopify.currency = {"active":"USD","rate":"1.0"};
            Shopify.country = "US";
            var shop = "acme-gear.myshopify.com";
          </script>
        </head>
        <body>
          <div class="shopify-payment-button">Shop Pay</div>
          <a href="mailto:support@acmegear.com">Email us</a>
          <a href="https://instagram.com/acmegear">Instagram</a>
          <a href="https://www.tiktok.com/@acmegear">TikTok</a>
        </body>
      </html>
    `;

    const result = analyzeStoreHtml(html);
    expect(result.isShopify).toBe(true);
    expect(result.myshopifyDomain).toBe('acme-gear.myshopify.com');
    expect(result.themeName).toBe('Dawn');
    expect(result.themeId).toBe('123456789');
    expect(result.currency).toBe('USD');
    expect(result.countryCode).toBe('US');
    expect(result.apps.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Klaviyo', 'Judge.me', 'Gorgias', 'Meta Pixel']),
    );
    expect(result.paymentMethods).toEqual(expect.arrayContaining(['Shop Pay', 'Klarna']));
    expect(result.emails).toContain('support@acmegear.com');
    expect(result.socialLinks).toEqual({
      instagram: 'https://instagram.com/acmegear',
      tiktok: 'https://www.tiktok.com/@acmegear',
    });
  });

  it('normalizes products, computes pricing stats, and filters products', () => {
    const products = normalizeShopifyProducts('acmegear.com', [
      {
        id: 1,
        title: 'Trail Runner',
        handle: 'trail-runner',
        vendor: 'Acme',
        product_type: 'Shoes',
        tags: ['running', 'waterproof'],
        variants: [{ price: '99.00', compare_at_price: '129.00', available: true }],
        images: [{ src: 'https://cdn.shopify.com/1.jpg' }],
      },
      {
        id: 2,
        title: 'Wool Sock',
        handle: 'wool-sock',
        vendor: 'Acme',
        product_type: 'Accessories',
        tags: 'merino,winter',
        variants: [{ price: '21.00', compare_at_price: null, available: false }],
      },
    ]);

    expect(products).toHaveLength(2);
    expect(products[0]?.onSale).toBe(true);
    expect(products[1]?.available).toBe(false);
    expect(products[1]?.tags).toEqual(['merino', 'winter']);

    const stats = computePricingStats(products);
    expect(stats.productCount).toBe(2);
    expect(stats.minPrice).toBe(21);
    expect(stats.maxPrice).toBe(99);
    expect(stats.avgPrice).toBe(60);
    expect(stats.onSaleCount).toBe(1);
    expect(stats.inStockCount).toBe(1);

    const filtered = filterShopifyProducts(products, {
      keyword: 'runner',
      inStockOnly: true,
      minPrice: 50,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.handle).toBe('trail-runner');

    const collections = normalizeShopifyCollections('acmegear.com', [
      { id: 10, title: 'Best Sellers', handle: 'best-sellers', products_count: 12 },
    ]);
    expect(collections[0]?.url).toBe('https://acmegear.com/collections/best-sellers');
  });
});
