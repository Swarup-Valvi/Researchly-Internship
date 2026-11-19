import express from 'express';
import { store } from '../db/store.js';
import { draftSocialPost } from '../services/llmService.js';
import { getCurrentUserContext } from '../services/userContext.js';

const router = express.Router();

// GET social feed
router.get('/', async (req, res) => {
  try {
    // ?scope=all (public + your connections' posts) | connections (only people you're connected with)
    const scope = req.query.scope === 'connections' ? 'connections' : 'all';
    const viewer = await getCurrentUserContext(req);
    const posts = await store.getPosts({ viewerId: viewer.id, scope });
    res.json({
      success: true,
      scope,
      signed_in: !!viewer.id,
      count: posts.length,
      data: posts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new post
router.post('/', async (req, res) => {
  try {
    const { content, tags, author_name, author_institution, author_role, author_avatar, media_url, visibility } = req.body;
    const author = await getCurrentUserContext(req);
    if (!author.id) {
      return res.status(401).json({ success: false, error: 'Sign in to post.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Post content cannot be empty' });
    }

    const created = await store.createPost({
      user_id: author.id,
      visibility,
      content,
      tags: tags || [],
      author_name,
      author_institution,
      author_role,
      author_avatar,
      media_url
    });

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST toggle like on post
router.post('/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await store.toggleLike(req.params.id, userId);
    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET comments for post
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await store.getComments(req.params.id);
    res.json({
      success: true,
      data: comments
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add comment
router.post('/:id/comments', async (req, res) => {
  try {
    const { content, author_name, author_institution, author_avatar, userId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Comment content cannot be empty' });
    }

    const comment = await store.addComment({
      post_id: req.params.id,
      content,
      author_name,
      author_institution,
      author_avatar,
      user_id: userId
    });

    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST share post
router.post('/:id/share', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Post link copied to clipboard and shared.',
      share_url: `/posts/${req.params.id}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST AI assist for drafting social posts
router.post('/ai-draft', async (req, res) => {
  try {
    const { topic, paperTitle, abstract, postType, tone } = req.body;
    const drafted = await draftSocialPost({ topic, paperTitle, abstract, postType, tone });
    res.json({
      success: true,
      data: drafted
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

