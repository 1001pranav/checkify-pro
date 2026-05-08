import React, { useState } from 'react';
import { Todo } from '@/src/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Trash2, 
  ArrowRightLeft, 
  MoreVertical
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

interface TodoItemProps {
  todo: Todo;
  onToggle: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onUpdate: (updates: Partial<Todo>) => void | Promise<void>;
  onMove?: () => void;
  readOnly?: boolean;
}

export const TodoItem: React.FC<TodoItemProps> = ({ 
  todo, 
  onToggle, 
  onDelete, 
  onUpdate,
  onMove,
  readOnly = false
}) => {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(todo.description || '');

  const handleDescBlur = async () => {
    setIsEditingDesc(false);
    if (editDesc !== (todo.description || '')) {
      await onUpdate({ description: editDesc });
    }
  };

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditDesc(todo.description || '');
      setIsEditingDesc(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "group flex items-start gap-4 p-4 rounded-2xl border-2 border-slate-900 shadow-bento bg-white transition-all",
        todo.isDone ? 'opacity-90 bg-slate-50 grayscale-0 shadow-none translate-x-1 translate-y-1' : 'hover:-translate-y-1'
      )}
    >
      <div className="flex items-center justify-center mt-0.5">
        <Checkbox 
          checked={todo.isDone}
          onCheckedChange={onToggle}
          disabled={readOnly}
          className="w-5 h-5 md:w-6 md:h-6 border-2 border-slate-900 data-[state=checked]:bg-emerald-500 rounded-lg"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className={cn(
          "font-black uppercase tracking-tight text-sm md:text-base",
          todo.isDone ? 'line-through text-slate-400' : 'text-slate-900'
        )}>
          <ReactMarkdown 
            components={{
              p: ({children}) => <p className="m-0 leading-tight">{children}</p>,
              a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
            }}
          >
            {todo.title}
          </ReactMarkdown>
        </div>
        
        {todo.note && (
          <div className={cn(
            "text-xs font-bold text-slate-400 mt-1",
            todo.isDone ? 'line-through' : ''
          )}>
             <ReactMarkdown 
              components={{
                p: ({children}) => <p className="m-0">{children}</p>,
                a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {todo.note}
            </ReactMarkdown>
          </div>
        )}

        {/* Description / Outcome Field */}
        {(todo.description || isEditingDesc || !readOnly) && (
          <div className="mt-2 text-left">
            {isEditingDesc && !readOnly ? (
              <textarea
                autoFocus
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg p-2 text-xs font-medium focus:ring-0 focus:border-indigo-600 outline-none min-h-[60px] resize-y"
                placeholder="What happened? Success or failure details..."
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={handleDescBlur}
                onKeyDown={handleDescKeyDown}
              />
            ) : (
              <div 
                onClick={() => !readOnly && setIsEditingDesc(true)}
                className={cn(
                  "text-xs font-medium cursor-text italic",
                  todo.isDone ? 'text-slate-400' : 'text-slate-500',
                  !todo.description && !readOnly && "opacity-0 group-hover:opacity-100 transition-opacity"
                )}
              >
                {todo.description ? (
                  <div className="prose prose-slate prose-xs max-w-none">
                    <ReactMarkdown 
                      components={{
                        p: ({children}) => <p className="m-0">{children}</p>,
                        a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
                      }}
                    >
                      {todo.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span>+ Add outcome description...</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Outcome Selector */}
        {todo.isDone && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 shrink-0">Result:</span>
            <div className="flex gap-1 flex-wrap">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => !readOnly && onUpdate({ outcome: todo.outcome === 'success' ? 'none' : 'success' })}
                disabled={readOnly}
                className={cn(
                  "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                  todo.outcome === 'success' 
                    ? "bg-emerald-500 text-white border-emerald-600 shadow-sm" 
                    : "bg-white text-emerald-600 border-emerald-100 hover:border-emerald-500"
                )}
              >
                Success
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => !readOnly && onUpdate({ outcome: todo.outcome === 'failure' ? 'none' : 'failure' })}
                disabled={readOnly}
                className={cn(
                  "h-6 px-2 text-[8px] font-black uppercase rounded-md border-2 transition-all",
                  todo.outcome === 'failure' 
                    ? "bg-rose-500 text-white border-rose-600 shadow-sm" 
                    : "bg-white text-rose-600 border-rose-100 hover:border-rose-500"
                )}
              >
                Failure
              </Button>
            </div>
          </div>
        )}
      </div>

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8 rounded-lg mt-0.5 shrink-0 hover:bg-slate-100")}>
            <MoreVertical className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bento-card w-48 border-2 border-slate-900 shadow-bento-lg p-1">
            {onMove && (
              <DropdownMenuItem onClick={onMove} className="gap-2 font-black uppercase text-[10px] tracking-widest cursor-pointer hover:bg-indigo-50 focus:bg-indigo-50 transition-colors">
                <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                Move to Checklist
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="gap-2 font-black uppercase text-[10px] tracking-widest text-rose-600 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              Delete Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </motion.div>
  );
};
