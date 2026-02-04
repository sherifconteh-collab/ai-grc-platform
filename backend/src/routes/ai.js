/**
 * ai.js – Express router for Claude-backed AI features.
 *
 * All routes require authentication (applied by the caller in index.js).
 *
 * POST /api/v1/ai/conversations          – start a new multi-turn session
 * POST /api/v1/ai/conversations/:id/chat – send a message in that session
 * GET  /api/v1/ai/conversations/:id      – retrieve visible (text-only) history
 * DELETE /api/v1/ai/conversations/:id     – destroy a session
 * POST /api/v1/ai/generate-policy        – one-shot policy-generation call
 */

import { Router } from 'express';
import {
  createConversation,
  sendMessage,
  getConversationHistory,
  deleteConversation,
  oneShotMessage
} from '../services/claudeService.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/ai/conversations
// Body: { systemPrompt?: string }
// ---------------------------------------------------------------------------
router.post('/conversations', async (req, res) => {
  try {
    const { systemPrompt } = req.body || {};
    const result = createConversation(systemPrompt);
    res.status(201).json(result);
  } catch (err) {
    console.error('POST /conversations error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/ai/conversations/:id/chat
// Body: { message: string }
// ---------------------------------------------------------------------------
router.post('/conversations/:id/chat', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await sendMessage(id, message.trim());
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    // Surface Anthropic API errors directly so callers can act on them
    if (err.status && err.error) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error('POST /conversations/:id/chat error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/ai/conversations/:id
// ---------------------------------------------------------------------------
router.get('/conversations/:id', (req, res) => {
  try {
    const result = getConversationHistory(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('GET /conversations/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve conversation' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/ai/conversations/:id
// ---------------------------------------------------------------------------
router.delete('/conversations/:id', (req, res) => {
  const deleted = deleteConversation(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: `Conversation ${req.params.id} not found` });
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-policy
// Body: { prompt: string, policyType?: string }
//
// One-shot (stateless) endpoint.  Useful for generating a single policy
// document without maintaining a conversation.
// ---------------------------------------------------------------------------
router.post('/generate-policy', async (req, res) => {
  try {
    const { prompt, policyType } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const systemPrompt =
      'You are a GRC (Governance, Risk, and Compliance) policy expert. ' +
      'Generate clear, actionable compliance policies based on industry best practices ' +
      'and the frameworks specified by the user. ' +
      (policyType ? `Focus on ${policyType} policies.` : '');

    const { textBlocks } = await oneShotMessage(prompt.trim(), systemPrompt);
    res.json({ policy: textBlocks.join('\n') });
  } catch (err) {
    if (err.status && err.error) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error('POST /generate-policy error:', err);
    res.status(500).json({ error: 'Failed to generate policy' });
  }
});

export default router;
