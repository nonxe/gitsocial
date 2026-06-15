/**
 * Cloudflare Worker — GitSocial Backend Entrypoint
 * Routes API endpoints: posts, upload, like, delete.
 * Uses Cloudflare D1 for SQL database storage.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_PASSWORD = 'XYZ12345';
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/posts') {
        return await handleGetPosts(request, env);
      } else if (url.pathname === '/api/upload') {
        return await handleUpload(request, env);
      } else if (url.pathname === '/api/like') {
        return await handleLike(request, env);
      } else if (url.pathname === '/api/delete') {
        return await handleDelete(request, env);
      }
    } catch (err) {
      console.error('[worker] Error:', err.message);
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Default return (will be bypassed by static assets router if file exists)
    return new Response('Not found', { status: 404 });
  },
};

// ---------------------------------------------------------------------------
// GET /api/posts — List posts (newest first)
// ---------------------------------------------------------------------------
async function handleGetPosts(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM posts ORDER BY timestamp DESC'
  ).all();

  return new Response(JSON.stringify({ posts: results || [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// POST /api/upload — Proxy upload to catbox.moe & store post details
// ---------------------------------------------------------------------------
async function handleUpload(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const formData = await request.formData();
  const password = formData.get('password');
  const caption = formData.get('caption') || '';
  const file = formData.get('file');

  // Validate password
  if (password !== UPLOAD_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized — invalid password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Validate file
  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Upload to catbox.moe
  const catboxForm = new FormData();
  catboxForm.append('reqtype', 'fileupload');
  
  // Convert File to Blob to avoid workerd/Miniflare streaming bugs
  const arrayBuffer = await file.arrayBuffer();
  const fileBlob = new Blob([arrayBuffer], { type: file.type });
  catboxForm.append('fileToUpload', fileBlob, file.name || 'upload.bin');

  const catboxResponse = await fetch(CATBOX_API_URL, {
    method: 'POST',
    body: catboxForm,
  });

  if (!catboxResponse.ok) {
    return new Response(JSON.stringify({ error: 'Catbox upload failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const imageUrl = (await catboxResponse.text()).trim();
  const type = file.type.startsWith('video/') ? 'video' : 'image';

  const post = {
    id: crypto.randomUUID(),
    imageUrl,
    caption,
    author: 'Anonymous',
    timestamp: Date.now(),
    likes: 0,
    type,
  };

  // Store metadata in D1
  await env.DB.prepare(
    'INSERT INTO posts (id, imageUrl, caption, author, timestamp, likes, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(post.id, post.imageUrl, post.caption, post.author, post.timestamp, post.likes, post.type)
    .run();

  return new Response(JSON.stringify({ success: true, post }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// POST /api/like — Increment likes count
// ---------------------------------------------------------------------------
async function handleLike(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing post id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const updateRes = await env.DB.prepare(
    'UPDATE posts SET likes = likes + 1 WHERE id = ?'
  )
    .bind(id)
    .run();

  if (updateRes.meta.changes === 0) {
    return new Response(JSON.stringify({ error: 'Post not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const post = await env.DB.prepare(
    'SELECT likes FROM posts WHERE id = ?'
  )
    .bind(id)
    .first();

  return new Response(JSON.stringify({ success: true, likes: post.likes }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// POST /api/delete — Password-protected delete
// ---------------------------------------------------------------------------
async function handleDelete(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { id, password } = await request.json();

  if (password !== UPLOAD_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized — invalid password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing post id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const deleteRes = await env.DB.prepare(
    'DELETE FROM posts WHERE id = ?'
  )
    .bind(id)
    .run();

  if (deleteRes.meta.changes === 0) {
    return new Response(JSON.stringify({ error: 'Post not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
