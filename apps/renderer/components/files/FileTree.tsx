'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { type DirEntry } from '@flowstate/shared';
import { fileTypeForPath } from '@/lib/constants/fileTypes';
import { trpc } from '@/lib/trpc';
import { openFileTab, useWorkspace } from '@/lib/workspace';
import { cn } from '../ui/cn';

///////////////
// Constants //
///////////////

/** The worktree root directory, as understood by `files.readDir`. */
const ROOT = '';

/** Left indent (px) added per tree depth. */
const INDENT_PER_DEPTH = 12;

/////////////
// Helpers //
/////////////

/** Join a parent dir (`''` = root) with a child entry name into a rel path. */
function childPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

///////////////////
// Sub-components //
///////////////////

/** A single indented tree row (folder or file). */
function Row({
  depth,
  onClick,
  children,
}: {
  depth: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * INDENT_PER_DEPTH }}
      className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs text-neutral-200 transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}

/**
 * One directory level, rendered recursively. Reads its entries from the shared
 * `childrenMap`; an expanded folder whose children aren't loaded yet simply
 * renders nothing until the fetch fills the map and re-renders.
 */
function TreeLevel({
  dir,
  depth,
  childrenMap,
  expanded,
  onToggle,
}: {
  dir: string;
  depth: number;
  childrenMap: Map<string, DirEntry[]>;
  expanded: Set<string>;
  onToggle: (dir: string) => void;
}) {
  const entries = childrenMap.get(dir);
  if (!entries) return null;

  return (
    <>
      {entries.map((entry) => {
        const path = childPath(dir, entry.name);
        if (entry.isDir) {
          const isOpen = expanded.has(path);
          const Chevron = isOpen ? ChevronDown : ChevronRight;
          const FolderIcon = isOpen ? FolderOpen : Folder;
          return (
            <Fragment key={path}>
              <Row depth={depth} onClick={() => onToggle(path)}>
                <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
                <FolderIcon className="size-3.5 shrink-0 text-sky-300/80" />
                <span className="truncate">{entry.name}</span>
              </Row>
              {isOpen && (
                <TreeLevel
                  dir={path}
                  depth={depth + 1}
                  childrenMap={childrenMap}
                  expanded={expanded}
                  onToggle={onToggle}
                />
              )}
            </Fragment>
          );
        }

        const { Icon, color } = fileTypeForPath(entry.name);
        return (
          <Row key={path} depth={depth} onClick={() => void openFileTab(path)}>
            {/* Spacer aligns files with the folder chevron's icon column. */}
            <span className="size-3.5 shrink-0" />
            <Icon className={cn('size-3.5 shrink-0', color)} />
            <span className="truncate">{entry.name}</span>
          </Row>
        );
      })}
    </>
  );
}

////////////
// Export //
////////////

/**
 * A lazy on-disk file tree of the active worktree. Each folder loads its
 * children on first expand (so `node_modules` is never walked until opened) and
 * caches them; clicking a file opens it in an editor tab. State resets when the
 * worktree changes.
 */
export function FileTree() {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const [children, setChildren] = useState<Map<string, DirEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (dir: string) => {
      try {
        const entries = await trpc().files.readDir.query({ workspaceId, dir });
        setChildren((prev) => new Map(prev).set(dir, entries));
      } catch {
        setFailed(true);
      }
    },
    [workspaceId],
  );

  // Reset and reload the root whenever the active worktree changes.
  useEffect(() => {
    setChildren(new Map());
    setExpanded(new Set());
    setFailed(false);
    void load(ROOT);
  }, [workspaceId, load]);

  const toggle = useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(dir)) {
          next.delete(dir);
        } else {
          next.add(dir);
          if (!children.has(dir)) void load(dir);
        }
        return next;
      });
    },
    [children, load],
  );

  const rootLoaded = children.has(ROOT);

  if (!rootLoaded) {
    return (
      <p className="px-3 pt-3 text-[11px] text-muted-foreground">
        {failed ? "Couldn't load files." : 'Loading files…'}
      </p>
    );
  }

  return (
    <div className="flex flex-col px-1 py-1">
      <TreeLevel
        dir={ROOT}
        depth={0}
        childrenMap={children}
        expanded={expanded}
        onToggle={toggle}
      />
    </div>
  );
}
