/**
 * Commit-history read model for the analytics page. Reads real `git log` across
 * every project's shared object store — so it counts commits you authored from
 * any surface (chat, terminal, changes view, external), not just the in-app
 * commit button — and aggregates them into the same day/total shapes the chart
 * already renders. Best-effort per project: a missing or non-git `localPath` is
 * skipped rather than failing the whole page.
 */
import type { CommitDayPoint, CommitStats } from '@flowstate/shared';
import type { CommitLogEntry } from '../lib/types/git';
import { GitService } from './git';
import { listProjects } from '../store';

/////////////
// Helpers //
/////////////

/** The commit's local calendar day as `YYYY-MM-DD` (matches SQLite `localtime`). */
function localDay(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

//////////////
// Accessors //
//////////////

/**
 * Commits authored by the user since `since` (ISO cutoff, or null for all-time),
 * bucketed by local calendar day (oldest first) plus range totals — pooled
 * across all projects.
 */
export async function getCommitHistoryStats(
  since: string | null,
): Promise<{ commitsByDay: CommitDayPoint[]; commitStats: CommitStats }> {
  const commits: CommitLogEntry[] = [];
  for (const project of listProjects()) {
    try {
      const git = new GitService(project.localPath);
      const email = await git.configuredAuthorEmail();
      commits.push(...(await git.authoredCommits(email, since)));
    } catch {
      // Skip a project whose repo can't be read (moved, deleted, not a git repo).
    }
  }

  const byDay = new Map<string, CommitDayPoint>();
  const totals: CommitStats = { commits: 0, insertions: 0, deletions: 0 };
  for (const c of commits) {
    const day = localDay(c.authorDateIso);
    const point = byDay.get(day) ?? { day, commits: 0, insertions: 0, deletions: 0 };
    point.commits += 1;
    point.insertions += c.insertions;
    point.deletions += c.deletions;
    byDay.set(day, point);

    totals.commits += 1;
    totals.insertions += c.insertions;
    totals.deletions += c.deletions;
  }

  const commitsByDay = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  return { commitsByDay, commitStats: totals };
}
