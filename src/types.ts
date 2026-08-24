import { Timestamp } from 'firebase/firestore';

export type ChecklistStatus = 'active' | 'completed' | 'archived';

export type SharePermission = 'view' | 'edit';
export type EntityType = 'checklist' | 'todo' | 'project';
export type Visibility = 'public' | 'private';

export interface ShareConfig {
  id: string;
  entityType: EntityType;
  entityId: string;
  token: string;
  visibility: Visibility;
  permission: SharePermission;
  invitedEmails: string[];
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
  isActive: boolean;
}

export interface GuestSession {
  id: string;
  email: string;
  shareToken: string;
  magicToken: string;
  sessionToken: string;
  expiresAt: Timestamp;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  position?: number;
  isPinned?: boolean;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;
  tags?: string[];
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  description?: string;
  outcome?: string;
  isDone: boolean;
  status?: 'pending' | 'pass' | 'fail' | 'na';
  photoUrl: string | null;
  photoUrls?: string[];
  isCollapsed?: boolean;
  position: number;
  parentId: string | null;
  createdAt: Timestamp;
  fromTodo?: boolean;
  shareToken?: string | null;
  commentCount?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;
  assignee?: string | null;
  estimatedMinutes?: number | null;
  tags?: string[];
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
  outcome?: string;
  note?: string;
  isDone: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;
  category?: string;
  tags?: string[];
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
