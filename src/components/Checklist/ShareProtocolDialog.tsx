import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ChecklistShare } from '@/src/types';
import { Copy, Trash2, Shield, Eye, Edit3, Link2, Plus } from 'lucide-react';

interface SharingOptions {
  permission: 'view' | 'edit';
  isPublic: boolean;
  sharedByName: string;
  comment: string;
}

interface ShareProtocolDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  options: SharingOptions;
  setOptions: React.Dispatch<React.SetStateAction<SharingOptions>>;
  shareLink: string;
  setShareLink: (link: string) => void;
  onGenerate: () => Promise<void>;
  loading: boolean;
  shares: ChecklistShare[];
  onUpdatePermission: (token: string, permission: 'view' | 'edit') => Promise<void>;
  onDeleteShare: (token: string) => Promise<void>;
}

export const ShareProtocolDialog: React.FC<ShareProtocolDialogProps> = ({
  isOpen,
  onOpenChange,
  options,
  setOptions,
  shareLink,
  setShareLink,
  onGenerate,
  loading,
  shares,
  onUpdatePermission,
  onDeleteShare
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bento-card p-0 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Share Protocol</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
              Security & Distribution Hub
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mt-6">
            <Button 
              variant={activeTab === 'create' ? 'default' : 'outline'}
              size="sm"
              className={`flex-1 h-9 font-black uppercase text-[10px] tracking-widest border-2 ${activeTab === 'create' ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-white border-slate-700'}`}
              onClick={() => setActiveTab('create')}
            >
              <Plus className="w-4 h-4 mr-2" /> Create Link
            </Button>
            <Button 
              variant={activeTab === 'manage' ? 'default' : 'outline'}
              size="sm"
              className={`flex-1 h-9 font-black uppercase text-[10px] tracking-widest border-2 ${activeTab === 'manage' ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-white border-slate-700'}`}
              onClick={() => setActiveTab('manage')}
            >
              <Shield className="w-4 h-4 mr-2" /> Active Links ({shares.length})
            </Button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'create' ? (
            !shareLink ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-3 bg-slate-50 border-2 border-slate-900 rounded-xl">
                  <span className="text-xs font-black uppercase tracking-widest">Share Type</span>
                  <div className="flex gap-2">
                    <Button 
                      variant={options.isPublic ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 font-black uppercase text-[10px] tracking-widest border-2 border-slate-900"
                      onClick={() => setOptions(prev => ({ ...prev, isPublic: true }))}
                    >
                      Public
                    </Button>
                    <Button 
                      variant={!options.isPublic ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 font-black uppercase text-[10px] tracking-widest border-2 border-slate-900"
                      onClick={() => setOptions(prev => ({ ...prev, isPublic: false }))}
                    >
                      Private
                    </Button>
                  </div>
                </div>

                {options.isPublic && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1">Your Name (Display Only)</label>
                    <Input 
                      placeholder="e.g., Audit Team Alpha"
                      className="border-2 border-slate-900 h-10 font-bold"
                      value={options.sharedByName}
                      onChange={(e) => setOptions(prev => ({ ...prev, sharedByName: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1">Comment / Instructions</label>
                  <Input 
                    placeholder="Additional context for viewers..."
                    className="border-2 border-slate-900 h-10 font-bold"
                    value={options.comment}
                    onChange={(e) => setOptions(prev => ({ ...prev, comment: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1">Default Permissions</label>
                  <div className="flex gap-2">
                    <Button 
                      variant={options.permission === 'view' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 h-9 font-black uppercase text-[10px] tracking-widest border-2 border-slate-900"
                      onClick={() => setOptions(prev => ({ ...prev, permission: 'view' }))}
                    >
                      <Eye className="w-4 h-4 mr-2" /> View Only
                    </Button>
                    <Button 
                      variant={options.permission === 'edit' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 h-9 font-black uppercase text-[10px] tracking-widest border-2 border-slate-900"
                      onClick={() => setOptions(prev => ({ ...prev, permission: 'edit' }))}
                    >
                      <Edit3 className="w-4 h-4 mr-2" /> Can Edit
                    </Button>
                  </div>
                </div>

                <Button 
                  onClick={onGenerate} 
                  className="w-full h-14 bento-button bg-indigo-600 text-white"
                  disabled={loading}
                >
                  {loading ? 'INITIALIZING...' : 'GENERATE SECURE LINK'}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Link Generated Successfully</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={shareLink} className="font-mono text-[10px] border-emerald-500 bg-white" />
                    <Button 
                      size="sm" 
                      className="bg-emerald-500 border-2 border-slate-900 text-white h-10 px-4"
                      onClick={() => copyToClipboard(shareLink)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Button variant="ghost" onClick={() => setShareLink('')} className="font-black uppercase text-[10px] tracking-widest text-slate-500 underline">
                    Create another link
                  </Button>
                  <Button onClick={() => onOpenChange(false)} className="bento-button bg-slate-900 text-white h-12">
                    FINISH
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {shares.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-black uppercase tracking-widest text-[10px]">
                  No active distribution links
                </div>
              ) : (
                shares.map(share => (
                  <div key={share.id} className="p-4 bg-white border-2 border-slate-900 rounded-2xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${share.permission === 'edit' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                            {share.permission === 'edit' ? 'Editor' : 'Viewer'}
                          </span>
                          <span className="text-[10px] font-black text-slate-400">
                            {share.createdAt && (typeof share.createdAt.toDate === 'function' 
                              ? share.createdAt.toDate().toLocaleDateString() 
                              : new Date(share.createdAt as unknown as string).toLocaleDateString())}
                          </span>
                        </div>
                        {share.sharedByName && <p className="text-xs font-bold text-slate-900">By: {share.sharedByName}</p>}
                        {share.comment && <p className="text-[10px] font-medium text-slate-500 italic">"{share.comment}"</p>}
                      </div>
                      
                      <div className="flex gap-1">
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="h-8 w-8 p-0 border-2 border-slate-900"
                           onClick={() => {
                             const url = `${window.location.origin}/share/${share.token}`;
                             copyToClipboard(url);
                           }}
                         >
                           <Copy className="w-3.5 h-3.5" />
                         </Button>
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="h-8 w-8 p-0 border-2 border-slate-900 hover:bg-red-50 hover:text-red-600 hover:border-red-600 transition-colors"
                           onClick={() => onDeleteShare(share.token)}
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </Button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant={share.permission === 'view' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 h-7 font-black uppercase text-[8px] tracking-widest border-2 border-slate-900"
                        onClick={() => onUpdatePermission(share.token, 'view')}
                      >
                         Make Viewer
                      </Button>
                      <Button 
                        variant={share.permission === 'edit' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1 h-7 font-black uppercase text-[8px] tracking-widest border-2 border-slate-900"
                        onClick={() => onUpdatePermission(share.token, 'edit')}
                      >
                         Make Editor
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <Link2 className="w-3 h-3 text-slate-400" />
                        <span className="text-[8px] font-mono text-slate-500 truncate flex-1">{window.location.origin}/share/{share.token}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
