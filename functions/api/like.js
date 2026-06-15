/**
 * Cloudflare Pages Function — POST /api/like
 *
 * Accepts JSON { id: "post-id" }, increments the post's
 * like count in KV, and returns the new total.
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
 * POST /api/like
 * 1. Read the post from KV
 * 2. Increment likes
 * 3. Write back to KV
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { id } = await request.json();

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing post id' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // Update the like count in D1
    const updateRes = await env.DB.prepare(
      'UPDATE posts SET likes = likes + 1 WHERE id = ?'
    )
      .bind(id)
      .run();

    if (updateRes.meta.changes === 0) {
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // Fetch the updated likes count
    const post = await env.DB.prepare(
      'SELECT likes FROM posts WHERE id = ?'
    )
      .bind(id)
      .first();

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
