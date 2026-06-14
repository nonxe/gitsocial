/**
 * Cloudflare Pages Function — POST /api/upload
 *
 * Accepts multipart FormData with fields: file, caption, password.
 * Validates the password, uploads the file to catbox.moe,
 * then stores the new post in KV.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_PASSWORD = 'XYZ12345';
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

/**
 * Handle CORS preflight requests.
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/upload
 * 1. Validate password
 * 2. Upload file to catbox.moe
 * 3. Create & store the post in KV
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const password = formData.get('password');
    const caption = formData.get('caption') || '';
    const file = formData.get('file');

    // --- Validate password ---
    if (password !== UPLOAD_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — invalid password' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // --- Validate file ---
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // --- Upload to catbox.moe ---
    const catboxForm = new FormData();
    catboxForm.append('reqtype', 'fileupload');
    catboxForm.append('fileToUpload', file);

    const catboxResponse = await fetch(CATBOX_API_URL, {
      method: 'POST',
      body: catboxForm,
    });

    if (!catboxResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Catbox upload failed' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    const imageUrl = (await catboxResponse.text()).trim();

    // --- Determine media type from MIME ---
    const mimeType = file.type || '';
    const type = mimeType.startsWith('video/') ? 'video' : 'image';

    // --- Build the post object ---
    const post = {
      id: crypto.randomUUID(),
      imageUrl,
      caption,
      author: 'Anonymous',
      timestamp: Date.now(),
      likes: 0,
      type,
    };

    // --- Prepend to the posts index ---
    const indexRaw = await env.POSTS_KV.get('posts_index');
    const postIds = indexRaw ? JSON.parse(indexRaw) : [];
    postIds.unshift(post.id);
    await env.POSTS_KV.put('posts_index', JSON.stringify(postIds));

    // --- Store the post ---
    await env.POSTS_KV.put(`post:${post.id}`, JSON.stringify(post));

    return new Response(JSON.stringify({ success: true, post }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[upload] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}
