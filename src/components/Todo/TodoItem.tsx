import React, { useState, useEffect } from 'react';
import { Todo } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Trash2, 
  ArrowRightLeft, 
  MoreVertical,
  Pencil,
  Clock
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ItemNotesView } from '@/src/components/ItemNotesView';

interface TodoItemProps {
  todo: Todo;
  onToggle: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onUpdate: (updates: Partial<Todo>) => void | Promise<void>;
  onMove?: () => void;
  readOnly?: boolean;
  // Multi-select integration
  isSelected?: boolean;
  onSelectToggle?: (e: React.MouseEvent | React.ChangeEvent) => void;
  isSelectionMode?: boolean;
}

export const TodoItem: React.FC<TodoItemProps> = ({ 
  todo, 
  onToggle, 
  onDelete, 
  onUpdate,
  onMove,
  readOnly = false,
  isSelected = false,
  onSelectToggle,
  isSelectionMode = false
}) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editNote, setEditNote] = useState(todo.note || '');
  const [editCategory, setEditCategory] = useState(todo.category || '');

  useEffect(() => {
    if (isEditDialogOpen) {
      setEditTitle(todo.title);
      setEditNote(todo.note || '');
      setEditCategory(todo.category || '');
    }
  }, [isEditDialogOpen, todo.title, todo.note, todo.category]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      toast.error('Task definition is required');
      return;
    }
    try {
      await onUpdate({
        title: editTitle.trim(),
        note: editNote.trim() || '',
        category: editCategory.trim() || null
      });
      toast.success('Task successfully updated');
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error('Failed to update task:', err);
      toast.error('Failed to update task');
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // If shift key is pressed or in explicit selection mode, toggle selection
    if (onSelectToggle && (e.shiftKey || isSelectionMode)) {
      e.stopPropagation();
      onSelectToggle(e);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      onClick={handleContainerClick}
      className={cn(
        "group flex items-start gap-3 p-3.5 rounded-xl border transition-all relative select-none",
        isSelected 
          ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-400/40 shadow-xs" 
          : todo.isDone 
            ? "bg-slate-50 border-slate-200 opacity-80" 
            : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
      )}
    >
      {/* Selection Checkbox for Batch Multi-Select */}
      {onSelectToggle && (
        <div 
          className="flex items-center justify-center mt-1 shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onSelectToggle(e);
          }}
        >
          <div 
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer",
              isSelected 
                ? "bg-amber-500 border-amber-600 text-white" 
                : "border-slate-300 bg-white group-hover:border-slate-400"
            )}
          >
            {isSelected && <div className="w-2 h-2 bg-white rounded-xs" />}
          </div>
        </div>
      )}

      {/* Task Execution Checkbox */}
      <div 
        className="flex items-center justify-center mt-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox 
          checked={todo.isDone}
          onCheckedChange={onToggle}
          disabled={readOnly}
          className="w-5 h-5 border-slate-300 data-[state=checked]:bg-emerald-600 rounded-md"
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {(todo.category || todo.priority || todo.dueDate) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {todo.category && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                {todo.category}
              </span>
            )}
            {todo.priority && (
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0 border",
                todo.priority === 'urgent' ? 'bg-red-100 text-red-900 border-red-300' :
                todo.priority === 'high' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                todo.priority === 'medium' ? 'bg-slate-100 text-slate-800 border-slate-300' :
                'bg-slate-50 text-slate-600 border-slate-200'
              )}>
                {todo.priority}
              </span>
            )}
            {todo.dueDate && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200 shrink-0 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {todo.dueDate}
              </span>
            )}
          </div>
        )}

        <div className={cn(
          "font-semibold text-xs sm:text-sm text-left leading-snug",
          todo.isDone ? 'text-slate-400 line-through' : 'text-slate-900'
        )}>
          <ReactMarkdown 
            components={{
              p: ({children}) => <p className="m-0 leading-tight">{children}</p>,
              a: ({...props}) => <a {...props} className="text-slate-900 underline font-bold" target="_blank" rel="noopener noreferrer" />,
            }}
          >
            {todo.title}
          </ReactMarkdown>
        </div>
        
        {/* Notes View */}
        {(() => {
          const primaryNote = todo.note || todo.description || '';
          if (!primaryNote) return null;

          return (
            <ItemNotesView
              itemTitle={todo.title}
              noteText={primaryNote}
              onSaveNote={async (newNote) => {
                if (todo.note || !todo.description) {
                  await onUpdate({ note: newNote });
                } else {
                  await onUpdate({ description: newNote });
                }
              }}
              readOnly={readOnly}
              label="Audit Note"
              category={todo.category || undefined}
              priority={todo.priority || undefined}
            />
          );
        })()}
      </div>

      {/* Row Actions */}
      <div 
        className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {!readOnly && onMove && (
          <button
            type="button"
            onClick={onMove}
            className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-600 hover:text-slate-900 transition-colors"
            title="Triage single item to checklist"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-400 bg-white text-slate-600 hover:text-slate-900 transition-colors">
            <MoreVertical className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-white border border-slate-200 rounded-xl p-1 shadow-md">
            <DropdownMenuItem 
              onClick={() => setIsEditDialogOpen(true)}
              className="text-xs font-medium cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 mr-2 text-slate-500" /> Edit Action Item
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              onClick={() => {
                const md = `- [${todo.isDone ? 'x' : ' '}] ${todo.title}${todo.note ? `\n  - ${todo.note}` : ''}`;
                navigator.clipboard.writeText(md);
                toast.success('Copied as Markdown');
              }}
              className="text-xs font-medium cursor-pointer"
            >
              Copy Markdown
            </DropdownMenuItem>

            {!readOnly && (
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-xs font-medium text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Item
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline Edit Modal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-300 rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Edit Action Item
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update task description, audit scope, and categorization.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Task Title</Label>
              <Input 
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 border-slate-300 rounded-lg text-sm font-medium"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Category</Label>
              <Input 
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="e.g. Operations / Quality"
                className="mt-1 border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-mono font-bold uppercase text-slate-700">Audit Scope / Reference Note</Label>
              <Input 
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Additional details..."
                className="mt-1 border-slate-300 rounded-lg text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button 
                type="submit" 
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs h-10 rounded-lg"
              >
                SAVE CHANGES
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
