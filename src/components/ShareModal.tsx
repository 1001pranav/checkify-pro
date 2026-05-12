import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShareConfig, EntityType } from '@/src/types';
import { upsertShareConfig, revokeShare } from '@/src/services/db';
import { useAuth } from '@/src/contexts/AuthContext';
import { Eye, Pencil, Copy, Trash2, Globe, Lock, ChevronDown, ChevronUp, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Timestamp } from 'firebase/firestore';

interface ShareModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType;
  entityId: string;
  initialConfig?: ShareConfig | null;
  projectContext?: { checklistsCount: number; todosCount: number };
}

export function ShareModal({ 
  isOpen, 
  onOpenChange, 
  entityType, 
  entityId, 
  initialConfig,
  projectContext 
}: ShareModalProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<Partial<ShareConfig>>(initialConfig || {
    entityType,
    entityId,
    visibility: 'public',
    permission: 'view',
    invitedEmails: [],
    isActive: true,
    token: crypto.randomUUID().replace(/-/g, ''),
    expiresAt: null
  });

  const [emailInput, setEmailInput] = useState('');
  const [isExpiryOpen, setIsExpiryOpen] = useState(false);

  const setExpiry = (days: number | null) => {
    if (days === null) {
      handleSave({ expiresAt: null });
    } else {
      const date = new Date();
      date.setDate(date.getDate() + days);
      handleSave({ expiresAt: Timestamp.fromDate(date) });
    }
  };

  const setExpiryHours = (hours: number) => {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    handleSave({ expiresAt: Timestamp.fromDate(date) });
  };

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const handleSave = async (updatedFields: Partial<ShareConfig>) => {
    if (!user) return;
    try {
      const newConfig = { ...config, ...updatedFields, createdBy: user.uid } as Omit<ShareConfig, 'id' | 'createdAt'>;
      const saved = await upsertShareConfig(newConfig);
      if (saved) {
        setConfig(saved as ShareConfig);
        toast.success('Share settings updated');
      }
    } catch {
      toast.error('Failed to update share settings');
    }
  };

  const addEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Invalid email format');
      return;
    }
    const newEmails = Array.from(new Set([...(config.invitedEmails || []), email]));
    await handleSave({ invitedEmails: newEmails });
    setEmailInput('');
  };

  const removeEmail = async (email: string) => {
    const newEmails = (config.invitedEmails || []).filter(e => e !== email);
    await handleSave({ invitedEmails: newEmails });
  };

  const copyLink = () => {
    const url = `${window.location.origin}/s/${config.token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const handleRevoke = async () => {
    if (!config.token) return;
    if (confirm('Are you sure you want to revoke this link? Anyone using it will lose access immediately.')) {
      await revokeShare(config.token);
      onOpenChange(false);
      toast.success('Share link revoked');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] p-0 overflow-hidden font-sans border-0 shadow-2xl rounded-2xl">
        <DialogHeader className="bg-slate-50 p-6 border-b border-slate-100">
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">Share {entityType}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Control who can access and edit this {entityType}.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* SECTION 6 — CONTEXT BANNER */}
          {entityType === 'project' && projectContext && (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex gap-3">
              <Globe className="w-5 h-5 text-indigo-500 shrink-0" />
              <p className="text-xs text-indigo-700 leading-relaxed">
                Opening this link gives access to all <span className="font-bold">{projectContext.checklistsCount}</span> checklists 
                and <span className="font-bold">{projectContext.todosCount}</span> todos inside this project.
              </p>
            </div>
          )}

          {/* SECTION 1 — VISIBILITY TOGGLE */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Visibility</Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <Button
                variant={config.visibility === 'public' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg h-10 transition-all ${config.visibility === 'public' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500'}`}
                onClick={() => handleSave({ visibility: 'public' })}
              >
                <Globe className="w-4 h-4 mr-2" /> Public
              </Button>
              <Button
                variant={config.visibility === 'private' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg h-10 transition-all ${config.visibility === 'private' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500'}`}
                onClick={() => handleSave({ visibility: 'private' })}
              >
                <Lock className="w-4 h-4 mr-2" /> Private
              </Button>
            </div>
            <p className="text-[11px] text-slate-500 text-center italic">
              {config.visibility === 'public' 
                ? `Anyone with the link can ${config.permission}` 
                : 'Only invited emails can access'}
            </p>
          </div>

          {/* SECTION 2 — PERMISSION SELECTOR */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Permission Level</Label>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => handleSave({ permission: 'view' })}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  config.permission === 'view' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className={`mt-0.5 p-2 rounded-lg ${config.permission === 'view' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">View Only</p>
                  <p className="text-[11px] text-slate-500">Can read all content, no changes</p>
                </div>
              </button>
              
              <button
                onClick={() => handleSave({ permission: 'edit' })}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  config.permission === 'edit' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className={`mt-0.5 p-2 rounded-lg ${config.permission === 'edit' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Can Edit</p>
                  <p className="text-[11px] text-slate-500">Can add, rename, check/uncheck, delete, and reorder</p>
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 4 — INVITE PANEL (Private only) */}
          <AnimatePresence>
            {config.visibility === 'private' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Invited Emails</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter email..."
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                    className="rounded-xl h-11 border-slate-200 shadow-sm"
                  />
                  <Button onClick={addEmail} className="rounded-xl h-11 px-6 bg-slate-900">Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.invitedEmails?.map(email => (
                    <Badge key={email} variant="secondary" className="pl-3 pr-1 py-1 rounded-lg bg-slate-100 text-slate-700 border-0 flex items-center gap-1 group">
                      <span className="text-[11px] font-medium">{email}</span>
                      <button onClick={() => removeEmail(email)} className="p-1 hover:text-red-500 opacity-50 group-hover:opacity-100">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {(!config.invitedEmails || config.invitedEmails.length === 0) && (
                    <div className="w-full py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                      <p className="text-[10px] text-slate-400 font-medium">No one invited yet</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  Users not on Checkify will receive a magic link to access.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SECTION 5 — EXPIRY (Optional) */}
          <div className="border-t border-slate-50 pt-4">
            <button 
              onClick={() => setIsExpiryOpen(!isExpiryOpen)}
              className="flex items-center justify-between w-full text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span>Link Expiry (Optional)</span>
              {isExpiryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <AnimatePresence>
              {isExpiryOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-4 bg-slate-50 rounded-xl space-y-4"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`text-[10px] h-8 rounded-lg ${config.expiresAt === null ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white'}`}
                      onClick={() => setExpiry(null)}
                    >
                      Never
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-8 rounded-lg bg-white"
                      onClick={() => setExpiryHours(1)}
                    >
                      1 Hour
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-8 rounded-lg bg-white"
                      onClick={() => setExpiry(1)}
                    >
                      1 Day
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-8 rounded-lg bg-white"
                      onClick={() => setExpiry(7)}
                    >
                      7 Days
                    </Button>
                  </div>
                  
                  {config.expiresAt && (
                    <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${
                      config.expiresAt.toMillis() < Date.now() 
                        ? 'bg-red-50 border-red-100' 
                        : 'bg-amber-50 border-amber-100'
                    }`}>
                      <Clock className={`w-3 h-3 ${config.expiresAt.toMillis() < Date.now() ? 'text-red-500' : 'text-amber-500'}`} />
                      <p className={`text-[10px] font-medium ${config.expiresAt.toMillis() < Date.now() ? 'text-red-700' : 'text-amber-700'}`}>
                        {config.expiresAt.toMillis() < Date.now() ? 'Expired' : 'Expires'}: {config.expiresAt.toDate().toLocaleString()}
                      </p>
                      <button 
                        onClick={() => setExpiry(null)}
                        className={`ml-auto p-1 rounded ${config.expiresAt.toMillis() < Date.now() ? 'hover:bg-red-100 text-red-500' : 'hover:bg-amber-100 text-amber-500'}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* SECTION 3 — SHARE LINK */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
          <Label className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Shareable Link</Label>
          <div className="flex gap-2">
            <Input 
              readOnly 
              value={`${window.location.origin}/s/${config.token}`}
              className="rounded-xl h-11 border-slate-200 bg-white font-mono text-xs shadow-sm"
            />
            <Button onClick={copyLink} variant="outline" size="icon" className="rounded-xl h-11 w-11 shrink-0 border-slate-200 bg-white">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="destructive" 
              onClick={handleRevoke}
              className="flex-1 rounded-xl h-11 font-bold text-xs"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Revoke Link
            </Button>
            <Button 
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl h-11 bg-slate-900 font-bold text-xs"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
