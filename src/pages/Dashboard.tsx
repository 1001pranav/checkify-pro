import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  subscribeToChecklists, 
  createChecklist, 
  updateChecklist, 
  deleteChecklist 
} from '@/src/services/db';
import { Checklist, ChecklistStatus } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Plus, 
  Archive, 
  Trash2, 
  Package, 
  CheckCircle2, 
  Clock,
  GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DraggableProvided, DropResult } from '@hello-pangea/dnd';
import { db } from '@/src/lib/firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from '@/src/components/Navbar';
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

export default function Dashboard() {
  const { user } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToChecklists(user.uid, (data) => {
      setChecklists(data);
      setLoading(false);
    }, null); // Filter for independent checklists
    return unsubscribe;
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    
    setCreateLoading(true);
    try {
      const position = checklists.length > 0 ? Math.max(...checklists.map(c => c.position || 0)) + 1 : 0;
      const docRef = await createChecklist(user.uid, newTitle.trim(), newDesc.trim(), position, null);
      toast.success('Checklist created successfully');
      setNewTitle('');
      setNewDesc('');
      setIsCreateOpen(false);
      navigate(`/checklist/${docRef.id}`);
    } catch (err) {
      console.error("Create error:", err);
      toast.error('Initialization failed: ' + (err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };


  // Sort by position, then by creation date as fallback
  const sortedChecklists = useMemo(() => {
    return [...checklists].sort((a, b) => {
      const posA = a.position ?? 0;
      const posB = b.position ?? 0;
      if (posA !== posB) return posA - posB;
      return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
    });
  }, [checklists]);

  const filtered = useMemo(() => {
    return sortedChecklists.filter(list => {
      if (activeTab === 'all') return list.status !== 'archived'; 
      if (activeTab === 'active') return list.status === 'active';
      if (activeTab === 'completed') return list.status === 'completed';
      if (activeTab === 'archived') return list.status === 'archived';
      return true;
    });
  }, [sortedChecklists, activeTab]);

  const handleArchive = async (list: Checklist) => {
    const newStatus: ChecklistStatus = list.status === 'archived' ? 'active' : 'archived';
    await updateChecklist(list.id, { status: newStatus });
    toast.success(newStatus === 'archived' ? 'Checklist archived' : 'Checklist restored');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure? This will delete all items and photos.')) {
      await deleteChecklist(id);
      toast.success('Checklist deleted');
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    // 1. Get the new order of the visible subset
    const reorderedFiltered: Checklist[] = Array.from(filtered);
    const [removed] = reorderedFiltered.splice(sourceIndex, 1);
    reorderedFiltered.splice(destIndex, 0, removed);

    // 2. Map the new order back into the full list, preserving positions of hidden items
    const newFullOrder = [...sortedChecklists];
    const filteredIds = new Set(filtered.map(l => l.id));
    let filteredPtr = 0;
    
    newFullOrder.forEach((list, i) => {
      if (filteredIds.has(list.id)) {
        newFullOrder[i] = reorderedFiltered[filteredPtr++];
      }
    });

    // 3. Update all positions in a batch
    const batch = writeBatch(db);
    newFullOrder.forEach((list, index) => {
      if (list.position !== index) {
        batch.update(doc(db, 'checklists', list.id), { position: index });
      }
    });
    
    await batch.commit();
    toast.success('Dashboard reordered');
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <Navbar />
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 border-slate-900 shadow-bento overflow-hidden">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-black tracking-tight uppercase truncate">Master <span className="text-indigo-600">Checklists</span></h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium truncate">Manage and track your verification tasks.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <Button onClick={() => setIsCreateOpen(true)} className="bento-button bg-indigo-600 text-white h-10 md:h-11 px-4 md:px-6 text-xs md:text-sm flex-1 md:flex-none">
              <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" /> New Checklist
            </Button>
            <DialogContent className="bento-card max-w-md p-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Audit Queue</DialogTitle>
                <DialogDescription className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                  Initialize a new verification stack
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Title</Label>
                  <Input 
                    placeholder="e.g., Weekly Safety Inspection" 
                    className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Scope Description</Label>
                  <Input 
                    placeholder="Briefly define the audit scope..." 
                    className="h-12 border-2 border-slate-900 rounded-xl font-bold"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" className="bento-button w-full h-12 bg-indigo-600 text-white" disabled={createLoading}>
                    {createLoading ? 'INITIALIZING...' : 'START PROTOCOL'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Tabs defaultValue="all" onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 mb-6 no-scrollbar">
          <TabsList className="bg-slate-100 p-1.5 rounded-xl border-2 border-slate-900 flex w-max min-w-full sm:w-fit">
            <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold uppercase text-[10px] md:text-xs px-4 md:px-6">All</TabsTrigger>
            <TabsTrigger value="active" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold uppercase text-[10px] md:text-xs px-4 md:px-6">Active</TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold uppercase text-[10px] md:text-xs px-4 md:px-6">Completed</TabsTrigger>
            <TabsTrigger value="archived" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold uppercase text-[10px] md:text-xs px-4 md:px-6">Archived</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="mt-0 outline-none">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-slate-200 animate-pulse rounded-3xl border-2 border-slate-900 shadow-bento" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bento-card border-dashed">
              <Package className="w-16 h-16 mb-4 opacity-10" />
              <p className="font-bold uppercase tracking-widest text-slate-400">No checklists found</p>
              <Button variant="link" onClick={() => setIsCreateOpen(true)} className="text-indigo-600 font-black">Create your first one</Button>
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="dashboard-checklists" direction="horizontal">
                {(provided) => (
                  <div 
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                  >
                    <AnimatePresence mode="popLayout">
                      {filtered.map((list, index) => (
                        <Draggable key={list.id} draggableId={list.id} index={index}>
                          {(provided, snapshot) => (
                            <motion.div
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{ 
                                ...provided.draggableProps.style,
                                userSelect: 'none' 
                              }}
                            >
                              <ChecklistCard 
                                list={list} 
                                dragHandleProps={provided.dragHandleProps}
                                isDragging={snapshot.isDragging}
                                onArchive={() => handleArchive(list)}
                                onDelete={() => handleDelete(list.id)}
                                onClick={() => navigate(`/checklist/${list.id}`)}
                              />
                            </motion.div>
                          )}
                        </Draggable>
                      ))}
                    </AnimatePresence>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

function ChecklistCard({ list, onArchive, onDelete, onClick, dragHandleProps, isDragging }: { 
  list: Checklist, 
  onArchive: () => void, 
  onDelete: () => void, 
  onClick: () => void,
  dragHandleProps: DraggableProvided['dragHandleProps'],
  isDragging: boolean
}) {
  return (
    <Card 
      className={`bento-card group hover:-translate-y-1 transition-all duration-300 cursor-pointer w-full overflow-hidden shrink-0 ${isDragging ? 'border-indigo-600 shadow-bento-lg scale-[1.02] z-50' : ''}`} 
      onClick={onClick}
    >
      <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 md:gap-3 min-w-0">
             <div {...dragHandleProps} className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-900 hidden sm:block">
               <GripVertical className="w-4 h-4" />
             </div>
             <div className="space-y-1 min-w-0">
               <div className="flex items-center mb-1">
                  <span className={`px-2 py-0.5 rounded text-[8px] md:text-[9px] font-black uppercase border-2 border-slate-900 ${
                    list.status === 'active' ? 'bg-indigo-600 text-white' : 
                    list.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {list.status}
                  </span>
               </div>
               <CardTitle className="text-lg md:text-xl font-black uppercase tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-1 break-words">{list.title}</CardTitle>
             </div>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-50 border-2 border-slate-900 rounded-xl shrink-0">
            {list.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
            ) : list.status === 'archived' ? (
              <Archive className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
            ) : (
              <Clock className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <p className="text-slate-500 text-[11px] md:text-xs line-clamp-2 min-h-[32px] mb-4">
          {list.description || 'No description provided for this checklist.'}
        </p>
        <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
          <Clock className="w-3 h-3" />
          Updated {list.updatedAt?.toDate ? list.updatedAt.toDate().toLocaleDateString() : 'recently'}
        </div>
        <div className="h-3 w-full bg-slate-100 border-2 border-slate-900 rounded-full overflow-hidden">
           <div className={`h-full transition-all duration-700 ${list.status === 'completed' ? 'bg-emerald-500 w-full' : 'bg-indigo-600 w-1/3'}`} />
        </div>
      </CardContent>
      <CardFooter className="bg-slate-50 border-t-2 border-slate-900 flex-col sm:flex-row justify-between p-3 md:p-4 gap-3 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-1 sm:flex-none h-8 text-[9px] md:text-[10px] font-black uppercase gap-1 hover:bg-slate-200 rounded-lg border sm:border-0 border-slate-200"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
          >
            <Archive className="w-3.5 h-3.5" />
            {list.status === 'archived' ? 'Restore' : 'Archive'}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-1 sm:flex-none h-8 text-[9px] md:text-[10px] font-black uppercase gap-1 text-destructive hover:text-white hover:bg-destructive rounded-lg border sm:border-0 border-slate-200"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
        <Button variant="outline" size="sm" className="w-full sm:w-auto h-8 text-[9px] md:text-[10px] font-black uppercase border-2 border-slate-900 rounded-lg">
          View Detail
        </Button>
      </CardFooter>
    </Card>
  );
}
