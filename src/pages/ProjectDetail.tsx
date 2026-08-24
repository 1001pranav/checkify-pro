import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  getProject,
  subscribeToChecklists, 
  subscribeToTodos,
  createChecklist,
  createTodo,
  updateTodo,
  deleteChecklist,
  deleteTodo,
  deleteProject,
  subscribeToShareConfig
} from '@/src/services/db';
import { Project, Checklist, Todo, ShareConfig } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Plus, 
  ChevronLeft, 
  Layout, 
  ListChecks, 
  CheckSquare, 
  Clock, 
  Trash2,
  Share2,
  Copy
} from 'lucide-react';
import { TodoItem } from '@/src/components/Todo/TodoItem';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from '@/src/components/Navbar';
import { ConfirmDeleteModal } from '@/src/components/ConfirmDeleteModal';
import { generateMarkdown } from '@/src/lib/markdownUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShareModal } from '@/src/components/ShareModal';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [shareConfig, setShareConfig] = useState<ShareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('checklists');
  
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [itemLoading, setItemLoading] = useState(false);

  // Delete modal states
  const [deleteType, setDeleteType] = useState<'project' | 'checklist' | 'todo' | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Keyboard shortcut listeners: N to create, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (e.key === 'Escape') {
        if (isChecklistDialogOpen) setIsChecklistDialogOpen(false);
        if (isTodoDialogOpen) setIsTodoDialogOpen(false);
        if (isShareDialogOpen) setIsShareDialogOpen(false);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (isInput) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (activeTab === 'todos') {
          setIsTodoDialogOpen(true);
        } else {
          setIsChecklistDialogOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChecklistDialogOpen, isTodoDialogOpen, isShareDialogOpen, activeTab]);

  useEffect(() => {
    if (!id) return;
    
    const fetchProject = async () => {
      try {
        const data = await getProject(id);
        if (!data) {
          toast.error('Project not found or inaccessible');
          if (user) navigate('/projects');
          return;
        }
        setProject(data);
      } catch (err) {
        console.error('Failed to fetch project:', err);
      }
    };
    
    fetchProject();
    
    // Only subscribe to lists/todos if we have a user (owner view) 
    // or if the project itself handles its own sharing state.
    // For guests, we primarily use the SharedPage, but we add a safety here.
    const projectUserId = project?.userId || user?.uid;
    if (!projectUserId) return;

    const unsubChecklists = subscribeToChecklists(projectUserId, (data) => {
      setChecklists(data);
    }, id);
    
    const unsubTodos = subscribeToTodos(projectUserId, (data) => {
      setTodos(data);
      setLoading(false);
    }, id);

    const unsubShare = subscribeToShareConfig(id, setShareConfig);
    
    return () => {
      unsubChecklists();
      unsubTodos();
      unsubShare();
    };
  }, [user, id, navigate, project?.userId]);

  const handlePromptDeleteProject = () => {
    setDeleteType('project');
    setDeleteTargetId(id || null);
  };

  const handleDeleteChecklistClick = (e: React.MouseEvent, cid: string) => {
    e.stopPropagation();
    setDeleteType('checklist');
    setDeleteTargetId(cid);
  };

  const handleDeleteTodoClick = (tid: string) => {
    setDeleteType('todo');
    setDeleteTargetId(tid);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId || !deleteType) return;
    setDeleteLoading(true);
    try {
      if (deleteType === 'project') {
        await deleteProject(deleteTargetId);
        toast.success('Project cluster dissolved');
        navigate('/projects');
      } else if (deleteType === 'checklist') {
        await deleteChecklist(deleteTargetId);
        toast.success('Checklist deleted');
      } else if (deleteType === 'todo') {
        await deleteTodo(deleteTargetId);
        toast.success('Todo deleted');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error(`Failed to delete ${deleteType}`);
    } finally {
      setDeleteLoading(false);
      setDeleteType(null);
      setDeleteTargetId(null);
    }
  };

  const handleCreateChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !newChecklistTitle.trim()) return;
    setItemLoading(true);
    try {
      const docRef = await createChecklist(user.uid, newChecklistTitle.trim(), '', checklists.length, id);
      toast.success('Checklist added to project');
      setNewChecklistTitle('');
      setIsChecklistDialogOpen(false);
      navigate(`/checklist/${docRef?.id}`);
    } catch (err) {
      console.error('Create checklist failed:', err);
      toast.error('Failed to add checklist');
    } finally {
      setItemLoading(false);
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !newTodoTitle.trim()) return;
    setItemLoading(true);
    try {
      await createTodo(user.uid, newTodoTitle.trim(), '', id);
      toast.success('Todo added to project');
      setNewTodoTitle('');
      setIsTodoDialogOpen(false);
    } catch (err) {
      console.error('Create todo failed:', err);
      toast.error('Failed to add todo');
    } finally {
      setItemLoading(false);
    }
  };

  const handleToggleTodo = async (todoId: string, updates: Partial<Todo>) => {
    try {
      await updateTodo(todoId, updates);
    } catch {
      toast.error('Failed to update task');
    }
  };

  if (loading && !project) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center p-20">
          <div className="h-12 w-12 border-4 border-emerald-600 border-t-transparent animate-spin rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden pb-20">
      <Navbar />
      
      {/* Project Context Bar - Persistent indication of current workspace */}
      <div className="bg-emerald-600 border-b-2 border-slate-900 py-2">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white overflow-hidden">
            <Layout className="w-4 h-4 shrink-0" />
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest truncate">
              Workspace: <span className="text-emerald-100">{project?.title}</span>
            </span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             <Link to="/" className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-emerald-100 hover:text-white transition-colors underline decoration-2">
               Global Checklists
             </Link>
             <Link to="/todos" className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-emerald-100 hover:text-white transition-colors underline decoration-2">
               Global Todos
             </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Breadcrumb / Back */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-900 px-0">
            <ChevronLeft className="w-4 h-4 mr-1" /> All Project Hubs
          </Button>
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-slate-200 text-slate-400 text-[10px] font-black uppercase">
            Scoped View Only
          </div>
        </div>

        {/* Project Header */}
        <div className="relative p-6 md:p-10 rounded-3xl bg-white border-2 border-slate-900 shadow-bento overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-5">
             <Layout className="w-48 h-48" />
           </div>
           <div className="relative z-10 space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border-2 border-emerald-600 text-emerald-600 font-black uppercase text-[10px] tracking-widest">
               Active Cluster <Layout className="w-3 h-3" />
             </div>
             <div>
               <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-slate-900">{project?.title}</h1>
               <p className="max-w-2xl text-slate-500 font-medium italic mt-2">{project?.description}</p>
             </div>
             <div className="flex items-center gap-6 pt-4 border-t-2 border-slate-50">
               <div className="flex flex-col">
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Memberships</span>
                 <span className="text-xl font-black text-slate-900">Group Owner (You)</span>
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Linked Assets</span>
                 <span className="text-xl font-black text-slate-900">{checklists.length} Checklists · {todos.length} Todos</span>
               </div>
               <div className="flex-1" />
               <div className="flex flex-wrap gap-3">
                 <Button onClick={() => setIsShareDialogOpen(true)} className="bento-button bg-slate-900 text-white h-12 px-6">
                   <Share2 className="w-4 h-4 mr-2" /> Share Project
                 </Button>
                 <Button onClick={handlePromptDeleteProject} variant="outline" className="bento-button border-2 border-rose-600 text-rose-600 hover:bg-rose-600 hover:text-white h-12 px-6">
                   <Trash2 className="w-4 h-4 mr-2" /> Dissolve
                 </Button>
               </div>
             </div>
           </div>
        </div>

        {/* Share Modal */}
        {id && (
          <ShareModal
            isOpen={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
            entityType="project"
            entityId={id}
            initialConfig={shareConfig}
            projectContext={{
              checklistsCount: checklists.length,
              todosCount: todos.length
            }}
          />
        )}

        {/* Assets Tabs */}
        <Tabs defaultValue="checklists" className="w-full" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <TabsList className="bg-slate-100 p-1 rounded-2xl border-2 border-slate-900">
              <TabsTrigger value="checklists" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                <ListChecks className="w-4 h-4" /> Checklists
              </TabsTrigger>
              <TabsTrigger value="todos" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                <CheckSquare className="w-4 h-4" /> Operations
              </TabsTrigger>
            </TabsList>

            {activeTab === 'checklists' ? (
               <Button onClick={() => setIsChecklistDialogOpen(true)} className="bento-button bg-emerald-600 text-white font-black uppercase text-xs h-12 px-6">
                 <Plus className="w-4 h-4 mr-2" /> Add Checklist
               </Button>
            ) : (
               <div className="flex gap-2">
                 <Button 
                   variant="outline" 
                   onClick={() => {
                     if (todos.length === 0) {
                       toast.error('Nothing to copy');
                       return;
                     }
                     const md = generateMarkdown(todos);
                     navigator.clipboard.writeText(md);
                     toast.success('Operations copied as Markdown');
                   }} 
                   className="bento-button bg-white text-slate-900 border-2 border-slate-900 font-black uppercase text-xs h-12 px-4 shadow-bento hover:bg-slate-50 transition-colors"
                 >
                   <Copy className="w-4 h-4 mr-2" /> Copy MD
                 </Button>
                 <Button onClick={() => setIsTodoDialogOpen(true)} className="bento-button bg-emerald-600 text-white font-black uppercase text-xs h-12 px-6">
                   <Plus className="w-4 h-4 mr-2" /> New Task
                 </Button>
               </div>
            )}
          </div>

          <TabsContent value="checklists" className="mt-0 outline-none">
            {checklists.length === 0 ? (
              <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-slate-900">
                  <ListChecks className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <p className="font-black uppercase tracking-tight text-slate-400">Empty Linked Stack</p>
                  <p className="text-xs text-slate-400 font-medium">No checklists have been associated with this project cluster yet.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence>
                  {checklists.map((list) => (
                    <motion.div
                       key={list.id}
                       initial={{ opacity: 0, scale: 0.98 }}
                       animate={{ opacity: 1, scale: 1 }}
                       exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <Card className="bento-card group hover:-translate-y-1 transition-all cursor-pointer" onClick={() => navigate(`/checklist/${list.id}`)}>
                        <CardHeader className="p-6">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border-2 border-slate-900 bg-indigo-600 text-white">
                                {list.status}
                              </span>
                              <CardTitle className="text-xl font-black uppercase tracking-tight line-clamp-1 group-hover:text-indigo-600 transition-colors">{list.title}</CardTitle>
                            </div>
                            <Button variant="ghost" size="icon" className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleDeleteChecklistClick(e, list.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                          <p className="text-slate-500 text-xs line-clamp-2 min-h-[32px] mb-4">
                            {list.description || 'No description provided.'}
                          </p>
                        </CardContent>
                        <CardFooter className="bg-slate-50 p-4 border-t-2 border-slate-900 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            {list.updatedAt?.toDate ? list.updatedAt.toDate().toLocaleDateString() : 'Updated'}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 underline">Enter Protocol</span>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="todos" className="mt-0 outline-none">
            <div className="space-y-4">
              {todos.length === 0 ? (
                <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-slate-900">
                    <CheckSquare className="w-8 h-8 text-slate-200" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-black uppercase tracking-tight text-slate-400">No Operations Logged</p>
                    <p className="text-xs text-slate-400 font-medium">This cluster currently has no operational tasks recorded.</p>
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {todos.map(todo => (
                    <TodoItem 
                      key={todo.id}
                      todo={todo}
                      onToggle={() => handleToggleTodo(todo.id, { isDone: !todo.isDone })}
                      onUpdate={(updates) => handleToggleTodo(todo.id, updates)}
                      onDelete={() => handleDeleteTodoClick(todo.id)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Checklist Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Checklist to Project</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest text-center mt-1">
              Cluster: {project?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChecklist} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Title</Label>
              <Input 
                placeholder="Name your checklist..." 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'LINKING...' : 'ADD TO CLUSTER'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Todo Dialog */}
      <Dialog open={isTodoDialogOpen} onOpenChange={setIsTodoDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Task to Project</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest text-center mt-1">
              Cluster: {project?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTodo} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Task Definition</Label>
              <Input 
                placeholder="What needs to be done?" 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'LOGGING...' : 'LOG OPERATIONAL TASK'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={!!deleteType && !!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteType(null);
            setDeleteTargetId(null);
          }
        }}
        title={`Delete ${deleteType === 'project' ? 'Project' : deleteType === 'checklist' ? 'Checklist' : 'Task'}?`}
        description={
          deleteType === 'project'
            ? 'Are you sure you want to dissolve this project? Checklists and tasks will lose their project association.'
            : deleteType === 'checklist'
            ? 'Are you sure you want to delete this checklist? All items and attachments will be permanently removed.'
            : 'Are you sure you want to delete this task?'
        }
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
