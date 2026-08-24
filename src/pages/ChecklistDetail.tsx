import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToItems, 
  updateItem, 
  addItem, 
  deleteItem, 
  updateChecklist, 
  deleteChecklist,
  uploadItemPhotos,
  deleteItemPhoto,
  updateItemPhotosOrder,
  toggleItemCollapse,
  subscribeToShareConfig
} from '@/src/services/db';
import { exportChecklistToPDF } from '@/src/services/pdfExport';
import { Checklist, ChecklistItem, ShareConfig } from '@/src/types';
import { db } from '@/src/lib/firebase';
import { doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { 
  Plus, 
  ArrowLeft, 
  CheckCircle2, 
  Share2, 
  FileDown, 
  Undo2, 
  Copy, 
  Trash2,
  ChevronDown,
  ChevronRight,
  Camera,
  Check,
  X,
  FileText,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/src/components/Navbar';
import { ConfirmDeleteModal } from '@/src/components/ConfirmDeleteModal';
import { ChecklistItemRow } from '@/src/components/Checklist/ChecklistItemRow';
import { ShareModal } from '@/src/components/ShareModal';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { generateMarkdown } from '@/src/lib/markdownUtils';
import { cn } from '@/lib/utils';

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareConfig, setShareConfig] = useState<ShareConfig | null>(null);
  const [projectToken, setProjectToken] = useState<string | null>(null);
  
  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCompletedSectionCollapsed, setIsCompletedSectionCollapsed] = useState(false);
  const [focusedOnCollapsedHeader, setFocusedOnCollapsedHeader] = useState(false);
  
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefForSelected = useRef<HTMLInputElement>(null);

  const [isDeleteChecklistDialogOpen, setIsDeleteChecklistDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (authLoading || !id) return;
    
    const unsubscribeChecklist = onSnapshot(doc(db, 'checklists', id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setChecklist({ id: snap.id, ...data } as Checklist);
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
  }, [id, navigate, authLoading]);

  useEffect(() => {
    if (authLoading || !id) return;

    const unsubscribeItems = subscribeToItems(id, (data: ChecklistItem[]) => {
      setItems(data);
      setLoading(false);
      // Default selected item if none selected
      if (!selectedItemId && data.length > 0) {
        const firstActive = data.find(i => !i.isDone);
        setSelectedItemId(firstActive ? firstActive.id : data[0].id);
      }
    });

    const unsubscribeShare = subscribeToShareConfig(id, setShareConfig);

    return () => {
      unsubscribeItems();
      unsubscribeShare();
    };
  }, [id, authLoading, selectedItemId]);

  // Nested structure calculation
  const nestItems = (allItems: ChecklistItem[], parentId: string | null = null): ChecklistItem[] => {
    return allItems
      .filter(i => i.parentId === parentId)
      .sort((a, b) => {
        if (a.isDone !== b.isDone) {
          return a.isDone ? 1 : -1;
        }
        return a.position - b.position;
      })
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

  const activeFlattenedItems = useMemo(() => {
    return flattenedItems.filter(({ item }) => !item.isDone);
  }, [flattenedItems]);

  const completedFlattenedItems = useMemo(() => {
    return flattenedItems.filter(({ item }) => item.isDone);
  }, [flattenedItems]);

  const totalItems = items.length;
  const doneItems = items.filter(i => i.isDone).length;
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Selected item reference
  const currentSelectedItem = useMemo(() => {
    return items.find(i => i.id === selectedItemId) || null;
  }, [items, selectedItemId]);

  // Format step codes (e.g. 01.0, 01.1)
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, string>();
    let majorIndex = 1;
    const majorMap = new Map<string, number>();

    // First pass for root items
    flattenedItems.forEach(({ item, level }) => {
      if (level === 0) {
        majorMap.set(item.id, majorIndex);
        const code = `${String(majorIndex).padStart(2, '0')}.0`;
        map.set(item.id, code);
        majorIndex++;
      } else {
        const parentMajor = item.parentId ? majorMap.get(item.parentId) || 1 : 1;
        const code = `${String(parentMajor).padStart(2, '0')}.${level}`;
        map.set(item.id, code);
      }
    });
    return map;
  }, [flattenedItems]);

  // Keyboard navigation engine (J/K/Space/F/P/M/Enter)
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

    if (e.key === 'Escape') {
      if (isShareDialogOpen) setIsShareDialogOpen(false);
      else if (isDeleteChecklistDialogOpen) setIsDeleteChecklistDialogOpen(false);
      else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (isInput) return;

    // J / Down Arrow: Next item
    if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedOnCollapsedHeader) {
        setFocusedOnCollapsedHeader(false);
        if (completedFlattenedItems.length > 0 && !isCompletedSectionCollapsed) {
          setSelectedItemId(completedFlattenedItems[0].item.id);
        } else if (activeFlattenedItems.length > 0) {
          setSelectedItemId(activeFlattenedItems[0].item.id);
        }
        return;
      }

      const visibleList = isCompletedSectionCollapsed 
        ? activeFlattenedItems.map(f => f.item)
        : [...activeFlattenedItems.map(f => f.item), ...completedFlattenedItems.map(f => f.item)];

      const currentIndex = visibleList.findIndex(i => i.id === selectedItemId);
      if (currentIndex >= 0 && currentIndex < visibleList.length - 1) {
        setSelectedItemId(visibleList[currentIndex + 1].id);
      }
      return;
    }

    // K / Up Arrow: Previous item or Collapsed Header
    if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
      e.preventDefault();
      const visibleList = isCompletedSectionCollapsed 
        ? activeFlattenedItems.map(f => f.item)
        : [...activeFlattenedItems.map(f => f.item), ...completedFlattenedItems.map(f => f.item)];

      const currentIndex = visibleList.findIndex(i => i.id === selectedItemId);
      if (currentIndex > 0) {
        setSelectedItemId(visibleList[currentIndex - 1].id);
      } else if (currentIndex === 0 && completedFlattenedItems.length > 0 && isCompletedSectionCollapsed) {
        setFocusedOnCollapsedHeader(true);
      }
      return;
    }

    // Space or X: Toggle active item Pass/Complete
    if ((e.key === ' ' || e.key === 'x' || e.key === 'X') && currentSelectedItem && !focusedOnCollapsedHeader) {
      e.preventDefault();
      const newStatus = currentSelectedItem.isDone ? 'pending' : 'pass';
      updateItem(id!, currentSelectedItem.id, {
        isDone: !currentSelectedItem.isDone,
        status: newStatus,
        outcome: newStatus === 'pass' ? 'success' : 'none'
      }, projectToken || undefined);
      return;
    }

    // F: Toggle Fail / Defect
    if ((e.key === 'f' || e.key === 'F') && currentSelectedItem && !focusedOnCollapsedHeader) {
      e.preventDefault();
      const newStatus = currentSelectedItem.status === 'fail' ? 'pending' : 'fail';
      updateItem(id!, currentSelectedItem.id, {
        isDone: newStatus === 'fail',
        status: newStatus,
        outcome: newStatus === 'fail' ? 'failure' : 'none'
      }, projectToken || undefined);
      return;
    }

    // P: Trigger Photo Upload
    if ((e.key === 'p' || e.key === 'P') && currentSelectedItem && !focusedOnCollapsedHeader) {
      e.preventDefault();
      fileInputRefForSelected.current?.click();
      return;
    }

    // Enter on Collapsed Header toggles expansion
    if (e.key === 'Enter' && focusedOnCollapsedHeader) {
      e.preventDefault();
      setIsCompletedSectionCollapsed(prev => !prev);
      setFocusedOnCollapsedHeader(false);
      return;
    }

    // N or /: Focus new item input
    if (e.key === 'n' || e.key === 'N' || e.key === '/') {
      e.preventDefault();
      newItemInputRef.current?.focus();
      return;
    }
  }, [
    isShareDialogOpen, 
    isDeleteChecklistDialogOpen, 
    focusedOnCollapsedHeader, 
    isCompletedSectionCollapsed, 
    activeFlattenedItems, 
    completedFlattenedItems, 
    selectedItemId, 
    currentSelectedItem, 
    id, 
    projectToken
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const handleCopyMarkdown = () => {
    if (items.length === 0) {
      toast.error('No items to copy');
      return;
    }
    const md = generateMarkdown(items);
    navigator.clipboard.writeText(md);
    toast.success('Audit log copied as Markdown');
  };

  const handleExportPDF = async () => {
    if (!checklist || items.length === 0) {
      toast.error('Checklist has no items to export');
      return;
    }
    setExportingPdf(true);
    try {
      await exportChecklistToPDF({ checklist, items: flattenedItems });
      toast.success('Inspection Audit PDF generated');
    } catch (err: unknown) {
      console.error('PDF Export Error:', err);
      toast.error('PDF export failed: ' + (err instanceof Error ? err.message : 'Try copying as Markdown'));
    } finally {
      setExportingPdf(false);
    }
  };

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id) return;
    const textToAdd = newItemText.trim() || 'New inspection criterion';
    const position = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
    try {
      const newItem = await addItem(id, textToAdd, position, null, projectToken || undefined);
      if (newItem) {
        setAutoFocusItemId(newItem.id);
        setSelectedItemId(newItem.id);
        toast.success('Step added');
      }
    } catch {
      toast.error('Failed to create step');
    }
    setNewItemText('');
  };

  const handleAddSubItem = async (parentId: string) => {
    if (!id) return;
    const children = items.filter(i => i.parentId === parentId);
    const position = children.length > 0 ? Math.max(...children.map(c => c.position)) + 1 : 0;
    const newItem = await addItem(id, 'New sub-step', position, parentId, projectToken || undefined);
    if (newItem) {
      setAutoFocusItemId(newItem.id);
      setSelectedItemId(newItem.id);
      toast.success('Sub-step added');
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !id) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const visibleItems = isCompletedSectionCollapsed 
      ? activeFlattenedItems.map(f => f.item)
      : [...activeFlattenedItems.map(f => f.item), ...completedFlattenedItems.map(f => f.item)];

    const itemMoved = visibleItems[source.index];
    if (!itemMoved) return;

    const newPosition = destination.index;
    try {
      await updateItem(id, itemMoved.id, { position: newPosition }, projectToken || undefined);
    } catch {
      toast.error('Failed to update step order');
    }
  };

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const toastId = toast.loading(`Processing ${files.length} verification photos...`);
    try {
      await uploadItemPhotos(id, itemId, files, projectToken || undefined);
      toast.success('Photo proof attached', { id: toastId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed', { id: toastId });
    }
  };

  const handlePhotoDelete = async (itemId: string, photoUrl: string) => {
    if (!id) return;
    try {
      await deleteItemPhoto(id, itemId, photoUrl, projectToken || undefined);
      toast.success('Photo proof removed');
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  const handlePhotosRearrange = async (itemId: string, newUrls: string[]) => {
    if (!id) return;
    try {
      await updateItemPhotosOrder(id, itemId, newUrls, projectToken || undefined);
    } catch {
      toast.error('Failed to reorder photos');
    }
  };

  const handleToggleCollapse = async (itemId: string, isCollapsed: boolean) => {
    if (!id) return;
    try {
      await toggleItemCollapse(id, itemId, isCollapsed, projectToken || undefined);
    } catch {
      toast.error('Failed to toggle collapse');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-5xl mx-auto p-6 space-y-4">
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!checklist) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-28 sm:pb-16 font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto p-3 sm:p-6 md:p-8 space-y-6">
        {/* Top Header Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (projectToken) navigate(`/project-share/${projectToken}`);
                else if (checklist.projectId) navigate(`/project/${checklist.projectId}`);
                else navigate('/');
              }}
              className="h-9 w-9 rounded-lg border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors shrink-0"
              title="Return to Dashboard (Esc)"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex-1">
              <input
                className="w-full text-base sm:text-lg font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 outline-none truncate"
                defaultValue={checklist.title}
                onBlur={(e) => updateChecklist(checklist.id, { title: e.target.value.trim() || 'Untitled Inspection' })}
              />
              <input
                className="w-full text-xs text-slate-500 bg-transparent border-none p-0 focus:ring-0 outline-none truncate placeholder:text-slate-400"
                placeholder="Add audit scope, standard reference, or inspector notes..."
                defaultValue={checklist.description || ''}
                onBlur={(e) => updateChecklist(checklist.id, { description: e.target.value.trim() })}
              />
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setIsShareDialogOpen(true)}
              className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy MD</span>
            </button>

            <button
              type="button"
              disabled={exportingPdf}
              onClick={handleExportPDF}
              className="h-8 px-3 rounded-lg border border-slate-900 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>

            {checklist.status === 'completed' ? (
              <button
                type="button"
                onClick={() => updateChecklist(checklist.id, { status: 'active', completedAt: null })}
                className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Reopen</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateChecklist(checklist.id, { status: 'completed', completedAt: Timestamp.now() })}
                className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold font-mono flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDeleteChecklistDialogOpen(true)}
              className="h-8 w-8 rounded-lg border border-transparent hover:border-red-200 text-slate-400 hover:text-red-700 hover:bg-red-50 flex items-center justify-center transition-colors"
              title="Delete Checklist"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Verification Progress Banner */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              {doneItems}/{totalItems} <span className="text-slate-500 text-xs">({progress}%)</span>
            </div>
            <div className="text-xs text-slate-600 font-medium">
              {doneItems === totalItems && totalItems > 0 ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 stroke-[3]" /> All inspection steps verified
                </span>
              ) : (
                <span>{totalItems - doneItems} steps remaining to audit</span>
              )}
            </div>
          </div>

          <div className="w-full sm:w-48 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className="h-full bg-emerald-700 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Collapsed Completed Section */}
        {completedFlattenedItems.length > 0 && (
          <div 
            className={cn(
              "rounded-xl border transition-all duration-150 overflow-hidden",
              focusedOnCollapsedHeader ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 bg-white"
            )}
          >
            <button
              type="button"
              onClick={() => setIsCompletedSectionCollapsed(!isCompletedSectionCollapsed)}
              className="w-full p-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                {isCompletedSectionCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
                <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {completedFlattenedItems.length} Verified {completedFlattenedItems.length === 1 ? 'Step' : 'Steps'}
                </span>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                  PASS
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {isCompletedSectionCollapsed ? 'Click to show verified' : 'Click to hide'}
              </span>
            </button>

            {!isCompletedSectionCollapsed && (
              <div className="p-3 bg-slate-50/50 space-y-2 border-t border-slate-200">
                {completedFlattenedItems.map(({ item, level }) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    indexCode={itemIndexMap.get(item.id) || '00.0'}
                    indent={level}
                    isSelected={selectedItemId === item.id}
                    onSelect={(itemId) => setSelectedItemId(itemId)}
                    onToggle={(itemId, isDone) => {
                      updateItem(checklist.id, itemId, { 
                        isDone: !isDone,
                        status: isDone ? 'pending' : 'pass'
                      }, projectToken || undefined);
                    }}
                    onIndent={(itemId, direction) => {
                      const itemObj = items.find(i => i.id === itemId);
                      if (!itemObj) return;
                      if (direction === 'out' && itemObj.parentId) {
                        const parent = items.find(i => i.id === itemObj.parentId);
                        updateItem(checklist.id, itemId, { parentId: parent?.parentId || null }, projectToken || undefined);
                      }
                    }}
                    onAddSubItem={handleAddSubItem}
                    onDelete={(itemId) => deleteItem(checklist.id, itemId)}
                    onUpdate={(itemId, updates) => updateItem(checklist.id, itemId, updates, projectToken || undefined)}
                    onPhotoUpload={handlePhotoUpload}
                    onPhotoDelete={handlePhotoDelete}
                    onPhotosRearrange={handlePhotosRearrange}
                    onToggleCollapse={handleToggleCollapse}
                    userId={user?.uid}
                    userName={user?.displayName || user?.email?.split('@')[0]}
                    checklistId={checklist.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Checklist Items Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              Active Inspection Criteria ({activeFlattenedItems.length})
            </span>
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              Navigate: <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">J</kbd>/<kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">K</kbd> • Pass: <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">Space</kbd> • Fail: <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">F</kbd>
            </span>
          </div>

          {activeFlattenedItems.length === 0 && completedFlattenedItems.length === 0 && (
            <div className="p-8 bg-white border border-dashed border-slate-300 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Zero inspection steps recorded</p>
                <p className="text-xs text-slate-500 mt-0.5">Add criteria below or paste Markdown checklist specs.</p>
              </div>
            </div>
          )}

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="active-checklist-items">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {activeFlattenedItems.map(({ item, level }, idx) => (
                    <Draggable key={item.id} draggableId={item.id} index={idx}>
                      {(provided, snapshot) => (
                        <ChecklistItemRow
                          item={item}
                          indexCode={itemIndexMap.get(item.id) || '00.0'}
                          indent={level}
                          provided={provided}
                          isDragging={snapshot.isDragging}
                          isSelected={selectedItemId === item.id}
                          onSelect={(itemId) => setSelectedItemId(itemId)}
                          onToggle={(itemId, isDone) => {
                            updateItem(checklist.id, itemId, { 
                              isDone: !isDone,
                              status: isDone ? 'pending' : 'pass',
                              outcome: isDone ? 'none' : 'success'
                            }, projectToken || undefined);
                          }}
                          onIndent={(itemId, direction) => {
                            const itemObj = items.find(i => i.id === itemId);
                            if (!itemObj) return;
                            if (direction === 'in') {
                              // Find previous sibling
                              const currIdx = activeFlattenedItems.findIndex(f => f.item.id === itemId);
                              if (currIdx > 0) {
                                const prevSibling = activeFlattenedItems[currIdx - 1].item;
                                updateItem(checklist.id, itemId, { parentId: prevSibling.id }, projectToken || undefined);
                              }
                            } else {
                              if (itemObj.parentId) {
                                const parent = items.find(i => i.id === itemObj.parentId);
                                updateItem(checklist.id, itemId, { parentId: parent?.parentId || null }, projectToken || undefined);
                              }
                            }
                          }}
                          onAddSubItem={handleAddSubItem}
                          onDelete={(itemId) => deleteItem(checklist.id, itemId)}
                          onUpdate={(itemId, updates) => updateItem(checklist.id, itemId, updates, projectToken || undefined)}
                          onPhotoUpload={handlePhotoUpload}
                          onPhotoDelete={handlePhotoDelete}
                          onPhotosRearrange={handlePhotosRearrange}
                          onToggleCollapse={handleToggleCollapse}
                          autoFocus={autoFocusItemId === item.id}
                          onFocused={() => setAutoFocusItemId(null)}
                          userId={user?.uid}
                          userName={user?.displayName || user?.email?.split('@')[0]}
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

        {/* Quick Add Criterion Input */}
        <form onSubmit={handleAddItem} className="pt-2">
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-300 shadow-xs focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900">
            <Plus className="w-5 h-5 text-slate-400 shrink-0 ml-2" />
            <input
              ref={newItemInputRef}
              className="flex-1 text-sm font-medium text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-400 py-1"
              placeholder="Add next inspection criterion... (Press Enter to save, N to focus)"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
            >
              Add Step
            </button>
          </div>
        </form>
      </main>

      {/* Hidden File Input for Keyboard/Dock Photo Capture */}
      <input
        ref={fileInputRefForSelected}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (selectedItemId) handlePhotoUpload(selectedItemId, e);
        }}
      />

      {/* Mobile Sticky Inspection Dock */}
      <aside aria-label="Mobile Inspection Controls" className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-300 p-2 z-40 shadow-lg">
        <div className="flex items-center justify-between gap-1 max-w-md mx-auto">
          <button
            type="button"
            disabled={!currentSelectedItem}
            onClick={() => fileInputRefForSelected.current?.click()}
            className="flex-1 h-12 rounded-xl border border-slate-200 bg-slate-50 active:bg-slate-100 flex flex-col items-center justify-center text-slate-700"
          >
            <Camera className="w-4 h-4" />
            <span className="text-[10px] font-bold mt-0.5">Photo</span>
          </button>

          <button
            type="button"
            disabled={!currentSelectedItem}
            onClick={() => {
              if (!currentSelectedItem) return;
              const newStatus = currentSelectedItem.status === 'pass' ? 'pending' : 'pass';
              updateItem(checklist.id, currentSelectedItem.id, {
                isDone: newStatus === 'pass',
                status: newStatus,
                outcome: newStatus === 'pass' ? 'success' : 'none'
              }, projectToken || undefined);
            }}
            className={cn(
              "flex-1 h-12 rounded-xl border flex flex-col items-center justify-center transition-colors font-bold",
              currentSelectedItem?.status === 'pass'
                ? "bg-emerald-700 text-white border-emerald-800"
                : "bg-emerald-50 text-emerald-800 border-emerald-300"
            )}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span className="text-[10px] mt-0.5">Pass</span>
          </button>

          <button
            type="button"
            disabled={!currentSelectedItem}
            onClick={() => {
              if (!currentSelectedItem) return;
              const newStatus = currentSelectedItem.status === 'fail' ? 'pending' : 'fail';
              updateItem(checklist.id, currentSelectedItem.id, {
                isDone: newStatus === 'fail',
                status: newStatus,
                outcome: newStatus === 'fail' ? 'failure' : 'none'
              }, projectToken || undefined);
            }}
            className={cn(
              "flex-1 h-12 rounded-xl border flex flex-col items-center justify-center transition-colors font-bold",
              currentSelectedItem?.status === 'fail'
                ? "bg-red-700 text-white border-red-800"
                : "bg-red-50 text-red-800 border-red-300"
            )}
          >
            <X className="w-4 h-4 stroke-[3]" />
            <span className="text-[10px] mt-0.5">Fail</span>
          </button>

          <button
            type="button"
            onClick={() => newItemInputRef.current?.focus()}
            className="flex-1 h-12 rounded-xl border border-slate-900 bg-slate-900 text-white flex flex-col items-center justify-center font-bold"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">New Step</span>
          </button>
        </div>
      </aside>

      {/* Share Dialog */}
      {id && (
        <ShareModal
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          entityType="checklist"
          entityId={id}
          initialConfig={shareConfig}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDeleteModal
        open={isDeleteChecklistDialogOpen}
        onOpenChange={setIsDeleteChecklistDialogOpen}
        title="Delete Checklist?"
        description="Are you sure you want to delete this checklist? All items, comments, and attachments will be permanently removed."
        onConfirm={async () => {
          if (!checklist?.id) return;
          setDeleteLoading(true);
          try {
            await deleteChecklist(checklist.id);
            toast.success('Checklist deleted');
            setIsDeleteChecklistDialogOpen(false);
            navigate(checklist.projectId ? `/project/${checklist.projectId}` : '/');
          } catch (err: unknown) {
            toast.error('Failed to delete: ' + (err instanceof Error ? err.message : 'Unknown error'));
          } finally {
            setDeleteLoading(false);
          }
        }}
        loading={deleteLoading}
      />
    </div>
  );
}
