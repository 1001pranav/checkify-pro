import { Timestamp } from 'firebase/firestore';

export type ChecklistStatus = 'active' | 'completed' | 'archived';

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shareToken?: string;
}

export interface Checklist {
  id: string;
  userId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  status: ChecklistStatus;
  completedAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shareToken?: string;
  position?: number;
}

export type SharePermission = 'view' | 'edit';

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  description?: string;
  outcome?: 'success' | 'failure' | 'none';
  isDone: boolean;
  photoUrl: string | null;
  photoUrls?: string[];
  isCollapsed?: boolean;
  position: number;
  parentId: string | null;
  createdAt: Timestamp;
  fromTodo?: boolean;
  shareToken?: string | null;
  commentCount?: number;
  // UI helpers
  children?: ChecklistItem[];
}

export interface ItemComment {
  id: string;
  itemId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Timestamp;
}

export interface Todo {
  id: string;
  userId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  outcome?: 'success' | 'failure' | 'none';
  note?: string;
  isDone: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChecklistShare {
  id: string;
  checklistId: string;
  userId: string;
  token: string;
  permission: SharePermission;
  revoked: boolean;
  isPublic: boolean;
  sharedByName?: string;
  comment?: string;
  createdAt: Timestamp;
}

export interface ProjectShare {
  id: string;
  projectId: string;
  userId: string;
  token: string;
  permission: SharePermission;
  revoked: boolean;
  isPublic: boolean;
  sharedByName?: string;
  comment?: string;
  createdAt: Timestamp;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}
