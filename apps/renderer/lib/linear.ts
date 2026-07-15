'use client';

import { create } from 'zustand';
import type { LinearIssueRef } from '@flowstate/shared';
import { trpc } from './trpc';

///////////
// Types //
///////////

type LinearStoreState = {
  issues: LinearIssueRef[];
  loading: boolean;
  error: string | null;
  /** True once we've fetched at least once (drives empty-vs-loading UI). */
  loaded: boolean;
};

/////////////
// Helpers //
/////////////

const INITIAL: LinearStoreState = {
  issues: [],
  loading: false,
  error: null,
  loaded: false,
};

export const useLinear = create<LinearStoreState>(() => INITIAL);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

////////////
// Actions //
////////////

/** Fetch the linked user's assigned issues into the store. */
export async function refreshIssues(): Promise<void> {
  useLinear.setState({ loading: true, error: null });
  try {
    const issues = await trpc().linear.myIssues.query();
    useLinear.setState({ issues, loading: false, loaded: true });
  } catch (err) {
    useLinear.setState({ loading: false, loaded: true, error: message(err) });
  }
}
