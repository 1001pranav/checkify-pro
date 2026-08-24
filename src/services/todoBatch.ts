import { Todo, ChecklistItem } from '@/src/types';
import { db } from '@/src/lib/firebase';
import { collection, doc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/services/db';

/**
 * Batch moves multiple todos into a target checklist in a single transaction/batch.
 * If checklistId is 'new', creates the checklist first.
 * Returns the targetChecklistId.
 */
export async function batchMoveTodosToChecklist(
  userId: string,
  todos: Todo[],
  checklistId: string | 'new',
  newChecklistTitle?: string,
  targetProjectId?: string | null
): Promise<string | undefined> {
  if (todos.length === 0) return;
  const path = 'batchMoveTodosToChecklist';

  try {
    let targetChecklistId = checklistId;
    const batch = writeBatch(db);

    // If creating a brand new checklist
    if (checklistId === 'new') {
      const newListRef = doc(collection(db, 'checklists'));
      targetChecklistId = newListRef.id;
      batch.set(newListRef, {
        userId,
        projectId: targetProjectId || null,
        title: newChecklistTitle || 'Triaged Defects Checklist',
        description: `Imported ${todos.length} items from action backlog`,
        status: 'active',
        category: 'Field Inspection',
        shareToken: null,
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // Get current max position for target checklist items
    let nextPosition = 0;
    if (checklistId !== 'new') {
      const itemsSnapshot = await getDocs(collection(db, 'checklists', targetChecklistId, 'items'));
      const positions = itemsSnapshot.docs.map(d => (d.data() as ChecklistItem).position || 0);
      nextPosition = positions.length > 0 ? Math.max(...positions) + 1 : 0;
    }

    // Map each todo to an item in the checklist and queue deletion
    todos.forEach((todo, idx) => {
      const newItemRef = doc(collection(db, 'checklists', targetChecklistId, 'items'));
      batch.set(newItemRef, {
        checklistId: targetChecklistId,
        text: todo.title,
        description: todo.note || todo.description || null,
        outcome: todo.outcome || 'none',
        isDone: todo.isDone,
        photoUrl: null,
        photoUrls: [],
        isCollapsed: false,
        position: nextPosition + idx,
        parentId: null,
        fromTodo: true,
        createdAt: serverTimestamp()
      });

      // Delete source todo
      batch.delete(doc(db, 'todos', todo.id));
    });

    await batch.commit();
    return targetChecklistId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Batch updates priority, category, or completion status for selected todos
 */
export async function batchUpdateTodos(
  todoIds: string[],
  updates: Partial<Todo>
): Promise<void> {
  if (todoIds.length === 0) return;
  const path = 'batchUpdateTodos';

  try {
    const batch = writeBatch(db);
    todoIds.forEach(id => {
      const ref = doc(db, 'todos', id);
      batch.update(ref, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Batch deletes multiple todos
 */
export async function batchDeleteTodos(todoIds: string[]): Promise<void> {
  if (todoIds.length === 0) return;
  const path = 'batchDeleteTodos';

  try {
    const batch = writeBatch(db);
    todoIds.forEach(id => {
      batch.delete(doc(db, 'todos', id));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
