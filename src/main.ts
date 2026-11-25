import { pathToFileURL } from 'node:url';
import { runActorBatch, type ShopifyBillingEvent } from './adapters/apify-actor.js';
import { createShopifyMcpHttpServer } from './adapters/mcp-server.js';
import { ShopifyHttpClient } from './adapters/shopify-http-client.js';
import { runDualModeActor } from './shared/actor-runner.js';
import { createApifyBillingMeter } from './shared/billing-meter.js';

export async function main(): Promise<void> {
  const source = new ShopifyHttpClient();
  const billing = createApifyBillingMeter<ShopifyBillingEvent>();

  await runDualModeActor({
    runBatch: () => runActorBatch(source, billing),
    createMcpServer: () => createShopifyMcpHttpServer({ source, billing }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
