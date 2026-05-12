import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  resolveShareToken, 
  requestGuestAccess, 
  verifyGuestMagicToken, 
  getGuestSessionToken,
  subscribeToItems,
  updateItem,
  subscribeToTodos,
  updateTodo,
  subscribeToChecklists
} from '@/src/services/db';
import { ShareConfig, Checklist, Todo, ChecklistItem } from '@/src/types';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChecklistItemRow } from '@/src/components/Checklist/ChecklistItemRow';
import { TodoItem } from '@/src/components/Todo/TodoItem';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { 
  Lock, 
  Mail, 
  Globe, 
  Unlock, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  Layout,
  ListTodo,
  CheckSquare
} from 'lucide-react';

export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const magicToken = searchParams.get('mt');
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [shareConfig, setShareConfig] = useState<ShareConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isMagicLinkSent, setIsMagicLinkSent] = useState(false);
  const [guestVerified, setGuestVerified] = useState(false);

  // Subscriptions state
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [projectChecklists, setProjectChecklists] = useState<Checklist[]>([]);
  const [projectTodos, setProjectTodos] = useState<Todo[]>([]);

  const resolveAccess = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (magicToken) {
        const verifyRes = await verifyGuestMagicToken(magicToken);
        if (verifyRes.success) {
          setGuestVerified(true);
          toast.success('Access verified!');
          // Remove magic token from URL
          window.history.replaceState({}, '', `/s/${token}`);
        } else {
          setError('Magic link expired or invalid');
          setLoading(false);
          return;
        }
      }

      const result = await resolveShareToken(token);
      if (!result) {
        setError('Link is inactive, expired, or invalid.');
        setLoading(false);
        return;
      }

      const { share, entity: entityData } = result;
      setShareConfig(share);
      setEntity(entityData);

      // Visibility Gate
      if (share.visibility === 'private') {
        const hasDirectAuth = user && share.invitedEmails.includes(user.email || '');
        const hasGuestAuth = !!getGuestSessionToken(); // In real app, verify token validity
        
        if (!hasDirectAuth && !hasGuestAuth && !guestVerified) {
          setLoading(false);
          return; // Show gate
        }
      }

      setLoading(false);
    } catch {
      setError('Failed to resolve shared link');
      setLoading(false);
    }
  }, [token, magicToken, user, guestVerified]);

  useEffect(() => {
    if (!authLoading) {
      resolveAccess();
    }
  }, [resolveAccess, authLoading]);

  // Subscriptions for internal data
  useEffect(() => {
    if (!entity || !shareConfig) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let unsubItems: any, unsubLists: any, unsubTodos: any;

    if (shareConfig.entityType === 'checklist') {
      unsubItems = subscribeToItems(entity.id, setItems);
    } else if (shareConfig.entityType === 'project') {
      unsubLists = subscribeToChecklists(entity.userId, setProjectChecklists, entity.id);
      unsubTodos = subscribeToTodos(entity.userId, setProjectTodos, entity.id);
    }

    return () => {
      unsubItems?.();
      unsubLists?.();
      unsubTodos?.();
    };
  }, [entity, shareConfig]);

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !token) return;
    try {
      const res = await requestGuestAccess(emailInput, token);
      if (res.success) {
        setIsMagicLinkSent(true);
        toast.success('Magic link requested. Please check your inbox.');
      } else {
        toast.error(res.message || 'Access request failed');
      }
    } catch {
      toast.error('Failed to request access');
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Resolving Access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl rounded-3xl p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-500">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 italic">Access Denied</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{error}</p>
          </div>
          <Button onClick={() => navigate('/')} className="w-full h-12 rounded-xl bg-slate-900 border-0">
            <ArrowLeft className="w-4 h-4 mr-2" /> Return Home
          </Button>
        </Card>
      </div>
    );
  }

  // PRIVATE GATE
  const isPrivate = shareConfig?.visibility === 'private';
  const hasAuth = user && shareConfig?.invitedEmails.includes(user.email || '');
  const hasSession = !!getGuestSessionToken() || guestVerified;

  if (isPrivate && !hasAuth && !hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl rounded-3xl overflow-hidden font-sans">
          <div className="bg-slate-900 p-8 text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Private Link</h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-black">Verification Required</p>
          </div>

          <CardContent className="p-8 space-y-6">
            {!isMagicLinkSent ? (
              <>
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 text-center leading-relaxed">
                    This {shareConfig?.entityType} is private. Enter the email address you were invited with to receive a magic link.
                  </p>
                  <form onSubmit={handleRequestAccess} className="space-y-4">
                    <Input 
                      placeholder="you@example.com" 
                      className="h-12 rounded-xl border-slate-200"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                    <Button type="submit" className="w-full h-12 rounded-xl bg-slate-900">
                      Request Access
                    </Button>
                  </form>
                </div>
                {user && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">
                      You are logged in as {user.email}, but this email isn't on the invite list.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
                <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                  <Mail className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">Check your inbox!</h3>
                  <p className="text-sm text-slate-500">We've sent a one-time access link to <span className="font-bold text-slate-900">{emailInput}</span>.</p>
                </div>
                <Button variant="ghost" onClick={() => setIsMagicLinkSent(false)} className="text-xs text-indigo-600 font-bold uppercase tracking-widest">
                  Try another email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // RENDER CONTENT
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header Banner */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">✓</div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Checkify Shared</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              {shareConfig?.entityType} • {shareConfig?.permission} Access
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {shareConfig?.visibility === 'public' ? (
            <Badge variant="outline" className="bg-slate-50 text-slate-500 gap-1 border-0 rounded-lg px-3 py-1">
              <Globe className="w-3 h-3" /> Public
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-600 gap-1 border-0 rounded-lg px-3 py-1 font-bold">
              <Unlock className="w-3 h-3" /> Secure Access
            </Badge>
          )}
          {user && (
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
              <div className="w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center text-[10px] font-bold text-white">
                {user.email?.[0].toUpperCase()}
              </div>
              <span className="text-[10px] font-medium text-slate-600 truncate max-w-[100px]">{user.email}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Render Logic based on EntityType */}
        {shareConfig?.entityType === 'project' && entity && (
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-widest">
                <Layout className="w-4 h-4" /> Project
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-slate-900 italic">{entity.title}</h2>
              <p className="text-slate-500 max-w-2xl">{entity.description || 'No description provided.'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                  <ListTodo className="w-3 h-3" /> Checklists ({projectChecklists.length})
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {projectChecklists.map(list => (
                    <Card key={list.id} className="group hover:border-indigo-200 transition-all cursor-pointer border-0 shadow-sm hover:shadow-md rounded-2xl overflow-hidden">
                      <CardContent className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                            <CheckSquare className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{list.title}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Updated 2m ago</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">View</Button>
                      </CardContent>
                    </Card>
                  ))}
                  {projectChecklists.length === 0 && (
                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                      <p className="text-xs text-slate-400 font-medium">No checklists in this project</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                  <CheckCircle2 className="w-3 h-3" /> Todos ({projectTodos.length})
                </div>
                <div className="space-y-3">
                  {projectTodos.map(todo => (
                    <TodoItem 
                      key={todo.id} 
                      todo={todo} 
                      onToggle={() => shareConfig.permission === 'edit' && updateTodo(todo.id, { isDone: !todo.isDone })}
                      onUpdate={(updates) => shareConfig.permission === 'edit' && updateTodo(todo.id, updates)}
                      onDelete={() => {}}
                      readOnly={shareConfig.permission !== 'edit'}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {shareConfig?.entityType === 'checklist' && entity && (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-widest">
                <CheckSquare className="w-4 h-4" /> Checklist
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-slate-900 italic">{entity.title}</h2>
              <p className="text-slate-500 max-w-2xl">{entity.description || 'Shared checklist.'}</p>
              
              {/* Progress and Items */}
              <div className="bg-white border-0 shadow-xl rounded-3xl p-8 space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    <span>Task Progress</span>
                    <span className="text-slate-900">{items.filter(i => i.isDone).length} / {items.length}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(items.filter(i => i.isDone).length / items.length) * 100}%` }}
                      className="h-full bg-emerald-500" 
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {items.sort((a,b) => a.position - b.position).map(item => (
                    <ChecklistItemRow 
                      key={item.id} 
                      item={item} 
                      indent={0}
                      readOnly={shareConfig.permission !== 'edit'}
                      onToggle={(id, done) => updateItem(entity.id, id, { isDone: !done })}
                      onUpdate={(id, data) => updateItem(entity.id, id, data)}
                      onIndent={() => {}}
                      onAddSubItem={() => {}}
                      onPhotoUpload={() => {}}
                      checklistId={entity.id}
                      userId={user?.uid || 'guest'}
                      onDelete={() => {}}
                    />
                  ))}
                  {shareConfig.permission === 'edit' && (
                    <div className="pt-4 border-t border-slate-50">
                      <Button variant="ghost" className="w-full h-12 border-2 border-dashed border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 text-slate-400 hover:text-indigo-600 rounded-xl font-bold gap-2">
                        + Add Item
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {shareConfig?.entityType === 'todo' && entity && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white border-0 shadow-2xl rounded-3xl p-8 space-y-6">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-widest">
                <CheckCircle2 className="w-4 h-4" /> Single Todo
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">{entity.title}</h2>
                <p className="text-slate-500 leading-relaxed">{entity.description || 'Shared task.'}</p>
              </div>
              <div className="pt-6 border-t border-slate-50">
                <TodoItem 
                  todo={entity as Todo}
                  onToggle={() => shareConfig.permission === 'edit' && updateTodo(entity.id, { isDone: !entity.isDone })}
                  onUpdate={(updates) => shareConfig.permission === 'edit' && updateTodo(entity.id, updates)}
                  onDelete={() => {}}
                  readOnly={shareConfig.permission !== 'edit'}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="py-12 border-t border-slate-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Powered by Checkify Pro</p>
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-300 font-medium">
            <span>Terms of Service</span>
            <span className="w-1 h-1 bg-slate-200 rounded-full" />
            <span>Privacy Policy</span>
            <span className="w-1 h-1 bg-slate-200 rounded-full" />
            <span>Contact Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
