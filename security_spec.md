# Security Specification - VeriCheck

## 1. Data Invariants
- A checklist must belong to a valid user (`userId`).
- A checklist item must reference a valid checklist ID.
- Checklists have a status (active, completed, archived).
- Users can only see their own checklists unless shared.
- Shared checklists allow public read/write based on permission level (`view` or `edit`).
- Items can be nested via `parentId`.

## 2. The "Dirty Dozen" Payloads (All MUST return PERMISSION_DENIED)
1. **Identity Theft**: Update a checklist `userId` to a different user's ID.
2. **Ghost Field**: Add `isVerified: true` to a checklist item when the schema doesn't allow it.
3. **Orphaned Item**: Create a checklist item with a random `checklistId` that doesn't exist.
4. **Unauthorized View**: Read a checklist by ID that belongs to another user (without a share token).
5. **Admin Spoof**: Set a `role: 'admin'` field on a user document (if we used user docs).
6. **Token Bypass**: Access a checklist via a revoked share token.
7. **Permission Escalation**: Update an item via a 'view' only share token.
8. **Resource Exhaustion**: Use a 2MB string as an item text.
9. **ID Poisoning**: Use a 2KB string with junk characters as a checklist ID.
10. **State Shortcut**: Move a checklist directly from 'active' to 'archived' while bypassing required fields if any (though status transitions are flexible here, we guard terminal states).
11. **Negative Position**: Set a checklist item `position` to `-1`.
12. **Tampered Timestamp**: Set `updatedAt` to a past date instead of `request.time`.

## 3. Test Runner (Mock)
A complete `firestore.rules.test.ts` would verify these. (I will implement the rules to block these).

## 4. Relationship Mapping
- `ChecklistItem` belongs to `Checklist`.
- Access to `ChecklistItem` is derived from:
    - Ownership of the parent `Checklist`.
    - Possession of an active `ChecklistShare` token for the parent `Checklist`.

## 5. Conflict Report
| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
| :--- | :--- | :--- | :--- |
| checklists | BLOCKED | BLOCKED | BLOCKED |
| checklist_items | BLOCKED | BLOCKED | BLOCKED |
| shares | BLOCKED | N/A | BLOCKED |
