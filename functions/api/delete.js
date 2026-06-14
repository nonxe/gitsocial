/**
 * Cloudflare Pages Function — POST /api/delete
 *
 * Accepts JSON { id: "post-id", password: "XYZ12345" }.
 * Validates the password, removes the post from the index,
 * and deletes the post object from KV.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_PASSWORD = 'XYZ12345';

/**
 * Handle CORS preflight requests.
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/delete
 * 1. Validate password
 * 2. Remove post ID from posts_index
 * 3. Delete the post object
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { id, password } = await request.json();

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
    const indexRaw = await env.POSTS_KV.get('posts_index');
    const postIds = indexRaw ? JSON.parse(indexRaw) : [];
    const updatedIds = postIds.filter((pid) => pid !== id);
    await env.POSTS_KV.put('posts_index', JSON.stringify(updatedIds));

    // --- Delete the post object ---
    await env.POSTS_KV.delete(`post:${id}`);

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
