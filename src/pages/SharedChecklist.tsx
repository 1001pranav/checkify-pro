import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getSharedChecklist, 
  subscribeToItems, 
  updateItem, 
  addItem,
  uploadItemPhotos,
  deleteItemPhoto,
  updateItemPhotosOrder,
  toggleItemCollapse
} from '@/src/services/db';
import { exportChecklistToPDF } from '@/src/services/pdfExport';
import { Checklist, ChecklistItem, ChecklistShare } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChecklistItemRow } from '@/src/components/Checklist/ChecklistItemRow';
import { 
  CheckCircle2, 
  Package,
  Plus,
  User,
  MessageSquare,
  FileDown,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

import { auth, db } from '@/src/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { generateMarkdown, parseMarkdown } from '@/src/lib/markdownUtils';

export default function SharedChecklist() {
  const { token } = useParams<{ token: string }>();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [shareMetadata, setShareMetadata] = useState<ChecklistShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!token) return;
    
    let isMounted = true;
    let unsubChecklist: (() => void) | undefined;
    let unsubscribeItems: (() => void) | undefined;
    
    const init = async () => {
      try {
        const result = await getSharedChecklist(token);
        if (!result || !isMounted) return;

        const { checklist: initialChecklist, permission, shareMetadata } = result;
        setPermission(permission);
        setShareMetadata(shareMetadata);

        // Subscribe to checklist metadata for real-time updates
        unsubChecklist = onSnapshot(doc(db, 'checklists', initialChecklist.id), (snap) => {
          if (snap.exists() && isMounted) {
            setChecklist({ id: snap.id, ...snap.data() } as Checklist);
          }
        });

        // Ensure user is signed in (anonymously if needed for editing/commenting)
        if (!auth.currentUser && permission === 'edit') {
          await signInAnonymously(auth);
        }
        
        if (!isMounted) return;
        
        unsubscribeItems = subscribeToItems(initialChecklist.id, (data: ChecklistItem[]) => {
          if (isMounted) {
            setItems(data);
            setLoading(false);
          }
        });
      } catch (err) {
        if (isMounted) {
          toast.error((err as Error).message);
          setLoading(false);
        }
      }
    };
    
    init();

    return () => {
      isMounted = false;
      if (unsubChecklist) unsubChecklist();
      if (unsubscribeItems) unsubscribeItems();
    };
  }, [token]);

  const toggleItem = async (item: ChecklistItem) => {
    if (permission !== 'edit' || !checklist || !token) return;
    await updateItem(checklist.id, item.id, { isDone: !item.isDone }, token);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (permission !== 'edit' || !newItemText.trim() || !checklist || !token) return;
    const position = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
    await addItem(checklist.id, newItemText.trim(), position, null, token);
    setNewItemText('');
  };

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!checklist || !e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const loadingToast = toast.loading(files.length > 1 ? `Uploading ${files.length} photos...` : 'Uploading photo...');
    try {
      await uploadItemPhotos(checklist.id, itemId, files, token || undefined);
      toast.dismiss(loadingToast);
      toast.success(files.length > 1 ? `${files.length} photos uploaded` : 'Photo uploaded');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Upload failed');
    }
  };

  const handlePhotoDelete = async (itemId: string, photoUrl: string) => {
    if (!checklist) return;
    const loadingToast = toast.loading('Deleting photo...');
    try {
      await deleteItemPhoto(checklist.id, itemId, photoUrl, token || undefined);
      toast.dismiss(loadingToast);
      toast.success('Photo deleted');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Deletion failed');
    }
  };

  const handlePhotosRearrange = async (itemId: string, photoUrls: string[]) => {
    if (!checklist || permission !== 'edit') return;
    try {
      await updateItemPhotosOrder(checklist.id, itemId, photoUrls, token || undefined);
    } catch (error) {
      console.error('Reorder failed:', error);
      toast.error('Failed to save photo order');
    }
  };

  const handleToggleCollapse = async (itemId: string, collapsed: boolean) => {
    if (!checklist) return;
    try {
      await toggleItemCollapse(checklist.id, itemId, collapsed, token || undefined);
    } catch (error) {
      console.error('Failed to toggle collapse:', error);
    }
  };

  const nestItems = (allItems: ChecklistItem[], parentId: string | null = null): ChecklistItem[] => {
    return allItems
      .filter(i => i.parentId === parentId)
      .sort((a, b) => a.position - b.position)
      .map(i => ({ ...i, children: nestItems(allItems, i.id) }));
  };

  const flattenItems = (nested: ChecklistItem[], level: number = 0): { item: ChecklistItem, level: number }[] => {
    let result: { item: ChecklistItem, level: number }[] = [];
    nested.forEach(item => {
      result.push({ item, level });
      if (item.children && !item.isCollapsed) {
        result = [...result, ...flattenItems(item.children, level + 1)];
      }
    });
    return result;
  };

  const handleExportPDF = async () => {
    if (!checklist) return;
    const toastId = toast.loading("Initializing PDF Generation...");
    
    try {
      await exportChecklistToPDF({
        checklist,
        items: flattenedItems,
        onProgress: (progress, status) => {
          toast.loading(status, { id: toastId });
        }
      });
      toast.success("Audit Report generated successfully", { id: toastId });
    } catch (error) {
      console.error("PDF Export failed:", error);
      toast.error("Failed to generate PDF Report", { id: toastId });
    }
  };

  const handleCopyMarkdown = () => {
    if (items.length === 0) {
      toast.error('Nothing to copy');
      return;
    }
    const md = generateMarkdown(items);
    navigator.clipboard.writeText(md);
    toast.success('Checklist copied as Markdown');
  };

  const handlePasteMarkdown = async (text: string) => {
    if (!checklist || !token || permission !== 'edit') return;
    const parsed = parseMarkdown(text);
    if (parsed.length === 0) return;

    try {
      const batch = writeBatch(db);
      const idMap: { [level: number]: string } = {};
      let currentMaxPos = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;

      for (const item of parsed) {
        const itemRef = doc(collection(db, 'checklists', checklist.id, 'items'));
        const parentId = item.level > 0 ? idMap[item.level - 1] : null;
        
        batch.set(itemRef, {
          checklistId: checklist.id,
          text: item.text,
          description: item.description || '',
          outcome: item.outcome || 'none',
          isDone: item.isDone,
          photoUrl: null,
          photoUrls: [],
          isCollapsed: false,
          position: currentMaxPos++,
          parentId: parentId || null,
          shareToken: token,
          createdAt: serverTimestamp()
        });
        
        idMap[item.level] = itemRef.id;
      }
      
      await batch.commit();
      toast.success(`Imported ${parsed.length} items`);
    } catch (error) {
      console.error('Paste failed:', error);
      toast.error('Failed to parse and add items');
    }
  };

  const onPasteInput = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('- [ ]') || text.includes('- [x]') || text.split('\n').length > 1) {
      e.preventDefault();
      handlePasteMarkdown(text);
      setNewItemText('');
    }
  };

  const nestedItems = nestItems(items);
  const flattenedItems = flattenItems(nestedItems);
  const totalItems = items.length;
  const doneItems = items.filter(i => i.isDone).length;
  const progress = totalItems > 0 ? (doneItems / totalItems) * 100 : 0;

  if (loading) return <div className="p-10 text-center font-sans h-screen flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
      <p className="font-black uppercase tracking-widest text-xs text-slate-400">Loading Protocol...</p>
    </div>
  </div>;

  if (!checklist) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground p-6 bg-slate-50">
      <Package className="w-12 h-12 mb-4 opacity-20" />
      <p className="font-black uppercase tracking-widest text-xs text-slate-400 mb-6">Unauthorized access or link expired</p>
      <Button variant="outline" className="border-2 border-slate-900 bento-button" onClick={() => navigate('/')}>Return Home</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-3 md:p-4 rounded-2xl border-2 border-slate-900 shadow-bento gap-4 w-full overflow-hidden">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl md:text-2xl border-2 border-slate-900 shrink-0">✓</div>
             <h1 className="text-lg md:text-xl font-black tracking-tight uppercase truncate">Checkify <span className="text-indigo-600">Share</span></h1>
          </div>
          <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
             <Button variant="outline" onClick={handleCopyMarkdown} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 flex-1 sm:flex-none">
               <Copy className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" /> Copy MD
             </Button>
             <Button variant="outline" onClick={handleExportPDF} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 flex-1 sm:flex-none">
               <FileDown className="w-3.5 h-3.5 md:w-4 md:h-4 mr-2" /> export
             </Button>
             <Badge variant="outline" className="bento-button bg-slate-900 text-white text-[9px] md:text-[10px] px-3 md:px-4 h-8 md:h-9 shadow-none flex-1 sm:flex-none justify-center">
                Access: {permission === 'edit' ? 'Edit' : 'View'}
             </Badge>
          </div>
        </div>

        {shareMetadata && (shareMetadata.isPublic || shareMetadata.comment) && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border-2 border-slate-900 rounded-3xl p-6 shadow-bento flex flex-col md:flex-row gap-8"
          >
            {shareMetadata.isPublic && shareMetadata.sharedByName && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 border-2 border-indigo-200">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shared By</p>
                  <p className="font-black uppercase tracking-tight text-slate-900">{shareMetadata.sharedByName}</p>
                </div>
              </div>
            )}
            {shareMetadata.comment && (
              <div className="flex items-start gap-4 flex-1 bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200">
                <MessageSquare className="w-5 h-5 text-indigo-600 shrink-0 mt-1" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Comment / Instructions</p>
                  <p className="text-sm font-bold text-slate-600 leading-relaxed italic">"{shareMetadata.comment}"</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        <Card className="bento-card bg-white shadow-bento-lg overflow-hidden border-2 w-full max-w-full">
          <CardHeader className="space-y-6 p-4 md:p-8 border-b-2 border-slate-900 bg-white overflow-hidden w-full">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-6 w-full">
              <div className="space-y-2 min-w-0 flex-1 w-full">
                <CardTitle className="text-xl md:text-3xl font-black uppercase tracking-tight break-words">{checklist.title}</CardTitle>
                <p className="text-sm md:text-base text-slate-500 font-medium italic leading-snug break-words">{checklist.description || 'Public verification audit shared with you.'}</p>
              </div>
              <Badge className="px-3 md:px-4 py-1.5 rounded-full border-2 border-slate-900 font-black uppercase text-[9px] md:text-xs bg-slate-900 text-white shadow-none self-start shrink-0">
                {checklist.status}
              </Badge>
            </div>
          
            <div className="space-y-3 bg-slate-50 p-3 md:p-6 rounded-xl md:rounded-2xl border-2 border-slate-900 w-full overflow-hidden shrink-0">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 w-full overflow-hidden">
                <span className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">Shared Progress Tracking</span>
                </span>
                <span className="bg-white border-2 border-slate-900 px-2 md:px-3 py-1 rounded-full text-slate-900 shadow-sm self-start sm:self-center shrink-0">{doneItems} / {totalItems}</span>
              </div>
              <div className="h-3 md:h-4 w-full bg-white border-2 border-slate-900 rounded-full overflow-hidden">
                 <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${progress}%` }}
                   className="h-full bg-emerald-500" 
                 />
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 bg-slate-50/50">
            <div className="p-4 md:p-8 space-y-4 overflow-x-hidden">
              <AnimatePresence mode="popLayout">
                {flattenedItems.map(({ item, level }) => (
                  <ChecklistItemRow 
                    key={item.id} 
                    item={item} 
                    indent={level}
                    readOnly={permission !== 'edit'}
                    onToggle={(id) => toggleItem(items.find(i => i.id === id)!)}
                    onUpdate={(id, updates) => checklist && updateItem(checklist.id, id, updates, token || undefined)} 
                    onDelete={() => {}}
                    onIndent={() => {}}
                    onAddSubItem={() => {}}
                    onPhotoUpload={handlePhotoUpload}
                    onPhotoDelete={handlePhotoDelete}
                    onPhotosRearrange={handlePhotosRearrange}
                    onToggleCollapse={handleToggleCollapse}
                    userId={currentUser?.uid}
                    userName={currentUser?.isAnonymous ? 'Guest Auditor' : (currentUser?.displayName || 'Collaborator')}
                    checklistId={checklist.id}
                  />
                ))}
              </AnimatePresence>

              {permission === 'edit' && (
                <form onSubmit={handleAddItem} className="mt-8 pt-8 border-t-2 border-dashed border-slate-200 group">
                  <div className="relative">
                    <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300 group-focus-within:text-indigo-600 transition-colors" />
                    <Input 
                      className="pl-12 h-14 bg-white border-2 border-slate-900 rounded-2xl shadow-sm focus-visible:ring-indigo-600/20 text-base font-bold"
                      placeholder="Contribute a new audit item... (Paste MD allowed)"
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onPaste={onPasteInput}
                    />
                  </div>
                </form>
              )}
            </div>
          </CardContent>

          <div className="px-4 md:px-8 py-3 md:py-4 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-400 border-2 border-slate-50 flex items-center justify-center text-[10px] font-black text-slate-900 italic shrink-0">G</div>
                <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase opacity-70">Guest Identity Active</p>
              </div>
              <div className="flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                 <p className="text-[9px] md:text-[10px] font-black uppercase">Live Shared Sync</p>
              </div>
          </div>
        </Card>

        <p className="text-center font-black uppercase tracking-widest text-[10px] text-slate-400">
          Secured by Checkify Pro. Private verification checklists with photo proof.
        </p>
      </div>
    </div>
  );
}
