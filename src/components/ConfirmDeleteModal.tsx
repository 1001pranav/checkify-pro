import React from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
}

export function ConfirmDeleteModal({
  open,
  onOpenChange,
  title = "Delete Item?",
  description = "Are you sure you want to delete this item? This action cannot be undone.",
  onConfirm,
  loading = false,
}: ConfirmDeleteModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-4 border-slate-900 rounded-3xl p-6 shadow-bento">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-100 border-2 border-slate-900 flex items-center justify-center text-red-600">
            <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
          </div>
          <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold text-slate-600">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="bento-button bg-slate-100 text-slate-700 font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="bento-button bg-red-600 hover:bg-red-700 text-white font-black text-xs gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Permanently
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
