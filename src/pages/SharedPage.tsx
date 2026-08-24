import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  subscribeToChecklists,
  addItem,
  deleteItem,
  cascadeComplete,
  uploadItemPhotos,
  deleteItemPhoto,
  updateItemPhotosOrder,
  toggleItemCollapse,
  createChecklist,
  createTodo,
  updateChecklist
} from '@/src/services/db';
import { validateImage } from '@/src/lib/imageProcessing';
import { ShareConfig, Todo, Checklist, ChecklistItem } from '@/src/types';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardFooter, CardTitle } from '@/components/ui/card';
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
  CheckSquare,
  Plus,
  Clock,
  Copy,
  FileDown,
  Undo2,
  ListChecks
} from 'lucide-react';
import { exportChecklistToPDF } from '@/src/services/pdfExport';
import { generateMarkdown } from '@/src/lib/markdownUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { doc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [shareConfig, setShareConfig] = useState<ShareConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isMagicLinkSent, setIsMagicLinkSent] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nestedEntity, setNestedEntity] = useState<{ type: 'checklist' | 'todo', data: any } | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [projectChecklists, setProjectChecklists] = useState<Checklist[]>([]);
  const [projectTodos, setProjectTodos] = useState<Todo[]>([]);
  const [guestVerified, setGuestVerified] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null);

  // Bento layout modal / dialog controllers
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [itemLoading, setItemLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('checklists');

  const nestItems = useCallback((allItems: ChecklistItem[], parentId: string | null = null): ChecklistItem[] => {
    return allItems
      .filter(i => i.parentId === parentId)
      .sort((a, b) => {
        if (a.isDone !== b.isDone) {
          return a.isDone ? 1 : -1;
        }
        return a.position - b.position;
      })
      .map(i => ({ ...i, children: nestItems(allItems, i.id) }));
  }, []);

  const nestedItems = useMemo(() => nestItems(items), [items, nestItems]);

  const flattenItems = useCallback((nested: ChecklistItem[], level: number = 0): { item: ChecklistItem, level: number }[] => {
    let result: { item: ChecklistItem, level: number }[] = [];
    nested.forEach(item => {
      result.push({ item, level });
      if (item.children && !item.isCollapsed) {
        result = [...result, ...flattenItems(item.children, level + 1)];
      }
    });
    return result;
  }, []);

  const flattenedItems = useMemo<{ item: ChecklistItem, level: number }[]>(() => flattenItems(nestedItems), [nestedItems, flattenItems]);

  const resolveAccess = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await resolveShareToken(token);
      if (!result) {
        setError('Link is inactive, expired, or invalid.');
        setLoading(false);
        return;
      }

      const { share, entity: entityData } = result;
      setShareConfig(share);
      setEntity(entityData);

      // Store project share token for nested navigation permission resolving
      if (share.entityType === 'project') {
        sessionStorage.setItem(`project_share_${share.entityId}`, token);
      }

      // Handle magical token if present
      const mt = new URLSearchParams(window.location.search).get('mt');
      if (mt) {
        try {
          const res = await verifyGuestMagicToken(mt);
          if (res.success) {
             setGuestVerified(true);
             toast.success('Access verified');
             // Clean URL
             navigate(`/s/${token}`, { replace: true });
          }
        } catch (e) {
          console.error('Magic token verification failed', e);
        }
      }

      // Visibility Gate
      if (share.visibility === 'private') {
        const hasDirectAuth = user && share.invitedEmails.includes(user.email || '');
        const hasGuestAuth = !!getGuestSessionToken(); 
        
        if (!hasDirectAuth && !hasGuestAuth) {
          setLoading(false);
          return; // Show gate
        }
      }

      setLoading(false);
    } catch {
      setError('Failed to resolve shared link');
      setLoading(false);
    }
  }, [token, user, navigate]);

  useEffect(() => {
    if (!authLoading) {
      resolveAccess();
    }
  }, [resolveAccess, authLoading]);

  // Subscriptions for internal data
  useEffect(() => {
    if (!shareConfig) return;
    let unsubItems: (() => void) | undefined;
    let unsubLists: (() => void) | undefined;
    let unsubTodos: (() => void) | undefined;

    if (shareConfig.entityType === 'checklist') {
      if (entity) unsubItems = subscribeToItems(entity.id, setItems);
    } else if (shareConfig.entityType === 'project') {
      if (entity) {
        unsubLists = subscribeToChecklists(entity.userId, setProjectChecklists, entity.id);
        unsubTodos = subscribeToTodos(entity.userId, setProjectTodos, entity.id);
      }
    }

    // Handle nested checklist in a shared project
    if (nestedEntity?.type === 'checklist') {
      unsubItems = subscribeToItems(nestedEntity.data.id, setItems);
    }

    return () => {
      unsubItems?.();
      unsubLists?.();
      unsubTodos?.();
    };
  }, [entity, shareConfig, nestedEntity]);

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

  const handleCreateProjectChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !entity || !newChecklistTitle.trim()) return;
    setItemLoading(true);
    try {
      const docRef = await createChecklist(
        entity.userId, 
        newChecklistTitle.trim(), 
        '', 
        projectChecklists.length, 
        entity.id
      );
      toast.success('Checklist added to project');
      setNewChecklistTitle('');
      setIsChecklistDialogOpen(false);
      if (docRef?.id) {
        setNestedEntity({ 
          type: 'checklist', 
          data: { 
            id: docRef.id, 
            title: newChecklistTitle.trim(), 
            status: 'active', 
            userId: entity.userId, 
            projectId: entity.id 
          } 
        });
      }
    } catch (err) {
      console.error('Create checklist failed:', err);
      toast.error('Failed to add checklist');
    } finally {
      setItemLoading(false);
    }
  };

  const handleCreateProjectTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !entity || !newTodoTitle.trim()) return;
    setItemLoading(true);
    try {
      await createTodo(entity.userId, newTodoTitle.trim(), '', entity.id);
      toast.success('Operations task added');
      setNewTodoTitle('');
      setIsTodoDialogOpen(false);
    } catch (err) {
      console.error('Create todo failed:', err);
      toast.error('Failed to add task');
    } finally {
      setItemLoading(false);
    }
  };

  const handleAddItem = async (checklistId: string) => {
    const textToAdd = newItemText.trim() || 'New task';
    const position = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
    try {
      const newItem = await addItem(checklistId, textToAdd, position, null, token || undefined);
      if (newItem) {
        setAutoFocusItemId(newItem.id);
      }
      setNewItemText('');
      toast.success('Item added');
    } catch {
      toast.error('Failed to add item');
    }
  };

  const toggleItem = async (checklistId: string, item: ChecklistItem) => {
    const newStatus = !item.isDone;
    await updateItem(checklistId, item.id, { isDone: newStatus }, token || undefined);
    if (newStatus) {
      await cascadeComplete(checklistId, item.id, items);
    }
  };

  const handleIndentChange = async (checklistId: string, item: ChecklistItem, direction: 'in' | 'out') => {
    if (direction === 'in') {
      const siblings = items.filter(i => i.parentId === item.parentId);
      const index = siblings.findIndex(i => i.id === item.id);
      if (index > 0) {
        const previousSibling = siblings[index - 1];
        await updateItem(checklistId, item.id, { parentId: previousSibling.id }, token || undefined);
      }
    } else {
      if (!item.parentId) return;
      const parent = items.find(i => i.id === item.parentId);
      await updateItem(checklistId, item.id, { parentId: parent?.parentId || null }, token || undefined);
    }
  };

  const handleAddSubItem = async (checklistId: string, parentId: string) => {
    const children = items.filter(i => i.parentId === parentId);
    const position = children.length > 0 ? Math.max(...children.map(c => c.position)) + 1 : 0;
    
    const newItem = await addItem(checklistId, 'New sub-task', position, parentId, token || undefined);
    if (newItem) {
      setAutoFocusItemId(newItem.id);
    }
    toast.success('Sub-task added');
  };

  const handleDeleteItem = async (checklistId: string, itemId: string) => {
    if (confirm('Delete this item?')) {
      try {
        await deleteItem(checklistId, itemId);
        toast.success('Item removed');
      } catch {
        toast.error('Failed to delete item');
      }
    }
  };

  const handlePhotoUpload = async (checklistId: string, itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      files.forEach(file => validateImage(file));
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }

    const loadingToast = toast.loading(files.length > 1 ? `Uploading ${files.length} photos...` : 'Uploading photo...');
    try {
      await uploadItemPhotos(checklistId, itemId, files, token || undefined);
      toast.dismiss(loadingToast);
      toast.success(files.length > 1 ? `${files.length} photos uploaded` : 'Photo uploaded');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Upload failed');
    }
  };

  const handlePhotoDelete = async (checklistId: string, itemId: string, photoUrl: string) => {
    const loadingToast = toast.loading('Deleting photo...');
    try {
      await deleteItemPhoto(checklistId, itemId, photoUrl, token || undefined);
      toast.dismiss(loadingToast);
      toast.success('Photo deleted');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Deletion failed');
    }
  };

  const handlePhotosRearrange = async (checklistId: string, itemId: string, photoUrls: string[]) => {
    try {
      await updateItemPhotosOrder(checklistId, itemId, photoUrls, token || undefined);
    } catch (error) {
      console.error('Reorder failed:', error);
      toast.error('Failed to save photo order');
    }
  };

  const handleToggleCollapse = async (checklistId: string, itemId: string, collapsed: boolean) => {
    try {
      await toggleItemCollapse(checklistId, itemId, collapsed, token || undefined);
    } catch (error) {
      console.error('Failed to toggle collapse:', error);
      toast.error('Failed to save state');
    }
  };

  const onDragEnd = async (result: DropResult, checklistId: string) => {
    if (!result.destination) return;
    
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const reorderedItems = Array.from(flattenedItems);
    const [removedEntry] = reorderedItems.splice(source.index, 1);
    reorderedItems.splice(destination.index, 0, removedEntry);

    const batch = writeBatch(db);
    
    reorderedItems.forEach((entry, index) => {
      batch.update(doc(db, 'checklists', checklistId, 'items', entry.item.id), { 
        position: index 
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update position');
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
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20">
      {/* Project Context Bar - Persistent indication of current workspace */}
      <div className="bg-emerald-600 border-b-2 border-slate-900 py-3 md:py-4">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 text-white overflow-hidden">
            <Layout className="w-4 h-4 shrink-0" />
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest truncate">
              Workspace Shared Link: <span className="text-emerald-100">{entity?.title}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {shareConfig?.visibility === 'public' ? (
              <Badge variant="outline" className="bg-emerald-700 text-white gap-1 border-2 border-emerald-950 rounded-lg px-3 py-1 font-black text-[9px] uppercase tracking-widest">
                <Globe className="w-3 h-3" /> Public Share Link
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-indigo-700 text-white gap-1 border-2 border-indigo-950 rounded-lg px-3 py-1 font-black text-[9px] uppercase tracking-widest">
                <Unlock className="w-3 h-3" /> Secure Invite Link
              </Badge>
            )}
            <Badge variant="outline" className="bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest h-8 px-4 border-2 border-slate-950 rounded-lg flex items-center justify-center">
              {shareConfig?.permission === 'edit' ? 'Can Edit' : 'View Only'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Render Logic based on EntityType */}
        {shareConfig?.entityType === 'project' && entity && (
          <div className="space-y-8">
            
            {/* If a nested checklist is open, display it in dedicated full-page bento layout */}
            {nestedEntity?.type === 'checklist' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setNestedEntity(null)} className="font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-900 px-0">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to project assets
                  </Button>
                  <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-slate-200 text-slate-400 text-[10px] font-black uppercase">
                    Shared Project Protocol
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3 md:p-4 rounded-2xl border-2 border-slate-900 shadow-bento gap-4 w-full overflow-hidden shrink-0">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-medium shrink-0">✓</div>
                    <div className="flex flex-col min-w-0 flex-1">
                      {shareConfig.permission === 'edit' ? (
                        <Input 
                          className="text-xs md:text-sm font-black uppercase tracking-tight text-slate-900 border-none p-0 focus-visible:ring-0 h-auto bg-transparent truncate w-full hover:bg-slate-50 transition-colors"
                          defaultValue={nestedEntity.data.title}
                          onBlur={(e) => updateChecklist(nestedEntity.data.id, { title: e.target.value })}
                        />
                      ) : (
                        <span className="text-xs md:text-sm font-black uppercase tracking-tight text-slate-900 truncate">{nestedEntity.data.title}</span>
                      )}
                      {shareConfig.permission === 'edit' ? (
                        <Input 
                          className="text-[9px] md:text-[10px] font-medium text-slate-400 border-none p-0 focus-visible:ring-0 h-auto bg-transparent italic leading-tight truncate w-full hover:bg-slate-50 transition-colors"
                          placeholder="Add description..."
                          defaultValue={nestedEntity.data.description || ''}
                          onBlur={(e) => updateChecklist(nestedEntity.data.id, { description: e.target.value })}
                        />
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400 italic truncate">{nestedEntity.data.description || 'Shared checklist.'}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                     <Button variant="outline" onClick={() => {
                       if (items.length === 0) {
                         toast.error('Nothing to copy');
                         return;
                       }
                       const md = generateMarkdown(items);
                       navigator.clipboard.writeText(md);
                       toast.success('Checklist copied as Markdown');
                     }} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
                       <Copy className="w-3 h-3 md:w-4 md:h-4 mr-2" /> Copy MD
                     </Button>
                     <Button variant="outline" onClick={async () => {
                       const toastId = toast.loading("Initializing PDF Generation...");
                       try {
                         const allNestedItems = nestItems(items);
                         const allFlattenedItems: { item: ChecklistItem, level: number }[] = [];
                         const flattenAll = (nested: ChecklistItem[], level: number = 0) => {
                           nested.forEach(item => {
                             allFlattenedItems.push({ item, level });
                             if (item.children && item.children.length > 0) {
                               flattenAll(item.children, level + 1);
                             }
                           });
                         };
                         flattenAll(allNestedItems);
                         await exportChecklistToPDF({
                           checklist: nestedEntity.data as Checklist,
                           items: allFlattenedItems,
                           onProgress: (progress, status) => {
                             toast.loading(status, { id: toastId });
                           }
                         });
                         toast.success("Audit Report generated successfully", { id: toastId });
                       } catch (error) {
                         console.error("PDF Export failed:", error);
                         toast.error("Failed to generate PDF Report", { id: toastId });
                       }
                     }} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
                       <FileDown className="w-3 h-3 md:w-4 md:h-4 mr-2" /> export
                     </Button>
                  </div>
                </div>

                <Card className="bento-card bg-white shadow-bento-lg overflow-hidden border-2 w-full max-w-full">
                  <CardHeader className="space-y-6 p-4 md:p-8 border-b-2 border-slate-900 bg-white overflow-hidden w-full">
                    <div className="space-y-3 bg-slate-50 p-3 md:p-6 rounded-xl md:rounded-2xl border-2 border-slate-900 w-full overflow-hidden shrink-0">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 w-full overflow-hidden">
                        <span className="flex items-center gap-2 truncate">
                          <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600 shrink-0" />
                          <span className="truncate">Overall Verification Progress</span>
                        </span>
                        <span className="bg-white border-2 border-slate-900 px-2 md:px-3 py-1 rounded-full text-slate-900 shadow-sm self-start sm:self-center shrink-0">{items.filter(i => i.isDone).length} / {items.length}</span>
                      </div>
                      <div className="h-3 md:h-4 w-full bg-white border-2 border-slate-900 rounded-full overflow-hidden">
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${(items.filter(i => i.isDone).length / Math.max(1, items.length)) * 100}%` }}
                           className="h-full bg-emerald-500" 
                         />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 md:gap-3">
                      {shareConfig.permission === 'edit' && (
                        nestedEntity.data.status === 'completed' ? (
                          <Button onClick={() => updateChecklist(nestedEntity.data.id, { status: 'active', completedAt: null })} className="bento-button bg-white text-slate-900 text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                            <Undo2 className="w-4 h-4 mr-2" /> Reopen Audit
                          </Button>
                        ) : (
                          <Button onClick={() => updateChecklist(nestedEntity.data.id, { status: 'completed', completedAt: Timestamp.now() })} className="bento-button bg-emerald-500 text-white text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Audit
                          </Button>
                        )
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-0 bg-slate-50/50">
                    <div className="p-4 md:p-8 space-y-4 overflow-x-hidden">
                      {flattenedItems.length === 0 && (
                        <div className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest border-4 border-dashed border-slate-200 rounded-3xl">
                           No items found for this audit
                        </div>
                      )}
                      
                      <DragDropContext onDragEnd={(res) => onDragEnd(res, nestedEntity.data.id)}>
                        <Droppable droppableId="checklist-items">
                          {(provided) => (
                            <div 
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className="space-y-4"
                            >
                              {flattenedItems.map(({ item, level }, idx) => (
                                <Draggable key={item.id} draggableId={item.id} index={idx} isDragDisabled={shareConfig.permission !== 'edit'}>
                                  {(prov, snap) => (
                                    <ChecklistItemRow 
                                      item={item} 
                                      indent={level}
                                      provided={prov}
                                      isDragging={snap.isDragging}
                                      onToggle={(id) => toggleItem(nestedEntity.data.id, items.find(i => i.id === id)!)}
                                      onIndent={(id, direction) => handleIndentChange(nestedEntity.data.id, items.find(i => i.id === id)!, direction)}
                                      onAddSubItem={(parentId) => handleAddSubItem(nestedEntity.data.id, parentId)}
                                      onDelete={(id) => handleDeleteItem(nestedEntity.data.id, id)}
                                      onUpdate={(id, updates) => updateItem(nestedEntity.data.id, id, updates, token || undefined)}
                                      onPhotoUpload={(itemId, e) => handlePhotoUpload(nestedEntity.data.id, itemId, e)}
                                      onPhotoDelete={(itemId, url) => handlePhotoDelete(nestedEntity.data.id, itemId, url)}
                                      onPhotosRearrange={(itemId, photoUrls) => handlePhotosRearrange(nestedEntity.data.id, itemId, photoUrls)}
                                      onToggleCollapse={(itemId, collapsed) => handleToggleCollapse(nestedEntity.data.id, itemId, collapsed)}
                                      autoFocus={autoFocusItemId === item.id}
                                      onFocused={() => setAutoFocusItemId(null)}
                                      userId={user?.uid || 'guest'}
                                      userName={user?.displayName || user?.email?.split('@')[0] || 'Guest'}
                                      checklistId={nestedEntity.data.id}
                                      readOnly={shareConfig.permission !== 'edit'}
                                    />
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    </div>
                  </CardContent>

                  <div className="px-4 md:px-8 py-3 md:py-4 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-400 border-2 border-slate-50 flex items-center justify-center text-[10px] font-black text-slate-900 italic shrink-0">SH</div>
                        <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase opacity-70 truncate max-w-[200px]">{user?.email || 'Guest User'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                         <p className="text-[9px] md:text-[10px] font-black uppercase">Live Updates Enabled</p>
                      </div>
                  </div>
                </Card>

                {shareConfig.permission === 'edit' && (
                  <form onSubmit={(e) => { e.preventDefault(); handleAddItem(nestedEntity ? nestedEntity.data.id : entity.id); }} className="group">
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); handleAddItem(nestedEntity ? nestedEntity.data.id : entity.id); }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all cursor-pointer z-10"
                        title="Create Task Item"
                        aria-label="Create Task Item"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                      <Input 
                        className="pl-12 pr-28 h-14 bg-white border-2 border-slate-900 rounded-2xl shadow-sm focus-visible:ring-indigo-600/20 text-base font-bold"
                        placeholder="Add a new task or verification item... (Paste MD allowed)"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                      />
                      <Button
                        type="submit"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs rounded-xl shadow-sm flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Add Task
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              // Shared Project main Dashboard
              <div className="space-y-8">
                {/* General Breadcrumb Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black uppercase text-[10px] tracking-widest text-slate-400">
                    SHARED SECURE CLUSTER HUB
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-slate-200 text-slate-400 text-[10px] font-black uppercase">
                    Scoped View
                  </div>
                </div>

                {/* Project Briefing Header Card */}
                <div className="relative p-6 md:p-10 rounded-3xl bg-white border-2 border-slate-900 shadow-bento overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-5">
                     <Layout className="w-48 h-48" />
                   </div>
                   <div className="relative z-10 space-y-4">
                     <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border-2 border-emerald-600 text-emerald-600 font-black uppercase text-[10px] tracking-widest">
                       Active Shared Cluster <Layout className="w-3 h-3" />
                     </div>
                     <div>
                       <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-slate-900">{entity.title}</h1>
                       <p className="max-w-2xl text-slate-500 font-medium italic mt-2">{entity.description || 'No description provided.'}</p>
                     </div>
                     <div className="flex items-center gap-6 pt-4 border-t-2 border-slate-50">
                       <div className="flex flex-col">
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Memberships</span>
                         <span className="text-xl font-black text-slate-900">Guest Access</span>
                       </div>
                       <div className="flex flex-col">
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Linked Assets</span>
                         <span className="text-xl font-black text-slate-900">{projectChecklists.length} Checklists · {projectTodos.length} Todos</span>
                       </div>
                       <div className="flex-1" />
                     </div>
                   </div>
                </div>

                {/* Shared Tabs Block */}
                <Tabs defaultValue="checklists" className="w-full" onValueChange={setActiveTab}>
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <TabsList className="bg-slate-100 p-1 rounded-2xl border-2 border-slate-900">
                      <TabsTrigger value="checklists" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                        <ListChecks className="w-4 h-4" /> Checklists ({projectChecklists.length})
                      </TabsTrigger>
                      <TabsTrigger value="todos" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm font-black uppercase text-xs px-6 py-2.5 flex gap-2">
                        <CheckSquare className="w-4 h-4" /> Operations ({projectTodos.length})
                      </TabsTrigger>
                    </TabsList>

                    {shareConfig.permission === 'edit' && (
                      activeTab === 'checklists' ? (
                         <Button onClick={() => setIsChecklistDialogOpen(true)} className="bento-button bg-emerald-600 text-white font-black uppercase text-xs h-12 px-6">
                           <Plus className="w-4 h-4 mr-2" /> Add Checklist
                         </Button>
                      ) : (
                         <div className="flex gap-2">
                           <Button 
                             variant="outline" 
                             onClick={() => {
                               if (projectTodos.length === 0) {
                                 toast.error('Nothing to copy');
                                 return;
                               }
                               const md = generateMarkdown(projectTodos);
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
                      )
                    )}
                  </div>

                  <TabsContent value="checklists" className="mt-0 outline-none">
                    {projectChecklists.length === 0 ? (
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
                        {projectChecklists.map((list) => (
                          <motion.div
                             key={list.id}
                             initial={{ opacity: 0, scale: 0.98 }}
                             animate={{ opacity: 1, scale: 1 }}
                             exit={{ opacity: 0, scale: 0.98 }}
                          >
                            <Card className="bento-card group hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setNestedEntity({ type: 'checklist', data: list })}>
                              <CardHeader className="p-6">
                                <div className="flex justify-between items-start">
                                  <div className="space-y-2">
                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border-2 border-slate-900 bg-indigo-600 text-white">
                                      {list.status}
                                    </span>
                                    <CardTitle className="text-xl font-black uppercase tracking-tight line-clamp-1 group-hover:text-indigo-600 transition-colors">{list.title}</CardTitle>
                                  </div>
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
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="todos" className="mt-0 outline-none">
                    <div className="space-y-4">
                      {projectTodos.length === 0 ? (
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
                        projectTodos.map(todo => (
                          <TodoItem 
                            key={todo.id} 
                            todo={todo} 
                            onToggle={() => shareConfig.permission === 'edit' && updateTodo(todo.id, { isDone: !todo.isDone })}
                            onUpdate={(updates) => shareConfig.permission === 'edit' && updateTodo(todo.id, updates)}
                            onDelete={() => {}}
                            readOnly={shareConfig.permission !== 'edit'}
                          />
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        )}

        {shareConfig?.entityType === 'checklist' && entity && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3 md:p-4 rounded-2xl border-2 border-slate-900 shadow-bento gap-4 w-full overflow-hidden shrink-0">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-medium shrink-0">✓</div>
                <div className="flex flex-col min-w-0 flex-1">
                  {shareConfig.permission === 'edit' ? (
                    <Input 
                      className="text-xs md:text-sm font-black uppercase tracking-tight text-slate-900 border-none p-0 focus-visible:ring-0 h-auto bg-transparent truncate w-full hover:bg-slate-50 transition-colors"
                      defaultValue={entity.title}
                      onBlur={(e) => updateChecklist(entity.id, { title: e.target.value })}
                    />
                  ) : (
                    <span className="text-xs md:text-sm font-black uppercase tracking-tight text-slate-900 truncate">{entity.title}</span>
                  )}
                  {shareConfig.permission === 'edit' ? (
                    <Input 
                      className="text-[9px] md:text-[10px] font-medium text-slate-400 border-none p-0 focus-visible:ring-0 h-auto bg-transparent italic leading-tight truncate w-full hover:bg-slate-50 transition-colors"
                      placeholder="Add description..."
                      defaultValue={entity.description || ''}
                      onBlur={(e) => updateChecklist(entity.id, { description: e.target.value })}
                    />
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 italic truncate">{entity.description || 'Shared checklist.'}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                 <Button variant="outline" onClick={() => {
                   if (items.length === 0) {
                     toast.error('Nothing to copy');
                     return;
                   }
                   const md = generateMarkdown(items);
                   navigator.clipboard.writeText(md);
                   toast.success('Checklist copied as Markdown');
                 }} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
                   <Copy className="w-3 h-3 md:w-4 md:h-4 mr-2" /> Copy MD
                 </Button>
                 <Button variant="outline" onClick={async () => {
                   const toastId = toast.loading("Initializing PDF Generation...");
                   try {
                     const allNestedItems = nestItems(items);
                     const allFlattenedItems: { item: ChecklistItem, level: number }[] = [];
                     const flattenAll = (nested: ChecklistItem[], level: number = 0) => {
                       nested.forEach(item => {
                         allFlattenedItems.push({ item, level });
                         if (item.children && item.children.length > 0) {
                           flattenAll(item.children, level + 1);
                         }
                       });
                     };
                     flattenAll(allNestedItems);
                     await exportChecklistToPDF({
                       checklist: entity as Checklist,
                       items: allFlattenedItems,
                       onProgress: (progress, status) => {
                         toast.loading(status, { id: toastId });
                       }
                     });
                     toast.success("Audit Report generated successfully", { id: toastId });
                   } catch (error) {
                     console.error("PDF Export failed:", error);
                     toast.error("Failed to generate PDF Report", { id: toastId });
                   }
                 }} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
                   <FileDown className="w-3 h-3 md:w-4 md:h-4 mr-2" /> export
                 </Button>
              </div>
            </div>

            <Card className="bento-card bg-white shadow-bento-lg overflow-hidden border-2 w-full max-w-full">
              <CardHeader className="space-y-6 p-4 md:p-8 border-b-2 border-slate-900 bg-white overflow-hidden w-full">
                <div className="space-y-3 bg-slate-50 p-3 md:p-6 rounded-xl md:rounded-2xl border-2 border-slate-900 w-full overflow-hidden shrink-0">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 w-full overflow-hidden">
                    <span className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600 shrink-0" />
                      <span className="truncate">Overall Verification Progress</span>
                    </span>
                    <span className="bg-white border-2 border-slate-900 px-2 md:px-3 py-1 rounded-full text-slate-900 shadow-sm self-start sm:self-center shrink-0">{items.filter(i => i.isDone).length} / {items.length}</span>
                  </div>
                  <div className="h-3 md:h-4 w-full bg-white border-2 border-slate-900 rounded-full overflow-hidden">
                     <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(items.filter(i => i.isDone).length / Math.max(1, items.length)) * 100}%` }}
                       className="h-full bg-emerald-500" 
                     />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-3">
                  {shareConfig.permission === 'edit' && (
                    entity.status === 'completed' ? (
                      <Button onClick={() => updateChecklist(entity.id, { status: 'active', completedAt: null })} className="bento-button bg-white text-slate-900 text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                        <Undo2 className="w-4 h-4 mr-2" /> Reopen Audit
                      </Button>
                    ) : (
                      <Button onClick={() => updateChecklist(entity.id, { status: 'completed', completedAt: Timestamp.now() })} className="bento-button bg-emerald-500 text-white text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Audit
                      </Button>
                    )
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="p-0 bg-slate-50/50">
                <div className="p-4 md:p-8 space-y-4 overflow-x-hidden">
                  {flattenedItems.length === 0 && (
                    <div className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest border-4 border-dashed border-slate-200 rounded-3xl">
                       No items found for this audit
                    </div>
                  )}
                  
                  <DragDropContext onDragEnd={(res) => onDragEnd(res, entity.id)}>
                    <Droppable droppableId="checklist-items">
                      {(provided) => (
                        <div 
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-4"
                        >
                          {flattenedItems.map(({ item, level }, idx) => (
                            <Draggable key={item.id} draggableId={item.id} index={idx} isDragDisabled={shareConfig.permission !== 'edit'}>
                              {(prov, snap) => (
                                <ChecklistItemRow 
                                  item={item} 
                                  indent={level}
                                  provided={prov}
                                  isDragging={snap.isDragging}
                                  onToggle={(id) => toggleItem(entity.id, items.find(i => i.id === id)!)}
                                  onIndent={(id, direction) => handleIndentChange(entity.id, items.find(i => i.id === id)!, direction)}
                                  onAddSubItem={(parentId) => handleAddSubItem(entity.id, parentId)}
                                  onDelete={(id) => handleDeleteItem(entity.id, id)}
                                  onUpdate={(id, updates) => updateItem(entity.id, id, updates, token || undefined)}
                                  onPhotoUpload={(itemId, e) => handlePhotoUpload(entity.id, itemId, e)}
                                  onPhotoDelete={(itemId, url) => handlePhotoDelete(entity.id, itemId, url)}
                                  onPhotosRearrange={(itemId, photoUrls) => handlePhotosRearrange(entity.id, itemId, photoUrls)}
                                  onToggleCollapse={(itemId, collapsed) => handleToggleCollapse(entity.id, itemId, collapsed)}
                                  autoFocus={autoFocusItemId === item.id}
                                  onFocused={() => setAutoFocusItemId(null)}
                                  userId={user?.uid || 'guest'}
                                  userName={user?.displayName || user?.email?.split('@')[0] || 'Guest'}
                                  checklistId={entity.id}
                                  readOnly={shareConfig.permission !== 'edit'}
                                />
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              </CardContent>

              <div className="px-4 md:px-8 py-3 md:py-4 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-400 border-2 border-slate-50 flex items-center justify-center text-[10px] font-black text-slate-900 italic shrink-0">SH</div>
                    <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase opacity-70 truncate max-w-[200px]">{user?.email || 'Guest User'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                     <p className="text-[9px] md:text-[10px] font-black uppercase">Live Updates Enabled</p>
                  </div>
              </div>
            </Card>

            {shareConfig.permission === 'edit' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddItem(entity.id); }} className="group">
                <div className="relative">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300 group-focus-within:text-indigo-600 transition-colors" />
                  <Input 
                    className="pl-12 h-14 bg-white border-2 border-slate-900 rounded-2xl shadow-sm focus-visible:ring-indigo-600/20 text-base font-bold"
                    placeholder="Add a new task or verification item... (Paste MD allowed)"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                  />
                </div>
              </form>
            )}
          </div>
        )}

        {shareConfig?.entityType === 'todo' && entity && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white border-2 border-slate-900 shadow-bento rounded-3xl p-8 space-y-6">
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
        <div className="max-w-7xl mx-auto px-6 text-center space-y-3">
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

      {/* Checklist Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-emerald-600">Create New Protocol</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mt-1">
              Add a checklist item set to this shared space
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProjectChecklist} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Title</Label>
              <Input 
                placeholder="Name your protocol..." 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold bg-white"
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-emerald-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'CREATING...' : 'CREATE PROTOCOL'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Todo Dialog */}
      <Dialog open={isTodoDialogOpen} onOpenChange={setIsTodoDialogOpen}>
        <DialogContent className="bento-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-indigo-600">Create Operations Task</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mt-1">
              Record a standalone workspace todo item
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProjectTodo} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Task Description</Label>
              <Input 
                placeholder="What needs doing..." 
                className="h-12 border-2 border-slate-900 rounded-xl font-bold bg-white"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bento-button w-full h-12 bg-indigo-600 text-white" disabled={itemLoading}>
                {itemLoading ? 'SAVING...' : 'REGISTER TASK'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
