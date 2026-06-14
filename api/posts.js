/**
 * Vercel Edge Function — GET /api/posts
 *
 * Returns all posts from @vercel/kv storage, ordered newest-first.
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

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  try {
    // Fetch the ordered list of post IDs
    const postIds = (await kv.get('posts_index')) || [];

    // Fetch each post object in parallel
    const posts = await Promise.all(
      postIds.map(async (id) => {
        const post = await kv.get(`post:${id}`);
        return post || null;
      })
    );

    // Filter out any null entries
    const validPosts = posts.filter(Boolean);

    return new Response(JSON.stringify({ posts: validPosts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[posts] Error fetching posts:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch posts' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}
