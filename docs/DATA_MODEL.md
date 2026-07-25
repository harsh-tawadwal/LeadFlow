# LeadFlow Data Model

This document reflects the data model as actually implemented in
`prisma/schema.prisma`. It supersedes the original `DATA_MODEL.md`
on the point of lead deletion, which is now soft delete (see below);
everything else is unchanged from the original spec.

## User

Fields:

- id
- name
- email (unique)
- passwordHash
- role
- createdAt
- updatedAt

Roles:

- ADMIN
- MEMBER

---

## Lead

Fields:

- id
- name
- email
- phone
- company
- message
- source
- status
- assignedToId
- deletedAt (nullable — soft delete marker, see below)
- createdAt
- updatedAt

Status:

- NEW
- CONTACTED
- QUALIFIED
- PROPOSAL
- WON
- LOST

Relationships:

Lead belongs to optional assigned User.

Lead has many Notes.

Lead has many Activities.

---

## Note

Fields:

- id
- content
- leadId
- authorId
- createdAt
- updatedAt

Relationships:

Note belongs to Lead.

Note belongs to User (author).

---

## Activity

Fields:

- id
- leadId
- actorId (optional)
- type
- metadata (optional)
- createdAt

Relationships:

Activity belongs to Lead.

Activity optionally belongs to User (actor).

---

# Soft Delete (Lead)

Leads are never physically deleted by the application.

1. `Lead.deletedAt` is a nullable `DateTime`. `NULL` means the lead is
   active. A non-null value is the timestamp the lead was deleted.
2. `DELETE /api/leads/:id` (implemented in a later phase) sets
   `deletedAt = now()` instead of issuing a SQL `DELETE`.
3. Only ADMIN users may perform this action.
4. All standard lead queries (`GET /api/leads`, `GET /api/leads/:id`,
   and any list/detail query used by the dashboard) filter
   `WHERE deletedAt IS NULL` by default. Deleted leads are invisible
   through normal APIs, for every role, including ADMIN.
5. Notes and Activities belonging to a soft-deleted lead are **not**
   removed, hidden, or modified. They remain queryable directly
   (e.g. by lead ID) for audit purposes, even though the lead itself
   no longer appears in standard listings.
6. Soft-deleting a lead creates a `LEAD_DELETED` Activity record. Because
   soft delete is an `UPDATE`, not a `DELETE`, this activity record is
   never at risk of being cascade-removed — it persists in the audit
   trail indefinitely.
7. At the database level, `Lead -> Note` and `Lead -> Activity` foreign
   keys are `onDelete: Restrict`, not `Cascade`. The application never
   triggers this path (it never hard-deletes a Lead), but it exists as
   a defensive backstop: it makes it structurally impossible to
   accidentally hard-delete a Lead while Notes/Activities still
   reference it, even via a manual/out-of-band DB operation.
8. Restoring a soft-deleted lead (clearing `deletedAt`) is explicitly
   out of scope for the current phase. Not built unless separately
   requested.

---

# Data Integrity Rules

1. Email fields should be validated.
2. User email must be unique.
3. Lead assignment must reference an existing user.
4. Notes must reference an existing lead.
5. Activities must reference an existing lead.
6. Foreign key behavior must be explicitly defined (see above).
7. Deleting a lead (soft delete) must not remove or orphan its notes
   or activities — they remain intact and queryable.
8. Activity records are immutable and are never deleted by normal
   application operation, including lead deletion.
