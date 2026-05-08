import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  getSharedProject,
  createChecklist,
  createTodo,
  updateTodo,
  deleteTodo,
  deleteChecklist
} from '@/src/services/db';
import { Project, Checklist, Todo, SharePermission } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Plus, 
  Layout, 
  ListChecks, 
  CheckSquare, 
  Trash2,
  AlertCircle,
  Shield,
  ExternalLink
} from 'lucide-react';
import { TodoItem } from '@/src/components/Todo/TodoItem';
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

export default function SharedProject() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [permission, setPermission] = useState<SharePermission>('view');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('checklists');

  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [itemLoading, setItemLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    
    const fetchSharedData = async () => {
      try {
        const data = await getSharedProject(token);
        if (data) {
          setProject(data.project);
          setChecklists(data.checklists);
          setTodos(data.todos);
          setPermission(data.permission);
          
          // Ensure guest is signed in if they need to edit
          if (!auth.currentUser && data.permission === 'edit') {
            await signInAnonymously(auth);
          }

          // Store token for sub-pages (e.g., ChecklistDetail)
          sessionStorage.setItem(`project_share_${data.project.id}`, token);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSharedData();
  }, [token]);

  const canEdit = permission === 'edit';

  const handleCreateChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !newTitle.trim() || !canEdit) return;
    
    setItemLoading(true);
    try {
      // Use project owner's userId ONLY as a fallback if auth failed (should be anonymous now)
      const creatorId = auth.currentUser?.uid || user?.uid || project.userId;
      const newList = await createChecklist(creatorId, newTitle.trim(), '', checklists.length, project.id, token);
      
      if (newList) {
        const listData: Checklist = {
          id: newList.id,
          userId: creatorId,
          projectId: project.id,
          title: newTitle.trim(),
          description: '',
          status: 'active',
          shareToken: token,
          position: checklists.length,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        setChecklists(prev => [...prev, listData]);
      }

      toast.success('Checklist added to project');
      setNewTitle('');
      setIsChecklistDialogOpen(false);
    } catch (err) {
      console.error('Create checklist error:', err);
      toast.error('Operation restricted or failed');
    } finally {
      setItemLoading(false);
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !newTitle.trim() || !canEdit) return;
    
    setItemLoading(true);
    try {
      const creatorId = auth.currentUser?.uid || user?.uid || project.userId;
      const newTodo = await createTodo(creatorId, newTitle.trim(), '', project.id, token);
      
      if (newTodo) {
        const todoData: Todo = {
          id: newTodo.id,
          userId: creatorId,
          projectId: project.id,
          title: newTitle.trim(),
          note: '',
          isDone: false,
          shareToken: token,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        setTodos(prev => [todoData, ...prev]);
      }

      toast.success('Todo added to project');
      setNewTitle('');
      setIsTodoDialogOpen(false);
    } catch (err) {
      console.error('Create todo error:', err);
      toast.error('Failed to add todo');
    } finally {
      setItemLoading(false);
    }
  };

  const handleToggleTodo = async (todoId: string, updates: Partial<Todo>) => {
    if (!canEdit) {
      toast.error('View-only access');
      return;
    }
    try {
      // Pass token for security rules validation
      await updateTodo(todoId, updates, token);
      setTodos(prev => prev.map(t => t.id === todoId ? { ...t, ...updates } : t));
    } catch (err) {
       console.error('Update todo error:', err);
       toast.error('Failed to update task');
    }
  };

  const handleDeleteTodo = async (tid: string) => {
    if (!canEdit) return;
    if (confirm('Delete this task?')) {
      try {
        await deleteTodo(tid);
        setTodos(prev => prev.filter(t => t.id !== tid));
        toast.success('Task removed');
      } catch (err) {
        console.error('Delete todo error:', err);
        toast.error('Delete failed');
      }
    }
  };

  const handleDeleteChecklist = async (e: React.MouseEvent, cid: string) => {
    e.stopPropagation();
    if (!canEdit) return;
    if (confirm('Delete this checklist?')) {
      try {
        await deleteChecklist(cid);
        setChecklists(prev => prev.filter(l => l.id !== cid));
        toast.success('Checklist deleted');
      } catch (err) {
        console.error('Delete checklist error:', err);
        toast.error('Delete failed');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-20">
        <div className="h-12 w-12 border-4 border-emerald-600 border-t-transparent animate-spin rounded-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-black uppercase text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 max-w-md mb-8">{error || 'This project link is no longer active.'}</p>
        <Button asChild className="bento-button bg-slate-900 text-white px-8">
          <Link to="/auth">Return to Portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b-2 border-slate-900 py-4 px-6 md:px-12 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl border-2 border-slate-900">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-slate-900">Collaborative Workspace</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> {permission === 'edit' ? 'Full Access' : 'Read Only'}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="h-9 border-2 border-slate-900 font-black uppercase text-[10px] rounded-xl hover:bg-slate-900 hover:text-white transition-all">
            <Link to="/auth">Sign In to Save <ExternalLink className="w-3 h-3 ml-2" /></Link>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Project Context */}
        <div className="p-8 md:p-12 rounded-3xl bg-white border-2 border-slate-900 shadow-bento overflow-hidden">
          <div className="space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border-2 border-indigo-600 text-indigo-600 font-black uppercase text-[10px] tracking-widest">
               External Project View
             </div>
             <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-slate-900">{project.title}</h1>
             <p className="max-w-2xl text-slate-500 font-medium italic">{project.description || 'Global workspace for shared task management.'}</p>
          </div>
        </div>

        <Tabs defaultValue="checklists" className="w-full" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-slate-100 p-1 rounded-2xl border-2 border-slate-900">
              <TabsTrigger value="checklists" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                <ListChecks className="w-4 h-4" /> Checklists
              </TabsTrigger>
              <TabsTrigger value="todos" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                <CheckSquare className="w-4 h-4" /> Todos
              </TabsTrigger>
            </TabsList>

            {canEdit && (
              activeTab === 'checklists' ? (
                <Button onClick={() => setIsChecklistDialogOpen(true)} className="bento-button bg-emerald-600 text-white font-black uppercase text-xs h-12 px-6">
                  <Plus className="w-4 h-4 mr-2" /> Add Checklist
                </Button>
              ) : (
                <Button onClick={() => setIsTodoDialogOpen(true)} className="bento-button bg-emerald-600 text-white font-black uppercase text-xs h-12 px-6">
                  <Plus className="w-4 h-4 mr-2" /> New Task
                </Button>
              )
            )}
          </div>

          <TabsContent value="checklists">
            {checklists.length === 0 ? (
              <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                 <p className="font-black uppercase text-slate-400">Empty Workspace</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {checklists.map(list => (
                  <Card key={list.id} className="bento-card group hover:-translate-y-1 transition-all" onClick={() => navigate(`/checklist/${list.id}`)}>
                    <CardHeader className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border-2 border-slate-900 bg-indigo-600 text-white">Project Protocol</span>
                          <CardTitle className="text-xl font-black uppercase tracking-tight truncate">{list.title}</CardTitle>
                        </div>
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive opacity-0 group-hover:opacity-100" 
                            onClick={(e) => handleDeleteChecklist(e, list.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0">
                       <p className="text-slate-500 text-xs line-clamp-2 italic mb-4">{list.description || 'No description'}</p>
                    </CardContent>
                    <CardFooter className="bg-slate-50 p-4 border-t-2 border-slate-900 flex justify-end">
                       {list.shareToken && (
                         <Button asChild variant="outline" className="h-8 border-2 border-slate-900 font-black uppercase text-[10px] rounded-lg">
                           <Link to={`/share/${list.shareToken}`}>
                             View Protocol <ExternalLink className="w-3 h-3 ml-2" />
                           </Link>
                         </Button>
                       )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="todos">
             <div className="space-y-4">
               {todos.map(todo => (
                 <TodoItem 
                   key={todo.id}
                   todo={todo}
                   onToggle={() => handleToggleTodo(todo.id, { isDone: !todo.isDone })}
                   onUpdate={(updates) => handleToggleTodo(todo.id, updates)}
                   onDelete={() => handleDeleteTodo(todo.id)}
                   readOnly={!canEdit}
                 />
               ))}
               {todos.length === 0 && <div className="text-center py-12 text-slate-400 font-black uppercase">No tasks available</div>}
             </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Checklist Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Project Checklist</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest text-center mt-1">
              Cluster: {project?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChecklist} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label>
              <Input 
                placeholder="Name your checklist..." 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'LINKING...' : 'ADD TO PROJECT'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Todo Dialog */}
      <Dialog open={isTodoDialogOpen} onOpenChange={setIsTodoDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Project Task</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest text-center mt-1">
              Cluster: {project?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTodo} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Task</Label>
              <Input 
                placeholder="What needs to be done?" 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'LOGGING...' : 'LOG TASK'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
