import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLetterPermissions } from "@/hooks/useLetterPermissions";
import letterService from "@/services/letterService";
import { LetterItem, AttachmentItem, LetterDirection } from "@/types/letter";
import { useToast } from "@/components/common/Toast";
import { formatDate } from "@/utils/dateUtils";

import Card from "@/components/common/Card";
import Button from "@/components/common/Button";
import Badge, { LetterStatus } from "@/components/common/Badge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import {
  UploadAttachmentModal,
  LetterTimeline,
  LetterRoutingDialog,
  LetterAssignmentDialog,
  DispatchDialog,
  RelatedLetters,
  LetterTrackingCard,
} from "@/components/letters";
import CommentSection from "@/components/comments/CommentSection";

/* ─── Helper sub-components ──────────────────────────────────── */

const confidentialityStyles: Record<string, string> = {
  PUBLIC: "bg-[#4A6B4E]/10 text-[#4A6B4E] border-[#4A6B4E]/20",
  INTERNAL: "bg-[#526A55]/10 text-[#526A55] border-[#526A55]/20",
  CONFIDENTIAL: "bg-[#C48D3F]/10 text-[#8A5D19] border-[#C48D3F]/20",
  RESTRICTED: "bg-[#8B3232]/10 text-[#8B3232] border-[#8B3232]/20",
};
const ConfidentialityBadge: React.FC<{ level: string }> = ({ level }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${confidentialityStyles[level] || "bg-[#D8D7D1]/60 text-[#6B6A64]"}`}
  >
    {level || "Not specified"}
  </span>
);

const priorityStyles: Record<string, string> = {
  URGENT: "bg-[#8B3232]/12 text-[#8B3232] border-[#8B3232]/20",
  HIGH: "bg-[#C48D3F]/12 text-[#8A5D19] border-[#C48D3F]/20",
  NORMAL: "bg-[#526A55]/12 text-[#3E5140] border-[#526A55]/20",
  LOW: "bg-[#D8D7D1]/60 text-[#6B6A64] border-[#D8D7D1]",
};
const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${priorityStyles[priority] || priorityStyles.NORMAL}`}
  >
    {priority}
  </span>
);

const directionStyles: Record<
  string,
  { bg: string; text: string; label: string; icon: string }
> = {
  INCOMING: {
    bg: "bg-[#526A55]/10",
    text: "text-[#526A55]",
    label: "Incoming Letter",
    icon: "📥",
  },
  OUTGOING: {
    bg: "bg-[#C48D3F]/10",
    text: "text-[#8A5D19]",
    label: "Outgoing Letter",
    icon: "📤",
  },
  INTERNAL: {
    bg: "bg-[#6B5A8E]/10",
    text: "text-[#4A3A6B]",
    label: "Internal Memo",
    icon: "🏢",
  },
};
const DirectionBadge: React.FC<{ direction?: LetterDirection | string }> = ({
  direction,
}) => {
  const d =
    directionStyles[direction || "INCOMING"] || directionStyles.INCOMING;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${d.bg} ${d.text}`}
    >
      {d.icon} {d.label}
    </span>
  );
};

const MetaField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-1">
    <dt className="text-[11px] font-bold uppercase tracking-wider text-[#8A8983]">
      {label}
    </dt>
    <dd className="text-sm font-medium text-[#292A27]">{children}</dd>
  </div>
);

const AttachmentTimelineItem: React.FC<{
  attachment: AttachmentItem;
  isLast: boolean;
}> = ({ attachment, isLast }) => (
  <div className="flex items-start space-x-4">
    <div className="flex flex-col items-center">
      <div
        className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${attachment.isCurrent ? "bg-[#526A55] ring-4 ring-[#526A55]/20" : "bg-[#D8D7D1]"}`}
      />
      {!isLast && (
        <div className="w-0.5 flex-1 min-h-[40px] bg-[#D8D7D1]/60 mt-1" />
      )}
    </div>
    <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-bold text-[#292A27]">
          {attachment.fileName || "Attachment"}
        </span>
        {attachment.isCurrent && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-[#526A55]/15 text-[#526A55]">
            CURRENT
          </span>
        )}
      </div>
      <p className="text-xs text-[#6B6A64] mt-0.5">
        Uploaded by{" "}
        <span className="font-semibold text-[#292A27]">
          {attachment.uploadedBy}
        </span>
      </p>
      <p className="text-xs text-[#8A8983]">{attachment.date}</p>
      {attachment.fileSize && (
        <p className="text-[11px] text-[#8A8983] mt-0.5">
          {(attachment.fileSize / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}
    </div>
  </div>
);

/* ─── Role-specific Action Panel ─────────────────────────────── */

interface ActionPanelProps {
  role: string | undefined;
  letter: LetterItem;
  onRegister?: () => void;
  onRoute: () => void;
  onAssign: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onUpload: () => void;
  onSubmit: () => void;
  onRespond: () => void;
  onMarkComplete: () => void;
  onAddNote: () => void;
  isSubmitting: boolean;
}

const RoleActionPanel: React.FC<ActionPanelProps> = ({
  role,
  letter,
  onRegister,
  onRoute,
  onAssign,
  onApprove,
  onReject,
  onRequestChanges,
  onDispatch,
  onComplete,
  onArchive,
  onEdit,
  onUpload,
  onSubmit,
  onRespond,
  onMarkComplete,
  onAddNote,
  isSubmitting,
}) => {
  const perms = useLetterPermissions(letter);

  if (role === "ADMIN") {
    return (
      <Card className="border-l-4 border-l-[#292A27]">
        <h3 className="text-sm font-bold text-[#292A27] mb-4 flex items-center space-x-2">
          <span>🏛️</span>
          <span>Administrative Actions</span>
        </h3>
        <div className="space-y-2">
          {perms.canRouteLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onRoute}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Route to Directorate
            </Button>
          )}
          {perms.canAssignLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onAssign}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              Assign Officer
            </Button>
          )}
          {perms.canApproveLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onApprove}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Approve
            </Button>
          )}
          {perms.canRecordDispatch && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onDispatch}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              Record Dispatch
            </Button>
          )}
          {perms.canMarkComplete && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onComplete}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Mark Completed
            </Button>
          )}
          {perms.canArchiveLetter && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[#8B3232] border-[#8B3232]/30 hover:bg-[#8B3232]/05"
              onClick={onArchive}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Archive Letter
            </Button>
          )}
          {!perms.canRouteLetter &&
            !perms.canAssignLetter &&
            !perms.canApproveLetter &&
            !perms.canRecordDispatch &&
            !perms.canMarkComplete &&
            !perms.canArchiveLetter && (
              <p className="text-xs text-[#8A8983] text-center py-2">
                No administrative actions required at this stage.
              </p>
            )}
        </div>
      </Card>
    );
  }

  /* ── REGISTRY OFFICER Action Panel ────────────────────────── */
  if (role === "REGISTRY_OFFICER") {
    return (
      <Card className="border-l-4 border-l-[#526A55]">
        <h3 className="text-sm font-bold text-[#292A27] mb-4 flex items-center space-x-2">
          <span>📋</span>
          <span>Registry Actions</span>
        </h3>
        <div className="space-y-2">
          {perms.canRegisterLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onRegister}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Register & Classify
            </Button>
          )}
          {perms.canRouteLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onRoute}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Route to Administrator
            </Button>
          )}
          {perms.canUploadAttachment && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onUpload}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload / Replace Scan
            </Button>
          )}
          {perms.canRecordDispatch && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onDispatch}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              Dispatch Letter
            </Button>
          )}
          {!perms.canRegisterLetter &&
            !perms.canRouteLetter &&
            !perms.canRecordDispatch && (
              <p className="text-xs text-[#8A8983] text-center py-2">
                No registry actions available at this stage.
              </p>
            )}
        </div>
      </Card>
    );
  }

  /* ── DIRECTORATE MANAGER Action Panel ─────────────────────── */
  if (role === "DEPARTMENT_MANAGER") {
    return (
      <Card className="border-l-4 border-l-[#C48D3F]">
        <h3 className="text-sm font-bold text-[#292A27] mb-4 flex items-center space-x-2">
          <span>🔍</span>
          <span>Review Actions</span>
        </h3>
        <div className="space-y-2">
          {perms.canApproveLetter && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={onApprove}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Approve Letter
            </Button>
          )}
          {perms.canRequestChanges && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onRequestChanges}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Request Changes
            </Button>
          )}
          {perms.canRejectLetter && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[#8B3232] border-[#8B3232]/30"
              onClick={onReject}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Reject Letter
            </Button>
          )}
          {perms.canAssignLetter && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onAssign}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              Assign to Officer
            </Button>
          )}
          {perms.canMarkComplete && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onComplete}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Mark Completed
            </Button>
          )}
          {!perms.canApproveLetter &&
            !perms.canRejectLetter &&
            !perms.canAssignLetter &&
            !perms.canMarkComplete && (
              <p className="text-xs text-[#8A8983] text-center py-2">
                No review actions available at this stage.
              </p>
            )}
        </div>
      </Card>
    );
  }

  /* ── EMPLOYEE / OFFICER Action Panel ──────────────────────── */
  return (
    <Card className="border-l-4 border-l-[#6B5A8E]">
      <h3 className="text-sm font-bold text-[#292A27] mb-4 flex items-center space-x-2">
        <span>✏️</span>
        <span>Work Actions</span>
      </h3>
      <div className="space-y-2">
        {perms.canEditLetter && (
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={onEdit}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit Letter
          </Button>
        )}
        {perms.canSubmitLetter && (
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={onSubmit}
            isLoading={isSubmitting}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Submit for Review
          </Button>
        )}
        {perms.canRespondToLetter && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onRespond}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            Respond to Letter
          </Button>
        )}
        {perms.canUploadAttachment && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onUpload}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Upload Attachment
          </Button>
        )}
        {perms.canAddProcessingNote && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onAddNote}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Add Processing Note
          </Button>
        )}
        {perms.canMarkComplete && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onMarkComplete}
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Mark Task Complete
          </Button>
        )}
        {!perms.canEditLetter &&
          !perms.canSubmitLetter &&
          !perms.canRespondToLetter &&
          !perms.canMarkComplete && (
            <p className="text-xs text-[#8A8983] text-center py-2">
              No work actions available at this stage.
            </p>
          )}
      </div>
    </Card>
  );
};

/* ─── Main Component ─────────────────────────────────────────── */

export const LetterDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [letter, setLetter] = useState<LetterItem | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog / modal states
  const [isUploadAttachmentOpen, setIsUploadAttachmentOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRoutingOpen, setIsRoutingOpen] = useState(false);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  const role = user?.role;

  /* ─── Data fetching ──────────────────────────────────────── */
  const fetchLetter = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [letterData, attachmentData] = await Promise.all([
        letterService.getLetterById(id),
        letterService.getLetterAttachments(id),
      ]);
      setLetter(letterData);
      setAttachments(attachmentData);
    } catch (err: any) {
      setError(
        err.response?.status === 403 || err.response?.status === 404
          ? "You don't have permission to view this letter."
          : err.message || "Failed to load letter details.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLetter();
  }, [fetchLetter]);

  /* ─── Actions ─────────────────────────────────────────────── */

  const handleDownload = async () => {
    if (!letter) return;
    try {
      addToast({
        type: "info",
        title: "Downloading...",
        message: `Preparing ${letter.file_name}`,
      });
      await letterService.downloadAttachment(letter.id, letter.file_name);
      addToast({
        type: "success",
        title: "Download Started",
        message: `${letter.file_name} has been downloaded.`,
      });
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Download Failed",
        message: err.message || "Unable to download attachment.",
      });
    }
  };

  const handleArchive = async () => {
    if (!letter) return;
    setIsArchiving(true);
    try {
      await letterService.archiveLetter(letter.id);
      addToast({
        type: "success",
        title: "Letter Archived",
        message: `"${letter.subject}" has been archived.`,
      });
      setIsArchiveDialogOpen(false);
      fetchLetter();
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Archive Failed",
        message: err.message || "Could not archive letter.",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!letter) return;
    setIsSubmitting(true);
    try {
      await letterService.submitForApproval(letter.id);
      addToast({
        type: "success",
        title: "Submitted for Review",
        message: `"${letter.subject}" has been submitted.`,
      });
      fetchLetter();
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Submission Failed",
        message: err.message || "Could not submit letter.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!letter) return;
    try {
      await letterService.approveLetter(letter.id);
      addToast({
        type: "success",
        title: "Letter Approved",
        message: `"${letter.subject}" has been approved.`,
      });
      fetchLetter();
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Approval Failed",
        message: err.message || "Could not approve letter.",
      });
    }
  };

  const handleComplete = async () => {
    if (!letter) return;
    try {
      await letterService.completeLetter(letter.id);
      addToast({
        type: "success",
        title: "Marked Completed",
        message: `"${letter.subject}" is now completed.`,
      });
      fetchLetter();
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Failed",
        message: err.message || "Could not complete letter.",
      });
    }
  };

  /* ─── Loading / Error states ─────────────────────────────── */
  if (isLoading) {
    return (
      <div className="py-20 flex justify-center items-center">
        <LoadingSpinner size="lg" label="Loading letter details..." />
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        title="Letter Unavailable"
        description={error}
        onRetry={fetchLetter}
      />
    );
  }
  if (!letter) {
    return (
      <EmptyState
        title="Letter Not Found"
        description="The requested letter could not be located in the repository."
        actionLabel="Back to Letter Repository"
        onAction={() => navigate("/letters")}
      />
    );
  }

  const dir = letter.direction?.toUpperCase();
  const st = letter.status?.toUpperCase();

  /* ─── Compute current location label ─────────────────────── */
  const currentLocationLabel =
    letter.currentLocation ||
    (letter.currentDepartment?.toLowerCase().includes("registry") ||
    letter.currentDepartment?.toLowerCase().includes("dispatch")
      ? "Central Registry"
      : letter.currentDepartment?.toLowerCase().includes("admin")
        ? "Main Administration"
        : letter.currentDepartment || "Main Administration");

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate("/letters")}
        className="inline-flex items-center space-x-1.5 text-sm font-medium text-[#526A55] hover:text-[#3E5140] transition-colors group"
      >
        <svg
          className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span>Back to Letters</span>
      </button>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-3 flex-wrap gap-y-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#292A27]">
              {letter.subject}
            </h1>
            <Badge status={letter.status as LetterStatus} dot />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#6B6A64] font-mono font-medium">
              {letter.referenceNumber}
            </span>
            <DirectionBadge direction={letter.direction} />
            {letter.priority && <PriorityBadge priority={letter.priority} />}
            {letter.registrationNumber &&
              letter.registrationNumber !== letter.referenceNumber && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#526A55]/10 text-[#526A55]">
                  {letter.registrationNumber}
                </span>
              )}
          </div>
        </div>

        {/* Download always visible */}
        <div className="flex items-center space-x-2">
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </Button>
          {role === "ADMIN" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(`/letters/track?ref=${letter.referenceNumber}`)
              }
            >
              Track
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <Card>
            <LetterTimeline
              currentStatus={letter.status}
              direction={letter.direction}
              timestamps={{
                created_at: letter.created_at,
                completed_at: letter.updated_at,
              }}
            />
          </Card>

          {/* Letter Information */}
          <Card>
            <h2 className="text-base font-semibold text-[#292A27] mb-5">
              Letter Information
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
              <MetaField label="Reference Number">
                <span className="font-mono text-xs bg-[#ECEAE3] px-2 py-0.5 rounded-lg">
                  {letter.referenceNumber}
                </span>
              </MetaField>
              {letter.registrationNumber && (
                <MetaField label="Registration Number">
                  <span className="font-mono text-xs bg-[#ECEAE3] px-2 py-0.5 rounded-lg">
                    {letter.registrationNumber}
                  </span>
                </MetaField>
              )}
              {letter.externalReferenceNumber && (
                <MetaField label="External Reference">
                  <span className="font-mono text-xs bg-[#ECEAE3] px-2 py-0.5 rounded-lg">
                    {letter.externalReferenceNumber}
                  </span>
                </MetaField>
              )}
              <MetaField label="Direction">
                <DirectionBadge direction={letter.direction} />
              </MetaField>
              <MetaField label="Letter Type">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#292A27]/08 text-[#292A27] border border-[#292A27]/12">
                  {letter.letterType.charAt(0) +
                    letter.letterType.slice(1).toLowerCase()}
                </span>
              </MetaField>
              <MetaField label="Category">{letter.category}</MetaField>

              {/* Internal: show From/To Directorate prominently */}
              {dir === "INTERNAL" ? (
                <>
                  <MetaField label="From Directorate">
                    <span className="text-[#4A3A6B] font-semibold">
                      {letter.fromDirectorate ||
                        letter.originatingDepartment ||
                        "—"}
                    </span>
                  </MetaField>
                  <MetaField label="To Directorate">
                    <span className="text-[#4A3A6B] font-semibold">
                      {letter.toDirectorate || letter.targetDepartment || "—"}
                    </span>
                  </MetaField>
                </>
              ) : (
                <MetaField label="Directorate">
                  {letter.department_name}
                </MetaField>
              )}

              <MetaField label="Confidentiality">
                <ConfidentialityBadge level={letter.confidentialityLevel} />
              </MetaField>
              {letter.priority && (
                <MetaField label="Priority">
                  <PriorityBadge priority={letter.priority} />
                </MetaField>
              )}
              <MetaField label="Registered By">{letter.created_by}</MetaField>
              <MetaField label="Registered At">
                {formatDate(letter.created_at)}
              </MetaField>
              <MetaField label="Last Updated">
                {formatDate(letter.updated_at)}
              </MetaField>
              {letter.dueDate && (
                <MetaField label="Due Date">
                  <span className="text-[#8B3232] font-semibold">
                    {formatDate(letter.dueDate)}
                  </span>
                </MetaField>
              )}
            </dl>
          </Card>

          {/* Correspondence Parties */}
          {(letter.sender || letter.recipient) && (
            <Card>
              <h2 className="text-base font-semibold text-[#292A27] mb-5">
                Correspondence Parties
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                {letter.sender && (
                  <div className="space-y-1">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-[#8A8983]">
                      {dir === "INCOMING"
                        ? "External Sender"
                        : dir === "INTERNAL"
                          ? "Sending Officer"
                          : "Author"}
                    </dt>
                    <dd className="text-sm font-medium text-[#292A27]">
                      {letter.sender}
                    </dd>
                    {letter.senderOrganization && (
                      <dd className="text-xs text-[#6B6A64]">
                        {letter.senderOrganization}
                      </dd>
                    )}
                  </div>
                )}
                {letter.recipient && (
                  <div className="space-y-1">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-[#8A8983]">
                      {dir === "OUTGOING"
                        ? "External Recipient"
                        : dir === "INTERNAL"
                          ? "Receiving Directorate"
                          : "Addressed To"}
                    </dt>
                    <dd className="text-sm font-medium text-[#292A27]">
                      {letter.recipient}
                    </dd>
                    {letter.recipientOrganization && (
                      <dd className="text-xs text-[#6B6A64]">
                        {letter.recipientOrganization}
                      </dd>
                    )}
                  </div>
                )}
                {letter.dateReceived && (
                  <MetaField label="Date Received">
                    {formatDate(letter.dateReceived)}
                  </MetaField>
                )}
                {letter.dateSent && (
                  <MetaField label="Date Sent">
                    {formatDate(letter.dateSent)}
                  </MetaField>
                )}
              </dl>
            </Card>
          )}

          {/* Officer Assignments */}
          {letter.assignments && letter.assignments.length > 0 && (
            <Card>
              <h2 className="text-base font-semibold text-[#292A27] mb-5">
                Officer Assignments
              </h2>
              <div className="space-y-3">
                {letter.assignments.map((assignment, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#ECEAE3] border border-[#D8D7D1]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#292A27]">
                        {assignment.officerName}
                      </p>
                      <p className="text-xs text-[#6B6A64]">
                        Assigned by {assignment.assignedBy} ·{" "}
                        {assignment.assignedAt}
                      </p>
                      {assignment.instructions && (
                        <p className="text-xs text-[#6B6A64] mt-1 italic">
                          "{assignment.instructions}"
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {assignment.dueDate && (
                        <p className="text-xs font-semibold text-[#8B3232]">
                          Due: {assignment.dueDate}
                        </p>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          assignment.taskStatus === "COMPLETED"
                            ? "bg-[#4A6B4E]/15 text-[#4A6B4E]"
                            : assignment.taskStatus === "OVERDUE"
                              ? "bg-[#8B3232]/15 text-[#8B3232]"
                              : "bg-[#C48D3F]/15 text-[#8A5D19]"
                        }`}
                      >
                        {assignment.taskStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Summary */}
          {letter.description && (
            <Card>
              <h2 className="text-base font-semibold text-[#292A27] mb-3">
                Summary
              </h2>
              <p className="text-sm text-[#6B6A64] leading-relaxed whitespace-pre-line">
                {letter.description}
              </p>
            </Card>
          )}

          {/* Notes & Discussion */}
          <Card>
            <CommentSection documentId={letter.id} />
          </Card>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-6">
          {/* Tracking Card — current location */}
          <LetterTrackingCard
            referenceNumber={letter.referenceNumber}
            subject={letter.subject}
            status={letter.status}
            currentLocation={currentLocationLabel}
            responsibleUser={
              letter.assignedEmployee || letter.currentResponsibleUser
            }
            currentTask={
              st === "REGISTERED"
                ? "Awaiting Admin Routing"
                : st === "RECEIVED"
                  ? "Awaiting Officer Assignment"
                  : st === "IN_PROGRESS"
                    ? "Officer Processing"
                    : st === "PENDING_REVIEW"
                      ? "Awaiting Directorate Manager Review"
                      : st === "PENDING_APPROVAL"
                        ? "Awaiting Approval"
                        : st === "APPROVED"
                          ? "Approved — Ready for Registry Dispatch"
                          : st === "READY_FOR_DISPATCH"
                            ? "Awaiting Registry Dispatch"
                            : st === "DISPATCHED"
                              ? "Dispatched — Awaiting Delivery Confirmation"
                              : st === "COMPLETED"
                                ? "Complete"
                                : st === "DRAFT"
                                  ? "Draft in Progress"
                                  : "Workflow Processing"
            }
            dueDate={letter.dueDate}
            priority={letter.priority}
          />

          {/* Role-specific action panel — CORE FEATURE */}
          <RoleActionPanel
            role={role}
            letter={letter}
            onRegister={() => navigate("/letters/new?direction=INCOMING")}
            onRoute={() => setIsRoutingOpen(true)}
            onAssign={() => setIsAssignmentOpen(true)}
            onApprove={handleApprove}
            onReject={() => setIsRejectDialogOpen(true)}
            onRequestChanges={() => setIsRequestChangesOpen(true)}
            onDispatch={() => setIsDispatchOpen(true)}
            onComplete={handleComplete}
            onArchive={() => setIsArchiveDialogOpen(true)}
            onEdit={() => navigate(`/letters/${letter.id}/edit`)}
            onUpload={() => setIsUploadAttachmentOpen(true)}
            onSubmit={handleSubmitForApproval}
            onRespond={() => navigate(`/letters/${letter.id}/respond`)}
            onMarkComplete={handleComplete}
            onAddNote={() => {
              /* scroll to comment section */
            }}
            isSubmitting={isSubmitting}
          />

          {/* Related Letters */}
          {letter.relatedLetters && letter.relatedLetters.length > 0 && (
            <RelatedLetters
              relations={letter.relatedLetters}
              currentLetterId={letter.id}
            />
          )}

          {/* Dispatch Info */}
          {letter.dispatchInfo && (
            <Card>
              <h3 className="text-sm font-semibold text-[#292A27] mb-3">
                Dispatch Record
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6B6A64]">Method</span>
                  <span className="font-semibold text-[#292A27]">
                    {letter.dispatchInfo.dispatchMethod.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6A64]">Dispatched</span>
                  <span className="font-semibold text-[#292A27]">
                    {letter.dispatchInfo.dispatchDate}
                  </span>
                </div>
                {letter.dispatchInfo.courierReferenceNumber && (
                  <div className="flex justify-between">
                    <span className="text-[#6B6A64]">Courier Ref</span>
                    <span className="font-mono font-semibold text-[#292A27]">
                      {letter.dispatchInfo.courierReferenceNumber}
                    </span>
                  </div>
                )}
                {letter.dispatchInfo.deliveryConfirmation && (
                  <div className="flex items-center justify-between pt-1 border-t border-[#D8D7D1]/50">
                    <span className="text-[#6B6A64]">Delivery</span>
                    <span className="font-bold text-[#4A6B4E]">
                      ✓ Confirmed
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Attachments */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#292A27]">
                Attachments
              </h2>
              <span className="text-xs font-semibold text-[#526A55] bg-[#526A55]/10 px-2 py-0.5 rounded-full">
                {attachments.length} file{attachments.length !== 1 ? "s" : ""}
              </span>
            </div>
            {attachments.length === 0 ? (
              <EmptyState
                title="No attachments"
                description="No files attached to this letter."
              />
            ) : (
              <div>
                {attachments.map((att, idx) => (
                  <AttachmentTimelineItem
                    key={att.id}
                    attachment={att}
                    isLast={idx === attachments.length - 1}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Current Status Card */}
          <Card className="bg-[#ECEAE3]">
            <h3 className="text-sm font-semibold text-[#292A27] mb-3">
              Current Status
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#6B6A64]">Status</span>
                <Badge status={letter.status as LetterStatus} dot />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6B6A64]">Confidentiality</span>
                <ConfidentialityBadge level={letter.confidentialityLevel} />
              </div>
              {letter.assignedEmployee && (
                <div className="flex items-center justify-between">
                  <span className="text-[#6B6A64]">Assigned To</span>
                  <span className="font-semibold text-[#292A27] truncate ml-2">
                    {letter.assignedEmployee}
                  </span>
                </div>
              )}
              {letter.responseRequired && (
                <div className="flex items-center justify-between">
                  <span className="text-[#6B6A64]">Response Required</span>
                  <span className="font-semibold text-[#8B3232]">Yes</span>
                </div>
              )}
              {letter.dueDate && (
                <div className="flex items-center justify-between">
                  <span className="text-[#6B6A64]">Due Date</span>
                  <span className="font-semibold text-[#8B3232]">
                    {formatDate(letter.dueDate)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Tags */}
          {letter.tags && letter.tags.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#292A27] mb-3">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {letter.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#ECEAE3] text-[#526A55] border border-[#D8D7D1]/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modals & Dialogs */}
      <UploadAttachmentModal
        open={isUploadAttachmentOpen}
        letterId={letter.id}
        letterSubject={letter.subject}
        onClose={() => setIsUploadAttachmentOpen(false)}
        onSuccess={fetchLetter}
      />

      <LetterRoutingDialog
        open={isRoutingOpen}
        letterId={letter.id}
        referenceNumber={letter.referenceNumber}
        subject={letter.subject}
        onClose={() => setIsRoutingOpen(false)}
        onSuccess={fetchLetter}
      />

      <LetterAssignmentDialog
        open={isAssignmentOpen}
        letterId={letter.id}
        referenceNumber={letter.referenceNumber}
        subject={letter.subject}
        departmentName={letter.currentLocation || letter.department_name}
        onClose={() => setIsAssignmentOpen(false)}
        onSuccess={fetchLetter}
      />

      <DispatchDialog
        open={isDispatchOpen}
        letterId={letter.id}
        referenceNumber={letter.referenceNumber}
        subject={letter.subject}
        recipientName={letter.recipient || ""}
        recipientOrg={letter.recipientOrganization || ""}
        onClose={() => setIsDispatchOpen(false)}
        onSuccess={fetchLetter}
      />

      <ConfirmDialog
        open={isArchiveDialogOpen}
        title="Archive Letter?"
        description={`Are you sure you want to archive "${letter.subject}"? The letter will remain accessible under Archives.`}
        confirmLabel="Move to Archive"
        danger
        isLoading={isArchiving}
        onConfirm={handleArchive}
        onCancel={() => setIsArchiveDialogOpen(false)}
      />

      <ConfirmDialog
        open={isRejectDialogOpen}
        title="Reject Letter?"
        description={`This will return "${letter.subject}" with a CHANGES_REQUESTED status to the originating officer.`}
        confirmLabel="Reject & Return"
        danger
        isLoading={false}
        onConfirm={async () => {
          if (!letter) return;
          await letterService.rejectLetter(
            letter.id,
            "Returned for revision by Directorate Manager.",
          );
          addToast({
            type: "warning",
            title: "Letter Rejected",
            message: "Letter returned for changes.",
          });
          setIsRejectDialogOpen(false);
          fetchLetter();
        }}
        onCancel={() => setIsRejectDialogOpen(false)}
      />

      <ConfirmDialog
        open={isRequestChangesOpen}
        title="Request Changes?"
        description={`"${letter.subject}" will be returned to the officer with a request for changes.`}
        confirmLabel="Request Changes"
        isLoading={false}
        onConfirm={async () => {
          if (!letter) return;
          await letterService.requestChanges(
            letter.id,
            "Please revise and resubmit.",
          );
          addToast({
            type: "info",
            title: "Changes Requested",
            message: "Letter returned for revision.",
          });
          setIsRequestChangesOpen(false);
          fetchLetter();
        }}
        onCancel={() => setIsRequestChangesOpen(false)}
      />
    </div>
  );
};

export default LetterDetails;
