import { settings } from '@devvit/web/server';
import { QlooClient, QlooError } from '@taste/qloo';

let cached: { key: string; client: QlooClient } | null = null;

/**
 * The key lives in a global secret setting, never in the bundle. Re-reading it
 * per call is what lets an install fix a bad key without a redeploy.
 */
export async function qloo(): Promise<QlooClient> {
  const key = (await settings.get<string>('qlooApiKey'))?.trim();
  if (!key) {
    throw new QlooError('config', 'Qloo API key is not configured for this app', {
      hint: 'A moderator must run `npx devvit settings set qlooApiKey`, then reload this post.',
    });
  }
  if (cached?.key !== key) {
    cached = { key, client: new QlooClient({ apiKey: key }) };
  }
  return cached.client;
}

export async function keyConfigured(): Promise<boolean> {
  return Boolean((await settings.get<string>('qlooApiKey'))?.trim());
}
