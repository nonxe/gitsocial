/**
 * GitSocial — Heroku Backend Server
 *
 * A self-contained Express server that hosts the web app and API endpoints.
 * Uses PostgreSQL for database storage.
 *
 * Endpoints:
 *   GET  /api/posts   — list all posts (newest first)
 *   POST /api/upload  — upload media via catbox.moe
 *   POST /api/like    — increment a post's like count
 *   POST /api/delete  — delete a post (password-protected)
 */

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initDb } from './db.js';

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_PASSWORD = 'XYZ12345';
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

// Multer stores uploads in memory (we forward them to catbox immediately)
const upload = multer({ storage: multer.memoryStorage() });

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Parse JSON bodies
app.use(express.json());

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// GET /api/posts — Fetch all posts, newest first
// ---------------------------------------------------------------------------
app.get('/api/posts', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, "imageUrl", caption, author, timestamp, likes, type FROM posts ORDER BY timestamp DESC'
    );

    // PostgreSQL returns BIGINT as string. Convert values to standard JS types.
    const cleanPosts = rows.map((post) => ({
      ...post,
      timestamp: Number(post.timestamp),
      likes: Number(post.likes),
    }));

    return res.json({ posts: cleanPosts });
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

    // Validate password
    if (password !== UPLOAD_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized — invalid password' });
    }

    // Validate file
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // 1. Manually construct multipart/form-data for tmpfiles.org upload
    const boundary = '----WebKitFormBoundarygs' + Math.random().toString(36).substring(2);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${req.file.originalname}"\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(header, 'utf-8'),
      req.file.buffer,
      Buffer.from(footer, 'utf-8')
    ]);

    // 2. Upload to tmpfiles.org
    const tmpfilesResponse = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: bodyBuffer,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    });

    if (!tmpfilesResponse.ok) {
      const errText = await tmpfilesResponse.text();
      console.error('[upload] tmpfiles.org error:', errText);
      return res.status(502).json({ error: 'Transient upload failed' });
    }

    const tmpfilesData = await tmpfilesResponse.json();
    const tmpfilesUrl = tmpfilesData.data.url;
    
    // 3. Convert to direct download link
    const directDownloadUrl = tmpfilesUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

    // 4. Request Catbox to rehost the file via urlupload (simple string form data)
    const catboxForm = new FormData();
    catboxForm.append('reqtype', 'urlupload');
    catboxForm.append('url', directDownloadUrl);

    const catboxResponse = await fetch(CATBOX_API_URL, {
      method: 'POST',
      body: catboxForm,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!catboxResponse.ok) {
      const errText = await catboxResponse.text();
      console.error('[upload] Catbox rehost error:', errText);
      return res.status(502).json({ error: 'Catbox rehost failed' });
    }

    const imageUrl = (await catboxResponse.text()).trim();
    if (!imageUrl.startsWith('https://files.catbox.moe')) {
      console.error('[upload] Catbox invalid response:', imageUrl);
      return res.status(502).json({ error: 'Catbox upload failed: ' + imageUrl });
    }
    const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    const post = {
      id: randomUUID(),
      imageUrl,
      caption,
      author: 'Anonymous',
      timestamp: Date.now(),
      likes: 0,
      type,
    };

    // Store in PostgreSQL
    await query(
      'INSERT INTO posts (id, "imageUrl", caption, author, timestamp, likes, type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [post.id, post.imageUrl, post.caption, post.author, post.timestamp, post.likes, post.type]
    );

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
app.post('/api/like', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing post id' });
    }

    const { rows } = await query(
      'UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING likes',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const updatedLikes = Number(rows[0].likes);
    console.log(`[like] ♥ Post ${id} now has ${updatedLikes} likes`);
    return res.json({ success: true, likes: updatedLikes });
  } catch (error) {
    console.error('[like] Error:', error);
    return res.status(500).json({ error: 'Failed to like post' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/delete — Remove a post (password-protected)
// ---------------------------------------------------------------------------
app.post('/api/delete', async (req, res) => {
  try {
    const { id, password } = req.body;

    // Validate password
    if (password !== UPLOAD_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized — invalid password' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Missing post id' });
    }

    const { rowCount } = await query('DELETE FROM posts WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    console.log(`[delete] ✗ Post ${id} removed`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[delete] Error:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Initialize database schema and start listening
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log('');
      console.log('  ╔═══════════════════════════════════════╗');
      console.log('  ║                                       ║');
      console.log('  ║  🚀  GitSocial Heroku DB Server       ║');
      console.log('  ║                                       ║');
      console.log(`  ║  Local:  http://localhost:${PORT}        ║`);
      console.log('  ║                                       ║');
      console.log('  ║  Storage: Heroku Postgres             ║');
      console.log('  ║                                       ║');
      console.log('  ╚═══════════════════════════════════════╝');
      console.log('');
    });
  })
  .catch((err) => {
    console.error('CRITICAL: Database initialization failed:', err);
    process.exit(1);
  });
