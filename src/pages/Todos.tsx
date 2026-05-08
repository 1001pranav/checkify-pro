import React, { useEffect, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToTodos, 
  createTodo, 
  updateTodo, 
  deleteTodo,
  subscribeToChecklists,
  moveTodoToChecklist
} from '@/src/services/db';
import { Todo, Checklist } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from '@/src/components/Navbar';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Todos() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [targetListId, setTargetListId] = useState<string>('');
  const [newListName, setNewListName] = useState('');
  
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    const unsubTodos = subscribeToTodos(user.uid, (data) => {
      setTodos(data);
      setLoading(false);
    }, null); // Filter for independent todos
    
    const unsubLists = subscribeToChecklists(user.uid, (data) => {
      setChecklists(data.filter(l => l.status !== 'archived'));
    }, null); // Filter for independent checklists (or all?) - usually better to filter match context
    
    return () => {
      unsubTodos();
      unsubLists();
    };
  }, [user]);

  const handleCopyMarkdown = () => {
    if (todos.length === 0) {
      toast.error('Nothing to copy');
      return;
    }
    const md = generateMarkdown(todos);
    navigator.clipboard.writeText(md);
    toast.success('Todos copied as Markdown');
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
          projectId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();
      toast.success(`Imported ${parsed.length} items`);
    } catch (error) {
      console.error('Paste failed:', error);
      toast.error('Failed to parse and add todos');
    }
  };

  const onPasteInput = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('- [ ]') || text.includes('- [x]') || text.split('\n').length > 1) {
      e.preventDefault();
      handlePasteMarkdown(text);
      setNewTitle('');
      setIsAddOpen(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    
    try {
      await createTodo(user.uid, newTitle.trim(), newNote.trim(), null);
      toast.success('Todo added');
      setNewTitle('');
      setNewNote('');
      setIsAddOpen(false);
    } catch {
      toast.error('Failed to add todo');
    }
  };

  const handleToggle = async (todo: Todo) => {
    await updateTodo(todo.id, { isDone: !todo.isDone });
  };

  const handleDelete = async (id: string) => {
    await deleteTodo(id);
    toast.success('Todo deleted');
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
        targetListId === 'new' ? 'new' : targetListId,
        targetListId === 'new' ? newListName : undefined
      );
      toast.success('Moved to checklist');
      setIsMoveOpen(false);
      setSelectedTodo(null);
      setTargetListId('');
      setNewListName('');
    } catch {
      toast.error('Failed to move todo');
    }
  };

  const pending = todos.filter(t => !t.isDone);
  const done = todos.filter(t => t.isDone);

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <Navbar />
      
      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 overflow-x-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-2xl border-2 border-slate-900 shadow-bento overflow-hidden">
            <div className="min-w-0">
              <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight truncate">Focus <span className="text-indigo-600">List</span></h2>
              <p className="text-xs md:text-sm text-slate-500 font-medium truncate">Quick tactical actions and reminders.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={handleCopyMarkdown} className="bento-button bg-white text-slate-900 h-10 md:h-11 px-4 shrink-0 flex-1 sm:flex-initial">
                <Copy className="w-4 h-4 mr-2" /> Copy MD
              </Button>
              <Button onClick={() => setIsAddOpen(true)} className="bento-button bg-indigo-600 text-white h-10 md:h-11 px-6 shrink-0 flex-1 sm:flex-initial">
                <Plus className="w-5 h-5 mr-2" /> Add Task
              </Button>
            </div>
          </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-slate-200 animate-pulse rounded-2xl border-2 border-slate-900 shadow-bento" />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bento-card border-dashed">
            <CheckCircle2 className="w-16 h-16 mb-4 opacity-10" />
            <p className="font-bold uppercase tracking-widest text-slate-400">Your list is clear</p>
            <Button variant="link" onClick={() => setIsAddOpen(true)} className="text-indigo-600 font-black">
              Time to add a new challenge
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending items */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {pending.map(todo => (
                  <TodoItem 
                    key={todo.id} 
                    todo={todo} 
                    onToggle={() => handleToggle(todo)}
                    onUpdate={(updates) => updateTodo(todo.id, updates)}
                    onDelete={() => handleDelete(todo.id)}
                    onMove={() => handleMoveClick(todo)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Completed items header/toggle */}
            {done.length > 0 && (
              <div className="pt-4 border-t-2 border-slate-200">
                <button 
                  onClick={() => setShowDone(!showDone)}
                  className="flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600 transition-colors"
                >
                  {showDone ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Done ({done.length})
                </button>
                
                <AnimatePresence>
                  {showDone && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-3 mt-4"
                    >
                      {done.map(todo => (
                        <TodoItem 
                          key={todo.id} 
                          todo={todo} 
                          onToggle={() => handleToggle(todo)}
                          onUpdate={(updates) => updateTodo(todo.id, updates)}
                          onDelete={() => handleDelete(todo.id)}
                          onMove={() => handleMoveClick(todo)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Add Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="bento-card max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Action Item</DialogTitle>
              <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                Define the next step in your workflow
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Task Title (Paste MD allowed)</Label>
                <Input 
                  placeholder="What needs to be done?" 
                  className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onPaste={onPasteInput}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Notes (Optional)</Label>
                <Input 
                  placeholder="Extra context..." 
                  className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="bento-button w-full h-12 bg-indigo-600 text-white">
                  COMMIT TO LIST
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Move Dialog */}
        <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
          <DialogContent className="bento-card max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Escalate to Checklist</DialogTitle>
              <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                Convert this task into a formal checklist item
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Target Protocol</Label>
                <Select value={targetListId} onValueChange={setTargetListId}>
                  <SelectTrigger className="h-12 border-2 border-slate-900 rounded-xl font-bold">
                    <SelectValue placeholder="Chose checklist..." />
                  </SelectTrigger>
                  <SelectContent className="bento-card">
                    {checklists.map(list => (
                      <SelectItem key={list.id} value={list.id} className="font-bold uppercase text-xs">{list.title}</SelectItem>
                    ))}
                    <SelectItem value="new" className="font-bold uppercase text-xs text-indigo-600">+ Create New Checklist</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetListId === 'new' && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">New Checklist Name</Label>
                  <Input 
                    placeholder="Enter process name..." 
                    className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                </motion.div>
              )}

              <DialogFooter className="pt-4">
                <Button 
                  onClick={handleMoveSubmit} 
                  className="bento-button w-full h-12 bg-indigo-600 text-white"
                  disabled={!targetListId || (targetListId === 'new' && !newListName.trim())}
                >
                  EXECUTE MOVE
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
