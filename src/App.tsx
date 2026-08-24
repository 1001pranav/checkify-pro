import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import AuthPage from '@/src/pages/AuthPage';
import Dashboard from '@/src/pages/Dashboard';
import Todos from '@/src/pages/Todos';
import Projects from '@/src/pages/Projects';
import ProjectDetail from '@/src/pages/ProjectDetail';
import ChecklistDetail from '@/src/pages/ChecklistDetail';
import SharedPage from '@/src/pages/SharedPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen flex items-center justify-center font-sans">Loading...</div>;
  if (!user) return <Navigate to="/auth" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-[#f5f5f5] text-[#141414] font-sans">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/todos" element={
              <ProtectedRoute>
                <Todos />
              </ProtectedRoute>
            } />
            <Route path="/projects" element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            } />
            <Route path="/project/:id" element={<ProjectDetail />} />
            <Route path="/checklist/:id" element={<ChecklistDetail />} />
            <Route path="/s/:token" element={<SharedPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
      <Toaster />
    </AuthProvider>
  );
}
