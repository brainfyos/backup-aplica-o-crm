import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('WhatsApp Meta send remains isolated from Instagram credentials and clients', async () => {
  const sourceUrl = new URL('./index.ts', import.meta.url);
  const source = await Deno.readTextFile(sourceUrl);

  assert(source.includes(".from('whatsapp_meta_connections')"));
  assert(source.includes("from '../_shared/meta-graph.ts'"));
  assertEquals(source.includes('instagram_connections'), false);
  assertEquals(source.includes('page_access_token_encrypted'), false);
  assertEquals(source.includes('ig_user_access_token_encrypted'), false);
  assertEquals(source.includes('ig-page-graph'), false);
});