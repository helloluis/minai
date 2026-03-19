'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import { NoteEditor } from '@/components/NoteEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import * as api from '@/lib/api';
import type { Note, NotebookFile } from '@/lib/api';
import type { ConversationListItem } from '@minai/shared';
import { FileViewer, getFileIcon } from '@/components/FileViewer';

// ─── Drag-to-sort ─────────────────────────────────────────────────────────────

function useDragSort<T>(items: T[], onReorder: (items: T[]) => void) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const dragProps = (index: number) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      dragIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverIndex(index);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverIndex(null);
      const from = dragIndex.current;
      dragIndex.current = null;
      if (from === null || from === index) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      onReorder(next);
    },
    onDragEnd: () => { dragIndex.current = null; setOverIndex(null); },
  });

  return { dragProps, overIndex };
}

// ─── NotebookRow ─────────────────────────────────────────────────────────────

function NotebookRow({
  conv,
  isActive,
  notes,
  files,
  onSelect,
  onRename,
  onNewNote,
  onSelectNote,
  onExpandNotes,
  onOpenFile,
  dragProps,
  isDragOver,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  notes: Note[];
  files: NotebookFile[];
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onNewNote: () => void;
  onSelectNote: (noteId: string) => void;
  onExpandNotes: () => void;
  onOpenFile: (file: NotebookFile) => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: true };
  isDragOver: boolean;
}) {
  const displayTitle = ['New conversation', 'Untitled Notebook'].includes(conv.title)
    ? 'My Notebook'
    : conv.title;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(displayTitle);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== displayTitle) onRename(trimmed);
  };

  return (
    <div
      {...dragProps}
      className={`select-none transition-opacity ${isDragOver ? 'opacity-40' : 'opacity-100'}`}
    >
      {/* Notebook header row */}
      <div
        onClick={editing ? undefined : onSelect}
        className={`flex items-center gap-1.5 px-3 py-2.5 cursor-pointer group transition-colors
          ${isActive
            ? 'bg-minai-600 dark:bg-minai-600'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
      >
        <span className={`flex-shrink-0 cursor-grab active:cursor-grabbing leading-none px-0.5 text-base
          ${isActive ? 'text-minai-300' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400'}`}>
          ⠿
        </span>
        <span className="text-sm flex-shrink-0">📓</span>

        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm font-medium bg-white dark:bg-gray-800 border border-minai-300
              dark:border-minai-700 rounded px-1.5 py-0.5 outline-none text-gray-800 dark:text-gray-100"
          />
        ) : (
          <span className={`flex-1 text-sm font-medium truncate
            ${isActive ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}>
            {displayTitle}
          </span>
        )}

        {!editing && (
          <button
            onClick={startEditing}
            className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0
              ${isActive ? 'text-minai-200 hover:bg-minai-500' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title="Rename notebook"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}

        {!editing && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpandNotes(); }}
            className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0
              ${isActive ? 'text-minai-200 hover:bg-minai-500' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title="Open notes canvas"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Accordion: only shown when this notebook is active */}
      {isActive && (
        <div className="bg-gray-50/80 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800/70 pb-1.5">
          <div
            onClick={onSelect}
            className="flex items-center gap-2 px-9 py-1.5 text-sm cursor-pointer transition-colors
              text-minai-600 dark:text-minai-400 hover:bg-minai-50 dark:hover:bg-minai-950/20"
          >
            <span>🗨️</span>
            <span className="font-medium">Chat</span>
          </div>

          {notes.slice(0, 5).map(note => (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className="flex items-center gap-2 px-9 py-1.5 text-sm cursor-pointer transition-colors
                text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <span className="text-xs opacity-50">📄</span>
              <span className="truncate">{note.title || 'Untitled note'}</span>
            </div>
          ))}

          {files.slice(0, 5).map(file => (
            <div
              key={file.id}
              onClick={() => onOpenFile(file)}
              className="flex items-center gap-2 px-9 py-1.5 text-sm cursor-pointer transition-colors
                text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <span className="text-xs opacity-50">{getFileIcon(file.mime_type)}</span>
              <span className="truncate">{file.display_name}</span>
            </div>
          ))}

          <div className="flex items-center gap-2 px-9 pt-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onNewNote(); }}
              className="text-xs text-minai-500 hover:text-minai-700 transition-colors"
            >
              + New note
            </button>
            {(notes.length > 5 || files.length > 5) && (
              <>
                <span className="text-gray-300 dark:text-gray-700">·</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onExpandNotes(); }}
                  className="text-xs text-gray-400 hover:text-minai-600 transition-colors"
                >
                  see all
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  conversationId,
  onUpdate,
  onDelete,
  dragProps,
  isDragOver,
}: {
  note: Note;
  conversationId: string;
  onUpdate: (noteId: string, updates: { title?: string; content?: string }) => void;
  onDelete: (noteId: string) => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: true };
  isDragOver: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleContentChange = useCallback((html: string) => {
    onUpdate(note.id, { content: html });
  }, [note.id, onUpdate]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(note.id, { title: e.target.value });
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete note?"
        message={`"${note.title || 'Untitled note'}" will be permanently removed.`}
        confirmLabel="Delete note"
        onConfirm={() => { setConfirmDelete(false); onDelete(note.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <div
        {...dragProps}
        className={`bg-white dark:bg-gray-900 border rounded-xl p-4 transition-all
          ${isDragOver
            ? 'border-minai-400 shadow-md ring-1 ring-minai-200 dark:ring-minai-800'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
      >
        {/* Note header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 select-none text-base leading-none">
            ⠿
          </span>
          <input
            className="flex-1 font-semibold text-sm bg-transparent outline-none
              placeholder-gray-300 dark:placeholder-gray-600
              text-gray-800 dark:text-gray-100"
            value={note.title}
            placeholder="Note title..."
            onChange={handleTitleChange}
          />
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
            title="Delete note"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tiptap editor — auto-grows, capped at 60vh */}
        <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
          <NoteEditor
            content={note.content}
            onChange={handleContentChange}
          />
        </div>
      </div>
    </>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const router = useRouter();
  const {
    conversations,
    activeConversationId,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
    targetNoteId,
    setTargetNoteId,
  } = useChatStore();

  const [notesByConv, setNotesByConv] = useState<Record<string, Note[]>>({});
  const [filesByConv, setFilesByConv] = useState<Record<string, NotebookFile[]>>({});
  const [notebookOrder, setNotebookOrder] = useState<string[]>([]);
  const [confirmDeleteNotebook, setConfirmDeleteNotebook] = useState(false);
  const [viewingFile, setViewingFile] = useState<NotebookFile | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load conversations
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Keep notebook order in sync
  useEffect(() => {
    setNotebookOrder(prev => {
      const existing = new Set(prev);
      const added = conversations.filter(c => !existing.has(c.id)).map(c => c.id);
      const valid = new Set(conversations.map(c => c.id));
      return [...prev.filter(id => valid.has(id)), ...added];
    });
  }, [conversations]);

  // Load notes + files when active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;
    if (!notesByConv[activeConversationId]) {
      api.getNotes(activeConversationId).then(notes => {
        setNotesByConv(prev => ({ ...prev, [activeConversationId]: notes }));
      }).catch(console.error);
    }
    if (!filesByConv[activeConversationId]) {
      api.getFiles(activeConversationId).then(files => {
        setFilesByConv(prev => ({ ...prev, [activeConversationId]: files }));
      }).catch(console.error);
    }
  }, [activeConversationId]);

  // Scroll to targetNoteId when sidebar is expanded
  useEffect(() => {
    if (!targetNoteId || sidebarWidth !== 'expanded') return;
    const el = document.getElementById(`note-${targetNoteId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTargetNoteId(null);
    }
  }, [targetNoteId, sidebarWidth, setTargetNoteId]);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const sorted = notebookOrder
    .map(id => conversations.find(c => c.id === id))
    .filter((c): c is ConversationListItem => !!c);

  const activeNotebook = conversations.find(c => c.id === activeConversationId);
  const isOpen = sidebarWidth !== 'closed';
  const isExpanded = sidebarWidth === 'expanded';

  const expandedNotes = activeConversationId
    ? (notesByConv[activeConversationId] ?? []).slice().sort((a, b) => a.display_order - b.display_order)
    : [];

  // ─── Note CRUD (with debounced API save) ─────────────────────────────────

  const scheduleSave = (convId: string, noteId: string, updates: { title?: string; content?: string }) => {
    const key = `${convId}:${noteId}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      api.updateNote(convId, noteId, updates).catch(console.error);
    }, 600);
  };

  const handleNoteUpdate = (convId: string, noteId: string, updates: { title?: string; content?: string }) => {
    setNotesByConv(prev => ({
      ...prev,
      [convId]: (prev[convId] ?? []).map(n => n.id === noteId ? { ...n, ...updates } : n),
    }));
    scheduleSave(convId, noteId, updates);
  };

  const handleNewNote = async (convId: string) => {
    try {
      const note = await api.createNote(convId, '', '');
      setNotesByConv(prev => ({
        ...prev,
        [convId]: [...(prev[convId] ?? []), note],
      }));
    } catch (e) { console.error(e); }
  };

  const handleDeleteNote = async (convId: string, noteId: string) => {
    try {
      await api.deleteNote(convId, noteId);
      setNotesByConv(prev => ({
        ...prev,
        [convId]: (prev[convId] ?? []).filter(n => n.id !== noteId),
      }));
    } catch (e) { console.error(e); }
  };

  const handleReorderNotes = async (convId: string, reordered: Note[]) => {
    const updated = reordered.map((n, i) => ({ ...n, display_order: i }));
    setNotesByConv(prev => ({ ...prev, [convId]: updated }));
    // Persist new order
    for (const note of updated) {
      api.updateNote(convId, note.id, { display_order: note.display_order }).catch(console.error);
    }
  };

  // ─── Notebook actions ──────────────────────────────────────────────────────

  const handleSelectNotebook = async (id: string) => {
    await selectConversation(id);
    router.push(`/notebooks/${id}/chat`);
  };

  const handleNew = async () => {
    const id = await createConversation();
    router.push(`/notebooks/${id}/chat`);
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    setSidebarWidth('normal');
    // Navigate to another notebook, or home if none remain
    const remaining = conversations.filter(c => c.id !== id);
    if (remaining.length > 0) {
      router.push(`/notebooks/${remaining[0].id}/chat`);
    } else {
      router.push('/');
    }
  };

  const handleSelectNote = (convId: string, noteId: string) => {
    router.push(`/notebooks/${convId}/notes/${noteId}`);
  };

  const handleRename = async (id: string, newTitle: string) => {
    await updateConversation(id, { title: newTitle });
  };

  const handleExpandNotes = async (convId: string) => {
    if (convId !== activeConversationId) await handleSelectNotebook(convId);
    setSidebarWidth('expanded');
    // Refresh notes
    api.getNotes(convId).then(notes => {
      setNotesByConv(prev => ({ ...prev, [convId]: notes }));
    }).catch(console.error);
  };

  // ─── Note drag-sort ─────────────────────────────────────────────────────

  const { dragProps: noteDragProps, overIndex: noteOverIndex } = useDragSort(
    expandedNotes,
    (reordered) => { if (activeConversationId) handleReorderNotes(activeConversationId, reordered); }
  );

  // ─── Notebook drag-sort ────────────────────────────────────────────────

  const { dragProps, overIndex } = useDragSort(sorted, (reordered) => {
    setNotebookOrder(reordered.map(c => c.id));
  });

  const activeTitle = activeNotebook
    ? (['New conversation', 'Untitled Notebook'].includes(activeNotebook.title) ? 'My Notebook' : activeNotebook.title)
    : 'My Notebook';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {viewingFile && activeConversationId && (
        <FileViewer
          file={viewingFile}
          conversationId={activeConversationId}
          onClose={() => setViewingFile(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteNotebook}
        title="Delete notebook?"
        message="This will permanently delete the notebook and all its notes. This cannot be undone."
        confirmLabel="Delete notebook"
        onConfirm={() => { setConfirmDeleteNotebook(false); if (activeConversationId) handleDelete(activeConversationId); }}
        onCancel={() => setConfirmDeleteNotebook(false)}
      />

      {/* Backdrop */}
      {isOpen && (
        <div
          className={`fixed inset-0 bg-black/20 z-40 ${!isExpanded ? 'lg:hidden' : ''}`}
          onClick={toggleSidebar}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed left-0 top-0 bottom-0 bg-white dark:bg-gray-950 border-r border-gray-200
          dark:border-gray-800 z-50 flex flex-col
          transition-[transform,width] duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isExpanded ? 'w-[calc(100vw-2rem)] max-w-5xl' : 'w-72'}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {isExpanded ? (
            <>
              <button
                onClick={() => setSidebarWidth('normal')}
                className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                title="Back to notebooks"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-semibold text-sm truncate flex-1 text-minai-600">
                {activeTitle}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {expandedNotes.length} {expandedNotes.length === 1 ? 'note' : 'notes'}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-minai-600 flex-1">Notebooks</span>
              <button
                onClick={handleNew}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
                title="New notebook"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {isExpanded && activeConversationId ? (
            /* ── Expanded: notes canvas ── */
            <div className="p-4 max-w-2xl mx-auto w-full">
              {expandedNotes.length === 0 ? (
                <div className="text-center py-24 text-gray-400">
                  <div className="text-5xl mb-4">📄</div>
                  <p className="text-sm mb-4">No notes yet for this notebook.</p>
                  <button
                    onClick={() => handleNewNote(activeConversationId)}
                    className="text-sm text-minai-600 hover:underline"
                  >
                    Create your first note
                  </button>
                </div>
              ) : (
                <>
                  {expandedNotes.map((note, index) => (
                    <div key={note.id} id={`note-${note.id}`} className="mb-3">
                      <NoteCard
                        note={note}
                        conversationId={activeConversationId}
                        onUpdate={(noteId, updates) => handleNoteUpdate(activeConversationId, noteId, updates)}
                        onDelete={(noteId) => handleDeleteNote(activeConversationId, noteId)}
                        dragProps={noteDragProps(index)}
                        isDragOver={noteOverIndex === index}
                      />
                    </div>
                  ))}

                  {/* New Note button — inline below last note */}
                  <button
                    onClick={() => handleNewNote(activeConversationId)}
                    className="w-full mt-1 mb-3 py-2.5 rounded-xl border border-dashed border-gray-300
                      dark:border-gray-700 text-sm text-gray-400 hover:text-minai-600
                      hover:border-minai-400 dark:hover:border-minai-600 transition-colors"
                  >
                    + New note
                  </button>
                </>
              )}

              {/* Files section in expanded view */}
              {(filesByConv[activeConversationId] ?? []).length > 0 && (
                <div className="mt-4 mb-2">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 px-1">Files</div>
                  {(filesByConv[activeConversationId] ?? []).map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer
                        hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                      onClick={() => setViewingFile(file)}
                    >
                      <span className="text-base">{getFileIcon(file.mime_type)}</span>
                      <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-300">{file.display_name}</span>
                      <span className="text-xs text-gray-400">{(file.file_size / 1024).toFixed(0)} KB</span>
                      <a
                        href={api.getFileDownloadUrl(activeConversationId, file.id)}
                        download={file.original_name}
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-minai-600 transition-all"
                        title="Download"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {/* Delete notebook — bottom of expanded view */}
              <div className="pt-4 pb-8 px-1">
                <button
                  onClick={() => setConfirmDeleteNotebook(true)}
                  className="text-xs text-gray-300 dark:text-gray-600 hover:text-red-400
                    dark:hover:text-red-500 transition-colors"
                >
                  Delete this notebook
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal: notebook accordion list ── */
            <>
              {sorted.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12 px-4">
                  <div className="text-3xl mb-3">📓</div>
                  <p>No notebooks yet.</p>
                  <button
                    onClick={handleNew}
                    className="mt-3 text-sm text-minai-600 hover:underline"
                  >
                    Create your first notebook
                  </button>
                </div>
              ) : (
                sorted.map((conv, index) => (
                  <NotebookRow
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConversationId}
                    notes={(notesByConv[conv.id] ?? []).slice().sort((a, b) => a.display_order - b.display_order)}
                    files={filesByConv[conv.id] ?? []}
                    onSelect={() => handleSelectNotebook(conv.id)}
                    onRename={(title) => handleRename(conv.id, title)}
                    onNewNote={async () => {
                      if (conv.id !== activeConversationId) await handleSelectNotebook(conv.id);
                      handleNewNote(conv.id);
                    }}
                    onSelectNote={(noteId) => handleSelectNote(conv.id, noteId)}
                    onExpandNotes={() => handleExpandNotes(conv.id)}
                    onOpenFile={(file) => setViewingFile(file)}
                    dragProps={dragProps(index)}
                    isDragOver={overIndex === index}
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* ── Footer: Settings link ── */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 px-3 py-2">
          <button
            onClick={() => router.push('/settings')}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm
              text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900
              hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </>
  );
}
