import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  CheckSquare, 
  ListChecks, 
  FolderPlus, 
  Plus, 
  PlusCircle,
  Loader2 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/src/contexts/AuthContext';
import { createChecklist, createProject, createTodo, subscribeToProjects, subscribeToChecklists, addItem } from '@/src/services/db';
import { Project, Checklist } from '@/src/types';

interface QuickCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'item' | 'checklist' | 'project' | 'todo';
  currentChecklistId?: string | null;
}

export function QuickCreateModal({ open, onOpenChange, defaultTab = 'checklist', currentChecklistId }: QuickCreateModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'item' | 'checklist' | 'project' | 'todo'>(
    currentChecklistId ? 'item' : defaultTab
  );
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>(currentChecklistId || '');

  // Task Item Form
  const [itemText, setItemText] = useState('');
  const [itemNote, setItemNote] = useState('');

  // Checklist Form
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistCategory, setChecklistCategory] = useState('');
  const [checklistDesc, setChecklistDesc] = useState('');
  const [checklistProjectId, setChecklistProjectId] = useState<string>('');

  // Project Form
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  // Todo Form
  const [todoTitle, setTodoTitle] = useState('');
  const [todoCategory, setTodoCategory] = useState('');
  const [todoPriority, setTodoPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [todoNote, setTodoNote] = useState('');
  const [todoProjectId, setTodoProjectId] = useState<string>('');

  useEffect(() => {
    if (open) {
      if (currentChecklistId) {
        setActiveTab('item');
        setSelectedChecklistId(currentChecklistId);
      } else {
        setActiveTab(defaultTab);
      }
    }
  }, [open, defaultTab, currentChecklistId]);

  useEffect(() => {
    if (!user) return;
    const unsubProjects = subscribeToProjects(user.uid, (pList) => {
      setProjects(pList);
    });
    const unsubChecklists = subscribeToChecklists(user.uid, (cList) => {
      setChecklists(cList);
      if (currentChecklistId) {
        setSelectedChecklistId(currentChecklistId);
      } else if (cList.length > 0 && !selectedChecklistId) {
        setSelectedChecklistId(cList[0].id);
      }
    });
    return () => {
      unsubProjects();
      unsubChecklists();
    };
  }, [user, currentChecklistId]);

  const resetForms = () => {
    setItemText('');
    setItemNote('');
    setChecklistTitle('');
    setChecklistCategory('');
    setChecklistDesc('');
    setChecklistProjectId('');

    setProjectTitle('');
    setProjectDesc('');

    setTodoTitle('');
    setTodoCategory('');
    setTodoPriority('medium');
    setTodoNote('');
    setTodoProjectId('');
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetChecklistId = selectedChecklistId || currentChecklistId;
    if (!user || !itemText.trim() || !targetChecklistId) {
      if (!targetChecklistId) toast.error('Please select a checklist');
      return;
    }

    setLoading(true);
    try {
      await addItem(targetChecklistId, itemText.trim(), 999, null, itemNote.trim() || null);
      toast.success('Task item added to checklist!');
      resetForms();
      onOpenChange(false);
      if (!window.location.pathname.includes(`/checklist/${targetChecklistId}`)) {
        navigate(`/checklist/${targetChecklistId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to create task item');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !checklistTitle.trim()) return;

    setLoading(true);
    try {
      const docRef = await createChecklist(
        user.uid,
        checklistTitle.trim(),
        checklistDesc.trim(),
        0,
        checklistProjectId || null
      );
      toast.success('Checklist created successfully!');
      resetForms();
      onOpenChange(false);
      if (docRef?.id) {
        navigate(`/checklist/${docRef.id}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to create checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !projectTitle.trim()) return;

    setLoading(true);
    try {
      const docRef = await createProject(
        user.uid,
        projectTitle.trim(),
        projectDesc.trim()
      );
      toast.success('Project cluster created!');
      resetForms();
      onOpenChange(false);
      if (docRef?.id) {
        navigate(`/project/${docRef.id}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !todoTitle.trim()) return;

    setLoading(true);
    try {
      let finalNote = todoNote.trim();
      if (todoPriority !== 'medium') {
        finalNote = `[Priority: ${todoPriority.toUpperCase()}] ${finalNote}`.trim();
      }

      await createTodo(
        user.uid,
        todoTitle.trim(),
        finalNote || undefined,
        todoProjectId || null,
        null,
        todoCategory.trim() || null
      );
      toast.success('To-Do item added!');
      resetForms();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-4 border-slate-900 rounded-3xl p-6 shadow-bento">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
            <Plus className="w-6 h-6 text-indigo-600 stroke-[3]" />
            Quick Create
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold text-slate-500">
            Choose an item type to add to your workspace immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Type selector tabs */}
        <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-100 rounded-2xl border-2 border-slate-900 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('item')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl font-black text-[11px] transition-all ${
              activeTab === 'item'
                ? 'bg-indigo-600 text-white border-2 border-slate-900 shadow-[2px_2px_0px_rgba(15,23,42,1)]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Task Item</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl font-black text-[11px] transition-all ${
              activeTab === 'checklist'
                ? 'bg-indigo-600 text-white border-2 border-slate-900 shadow-[2px_2px_0px_rgba(15,23,42,1)]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Checklist</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl font-black text-[11px] transition-all ${
              activeTab === 'project'
                ? 'bg-indigo-600 text-white border-2 border-slate-900 shadow-[2px_2px_0px_rgba(15,23,42,1)]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Project</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('todo')}
            className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl font-black text-[11px] transition-all ${
              activeTab === 'todo'
                ? 'bg-indigo-600 text-white border-2 border-slate-900 shadow-[2px_2px_0px_rgba(15,23,42,1)]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">To-Do</span>
          </button>
        </div>

        {/* Form: Task Item */}
        {activeTab === 'item' && (
          <form onSubmit={handleCreateItem} className="space-y-4">
            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Target Checklist *</Label>
              <select
                required
                value={selectedChecklistId}
                onChange={(e) => setSelectedChecklistId(e.target.value)}
                className="mt-1 w-full h-10 px-3 bg-white border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
              >
                {checklists.length === 0 && <option value="">No checklists available (Create one first)</option>}
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.id === currentChecklistId ? '(Current Checklist)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Task Item Description / Name *</Label>
              <Input
                required
                autoFocus
                value={itemText}
                onChange={(e) => setItemText(e.target.value)}
                placeholder="e.g. Verify database backups, Inspect brake fluid..."
                className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-sm focus:ring-0"
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Item Notes / Details</Label>
              <textarea
                rows={3}
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                placeholder="Optional notes, verification steps, or guidelines..."
                className="mt-1 w-full p-2.5 bg-white border-2 border-slate-900 rounded-xl font-medium text-xs text-slate-900 focus:ring-0 resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bento-button bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !itemText.trim() || !selectedChecklistId}
                className="bento-button bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Task Item'}
              </Button>
            </div>
          </form>
        )}

        {/* Form: Checklist */}
        {activeTab === 'checklist' && (
          <form onSubmit={handleCreateChecklist} className="space-y-4">
            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Checklist Title *</Label>
              <Input
                required
                value={checklistTitle}
                onChange={(e) => setChecklistTitle(e.target.value)}
                placeholder="e.g. Website Launch Audit, Server Prep..."
                className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-sm focus:ring-0"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-black uppercase text-slate-700">Category</Label>
                <Input
                  value={checklistCategory}
                  onChange={(e) => setChecklistCategory(e.target.value)}
                  placeholder="e.g. DevOps, QA"
                  className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
                />
              </div>
              <div>
                <Label className="text-xs font-black uppercase text-slate-700">Project</Label>
                <select
                  value={checklistProjectId}
                  onChange={(e) => setChecklistProjectId(e.target.value)}
                  className="mt-1 w-full h-10 px-3 bg-white border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
                >
                  <option value="">(No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Description</Label>
              <Input
                value={checklistDesc}
                onChange={(e) => setChecklistDesc(e.target.value)}
                placeholder="Brief summary or purpose of this checklist..."
                className="mt-1 border-2 border-slate-900 rounded-xl font-medium text-xs focus:ring-0"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bento-button bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !checklistTitle.trim()}
                className="bento-button bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Checklist'}
              </Button>
            </div>
          </form>
        )}

        {/* Form: Project */}
        {activeTab === 'project' && (
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Project Name *</Label>
              <Input
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. Q3 Infrastructure Upgrade, Mobile App Release"
                className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-sm focus:ring-0"
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Description</Label>
              <Input
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Key goals, scope, or timeline notes..."
                className="mt-1 border-2 border-slate-900 rounded-xl font-medium text-xs focus:ring-0"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bento-button bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !projectTitle.trim()}
                className="bento-button bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
              </Button>
            </div>
          </form>
        )}

        {/* Form: To-Do */}
        {activeTab === 'todo' && (
          <form onSubmit={handleCreateTodo} className="space-y-4">
            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Task Title *</Label>
              <Input
                required
                value={todoTitle}
                onChange={(e) => setTodoTitle(e.target.value)}
                placeholder="e.g. Review pull request #402, Send weekly status..."
                className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-sm focus:ring-0"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-black uppercase text-slate-700">Category</Label>
                <Input
                  value={todoCategory}
                  onChange={(e) => setTodoCategory(e.target.value)}
                  placeholder="e.g. Bugfix, Review"
                  className="mt-1 border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
                />
              </div>
              <div>
                <Label className="text-xs font-black uppercase text-slate-700">Priority</Label>
                <select
                  value={todoPriority}
                  onChange={(e) => setTodoPriority(e.target.value as 'low' | 'medium' | 'high')}
                  className="mt-1 w-full h-10 px-3 bg-white border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Project</Label>
              <select
                value={todoProjectId}
                onChange={(e) => setTodoProjectId(e.target.value)}
                className="mt-1 w-full h-10 px-3 bg-white border-2 border-slate-900 rounded-xl font-bold text-xs focus:ring-0"
              >
                <option value="">(No Project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-black uppercase text-slate-700">Notes / Context</Label>
              <textarea
                rows={3}
                value={todoNote}
                onChange={(e) => setTodoNote(e.target.value)}
                placeholder="Optional task details, instructions, or links..."
                className="mt-1 w-full p-2.5 bg-white border-2 border-slate-900 rounded-xl font-medium text-xs text-slate-900 focus:ring-0 resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bento-button bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !todoTitle.trim()}
                className="bento-button bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Task'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
