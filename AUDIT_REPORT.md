# Checkify Pro — Codebase Audit Report

> **Date:** 2026-05-08  
> **Scope:** Bugs · Security Issues · Improvements & Enhancements

---

## Table of Contents

1. [Bugs](#bugs)
2. [Security Issues](#security-issues)
3. [Improvements & Enhancements](#improvements--enhancements)
4. [Summary Table](#summary-table)

---

## Bugs

### BUG-1 · `deleteItem` crashes if item doesn't exist
**File:** `src/services/db.ts:365`  
**Severity:** 🔴 High

```ts
const itemData = itemSnap.data() as ChecklistItem; // undefined if not found
const allUrls = [...(itemData.photoUrls || [])];    // TypeError: cannot read 'photoUrls' of undefined
```

There is no `if (!itemSnap.exists())` guard before accessing `.data()`. If the item was already deleted (e.g. by another client), this throws a runtime `TypeError`.

**Fix:** Add an existence check before accessing item data.

```ts
if (!itemSnap.exists()) return;
const itemData = itemSnap.data() as ChecklistItem;
```

---

### BUG-2 · `getSharedChecklist` doesn't guard missing checklist
**File:** `src/services/db.ts:932–937`  
**Severity:** 🔴 High

```ts
const listSnap = await getDoc(doc(db, 'checklists', share.checklistId));
return { checklist: { id: listSnap.id, ...listSnap.data() } as Checklist, ... }
```

If the checklist was deleted after the share was created, `listSnap.data()` is `undefined`. Spreading it produces a broken `Checklist` object containing only `id`. Compare with `getSharedProject` which correctly has:

```ts
if (!projectSnap.exists()) throw new Error('Project not found');
```

**Fix:** Add an existence check after fetching the checklist snapshot.

---

### BUG-3 · Memory leak in `SharedChecklist` cleanup
**File:** `src/pages/SharedChecklist.tsx:55–99`  
**Severity:** 🔴 High

```ts
const cleanupPromise = init();
return () => {
  cleanupPromise.then(cleanup => cleanup && cleanup());
};
```

If the component unmounts before the `async init()` resolves (e.g. rapid navigation), the returned cleanup function only runs *after* the promise resolves — which may be after unmount. The `onSnapshot` subscriptions for checklist metadata and items are never cleaned up, causing a memory leak.

**Fix:** Track subscriptions in a `ref` outside the async function so cleanup is always synchronous.

---

### BUG-4 · `Button render` prop is invalid
**File:** `src/pages/SharedProject.tsx:183, 205, 278`  
**Severity:** 🔴 High

```tsx
<Button render={<Link to="/auth" />}>Return to Portal</Button>
```

shadcn/ui `Button` has no `render` prop. This silently renders a plain `<button>` that ignores the `Link` entirely — navigation does not work.

**Fix:** Use the `asChild` pattern:

```tsx
<Button asChild>
  <Link to="/auth">Return to Portal</Link>
</Button>
```

---

### BUG-5 · `/share/undefined` URL when shareToken is null
**File:** `src/pages/SharedProject.tsx:278`  
**Severity:** 🟠 Medium

```tsx
<Button render={<Link to={`/share/${list.shareToken}`} />}>
  View Protocol
</Button>
```

If `list.shareToken` is `null` or `undefined`, the generated URL becomes `/share/undefined`, leading to a broken share page.

**Fix:** Conditionally render this button only when `list.shareToken` is truthy.

---

### BUG-6 · `deleteChecklist` orphans comments subcollection
**File:** `src/services/db.ts:278–309`  
**Severity:** 🟠 Medium

When deleting a checklist, all items are deleted in a batch, but each item's `comments` subcollection is never touched. Firestore does not auto-delete subcollections. Those orphaned documents accumulate indefinitely and waste storage.

**Fix:** Fetch and batch-delete all comments for each item before committing the batch.

---

### BUG-7 · `deleteChecklist` has no batch-size guard
**File:** `src/services/db.ts:278`  
**Severity:** 🟠 Medium

Unlike `deleteProject` which has an `operationCount > 500` guard, `deleteChecklist` has none. A checklist with more than 499 items would exceed the Firestore 500-operation batch limit and throw a hard, unhandled error.

**Fix:** Add the same `operationCount` check present in `deleteProject`.

---

### BUG-8 · `moveTodoToChecklist` missing `position` and `projectId` on new checklist
**File:** `src/services/db.ts:885–894`  
**Severity:** 🟠 Medium

```ts
batch.set(newListRef, {
  userId: todo.userId,
  title: newChecklistTitle,
  // ← no projectId (todo may have belonged to a project)
  // ← no position field
  ...
});
```

The new checklist will have no `position` and no project association even if the source todo belonged to a project.

**Fix:** Include `position: 0` and `projectId: todo.projectId || null` in the new checklist payload.

---

### BUG-9 · Dashboard drag reorder corrupts cross-tab positions
**File:** `src/pages/Dashboard.tsx:115–134`  
**Severity:** 🟠 Medium

```ts
const reordered: Checklist[] = Array.from(filtered); // only items in current tab
reordered.forEach((list, index) => {
  batch.update(doc(db, 'checklists', list.id), { position: index }); // 0, 1, 2...
});
```

When reordering in the "Active" tab, only active checklists get positions `0, 1, 2…`. Archived/completed checklists retain their old (possibly higher) values. Switching to the "All" tab produces an inconsistent order.

**Fix:** Re-compute positions across the full sorted list, not just the filtered view.

---

### BUG-10 · Auto-complete toast can fire multiple times
**File:** `src/pages/ChecklistDetail.tsx:117–129`  
**Severity:** 🟡 Low

The effect depends on `[items, checklist]`. After `updateChecklist` is called and sets status to `completed`, the checklist snapshot update re-triggers this effect. While the early return (`status !== 'active'`) prevents a loop, any transient Firestore re-delivery during the window before the snapshot updates can fire the `toast.success` more than once.

**Fix:** Add a local ref flag (e.g. `hasAutoCompleted`) to prevent re-firing.

---

### BUG-11 · `itemsSnapshot.size` is unreliable as a position
**File:** `src/services/db.ts:897–899`  
**Severity:** 🟡 Low

```ts
const nextPosition = itemsSnapshot.size;
```

If items have been deleted, there are position gaps and `size` is no longer a safe proxy for `max(position) + 1`. This can create duplicate position values.

**Fix:** Use `Math.max(...positions, -1) + 1` derived from the actual item data.

---

## Security Issues

### SEC-1 · Cryptographically weak share tokens
**File:** `src/services/db.ts:577, 758`  
**Severity:** 🔴 High

```ts
const token = Math.random().toString(36).substring(2, 15)
            + Math.random().toString(36).substring(2, 15);
```

`Math.random()` is not a CSPRNG. The effective entropy is approximately 26 bits — far below the minimum needed for an unguessable access token. An attacker with knowledge of token timing could potentially predict tokens.

**Fix:** Use the Web Crypto API:

```ts
const token = crypto.randomUUID().replace(/-/g, '')
            + crypto.randomUUID().replace(/-/g, '');
```

---

### SEC-2 · Storage rules allow unauthenticated photo uploads
**File:** `storage.rules:11–13`  
**Severity:** 🔴 High

```
allow create: if request.resource.size < 10 * 1024 * 1024
             && request.resource.contentType.matches('image/.*');
```

There is **no `request.auth != null`** check on `create`. Any unauthenticated user on the internet can upload images to the `checklist-photos/` path, enabling unlimited storage abuse and spam.

**Fix:** Require at minimum anonymous authentication:

```
allow create: if request.auth != null
             && request.resource.size < 10 * 1024 * 1024
             && request.resource.contentType.matches('image/.*');
```

---

### SEC-3 · Any authenticated user can delete any photo
**File:** `storage.rules:19`  
**Severity:** 🔴 High

```
allow update, delete: if request.auth != null;
```

No ownership check exists. Any signed-in (including anonymous) user can delete photos belonging to other users. This allows malicious users to destroy audit evidence.

**Fix:** Enforce path-based ownership, e.g., embed the uploader's UID in the storage path and validate it against `request.auth.uid`.

---

### SEC-4 · Error messages expose user PII in toast notifications
**File:** `src/services/db.ts:57–78`, `src/pages/SharedChecklist.tsx:89`  
**Severity:** 🔴 High

`handleFirestoreError` serialises the user's `uid`, `email`, `emailVerified`, and `providerInfo` into the thrown error:

```ts
throw new Error(JSON.stringify(errInfo)); // contains email, uid, provider info
```

In `SharedChecklist.tsx`, this is passed directly to a toast:

```ts
toast.error((err as Error).message); // shows user email + uid in the UI
```

This exposes sensitive PII to the screen and potentially to error monitoring tools.

**Fix:** Separate the internal diagnostic object (for logging) from the user-facing error message. Never expose raw serialised auth state to the UI.

---

### SEC-5 · Guest creates content under project owner's UID
**File:** `src/pages/SharedProject.tsx:91, 111`  
**Severity:** 🟠 Medium

```ts
const creatorId = user?.uid || project.userId; // ← uses owner's UID for unauthenticated guests
await createChecklist(creatorId, ...);
```

When an unauthenticated guest creates a checklist on a shared project, the `userId` is set to the **project owner's UID**. The Firestore rule requires `incoming().userId == request.auth.uid`, so the write will be rejected — but the intent to impersonate the owner is a design flaw that could cause confusing failures.

**Fix:** Require anonymous sign-in before write operations on shared projects. Use the anonymous user's own UID.

---

### SEC-6 · Share documents are readable without authentication
**File:** `firestore.rules:282, 319`  
**Severity:** 🟡 Low

```
allow get: if isValidId(token);
```

Any unauthenticated client that knows a valid token can read the full share document, including `userId`, `checklistId`, `sharedByName`, and `comment`. While token knowledge is the primary access control, metadata should still require `isSignedIn()` for principle of least privilege.

---

### SEC-7 · No client-side file type validation before upload
**File:** `src/lib/imageProcessing.ts`  
**Severity:** 🟡 Low

`processImage` performs no validation — it attempts to decode any `File` as an image. The `accept="image/*"` attribute on the file input can be trivially bypassed. A crafted non-image file would fail only after the upload attempt, with an opaque error.

**Fix:** Add explicit MIME type and size checks before calling `processImage`:

```ts
if (!file.type.startsWith('image/')) throw new Error('File must be an image');
if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10 MB limit');
```

---

## Improvements & Enhancements

### IMP-1 · `subscribeToChecklists` fetches all checklists, then filters client-side
**File:** `src/services/db.ts:222–243`

All of a user's checklists are streamed down and filtered in JavaScript. With many checklists, this wastes bandwidth and memory. Adding a Firestore `where('projectId', '==', projectId)` query condition (with a composite index) would scope the subscription server-side.

---

### IMP-2 · No error handling when deleting items or todos
**File:** `src/pages/ProjectDetail.tsx`, `src/pages/ChecklistDetail.tsx`

`handleDeleteChecklist` and `handleDeleteTodo` in `ProjectDetail.tsx` have no `try/catch`. Errors are swallowed silently with no user feedback. `deleteItem` in `ChecklistDetail.tsx` is called without awaiting or catching.

---

### IMP-3 · `SharedProject.tsx` uses `window.location.reload()` after mutations
**File:** `src/pages/SharedProject.tsx:96, 116`

After creating a checklist or todo in the shared project view, a full page reload is triggered instead of updating local state. This discards all in-memory state and produces a poor UX. Update state locally or re-fetch incrementally.

---

### IMP-4 · `onPhotoUpload` prop type union is misleading
**File:** `src/components/Checklist/ChecklistItemRow.tsx:24`

```ts
onPhotoUpload: (id: string, file: File | React.ChangeEvent<HTMLInputElement>) => void;
```

The `File` branch is never used in any callsite — all callers pass a `ChangeEvent`. Remove the dead union member to reduce confusion.

---

### IMP-5 · Projects have no defined sort order
**File:** `src/services/db.ts:107–120`

`subscribeToProjects` queries without `orderBy`, so project list order is non-deterministic. Add a `position` field to projects (like checklists have) and sort by it, or sort by `createdAt`.

---

### IMP-6 · `handleAddSubItem` adds "New sub-task" without focusing for immediate edit
**File:** `src/pages/ChecklistDetail.tsx:203–212`

A new sub-item is added with hardcoded text `"New sub-task"` and a success toast, but the item is not automatically focused for renaming. The user must click it manually to start editing.

---

### IMP-7 · `addComment` does not verify the parent item exists
**File:** `src/services/db.ts:848`

If `itemId` is stale or invalid, `addComment` will still create the comment document and increment `commentCount` on a non-existent item. A pre-existence check would prevent orphaned comment documents.

---

### IMP-8 · `firestore.rules` — mixed auth model is hard to reason about
**File:** `firestore.rules`

Some paths require `isVerified()` (email-verified users), others allow anonymous collaborators via share tokens. The access model has no `isAnonymousCollaborator()` helper, making it easy to introduce gaps during future rule changes. Adding a named helper would improve maintainability and auditability.

---

## Summary Table

| ID | Type | Severity | File | Description |
|----|------|----------|------|-------------|
| BUG-1 | Bug | 🔴 High | `db.ts:365` | `deleteItem` crashes on missing item — no existence check |
| BUG-2 | Bug | 🔴 High | `db.ts:932` | `getSharedChecklist` missing existence check on checklist |
| BUG-3 | Bug | 🔴 High | `SharedChecklist.tsx:55` | Memory leak — subscriptions not cleaned up on fast unmount |
| BUG-4 | Bug | 🔴 High | `SharedProject.tsx:183` | Invalid `Button render` prop — navigation is broken |
| BUG-5 | Bug | 🟠 Medium | `SharedProject.tsx:278` | URL becomes `/share/undefined` when shareToken is null |
| BUG-6 | Bug | 🟠 Medium | `db.ts:278` | Comments subcollection orphaned when checklist is deleted |
| BUG-7 | Bug | 🟠 Medium | `db.ts:278` | No batch-size guard in `deleteChecklist` (500 op limit) |
| BUG-8 | Bug | 🟠 Medium | `db.ts:885` | `moveTodoToChecklist` missing `position` and `projectId` |
| BUG-9 | Bug | 🟠 Medium | `Dashboard.tsx:115` | Cross-tab drag reorder corrupts position values |
| BUG-10 | Bug | 🟡 Low | `ChecklistDetail.tsx:117` | Auto-complete toast can fire more than once |
| BUG-11 | Bug | 🟡 Low | `db.ts:897` | `itemsSnapshot.size` is unreliable as position proxy |
| SEC-1 | Security | 🔴 High | `db.ts:577, 758` | `Math.random()` used for share tokens — not cryptographically secure |
| SEC-2 | Security | 🔴 High | `storage.rules:11` | Unauthenticated users can upload photos |
| SEC-3 | Security | 🔴 High | `storage.rules:19` | Any authenticated user can delete any photo |
| SEC-4 | Security | 🔴 High | `db.ts:57` / `SharedChecklist.tsx:89` | PII (email, uid) leaked in toast error messages |
| SEC-5 | Security | 🟠 Medium | `SharedProject.tsx:91` | Guest creates content under project owner's UID |
| SEC-6 | Security | 🟡 Low | `firestore.rules:282, 319` | Share docs readable without authentication |
| SEC-7 | Security | 🟡 Low | `imageProcessing.ts` | No client-side file type/size validation |
| IMP-1 | Enhancement | — | `db.ts:222` | All checklists fetched then filtered client-side |
| IMP-2 | Enhancement | — | `ProjectDetail.tsx` | Silent failures on delete — no error handling |
| IMP-3 | Enhancement | — | `SharedProject.tsx:96` | `window.location.reload()` used after mutations |
| IMP-4 | Enhancement | — | `ChecklistItemRow.tsx:24` | Dead `File` type in `onPhotoUpload` prop union |
| IMP-5 | Enhancement | — | `db.ts:107` | Projects have no defined sort order |
| IMP-6 | Enhancement | — | `ChecklistDetail.tsx:203` | New sub-item not auto-focused for editing |
| IMP-7 | Enhancement | — | `db.ts:848` | `addComment` doesn't verify parent item exists |
| IMP-8 | Enhancement | — | `firestore.rules` | Mixed auth model lacks named helper for anonymous collaborators |

---

*Generated by Claude Code audit — Checkify Pro*
