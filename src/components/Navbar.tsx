import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, LogOut, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth } from '@/src/lib/firebase';

export default function Navbar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/auth');
  };

  return (
    <nav className="bg-white border-b-2 border-slate-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between">
        <div className="flex items-center h-full gap-4 md:gap-8">
          <div className="flex items-center gap-2 mr-2 md:mr-4 group cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-7 h-7 md:w-8 md:h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold border-2 border-slate-900 shrink-0 shadow-[2px_2px_0px_rgba(15,23,42,1)] group-hover:bg-indigo-500 transition-all">✓</div>
            <span className="font-black uppercase tracking-tighter text-lg md:text-xl hidden sm:block text-slate-900">Checkify</span>
          </div>
          
          <NavLink 
            to="/" 
            className={({ isActive }) => `flex items-center gap-1 md:gap-2 h-full border-b-[3px] md:border-b-4 transition-all uppercase font-black text-[10px] md:text-xs tracking-widest ${
              isActive ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Checklists</span>
          </NavLink>
          <NavLink 
            to="/projects" 
            className={({ isActive }) => {
              const isProjectDetail = window.location.pathname.startsWith('/project/');
              const active = isActive || isProjectDetail;
              return `flex items-center gap-1 md:gap-2 h-full border-b-[3px] md:border-b-4 transition-all uppercase font-black text-[10px] md:text-xs tracking-widest ${
                active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
              }`;
            }}
          >
            <Layout className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Projects</span>
          </NavLink>
          <NavLink 
            to="/todos" 
            className={({ isActive }) => `flex items-center gap-1 md:gap-2 h-full border-b-[3px] md:border-b-4 transition-all uppercase font-black text-[10px] md:text-xs tracking-widest ${
              isActive ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">To-Do List</span>
          </NavLink>
        </div>

        <Button variant="ghost" size="icon" onClick={handleLogout} className="bento-button bg-white h-8 w-8 md:h-9 md:w-9" title="Logout">
          <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </Button>
      </div>
    </nav>
  );
}
