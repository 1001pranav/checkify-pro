import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  getDoc,
  getDocs,
  writeBatch,
  setDoc,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { db, storage, auth } from '@/src/lib/firebase';
import { Checklist, ChecklistItem, ChecklistShare, Todo, ItemComment, Project, ProjectShare } from '@/src/types';
import { processImage } from '@/src/lib/imageProcessing';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const jsonError = JSON.stringify(errInfo);
  console.error('Firestore/Storage Error: ', jsonError);
  throw new Error(jsonError);
}

// --- Users ---

export async function syncUser(userId: string, email: string | null) {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    
    if (!snap.exists()) {
      await setDoc(userRef, {
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        role: 'user'
      });
    } else {
      await updateDoc(userRef, {
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Projects ---

export function subscribeToProjects(userId: string, callback: (projects: Project[]) => void) {
  const path = 'projects';
  const q = query(
    collection(db, 'projects'),
    where('userId', '==', userId)
  );
  
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    callback(projects);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function createProject(userId: string, title: string, description: string = '') {
  const path = 'projects';
  try {
    const payload = {
      userId,
      title,
      description,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    return await addDoc(collection(db, 'projects'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProject(id: string, data: Partial<Project>) {
  const path = `projects/${id}`;
  try {
    return await updateDoc(doc(db, 'projects', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getProject(id: string) {
  const path = `projects/${id}`;
  try {
    const snap = await getDoc(doc(db, 'projects', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Project;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteProject(projectId: string) {
  const path = `projects/${projectId}`;
  try {
    // 1. Verify existence and ownership first (extra safety)
    const projectSnap = await getDoc(doc(db, 'projects', projectId));
    if (!projectSnap.exists()) {
      return; // Already deleted
    }
    
    const projectData = projectSnap.data();
    if (projectData.userId !== auth.currentUser?.uid) {
      throw new Error('Unauthorized: You do not own this project.');
    }

    const batch = writeBatch(db);
    let operationCount = 0;
    
    // 2. Disassociate checklists
    const checklistsSnap = await getDocs(query(collection(db, 'checklists'), where('projectId', '==', projectId)));
    checklistsSnap.forEach(d => {
      batch.update(d.ref, { 
        projectId: null,
        updatedAt: serverTimestamp()
      });
      operationCount++;
    });
    
    // 3. Disassociate todos
    const todosSnap = await getDocs(query(collection(db, 'todos'), where('projectId', '==', projectId)));
    todosSnap.forEach(d => {
      batch.update(d.ref, { 
        projectId: null,
        updatedAt: serverTimestamp()
      });
      operationCount++;
    });

    // 4. Cleanup project shares
    const sharesSnap = await getDocs(query(collection(db, 'projectShares'), where('projectId', '==', projectId)));
    sharesSnap.forEach(d => {
      batch.delete(d.ref);
      operationCount++;
    });
    
    // 5. Delete project itself
    batch.delete(projectSnap.ref);
    operationCount++;

    // Safety check for batch limit (500)
    if (operationCount > 500) {
      throw new Error('Project too large to delete in one batch. Please contact support or remove some items first.');
    }
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Checklists ---

export function subscribeToChecklists(userId: string, callback: (checklists: Checklist[]) => void, projectId?: string | null) {
  const path = 'checklists';
  const q = query(
    collection(db, 'checklists'),
    where('userId', '==', userId)
  );
  
  return onSnapshot(q, (snapshot) => {
    let lists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Checklist));
    
    // Client side filtering for better handling of missing/null projectId fields
    if (projectId === null) {
      lists = lists.filter(l => !l.projectId);
    } else if (projectId) {
      lists = lists.filter(l => l.projectId === projectId);
    }
    
    callback(lists);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function createChecklist(userId: string, title: string, description: string = '', position: number = 0, projectId: string | null = null, shareToken: string | null = null) {
  const path = 'checklists';
  try {
    const payload = {
      userId,
      projectId,
      title,
      description,
      status: 'active',
      shareToken, // Project or Checklist share token
      position,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    return await addDoc(collection(db, 'checklists'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateChecklist(id: string, data: Partial<Checklist>, shareToken?: string) {
  const path = `checklists/${id}`;
  try {
    return await updateDoc(doc(db, 'checklists', id), {
      ...data,
      ...(shareToken ? { shareToken } : {}),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteChecklist(checklistId: string) {
  const path = `checklists/${checklistId}`;
  try {
    const itemsSnapshot = await getDocs(collection(db, 'checklists', checklistId, 'items'));
    const batch = writeBatch(db);
    
    // Collect photos for deletion
    const allPhotoUrls: string[] = [];
    itemsSnapshot.forEach((itemDoc) => {
      const item = itemDoc.data() as ChecklistItem;
      if (item.photoUrls) allPhotoUrls.push(...item.photoUrls);
      if (item.photoUrl) allPhotoUrls.push(item.photoUrl);
      batch.delete(itemDoc.ref);
    });
    
    batch.delete(doc(db, 'checklists', checklistId));
    await batch.commit();
    
    // Cleanup photos in storage
    const uniqueUrls = Array.from(new Set(allPhotoUrls));
    for (const url of uniqueUrls) {
      try {
        const photoRef = ref(storage, url);
        await deleteObject(photoRef);
      } catch (e) {
        console.error('Failed to delete photo from storage:', e);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Checklist Items ---

export function subscribeToItems(checklistId: string, callback: (items: ChecklistItem[]) => void) {
  const path = `checklists/${checklistId}/items`;
  const q = query(
    collection(db, 'checklists', checklistId, 'items'),
    orderBy('position', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistItem));
    callback(items);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function addItem(checklistId: string, text: string, position: number, parentId: string | null = null, shareToken?: string) {
  const path = `checklists/${checklistId}/items`;
  try {
    return await addDoc(collection(db, 'checklists', checklistId, 'items'), {
      checklistId,
      text,
      isDone: false,
      photoUrl: null,
      photoUrls: [],
      isCollapsed: false,
      position,
      parentId,
      shareToken: shareToken || null,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateItem(checklistId: string, itemId: string, data: Partial<ChecklistItem>, shareToken?: string) {
  const path = `checklists/${checklistId}/items/${itemId}`;
  try {
    return await updateDoc(doc(db, 'checklists', checklistId, 'items', itemId), {
      ...data,
      ...(shareToken ? { shareToken } : {})
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteItem(checklistId: string, itemId: string) {
  const path = `checklists/${checklistId}/items/${itemId}`;
  try {
    const itemRef = doc(db, 'checklists', checklistId, 'items', itemId);
    const itemSnap = await getDoc(itemRef);
    const itemData = itemSnap.data() as ChecklistItem;
    
    const allUrls = [...(itemData.photoUrls || [])];
    if (itemData.photoUrl) allUrls.push(itemData.photoUrl);

    for (const url of allUrls) {
      try {
        await deleteObject(ref(storage, url));
      } catch (e) {
        console.error('Photo cleanup failed', e);
      }
    }
    
    return await deleteDoc(itemRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function moveItem(checklistId: string, itemId: string, direction: 'up' | 'down', allItems: ChecklistItem[], shareToken?: string) {
  const path = `checklists/${checklistId}/items/${itemId}/move`;
  try {
    const currentItem = allItems.find(i => i.id === itemId);
    if (!currentItem) return;

    // Only move within the same parent
    const siblings = allItems
      .filter(i => i.parentId === currentItem.parentId)
      .sort((a, b) => a.position - b.position);

    const currentIndex = siblings.findIndex(i => i.id === itemId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex >= 0 && targetIndex < siblings.length) {
      const targetItem = siblings[targetIndex];
      const batch = writeBatch(db);
      
      const payload1 = { position: targetItem.position, ...(shareToken ? { shareToken } : {}) };
      const payload2 = { position: currentItem.position, ...(shareToken ? { shareToken } : {}) };

      batch.update(doc(db, 'checklists', checklistId, 'items', currentItem.id), payload1);
      batch.update(doc(db, 'checklists', checklistId, 'items', targetItem.id), payload2);
      
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Multi-item updates (Cascade, Indent, etc) ---

export async function cascadeComplete(checklistId: string, parentItemId: string, items: ChecklistItem[]) {
  const path = `checklists/${checklistId}/items (batch)`;
  try {
    const batch = writeBatch(db);
    const descendants = getAllDescendants(parentItemId, items);
    
    descendants.forEach(item => {
      batch.update(doc(db, 'checklists', checklistId, 'items', item.id), { isDone: true });
    });
    
    return await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function getAllDescendants(parentId: string, allItems: ChecklistItem[]): ChecklistItem[] {
  const children = allItems.filter(i => i.parentId === parentId);
  let descendants = [...children];
  children.forEach(child => {
    descendants = [...descendants, ...getAllDescendants(child.id, allItems)];
  });
  return descendants;
}


// --- Photos ---

export async function deleteItemPhoto(checklistId: string, itemId: string, photoUrl: string, shareToken?: string) {
  const path = `checklist-photos/${checklistId}/${itemId}/delete-single`;
  try {
    // 1. Delete from storage
    try {
      const photoRef = ref(storage, photoUrl);
      await deleteObject(photoRef);
    } catch (e) {
      console.error('Failed to delete photo from storage:', e);
    }

    // 2. Remove from Firestore array
    const itemRef = doc(db, 'checklists', checklistId, 'items', itemId);
    await updateDoc(itemRef, {
      photoUrls: arrayRemove(photoUrl),
      // Also clear legacy field if it matches
      ...(photoUrl ? { photoUrl: null } : {}),
      ...(shareToken ? { shareToken } : {})
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleItemCollapse(checklistId: string, itemId: string, isCollapsed: boolean, shareToken?: string) {
  const path = `checklists/${checklistId}/items/${itemId}/collapse`;
  try {
    const itemRef = doc(db, 'checklists', checklistId, 'items', itemId);
    await updateDoc(itemRef, { 
      isCollapsed,
      ...(shareToken ? { shareToken } : {})
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function uploadItemPhotos(checklistId: string, itemId: string, files: File[], shareToken?: string) {
  const opPath = `checklist-photos/${checklistId}/${itemId}/batch`;

  // Handle potential auth persistence issues in iframe
  if (!auth.currentUser) {
    console.warn('Auth currentUser is null at start of upload. Attempting anonymous fallback to ensure storage access...');
    try {
      const { signInAnonymously } = await import('firebase/auth');
      await signInAnonymously(auth);
      console.log('Anonymous sign-in successful for upload:', auth.currentUser?.uid);
    } catch (e) {
      console.error('Anonymous sign-in failed:', e);
    }
  }

  // Process and upload in parallel
  const uploadPromises = files.map(async (file, index) => {
    let lastError: unknown;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const processedBlob = await processImage(file);
        // Use unique filename with index and timestamp
        const storagePath = `checklist-photos/${checklistId}/${itemId}/${Date.now()}-${index}.jpg`;
        const photoRef = ref(storage, storagePath);
        
        console.log(`[Storage Debug] Uploading as: ${auth.currentUser?.uid || 'null'} (Anonymous: ${auth.currentUser?.isAnonymous || 'n/a'})`);

        // Pass metadata to ensure content-type is persisted correctly
        await uploadBytes(photoRef, processedBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            checklistId,
            itemId,
            originalName: file.name,
            uploadedBy: auth.currentUser?.uid || 'anonymous',
            shareToken: shareToken || 'none'
          }
        });
        const url = await getDownloadURL(photoRef);
        return url;
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }
    throw lastError;
  });

  try {
    const uploadedUrls = await Promise.all(uploadPromises);
    
    await updateDoc(doc(db, 'checklists', checklistId, 'items', itemId), { 
      photoUrls: arrayUnion(...uploadedUrls),
      ...(shareToken ? { shareToken } : {})
    });
    
    return uploadedUrls;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, opPath);
  }
}

export async function uploadItemPhoto(checklistId: string, itemId: string, file: File, shareToken?: string) {
  return uploadItemPhotos(checklistId, itemId, [file], shareToken);
}

export async function updateItemPhotosOrder(checklistId: string, itemId: string, photoUrls: string[], shareToken?: string) {
  const path = `checklists/${checklistId}/items/${itemId}/photos-reorder`;
  try {
    return await updateDoc(doc(db, 'checklists', checklistId, 'items', itemId), {
      photoUrls,
      photoUrl: deleteField(),
      ...(shareToken ? { shareToken } : {}),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Sharing ---

export async function createShare(
  checklistId: string, 
  userId: string, 
  permission: 'view' | 'edit',
  sharingOptions: { isPublic: boolean; sharedByName?: string; comment?: string }
) {
  const path = 'shares';
  try {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const shareDoc = {
      checklistId,
      userId,
      token,
      permission,
      revoked: false,
      isPublic: sharingOptions.isPublic,
      sharedByName: sharingOptions.sharedByName || null,
      comment: sharingOptions.comment || null,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'shares', token), shareDoc);
    
    // Set shareToken on checklist to enable public read
    await updateDoc(doc(db, 'checklists', checklistId), { 
      shareToken: token,
      updatedAt: serverTimestamp()
    });
    
    // Tag all existing items with shareToken
    const itemsSnap = await getDocs(collection(db, 'checklists', checklistId, 'items'));
    const batch = writeBatch(db);
    itemsSnap.forEach(itemDoc => {
      batch.update(itemDoc.ref, { shareToken: token });
    });
    await batch.commit();

    return token;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToShares(checklistId: string, callback: (shares: ChecklistShare[]) => void) {
  const path = 'shares';
  if (!auth.currentUser) return () => {};
  
  const q = query(
    collection(db, 'shares'),
    where('checklistId', '==', checklistId),
    where('userId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const shares = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistShare));
    callback(shares);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function updateSharePermission(token: string, permission: 'view' | 'edit') {
  const path = `shares/${token}`;
  try {
    await updateDoc(doc(db, 'shares', token), { permission });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteShare(token: string, checklistId: string) {
  const path = `shares/${token}`;
  try {
    // 1. Delete the share doc
    await deleteDoc(doc(db, 'shares', token));
    
    // 2. If this was the active shareToken on the checklist, null it out
    const checklistRef = doc(db, 'checklists', checklistId);
    const checklistSnap = await getDoc(checklistRef);
    if (checklistSnap.exists() && checklistSnap.data().shareToken === token) {
      await updateDoc(checklistRef, { shareToken: null });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleShareRevoked(token: string, revoked: boolean) {
  const path = `shares/${token}`;
  try {
    await updateDoc(doc(db, 'shares', token), { revoked });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Todos ---

export function subscribeToTodos(userId: string, callback: (todos: Todo[]) => void, projectId?: string | null) {
  const path = 'todos';
  const q = query(
    collection(db, 'todos'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    let todos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Todo));

    // Client side filtering for better handling of missing/null projectId fields
    if (projectId === null) {
      todos = todos.filter(t => !t.projectId);
    } else if (projectId) {
      todos = todos.filter(t => t.projectId === projectId);
    }

    callback(todos);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function createTodo(userId: string, title: string, note?: string, projectId: string | null = null, shareToken: string | null = null) {
  const path = 'todos';
  try {
    return await addDoc(collection(db, 'todos'), {
      userId,
      projectId,
      title,
      note: note || null,
      isDone: false,
      shareToken, // Project share token
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTodo(id: string, data: Partial<Todo>, shareToken?: string) {
  const path = `todos/${id}`;
  try {
    return await updateDoc(doc(db, 'todos', id), {
      ...data,
      ...(shareToken ? { shareToken } : {}),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTodo(id: string) {
  const path = `todos/${id}`;
  try {
    return await deleteDoc(doc(db, 'todos', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Item Comments ---

export function subscribeToComments(checklistId: string, itemId: string, callback: (comments: ItemComment[]) => void) {
  const path = `checklists/${checklistId}/items/${itemId}/comments`;
  const q = query(
    collection(db, 'checklists', checklistId, 'items', itemId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemComment));
    callback(comments);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

// --- Project Sharing ---

export async function createProjectShare(
  projectId: string, 
  userId: string, 
  permission: 'view' | 'edit',
  sharingOptions: { isPublic: boolean; sharedByName?: string; comment?: string }
) {
  const path = 'projectShares';
  try {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const shareDoc = {
      projectId,
      userId,
      token,
      permission,
      revoked: false,
      isPublic: sharingOptions.isPublic,
      sharedByName: sharingOptions.sharedByName || null,
      comment: sharingOptions.comment || null,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'projectShares', token), shareDoc);
    
    // Set shareToken on project to enable public read
    await updateDoc(doc(db, 'projects', projectId), { 
      shareToken: token,
      updatedAt: serverTimestamp()
    });
    
    return token;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToProjectShares(projectId: string, userId: string, callback: (shares: ProjectShare[]) => void) {
  const path = 'projectShares';
  const q = query(
    collection(db, 'projectShares'),
    where('projectId', '==', projectId),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const shares = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectShare));
    callback(shares);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function deleteProjectShare(token: string, projectId: string) {
  const path = `projectShares/${token}`;
  try {
    await deleteDoc(doc(db, 'projectShares', token));
    
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists() && projectSnap.data().shareToken === token) {
      await updateDoc(projectRef, { shareToken: null });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function getSharedProject(token: string) {
  const path = `projectShares/${token} (join)`;
  try {
    const shareSnap = await getDoc(doc(db, 'projectShares', token));
    if (!shareSnap.exists() || shareSnap.data()?.revoked) {
      throw new Error('Invalid or revoked share link');
    }
    const share = shareSnap.data() as ProjectShare;
    const projectSnap = await getDoc(doc(db, 'projects', share.projectId));
    if (!projectSnap.exists()) throw new Error('Project not found');

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    
    // Also fetch associated items
    const checklistsSnap = await getDocs(query(collection(db, 'checklists'), where('projectId', '==', project.id)));
    const todosSnap = await getDocs(query(collection(db, 'todos'), where('projectId', '==', project.id)));
    
    const checklists = checklistsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Checklist));
    const todos = todosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Todo));

    return { 
      project,
      checklists,
      todos,
      permission: share.permission,
      shareMetadata: share 
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function addComment(checklistId: string, itemId: string, userId: string, userName: string, text: string, shareToken?: string | null) {
  const path = `checklists/${checklistId}/items/${itemId}/comments`;
  try {
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'checklists', checklistId, 'items', itemId, 'comments'));
    const itemRef = doc(db, 'checklists', checklistId, 'items', itemId);
    
    batch.set(commentRef, {
      itemId,
      userId,
      userName,
      text,
      createdAt: serverTimestamp()
    });
    
    // Increment comment count
    batch.update(itemRef, {
      commentCount: increment(1),
      ...(shareToken ? { shareToken } : {})
    });
    
    return await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function moveTodoToChecklist(todo: Todo, checklistId: string | 'new', newChecklistTitle?: string) {
  const path = 'moveTodoToChecklist (batch)';
  try {
    const batch = writeBatch(db);
    
    let targetChecklistId = checklistId;
    
    if (checklistId === 'new' && newChecklistTitle) {
      const newListRef = doc(collection(db, 'checklists'));
      targetChecklistId = newListRef.id;
      batch.set(newListRef, {
        userId: todo.userId,
        title: newChecklistTitle,
        description: todo.note || '',
        status: 'active',
        shareToken: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    // Get current max position for items in target checklist
    const itemsSnapshot = await getDocs(collection(db, 'checklists', targetChecklistId, 'items'));
    const nextPosition = itemsSnapshot.size;
    
    const newItemRef = doc(collection(db, 'checklists', targetChecklistId, 'items'));
    batch.set(newItemRef, {
      checklistId: targetChecklistId,
      text: todo.title,
      isDone: todo.isDone,
      photoUrl: null,
      photoUrls: [],
      isCollapsed: false,
      position: nextPosition,
      parentId: null,
      fromTodo: true,
      createdAt: serverTimestamp()
    });
    
    // Delete the todo
    batch.delete(doc(db, 'todos', todo.id));
    
    await batch.commit();
    return targetChecklistId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getSharedChecklist(token: string) {
  const path = `shares/${token} (join)`;
  try {
    const shareSnap = await getDoc(doc(db, 'shares', token));
    if (!shareSnap.exists() || shareSnap.data()?.revoked) {
      throw new Error('Invalid or revoked share link');
    }
    const share = shareSnap.data() as ChecklistShare;
    const listSnap = await getDoc(doc(db, 'checklists', share.checklistId));
    return { 
      checklist: { id: listSnap.id, ...listSnap.data() } as Checklist, 
      permission: share.permission,
      shareMetadata: share 
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
