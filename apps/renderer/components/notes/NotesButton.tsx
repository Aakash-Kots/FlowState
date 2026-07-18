'use client';

import { NotebookPen } from 'lucide-react';
import { DEFAULT_WORKSPACE_ID } from '@flowstate/shared';
import { NoteScope } from '@/lib/enums/notes';
import { flushNoteSave, saveNote, useNotes, useNotesSync } from '@/lib/notes';
import { useWorkspace } from '@/lib/workspace';
import { DropdownMenu } from '../ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { NotesEditor } from './NotesEditor';

////////////
// Export //
////////////

/**
 * Header notes button. Opens a Markdown pad for jotting notes and checkable
 * tasks. Two scopes live behind tabs: the app-wide **Global** pad and a
 * **This Worktree** pad tied to the active workspace. With no worktree selected
 * (the default workspace) only the Global pad is shown. Edits autosave; any
 * pending write is flushed when the panel closes.
 */
export function NotesButton() {
  const workspaceId = useWorkspace((s) => s.workspaceId);
  const onDefault = workspaceId === DEFAULT_WORKSPACE_ID;
  useNotesSync(workspaceId);
  const global = useNotes((s) => s.global);
  const worktree = useNotes((s) => s.worktree);

  return (
    <DropdownMenu
      align="end"
      placement="bottom"
      panelClassName="w-80 border-sidebar-border/70 bg-sidebar/20 p-2 shadow-2xl backdrop-blur-2xl"
      onOpenChange={(open) => {
        if (!open) flushNoteSave(workspaceId);
      }}
      triggerClassName="text-muted-foreground transition-colors hover:text-neutral-200"
      trigger={
        <>
          <NotebookPen className="size-4" />
          <span className="sr-only">Notes</span>
        </>
      }
    >
      {() =>
        onDefault ? (
          <NotesEditor
            value={global}
            onChange={(md) => saveNote(NoteScope.Global, workspaceId, md)}
          />
        ) : (
          <Tabs defaultValue="worktree">
            <TabsList className="mb-2 grid w-full grid-cols-2">
              <TabsTrigger value="worktree">This Worktree</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
            </TabsList>
            <TabsContent value="worktree">
              <NotesEditor
                value={worktree}
                onChange={(md) => saveNote(NoteScope.Worktree, workspaceId, md)}
              />
            </TabsContent>
            <TabsContent value="global">
              <NotesEditor
                value={global}
                onChange={(md) => saveNote(NoteScope.Global, workspaceId, md)}
              />
            </TabsContent>
          </Tabs>
        )
      }
    </DropdownMenu>
  );
}
