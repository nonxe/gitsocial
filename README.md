# GitSocial 🌙

A beautiful iOS dark-themed social media platform with glassmorphism UI, powered by [Catbox.moe](https://catbox.moe) for media storage.

---

## ✨ Features

- 🎨 **iOS-inspired dark theme** with glassmorphism and smooth animations
- 📸 **Media uploads via Catbox.moe** — free, no-signup, direct URLs
- 🔐 **Password-protected uploads** to keep your feed curated
- ❤️ **Like functionality** on every post
- ☁️ **Deploy anywhere** — Cloudflare Pages or Vercel
- 📱 **Fully responsive**, mobile-first design

---

## 🚀 Quick Start

### Local Development

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000)

### Deploy to Cloudflare Pages

1. **Create a KV namespace:**
   ```bash
   npx wrangler kv:namespace create POSTS_KV
   ```
2. **Update `wrangler.toml`** with the KV namespace ID from step 1.
3. **Deploy:**
   ```bash
   npm run deploy:cf
   ```

### Deploy to Vercel

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```
2. **Set up Vercel KV** in your [Vercel Dashboard](https://vercel.com/dashboard).
3. **Add environment variables:**
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. **Deploy:**
   ```bash
   npm run deploy:vercel
   ```

---

## 🛠 Tech Stack

| Layer           | Technology                                  |
|-----------------|---------------------------------------------|
| **Frontend**    | HTML, CSS, JavaScript                       |
| **Media Store** | [Catbox.moe](https://catbox.moe)            |
| **Backend**     | Cloudflare Workers / Vercel Edge Functions   |
| **Data Store**  | Cloudflare KV / Vercel KV                   |

---

## 📡 API Endpoints

| Method | Endpoint       | Description                          |
|--------|----------------|--------------------------------------|
| GET    | `/api/posts`   | Fetch all posts                      |
| POST   | `/api/upload`  | Upload media (password required)     |
| POST   | `/api/like`    | Like a post                          |
| POST   | `/api/delete`  | Delete a post (password required)    |

---

## 🔑 Environment Variables

### Cloudflare

| Variable        | Description                |
|-----------------|----------------------------|
| `POSTS_KV`      | KV namespace binding       |

### Vercel

| Variable              | Description                  |
|-----------------------|------------------------------|
| `KV_REST_API_URL`     | Vercel KV REST API URL       |
| `KV_REST_API_TOKEN`   | Vercel KV REST API token     |

---

## 📄 License

[MIT](LICENSE)
