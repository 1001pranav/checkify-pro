import React, { useState, useEffect, useRef } from 'react';
import { ChecklistItem } from '@/src/types';
import { 
  Camera, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  MessageSquare, 
  Plus, 
  GripVertical, 
  X,
  Check,
  AlertTriangle,
  FileText,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DraggableProvided } from '@hello-pangea/dnd';
import { ItemComments } from './ItemComments';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  indexCode?: string; // e.g. "01.0", "52.0"
  indent: number;
  isSelected?: boolean;
  readOnly?: boolean;
  onToggle?: (id: string, isDone: boolean) => void;
  onUpdate: (id: string, updates: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onIndent: (id: string, direction: 'in' | 'out') => void;
  onAddSubItem: (parentId: string) => void;
  onPhotoUpload: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoDelete?: (itemId: string, photoUrl: string) => void;
  onPhotosRearrange?: (itemId: string, photoUrls: string[]) => void;
  onToggleCollapse?: (itemId: string, isCollapsed: boolean) => void;
  onSelect?: (id: string) => void;
  autoFocus?: boolean;
  onFocused?: () => void;
  userId?: string;
  userName?: string;
  checklistId?: string;
  provided?: DraggableProvided;
  isDragging?: boolean;
}

export const ChecklistItemRow: React.FC<ChecklistItemRowProps> = ({
  item,
  indexCode = '01.0',
  indent,
  isSelected = false,
  readOnly = false,
  onUpdate,
  onDelete,
  onIndent,
  onAddSubItem,
  onPhotoUpload,
  onPhotoDelete,
  onPhotosRearrange,
  onToggleCollapse,
  onSelect,
  autoFocus,
  onFocused,
  userId,
  userName,
  checklistId,
  provided,
  isDragging
}) => {
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(Boolean(item.description));
  const [editNotes, setEditNotes] = useState(item.description || '');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditText(item.text);
  }, [item.text]);

  useEffect(() => {
    setEditNotes(item.description || '');
  }, [item.description]);

  useEffect(() => {
    const derived = Array.from(new Set([
      ...(item.photoUrls || []),
      ...(item.photoUrl ? [item.photoUrl] : [])
    ]));
    if (!isReordering) {
      setLocalPhotos(derived);
    }
  }, [item.photoUrls, item.photoUrl, isReordering]);

  useEffect(() => {
    if (autoFocus) {
      setIsEditing(true);
      onFocused?.();
    }
  }, [autoFocus, onFocused]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editText.trim() !== item.text) {
      onUpdate(item.id, { text: editText.trim() || 'Untitled Step' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setEditText(item.text);
      setIsEditing(false);
    }
  };

  const handleSaveNotes = () => {
    if (editNotes !== (item.description || '')) {
      onUpdate(item.id, { description: editNotes.trim() });
    }
  };

  const handleSetStatus = (newStatus: 'pass' | 'fail' | 'na' | 'pending') => {
    if (readOnly) return;
    const isDone = newStatus === 'pass' || newStatus === 'fail' || newStatus === 'na';
    onUpdate(item.id, {
      status: newStatus,
      isDone: isDone,
      outcome: newStatus === 'pass' ? 'success' : newStatus === 'fail' ? 'failure' : newStatus === 'na' ? 'na' : 'none'
    });
  };

  const handlePhotoUploadWrap = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    try {
      if (e.target.files && e.target.files.length > 0) {
        onPhotoUpload(item.id, e);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Image processing failed. Try a smaller image.');
    }
  };

  const handlePhotosReorder = (newOrder: string[]) => {
    setLocalPhotos(newOrder);
    setIsReordering(true);
    onPhotosRearrange?.(item.id, newOrder);
    setTimeout(() => setIsReordering(false), 1000);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : localPhotos.length - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev < localPhotos.length - 1 ? prev + 1 : 0));
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (previewIndex === null) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setPreviewIndex(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [previewIndex, localPhotos.length]);

  const hasChildren = item.children && item.children.length > 0;
  const currentStatus = item.status || (item.isDone ? (item.outcome === 'failure' ? 'fail' : 'pass') : 'pending');

  return (
    <div 
      className="space-y-1 group/row relative" 
      ref={provided?.innerRef} 
      {...provided?.draggableProps} 
      style={{ 
        ...provided?.draggableProps.style,
        marginLeft: `calc(${indent} * 1.5rem)` 
      }}
      onClick={() => onSelect?.(item.id)}
    >
      <motion.div 
        layout="position"
        className={cn(
          "flex flex-col bg-white border rounded-xl transition-all duration-150 relative",
          isSelected 
            ? "border-slate-900 ring-2 ring-slate-900/10 shadow-sm" 
            : "border-slate-200 hover:border-slate-300",
          item.isDone && currentStatus === 'pass' && "bg-slate-50/70 border-emerald-200/80",
          item.isDone && currentStatus === 'fail' && "bg-red-50/30 border-red-200",
          isDragging && "shadow-xl border-slate-900 z-50 scale-[1.01]"
        )}
      >
        {/* Main Row Content */}
        <div className="p-2.5 sm:p-3 flex items-start sm:items-center gap-2.5 sm:gap-3">
          {/* Drag Handle & Collapse */}
          <div className="flex items-center shrink-0 mt-0.5 sm:mt-0">
            {!readOnly && (
              <div 
                {...provided?.dragHandleProps} 
                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-700 p-1 -ml-1 transition-colors"
                title="Drag to reorder"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse?.(item.id, !item.isCollapsed);
                }}
                className={cn(
                  "h-6 w-6 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-transform",
                  item.isCollapsed ? "rotate-0" : "rotate-90"
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Monospace Step Code Index */}
          <div className="shrink-0 font-mono text-[11px] font-semibold text-slate-500 w-9 select-none">
            {indexCode}
          </div>

          {/* Primary Verification Latch (Pass/Fail/Check) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={readOnly}
              onClick={(e) => {
                e.stopPropagation();
                if (currentStatus === 'pass') {
                  handleSetStatus('pending');
                } else {
                  handleSetStatus('pass');
                }
              }}
              className={cn(
                "min-w-[40px] h-8 px-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-1 select-none border",
                currentStatus === 'pass'
                  ? "bg-emerald-700 text-white border-emerald-800 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-600 hover:text-emerald-700 active:bg-emerald-50"
              )}
              title="Verify Step (Pass)"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span className="text-[10px] hidden sm:inline">PASS</span>
            </button>

            <button
              type="button"
              disabled={readOnly}
              onClick={(e) => {
                e.stopPropagation();
                if (currentStatus === 'fail') {
                  handleSetStatus('pending');
                } else {
                  handleSetStatus('fail');
                }
              }}
              className={cn(
                "min-w-[36px] h-8 px-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-1 select-none border",
                currentStatus === 'fail'
                  ? "bg-red-700 text-white border-red-800 shadow-xs"
                  : "bg-white text-slate-400 border-slate-200 hover:border-red-600 hover:text-red-700 active:bg-red-50"
              )}
              title="Log Defect (Fail)"
            >
              <X className="w-3.5 h-3.5 stroke-[3]" />
              <span className="text-[10px] hidden sm:inline">FAIL</span>
            </button>
          </div>

          {/* Text Title / Inline Edit */}
          <div className="flex-1 min-w-0">
            {isEditing && !readOnly ? (
              <input
                autoFocus
                className={cn(
                  "w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm font-medium text-slate-900 outline-none focus:border-slate-900 focus:bg-white"
                )}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div 
                onClick={(e) => {
                  if (!readOnly) {
                    e.stopPropagation();
                    setIsEditing(true);
                  }
                }}
                className={cn(
                  "text-sm font-medium leading-snug cursor-text select-text transition-colors",
                  item.isDone ? "text-slate-600 line-through decoration-slate-300" : "text-slate-900"
                )}
              >
                {item.text}
              </div>
            )}

            {/* Micro Tags and Badges */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {item.fromTodo && (
                <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  FROM INBOX
                </span>
              )}
              {item.priority && item.priority !== 'low' && (
                <span className={cn(
                  "text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border",
                  item.priority === 'urgent' && "bg-amber-100 text-amber-900 border-amber-300",
                  item.priority === 'high' && "bg-slate-100 text-slate-900 border-slate-300",
                  item.priority === 'medium' && "bg-slate-50 text-slate-700 border-slate-200"
                )}>
                  {item.priority}
                </span>
              )}
              {item.dueDate && (
                <span className="text-[10px] font-mono text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded">
                  <Clock className="w-2.5 h-2.5" />
                  {item.dueDate}
                </span>
              )}
              {localPhotos.length > 0 && (
                <span className="text-[10px] font-mono font-bold text-slate-700 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  <Camera className="w-2.5 h-2.5" />
                  {localPhotos.length} {localPhotos.length === 1 ? 'Proof' : 'Proofs'}
                </span>
              )}
              {item.description && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNotesExpanded(!isNotesExpanded);
                  }}
                  className="text-[10px] font-mono font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                >
                  <FileText className="w-2.5 h-2.5" />
                  Audit Note
                </button>
              )}
            </div>
          </div>

          {/* Action Hub (Touch-friendly & Desktop Responsive) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Direct Camera Trigger */}
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="h-8 min-w-[32px] px-2 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1 text-xs transition-colors"
                title="Attach Photo Proof"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono font-medium hidden md:inline">Photo</span>
              </button>
            )}
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept="image/*" 
              capture="environment"
              multiple
              onChange={handlePhotoUploadWrap} 
            />

            {/* Note Toggle Button */}
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNotesExpanded(!isNotesExpanded);
                }}
                className={cn(
                  "h-8 min-w-[32px] px-2 rounded-lg border flex items-center justify-center gap-1 text-xs transition-colors",
                  isNotesExpanded || item.description
                    ? "bg-slate-100 text-slate-900 border-slate-400 font-medium"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                )}
                title="Toggle Audit Note Field"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono font-medium hidden md:inline">Note</span>
              </button>
            )}

            {/* Comments Popover */}
            {checklistId && userId && (
              <Popover open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "h-8 min-w-[32px] px-2 rounded-lg border flex items-center justify-center gap-1 text-xs transition-colors",
                        item.commentCount
                          ? "bg-slate-100 text-slate-900 border-slate-300 font-bold"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                      )}
                      title="Item Comments"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {!!item.commentCount && (
                        <span className="text-[10px] font-mono font-bold">{item.commentCount}</span>
                      )}
                    </button>
                  }
                />
                <PopoverContent className="p-0 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden" align="end">
                  <ItemComments 
                    checklistId={checklistId}
                    itemId={item.id}
                    userId={userId}
                    userName={userName || 'Inspector'}
                    shareToken={item.shareToken}
                    onClose={() => setIsCommentsOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            )}

            {/* Indent / Outdent Controls */}
            {!readOnly && (
              <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  disabled={indent === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndent(item.id, 'out');
                  }}
                  className="h-8 w-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Promote Step (Shift+Tab)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-4 bg-slate-200" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndent(item.id, 'in');
                  }}
                  className="h-8 w-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  title="Indent Step (Tab)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Sub-item creator */}
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubItem(item.id);
                }}
                className="h-8 w-8 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center"
                title="Add Sub-item"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete button */}
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="h-8 w-8 rounded-lg border border-transparent hover:border-red-200 text-slate-400 hover:text-red-700 hover:bg-red-50 flex items-center justify-center transition-colors"
                title="Delete Step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Upload Error Banner (Honest Error Handling) */}
        {uploadError && (
          <div className="mx-3 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-xs text-red-800">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-700" />
              <span>{uploadError}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 bg-red-700 text-white rounded font-mono font-bold text-[10px] hover:bg-red-800"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="p-1 text-red-600 hover:text-red-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Inline Expanding Audit Tray (Replaces Modal Trap) */}
        <AnimatePresence>
          {isNotesExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-200 bg-slate-50/80 p-3 rounded-b-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-500" />
                  Audit Notes & Inspection Specifications
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setIsNotesExpanded(false)}
                    className="text-[11px] font-mono text-slate-500 hover:text-slate-900 font-medium"
                  >
                    Hide Tray
                  </button>
                )}
              </div>

              {!readOnly ? (
                <div className="space-y-2">
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    onBlur={handleSaveNotes}
                    placeholder="Enter technical measurements, tolerance checks, serial numbers, or defect notes..."
                    rows={2}
                    className="w-full text-xs font-sans p-2 rounded-lg bg-white border border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      className="px-3 py-1 bg-slate-900 text-white rounded-md text-[11px] font-medium hover:bg-slate-800"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-700 prose max-w-none">
                  <ReactMarkdown>{item.description || 'No audit notes recorded.'}</ReactMarkdown>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Photo Proof Gallery Row */}
        {localPhotos.length > 0 && (
          <div className="px-3 pb-2.5 pt-1 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0">
              Proofs:
            </span>
            <Reorder.Group 
              axis="x" 
              values={localPhotos} 
              onReorder={handlePhotosReorder}
              className="flex items-center gap-2"
            >
              {localPhotos.map((url, idx) => (
                <Reorder.Item 
                  key={url}
                  value={url}
                  className="relative group/thumb shrink-0 w-14 h-14 rounded-lg border border-slate-300 overflow-hidden cursor-pointer bg-slate-100 shadow-2xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewIndex(idx);
                  }}
                >
                  <img 
                    src={url} 
                    alt={`proof-${idx}`} 
                    className="w-full h-full object-cover" 
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  {!readOnly && onPhotoDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPhotoDelete(item.id, url);
                      }}
                      className="absolute top-0.5 right-0.5 p-1 bg-red-700 text-white rounded opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                      title="Remove Photo"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
        )}
      </motion.div>

      {/* Lightbox / Large Photo Inspection Modal */}
      <AnimatePresence>
        {previewIndex !== null && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewIndex(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs cursor-zoom-out"
            />
            
            <div className="relative w-full max-w-4xl flex-1 flex items-center justify-center z-10">
              {localPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center backdrop-blur-md"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center backdrop-blur-md"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              <div className="relative max-w-full max-h-full rounded-xl overflow-hidden bg-black border border-slate-800">
                <img 
                  src={localPhotos[previewIndex]} 
                  alt="Audit Proof Full View" 
                  className="block max-w-full max-h-[75vh] object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {!readOnly && onPhotoDelete && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const urlToDelete = localPhotos[previewIndex];
                        onPhotoDelete(item.id, urlToDelete);
                        if (localPhotos.length <= 1) {
                          setPreviewIndex(null);
                        } else {
                          handleNext();
                        }
                      }}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-md text-xs font-mono font-bold flex items-center gap-1 shadow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Proof
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setPreviewIndex(null)}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
