import { Role } from "@/types/auth";
import { LetterItem, LetterDirection } from "@/types/letter";

/* ─── Permission Interface ─────────────────────────────────────── */

export interface LetterPermissions {
  // Visibility
  canViewAllLetters: boolean; // ADMIN: system-wide
  canViewDirectorateLetters: boolean; // DIRECTORATE_MANAGER: own directorate
  canViewOwnLetters: boolean; // EMPLOYEE: own / assigned only
  canViewRegistryLetters: boolean; // REGISTRY_OFFICER: registry/dispatch focused

  // Letter-level actions
  canViewLetter: boolean;
  canViewTracking: boolean;
  canViewAudit: boolean;

  // Registry operations
  canRegisterLetter: boolean;
  canEditRegistrationMetadata: boolean;
  canUploadScan: boolean;
  canClassifyLetter: boolean;

  // Workflow operations
  canRouteLetter: boolean;
  canAssignLetter: boolean;
  canApproveLetter: boolean;
  canRejectLetter: boolean;
  canRequestChanges: boolean;
  canDispatchLetter: boolean;
  canRecordDispatch: boolean;

  // Editing
  canEditLetter: boolean;
  canUploadAttachment: boolean;
  canAddProcessingNote: boolean;
  canSubmitLetter: boolean;
  canRespondToLetter: boolean;
  canMarkComplete: boolean;

  // Archive
  canArchiveLetter: boolean;
  canRestoreLetter: boolean;
  canViewArchive: boolean;

  // Creation — what directions are allowed
  canCreateIncoming: boolean;
  canCreateOutgoing: boolean;
  canCreateInternal: boolean;

  // New Letter menu actions (ordered, role-specific)
  newLetterActions: NewLetterAction[];

  // Table display config
  tableColumns: ColumnConfig[];

  // Role label for display
  roleLabel: string;
  roleScope: string;
}

export interface NewLetterAction {
  label: string;
  direction: LetterDirection;
  icon: string;
}

export interface ColumnConfig {
  id: string;
  header: string;
}

/* ─── Role-Specific Column Definitions ─────────────────────────── */

const ADMIN_COLUMNS: ColumnConfig[] = [
  { id: "directionSubject", header: "Direction & Subject" },
  { id: "typeDirectorate", header: "Type & Directorate" },
  { id: "fromTo", header: "From / To" },
  { id: "currentLocation", header: "Current Location" },
  { id: "assignedTo", header: "Assigned To" },
  { id: "date", header: "Date" },
  { id: "status", header: "Status" },
  { id: "actions", header: "Actions" },
];

const REGISTRY_COLUMNS: ColumnConfig[] = [
  { id: "registrationSubject", header: "Registration / Subject" },
  { id: "letterType", header: "Letter Type" },
  { id: "senderRecipient", header: "Sender / Recipient" },
  { id: "receivedSentDate", header: "Received / Sent Date" },
  { id: "registrationNumber", header: "Registration No." },
  { id: "status", header: "Status" },
  { id: "actions", header: "Actions" },
];

const MANAGER_COLUMNS: ColumnConfig[] = [
  { id: "directionSubject", header: "Direction & Subject" },
  { id: "letterType", header: "Letter Type" },
  { id: "fromTo", header: "From / To" },
  { id: "assignedOfficer", header: "Assigned Officer" },
  { id: "priority", header: "Priority" },
  { id: "date", header: "Date" },
  { id: "status", header: "Status" },
  { id: "actions", header: "Actions" },
];

const EMPLOYEE_COLUMNS: ColumnConfig[] = [
  { id: "directionSubject", header: "Direction & Subject" },
  { id: "letterType", header: "Letter Type" },
  { id: "fromTo", header: "From / To" },
  { id: "dueDate", header: "Due Date" },
  { id: "priority", header: "Priority" },
  { id: "status", header: "Status" },
  { id: "actions", header: "Actions" },
];

/* ─── getLetterPermissions ──────────────────────────────────────── */

export function getLetterPermissions(
  role: Role | undefined | null,
  letter?: LetterItem | null,
): LetterPermissions {
  const st = letter?.status?.toUpperCase() ?? "";
  const dir = letter?.direction?.toUpperCase() ?? "";

  /* ── ADMINISTRATOR ─────────────────────────────────────────── */
  if (role === "ADMIN") {
    return {
      canViewAllLetters: true,
      canViewDirectorateLetters: true,
      canViewOwnLetters: true,
      canViewRegistryLetters: true,

      canViewLetter: true,
      canViewTracking: true,
      canViewAudit: true,

      canRegisterLetter: true,
      canEditRegistrationMetadata: true,
      canUploadScan: true,
      canClassifyLetter: true,

      canRouteLetter: !!(
        letter &&
        (st === "REGISTERED" || st === "RECEIVED") &&
        (dir === "INCOMING" || dir === "INTERNAL")
      ),
      canAssignLetter: false,
      canApproveLetter: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL") &&
        (dir === "OUTGOING" || dir === "INTERNAL")
      ),
      canRejectLetter: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL") &&
        (dir === "OUTGOING" || dir === "INTERNAL")
      ),
      canRequestChanges: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL") &&
        (dir === "OUTGOING" || dir === "INTERNAL")
      ),
      canDispatchLetter: !!(
        letter &&
        (st === "APPROVED" || st === "READY_FOR_DISPATCH") &&
        dir === "OUTGOING"
      ),
      canRecordDispatch: !!(
        letter &&
        (st === "APPROVED" || st === "READY_FOR_DISPATCH")
      ),

      canEditLetter: !!(
        letter &&
        (st === "DRAFT" || st === "CHANGES_REQUESTED")
      ),
      canUploadAttachment: !!(letter && st !== "ARCHIVED"),
      canAddProcessingNote: true,
      canSubmitLetter: false,
      canRespondToLetter: false,
      canMarkComplete: !!(
        letter &&
        (st === "DISPATCHED" || st === "DELIVERED" || st === "IN_PROGRESS")
      ),

      canArchiveLetter: !!(letter && st !== "ARCHIVED"),
      canRestoreLetter: !!(letter && st === "ARCHIVED"),
      canViewArchive: true,

      canCreateIncoming: false,
      canCreateOutgoing: true,
      canCreateInternal: true,

      newLetterActions: [
        { label: "Create Outgoing Letter", direction: "OUTGOING", icon: "📤" },
        { label: "Create Internal Memo", direction: "INTERNAL", icon: "🏢" },
      ],

      tableColumns: ADMIN_COLUMNS,
      roleLabel: "Administrator",
      roleScope: "All system letters",
    };
  }

  /* ── REGISTRY OFFICER ──────────────────────────────────────── */
  if (role === "REGISTRY_OFFICER") {
    return {
      canViewAllLetters: false,
      canViewDirectorateLetters: false,
      canViewOwnLetters: false,
      canViewRegistryLetters: true,

      canViewLetter: true,
      canViewTracking: true,
      canViewAudit: false,

      canRegisterLetter: true,
      canEditRegistrationMetadata: !!(
        letter &&
        (st === "REGISTERED" || st === "RECEIVED") &&
        dir === "INCOMING"
      ),
      canUploadScan: !!(letter && dir === "INCOMING"),
      canClassifyLetter: !!(letter && dir === "INCOMING"),

      canRouteLetter: !!(
        letter &&
        st === "REGISTERED" &&
        dir === "INCOMING"
      ),
      canAssignLetter: false,
      canApproveLetter: false,
      canRejectLetter: false,
      canRequestChanges: false,
      canDispatchLetter: !!(
        letter &&
        (st === "APPROVED" || st === "READY_FOR_DISPATCH") &&
        dir === "OUTGOING"
      ),
      canRecordDispatch: !!(
        letter &&
        (st === "APPROVED" || st === "READY_FOR_DISPATCH") &&
        dir === "OUTGOING"
      ),

      canEditLetter: false,
      canUploadAttachment: !!(
        letter &&
        dir === "INCOMING" &&
        st !== "ARCHIVED"
      ),
      canAddProcessingNote: false,
      canSubmitLetter: false,
      canRespondToLetter: false,
      canMarkComplete: false,

      canArchiveLetter: false,
      canRestoreLetter: false,
      canViewArchive: true, // read-only relevant records

      canCreateIncoming: true,
      canCreateOutgoing: false, // cannot create outgoing — only dispatch approved ones
      canCreateInternal: false,

      newLetterActions: [
        {
          label: "Register Incoming Letter",
          direction: "INCOMING",
          icon: "📥",
        },
        {
          label: "Dispatch Approved Outgoing Letter",
          direction: "OUTGOING",
          icon: "📤",
        },
      ],

      tableColumns: REGISTRY_COLUMNS,
      roleLabel: "Registry Officer",
      roleScope: "Registry and dispatch correspondence",
    };
  }

  /* ── DIRECTORATE MANAGER ───────────────────────────────────── */
  if (role === "DEPARTMENT_MANAGER") {
    return {
      canViewAllLetters: false,
      canViewDirectorateLetters: true,
      canViewOwnLetters: false,
      canViewRegistryLetters: false,

      canViewLetter: true,
      canViewTracking: true,
      canViewAudit: false,

      canRegisterLetter: false,
      canEditRegistrationMetadata: false,
      canUploadScan: false,
      canClassifyLetter: false,

      canRouteLetter: false,
      canAssignLetter: !!(
        letter &&
        (st === "RECEIVED" || st === "ASSIGNED") &&
        (dir === "INCOMING" || dir === "INTERNAL")
      ),
      canApproveLetter: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL") &&
        (dir === "OUTGOING" || dir === "INTERNAL")
      ),
      canRejectLetter: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL")
      ),
      canRequestChanges: !!(
        letter &&
        (st === "PENDING_REVIEW" || st === "PENDING_APPROVAL")
      ),
      canDispatchLetter: false,
      canRecordDispatch: false,

      canEditLetter: false,
      canUploadAttachment: !!(
        letter &&
        st !== "ARCHIVED" &&
        st !== "COMPLETED"
      ),
      canAddProcessingNote: true,
      canSubmitLetter: false,
      canRespondToLetter: false,
      canMarkComplete: !!(
        letter &&
        (st === "IN_PROGRESS" || st === "DISPATCHED" || st === "DELIVERED")
      ),

      canArchiveLetter: false,
      canRestoreLetter: false,
      canViewArchive: true, // own directorate only

      canCreateIncoming: false,
      canCreateOutgoing: true,
      canCreateInternal: true,

      newLetterActions: [
        { label: "Create Outgoing Letter", direction: "OUTGOING", icon: "📤" },
        { label: "Create Internal Memo", direction: "INTERNAL", icon: "🏢" },
      ],

      tableColumns: MANAGER_COLUMNS,
      roleLabel: "Directorate Manager",
      roleScope: "Directorate correspondence",
    };
  }

  /* ── EMPLOYEE / OFFICER (default) ──────────────────────────── */
  return {
    canViewAllLetters: false,
    canViewDirectorateLetters: false,
    canViewOwnLetters: true,
    canViewRegistryLetters: false,

    canViewLetter: true,
    canViewTracking: true,
    canViewAudit: false,

    canRegisterLetter: false,
    canEditRegistrationMetadata: false,
    canUploadScan: false,
    canClassifyLetter: false,

    canRouteLetter: false,
    canAssignLetter: false,
    canApproveLetter: false,
    canRejectLetter: false,
    canRequestChanges: false,
    canDispatchLetter: false,
    canRecordDispatch: false,

    canEditLetter: !!(letter && (st === "DRAFT" || st === "CHANGES_REQUESTED")),
    canUploadAttachment: !!(letter && st !== "ARCHIVED" && st !== "COMPLETED"),
    canAddProcessingNote: !!(letter && st !== "ARCHIVED"),
    canSubmitLetter: !!(
      letter &&
      (st === "DRAFT" || st === "IN_PROGRESS" || st === "CHANGES_REQUESTED")
    ),
    canRespondToLetter: !!(
      letter &&
      dir === "INCOMING" &&
      st === "IN_PROGRESS"
    ),
    canMarkComplete: !!(letter && st === "IN_PROGRESS"),

    canArchiveLetter: false,
    canRestoreLetter: false,
    canViewArchive: false,

    canCreateIncoming: false,
    canCreateOutgoing: true,
    canCreateInternal: true,

    newLetterActions: [
      { label: "Create Outgoing Letter", direction: "OUTGOING", icon: "📤" },
      { label: "Create Internal Memo", direction: "INTERNAL", icon: "🏢" },
    ],

    tableColumns: EMPLOYEE_COLUMNS,
    roleLabel: "Officer",
    roleScope: "Your assigned and submitted correspondence",
  };
}
