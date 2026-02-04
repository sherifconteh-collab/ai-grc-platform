/**
 * claudeService.js
 *
 * Manages multi-turn conversations with the Anthropic Messages API when
 * extended thinking is enabled.
 *
 * --- WHY thinking blocks need special care ---
 * When `thinking.type === "enabled"` the API returns assistant messages whose
 * `content` array contains one or more blocks with
 *   type: "thinking"          – visible scratchpad text
 *   type: "redacted_thinking" – opaque placeholder (budget-limited or policy-stripped)
 *
 * On every subsequent turn those blocks MUST be sent back exactly as received.
 * Stripping, reordering, or editing them causes:
 *   400 invalid_request_error
 *       "thinking or redacted_thinking blocks in the latest assistant message
 *        cannot be modified"
 *
 * This service stores the raw content array returned by the API and replays it
 * unchanged.  Nothing in the public surface area of this module touches the
 * internals of thinking blocks.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ---------------------------------------------------------------------------
// In-memory conversation store
// Map<conversationId, { messages: MessageParam[], createdAt: number }>
// ---------------------------------------------------------------------------
const conversations = new Map();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const THINKING_BUDGET = parseInt(process.env.THINKING_BUDGET_TOKENS, 10) || 10000;
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS, 10) || 16000;

/**
 * Seed a new conversation and return its ID.
 * @param {string} [systemPrompt]
 * @returns {{ conversationId: string }}
 */
export function createConversation(systemPrompt) {
  const id = crypto.randomUUID();
  conversations.set(id, {
    systemPrompt: systemPrompt || null,
    messages: [],      // accumulates { role, content } exactly as the API sees them
    createdAt: Date.now()
  });
  return { conversationId: id };
}

/**
 * Send a user message in an existing conversation and return the assistant reply.
 *
 * Flow
 *   1. Append the user message to stored history.
 *   2. Call the API with the full history (thinking blocks and all).
 *   3. Store the assistant's COMPLETE response content array — including any
 *      thinking / redacted_thinking blocks — back into history.
 *   4. Return only the text blocks to the caller (thinking content is internal).
 *
 * @param {string}   conversationId
 * @param {string}   userText
 * @returns {{ textBlocks: string[], conversationId: string }}
 */
export async function sendMessage(conversationId, userText) {
  const convo = conversations.get(conversationId);
  if (!convo) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  // 1. Append user turn – plain text content is fine here
  convo.messages.push({
    role: 'user',
    content: userText
  });

  // 2. API call – replay the full history, thinking blocks untouched
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: {
      type: 'enabled',
      budget_tokens: THINKING_BUDGET
    },
    system: convo.systemPrompt || undefined,
    messages: convo.messages   // ← sent verbatim; never filtered
  });

  // 3. Store the FULL content array (thinking + text + anything else)
  //    This is the critical step: response.content is pushed as-is.
  convo.messages.push({
    role: 'assistant',
    content: response.content  // ← DO NOT filter or map this array
  });

  // 4. Extract only text blocks for the HTTP response to the frontend
  const textBlocks = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text);

  return { textBlocks, conversationId };
}

/**
 * One-shot (stateless) call with extended thinking.
 * No conversation history is stored, so thinking-block replay is not a concern.
 *
 * @param {string}   prompt
 * @param {string}   [systemPrompt]
 * @returns {{ textBlocks: string[] }}
 */
export async function oneShotMessage(prompt, systemPrompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: {
      type: 'enabled',
      budget_tokens: THINKING_BUDGET
    },
    system: systemPrompt || undefined,
    messages: [{ role: 'user', content: prompt }]
  });

  const textBlocks = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text);

  return { textBlocks };
}

/**
 * Retrieve the visible (text-only) history for a conversation.
 * Useful for displaying past messages in a UI without leaking scratchpads.
 *
 * @param {string} conversationId
 * @returns {{ messages: Array<{ role: string, text: string }> }}
 */
export function getConversationHistory(conversationId) {
  const convo = conversations.get(conversationId);
  if (!convo) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const messages = convo.messages.map(msg => {
    if (msg.role === 'user') {
      // User messages are always plain strings in our usage
      return { role: 'user', text: typeof msg.content === 'string' ? msg.content : '' };
    }
    // Assistant – extract text blocks only for display
    const text = (Array.isArray(msg.content) ? msg.content : [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
    return { role: 'assistant', text };
  });

  return { messages };
}

/**
 * Delete a conversation from memory.
 * @param {string} conversationId
 * @returns {boolean}  true if the conversation existed and was removed
 */
export function deleteConversation(conversationId) {
  return conversations.delete(conversationId);
}
