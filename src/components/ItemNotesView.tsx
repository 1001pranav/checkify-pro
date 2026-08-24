import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Maximize2, 
  Pencil, 
  Copy, 
  Check, 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Plus, 
  Eye
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveMarkdownEditor } from '@/src/components/ui/LiveMarkdownEditor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ItemNotesViewProps {
  itemTitle: string;
  noteText: string;
  onSaveNote?: (newNote: string) => void | Promise<void>;
  readOnly?: boolean;
  label?: string; // e.g. "Note", "Outcome Note", "Tactical Note"
  className?: string;
  category?: string;
  priority?: string;
}

export const ItemNotesView: React.FC<ItemNotesViewProps> = ({
  itemTitle,
  noteText,
  onSaveNote,
  readOnly = false,
  label = "Note",
  className,
  category,
  priority
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [editedNote, setEditedNote] = useState(noteText || '');
  const [copied, setCopied] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [inlineEditedNote, setInlineEditedNote] = useState(noteText || '');

  const descRef = React.useRef<HTMLTextAreaElement>(null);

  // Determine if note is large / needs reduced section
  const trimmedText = (noteText || '').trim();
  const charCount = trimmedText.length;
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const lineCount = trimmedText ? trimmedText.split('\n').length : 0;
  const isLargeNote = charCount > 130 || lineCount > 3 || trimmedText.includes('```') || trimmedText.includes('#');

  const handleOpenModal = (editFirst = false) => {
    setEditedNote(noteText || '');
    setIsEditingInModal(editFirst);
    setIsModalOpen(true);
  };

  const handleCopy = () => {
    if (!trimmedText) return;
    navigator.clipboard.writeText(trimmedText);
    setCopied(true);
    toast.success('Note copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveInModal = async () => {
    if (onSaveNote) {
      await onSaveNote(editedNote);
      toast.success('Note updated successfully');
    }
    setIsEditingInModal(false);
  };

  const handleSaveInline = async () => {
    if (onSaveNote && inlineEditedNote !== noteText) {
      await onSaveNote(inlineEditedNote);
      toast.success('Note updated');
    }
    setIsInlineEditing(false);
  };

  const insertMarkdownInModal = (prefix: string, suffix: string = '') => {
    if (!descRef.current) return;
    const start = descRef.current.selectionStart;
    const end = descRef.current.selectionEnd;
    const text = descRef.current.value;
    const selectedText = text.substring(start, end);
    const beforeText = text.substring(0, start);
    const afterText = text.substring(end);
    
    const newText = `${beforeText}${prefix}${selectedText}${suffix}${afterText}`;
    setEditedNote(newText);
    
    setTimeout(() => {
      if (descRef.current) {
        descRef.current.focus();
        const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
        descRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // If no note exists and not editing inline
  if (!trimmedText && !isInlineEditing) {
    if (readOnly) return null;
    return (
      <div className={cn("mt-1.5", className)}>
        <button
          type="button"
          onClick={() => handleOpenModal(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-dashed border-slate-200 hover:border-indigo-300 transition-all group"
        >
          <Plus className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          <span>+ Add {label}...</span>
        </button>

        <NoteModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          itemTitle={itemTitle}
          editedNote={editedNote}
          setEditedNote={setEditedNote}
          isEditing={isEditingInModal}
          setIsEditing={setIsEditingInModal}
          onSave={handleSaveInModal}
          onCopy={handleCopy}
          copied={copied}
          charCount={charCount}
          wordCount={wordCount}
          readOnly={readOnly}
          insertMarkdown={insertMarkdownInModal}
          descRef={descRef}
          category={category}
          priority={priority}
          label={label}
        />
      </div>
    );
  }

  // Inline Editing Mode
  if (isInlineEditing) {
    return (
      <div className={cn("mt-2 p-3 bg-slate-50 border-2 border-slate-900 rounded-xl space-y-2", className)}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase text-indigo-600 flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit {label}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenModal(true)}
            className="h-6 px-2 text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-100"
          >
            <Maximize2 className="w-3 h-3 mr-1" /> Expand Full Dialog
          </Button>
        </div>

        <LiveMarkdownEditor
          value={inlineEditedNote}
          onChange={setInlineEditedNote}
          placeholder={`Write detailed ${label.toLowerCase()} here...`}
          className="min-h-[90px]"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[9px] text-slate-400 font-bold uppercase">Ctrl+Enter to save</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setInlineEditedNote(noteText || '');
                setIsInlineEditing(false);
              }}
              className="h-7 px-2.5 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveInline}
              className="h-7 px-3 text-[10px] font-black uppercase bg-slate-900 text-white rounded-md hover:bg-indigo-600"
            >
              Save Note
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Viewing Mode:
  // Option A: Reduced Section if note is large
  // Option B: Full Card if note is small
  return (
    <div className={cn("mt-2 text-left", className)}>
      {isLargeNote ? (
        /* Reduced Preview Section for Large Notes */
        <div 
          onClick={() => handleOpenModal(false)}
          className="group relative bg-gradient-to-br from-indigo-50/40 via-slate-50 to-white border-2 border-slate-200 hover:border-slate-900 rounded-xl p-3 cursor-pointer transition-all shadow-sm hover:shadow-bento-sm"
        >
          {/* Note Header Bar */}
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200/80">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                {label}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">
                Large • {charCount} chars
              </span>
            </div>

            <div className="flex items-center gap-1">
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenModal(true);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title="Edit Note"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              <span className="text-[9px] font-black uppercase text-indigo-600 group-hover:underline flex items-center gap-0.5 ml-1">
                <Maximize2 className="w-3 h-3" /> Expand
              </span>
            </div>
          </div>

          {/* Line-clamped reduced text preview */}
          <div className="relative max-h-16 overflow-hidden pr-2">
            <div className="prose prose-slate prose-xs max-w-none text-slate-700 font-medium text-xs leading-relaxed pointer-events-none">
              <ReactMarkdown
                components={{
                  p: ({children}) => <p className="m-0 mb-1">{children}</p>,
                  a: ({...props}) => <a {...props} className="text-indigo-600 underline" />,
                }}
              >
                {trimmedText}
              </ReactMarkdown>
            </div>
            {/* Fade Out Effect */}
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent pointer-events-none" />
          </div>

          {/* Click to Expand Action Banner */}
          <div className="mt-1 flex items-center justify-between pt-1 text-[10px] font-bold text-indigo-600">
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> Click to view full dialogue details
            </span>
            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider group-hover:scale-105 transition-transform">
              Open Dialogue
            </span>
          </div>
        </div>
      ) : (
        /* Standard Compact View for Short Notes */
        <div className="group relative bg-slate-50/90 hover:bg-slate-100/80 border border-slate-200 hover:border-slate-400 rounded-xl p-2.5 transition-all">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-indigo-600 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                {label}
              </span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => handleOpenModal(false)}
                className="text-[9px] font-bold uppercase text-indigo-600 hover:underline flex items-center gap-0.5 px-1 py-0.5"
                title="View in dialog"
              >
                <Maximize2 className="w-2.5 h-2.5" /> Dialogue
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setInlineEditedNote(noteText || '');
                    setIsInlineEditing(true);
                  }}
                  className="text-[9px] font-bold uppercase text-slate-600 hover:text-indigo-600 hover:underline px-1 py-0.5"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          <div className="prose prose-slate prose-xs max-w-none text-slate-800 text-xs leading-snug">
            <ReactMarkdown
              components={{
                p: ({children}) => <p className="m-0">{children}</p>,
                a: ({...props}) => <a {...props} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {trimmedText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Full Note Dialogue Modal */}
      <NoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        itemTitle={itemTitle}
        editedNote={editedNote}
        setEditedNote={setEditedNote}
        isEditing={isEditingInModal}
        setIsEditing={setIsEditingInModal}
        onSave={handleSaveInModal}
        onCopy={handleCopy}
        copied={copied}
        charCount={charCount}
        wordCount={wordCount}
        readOnly={readOnly}
        insertMarkdown={insertMarkdownInModal}
        descRef={descRef}
        category={category}
        priority={priority}
        label={label}
      />
    </div>
  );
};

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemTitle: string;
  editedNote: string;
  setEditedNote: (val: string) => void;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  onSave: () => void | Promise<void>;
  onCopy: () => void;
  copied: boolean;
  charCount: number;
  wordCount: number;
  readOnly: boolean;
  insertMarkdown: (prefix: string, suffix?: string) => void;
  descRef: React.RefObject<HTMLTextAreaElement | null>;
  category?: string;
  priority?: string;
  label?: string;
}

const NoteModal: React.FC<NoteModalProps> = ({
  isOpen,
  onClose,
  itemTitle,
  editedNote,
  setEditedNote,
  isEditing,
  setIsEditing,
  onSave,
  onCopy,
  copied,
  charCount,
  wordCount,
  readOnly,
  insertMarkdown,
  descRef,
  category,
  priority,
  label = "Note"
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bento-card max-w-2xl bg-white border-4 border-slate-900 rounded-3xl p-6 shadow-bento max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b-2 border-slate-900 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white border border-indigo-700">
                📝 {label} Dialogue
              </span>
              {category && (
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
                  🏷️ {category}
                </span>
              )}
              {priority && (
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                  ⚡ {priority}
                </span>
              )}
            </div>

            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
              {charCount} Characters • {wordCount} Words
            </div>
          </div>

          <DialogTitle className="text-xl md:text-2xl font-black uppercase tracking-tight text-slate-900 mt-2 text-left line-clamp-2">
            {itemTitle}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-semibold text-left">
            Full formatted note context and detailed task specifications
          </DialogDescription>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-left">
          {isEditing && !readOnly ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-xl border border-slate-300">
                <div className="flex items-center gap-1">
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-white hover:text-indigo-600 transition-colors" 
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMarkdown('**', '**')} 
                    title="Bold"
                  >
                    <Bold className="w-4 h-4" />
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-white hover:text-indigo-600 transition-colors" 
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMarkdown('*', '*')} 
                    title="Italic"
                  >
                    <Italic className="w-4 h-4" />
                  </Button>
                  <div className="w-[1px] h-4 bg-slate-300 mx-1" />
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-white hover:text-indigo-600 transition-colors" 
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMarkdown('- ')} 
                    title="Bullet List"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-white hover:text-indigo-600 transition-colors" 
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMarkdown('1. ')} 
                    title="Numbered List"
                  >
                    <ListOrdered className="w-4 h-4" />
                  </Button>
                </div>

                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pr-2">
                  Markdown Formatting Enabled
                </span>
              </div>

              <LiveMarkdownEditor
                ref={descRef}
                autoFocus
                value={editedNote}
                onChange={setEditedNote}
                placeholder="Type or paste rich note content here..."
                className="min-h-[220px]"
              />
            </div>
          ) : (
            <div className="bg-slate-50/80 border-2 border-slate-900 rounded-2xl p-5 shadow-inner min-h-[160px]">
              {editedNote.trim() ? (
                <div className="prose prose-slate max-w-none text-slate-900 text-sm leading-relaxed space-y-2">
                  <ReactMarkdown
                    components={{
                      p: ({children}) => <p className="m-0 mb-2">{children}</p>,
                      a: ({...props}) => <a {...props} className="text-indigo-600 font-bold underline" target="_blank" rel="noopener noreferrer" />,
                      code: ({children}) => <code className="bg-slate-200 text-slate-900 px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>,
                      ul: ({children}) => <ul className="list-disc pl-5 m-0 space-y-1">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-5 m-0 space-y-1">{children}</ol>,
                    }}
                  >
                    {editedNote}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 font-semibold italic text-sm">
                  No note content attached to this item yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="border-t-2 border-slate-900 pt-3 flex flex-col sm:flex-row gap-2 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopy}
              disabled={!editedNote.trim()}
              className="h-10 border-2 border-slate-900 rounded-xl font-black uppercase text-xs text-slate-800 bg-white hover:bg-slate-100 flex-1 sm:flex-none"
            >
              {copied ? <Check className="w-4 h-4 mr-1 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1 text-indigo-600" />}
              {copied ? 'Copied!' : 'Copy Note'}
            </Button>

            {!readOnly && !isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-10 border-2 border-slate-900 rounded-xl font-black uppercase text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex-1 sm:flex-none"
              >
                <Pencil className="w-4 h-4 mr-1" /> Edit Note
              </Button>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="h-10 px-4 border-2 border-slate-900 rounded-xl font-black uppercase text-xs text-rose-600 hover:bg-rose-50"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-slate-900 rounded-xl font-black uppercase text-xs shadow-[2px_2px_0px_rgba(15,23,42,1)]"
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onClose}
                className="h-10 px-6 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-xs rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_rgba(15,23,42,1)]"
              >
                Close
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
