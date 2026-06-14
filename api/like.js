/**
 * Vercel Edge Function — POST /api/like
 *
 * Accepts JSON { id: "post-id" }, increments the post's
 * like count in @vercel/kv, and returns the new total.
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
    const { id } = await req.json();

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing post id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // Fetch the existing post
    const post = await kv.get(`post:${id}`);
    if (!post) {
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    post.likes += 1;

    // Persist the updated post
    await kv.set(`post:${id}`, post);

    return new Response(JSON.stringify({ success: true, likes: post.likes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[like] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to like post' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}
