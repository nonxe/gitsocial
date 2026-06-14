/**
 * Vercel Edge Function — POST /api/delete
 *
 * Accepts JSON { id: "post-id", password: "XYZ12345" }.
 * Validates the password, removes the post from the index,
 * and deletes the post from @vercel/kv.
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_PASSWORD = 'XYZ12345';

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  try {
    const { id, password } = await req.json();

    // --- Validate password ---
    if (password !== UPLOAD_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — invalid password' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing post id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // --- Remove from the posts index ---
    const postIds = (await kv.get('posts_index')) || [];
    const updatedIds = postIds.filter((pid) => pid !== id);
    await kv.set('posts_index', updatedIds);

    // --- Delete the post object ---
    await kv.del(`post:${id}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[delete] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete post' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}
