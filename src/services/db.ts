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
  deleteField,
  limit
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { db, storage, auth } from '@/src/lib/firebase';
import { Checklist, ChecklistItem, Todo, ItemComment, Project, ShareConfig } from '@/src/types';
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
      // PII removed from the serialized error to prevent UI exposure
      email: null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: []
    },
    operationType,
    path
  };
  const jsonError = JSON.stringify(errInfo);
  console.error('Firestore/Storage Error: ', jsonError);
  // Throw a generic message to the UI to avoid PII leak, but keep path/operation for debugging if needed
  throw new Error(`Database error during ${operationType} on ${path || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
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
  
  // Use Firestore-side filtering where possible
  let q;
  if (projectId) {
    q = query(
      collection(db, 'checklists'),
      where('userId', '==', userId),
      where('projectId', '==', projectId),
      orderBy('position', 'asc')
    );
  } else {
    // When projectId is null, we still filter client-side because Firestore 
    // '==' null queries can be inconsistent depending on index configuration
    q = query(
      collection(db, 'checklists'),
      where('userId', '==', userId),
      orderBy('position', 'asc')
    );
  }
  
  return onSnapshot(q, (snapshot) => {
    let lists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Checklist));
    
    // Fallback client side filtering for null projectId
    if (projectId === null) {
      lists = lists.filter(l => !l.projectId);
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
    let operationCount = 0;
    
    // Collect photos for deletion
    const allPhotoUrls: string[] = [];
    
    for (const itemDoc of itemsSnapshot.docs) {
      const item = itemDoc.data() as ChecklistItem;
      if (item.photoUrls) allPhotoUrls.push(...item.photoUrls);
      if (item.photoUrl) allPhotoUrls.push(item.photoUrl);
      
      // Cleanup comments subcollection for each item
      const commentsSnap = await getDocs(collection(db, 'checklists', checklistId, 'items', itemDoc.id, 'comments'));
      commentsSnap.forEach(commentDoc => {
        batch.delete(commentDoc.ref);
        operationCount++;
      });
      
      batch.delete(itemDoc.ref);
      operationCount++;
      
      if (operationCount > 450) { // Safety buffer before 500 limit
        await batch.commit();
        // Start a new batch if needed for large checklists
        // (Note: In a production environment, we should recursion or use individual deletes if extremely large)
        throw new Error('Checklist contains too many items/comments to delete in one operation. Please delete items individually.');
      }
    }
    
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
    if (!itemSnap.exists()) return;
    
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

  // Note: If authentication is missing, uploads may fail based on storage rules.
  // We avoid auto-signing in anonymously here because it might be disabled in the Firebase console.
  if (!auth.currentUser) {
    console.warn('Auth currentUser is null. Upload might fail if anonymous auth is disabled or storage rules require auth.');
  }

  // Process and upload in parallel
  const uploadPromises = files.map(async (file, index) => {
    let lastError: unknown;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const processedBlob = await processImage(file);
        // Use unique filename with userId, checklistId and itemId for security rules validation
        const storagePath = `checklist-photos/${checklistId}/${auth.currentUser?.uid || 'anonymous'}/${itemId}/${Date.now()}-${index}.jpg`;
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

// --- Unified Sharing (ShareConfig) ---

export async function upsertShareConfig(config: Omit<ShareConfig, 'id' | 'createdAt'>) {
  const path = 'shareConfigs';
  try {
    const q = query(
      collection(db, 'shareConfigs'),
      where('entityType', '==', config.entityType),
      where('entityId', '==', config.entityId),
      where('createdBy', '==', config.createdBy)
    );
    const existingSnap = await getDocs(q);
    
    if (!existingSnap.empty) {
      const docRef = existingSnap.docs[0].ref;
      await updateDoc(docRef, {
        ...config,
        updatedAt: serverTimestamp() // Note: types.ts should have updatedAt if needed, but blueprint uses createdAt. We'll stick to config data.
      });
      return { id: docRef.id, ...config };
    } else {
      const docRef = doc(collection(db, 'shareConfigs'), config.token);
      const payload = {
        ...config,
        id: config.token,
        createdAt: serverTimestamp()
      };
      await setDoc(docRef, payload);
      return payload;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resolveShareToken(token: string) {
  const path = `shareConfigs/${token}`;
  try {
    const shareSnap = await getDoc(doc(db, 'shareConfigs', token));
    if (!shareSnap.exists()) return null;
    
    const share = { id: shareSnap.id, ...shareSnap.data() } as ShareConfig;
    if (!share.isActive) return null;
    
    // Check expiry
    if (share.expiresAt && share.expiresAt.toMillis() < Date.now()) {
      // Auto-deactivate if expired
      await updateDoc(doc(db, 'shareConfigs', token), { isActive: false });
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let entityData: any = null;
    if (share.entityType === 'project') {
      entityData = await getProject(share.entityId);
    } else if (share.entityType === 'checklist') {
      const snap = await getDoc(doc(db, 'checklists', share.entityId));
      if (snap.exists()) entityData = { id: snap.id, ...snap.data() };
    } else if (share.entityType === 'todo') {
      const snap = await getDoc(doc(db, 'todos', share.entityId));
      if (snap.exists()) entityData = { id: snap.id, ...snap.data() };
    }

    if (!entityData) return null;

    return {
      share,
      entity: entityData,
      permission: share.permission
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function revokeShare(token: string) {
  const path = `shareConfigs/${token}/revoke`;
  try {
    await updateDoc(doc(db, 'shareConfigs', token), { isActive: false });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvitedEmails(token: string, emails: string[]) {
  const path = `shareConfigs/${token}/invites`;
  try {
    const uniqueEmails = Array.from(new Set(emails));
    await updateDoc(doc(db, 'shareConfigs', token), { invitedEmails: uniqueEmails });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToShareConfig(entityId: string, callback: (config: ShareConfig | null) => void) {
  const q = query(
    collection(db, 'shareConfigs'),
    where('entityId', '==', entityId),
    where('isActive', '==', true),
    limit(1)
  );
  
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      callback({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ShareConfig);
    } else {
      callback(null);
    }
  });
}

// --- Guest Access ---

export async function requestGuestAccess(email: string, shareToken: string) {
  const response = await fetch('/api/share/guest/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, shareToken })
  });
  return response.json();
}

export async function verifyGuestMagicToken(magicToken: string) {
  const response = await fetch('/api/share/guest/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ magicToken })
  });
  const data = await response.json();
  if (data.success && data.sessionToken) {
    localStorage.setItem('guest_session', data.sessionToken);
  }
  return data;
}

export function getGuestSessionToken() {
  return localStorage.getItem('guest_session');
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

// --- Interaction Helpers ---

// --- Guest Access Functions ---

export async function addComment(checklistId: string, itemId: string, userId: string, userName: string, text: string, shareToken?: string | null) {
  const path = `checklists/${checklistId}/items/${itemId}/comments`;
  try {
    // Verify item exists before adding comment
    const itemRef = doc(db, 'checklists', checklistId, 'items', itemId);
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) {
      throw new Error('Parent item no longer exists');
    }

    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'checklists', checklistId, 'items', itemId, 'comments'));
    
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
        projectId: todo.projectId || null,
        title: newChecklistTitle,
        description: todo.note || '',
        status: 'active',
        shareToken: null,
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    // Get current max position for items in target checklist
    const itemsSnapshot = await getDocs(collection(db, 'checklists', targetChecklistId, 'items'));
    const positions = itemsSnapshot.docs.map(d => (d.data() as ChecklistItem).position || 0);
    const nextPosition = positions.length > 0 ? Math.max(...positions) + 1 : 0;
    
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


