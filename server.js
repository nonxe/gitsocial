/**
 * GitSocial — Local Development Server
 *
 * A self-contained Express server that mirrors the production API.
 * Uses an in-memory Map as a KV store so there are no external
 * dependencies beyond Express and Multer.
 *
 * Endpoints:
 *   GET  /api/posts   — list all posts (newest first)
 *   POST /api/upload  — upload media via catbox.moe
 *   POST /api/like    — increment a post's like count
 *   POST /api/delete  — delete a post (password-protected)
 *
 * Run:
 *   npm install express multer
 *   node server.js
 */

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_PASSWORD = 'XYZ12345';
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

// Multer stores uploads in memory (we forward them to catbox immediately)
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// In-Memory KV Store
// ---------------------------------------------------------------------------

const kvStore = new Map();

/** Get a value from the in-memory KV. */
function kvGet(key) {
  const value = kvStore.get(key);
  return value !== undefined ? JSON.parse(value) : null;
}

/** Put a value into the in-memory KV. */
function kvPut(key, value) {
  kvStore.set(key, JSON.stringify(value));
}

/** Delete a key from the in-memory KV. */
function kvDelete(key) {
  kvStore.delete(key);
}

// Initialize the posts index
kvPut('posts_index', []);

// ---------------------------------------------------------------------------
// CORS Middleware
// ---------------------------------------------------------------------------

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Parse JSON bodies (for /api/like and /api/delete)
app.use(express.json());

// Serve the front-end from public/
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// GET /api/posts — Fetch all posts, newest first
// ---------------------------------------------------------------------------

app.get('/api/posts', (req, res) => {
  try {
    const postIds = kvGet('posts_index') || [];

    const posts = postIds
      .map((id) => kvGet(`post:${id}`))
      .filter(Boolean);

    return res.json({ posts });
  } catch (error) {
    console.error('[posts] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload — Upload media to catbox.moe and create a post
// ---------------------------------------------------------------------------

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { password, caption = '' } = req.body;

    // --- Validate password ---
    if (password !== UPLOAD_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized — invalid password' });
    }

    // --- Validate file ---
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // --- Upload to catbox.moe ---
    const catboxForm = new FormData();
    catboxForm.append('reqtype', 'fileupload');
    catboxForm.append(
      'fileToUpload',
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname
    );

    const catboxResponse = await fetch(CATBOX_API_URL, {
      method: 'POST',
      body: catboxForm,
    });

    if (!catboxResponse.ok) {
      const errText = await catboxResponse.text();
      console.error('[upload] Catbox error:', errText);
      return res.status(502).json({ error: 'Catbox upload failed' });
    }

    const imageUrl = (await catboxResponse.text()).trim();

    // --- Determine media type ---
    const mimeType = req.file.mimetype || '';
    const type = mimeType.startsWith('video/') ? 'video' : 'image';

    // --- Build the post object ---
    const post = {
      id: randomUUID(),
      imageUrl,
      caption,
      author: 'Anonymous',
      timestamp: Date.now(),
      likes: 0,
      type,
    };

    // --- Prepend to the posts index ---
    const postIds = kvGet('posts_index') || [];
    postIds.unshift(post.id);
    kvPut('posts_index', postIds);

    // --- Store the post ---
    kvPut(`post:${post.id}`, post);

    console.log(`[upload] ✓ New ${type} post ${post.id}`);
    return res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('[upload] Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/like — Increment a post's like count
// ---------------------------------------------------------------------------

app.post('/api/like', (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing post id' });
    }

    const post = kvGet(`post:${id}`);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    post.likes += 1;
    kvPut(`post:${id}`, post);

    console.log(`[like] ♥ Post ${id} now has ${post.likes} likes`);
    return res.json({ success: true, likes: post.likes });
  } catch (error) {
    console.error('[like] Error:', error);
    return res.status(500).json({ error: 'Failed to like post' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/delete — Remove a post (password-protected)
// ---------------------------------------------------------------------------

app.post('/api/delete', (req, res) => {
  try {
    const { id, password } = req.body;

    // --- Validate password ---
    if (password !== UPLOAD_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized — invalid password' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Missing post id' });
    }

    // --- Remove from the posts index ---
    const postIds = kvGet('posts_index') || [];
    const updatedIds = postIds.filter((pid) => pid !== id);
    kvPut('posts_index', updatedIds);

    // --- Delete the post ---
    kvDelete(`post:${id}`);

    console.log(`[delete] ✗ Post ${id} removed`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[delete] Error:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║                                       ║');
  console.log('  ║   🚀  GitSocial Dev Server Running    ║');
  console.log('  ║                                       ║');
  console.log(`  ║   Local:  http://localhost:${PORT}        ║`);
  console.log('  ║                                       ║');
  console.log('  ║   Endpoints:                          ║');
  console.log('  ║     GET  /api/posts                   ║');
  console.log('  ║     POST /api/upload                  ║');
  console.log('  ║     POST /api/like                    ║');
  console.log('  ║     POST /api/delete                  ║');
  console.log('  ║                                       ║');
  console.log('  ║   Storage: In-Memory KV               ║');
  console.log('  ║                                       ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
});
