import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, LogOut, Layout, Keyboard, Search, Plus } from 'lucide-react';
import { auth } from '@/src/lib/firebase';
import { KeyboardShortcutsModal } from '@/src/components/KeyboardShortcutsModal';
import { QuickCreateModal } from '@/src/components/QuickCreateModal';
import CommandPalette from '@/src/components/CommandPalette';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const checklistMatch = location.pathname.match(/\/checklist\/([^/]+)/);
  const currentChecklistId = checklistMatch ? checklistMatch[1] : null;

  // Global Keyboard Listener for Cmd+K / Ctrl+K and N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      // Cmd+K or Ctrl+K Universal Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }

      // Help shortcuts modal '?'
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (isInput) return;

      // 'N' for Quick Create
      if (e.key === 'n' || e.key === 'N') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setQuickCreateOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/auth');
  };

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-4">
          {/* Brand & Main Nav Links */}
          <div className="flex items-center h-full gap-4 sm:gap-6 md:gap-8">
            <div 
              className="flex items-center gap-2 cursor-pointer select-none group" 
              onClick={() => navigate('/')}
            >
              <div className="w-7 h-7 md:w-8 md:h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-mono font-bold text-xs md:text-sm shrink-0 shadow-2xs group-hover:bg-slate-800 transition-colors">
                ✓
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm md:text-base tracking-tight text-slate-900 leading-tight">
                  CHECKIFY
                </span>
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600 leading-none">
                  OPERATIONS
                </span>
              </div>
            </div>
            
            <div className="hidden sm:flex items-center h-full gap-1">
              <NavLink 
                to="/" 
                end
                className={({ isActive }) => cn(
                  "flex items-center gap-1.5 h-full px-2.5 md:px-3.5 border-b-2 text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  isActive 
                    ? "border-slate-900 text-slate-900" 
                    : "border-transparent text-slate-600 hover:text-slate-900"
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Manifests</span>
              </NavLink>

              <NavLink 
                to="/projects" 
                className={({ isActive }) => {
                  const isProjectDetail = location.pathname.startsWith('/project/');
                  const active = isActive || isProjectDetail;
                  return cn(
                    "flex items-center gap-1.5 h-full px-2.5 md:px-3.5 border-b-2 text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                    active 
                      ? "border-slate-900 text-slate-900" 
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  );
                }}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Sites</span>
              </NavLink>

              <NavLink 
                to="/todos" 
                className={({ isActive }) => cn(
                  "flex items-center gap-1.5 h-full px-2.5 md:px-3.5 border-b-2 text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  isActive 
                    ? "border-slate-900 text-slate-900" 
                    : "border-transparent text-slate-600 hover:text-slate-900"
                )}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Backlog</span>
              </NavLink>
            </div>
          </div>

          {/* Search / Command Palette & Actions */}
          <div className="flex items-center gap-2">
            {/* Universal Command Palette Trigger */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="h-9 px-2.5 sm:px-3.5 rounded-lg border border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-medium flex items-center gap-2 transition-all shadow-2xs cursor-pointer group"
              title={`Open Command Palette (${isMac ? '⌘K' : 'Ctrl+K'})`}
            >
              <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-900 transition-colors" />
              <span className="hidden md:inline font-sans text-xs text-slate-600">
                Command Palette...
              </span>
              <kbd className="font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-300 px-1.5 py-0.2 rounded shadow-2xs">
                {isMac ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>

            {/* Quick Create Button */}
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Quick Create (N)"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span className="hidden sm:inline">New (N)</span>
            </button>

            {/* Shortcuts Guide */}
            <button 
              type="button"
              onClick={() => setShortcutsOpen(true)} 
              className="h-9 w-9 hidden sm:flex items-center justify-center rounded-lg border border-slate-300 hover:border-slate-400 bg-white text-slate-700 hover:text-slate-900 text-xs font-mono font-bold transition-colors shadow-2xs" 
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>

            {/* Logout */}
            <button 
              type="button"
              onClick={handleLogout} 
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 hover:border-slate-400 bg-white text-slate-600 hover:text-slate-900 transition-colors shadow-2xs" 
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="sm:hidden flex items-center justify-around border-t border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-mono font-bold uppercase">
          <NavLink 
            to="/" 
            end
            className={({ isActive }) => cn(
              "px-3 py-1 rounded transition-colors",
              isActive ? "bg-slate-900 text-white" : "text-slate-600"
            )}
          >
            Manifests
          </NavLink>
          <NavLink 
            to="/projects" 
            className={({ isActive }) => {
              const isProjectDetail = location.pathname.startsWith('/project/');
              return cn(
                "px-3 py-1 rounded transition-colors",
                isActive || isProjectDetail ? "bg-slate-900 text-white" : "text-slate-600"
              );
            }}
          >
            Sites
          </NavLink>
          <NavLink 
            to="/todos" 
            className={({ isActive }) => cn(
              "px-3 py-1 rounded transition-colors",
              isActive ? "bg-slate-900 text-white" : "text-slate-600"
            )}
          >
            Backlog
          </NavLink>
        </div>
      </nav>

      {/* Floating Action Button (FAB) on bottom right */}
      <button
        type="button"
        onClick={() => setQuickCreateOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 md:w-13 md:h-13 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl border border-slate-800 shadow-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer group"
        title="Quick Create (Press N)"
        aria-label="Quick Create"
      >
        <Plus className="w-5 h-5 md:w-6 md:h-6 stroke-[3] group-hover:scale-110 transition-transform" />
      </button>

      {/* Global Universal Command Palette Modal */}
      <CommandPalette 
        open={commandPaletteOpen} 
        onOpenChange={setCommandPaletteOpen}
        onOpenCreateChecklist={() => setQuickCreateOpen(true)}
        onOpenCreateProject={() => navigate('/projects?create=true')}
        onOpenCreateTodo={() => navigate('/todos')}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Quick Create Modal */}
      <QuickCreateModal 
        open={quickCreateOpen} 
        onOpenChange={setQuickCreateOpen} 
        currentChecklistId={currentChecklistId}
        defaultTab={currentChecklistId ? 'item' : 'checklist'}
      />
    </>
  );
}
