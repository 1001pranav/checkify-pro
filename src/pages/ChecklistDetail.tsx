import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToItems, 
  updateItem, 
  addItem, 
  deleteItem, 
  updateChecklist, 
  uploadItemPhotos,
  deleteItemPhoto,
  updateItemPhotosOrder,
  cascadeComplete,
  createShare,
  toggleItemCollapse,
  subscribeToShares,
  updateSharePermission,
  deleteShare
} from '@/src/services/db';
import { exportChecklistToPDF } from '@/src/services/pdfExport';
import { Checklist, ChecklistItem, ChecklistShare } from '@/src/types';
import { db } from '@/src/lib/firebase';
import { doc, Timestamp, writeBatch, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  ArrowLeft, 
  CheckCircle2, 
  Share2, 
  FileDown, 
  User,
  Archive,
  Undo2,
  Copy
} from 'lucide-react';

import { toast } from 'sonner';
import { motion } from 'motion/react';
import Navbar from '@/src/components/Navbar';
import { ChecklistItemRow } from '@/src/components/Checklist/ChecklistItemRow';
import { ShareProtocolDialog } from '@/src/components/Checklist/ShareProtocolDialog';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { generateMarkdown, parseMarkdown } from '@/src/lib/markdownUtils';
import { collection, serverTimestamp } from 'firebase/firestore';

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState<ChecklistShare[]>([]);
  const [projectToken, setProjectToken] = useState<string | null>(null);
  
  const [sharingOptions, setSharingOptions] = useState({
    permission: 'view' as 'view' | 'edit',
    isPublic: true,
    sharedByName: '',
    comment: ''
  });
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    // Subscribe to checklist metadata
    const unsubscribeChecklist = onSnapshot(doc(db, 'checklists', id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setChecklist({ id: snap.id, ...data } as Checklist);
        
        // Check for project share token if checklist belongs to a project
        if (data.projectId) {
          const token = sessionStorage.getItem(`project_share_${data.projectId}`);
          if (token) setProjectToken(token);
        }
      } else {
        toast.error('Checklist not found');
        navigate('/');
      }
    });

    return () => unsubscribeChecklist();
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;

    // Wait until we have the project token if needed (or just use what's in state)
    const unsubscribeItems = subscribeToItems(id, (data: ChecklistItem[]) => {
      setItems(data);
      setLoading(false);
    });

    // Subscribe to shares (only if user is owner usually, but rules handle it)
    let unsubscribeShares = () => {};
    if (user && checklist?.userId === user.uid) {
      unsubscribeShares = subscribeToShares(id, (data: ChecklistShare[]) => {
        setShares(data);
      });
    }

    return () => {
      unsubscribeItems();
      unsubscribeShares();
    };
  }, [id, user, checklist?.id, checklist?.userId, checklist?.shareToken, projectToken]);

  // Auto-complete logic
  useEffect(() => {
    if (!checklist || items.length === 0 || checklist.status !== 'active') return;
    const allDone = items.every(item => item.isDone);
    if (allDone) {
      updateChecklist(checklist.id, { status: 'completed', completedAt: Timestamp.now() });
      toast.success('Checklist completed!', {
        action: {
          label: 'Undo',
          onClick: () => updateChecklist(checklist.id, { status: 'active', completedAt: null })
        }
      });
    }
  }, [items, checklist]);

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
    if (!id) return;
    const parsed = parseMarkdown(text);
    if (parsed.length === 0) return;

    if (parsed.length > 20) {
      toast.info(`Importing ${parsed.length} items...`);
    }

    try {
      const batch = writeBatch(db);
      const idMap: { [level: number]: string } = {};
      let currentMaxPos = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;

      for (const item of parsed) {
        const itemRef = doc(collection(db, 'checklists', id, 'items'));
        // Find parent: the last item at level - 1
        const parentId = item.level > 0 ? idMap[item.level - 1] : null;
        
        batch.set(itemRef, {
          checklistId: id,
          text: item.text,
          isDone: item.isDone,
          photoUrl: null,
          photoUrls: [],
          isCollapsed: false,
          position: currentMaxPos++,
          parentId: parentId || null,
          shareToken: projectToken || checklist?.shareToken || null,
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
      // If it looks like MD or is multi-line, handle it specially
      e.preventDefault();
      handlePasteMarkdown(text);
      setNewItemText('');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !id) return;
    const position = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
    const tokenToUse = projectToken || checklist?.shareToken;
    await addItem(id, newItemText.trim(), position, null, tokenToUse || undefined);
    setNewItemText('');
  };

  const handleAddSubItem = async (parentId: string) => {
    if (!id) return;
    const children = items.filter(i => i.parentId === parentId);
    const position = children.length > 0 ? Math.max(...children.map(c => c.position)) + 1 : 0;
    const tokenToUse = projectToken || checklist?.shareToken;
    
    // Create a blank sub-item and focus it immediately for editing
    await addItem(id, 'New sub-task', position, parentId, tokenToUse || undefined);
    toast.success('Sub-task added');
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !id) return;
    
    const { source, destination } = result;
    if (source.index === destination.index) return;

    // Use the flattened items as the source of truth for current visual order
    const reorderedItems: { item: ChecklistItem, level: number }[] = Array.from(flattenedItems);
    const [removedEntry] = reorderedItems.splice(source.index, 1);
    reorderedItems.splice(destination.index, 0, removedEntry);

    const batch = writeBatch(db);
    
    // Update positions based on the new visual order
    reorderedItems.forEach((entry, index) => {
      // We only update the position relative to all items for simplicity in this flat-view DND
      // Note: This effectively makes the list "flat" in terms of position sorting,
      // but parentId relationships are preserved unless we add logic to change them.
      batch.update(doc(db, 'checklists', id, 'items', entry.item.id), { 
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

  const toggleItem = async (item: ChecklistItem) => {
    if (!id) return;
    const newStatus = !item.isDone;
    const tokenToUse = projectToken || checklist?.shareToken;
    await updateItem(id, item.id, { isDone: newStatus }, tokenToUse || undefined);
    if (newStatus) {
      // Cascade complete
      await cascadeComplete(id, item.id, items);
    }
  };

  const handleIndentChange = async (item: ChecklistItem, direction: 'in' | 'out') => {
    if (direction === 'in') {
      await handleIndent(item);
    } else {
      await handleOutdent(item);
    }
  };

  const handleIndent = async (item: ChecklistItem) => {
    if (!id) return;
    const siblings = items.filter(i => i.parentId === item.parentId);
    const index = siblings.findIndex(i => i.id === item.id);
    if (index > 0) {
      const previousSibling = siblings[index - 1];
      await updateItem(id, item.id, { parentId: previousSibling.id }, projectToken || checklist?.shareToken || undefined);
    }
  };

  const handleOutdent = async (item: ChecklistItem) => {
    if (!id) return;
    if (!item.parentId) return;
    const parent = items.find(i => i.id === item.parentId);
    await updateItem(id, item.id, { parentId: parent?.parentId || null }, projectToken || checklist?.shareToken || undefined);
  };

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const loadingToast = toast.loading(files.length > 1 ? `Uploading ${files.length} photos...` : 'Uploading photo...');
    try {
      await uploadItemPhotos(id, itemId, files, checklist?.shareToken || undefined);
      toast.dismiss(loadingToast);
      toast.success(files.length > 1 ? `${files.length} photos uploaded` : 'Photo uploaded');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Upload failed');
    }
  };

  const handlePhotoDelete = async (itemId: string, photoUrl: string) => {
    if (!id) return;
    const loadingToast = toast.loading('Deleting photo...');
    try {
      await deleteItemPhoto(id, itemId, photoUrl, checklist?.shareToken || undefined);
      toast.dismiss(loadingToast);
      toast.success('Photo deleted');
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Deletion failed');
    }
  };

  const handlePhotosRearrange = async (itemId: string, photoUrls: string[]) => {
    if (!id) return;
    try {
      await updateItemPhotosOrder(id, itemId, photoUrls, checklist?.shareToken || undefined);
    } catch (error) {
      console.error('Reorder failed:', error);
      toast.error('Failed to save photo order');
    }
  };

  const handleToggleCollapse = async (itemId: string, collapsed: boolean) => {
    if (!id) return;
    try {
      await toggleItemCollapse(id, itemId, collapsed, checklist?.shareToken || undefined);
    } catch (error) {
      console.error('Failed to toggle collapse:', error);
      toast.error('Failed to save state');
    }
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

  const handleShare = async () => {
    if (!id || !user) return;
    setIsCreatingShare(true);
    try {
      const token = await createShare(id, user.uid, sharingOptions.permission, {
        isPublic: sharingOptions.isPublic,
        sharedByName: sharingOptions.sharedByName,
        comment: sharingOptions.comment
      });
      const url = `${window.location.origin}/share/${token}`;
      setShareLink(url);
    } catch {
      toast.error('Sharing failed');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const openShareDialog = () => {
    setShareLink('');
    setIsShareDialogOpen(true);
  };

  const handleUpdateSharePermission = async (token: string, permission: 'view' | 'edit') => {
    try {
      await updateSharePermission(token, permission);
      toast.success('Permission updated');
    } catch {
      toast.error('Update failed');
    }
  };

  const handleDeleteShare = async (token: string) => {
    if (!id) return;
    try {
      await deleteShare(token, id);
      toast.success('Share link deleted');
    } catch {
      toast.error('Deletion failed');
    }
  };

  const nestItems = (allItems: ChecklistItem[], parentId: string | null = null): ChecklistItem[] => {
    return allItems
      .filter(i => i.parentId === parentId)
      .sort((a, b) => a.position - b.position)
      .map(i => ({ ...i, children: nestItems(allItems, i.id) }));
  };

  const nestedItems = useMemo(() => nestItems(items), [items]);

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

  const flattenedItems = useMemo<{ item: ChecklistItem, level: number }[]>(() => flattenItems(nestedItems), [nestedItems]);

  const totalItems = items.length;
  const doneItems = items.filter(i => i.isDone).length;
  const progress = totalItems > 0 ? (doneItems / totalItems) * 100 : 0;

  if (loading) return <div className="p-10 text-center font-sans">Loading details...</div>;
  if (!checklist) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 overflow-x-hidden w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3 md:p-4 rounded-2xl border-2 border-slate-900 shadow-bento gap-4 w-full overflow-hidden shrink-0">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Button 
            variant="ghost" 
            onClick={() => {
              if (projectToken) {
                navigate(`/project-share/${projectToken}`);
              } else if (checklist.projectId) {
                navigate(`/project/${checklist.projectId}`);
              } else {
                navigate('/');
              }
            }} 
            className="h-9 w-9 md:h-10 md:w-10 p-0 rounded-xl hover:bg-slate-100 border-2 border-transparent hover:border-slate-900 transition-all shrink-0"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <div className="h-6 w-[2px] bg-slate-100 hidden md:block"></div>
          <div className="flex flex-col min-w-0 flex-1">
            <Input 
              className="text-xs md:text-sm font-black uppercase tracking-tight text-slate-900 border-none p-0 focus-visible:ring-0 h-auto bg-transparent truncate w-full hover:bg-slate-50 transition-colors"
              defaultValue={checklist.title}
              onBlur={(e) => updateChecklist(checklist.id!, { title: e.target.value })}
            />
            <Input 
              className="text-[9px] md:text-[10px] font-medium text-slate-400 border-none p-0 focus-visible:ring-0 h-auto bg-transparent italic leading-tight truncate w-full hover:bg-slate-50 transition-colors"
              placeholder="Add description..."
              defaultValue={checklist.description || ''}
              onBlur={(e) => updateChecklist(checklist.id!, { description: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
           <Button variant="outline" onClick={openShareDialog} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
             <Share2 className="w-3 h-3 md:w-4 md:h-4 mr-2" /> Share
           </Button>
           <Button variant="outline" onClick={handleCopyMarkdown} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
             <Copy className="w-3 h-3 md:w-4 md:h-4 mr-2" /> Copy MD
           </Button>
           <Button variant="outline" onClick={handleExportPDF} className="bento-button bg-white text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shrink-0">
             <FileDown className="w-3 h-3 md:w-4 md:h-4 mr-2" /> export
           </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex -space-x-3">
          {[1, 2].map((i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-slate-400">
              <User className="w-4 h-4" />
            </div>
          ))}
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {checklist.shareToken ? 'Live Collaboration Link Active' : 'No public collaborators'}
        </p>
      </div>

      <Card className="bento-card bg-white shadow-bento-lg overflow-hidden border-2 w-full max-w-full">
        <CardHeader className="space-y-6 p-4 md:p-8 border-b-2 border-slate-900 bg-white overflow-hidden w-full">
          <div className="space-y-3 bg-slate-50 p-3 md:p-6 rounded-xl md:rounded-2xl border-2 border-slate-900 w-full overflow-hidden shrink-0">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 w-full overflow-hidden">
              <span className="flex items-center gap-2 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600 shrink-0" />
                <span className="truncate">Overall Verification Progress</span>
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

          <div className="flex flex-wrap gap-2 md:gap-3">
            {checklist.status === 'completed' ? (
              <Button onClick={() => updateChecklist(checklist.id, { status: 'active', completedAt: null })} className="bento-button bg-white text-slate-900 text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                <Undo2 className="w-4 h-4 mr-2" /> Reopen Audit
              </Button>
            ) : (
              <Button onClick={() => updateChecklist(checklist.id, { status: 'completed', completedAt: Timestamp.now() })} className="bento-button bg-emerald-500 text-white text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Audit
              </Button>
            )}
            <Button variant="ghost" onClick={() => updateChecklist(checklist.id, { status: 'archived' })} className="bento-button bg-white text-slate-900 text-[9px] md:text-[10px] h-9 md:h-10 px-4 md:px-6">
              <Archive className="w-4 h-4 mr-2" /> Archive
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 bg-slate-50/50">
          <div className="p-4 md:p-8 space-y-4 overflow-x-hidden">
            {flattenedItems.length === 0 && (
              <div className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest border-4 border-dashed border-slate-200 rounded-3xl">
                 No items found for this audit
              </div>
            )}
            
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="checklist-items">
                {(provided) => (
                  <div 
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-4"
                  >
                    {flattenedItems.map(({ item, level }, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(provided, snapshot) => (
                          <ChecklistItemRow 
                            item={item} 
                            indent={level}
                            provided={provided}
                            isDragging={snapshot.isDragging}
                            onToggle={(id) => toggleItem(items.find(i => i.id === id)!)}
                            onIndent={(id, direction) => handleIndentChange(items.find(i => i.id === id)!, direction)}
                            onAddSubItem={handleAddSubItem}
                            onDelete={(id) => deleteItem(checklist.id, id)}
                            onUpdateText={(id, text) => updateItem(checklist.id, id, { text }, projectToken || checklist?.shareToken || undefined)}
                            onPhotoUpload={handlePhotoUpload}
                            onPhotoDelete={handlePhotoDelete}
                            onPhotosRearrange={handlePhotosRearrange}
                            onToggleCollapse={handleToggleCollapse}
                            userId={user?.uid}
                            userName={user?.displayName || user?.email?.split('@')[0] || 'User'}
                            checklistId={checklist.id}
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
              <div className="w-8 h-8 rounded-full bg-amber-400 border-2 border-slate-50 flex items-center justify-center text-[10px] font-black text-slate-900 italic shrink-0">AR</div>
              <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase opacity-70 truncate max-w-[200px]">{user?.email}</p>
            </div>
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
               <p className="text-[9px] md:text-[10px] font-black uppercase">Live Updates Enabled</p>
            </div>
        </div>
      </Card>

      <form onSubmit={handleAddItem} className="group">
        <div className="relative">
          <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300 group-focus-within:text-indigo-600 transition-colors" />
          <Input 
            className="pl-12 h-14 bg-white border-2 border-slate-900 rounded-2xl shadow-sm focus-visible:ring-indigo-600/20 text-base font-bold"
            placeholder="Add a new task or verification item... (Paste MD allowed)"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onPaste={onPasteInput}
          />
        </div>
      </form>

      <ShareProtocolDialog 
        isOpen={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        options={sharingOptions}
        setOptions={setSharingOptions}
        shareLink={shareLink}
        setShareLink={setShareLink}
        onGenerate={handleShare}
        loading={isCreatingShare}
        shares={shares}
        onUpdatePermission={handleUpdateSharePermission}
        onDeleteShare={handleDeleteShare}
      />
      </div>
    </div>
  );
}
