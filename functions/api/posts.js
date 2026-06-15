/**
 * Cloudflare Pages Function — GET /api/posts
 *
 * Returns all posts from KV storage, ordered newest-first.
 * The posts_index key holds a JSON array of post IDs;
 * each post is stored under post:{id}.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle CORS preflight requests.
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/posts
 * Retrieves every post referenced in posts_index.
 */
export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Fetch posts from D1 SQL database
    const { results } = await env.DB.prepare(
      'SELECT * FROM posts ORDER BY timestamp DESC'
    ).all();



    return new Response(JSON.stringify({ posts: results || [] }), {
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
