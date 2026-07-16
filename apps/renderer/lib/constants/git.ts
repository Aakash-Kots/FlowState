import { GitFileStatus } from '@flowstate/shared';

///////////////
// Constants //
///////////////

/** Single-letter badge + accent color per change status, shared by the Git
 * view's change list and the workspace panel's Changes tab. */
export const GIT_STATUS_BADGE: Record<
  GitFileStatus,
  { letter: string; className: string; label: string }
> = {
  [GitFileStatus.Modified]: { letter: 'M', className: 'text-warn', label: 'Modified' },
  [GitFileStatus.Added]: { letter: 'A', className: 'text-success', label: 'Added' },
  [GitFileStatus.Deleted]: { letter: 'D', className: 'text-danger', label: 'Deleted' },
  [GitFileStatus.Renamed]: { letter: 'R', className: 'text-warn', label: 'Renamed' },
  [GitFileStatus.Untracked]: { letter: 'U', className: 'text-success', label: 'Untracked' },
  [GitFileStatus.Conflicted]: { letter: '!', className: 'text-danger', label: 'Conflicted' },
};
