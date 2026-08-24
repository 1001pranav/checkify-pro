import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToProjects, 
  createProject, 
  deleteProject 
} from '@/src/services/db';
import { Project } from '@/src/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Folder, 
  Clock,
  Search,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from '@/src/components/Navbar';
import { ConfirmDeleteModal } from '@/src/components/ConfirmDeleteModal';
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(() => searchParams.get('create') === 'true');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToProjects(user.uid, (data) => {
      setProjects(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  // Keyboard listeners: N to create, / to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (e.key === 'Escape') {
        if (isCreateOpen) setIsCreateOpen(false);
        else if (searchQuery) setSearchQuery('');
        else if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (isInput) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsCreateOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, searchQuery]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p => p.title.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
  }, [projects, searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    
    setCreateLoading(true);
    try {
      const docRef = await createProject(user.uid, newTitle.trim(), newDesc.trim());
      setNewTitle('');
      setNewDesc('');
      setIsCreateOpen(false);
      toast.success('Project site initialized');
      
      setTimeout(() => {
        if (docRef?.id) navigate(`/project/${docRef.id}`);
      }, 100);
    } catch (err: unknown) {
      toast.error('Initialization failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleteLoading(true);
    try {
      await deleteProject(deleteTargetId);
      toast.success('Project site removed');
    } catch (err: unknown) {
      toast.error('Failed to remove project: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDeleteLoading(false);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      <Navbar />
      
      <main className="max-w-7xl mx-auto p-3 sm:p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">
                PROJECT SITES & CLUSTERS
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Operational Sites
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Group multi-stage verification checklists, defect backlogs, and audit teams by project location.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>New Site (N)</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              ref={searchInputRef}
              placeholder="Search project sites and operational workspaces... (/)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 h-10 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-800 font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-44 bg-slate-200 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-12 bg-white border border-dashed border-slate-300 rounded-2xl text-center space-y-3">
            <Folder className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">
              {searchQuery ? 'No matching project sites found' : 'Zero project sites configured'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create an operational site to cluster audits, inspections, and defects under one roof.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
            >
              + Create Project Site
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-4 cursor-pointer transition-all shadow-2xs group flex flex-col justify-between"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">
                        SITE CLUSTER
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {project.createdAt?.toDate ? project.createdAt.toDate().toLocaleDateString() : 'Active'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-slate-700 transition-colors truncate">
                        {project.title}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {project.description || 'General operational manifest group.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button 
                      type="button" 
                      className="p-1.5 rounded-lg border border-transparent hover:border-red-200 text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTargetId(project.id);
                      }}
                      title="Remove Site"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1">
                      Access Site <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Creation Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-300 rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              New Project Site Cluster
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Establish a structured container for cross-checklist inspections.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Project / Site Name</Label>
              <Input 
                placeholder="e.g. North Substation Expansion Phase 2" 
                className="mt-1 border-slate-300 rounded-lg text-sm font-medium"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Site Scope / Location</Label>
              <Input 
                placeholder="Briefly define location or scope..." 
                className="mt-1 border-slate-300 rounded-lg text-xs font-medium"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button 
                type="submit" 
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs h-10 rounded-lg" 
                disabled={createLoading}
              >
                {createLoading ? 'INITIALIZING...' : 'ESTABLISH PROJECT SITE (Enter)'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="Remove Project Site?"
        description="Are you sure you want to remove this project site? Checklists and tasks will remain preserved as independent manifests."
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
