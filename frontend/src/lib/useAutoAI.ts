// @tier: community
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoAIStatus = 'idle' | 'running' | 'ready' | 'error';

export type AutoAIResultState = {
  status: AutoAIStatus;
  result: string | null;
  error: string | null;
  lastUpdatedAt: string | null;
  fromCache: boolean;
};

type CacheEntry = {
  signature: string;
  result: string;
  updatedAt: string;
};

function safeParseCache(raw: string | null): CacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.result !== 'string') return null;
    if (typeof parsed.signature !== 'string') return null;
    if (typeof parsed.updatedAt !== 'string') return null;
    return parsed as CacheEntry;
  } catch {
    return null;
  }
}

function isFresh(entry: CacheEntry, signature: string, ttlMs: number) {
  if (entry.signature !== signature) return false;
  const updatedAtMs = Date.parse(entry.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs <= ttlMs;
}

export function useAutoAIResult(opts: {
  cacheKey: string;
  enabled: boolean;
  signature: string;
  ttlMs?: number;
  debounceMs?: number;
  cooldownMs?: number;
  run: () => Promise<string>;
}) {
  const ttlMs = Number.isFinite(opts.ttlMs) ? (opts.ttlMs as number) : 6 * 60 * 60 * 1000;
  const debounceMs = Number.isFinite(opts.debounceMs) ? (opts.debounceMs as number) : 2000; // Increased from 800ms to 2000ms
  const cooldownMs = Number.isFinite(opts.cooldownMs) ? (opts.cooldownMs as number) : 60 * 1000;

  const [state, setState] = useState<AutoAIResultState>({
    status: 'idle',
    result: null,
    error: null,
    lastUpdatedAt: null,
    fromCache: false
  });

  const runSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownUntilRef = useRef(0);

  const loadCache = useCallback((): CacheEntry | null => {
    try {
      return safeParseCache(localStorage.getItem(opts.cacheKey));
    } catch {
      return null;
    }
  }, [opts.cacheKey]);

  const saveCache = useCallback((payload: CacheEntry) => {
    try {
      localStorage.setItem(opts.cacheKey, JSON.stringify(payload));
    } catch {
      // ignore cache failures (private mode, quota, etc.)
    }
  }, [opts.cacheKey]);

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(opts.cacheKey);
    } catch {
      // ignore
    }
    setState({
      status: 'idle',
      result: null,
      error: null,
      lastUpdatedAt: null,
      fromCache: false
    });
  }, [opts.cacheKey]);

  const runNow = useCallback(async (force = false) => {
    if (!opts.enabled && !force) return null;

    if (!force && Date.now() < cooldownUntilRef.current) {
      return null;
    }

    const cached = loadCache();
    if (!force && cached && isFresh(cached, opts.signature, ttlMs)) {
      setState({
        status: 'ready',
        result: cached.result,
        error: null,
        lastUpdatedAt: cached.updatedAt,
        fromCache: true
      });
      return cached.result;
    }

    const seq = ++runSeq.current;
    setState((prev) => ({
      status: 'running',
      result: prev.result,
      error: null,
      lastUpdatedAt: prev.lastUpdatedAt,
      fromCache: false
    }));

    try {
      const result = await opts.run();
      if (runSeq.current !== seq) return null;

      const updatedAt = new Date().toISOString();
      saveCache({ signature: opts.signature, result, updatedAt });
      setState({
        status: 'ready',
        result,
        error: null,
        lastUpdatedAt: updatedAt,
        fromCache: false
      });
      return result;
    } catch (err: any) {
      if (runSeq.current !== seq) return null;

      const statusCode = Number(err?.response?.status || 0);
      const isRateLimited = statusCode === 429;
      const isTimeout = err?.code === 'ECONNABORTED' || (err?.message && err.message.includes('timeout'));
      if (isRateLimited || isTimeout) {
        cooldownUntilRef.current = Date.now() + cooldownMs;
      }

      const message =
        (isRateLimited ? 'AI analysis temporarily rate-limited. Please retry in about a minute.' : null) ||
        (isTimeout ? 'AI analysis timed out. The AI provider may be slow — it will retry automatically.' : null) ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'AI request failed';

      setState((prev) => ({
        status: 'error',
        result: prev.result,
        error: String(message),
        lastUpdatedAt: prev.lastUpdatedAt,
        fromCache: false
      }));
      return null;
    }
  }, [cooldownMs, loadCache, opts, saveCache, ttlMs]);

  // Load cache when key/signature changes.
  useEffect(() => {
    const cached = loadCache();
    if (cached && isFresh(cached, opts.signature, ttlMs)) {
      setState({
        status: 'ready',
        result: cached.result,
        error: null,
        lastUpdatedAt: cached.updatedAt,
        fromCache: true
      });
      return;
    }

    setState((prev) => ({
      status: prev.result ? prev.status : 'idle',
      result: prev.result,
      error: null,
      lastUpdatedAt: prev.lastUpdatedAt,
      fromCache: false
    }));
  }, [loadCache, opts.signature, ttlMs]);

  // Auto-run (debounced) when enabled and cache is stale/missing.
  useEffect(() => {
    if (!opts.enabled) return;

    const cached = loadCache();
    if (cached && isFresh(cached, opts.signature, ttlMs)) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      runNow(false);
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [debounceMs, loadCache, opts.enabled, opts.signature, runNow, ttlMs]);

  return {
    ...state,
    runNow,
    refresh: () => runNow(true),
    clearCache
  };
}

