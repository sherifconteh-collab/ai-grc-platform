'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAccessToken } from '@/lib/tokenStore';
import MarkdownContent from '@/components/ai/MarkdownContent';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  'How do I implement this control?',
  'What evidence do I need?',
  'Draft a policy for this area',
  'Explain this requirement',
  'What are the biggest risks here?',
];

function getPageContext(pathname: string): string {
  if (pathname.includes('/controls/') && pathname.split('/').length > 4) {
    return 'I am viewing a specific control detail page. ';
  }
  if (pathname.includes('/controls')) return 'I am on the Controls page. ';
  if (pathname.includes('/vulnerabilities')) return 'I am reviewing vulnerability findings. ';
  if (pathname.includes('/assets')) return 'I am in the Asset CMDB. ';
  if (pathname.includes('/organization')) return 'I am on the Organization Profile page (company context and framework selection). ';
  if (pathname.includes('/frameworks')) return 'I am on the Frameworks page. ';
  if (pathname.includes('/assessments')) return 'I am on the Assessments page. ';
  if (pathname.includes('/evidence')) return 'I am on the Evidence page. ';
  if (pathname.includes('/reports')) return 'I am on the Reports page. ';
  if (pathname.includes('/audit')) return 'I am in the Auditor Workspace. ';
  if (pathname.includes('/sbom')) return 'I am on the SBOM page. ';
  if (pathname.includes('/operations')) return 'I am on the Operations page. ';
  return '';
}

const STORAGE_KEY = 'controlweave_copilot_messages';
const MAX_STORED = 20;
const MAX_CONTEXT_MESSAGES = 8;
const AI_CHAT_URL = `${getApiBaseUrl()}/ai/chat`;

export default function AICopilot() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load persisted messages
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${user?.organizationId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch {
      // ignore
    }
  }, [user?.organizationId]);

  // Persist messages
  useEffect(() => {
    if (!user?.organizationId || messages.length === 0) return;
    try {
      const toStore = messages.slice(-MAX_STORED);
      localStorage.setItem(`${STORAGE_KEY}_${user.organizationId}`, JSON.stringify(toStore));
    } catch {
      // ignore
    }
  }, [messages, user?.organizationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const pageCtx = getPageContext(pathname);
    const userContent = pageCtx ? `${pageCtx}\n\n${text}` : text;

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
      const sendPayload = [
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ];

      const token = getAccessToken();
      if (!token) {
        setError('Session expired — please log in again.');
        return;
      }

      const res = await axios.post(
        AI_CHAT_URL,
        { messages: sendPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.data.result,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'AI request failed';
      setError(msg);
      if (err.response?.data?.upgradeRequired) {
        setError(`${msg} — Add your API key in Settings to continue.`);
      }
    } finally {
      setLoading(false);
    }
  }, [messages, loading, pathname]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    if (user?.organizationId) {
      localStorage.removeItem(`${STORAGE_KEY}_${user.organizationId}`);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all duration-200 text-sm font-medium"
        aria-label="Open AI Copilot"
      >
        <span className="text-lg">🤖</span>
        <span className="hidden sm:inline">Ask AI</span>
        {messages.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-amber-400 rounded-full text-xs flex items-center justify-center text-gray-900 font-bold">
            {messages.length > 9 ? '9+' : messages.length}
          </span>
        )}
      </button>

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <h2 className="text-sm font-semibold">AI Copilot</h2>
              <p className="text-xs text-gray-400">Org-aware GRC assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={clearHistory} className="text-xs text-gray-400 hover:text-white px-2 py-1">
                Clear
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm font-medium text-gray-700 mb-1">Your GRC AI Copilot</p>
              <p className="text-xs text-gray-500 mb-4">
                I know your organization, frameworks, and environment. Ask me anything.
              </p>
              <div className="space-y-2">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="block w-full text-left text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-gray-700 transition-colors"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {msg.role === 'assistant'
                  ? <MarkdownContent className="leading-relaxed">{msg.content}</MarkdownContent>
                  : <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Copy
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex gap-1 items-center">
                  <div className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
              {error}
              {error.includes('Settings') && (
                <a href="/dashboard/settings?tab=llm" className="ml-1 underline font-medium">
                  Go to Settings
                </a>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 bg-white shrink-0">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your compliance, controls, or policies..."
              rows={2}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-40 transition-colors self-end"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
