import * as cheerio from 'cheerio';
import type {
  AppCategory,
  ProductFilter,
  ShopifyAppDetection,
  ShopifyCollection,
  ShopifyPricingStats,
  ShopifyProduct,
} from './shopify-schema.js';

interface AppSignature {
  name: string;
  category: AppCategory;
  patterns: RegExp[];
}

const APP_SIGNATURES: AppSignature[] = [
  { name: 'Klaviyo', category: 'email_marketing', patterns: [/static\.klaviyo\.com/i, /klaviyo\.com\/onsite/i, /_learnq/i] },
  { name: 'Omnisend', category: 'email_marketing', patterns: [/omnisnippet1\.com/i, /omnisend\.com/i] },
  { name: 'Postscript', category: 'email_marketing', patterns: [/sdk\.postscript\.io/i, /postscript\.io/i] },
  { name: 'Attentive', category: 'email_marketing', patterns: [/cdn\.attn\.tv/i, /attentivemobile\.com/i] },
  { name: 'Privy', category: 'popup', patterns: [/widget\.privy\.com/i, /privy\.com\/assets/i] },
  { name: 'Judge.me', category: 'reviews', patterns: [/cdn\.judge\.me/i, /judgeme/i] },
  { name: 'Yotpo', category: 'reviews', patterns: [/staticw2\.yotpo\.com/i, /yotpo\.com/i] },
  { name: 'Loox', category: 'reviews', patterns: [/loox\.io\/widget/i, /loox\.io/i] },
  { name: 'Okendo', category: 'reviews', patterns: [/cdn-static\.okendo\.io/i, /okendo\.io/i] },
  { name: 'Stamped.io', category: 'reviews', patterns: [/cdn1\.stamped\.io/i, /stamped\.io/i] },
  { name: 'Gorgias', category: 'support', patterns: [/config\.gorgias\.chat/i, /gorgias\.io/i] },
  { name: 'Zendesk', category: 'support', patterns: [/static\.zdassets\.com/i, /zendesk\.com/i] },
  { name: 'Intercom', category: 'support', patterns: [/widget\.intercom\.io/i, /intercomcdn\.com/i] },
  { name: 'Recharge', category: 'subscriptions', patterns: [/rechargeapps\.com/i, /rechargepayments\.com/i] },
  { name: 'Bold Commerce', category: 'subscriptions', patterns: [/boldapps\.net/i, /boldcommerce\.com/i] },
  { name: 'Smile.io', category: 'loyalty', patterns: [/js\.smile\.io/i, /smile\.io/i] },
  { name: 'Rebuy', category: 'upsell', patterns: [/cdn\.rebuyengine\.com/i, /rebuyengine\.com/i] },
  { name: 'Loop Returns', category: 'returns', patterns: [/loopreturns\.com/i] },
  { name: 'AfterShip', category: 'shipping', patterns: [/aftership\.com/i, /automizely/i] },
  { name: 'Triple Whale', category: 'analytics', patterns: [/api\.config-security\.com/i, /triplewhale\.com/i, /TriplePixel/i] },
  { name: 'Northbeam', category: 'analytics', patterns: [/j\.northbeam\.io/i, /northbeam\.io/i] },
  { name: 'Elevar', category: 'analytics', patterns: [/getelevar\.com/i, /elevar/i] },
  { name: 'Google Tag Manager / GA4', category: 'analytics', patterns: [/googletagmanager\.com\/gtm\.js/i, /googletagmanager\.com\/gtag\/js/i] },
  { name: 'Hotjar', category: 'analytics', patterns: [/static\.hotjar\.com/i] },
  { name: 'Microsoft Clarity', category: 'analytics', patterns: [/clarity\.ms\/tag/i] },
  { name: 'Meta Pixel', category: 'ads_pixel', patterns: [/connect\.facebook\.net\/.*\/fbevents\.js/i, /fbq\(['"]init['"]/i] },
  { name: 'TikTok Pixel', category: 'ads_pixel', patterns: [/analytics\.tiktok\.com/i, /ttq\.load\(/i] },
  { name: 'Pinterest Tag', category: 'ads_pixel', patterns: [/s\.pinimg\.com\/ct\/core\.js/i, /pintrk\(['"]load['"]/i] },
];

const PAYMENT_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Shop Pay', pattern: /shop_pay|shopify-payment-button|shop\.app\/pay/i },
  { name: 'Apple Pay', pattern: /apple-pay|ApplePaySession/i },
  { name: 'Google Pay', pattern: /google-pay|pay\.google\.com/i },
  { name: 'PayPal', pattern: /paypal\.com\/sdk|paypalobjects\.com|paypal-button/i },
  { name: 'Klarna', pattern: /x\.klarnacdn\.net|klarna-placement|klarna/i },
  { name: 'Afterpay', pattern: /js\.afterpay\.com|afterpay-placement|afterpay/i },
  { name: 'Affirm', pattern: /cdn1\.affirm\.com|affirm-as-low-as/i },
  { name: 'Sezzle', pattern: /widget\.sezzle\.com|sezzle/i },
];

const SOCIAL_DOMAINS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'instagram', pattern: /^https?:\/\/(www\.)?instagram\.com\//i },
  { key: 'tiktok', pattern: /^https?:\/\/(www\.)?tiktok\.com\//i },
  { key: 'facebook', pattern: /^https?:\/\/(www\.)?facebook\.com\//i },
  { key: 'twitter', pattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i },
  { key: 'youtube', pattern: /^https?:\/\/(www\.)?youtube\.com\//i },
  { key: 'linkedin', pattern: /^https?:\/\/(www\.)?linkedin\.com\//i },
  { key: 'pinterest', pattern: /^https?:\/\/(www\.)?pinterest\.com\//i },
];

export interface HtmlStoreAnalysis {
  isShopify: boolean;
  myshopifyDomain: string | null;
  title: string | null;
  metaDescription: string | null;
  themeName: string | null;
  themeId: string | null;
  currency: string | null;
  countryCode: string | null;
  apps: ShopifyAppDetection[];
  paymentMethods: string[];
  emails: string[];
  socialLinks: Record<string, string>;
}

/**
 * Extracts Shopify platform markers, theme metadata, installed apps, pixels, payments, and contacts from store HTML.
 */
export function analyzeStoreHtml(html: string): HtmlStoreAnalysis {
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    null;

  const isShopify =
    /cdn\.shopify\.com/i.test(html) ||
    /Shopify\.theme\s*=/i.test(html) ||
    /shopify-digital-wallet/i.test(html) ||
    /\.myshopify\.com/i.test(html);

  const myshopifyMatch = html.match(/([a-z0-9][a-z0-9-]*\.myshopify\.com)/i);
  const myshopifyDomain = myshopifyMatch?.[1]?.toLowerCase() ?? null;

  let themeName: string | null = null;
  let themeId: string | null = null;
  const themeMatch = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/i);
  const themeBlock = themeMatch?.[1];
  if (themeBlock) {
    const nameMatch = themeBlock.match(/"name"\s*:\s*"([^"]+)"/);
    const idMatch = themeBlock.match(/"id"\s*:\s*(\d+)/);
    themeName = nameMatch?.[1] ?? null;
    themeId = idMatch?.[1] ?? null;
  }

  const currencyMatch =
    html.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/i) ||
    html.match(/"currency"\s*:\s*"([A-Z]{3})"/i);
  const currency = currencyMatch?.[1]?.toUpperCase() ?? null;

  const countryMatch = html.match(/Shopify\.country\s*=\s*"([A-Z]{2})"/i);
  const countryCode = countryMatch?.[1]?.toUpperCase() ?? null;

  const apps: ShopifyAppDetection[] = [];
  for (const sig of APP_SIGNATURES) {
    if (sig.patterns.some((p) => p.test(html))) {
      apps.push({ name: sig.name, category: sig.category });
    }
  }

  const paymentMethods = PAYMENT_SIGNATURES.filter((p) => p.pattern.test(html)).map((p) => p.name);

  const socialLinks: Record<string, string> = {};
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;
    for (const social of SOCIAL_DOMAINS) {
      if (!socialLinks[social.key] && social.pattern.test(href)) {
        socialLinks[social.key] = href;
      }
    }
  });

  const emailSet = new Set<string>();
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = $(el).attr('href')?.replace(/^mailto:/i, '').split('?')[0]?.trim().toLowerCase();
    if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      emailSet.add(raw);
    }
  });
  const bodyTextMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  for (const candidate of bodyTextMatches) {
    const lower = candidate.toLowerCase();
    if (
      !lower.endsWith('.png') &&
      !lower.endsWith('.jpg') &&
      !lower.endsWith('.svg') &&
      !lower.endsWith('@example.com') &&
      !lower.endsWith('@shopify.com') &&
      !lower.includes('sentry.io')
    ) {
      emailSet.add(lower);
    }
  }

  return {
    isShopify,
    myshopifyDomain,
    title,
    metaDescription,
    themeName,
    themeId,
    currency,
    countryCode,
    apps,
    paymentMethods,
    emails: Array.from(emailSet).slice(0, 10),
    socialLinks,
  };
}

export interface RawShopifyVariant {
  price?: string | number | null;
  compare_at_price?: string | number | null;
  available?: boolean;
}

export interface RawShopifyProduct {
  id: number;
  title?: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  published_at?: string | null;
  updated_at?: string | null;
  variants?: RawShopifyVariant[];
  images?: Array<{ src?: string }>;
}

export interface RawShopifyCollection {
  id: number;
  title?: string;
  handle?: string;
  products_count?: number | null;
  updated_at?: string | null;
}

function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes raw `/products.json` items into structured ShopifyProduct records.
 */
export function normalizeShopifyProducts(
  domain: string,
  rawProducts: RawShopifyProduct[],
  maxItems = 250,
): ShopifyProduct[] {
  return rawProducts.slice(0, maxItems).map((raw) => {
    const variants = raw.variants ?? [];
    const prices = variants.map((v) => parsePrice(v.price)).filter((p): p is number => p !== null);
    const comparePrices = variants
      .map((v) => parsePrice(v.compare_at_price))
      .filter((p): p is number => p !== null);

    const priceMin = prices.length > 0 ? Math.min(...prices) : null;
    const priceMax = prices.length > 0 ? Math.max(...prices) : null;
    const compareAtPriceMax = comparePrices.length > 0 ? Math.max(...comparePrices) : null;
    const onSale =
      priceMin !== null && compareAtPriceMax !== null && compareAtPriceMax > priceMin;

    const available =
      variants.length === 0 ? true : variants.some((v) => v.available !== false);

    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((t) => t.trim()).filter(Boolean)
      : typeof raw.tags === 'string'
        ? raw.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const handle = raw.handle ?? String(raw.id);

    return {
      id: raw.id,
      title: raw.title?.trim() || handle,
      handle,
      vendor: raw.vendor?.trim() || null,
      productType: raw.product_type?.trim() || null,
      priceMin,
      priceMax,
      compareAtPriceMax,
      onSale,
      available,
      variantCount: variants.length,
      tags,
      url: `https://${domain}/products/${handle}`,
      imageUrl: raw.images?.[0]?.src ?? null,
      publishedAt: raw.published_at ?? null,
      updatedAt: raw.updated_at ?? null,
    };
  });
}

/**
 * Normalizes raw `/collections.json` items into structured ShopifyCollection records.
 */
export function normalizeShopifyCollections(
  domain: string,
  rawCollections: RawShopifyCollection[],
): ShopifyCollection[] {
  return rawCollections.map((c) => {
    const handle = c.handle ?? String(c.id);
    return {
      id: c.id,
      title: c.title?.trim() || handle,
      handle,
      productsCount: typeof c.products_count === 'number' ? c.products_count : null,
      url: `https://${domain}/collections/${handle}`,
      updatedAt: c.updated_at ?? null,
    };
  });
}

function topCounts(values: Array<string | null>, limit = 5): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const val of values) {
    if (!val) continue;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Computes aggregate pricing and merchandising statistics from normalized products.
 */
export function computePricingStats(products: ShopifyProduct[]): ShopifyPricingStats {
  const prices = products.map((p) => p.priceMin).filter((p): p is number => p !== null);
  const sum = prices.reduce((acc, p) => acc + p, 0);

  return {
    productCount: products.length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    avgPrice: prices.length > 0 ? Number((sum / prices.length).toFixed(2)) : null,
    onSaleCount: products.filter((p) => p.onSale).length,
    inStockCount: products.filter((p) => p.available).length,
    topVendors: topCounts(products.map((p) => p.vendor)),
    topProductTypes: topCounts(products.map((p) => p.productType)),
  };
}

/**
 * Filters normalized Shopify products by keyword, vendor, type, price range, and stock availability.
 */
export function filterShopifyProducts(
  products: ShopifyProduct[],
  filter: ProductFilter,
): ShopifyProduct[] {
  const kw = filter.keyword?.trim().toLowerCase();
  const vendor = filter.vendor?.trim().toLowerCase();
  const productType = filter.productType?.trim().toLowerCase();

  return products.filter((p) => {
    if (filter.inStockOnly && !p.available) return false;
    if (vendor && !(p.vendor ?? '').toLowerCase().includes(vendor)) return false;
    if (productType && !(p.productType ?? '').toLowerCase().includes(productType)) return false;
    if (filter.minPrice !== undefined && (p.priceMin === null || p.priceMin < filter.minPrice)) {
      return false;
    }
    if (filter.maxPrice !== undefined && (p.priceMin === null || p.priceMin > filter.maxPrice)) {
      return false;
    }
    if (kw) {
      const haystack = `${p.title} ${p.vendor ?? ''} ${p.productType ?? ''} ${p.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}
