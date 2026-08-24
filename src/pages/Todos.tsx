import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToTodos, 
  createTodo, 
  updateTodo, 
  deleteTodo,
  subscribeToChecklists,
  moveTodoToChecklist
} from '@/src/services/db';
import { 
  batchMoveTodosToChecklist, 
  batchUpdateTodos, 
  batchDeleteTodos 
} from '@/src/services/todoBatch';
import { Todo, Checklist } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Copy, 
  Search, 
  ListCheck, 
  Trash2, 
  FileText, 
  CheckSquare, 
  Square, 
  Sparkles, 
  FolderInput, 
  Check 
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/src/components/Navbar';
import { ConfirmDeleteModal } from '@/src/components/ConfirmDeleteModal';
import { generateMarkdown, parseMarkdown } from '@/src/lib/markdownUtils';
import { collection, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { TodoItem } from '@/src/components/Todo/TodoItem';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

const DEFAULT_CATEGORIES = ['General', 'Operations', 'Quality Assurance', 'Safety & Audit', 'Engineering', 'Field Inspection'];

export default function Todos() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Quick-Add bar state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickCategory, setQuickCategory] = useState<string>('Operations');
  const [quickNote, setQuickNote] = useState('');
  const [showQuickNoteInput, setShowQuickNoteInput] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Single Move Modal state
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [targetListId, setTargetListId] = useState<string>('');
  const [newListName, setNewListName] = useState('');

  // MULTI-SELECT & BATCH TRIAGE (Task C: 3-Click Triage of 20 To-dos into Checklist)
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(new Set());
  const [isBatchTriageOpen, setIsBatchTriageOpen] = useState(false);
  const [batchTargetListId, setBatchTargetListId] = useState<string>('');
  const [batchNewListName, setBatchNewListName] = useState('');
  const [batchTriageLoading, setBatchTriageLoading] = useState(false);

  // Batch Delete Modal state
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  
  // Filtering state
  const [showDone, setShowDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    
    const unsubTodos = subscribeToTodos(user.uid, (data) => {
      setTodos(data);
      setLoading(false);
    }, null);
    
    const unsubLists = subscribeToChecklists(user.uid, (data) => {
      setChecklists(data.filter(l => l.status !== 'archived'));
    }, null);
    
    return () => {
      unsubTodos();
      unsubLists();
    };
  }, [user]);

  // Keyboard shortcuts (N to quick-add, / to search, Esc to clear selection/modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (e.key === 'Escape') {
        if (isBatchTriageOpen) setIsBatchTriageOpen(false);
        else if (isMoveOpen) setIsMoveOpen(false);
        else if (selectedTodoIds.size > 0) setSelectedTodoIds(new Set());
        else if (searchQuery) setSearchQuery('');
        else if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (isInput) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        quickInputRef.current?.focus();
      } else if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBatchTriageOpen, isMoveOpen, selectedTodoIds, searchQuery]);

  const handleCopyMarkdown = () => {
    if (todos.length === 0) {
      toast.error('Nothing to copy');
      return;
    }
    const md = generateMarkdown(todos);
    navigator.clipboard.writeText(md);
    toast.success('Tasks copied as Markdown');
  };

  const handlePasteMarkdown = async (text: string) => {
    if (!user) return;
    const parsed = parseMarkdown(text);
    if (parsed.length === 0) return;

    try {
      const batch = writeBatch(db);
      for (const item of parsed) {
        const todoRef = doc(collection(db, 'todos'));
        batch.set(todoRef, {
          userId: user.uid,
          title: item.text,
          description: item.description || null,
          outcome: item.outcome || 'none',
          note: null,
          isDone: item.isDone,
          category: 'Operations',
          priority: 'medium',
          projectId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();
      toast.success(`Imported ${parsed.length} items`);
    } catch (error: unknown) {
      console.error('Paste failed:', error);
      toast.error('Failed to parse and import items');
    }
  };

  const onPasteInput = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('- [ ]') || text.includes('- [x]') || text.split('\n').length > 1) {
      e.preventDefault();
      handlePasteMarkdown(text);
      setQuickTitle('');
    }
  };

  // Quick-Add Handler
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !quickTitle.trim() || quickAddLoading) return;

    setQuickAddLoading(true);
    try {
      const docRef = await createTodo(
        user.uid, 
        quickTitle.trim(), 
        quickNote.trim() || null, 
        null, 
        null, 
        quickCategory
      );
      if (docRef) {
        await updateTodo(docRef.id, {
          priority: quickPriority,
          dueDate: quickDueDate || null,
          category: quickCategory
        });
      }
      toast.success('Action item captured');
      setQuickTitle('');
      setQuickNote('');
      setShowQuickNoteInput(false);
      setTimeout(() => quickInputRef.current?.focus(), 50);
    } catch {
      toast.error('Failed to capture action item');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const handleToggle = async (todo: Todo) => {
    await updateTodo(todo.id, { isDone: !todo.isDone });
  };

  const handleDelete = async (todo: Todo) => {
    await deleteTodo(todo.id);
    toast.success('Item deleted');
  };

  const handleMoveClick = (todo: Todo) => {
    setSelectedTodo(todo);
    setIsMoveOpen(true);
  };

  const handleMoveSubmit = async () => {
    if (!selectedTodo || !targetListId) return;
    
    try {
      await moveTodoToChecklist(
        selectedTodo, 
        targetListId, 
        targetListId === 'new' ? newListName : undefined
      );
      toast.success('Moved item to inspection checklist');
      setIsMoveOpen(false);
      setSelectedTodo(null);
      setTargetListId('');
      setNewListName('');
    } catch (err: unknown) {
      toast.error('Failed to move task: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // MULTI-SELECT HANDLERS (Resolves Task C)
  const handleToggleSelect = (todoId: string) => {
    setSelectedTodoIds(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) {
        next.delete(todoId);
      } else {
        next.add(todoId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedTodoIds.size === filteredTodos.length && filteredTodos.length > 0) {
      setSelectedTodoIds(new Set());
    } else {
      setSelectedTodoIds(new Set(filteredTodos.map(t => t.id)));
    }
  };

  const handleBatchTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedTodoIds.size === 0 || !batchTargetListId) return;

    setBatchTriageLoading(true);
    try {
      const selectedTodos = todos.filter(t => selectedTodoIds.has(t.id));
      await batchMoveTodosToChecklist(
        user.uid,
        selectedTodos,
        batchTargetListId,
        batchTargetListId === 'new' ? batchNewListName.trim() : undefined
      );

      toast.success(`Triaged ${selectedTodos.length} items into checklist!`);
      setSelectedTodoIds(new Set());
      setIsBatchTriageOpen(false);
      setBatchTargetListId('');
      setBatchNewListName('');
    } catch (err: unknown) {
      toast.error('Batch triage failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setBatchTriageLoading(false);
    }
  };

  const handleBatchMarkDone = async (isDone: boolean) => {
    if (selectedTodoIds.size === 0) return;
    try {
      await batchUpdateTodos(Array.from(selectedTodoIds), { isDone });
      toast.success(`Marked ${selectedTodoIds.size} items as ${isDone ? 'completed' : 'pending'}`);
    } catch {
      toast.error('Failed to update items');
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedTodoIds.size === 0) return;
    setBatchDeleteLoading(true);
    try {
      await batchDeleteTodos(Array.from(selectedTodoIds));
      toast.success(`Deleted ${selectedTodoIds.size} items`);
      setSelectedTodoIds(new Set());
      setBatchDeleteOpen(false);
    } catch {
      toast.error('Failed to delete items');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  // Stats computation
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.isDone).length;
    const pending = total - completed;
    const urgent = todos.filter(t => !t.isDone && t.priority === 'urgent').length;
    return { total, completed, pending, urgent };
  }, [todos]);

  // Filtered Todos
  const filteredTodos = useMemo(() => {
    return todos.filter(todo => {
      if (!showDone && todo.isDone) return false;
      if (priorityFilter !== 'all' && todo.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && todo.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = todo.title.toLowerCase().includes(q);
        const matchNote = todo.note?.toLowerCase().includes(q);
        const matchCategory = todo.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchNote && !matchCategory) return false;
      }

      return true;
    });
  }, [todos, showDone, priorityFilter, categoryFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24">
      <Navbar />

      <main className="max-w-6xl mx-auto p-3 sm:p-6 md:p-8 space-y-6">
        {/* Command Header */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">
                ACTION QUEUE & TRIAGE BACKLOG
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Action Items & Stray Defects
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Rapid punch-list triage, defect capture, and batch conversion into formal inspection manifests.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleCopyMarkdown}
              className="h-10 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold font-mono uppercase flex items-center gap-1.5 transition-colors"
              title="Copy as Markdown"
            >
              <Copy className="w-3.5 h-3.5" /> <span>Copy MD</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="text-[10px] font-mono font-bold uppercase text-slate-500">Total Backlog</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.total}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="text-[10px] font-mono font-bold uppercase text-amber-800">Pending Actions</div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{stats.pending}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="text-[10px] font-mono font-bold uppercase text-red-800">Urgent SLA</div>
            <div className="text-2xl font-bold font-mono text-red-700 mt-1">{stats.urgent}</div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="text-[10px] font-mono font-bold uppercase text-emerald-800">Resolved</div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{stats.completed}</div>
          </div>
        </div>

        {/* Quick Capture Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-slate-900" />
              Rapid Capture Bar <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-100 border border-slate-300 rounded">Press N</kbd>
            </span>
            <button 
              type="button" 
              onClick={() => setShowQuickNoteInput(!showQuickNoteInput)}
              className="text-xs font-mono font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <FileText className="w-3 h-3" /> {showQuickNoteInput ? 'Remove Note' : '+ Scope Note'}
            </button>
          </div>

          <form onSubmit={handleQuickAdd} className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
              <div className="relative flex-1">
                <input
                  ref={quickInputRef}
                  placeholder="Record punch item or field defect... (Paste markdown supported)"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onPaste={onPasteInput}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>

              {/* Priority Selectors */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setQuickPriority(p)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors",
                      quickPriority === p 
                        ? p === 'urgent' ? 'bg-red-600 text-white' :
                          p === 'high' ? 'bg-amber-600 text-white' :
                          p === 'medium' ? 'bg-slate-900 text-white' :
                          'bg-slate-700 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Category */}
              <select
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                className="h-10 border border-slate-300 rounded-lg text-xs font-mono font-bold px-2.5 bg-white text-slate-800 shrink-0"
              >
                {DEFAULT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>

              <button
                type="submit"
                disabled={quickAddLoading || !quickTitle.trim()}
                className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-bold uppercase transition-colors shrink-0 disabled:opacity-50"
              >
                {quickAddLoading ? 'ADDING...' : 'ADD ITEM (Enter)'}
              </button>
            </div>

            {showQuickNoteInput && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  placeholder="Audit reference, location tag, or serial notes..."
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  className="flex-1 h-9 px-3 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 outline-none"
                />
                <input
                  type="date"
                  value={quickDueDate}
                  onChange={(e) => setQuickDueDate(e.target.value)}
                  className="h-9 px-2 border border-slate-300 rounded-lg text-xs font-mono bg-white outline-none"
                />
              </div>
            )}
          </form>
        </div>

        {/* Filter & Multi-Select Action Bar */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                ref={searchInputRef}
                placeholder="Search action items by keyword, note, category... (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 h-10 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={handleSelectAllFiltered}
                className="h-10 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-mono font-bold text-slate-800 flex items-center gap-1.5 shrink-0"
              >
                {selectedTodoIds.size === filteredTodos.length && filteredTodos.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-slate-900" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Select All ({selectedTodoIds.size})</span>
              </button>

              <button
                onClick={() => setShowDone(!showDone)}
                className={cn(
                  "h-10 px-3 rounded-lg border text-xs font-mono font-bold transition-all shrink-0",
                  showDone ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                )}
              >
                {showDone ? 'Hide Done' : 'Show Done'}
              </button>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-10 border border-slate-300 rounded-lg text-xs font-mono font-bold px-2 bg-white text-slate-800 shrink-0"
              >
                <option value="all">ALL PRIORITIES</option>
                <option value="urgent">URGENT</option>
                <option value="high">HIGH</option>
                <option value="medium">MEDIUM</option>
                <option value="low">LOW</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 border border-slate-300 rounded-lg text-xs font-mono font-bold px-2 bg-white text-slate-800 shrink-0"
              >
                <option value="all">ALL CATEGORIES</option>
                {DEFAULT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Task List Ledger */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-slate-200 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filteredTodos.length === 0 ? (
          <div className="p-12 bg-white border border-dashed border-slate-300 rounded-2xl text-center space-y-3">
            <ListCheck className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">Zero items in action backlog</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Capture tasks directly in the quick bar above or import markdown checklists.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => handleToggle(todo)}
                onDelete={() => handleDelete(todo)}
                onUpdate={(updates) => updateTodo(todo.id, updates)}
                onMove={() => handleMoveClick(todo)}
                isSelected={selectedTodoIds.has(todo.id)}
                onSelectToggle={() => handleToggleSelect(todo.id)}
                isSelectionMode={selectedTodoIds.size > 0}
              />
            ))}
          </div>
        )}
      </main>

      {/* FLOATING BATCH TRIAGE DOCK (3-Click Triage of 20 To-dos into Checklist) */}
      {selectedTodoIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-2xl px-4 z-40 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-mono font-bold text-xs flex items-center justify-center">
                {selectedTodoIds.size}
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                Items Selected for Triage
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsBatchTriageOpen(true)}
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <FolderInput className="w-4 h-4" />
                <span>Move to Checklist (3-Clicks)</span>
              </button>

              <button
                type="button"
                onClick={() => handleBatchMarkDone(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-colors"
                title="Mark Selected Done"
              >
                <Check className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setBatchDeleteOpen(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-red-950 text-red-400 border border-slate-700 transition-colors"
                title="Delete Selected"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedTodoIds(new Set())}
                className="text-xs font-mono text-slate-400 hover:text-white px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Triage Modal (Task C) */}
      <Dialog open={isBatchTriageOpen} onOpenChange={setIsBatchTriageOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-300 rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FolderInput className="w-5 h-5 text-amber-600" />
              Batch Triage {selectedTodoIds.size} Items into Checklist
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Transfer selected stray action items into a formal inspection manifest in one batch.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchTriageSubmit} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Target Inspection Checklist</Label>
              <select
                value={batchTargetListId}
                onChange={(e) => setBatchTargetListId(e.target.value)}
                className="mt-1 w-full h-10 border border-slate-300 rounded-lg px-3 text-xs font-medium bg-white"
                required
              >
                <option value="">-- Choose Target Checklist --</option>
                <option value="new">+ Create Brand New Checklist...</option>
                {checklists.map(list => (
                  <option key={list.id} value={list.id}>
                    {list.title} ({list.category || 'Manifest'})
                  </option>
                ))}
              </select>
            </div>

            {batchTargetListId === 'new' && (
              <div>
                <Label className="text-xs font-mono font-bold uppercase text-slate-700">New Checklist Name</Label>
                <Input
                  placeholder="e.g. Field Punch Backlog Triage"
                  value={batchNewListName}
                  onChange={(e) => setBatchNewListName(e.target.value)}
                  className="mt-1 border-slate-300 rounded-lg text-xs font-medium"
                  required
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={batchTriageLoading || !batchTargetListId}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs h-10 rounded-lg"
              >
                {batchTriageLoading ? 'TRIAGING ITEMS...' : `MOVE ${selectedTodoIds.size} ITEMS TO CHECKLIST (Enter)`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single Move Modal */}
      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-300 rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Triage Item to Checklist
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Convert "{selectedTodo?.title}" into an inspection verification step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Target Checklist</Label>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="mt-1 w-full h-10 border border-slate-300 rounded-lg px-3 text-xs font-medium bg-white"
              >
                <option value="">-- Select Checklist --</option>
                <option value="new">+ Create New Checklist...</option>
                {checklists.map(list => (
                  <option key={list.id} value={list.id}>{list.title}</option>
                ))}
              </select>
            </div>

            {targetListId === 'new' && (
              <div>
                <Label className="text-xs font-mono font-bold uppercase text-slate-700">New Checklist Name</Label>
                <Input
                  placeholder="e.g. Mechanical Punch Items"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="mt-1 border-slate-300 rounded-lg text-xs"
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                onClick={handleMoveSubmit}
                disabled={!targetListId}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs h-10 rounded-lg"
              >
                CONFIRM MOVE
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Modal */}
      <ConfirmDeleteModal
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        title={`Delete ${selectedTodoIds.size} Selected Items?`}
        description="Are you sure you want to delete these action items? This cannot be undone."
        onConfirm={handleBatchDeleteConfirm}
        loading={batchDeleteLoading}
      />
    </div>
  );
}
