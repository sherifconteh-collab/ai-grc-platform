'use client';

import { useCallback, useEffect, useState } from 'react';
import { myWorkAPI, MyWorkItem, MyWorkSummary } from './api';

interface MyWorkState {
  items: MyWorkItem[];
  summary: MyWorkSummary | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: MyWorkState = { items: [], summary: null, loading: true, error: null };
const MAX_AGE_MS = 60 * 1000;

// Module-level cache: the sidebar badge and the Home page share one request,
// and client-side navigation does not refetch until the data is a minute old.
let cached: { at: number; state: MyWorkState } | null = null;
let inflight: Promise<MyWorkState> | null = null;
const listeners = new Set<(s: MyWorkState) => void>();

async function fetchMyWork(): Promise<MyWorkState> {
  try {
    const res = await myWorkAPI.list();
    const data = res.data?.data;
    return { items: data?.items ?? [], summary: data?.summary ?? null, loading: false, error: null };
  } catch {
    return { items: [], summary: null, loading: false, error: 'Could not load your work. Try again in a moment.' };
  }
}

function load(force: boolean): Promise<MyWorkState> {
  if (!force && cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.state);
  if (!inflight) {
    inflight = fetchMyWork().then((state) => {
      cached = { at: Date.now(), state };
      inflight = null;
      listeners.forEach((fn) => fn(state));
      return state;
    });
  }
  return inflight;
}

/** Marks the cache stale, e.g. after an action that completes a work item. */
export function invalidateMyWork(): void {
  cached = null;
}

export function useMyWork(enabled = true) {
  const [state, setState] = useState<MyWorkState>(() => cached?.state ?? EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const listener = (s: MyWorkState) => { if (active) setState(s); };
    listeners.add(listener);
    load(false).then(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, [enabled]);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return load(true);
  }, []);

  return { ...state, refresh };
}
