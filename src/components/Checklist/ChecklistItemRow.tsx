import React, { useState, useEffect } from 'react';
import { ChecklistItem } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  Camera, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  MessageSquare, 
  Plus, 
  GripVertical, 
  X,
  Bold,
  Italic,
  List,
  ListOrdered
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DraggableProvided } from '@hello-pangea/dnd';
import { ItemComments } from './ItemComments';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';


interface ChecklistItemRowProps {
  item: ChecklistItem;
  indent: number;
  readOnly?: boolean;
  onToggle: (id: string, isDone: boolean) => void;
  onUpdate: (id: string, updates: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onIndent: (id: string, direction: 'in' | 'out') => void;
  onAddSubItem: (parentId: string) => void;
  onPhotoUpload: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onPhotoDelete?: (itemId: string, photoUrl: string) => void;
  onPhotosRearrange?: (itemId: string, photoUrls: string[]) => void;
  onToggleCollapse?: (itemId: string, isCollapsed: boolean) => void;
  autoFocus?: boolean;
  onFocused?: () => void;
  userId?: string;
  userName?: string;
  checklistId?: string;
  provided?: DraggableProvided;
  isDragging?: boolean;
}

import { LiveMarkdownEditor } from '../ui/LiveMarkdownEditor';

export const ChecklistItemRow: React.FC<ChecklistItemRowProps> = ({
  item,
  indent,
  readOnly = false,
  onToggle,
  onUpdate,
  onDelete,
  onIndent,
  onAddSubItem,
  onPhotoUpload,
  onPhotoDelete,
  onPhotosRearrange,
  onToggleCollapse,
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
  const [isPhotosCollapsed, setIsPhotosCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(item.description || '');
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [isAddingOutcome, setIsAddingOutcome] = useState(false);
  const [newOutcome, setNewOutcome] = useState('');

  const descRef = React.useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!descRef.current) return;
    const start = descRef.current.selectionStart;
    const end = descRef.current.selectionEnd;
    const text = descRef.current.value;
    const selectedText = text.substring(start, end);
    const beforeText = text.substring(0, start);
    const afterText = text.substring(end);
    
    const newText = `${beforeText}${prefix}${selectedText}${suffix}${afterText}`;
    setEditDesc(newText);
    
    // Set focus back and select the inserted text
    setTimeout(() => {
      if (descRef.current) {
        descRef.current.focus();
        const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
        descRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  useEffect(() => {
    setEditText(item.text);
    setEditDesc(item.description || '');
  }, [item.text, item.description]);

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
    if (editText !== item.text) {
      onUpdate(item.id, { text: editText });
    }
  };

  const handleDescBlur = () => {
    setIsEditingDesc(false);
    if (editDesc !== (item.description || '')) {
      onUpdate(item.id, { description: editDesc });
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

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditDesc(item.description || '');
      setIsEditingDesc(false);
    }
    
    // Save on Ctrl+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleDescBlur();
    }
  };

  const handlePhotosReorder = (newOrder: string[]) => {
    setLocalPhotos(newOrder);
    setIsReordering(true);
    onPhotosRearrange?.(item.id, newOrder);
    
    // Stop reordering state after a short delay to allow syncing
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewIndex === null) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setPreviewIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, localPhotos.length]);

  const latestPhoto = (item.photoUrls && item.photoUrls.length > 0) 
    ? item.photoUrls[item.photoUrls.length - 1] 
    : item.photoUrl;

  const hasChildren = item.children && item.children.length > 0;

  return (
    <div 
      className="space-y-3" 
      ref={provided?.innerRef} 
      {...provided?.draggableProps} 
      style={{ 
        ...provided?.draggableProps.style,
        marginLeft: `calc(${indent} * var(--indent-size, 16px))` 
      }}
    >
      <motion.div 
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "group flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 rounded-xl border-2 transition-all",
          isDragging ? 'border-indigo-600 shadow-bento-lg scale-[1.02] z-50' :
          item.isDone ? 'border-slate-100 bg-slate-50/50' : 'border-slate-200 hover:border-slate-900 shadow-bento-sm'
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            {!readOnly && (
              <div {...provided?.dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-900 transition-colors p-1">
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            {hasChildren && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleCollapse?.(item.id, !item.isCollapsed)}
                className={cn(
                  "h-7 w-7 transition-transform hover:bg-slate-100 rounded-md",
                  item.isCollapsed ? "rotate-0" : "rotate-90"
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          <div className="flex items-center justify-center shrink-0">
            <Checkbox 
              checked={item.isDone}
              onCheckedChange={() => onToggle(item.id, item.isDone)}
              disabled={readOnly}
              className="w-5 h-5 md:w-6 md:h-6 border-2 border-slate-900 data-[state=checked]:bg-indigo-600 rounded-lg"
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {isEditing && !readOnly ? (
                  <input 
                    autoFocus
                    className={cn(
                      "w-full bg-transparent border-none focus:ring-0 p-0 text-sm md:text-base font-bold transition-all outline-none",
                      item.isDone ? 'text-slate-400' : 'text-slate-900'
                    )}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                  />
                ) : (
                  <div 
                    onClick={() => !readOnly && setIsEditing(true)}
                    className={cn(
                      "w-full text-sm md:text-base font-bold transition-all cursor-text",
                      item.isDone ? 'text-slate-400 line-through' : 'text-slate-900'
                    )}
                  >
                    <ReactMarkdown 
                      components={{
                        p: ({children}) => <p className="m-0">{children}</p>,
                        a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
                      }}
                    >
                      {item.text}
                    </ReactMarkdown>
                  </div>
                )}
                {item.fromTodo && (
                  <Badge variant="outline" className="text-[7px] md:text-[8px] px-1 h-3.5 md:h-4 border-slate-900 font-black uppercase tracking-tighter shrink-0 bg-indigo-50">
                    Todo
                  </Badge>
                )}
              </div>

              {/* Description Field */}
              {(item.description || isEditingDesc || !readOnly) && (
                <div className="mt-1">
                  {isEditingDesc && !readOnly ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit border border-slate-200">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-white hover:text-indigo-600 transition-colors" 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertMarkdown('**', '**')} 
                          title="Bold (Ctrl+B)"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-white hover:text-indigo-600 transition-colors" 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertMarkdown('*', '*')} 
                          title="Italic (Ctrl+I)"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </Button>
                        <div className="w-[1px] h-4 bg-slate-300 mx-1" />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-white hover:text-indigo-600 transition-colors" 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertMarkdown('- ')} 
                          title="Bullet List"
                        >
                          <List className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 hover:bg-white hover:text-indigo-600 transition-colors" 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertMarkdown('1. ')} 
                          title="Numbered List"
                        >
                          <ListOrdered className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <LiveMarkdownEditor
                        ref={descRef}
                        autoFocus
                        value={editDesc}
                        onChange={setEditDesc}
                        onBlur={handleDescBlur}
                        onKeyDown={handleDescKeyDown}
                        placeholder="Describe what happened, add notes or verification details..."
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Markdown Supported</span>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-3 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-50" 
                            onClick={() => {
                              setEditDesc(item.description || '');
                              setIsEditingDesc(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-7 px-3 text-[10px] font-black uppercase bg-slate-900 text-white rounded-md hover:bg-indigo-600 transition-colors" 
                            onClick={handleDescBlur}
                          >
                            Save Ritual
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => !readOnly && setIsEditingDesc(true)}
                      className={cn(
                        "text-[10px] md:text-xs font-medium cursor-text italic",
                        item.isDone ? 'text-slate-400' : 'text-slate-500',
                        !item.description && !readOnly && "opacity-0 group-hover:opacity-100 transition-opacity"
                      )}
                    >
                      {item.description ? (
                        <div className="prose prose-slate prose-xs max-w-none">
                          <ReactMarkdown 
                            components={{
                              p: ({children}) => <p className="m-0">{children}</p>,
                              a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
                            }}
                          >
                            {item.description}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span>+ Add description / outcome details...</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outcome Status */}
              {item.isDone && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Execution Result:</span>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onUpdate(item.id, { outcome: item.outcome === 'success' ? 'none' : 'success' })}
                      disabled={readOnly}
                      className={cn(
                        "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                        item.outcome === 'success' 
                          ? "bg-emerald-500 text-white border-emerald-600 shadow-sm" 
                          : "bg-white text-emerald-600 border-emerald-100 hover:border-emerald-500"
                      )}
                    >
                      Success
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onUpdate(item.id, { outcome: item.outcome === 'warning' ? 'none' : 'warning' })}
                      disabled={readOnly}
                      className={cn(
                        "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                        item.outcome === 'warning' 
                          ? "bg-amber-500 text-white border-amber-600 shadow-sm" 
                          : "bg-white text-amber-600 border-amber-100 hover:border-amber-500"
                      )}
                    >
                      Partial
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onUpdate(item.id, { outcome: item.outcome === 'failure' ? 'none' : 'failure' })}
                      disabled={readOnly}
                      className={cn(
                        "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                        item.outcome === 'failure' 
                          ? "bg-rose-500 text-white border-rose-600 shadow-sm" 
                          : "bg-white text-rose-600 border-rose-100 hover:border-rose-500"
                      )}
                    >
                      Failure
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onUpdate(item.id, { outcome: item.outcome === 'na' ? 'none' : 'na' })}
                      disabled={readOnly}
                      className={cn(
                        "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                        item.outcome === 'na' 
                          ? "bg-slate-400 text-white border-slate-500 shadow-sm" 
                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-400"
                      )}
                    >
                      N/A
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onUpdate(item.id, { outcome: item.outcome === 'skipped' ? 'none' : 'skipped' })}
                      disabled={readOnly}
                      className={cn(
                        "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                        item.outcome === 'skipped' 
                          ? "bg-indigo-400 text-white border-indigo-500 shadow-sm" 
                          : "bg-white text-indigo-400 border-indigo-100 hover:border-indigo-400"
                      )}
                    >
                      Skipped
                    </Button>
                    
                    {item.outcome && !['success', 'failure', 'warning', 'na', 'skipped', 'none'].includes(item.outcome) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => onUpdate(item.id, { outcome: 'none' })}
                        disabled={readOnly}
                        className="h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 bg-slate-900 text-white border-slate-900 shadow-sm"
                      >
                        {item.outcome}
                      </Button>
                    )}

                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        {isAddingOutcome ? (
                          <div className="flex items-center gap-1 animate-in slide-in-from-left-2">
                            <input 
                              autoFocus
                              className="h-6 w-20 px-2 text-[8px] font-bold uppercase rounded-md border-2 border-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="Status..."
                              value={newOutcome}
                              onChange={(e) => setNewOutcome(e.target.value)}
                              onBlur={() => {
                                if (!newOutcome.trim()) setIsAddingOutcome(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newOutcome.trim()) {
                                  onUpdate(item.id, { outcome: newOutcome.trim() });
                                  setNewOutcome('');
                                  setIsAddingOutcome(false);
                                }
                                if (e.key === 'Escape') {
                                  setIsAddingOutcome(false);
                                  setNewOutcome('');
                                }
                              }}
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                if (newOutcome.trim()) {
                                  onUpdate(item.id, { outcome: newOutcome.trim() });
                                  setNewOutcome('');
                                }
                                setIsAddingOutcome(false);
                              }}
                              className="h-6 w-6 text-indigo-600"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setIsAddingOutcome(true)}
                            className="h-6 w-6 text-slate-400 hover:text-slate-900 border-2 border-dashed border-slate-200 hover:border-slate-900 transition-all"
                            title="Add Custom Outcome"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1 shrink-0 border-t sm:border-t-0 mt-1 sm:mt-0 pt-2 sm:pt-0 w-full sm:w-auto">
          <div className="flex items-center gap-1 overflow-x-auto sm:overflow-visible no-scrollbar shrink-0">
            {checklistId && userId && (
              <Popover open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
                <PopoverTrigger
                  render={
                    <Button variant="ghost" size="sm" className={cn(
                      "h-8 gap-1 px-1.5 rounded-lg border-2 border-transparent hover:border-slate-900 transition-all",
                      item.commentCount ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-900'
                    )}>
                      <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      {!!item.commentCount && <span className="text-[9px] md:text-[10px] font-black">{item.commentCount}</span>}
                    </Button>
                  }
                />
                <PopoverContent className="p-0 w-[calc(100vw-2rem)] sm:w-80 bento-card shadow-bento-lg border-2 border-slate-900 overflow-hidden" align="end">
                  <ItemComments 
                    checklistId={checklistId}
                    itemId={item.id}
                    userId={userId}
                    userName={userName || 'Collaborator'}
                    shareToken={item.shareToken}
                    onClose={() => setIsCommentsOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          {!readOnly && (
            <div className="flex items-center gap-0.5 md:gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <div className="flex items-center bg-slate-50 sm:bg-transparent rounded-lg p-0.5 sm:p-0">
                <Button variant="ghost" size="icon" onClick={() => onIndent(item.id, 'out')} className="h-7 w-7 md:h-8 md:w-8 hover:bg-slate-200" disabled={indent === 0}>
                  <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onIndent(item.id, 'in')} className="h-7 w-7 md:h-8 md:w-8 hover:bg-slate-200">
                  <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </Button>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onAddSubItem(item.id)} className="h-7 w-7 md:h-8 md:w-8 hover:bg-indigo-50 text-indigo-600" title="Add Sub-task">
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </Button>
              
              <label className="cursor-pointer">
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  multiple
                  onChange={(e) => onPhotoUpload(item.id, e)} 
                />
                <div className="h-7 w-7 md:h-8 md:w-8 rounded-md flex items-center justify-center hover:bg-slate-100 transition-colors" title="Upload Photo">
                  <Camera className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-500" />
                </div>
              </label>
              
              <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} className="h-7 w-7 md:h-8 md:w-8 text-rose-500 hover:bg-rose-50" title="Delete Task">
                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Photos Grid Below Row */}
      {localPhotos.length > 0 && (
        <div 
          className="space-y-1 mb-2"
          style={{ marginLeft: `${provided?.dragHandleProps ? 32 : 12}px` }}
        >
          <button 
            onClick={() => setIsPhotosCollapsed(!isPhotosCollapsed)}
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <Camera className="w-3 h-3" />
            {isPhotosCollapsed ? `Show ${localPhotos.length} Photos` : "Hide Photos"}
          </button>
          
          {!isPhotosCollapsed && (
            <Reorder.Group 
              axis="x" 
              values={localPhotos} 
              onReorder={handlePhotosReorder}
              className="flex flex-wrap gap-2 overflow-hidden"
            >
              {localPhotos.map((url, idx) => (
                <Reorder.Item 
                  key={url}
                  value={url}
                  className="relative group/photo shrink-0 w-24 h-24 rounded-xl border-2 border-slate-900 overflow-hidden shadow-bento-sm active:scale-105 active:z-50 cursor-grab active:cursor-grabbing transition-transform"
                >
                  <div 
                    onClick={() => setPreviewIndex(idx)}
                    className="w-full h-full cursor-zoom-in"
                  >
                    <img 
                      src={url} 
                      alt={`verification-${idx}`} 
                      className="w-full h-full object-cover pointer-events-none" 
                      loading="lazy"
                    />
                    {url === latestPhoto && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-indigo-600 text-[8px] font-black uppercase text-white rounded-md shadow-lg z-10">
                        Latest
                      </div>
                    )}
                  </div>
                  {!readOnly && onPhotoDelete && (
                    <button 
                      onPointerDown={(e) => e.stopPropagation()} 
                      onClick={(e) => {
                        e.stopPropagation();
                        onPhotoDelete(item.id, url);
                      }}
                      className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-md opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity shadow-sm hover:bg-rose-600 z-20"
                      title="Delete Photo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>
      )}

      {/* Full Preview Modal */}
      <AnimatePresence>
        {previewIndex !== null && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewIndex(null)}
              className="absolute inset-0 bg-slate-900/95 backdrop-blur-md cursor-zoom-out"
            />
            
            <div className="relative w-full max-w-5xl flex-1 flex items-center justify-center">
              {/* Navigation Arrows */}
              {localPhotos.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handlePrev}
                    className="absolute left-4 z-10 rounded-full w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border-white/20 shadow-2xl"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleNext}
                    className="absolute right-4 z-10 rounded-full w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border-white/20 shadow-2xl"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </Button>
                </>
              )}

              <motion.div
                key={previewIndex}
                initial={{ scale: 0.9, opacity: 0, x: 20 }}
                animate={{ scale: 1, opacity: 1, x: 0 }}
                exit={{ scale: 0.9, opacity: 0, x: -20 }}
                className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl bg-white border border-white/10"
              >
                <img 
                  src={localPhotos[previewIndex]} 
                  alt="Preview" 
                  className="block max-w-full max-h-[70vh] md:max-h-[75vh] object-contain"
                  loading="lazy"
                />
                
                <div className="absolute top-4 right-4 flex gap-2">
                  {!readOnly && onPhotoDelete && (
                    <Button 
                      variant="destructive" 
                      size="sm" 
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
                      className="rounded-full shadow-lg h-10 px-4 bg-rose-500 hover:bg-rose-600 text-white border-none"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  )}
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    onClick={() => setPreviewIndex(null)}
                    className="rounded-full shadow-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border-white/20"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* Preview Strip */}
            {localPhotos.length > 1 && (
              <Reorder.Group 
                axis="x"
                values={localPhotos}
                onReorder={handlePhotosReorder}
                className="relative mt-6 flex gap-2 p-2 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-x-auto max-w-full no-scrollbar"
              >
                {localPhotos.map((url, idx) => (
                  <Reorder.Item
                    key={url}
                    value={url}
                    className={cn(
                      "relative shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-300 cursor-grab active:cursor-grabbing",
                      previewIndex === idx 
                        ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900 scale-110 z-10" 
                        : "opacity-40 hover:opacity-100 scale-100"
                    )}
                  >
                    <div
                      onClick={() => setPreviewIndex(idx)}
                      className="w-full h-full cursor-pointer"
                    >
                      <img 
                        src={url} 
                        alt={`Preview ${idx}`} 
                        className="w-full h-full object-cover pointer-events-none" 
                        loading="lazy"
                      />
                      {url === latestPhoto && (
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.5 bg-indigo-600 text-[6px] font-black uppercase text-white rounded-sm shadow-lg z-10">
                          Latest
                        </div>
                      )}
                      {previewIndex === idx && (
                        <div className="absolute inset-0 bg-indigo-500/10 animate-pulse" />
                      )}
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
