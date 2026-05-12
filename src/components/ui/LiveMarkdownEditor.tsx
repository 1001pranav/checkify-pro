import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface LiveMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}

/**
 * A textarea that provides live "syntax highlighting" or formatting for Markdown.
 * It works by overlaying a transparent textarea on top of a rendered preview.
 */
export const LiveMarkdownEditor = forwardRef<HTMLTextAreaElement, LiveMarkdownEditorProps>(({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  className,
  autoFocus,
  readOnly
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Sync ref
  useImperativeHandle(ref, () => textareaRef.current!);

  // Sync scroll
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = textareaRef.current.value;
    const selectedText = text.substring(start, end);
    const beforeText = text.substring(0, start);
    const afterText = text.substring(end);
    
    const newText = `${beforeText}${prefix}${selectedText}${suffix}${afterText}`;
    onChange(newText);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const internalOnKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        insertMarkdown('**', '**');
        return;
      } else if (e.key === 'i') {
        e.preventDefault();
        insertMarkdown('*', '*');
        return;
      }
    }
    
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  // Simple markdown highlighter
  const highlightMarkdown = (text: string) => {
    if (!text) return '';

    // Replace HTML entities
    let highlighted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold: **text**
    highlighted = highlighted.replace(/\*\*(.*?)\*\*/g, '<span class="text-indigo-600 font-bold">**$1**</span>');
    
    // Italic: *text*
    highlighted = highlighted.replace(/\*(.*?)\*/g, '<span class="text-indigo-400 italic">*$1*</span>');

    // Lists: - or 1.
    highlighted = highlighted.replace(/^(\s*[-*+] )/gm, '<span class="text-indigo-600 font-bold">$1</span>');
    highlighted = highlighted.replace(/^(\s*\d+\. )/gm, '<span class="text-indigo-600 font-bold">$1</span>');

    // Headers: # 
    highlighted = highlighted.replace(/^(#+ .*)$/gm, '<span class="text-indigo-600 font-bold border-b border-indigo-200">$1</span>');

    // Final newline handling for textarea alignment
    return highlighted + (text.endsWith('\n') ? ' ' : '');
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    handleScroll();
  }, [value]);

  return (
    <div className={cn("relative font-mono text-xs md:text-sm", className)}>
      {/* Backdrop for highlighting */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={cn(
          "absolute inset-0 pointer-events-none whitespace-pre-wrap break-words overflow-y-hidden p-3 border-2 border-transparent",
          "text-transparent"
        )}
        dangerouslySetInnerHTML={{ __html: highlightMarkdown(value) }}
        style={{
          fontFamily: 'inherit',
          lineHeight: '1.6',
        }}
      />
      
      {/* Textarea for input */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={internalOnKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        disabled={readOnly}
        spellCheck={false}
        className={cn(
          "relative w-full bg-white border-2 border-slate-900 rounded-lg p-3 outline-none min-h-[120px] shadow-sm resize-y block transition-all",
          "caret-slate-900",
          "text-slate-900/40 selection:bg-indigo-100 selection:text-indigo-900",
          "placeholder:text-slate-300"
        )}
        style={{
          fontFamily: 'inherit',
          lineHeight: '1.6',
          background: 'transparent',
        }}
      />
    </div>
  );
});

LiveMarkdownEditor.displayName = 'LiveMarkdownEditor';
