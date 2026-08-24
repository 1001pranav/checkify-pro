import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToChecklists, 
  createChecklist, 
  updateChecklist, 
  deleteChecklist, 
  copyChecklist, 
  getProjects 
} from '@/src/services/db';
import { Checklist, ChecklistStatus, Project } from '@/src/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Plus, 
  Archive, 
  Trash2, 
  Package, 
  Clock, 
  Pin, 
  Search, 
  Copy, 
  LayoutGrid, 
  ListFilter, 
  AlertTriangle,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

const CATEGORIES = ['General', 'Operations', 'Quality Assurance', 'Safety & Audit', 'Engineering', 'Field Inspection'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // All checklists across user's workspace (including in projects)
  const [allChecklists, setAllChecklists] = useState<Checklist[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'exceptions' | 'active' | 'completed' | 'archived'>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'exceptions') return 'exceptions';
    if (tabParam === 'active') return 'active';
    if (tabParam === 'completed') return 'completed';
    if (tabParam === 'archived') return 'archived';
    return 'all';
  });
  const [loading, setLoading] = useState(true);

  // Creation modal
  const [isCreateOpen, setIsCreateOpen] = useState(() => searchParams.get('create') === 'true');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Operations');
  const [newDueDate, setNewDueDate] = useState('');
  const [newProjectId, setNewProjectId] = useState<string>('none');
  const [createLoading, setCreateLoading] = useState(false);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Deletion state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load all user checklists (pass undefined to get cross-project lists)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToChecklists(user.uid, (data) => {
      setAllChecklists(data);
      setLoading(false);
    }, undefined);

    getProjects(user.uid).then(p => {
      if (p) setProjects(p);
    });

    return unsubscribe;
  }, [user]);

  // Project map lookup for quick naming
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => map.set(p.id, p.title));
    return map;
  }, [projects]);

  // Evaluate Overdue and Stale Exceptions (Fixes Task B: Ops Manager < 5s discovery)
  const exceptionItems = useMemo(() => {
    const now = new Date();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    return allChecklists
      .filter(c => c.status === 'active')
      .map(c => {
        let isOverdue = false;
        let isStale = false;
        let daysOverdue = 0;
        let daysStale = 0;

        // Check explicit dueDate
        if (c.dueDate) {
          const due = new Date(c.dueDate);
          if (!isNaN(due.getTime()) && due < now) {
            isOverdue = true;
            daysOverdue = Math.max(1, Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)));
          }
        }

        // Check stale inactivity (>7 days without update)
        if (c.updatedAt?.toMillis) {
          const lastUpdated = c.updatedAt.toMillis();
          if (now.getTime() - lastUpdated > SEVEN_DAYS_MS) {
            isStale = true;
            daysStale = Math.floor((now.getTime() - lastUpdated) / (24 * 60 * 60 * 1000));
          }
        }

        return {
          checklist: c,
          isOverdue,
          isStale,
          daysOverdue,
          daysStale,
          projectName: c.projectId ? projectMap.get(c.projectId) || 'Project' : 'Standalone'
        };
      })
      .filter(item => item.isOverdue || item.isStale);
  }, [allChecklists, projectMap]);

  // Keyboard navigation & global triggers
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
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setActiveTab('exceptions');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    
    setCreateLoading(true);
    try {
      const targetProj = newProjectId === 'none' ? null : newProjectId;
      const position = allChecklists.length > 0 ? Math.max(...allChecklists.map(c => c.position || 0)) + 1 : 0;
      const docRef = await createChecklist(user.uid, newTitle.trim(), newDesc.trim(), position, targetProj);
      
      if (docRef) {
        await updateChecklist(docRef.id, { 
          category: newCategory,
          dueDate: newDueDate ? newDueDate : null
        });
      }
      toast.success('Inspection checklist initialized');
      setNewTitle('');
      setNewDesc('');
      setNewDueDate('');
      setNewCategory('Operations');
      setNewProjectId('none');
      setIsCreateOpen(false);
      if (docRef) navigate(`/checklist/${docRef.id}`);
    } catch (err: unknown) {
      toast.error('Initialization failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, list: Checklist) => {
    e.stopPropagation();
    try {
      const newPinned = !list.isPinned;
      await updateChecklist(list.id, { isPinned: newPinned });
      toast.success(newPinned ? 'Pinned to top of ledger' : 'Unpinned');
    } catch {
      toast.error('Failed to update pin status');
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, list: Checklist) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const newTitle = `${list.title} (Copy)`;
      const docRef = await copyChecklist(list.id, newTitle, list.projectId || null, user.uid);
      if (docRef) {
        toast.success('Checklist duplicated successfully');
      }
    } catch {
      toast.error('Failed to duplicate checklist');
    }
  };

  const handleArchive = async (list: Checklist) => {
    const newStatus: ChecklistStatus = list.status === 'archived' ? 'active' : 'archived';
    await updateChecklist(list.id, { status: newStatus });
    toast.success(newStatus === 'archived' ? 'Checklist moved to archive' : 'Checklist restored');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleteLoading(true);
    try {
      await deleteChecklist(deleteTargetId);
      toast.success('Checklist permanently deleted');
    } catch (err: unknown) {
      toast.error('Failed to delete: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDeleteLoading(false);
      setDeleteTargetId(null);
    }
  };

  // Stats computation
  const stats = useMemo(() => {
    const total = allChecklists.filter(c => c.status !== 'archived').length;
    const active = allChecklists.filter(c => c.status === 'active').length;
    const completed = allChecklists.filter(c => c.status === 'completed').length;
    const exceptions = exceptionItems.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, active, completed, exceptions, rate };
  }, [allChecklists, exceptionItems]);

  // Filter based on active view and search
  const filteredLists = useMemo(() => {
    return allChecklists
      .filter(list => {
        if (activeTab === 'exceptions') {
          return exceptionItems.some(ex => ex.checklist.id === list.id);
        }
        if (activeTab === 'all' && list.status === 'archived') return false; 
        if (activeTab === 'active' && list.status !== 'active') return false;
        if (activeTab === 'completed' && list.status !== 'completed') return false;
        if (activeTab === 'archived' && list.status !== 'archived') return false;

        if (pinnedOnly && !list.isPinned) return false;
        if (selectedCategory !== 'all' && list.category !== selectedCategory) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = list.title.toLowerCase().includes(q);
          const matchesDesc = list.description?.toLowerCase().includes(q);
          const matchesCat = list.category?.toLowerCase().includes(q);
          const projName = list.projectId ? projectMap.get(list.projectId)?.toLowerCase() : '';
          if (!matchesTitle && !matchesDesc && !matchesCat && !projName?.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const posA = a.position ?? 0;
        const posB = b.position ?? 0;
        if (posA !== posB) return posA - posB;
        return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      });
  }, [allChecklists, activeTab, exceptionItems, pinnedOnly, selectedCategory, searchQuery, projectMap]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto p-3 sm:p-6 md:p-8 space-y-6">
        {/* Ops Command Bar */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">
                AUDIT & INSPECTION LEDGER
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Operational Manifests
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Real-time multi-project inspection tracking, SLA enforcement, and verification proofs.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>New Checklist (N)</span>
            </button>
          </div>
        </div>

        {/* Global Exception Queue Rail */}
        {exceptionItems.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-mono font-bold shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-xs sm:text-sm font-bold text-amber-950 uppercase tracking-wider">
                      Cross-Project Exception Queue ({exceptionItems.length})
                    </h2>
                    <span className="px-1.5 py-0.2 font-mono text-[10px] font-bold bg-amber-200 text-amber-900 rounded">
                      Action Required
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/80">
                    Inspections with expired SLAs or no audit activity in over 7 days across all projects.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('exceptions')}
                  className="px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-lg font-mono text-xs font-bold transition-colors shrink-0"
                >
                  View All Exceptions
                </button>
              </div>
            </div>

            {/* Quick Exception Strip (Top 3 immediate items) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {exceptionItems.slice(0, 3).map(({ checklist, isOverdue, daysOverdue, daysStale, projectName }) => (
                <div
                  key={checklist.id}
                  onClick={() => navigate(`/checklist/${checklist.id}`)}
                  className="p-3 bg-white rounded-xl border border-amber-200 hover:border-amber-400 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-slate-500 font-bold uppercase block truncate">
                        {projectName}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {checklist.title}
                      </h4>
                    </div>
                    {isOverdue ? (
                      <span className="shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase rounded bg-red-100 text-red-900 border border-red-300">
                        {daysOverdue}d Overdue
                      </span>
                    ) : (
                      <span className="shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-800 border border-slate-300">
                        {daysStale}d Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-600">
                    <span>Jump to Audit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab & Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div 
            onClick={() => setActiveTab('all')}
            className={cn(
              "p-3.5 rounded-xl border cursor-pointer transition-all bg-white",
              activeTab === 'all' ? "border-slate-900 ring-1 ring-slate-900 shadow-xs" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="text-[10px] font-mono font-bold uppercase text-slate-500">Total Checklists</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.total}</div>
          </div>

          <div 
            onClick={() => setActiveTab('active')}
            className={cn(
              "p-3.5 rounded-xl border cursor-pointer transition-all bg-white",
              activeTab === 'active' ? "border-slate-900 ring-1 ring-slate-900 shadow-xs" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="text-[10px] font-mono font-bold uppercase text-slate-500">In Progress</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.active}</div>
          </div>

          <div 
            onClick={() => setActiveTab('exceptions')}
            className={cn(
              "p-3.5 rounded-xl border cursor-pointer transition-all bg-white",
              activeTab === 'exceptions' ? "border-amber-600 ring-1 ring-amber-600 shadow-xs" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="text-[10px] font-mono font-bold uppercase text-amber-800">Exceptions (SLA/Stale)</div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{stats.exceptions}</div>
          </div>

          <div 
            onClick={() => setActiveTab('completed')}
            className={cn(
              "p-3.5 rounded-xl border cursor-pointer transition-all bg-white",
              activeTab === 'completed' ? "border-slate-900 ring-1 ring-slate-900 shadow-xs" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="text-[10px] font-mono font-bold uppercase text-emerald-800">Audit Completion</div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{stats.rate}%</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              ref={searchInputRef}
              placeholder="Search across all checklists by title, scope, or project... (/)"
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

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setPinnedOnly(!pinnedOnly)}
              className={cn(
                "h-10 px-3 rounded-lg border text-xs font-mono font-bold transition-all shrink-0 flex items-center gap-1.5",
                pinnedOnly 
                  ? "bg-amber-100 text-amber-900 border-amber-400" 
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
              )}
            >
              <Pin className="w-3.5 h-3.5 fill-current" />
              <span>Pinned</span>
            </button>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 border border-slate-300 rounded-lg text-xs font-mono font-bold px-3 bg-white text-slate-800 cursor-pointer focus:outline-none shrink-0"
            >
              <option value="all">ALL CATEGORIES</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.toUpperCase()}</option>
              ))}
            </select>

            <div className="flex border border-slate-300 rounded-lg overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-2.5 transition-colors",
                  viewMode === 'grid' ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                )}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-2.5 transition-colors",
                  viewMode === 'list' ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                )}
                title="List View"
              >
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Ledger Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-44 bg-slate-200 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="p-12 bg-white border border-dashed border-slate-300 rounded-2xl text-center space-y-3">
            <Package className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">Zero checklists match current filters</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Initialize an operational checklist or clear search filters to view your ledger.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
            >
              + Create Inspection Checklist
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
            {filteredLists.map((list) => {
              const projName = list.projectId ? projectMap.get(list.projectId) : null;
              const isOverdue = list.dueDate && new Date(list.dueDate) < new Date();

              return (
                <div
                  key={list.id}
                  onClick={() => navigate(`/checklist/${list.id}`)}
                  className={cn(
                    "bg-white border rounded-xl p-4 cursor-pointer transition-all hover:border-slate-400 relative group flex flex-col justify-between",
                    list.isPinned ? "border-amber-300 bg-amber-50/20 shadow-2xs" : "border-slate-200 shadow-2xs",
                    viewMode === 'list' && "md:flex-row md:items-center"
                  )}
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border",
                        list.status === 'active' && "bg-slate-100 text-slate-800 border-slate-300",
                        list.status === 'completed' && "bg-emerald-100 text-emerald-900 border-emerald-300",
                        list.status === 'archived' && "bg-slate-100 text-slate-500 border-slate-200"
                      )}>
                        {list.status}
                      </span>

                      {projName && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[140px]">
                          📁 {projName}
                        </span>
                      )}

                      {list.category && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {list.category}
                        </span>
                      )}

                      {list.dueDate && (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border flex items-center gap-1",
                          isOverdue 
                            ? "bg-red-100 text-red-900 border-red-300" 
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        )}>
                          <Clock className="w-2.5 h-2.5" />
                          SLA: {list.dueDate}
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1">
                        {list.title}
                      </h3>
                      {list.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                          {list.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={cn("flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100", viewMode === 'list' && "md:mt-0 md:pt-0 md:border-t-0")}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleTogglePin(e, list)}
                        className={cn(
                          "p-1.5 rounded-lg border text-xs transition-colors",
                          list.isPinned ? "bg-amber-100 text-amber-900 border-amber-400" : "bg-white text-slate-400 border-slate-200 hover:text-slate-800"
                        )}
                        title={list.isPinned ? "Unpin" : "Pin to top"}
                      >
                        <Pin className="w-3.5 h-3.5 fill-current" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDuplicate(e, list)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-500 hover:text-slate-900 transition-colors"
                        title="Duplicate Checklist"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(list);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-500 hover:text-slate-900 transition-colors"
                        title={list.status === 'archived' ? 'Restore' : 'Archive'}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(list.id);
                        }}
                        className="p-1.5 rounded-lg border border-transparent hover:border-red-200 text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1">
                      Open <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Creation Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-300 rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Initialize Inspection Checklist
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set verification criteria, SLA deadlines, and project assignment.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Checklist Title</Label>
              <Input 
                placeholder="e.g. Substation Thermal Audit #14" 
                className="mt-1 border-slate-300 rounded-lg text-sm font-medium"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-mono font-bold uppercase text-slate-700">Category</Label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-1 w-full h-10 border border-slate-300 rounded-lg px-2 text-xs font-medium bg-white"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-mono font-bold uppercase text-slate-700">Project / Site</Label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="mt-1 w-full h-10 border border-slate-300 rounded-lg px-2 text-xs font-medium bg-white"
                >
                  <option value="none">Standalone (No Project)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">SLA Due Date (Optional)</Label>
              <Input 
                type="date"
                className="mt-1 border-slate-300 rounded-lg text-xs font-mono"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Audit Scope / Reference (Optional)</Label>
              <Input 
                placeholder="Reference standard (e.g. ISO-9001 / OSHA 1910)" 
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
                {createLoading ? 'INITIALIZING...' : 'DEPLOY CHECKLIST (Enter)'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteModal
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="Delete Checklist?"
        description="Are you sure you want to delete this checklist? All items and attachments will be permanently removed."
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
