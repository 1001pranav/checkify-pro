import React, { useState, useEffect } from 'react';
import { ItemComment } from '@/src/types';
import { subscribeToComments, addComment } from '@/src/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, User } from 'lucide-react';
import { format } from 'date-fns';

interface ItemCommentsProps {
  checklistId: string;
  itemId: string;
  userId: string;
  userName: string;
  shareToken?: string | null;
  onClose: () => void;
}

export const ItemComments: React.FC<ItemCommentsProps> = ({
  checklistId,
  itemId,
  userId,
  userName,
  shareToken,
  onClose
}) => {
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const unsub = subscribeToComments(checklistId, itemId, (data) => {
      setComments(data);
    });
    return () => unsub();
  }, [checklistId, itemId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSending) return;

    setIsSending(true);
    try {
      await addComment(checklistId, itemId, userId, userName, newComment.trim(), shareToken);
      setNewComment('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex items-center justify-between p-4 border-b-2 border-slate-900">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h3 className="font-black uppercase tracking-tight text-sm">Collaboration Thread</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">✕</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {comments.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No active discussion yet</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className={`flex gap-3 ${comment.userId === userId ? 'flex-row-reverse' : ''}`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center border-2 border-indigo-200 shrink-0">
                <User className="w-4 h-4 text-indigo-600" />
              </div>
              <div className={`space-y-1 max-w-[80%] ${comment.userId === userId ? 'items-end' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{comment.userName}</span>
                  <span className="text-[8px] font-bold text-slate-400">
                    {comment.createdAt ? format(comment.createdAt.toDate(), 'HH:mm') : '...'}
                  </span>
                </div>
                <div className={`p-3 rounded-2xl border-2 ${
                  comment.userId === userId 
                    ? 'bg-indigo-600 border-slate-900 text-white rounded-tr-none' 
                    : 'bg-white border-slate-900 text-slate-900 rounded-tl-none'
                }`}>
                  <p className="text-xs font-bold leading-relaxed">{comment.text}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t-2 border-slate-900 bg-white">
        <div className="relative">
          <Input 
            placeholder="Type your message..."
            className="border-2 border-slate-900 pr-12 font-bold h-11 rounded-xl"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!newComment.trim() || isSending}
            className="absolute right-1.5 top-1.5 h-8 w-8 bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-slate-900"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
