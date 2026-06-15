/**
 * Vercel Edge Function — POST /api/upload
 *
 * Accepts multipart FormData with fields: file, caption, password.
 * Validates the password, uploads the file to catbox.moe,
 * then stores the new post in @vercel/kv.
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_PASSWORD = 'XYZ12345';
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

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
    const formData = await req.formData();
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
    
    // Convert the File to a standard Blob to avoid Edge runtime streaming issues
    const arrayBuffer = await file.arrayBuffer();
    const fileBlob = new Blob([arrayBuffer], { type: file.type });
    catboxForm.append('fileToUpload', fileBlob, file.name || 'upload.bin');

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
    const postIds = (await kv.get('posts_index')) || [];
    postIds.unshift(post.id);
    await kv.set('posts_index', postIds);

    // --- Store the post ---
    await kv.set(`post:${post.id}`, post);

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
