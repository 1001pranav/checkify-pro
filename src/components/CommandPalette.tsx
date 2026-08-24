import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToChecklists, 
  subscribeToProjects, 
  subscribeToTodos 
} from '@/src/services/db';
import { Checklist, Project, Todo } from '@/src/types';
import { 
  Search, 
  CheckSquare, 
  Folder, 
  ListChecks, 
  Plus, 
  AlertTriangle, 
  ArrowRight, 
  Keyboard, 
  Compass,
  CheckCircle2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCreateChecklist?: () => void;
  onOpenCreateProject?: () => void;
  onOpenCreateTodo?: () => void;
  onOpenShortcuts?: () => void;
}

type ItemType = 'action' | 'checklist' | 'project' | 'todo';

interface PaletteItem {
  id: string;
  type: ItemType;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeType?: 'pass' | 'fail' | 'pending' | 'urgent' | 'site' | 'neutral';
  shortcut?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string;
}

export default function CommandPalette({
  open,
  onOpenChange,
  onOpenCreateChecklist,
  onOpenCreateProject,
  onOpenCreateTodo,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'checklists' | 'projects' | 'todos' | 'actions'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to workspace data when opened or user logs in
  useEffect(() => {
    if (!user || !open) return;

    const unsubLists = subscribeToChecklists(user.uid, (data) => {
      setChecklists(data);
    }, undefined);

    const unsubProjects = subscribeToProjects(user.uid, (data) => {
      setProjects(data);
    });

    const unsubTodos = subscribeToTodos(user.uid, (data) => {
      setTodos(data);
    }, null);

    return () => {
      unsubLists();
      unsubProjects();
      unsubTodos();
    };
  }, [user, open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Build Project lookup map
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => map.set(p.id, p.title));
    return map;
  }, [projects]);

  // Build all searchable palette items
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // --- QUICK ACTIONS ---
    items.push({
      id: 'action-new-checklist',
      type: 'action',
      title: 'Initialize Inspection Checklist',
      subtitle: 'Create a new multi-step verification ledger',
      badge: 'ACTION',
      badgeType: 'neutral',
      shortcut: 'N',
      icon: <Plus className="w-4 h-4 text-slate-900" />,
      onSelect: () => {
        onOpenChange(false);
        if (onOpenCreateChecklist) onOpenCreateChecklist();
        else navigate('/?create=true');
      },
      keywords: 'new create checklist audit inspection add'
    });

    items.push({
      id: 'action-new-project',
      type: 'action',
      title: 'Establish Project / Site Cluster',
      subtitle: 'Group related audits by site location or project phase',
      badge: 'ACTION',
      badgeType: 'neutral',
      shortcut: 'P',
      icon: <Folder className="w-4 h-4 text-slate-900" />,
      onSelect: () => {
        onOpenChange(false);
        if (onOpenCreateProject) onOpenCreateProject();
        else navigate('/projects?create=true');
      },
      keywords: 'new create project site group cluster add'
    });

    items.push({
      id: 'action-new-todo',
      type: 'action',
      title: 'Capture Action Item / Punch Defect',
      subtitle: 'Record an unassigned field finding into the backlog',
      badge: 'ACTION',
      badgeType: 'neutral',
      shortcut: 'T',
      icon: <CheckSquare className="w-4 h-4 text-slate-900" />,
      onSelect: () => {
        onOpenChange(false);
        if (onOpenCreateTodo) onOpenCreateTodo();
        else navigate('/todos');
      },
      keywords: 'new capture punch todo defect task add'
    });

    items.push({
      id: 'action-view-exceptions',
      type: 'action',
      title: 'Open Cross-Project Exception Queue',
      subtitle: 'Review overdue SLAs and dormant inspection manifests',
      badge: 'SLA ALERT',
      badgeType: 'urgent',
      shortcut: 'E',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
      onSelect: () => {
        onOpenChange(false);
        navigate('/?tab=exceptions');
      },
      keywords: 'exceptions overdue stale sla alert queue review'
    });

    items.push({
      id: 'action-nav-ledger',
      type: 'action',
      title: 'Go to Operational Manifests Ledger',
      subtitle: 'All active, completed, and pinned inspection checklists',
      badge: 'NAVIGATE',
      badgeType: 'neutral',
      shortcut: 'G L',
      icon: <ListChecks className="w-4 h-4 text-slate-700" />,
      onSelect: () => {
        onOpenChange(false);
        navigate('/');
      },
      keywords: 'manifests checklists dashboard home ledger audit'
    });

    items.push({
      id: 'action-nav-projects',
      type: 'action',
      title: 'Go to Project Sites & Clusters',
      subtitle: 'Manage facility locations, stages, and project clusters',
      badge: 'NAVIGATE',
      badgeType: 'neutral',
      shortcut: 'G P',
      icon: <Folder className="w-4 h-4 text-slate-700" />,
      onSelect: () => {
        onOpenChange(false);
        navigate('/projects');
      },
      keywords: 'sites projects facilities workspace clusters'
    });

    items.push({
      id: 'action-nav-todos',
      type: 'action',
      title: 'Go to Action Queue & Backlog',
      subtitle: 'Punch list triage, stray defects, and markdown imports',
      badge: 'NAVIGATE',
      badgeType: 'neutral',
      shortcut: 'G T',
      icon: <CheckSquare className="w-4 h-4 text-slate-700" />,
      onSelect: () => {
        onOpenChange(false);
        navigate('/todos');
      },
      keywords: 'todos tasks backlog defects triage markdown'
    });

    if (onOpenShortcuts) {
      items.push({
        id: 'action-shortcuts',
        type: 'action',
        title: 'Keyboard Shortcuts Reference',
        subtitle: 'View all keyboard shortcuts and speed keys',
        badge: 'HELP',
        badgeType: 'neutral',
        shortcut: '?',
        icon: <Keyboard className="w-4 h-4 text-slate-700" />,
        onSelect: () => {
          onOpenChange(false);
          onOpenShortcuts();
        },
        keywords: 'shortcuts hotkeys keyboard help keys'
      });
    }

    // --- CHECKLISTS ---
    checklists.forEach((c) => {
      const projName = c.projectId ? projectMap.get(c.projectId) : undefined;
      const isOverdue = c.dueDate && new Date(c.dueDate) < new Date();
      let badgeType: 'pass' | 'fail' | 'pending' | 'urgent' | 'neutral' = 'neutral';
      let badgeText = c.status.toUpperCase();

      if (c.status === 'completed') {
        badgeType = 'pass';
        badgeText = 'COMPLETED';
      } else if (isOverdue) {
        badgeType = 'urgent';
        badgeText = 'OVERDUE SLA';
      } else if (c.status === 'active') {
        badgeType = 'pending';
        badgeText = c.category ? c.category.toUpperCase() : 'ACTIVE';
      }

      items.push({
        id: `checklist-${c.id}`,
        type: 'checklist',
        title: c.title,
        subtitle: projName ? `📁 ${projName} • ${c.description || 'Inspection manifest'}` : c.description || 'Inspection manifest',
        badge: badgeText,
        badgeType: badgeType,
        icon: <ListChecks className="w-4 h-4 text-slate-800" />,
        onSelect: () => {
          onOpenChange(false);
          navigate(`/checklist/${c.id}`);
        },
        keywords: `${c.title} ${c.description || ''} ${c.category || ''} ${projName || ''} checklist inspection`
      });
    });

    // --- PROJECTS ---
    projects.forEach((p) => {
      items.push({
        id: `project-${p.id}`,
        type: 'project',
        title: p.title,
        subtitle: p.description || 'Project site cluster',
        badge: 'SITE',
        badgeType: 'site',
        icon: <Folder className="w-4 h-4 text-slate-800" />,
        onSelect: () => {
          onOpenChange(false);
          navigate(`/project/${p.id}`);
        },
        keywords: `${p.title} ${p.description || ''} project site location`
      });
    });

    // --- TODOS / PUNCH ITEMS ---
    todos.forEach((t) => {
      items.push({
        id: `todo-${t.id}`,
        type: 'todo',
        title: t.title,
        subtitle: t.note ? `Note: ${t.note}` : `Priority: ${t.priority.toUpperCase()} • ${t.category || 'Operations'}`,
        badge: t.isDone ? 'DONE' : t.priority.toUpperCase(),
        badgeType: t.isDone ? 'pass' : t.priority === 'urgent' ? 'urgent' : 'pending',
        icon: t.isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <CheckSquare className="w-4 h-4 text-slate-700" />,
        onSelect: () => {
          onOpenChange(false);
          navigate('/todos');
        },
        keywords: `${t.title} ${t.note || ''} ${t.category || ''} ${t.priority} todo task defect`
      });
    });

    return items;
  }, [checklists, projects, todos, projectMap, onOpenChange, onOpenCreateChecklist, onOpenCreateProject, onOpenCreateTodo, onOpenShortcuts, navigate]);

  // Filter items based on user search query and active filter chip
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allItems.filter(item => {
      // Filter by category tab
      if (selectedFilter === 'checklists' && item.type !== 'checklist') return false;
      if (selectedFilter === 'projects' && item.type !== 'project') return false;
      if (selectedFilter === 'todos' && item.type !== 'todo') return false;
      if (selectedFilter === 'actions' && item.type !== 'action') return false;

      // Filter by search query
      if (!q) return true;
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.toLowerCase().includes(q);
      const matchBadge = item.badge?.toLowerCase().includes(q);

      return matchTitle || matchSubtitle || matchKeywords || matchBadge;
    });
  }, [allItems, query, selectedFilter]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedFilter]);

  // Keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems.length > 0 && filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={() => onOpenChange(false)} 
        aria-hidden="true" 
      />

      <div 
        className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-300 shadow-2xl overflow-hidden z-10 animate-cmdk flex flex-col max-h-[80vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 gap-3 bg-slate-50/70">
          <Search className="w-5 h-5 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, jump to a checklist, project site, or defect..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm md:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] font-bold text-slate-600 bg-white border border-slate-300 px-2 py-0.5 rounded shadow-2xs">
            ESC to close
          </span>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-mono font-bold uppercase text-slate-600 mr-1 shrink-0">
            Scope:
          </span>
          {(['all', 'actions', 'checklists', 'projects', 'todos'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSelectedFilter(filter)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase transition-colors shrink-0",
                selectedFilter === filter
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {filter === 'todos' ? 'Backlog Items' : filter}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div 
          ref={listRef} 
          className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100/60 max-h-[50vh]"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Compass className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-800">No matching manifests or actions found</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto font-medium">
                Try searching with another keyword, category, or clear the scope filter.
              </p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={index}
                  onClick={() => item.onSelect()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all gap-3 select-none",
                    isSelected 
                      ? "bg-slate-900 text-white shadow-xs" 
                      : "text-slate-900 hover:bg-slate-100"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
                      isSelected 
                        ? "bg-slate-800 border-slate-700 text-white" 
                        : "bg-slate-100 border-slate-200 text-slate-700"
                    )}>
                      {item.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "font-bold text-xs sm:text-sm truncate",
                          isSelected ? "text-white" : "text-slate-900"
                        )}>
                          {item.title}
                        </span>

                        {item.badge && (
                          <span className={cn(
                            "px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase border shrink-0",
                            isSelected
                              ? "bg-slate-800 text-slate-200 border-slate-700"
                              : item.badgeType === 'pass'
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : item.badgeType === 'urgent'
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : item.badgeType === 'site'
                              ? "bg-slate-100 text-slate-800 border-slate-300"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </div>

                      {item.subtitle && (
                        <p className={cn(
                          "text-[11px] truncate mt-0.5 font-medium",
                          isSelected ? "text-slate-300" : "text-slate-500"
                        )}>
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <span className={cn(
                        "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border",
                        isSelected 
                          ? "bg-slate-800 text-slate-200 border-slate-700" 
                          : "bg-white text-slate-600 border-slate-200"
                      )}>
                        {item.shortcut}
                      </span>
                    )}

                    <ArrowRight className={cn(
                      "w-4 h-4 transition-transform",
                      isSelected ? "text-white translate-x-0.5" : "text-slate-400"
                    )} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.2 bg-white border border-slate-300 rounded font-bold text-slate-800">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.2 bg-white border border-slate-300 rounded font-bold text-slate-800">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.2 bg-white border border-slate-300 rounded font-bold text-slate-800">ESC</kbd> Close
            </span>
          </div>

          <span className="font-bold text-slate-700">
            {filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
