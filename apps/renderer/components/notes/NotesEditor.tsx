'use client';

import { useEffect } from 'react';
import { List, ListChecks } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import { cn } from '../ui/cn';

///////////
// Types //
///////////

type NotesEditorProps = {
  /** The pad's current Markdown (source of truth held in the notes store). */
  value: string;
  /** Fired with the pad's Markdown on every edit (debounced downstream). */
  onChange: (markdown: string) => void;
};

/////////////
// Helpers //
/////////////

/** Read the pad's Markdown. `tiptap-markdown` doesn't augment `editor.storage`. */
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

/**
 * The bullet / task toggles above the pad, so creating a checkable task is a
 * visible click rather than a hidden `[ ]` gesture. Highlights the active list
 * type; subscribes narrowly via `useEditorState` so it re-renders on selection.
 */
function Toolbar({ editor }: { editor: Editor }) {
  const { bullet, task } = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bullet: editor.isActive('bulletList'),
      task: editor.isActive('taskList'),
    }),
  });

  const buttonClass = (active: boolean) =>
    cn(
      'rounded p-1 transition-colors hover:bg-accent hover:text-neutral-100',
      active ? 'bg-accent text-neutral-100' : 'text-muted-foreground',
    );

  return (
    <div className="mb-1 flex items-center gap-1 border-b border-border pb-1">
      <button
        type="button"
        title="Bullet list"
        aria-label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(bullet)}
      >
        <List className="size-4" />
      </button>
      <button
        type="button"
        title="Task list (checkboxes)"
        aria-label="Task list"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={buttonClass(task)}
      >
        <ListChecks className="size-4" />
      </button>
    </div>
  );
}

////////////
// Export //
////////////

/**
 * A compact Markdown WYSIWYG pad: prose, bullets, and checkable task lists that
 * tick in place. Editing round-trips through Markdown (`tiptap-markdown`) so the
 * store — and the SQLite row behind it — holds portable Markdown text.
 */
export function NotesEditor({ value, onChange }: NotesEditorProps) {
  const editor = useEditor({
    // Static export renders on the client only; avoid an SSR hydration pass.
    immediatelyRender: false,
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Markdown],
    content: value,
    editorProps: {
      attributes: {
        class:
          'notes-editor min-h-[12rem] max-h-[60vh] overflow-y-auto px-1 py-1 text-sm leading-relaxed text-neutral-200 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
  });

  // Reset the doc when the bound pad changes out from under the editor (tab or
  // worktree switch) — without re-emitting onUpdate, which would echo it back.
  useEffect(() => {
    if (!editor) return;
    if (value !== getMarkdown(editor)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
