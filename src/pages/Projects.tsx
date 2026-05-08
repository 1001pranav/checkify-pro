import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToProjects, 
  createProject, 
  deleteProject 
} from '@/src/services/db';
import { Project } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Layout, 
  Clock,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from '@/src/components/Navbar';
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

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToProjects(user.uid, (data) => {
      setProjects(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    
    setCreateLoading(true);
    try {
      const docRef = await createProject(user.uid, newTitle.trim(), newDesc.trim());
      setNewTitle('');
      setNewDesc('');
      setIsCreateOpen(false); // Close dialog first
      toast.success('Project created successfully');
      
      // small delay to ensure dialog closure is handled before navigation
      setTimeout(() => {
        if (docRef?.id) navigate(`/project/${docRef.id}`);
      }, 100);
    } catch (err) {
      console.error("Create error:", err);
      toast.error('Initialization failed: ' + (err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure? This will remove the group but keep associated checklists and todos as independent items.')) {
      try {
        await deleteProject(id);
        toast.success('Project removed');
      } catch (err) {
        console.error("Delete error:", err);
        toast.error('Failed to remove project: ' + (err as Error).message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <Navbar />
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 border-slate-900 shadow-bento overflow-hidden">
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-black tracking-tight uppercase truncate">Project <span className="text-emerald-600">Hub</span></h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium truncate">Organize your related checklists and todos into thematic groups.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <Button onClick={() => setIsCreateOpen(true)} className="bento-button bg-emerald-600 text-white h-10 md:h-11 px-4 md:px-6 text-xs md:text-sm flex-1 md:flex-none">
                <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" /> New Project
              </Button>
              <DialogContent className="bento-card max-w-md p-6">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Project Cluster</DialogTitle>
                  <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                    Create a workspace for grouped tasks
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Project Name</Label>
                    <Input 
                      placeholder="e.g., Q3 Expansion Phase" 
                      className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Context / Description</Label>
                    <Input 
                      placeholder="Briefly describe the project goals..." 
                      className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={createLoading}>
                      {createLoading ? 'CREATING...' : 'ESTABLISH PROJECT'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-slate-200 animate-pulse rounded-3xl border-2 border-slate-900 shadow-bento" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bento-card border-dashed">
            <Layout className="w-16 h-16 mb-4 opacity-10" />
            <p className="font-bold uppercase tracking-widest text-slate-400">No projects established</p>
            <Button variant="link" onClick={() => setIsCreateOpen(true)} className="text-emerald-600 font-black">Build your first project cluster</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {projects.map((project) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProjectCard 
                    project={project} 
                    onDelete={(e) => handleDelete(e, project.id)}
                    onClick={() => navigate(`/project/${project.id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onDelete, onClick }: { 
  project: Project, 
  onDelete: (e: React.MouseEvent) => void, 
  onClick: () => void
}) {
  return (
    <Card 
      className="bento-card group hover:-translate-y-1 transition-all duration-300 cursor-pointer w-full overflow-hidden shrink-0" 
      onClick={onClick}
    >
      <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center mb-1">
              <span className="px-2 py-0.5 rounded text-[8px] md:text-[9px] font-black uppercase border-2 border-slate-900 bg-emerald-600 text-white">
                Project Cluster
              </span>
            </div>
            <CardTitle className="text-lg md:text-xl font-black uppercase tracking-tight group-hover:text-emerald-600 transition-colors line-clamp-1 break-words">{project.title}</CardTitle>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-50 border-2 border-slate-900 rounded-xl shrink-0">
            <Layout className="w-4 h-4 md:w-5 md:h-5 text-emerald-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <p className="text-slate-500 text-[11px] md:text-xs line-clamp-2 min-h-[32px] mb-4 font-medium italic">
          {project.description || 'General organizational bucket for tasks.'}
        </p>
        <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          Established {project.createdAt?.toDate ? project.createdAt.toDate().toLocaleDateString() : 'recently'}
        </div>
      </CardContent>
      <CardFooter className="bg-slate-50 border-t-2 border-slate-900 flex justify-between p-3 md:p-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-[9px] md:text-[10px] font-black uppercase gap-1 text-destructive hover:text-white hover:bg-destructive rounded-lg"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Group
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[9px] md:text-[10px] font-black uppercase border-2 border-slate-900 rounded-lg group-hover:bg-slate-900 group-hover:text-white transition-colors">
          Access Cluster <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}
