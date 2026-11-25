# Shopify Store Intelligence, Apps & Catalog + MCP

**Keyless, HTTP-only (< 512 MB RAM) Apify Actor & Standby Streamable HTTP MCP Server** for Shopify store intelligence, app/pixel stack detection, contact extraction, and product catalog pricing analysis.

- **Apify Store:** `https://apify.com/mr.wolf/shopify-store-intel-mcp-server`
- **Standby MCP Endpoint:** `https://mr-wolf-1--shopify-store-intel-mcp-server.apify.actor/mcp`
- **Source Code:** `https://github.com/Mr-Wolf-Dev/shopify-store-intel-mcp-server`

## What It Extracts

- **Store & Theme Metadata:** Confirms Shopify platform, `.myshopify.com` domain, active theme name/ID, currency, and country code.
- **28+ Apps & Marketing Pixels:** Klaviyo, Omnisend, Postscript, Attentive, Privy, Judge.me, Yotpo, Loox, Okendo, Stamped.io, Gorgias, Zendesk, Intercom, Recharge, Bold Commerce, Smile.io, Rebuy, Loop Returns, AfterShip, Triple Whale, Northbeam, Elevar, GTM/GA4, Hotjar, Microsoft Clarity, Meta Pixel, TikTok Pixel, Pinterest Tag.
- **Payments & BNPL:** Shop Pay, Apple Pay, Google Pay, PayPal, Klarna, Afterpay, Affirm, Sezzle.
- **Contacts & Socials:** Public contact emails and social profile URLs (Instagram, TikTok, Facebook, X/Twitter, YouTube, LinkedIn, Pinterest).
- **Catalog & Pricing Stats:** Normalized `/products.json` and `/collections.json` with min/max/avg price, sale count, stock availability, top vendors, and top product types (with graceful fallback when a store rate-limits or disables `/products.json`).

## MCP Tools (Streamable HTTP)

- `analyze_shopify_store` — Full store stack, theme, apps, payments, contacts, and catalog summary.
- `extract_shopify_products` — Extract and filter `/products.json` by keyword, vendor, product type, price range, and stock.
- `compare_shopify_stores` — Compare up to 5 Shopify stores side-by-side.

### Connect via MCP Client

```json
{
  "mcpServers": {
    "shopify-store-intel": {
      "url": "https://mr-wolf-1--shopify-store-intel-mcp-server.apify.actor/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```
