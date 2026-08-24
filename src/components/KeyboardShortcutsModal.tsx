import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Keyboard, CornerDownLeft, X, Search, Plus, Terminal, AlertTriangle, ArrowRightLeft } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function KeyboardShortcutsModal({ open: externalOpen, onOpenChange: externalOnOpenChange }: KeyboardShortcutsModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Ignore when typing inside input, textarea, select, or contentEditable
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }

      // Handle ? key press (with or without Shift, slash with shift, etc.)
      if (e.key === '?' || (e.shiftKey && (e.key === '/' || e.code === 'Slash'))) {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const shortcuts = [
    { key: isMac ? '⌘K' : 'Ctrl+K', label: 'Universal Command Palette & Jump Bar', icon: Terminal },
    { key: 'N', label: 'Create new checklist / punch item', icon: Plus },
    { key: '/', label: 'Focus active page search bar', icon: Search },
    { key: 'E', label: 'Filter Cross-Project Exception Queue', icon: AlertTriangle },
    { key: 'Tab / ⇧Tab', label: 'Indent / Outdent checklist hierarchy', icon: ArrowRightLeft },
    { key: 'Enter', label: 'Save row and create next verification step', icon: CornerDownLeft },
    { key: 'Esc', label: 'Close modals / exit selection mode', icon: X },
    { key: '?', label: 'Open keyboard shortcuts ledger', icon: Keyboard },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-5 bg-white border border-slate-300 rounded-2xl shadow-xl">
        <DialogHeader className="space-y-1 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-mono font-bold shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 tracking-tight">
                Operational Keyboard Ledger
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-medium">
                High-speed verification keys & navigation hotkeys.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((sc, index) => {
            const IconComponent = sc.icon;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <IconComponent className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 truncate">{sc.label}</span>
                </div>
                <kbd className="px-2 py-0.5 text-[11px] font-mono font-bold bg-white text-slate-900 rounded border border-slate-300 shadow-2xs shrink-0">
                  {sc.key}
                </kbd>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
