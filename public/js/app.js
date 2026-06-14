/* ================================================================
   GitSocial — Frontend Application Logic
   Handles: feed rendering, upload flow, likes, delete, toasts
   ================================================================ */

(function () {
  'use strict';

  // ────────────── API ──────────────
  const API_BASE = '';

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  // ────────────── STATE ──────────────
  let posts = [];
  let selectedFile = null;
  let deleteTargetId = null;
  let isUploading = false;
  const likedPosts = new Set(JSON.parse(localStorage.getItem('gs_liked') || '[]'));

  // ────────────── DOM REFERENCES ──────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const feed = $('#feed');
  const postsContainer = $('#postsContainer');
  const skeletons = $('#skeletons');
  const emptyState = $('#emptyState');
  const refreshBtn = $('#refreshBtn');

  // Upload modal
  const uploadOverlay = $('#uploadOverlay');
  const uploadModal = $('#uploadModal');
  const modalCloseBtn = $('#modalCloseBtn');
  const shareBtn = $('#shareBtn');
  const dropZone = $('#dropZone');
  const dropZoneContent = $('#dropZoneContent');
  const fileInput = $('#fileInput');
  const filePreview = $('#filePreview');
  const previewImage = $('#previewImage');
  const previewVideo = $('#previewVideo');
  const removeFileBtn = $('#removeFileBtn');
  const captionInput = $('#captionInput');
  const charCount = $('#charCount');
  const passwordInput = $('#passwordInput');
  const uploadProgress = $('#uploadProgress');
  const progressFill = $('#progressFill');
  const progressText = $('#progressText');

  // Tab bar
  const tabUpload = $('#tabUpload');

  // Delete confirm
  const confirmOverlay = $('#confirmOverlay');
  const deletePasswordInput = $('#deletePasswordInput');
  const confirmCancel = $('#confirmCancel');
  const confirmDelete = $('#confirmDelete');

  // Toast
  const toastContainer = $('#toastContainer');

  // ────────────── INITIALIZATION ──────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    loadFeed();
    bindEvents();
  }

  // ────────────── FEED ──────────────
  async function loadFeed() {
    showSkeletons();
    hideEmpty();
    postsContainer.innerHTML = '';

    try {
      const data = await apiFetch('/api/posts');
      posts = data.posts || [];

      hideSkeletons();

      if (posts.length === 0) {
        showEmpty();
        return;
      }

      hideEmpty();
      renderPosts(posts);
    } catch (err) {
      hideSkeletons();
      showEmpty();
      console.error('Failed to load feed:', err);
    }
  }

  function renderPosts(list) {
    postsContainer.innerHTML = '';
    list.forEach((post, i) => {
      const card = createPostCard(post, i);
      postsContainer.appendChild(card);
    });
  }

  function createPostCard(post, index) {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.animationDelay = `${index * 60}ms`;
    card.dataset.id = post.id;

    const isLiked = likedPosts.has(post.id);
    const isVideo = post.type === 'video';
    const initial = (post.author || 'A')[0].toUpperCase();

    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">${initial}</div>
        <div class="post-user-info">
          <div class="post-username">${escapeHtml(post.author || 'Anonymous')}</div>
          <div class="post-time">${timeAgo(post.timestamp)}</div>
        </div>
        <button class="post-menu-btn" data-action="menu" data-id="${post.id}" aria-label="Post options">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>

      <div class="post-image-container" data-id="${post.id}">
        ${isVideo
          ? `<video src="${escapeAttr(post.imageUrl)}" playsinline muted loop preload="metadata"></video>`
          : `<img src="${escapeAttr(post.imageUrl)}" alt="${escapeAttr(post.caption || 'Post image')}" loading="lazy" />`
        }
        <div class="heart-overlay">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="#FF453A" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </div>
      </div>

      <div class="post-actions">
        <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-action="like" data-id="${post.id}" aria-label="Like">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
        <button class="action-btn" aria-label="Comment" disabled>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </button>
        <button class="action-btn" aria-label="Share" disabled>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
        <div class="action-spacer"></div>
        <button class="action-btn" aria-label="Bookmark" disabled>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </button>
      </div>

      <div class="post-body">
        <div class="post-likes">${formatLikes(post.likes || 0)}</div>
        ${post.caption ? `
          <div class="post-caption">
            <span class="caption-username">${escapeHtml(post.author || 'Anonymous')}</span>${escapeHtml(post.caption)}
          </div>
        ` : ''}
      </div>
    `;

    // Auto-play video when in viewport
    if (isVideo) {
      const video = card.querySelector('video');
      observeVideo(video);
    }

    return card;
  }

  // ────────────── EVENT BINDING ──────────────
  function bindEvents() {
    // Refresh
    refreshBtn.addEventListener('click', handleRefresh);

    // Tab bar
    tabUpload.addEventListener('click', openUploadModal);

    // Tab items (visual only for non-functional tabs)
    $$('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'upload') return;
        $$('.tab-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // Upload modal
    modalCloseBtn.addEventListener('click', closeUploadModal);
    uploadOverlay.addEventListener('click', (e) => {
      if (e.target === uploadOverlay) closeUploadModal();
    });

    // Drop zone
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);

    // Remove file
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearFileSelection();
    });

    // Caption counter
    captionInput.addEventListener('input', () => {
      charCount.textContent = `${captionInput.value.length}/500`;
      updateShareButton();
    });

    // Password input
    passwordInput.addEventListener('input', updateShareButton);

    // Share button
    shareBtn.addEventListener('click', handleUpload);

    // Post interactions (event delegation)
    postsContainer.addEventListener('click', handlePostAction);

    // Double-tap to like
    postsContainer.addEventListener('dblclick', handleDoubleTap);

    // Delete confirm
    confirmCancel.addEventListener('click', closeDeleteConfirm);
    confirmDelete.addEventListener('click', handleDelete);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!confirmOverlay.hidden) closeDeleteConfirm();
        else if (uploadOverlay.classList.contains('active')) closeUploadModal();
      }
    });
  }

  // ────────────── REFRESH ──────────────
  function handleRefresh() {
    refreshBtn.classList.add('spinning');
    loadFeed().finally(() => {
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    });
  }

  // ────────────── UPLOAD MODAL ──────────────
  function openUploadModal() {
    uploadOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeUploadModal() {
    if (isUploading) return;
    uploadOverlay.classList.remove('active');
    document.body.style.overflow = '';
    resetUploadForm();
  }

  function resetUploadForm() {
    selectedFile = null;
    fileInput.value = '';
    captionInput.value = '';
    passwordInput.value = '';
    charCount.textContent = '0/500';
    clearFileSelection();
    uploadProgress.hidden = true;
    progressFill.style.width = '0%';
    shareBtn.disabled = true;
    isUploading = false;
  }

  function updateShareButton() {
    shareBtn.disabled = !selectedFile || !passwordInput.value.trim();
  }

  // ────────────── FILE HANDLING ──────────────
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) setFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  }

  function setFile(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showToast('Only images and videos are supported', 'error');
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      showToast('File size must be under 200MB', 'error');
      return;
    }

    selectedFile = file;
    showFilePreview(file);
    updateShareButton();
  }

  function showFilePreview(file) {
    dropZoneContent.hidden = true;
    filePreview.hidden = false;

    if (file.type.startsWith('video/')) {
      previewImage.hidden = true;
      previewVideo.hidden = false;
      previewVideo.src = URL.createObjectURL(file);
      previewVideo.play();
    } else {
      previewVideo.hidden = true;
      previewImage.hidden = false;
      previewImage.src = URL.createObjectURL(file);
    }
  }

  function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.hidden = true;
    dropZoneContent.hidden = false;
    previewImage.src = '';
    previewVideo.src = '';
    previewImage.hidden = false;
    previewVideo.hidden = true;
    updateShareButton();
  }

  // ────────────── UPLOAD ──────────────
  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    const password = passwordInput.value.trim();
    if (!password) {
      showToast('Please enter the upload password', 'error');
      return;
    }

    isUploading = true;
    shareBtn.disabled = true;
    uploadProgress.hidden = false;

    // Simulate progress stages
    setProgress(10, 'Preparing upload...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('caption', captionInput.value.trim());
      formData.append('password', password);

      setProgress(30, 'Uploading to Catbox...');

      const progressInterval = setInterval(() => {
        const current = parseFloat(progressFill.style.width);
        if (current < 80) {
          setProgress(current + Math.random() * 8, 'Uploading to Catbox...');
        }
      }, 500);

      const data = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setProgress(100, 'Done!');

      await sleep(400);

      showToast('Post shared successfully!', 'success');
      closeUploadModal();
      loadFeed();

    } catch (err) {
      setProgress(0);
      uploadProgress.hidden = true;
      showToast(err.message || 'Upload failed. Try again.', 'error');
      isUploading = false;
      updateShareButton();
    }
  }

  function setProgress(pct, text) {
    progressFill.style.width = `${pct}%`;
    if (text) progressText.textContent = text;
  }

  // ────────────── POST ACTIONS ──────────────
  function handlePostAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    switch (action) {
      case 'like':
        toggleLike(id, btn);
        break;
      case 'menu':
        openDeleteConfirm(id);
        break;
    }
  }

  // ────────────── DOUBLE TAP TO LIKE ──────────────
  let lastTap = 0;
  function handleDoubleTap(e) {
    const container = e.target.closest('.post-image-container');
    if (!container) return;

    const id = container.dataset.id;
    const heart = container.querySelector('.heart-overlay');

    // Show heart animation
    heart.classList.remove('animate');
    void heart.offsetWidth; // Force reflow
    heart.classList.add('animate');

    // Like the post
    if (!likedPosts.has(id)) {
      const likeBtn = postsContainer.querySelector(`.like-btn[data-id="${id}"]`);
      if (likeBtn) toggleLike(id, likeBtn);
    }
  }

  // ────────────── LIKE ──────────────
  async function toggleLike(id, btn) {
    const wasLiked = likedPosts.has(id);

    // Optimistic UI update
    if (wasLiked) {
      likedPosts.delete(id);
      btn.classList.remove('liked');
      btn.querySelector('svg').setAttribute('fill', 'none');
    } else {
      likedPosts.add(id);
      btn.classList.add('liked');
      btn.querySelector('svg').setAttribute('fill', 'currentColor');
    }

    // Save to localStorage
    localStorage.setItem('gs_liked', JSON.stringify([...likedPosts]));

    // Update like count in UI
    const card = btn.closest('.post-card');
    const likesEl = card.querySelector('.post-likes');

    try {
      const data = await apiFetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      if (likesEl) {
        likesEl.textContent = formatLikes(data.likes || 0);
      }
    } catch (err) {
      // Revert on error
      if (wasLiked) {
        likedPosts.add(id);
        btn.classList.add('liked');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
      } else {
        likedPosts.delete(id);
        btn.classList.remove('liked');
        btn.querySelector('svg').setAttribute('fill', 'none');
      }
      localStorage.setItem('gs_liked', JSON.stringify([...likedPosts]));
    }
  }

  // ────────────── DELETE ──────────────
  function openDeleteConfirm(id) {
    deleteTargetId = id;
    deletePasswordInput.value = '';
    confirmOverlay.hidden = false;
  }

  function closeDeleteConfirm() {
    confirmOverlay.hidden = true;
    deleteTargetId = null;
    deletePasswordInput.value = '';
  }

  async function handleDelete() {
    if (!deleteTargetId) return;

    const password = deletePasswordInput.value.trim();
    if (!password) {
      showToast('Enter password to delete', 'error');
      return;
    }

    try {
      await apiFetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTargetId, password })
      });

      // Animate removal
      const card = postsContainer.querySelector(`[data-id="${deleteTargetId}"]`);
      if (card) {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        await sleep(300);
        card.remove();
      }

      // Update posts array
      posts = posts.filter(p => p.id !== deleteTargetId);
      if (posts.length === 0) showEmpty();

      showToast('Post deleted', 'success');
      closeDeleteConfirm();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  }

  // ────────────── TOAST NOTIFICATIONS ──────────────
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSvg = type === 'success'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  // ────────────── VIDEO AUTOPLAY ──────────────
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.5 });

  function observeVideo(video) {
    videoObserver.observe(video);
  }

  // ────────────── UI HELPERS ──────────────
  function showSkeletons() { skeletons.classList.remove('hidden'); }
  function hideSkeletons() { skeletons.classList.add('hidden'); }
  function showEmpty() { emptyState.classList.remove('hidden'); }
  function hideEmpty() { emptyState.classList.add('hidden'); }

  // ────────────── UTILITIES ──────────────
  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;

    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatLikes(count) {
    if (count === 0) return 'Be the first to like';
    if (count === 1) return '1 like';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M likes`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K likes`;
    return `${count.toLocaleString()} likes`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

})();
