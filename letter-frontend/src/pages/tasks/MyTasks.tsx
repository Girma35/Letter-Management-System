import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import letterService from "@/services/letterService";
import { LetterItem } from "@/types/letter";
import { AdminTask } from "@/types/adminTask";
import { useAuth } from "@/hooks/useAuth";
import Card from "@/components/common/Card";
import Badge, { LetterStatus } from "@/components/common/Badge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import { useToast } from "@/components/common/Toast";

/* ─── Task Priority Indicator ─────────────────────────────── */
const priorityDot: Record<string, string> = {
  URGENT: "bg-[#8B3232]",
  HIGH: "bg-[#C48D3F]",
  NORMAL: "bg-[#526A55]",
  LOW: "bg-[#D8D7D1]",
};

/* ─── Status filter tabs ──────────────────────────────────── */
const TASK_TABS = [
  { value: "ALL", label: "All Tasks" },
  { value: "PENDING", label: "Pending Action" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "COMPLETED", label: "Completed" },
];

const ADMIN_FILTERS = [
  { value: "ALL", label: "All Actions" },
  { value: "INCOMING", label: "Incoming" },
  { value: "OUTGOING", label: "Outgoing" },
  { value: "INTERNAL", label: "Internal" },
  { value: "REGISTRATION", label: "Registration" },
  { value: "ROUTING", label: "Routing" },
  { value: "OVERDUE", label: "Overdue" },
];

const priorityRank: Record<string, number> = {
  URGENT: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
};

const taskDueLabel = (task: AdminTask) => {
  if (!task.dueDate) return "No deadline";
  const days = Math.ceil(
    (new Date(task.dueDate).getTime() - Date.now()) / 86400000,
  );
  if (task.isOverdue)
    return `Overdue by ${Math.max(1, Math.abs(days))} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
};

const taskMatchesFilter = (task: AdminTask, filter: string) => {
  if (filter === "ALL") return true;
  if (filter === "OVERDUE") return task.isOverdue;
  if (filter === "REGISTRATION") return task.type === "REGISTER_OUTGOING";
  if (filter === "ROUTING")
    return task.type === "ROUTE_INCOMING" || task.type === "ROUTE_INTERNAL";
  return task.letter_type === filter;
};

const AdminActionCenter: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    requiresAction: 0,
    dueToday: 0,
    overdue: 0,
  });
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await letterService.getAdminTasks();
      setTasks(response.data);
      // Calculate summary from tasks
      const allTasks = response.data;
      setSummary({
        total: allTasks.length,
        requiresAction: allTasks.filter((t: AdminTask) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
        dueToday: allTasks.filter((t: AdminTask) => {
          if (!t.dueDate) return false;
          return new Date(t.dueDate).toDateString() === new Date().toDateString();
        }).length,
        overdue: allTasks.filter((t: AdminTask) => t.isOverdue).length,
      });
    } catch (err: any) {
      setError(err.message || "Unable to load administrative tasks.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const visibleTasks = tasks
    .filter((task) => taskMatchesFilter(task, filter))
    .filter((task) => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        `${task.letter?.referenceNumber || ''} ${task.letter?.subject || ''} ${task.letter?.sender || ''} ${task.requestedBy?.name || ''} ${task.sourceDepartment?.name || ''} ${task.title || ''}`
          .toLowerCase()
          .includes(searchLower)
      );
    })
    .sort(
      (a, b) =>
        Number(b.isOverdue) - Number(a.isOverdue) ||
        (priorityRank[a.priority || "NORMAL"] || 3) -
          (priorityRank[b.priority || "NORMAL"] || 3),
    );

  const runPrimaryAction = async (task: AdminTask) => {
    try {
      if (task.type === "REGISTER_OUTGOING") {
        const letterId = task.letter?.id || task.letter_id;
        if (letterId) {
          await letterService.registerOutgoingNumber(letterId);
          addToast({
            type: "success",
            title: "Letter Registered",
            message: `${task.letter?.referenceNumber || task.letter_reference} was registered successfully.`,
          });
          await fetchTasks();
        }
        return;
      }
      const letterId = task.letter?.id || task.letter_id;
      navigate(`/letters/${letterId}`);
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Action Failed",
        message: err.message || "The task is still pending. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#526A55]">
          Main Administrator
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[#292A27] mt-1">
          Administrative Action Center
        </h1>
        <p className="text-sm text-[#6B6A64] mt-1">
          Administrative tasks and workflow actions that require your attention.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["Total Actions", summary.total, "#292A27"],
          ["Requires Action", summary.requiresAction, "#C48D3F"],
          ["Due Today", summary.dueToday, "#526A55"],
          ["Overdue", summary.overdue, "#8B3232"],
        ].map(([label, value, color]) => (
          <Card key={String(label)} className="bg-[#ECEAE3]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A8983]">
              {label}
            </p>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: String(color) }}
            >
              {value}
            </p>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <input
          aria-label="Search administrative tasks"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search reference, subject, sender, requester, department..."
          className="w-full px-4 py-3 bg-[#F5F3ED] border border-[#D8D7D1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#526A55]"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ADMIN_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${filter === item.value ? "bg-[#526A55] text-[#F5F3ED]" : "bg-[#ECEAE3] text-[#6B6A64] border border-[#D8D7D1]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" label="Loading administrative tasks..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load administrative tasks"
          description={error}
          onRetry={fetchTasks}
        />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="There are no administrative actions requiring your attention right now."
        />
      ) : (
        <div className="space-y-4">
          {visibleTasks.map((task) => (
            <Card
              key={task.id}
              className={`border-l-4 ${task.isOverdue ? "border-l-[#8B3232]" : task.priority === "URGENT" ? "border-l-[#C48D3F]" : "border-l-[#526A55]"}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B3232]">
                      Action Required
                    </span>
                    <Badge status={(task.letter?.status || task.letter_status || '') as LetterStatus} dot />
                    <span className="text-[10px] font-bold uppercase text-[#6B6A64]">
                      {task.priority || "NORMAL"} priority
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-[#292A27]">
                    {task.title || task.actionRequired || task.action_required}
                  </h2>
                  <p className="font-mono text-xs text-[#526A55]">
                    {task.letter?.referenceNumber || task.letter_reference}{" "}
                    <span className="text-[#8A8983]">· {task.letter?.type || task.letter_type}</span>
                  </p>
                  <p className="text-sm font-semibold text-[#292A27]">
                    {task.letter?.subject || task.subject}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-[#6B6A64]">
                    <span>
                      <strong>From:</strong> {task.letter?.sender || task.requestedBy?.name || task.requested_by}
                    </span>
                    <span>
                      <strong>Requested by:</strong> {task.requestedBy?.name || task.requested_by} (
                      {(task.requestedBy?.role || task.requested_by_role || '').replace("_", " ")})
                    </span>
                    <span>
                      <strong>Department:</strong>{" "}
                      {task.sourceDepartment?.name || task.source_department || "Not specified"}
                    </span>
                    <span>
                      <strong>Workflow:</strong> {task.workflow?.previousStep || task.previous_actor} →{" "}
                      {task.workflow?.currentStep || task.workflow_stage} → {task.workflow?.nextStep || task.next_actor}
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#ECEAE3] px-3 py-2 text-xs text-[#292A27]">
                    <strong>What you need to do:</strong> {task.description || task.actionRequired || task.action_required || task.reason}
                  </div>
                  <p
                    className={`text-xs font-bold ${task.isOverdue ? "text-[#8B3232]" : "text-[#6B6A64]"}`}
                  >
                    {taskDueLabel(task)}
                    {task.dueDate
                      ? ` · Due ${new Date(task.dueDate).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex lg:flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/letters/${task.letter?.id || task.letter_id}`)}
                    className="px-3 py-2 rounded-xl text-xs font-bold border border-[#D8D7D1] text-[#292A27]"
                  >
                    View Letter
                  </button>
                  <button
                    type="button"
                    onClick={() => runPrimaryAction(task)}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-[#526A55] text-[#F5F3ED]"
                  >
                    {task.type === "REGISTER_OUTGOING"
                      ? "Register"
                      : "Take Action"}{" "}
                    →
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export const MyTasks: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <AdminActionCenter />;
  const navigate = useNavigate();
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ALL");

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await letterService.getMyTasks();
      setLetters(data);
    } catch (err: any) {
      setError(err.message || "Failed to load your tasks.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Filter based on active tab (mock filtering by assignment status)
  const filteredLetters = letters.filter((l) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING")
      return (
        l.status === "RECEIVED" ||
        l.status === "REGISTERED" ||
        l.status === "PENDING_REVIEW"
      );
    if (activeTab === "IN_PROGRESS") return l.status === "IN_PROGRESS";
    if (activeTab === "OVERDUE")
      return l.dueDate && new Date(l.dueDate) < new Date();
    if (activeTab === "COMPLETED")
      return l.status === "COMPLETED" || l.status === "ARCHIVED";
    return true;
  });

  // Stats
  const totalTasks = letters.length;
  const overdueTasks = letters.filter(
    (l) => l.dueDate && new Date(l.dueDate) < new Date(),
  ).length;
  const pendingTasks = letters.filter((l) =>
    ["RECEIVED", "REGISTERED", "PENDING_REVIEW"].includes(l.status),
  ).length;
  const inProgressTasks = letters.filter(
    (l) => l.status === "IN_PROGRESS",
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#292A27]">
          My Tasks
        </h1>
        <p className="text-xs md:text-sm text-[#6B6A64] mt-1">
          Letters assigned to you that require action or are currently in
          progress.
        </p>
      </div>

      {/* Task Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Assigned",
            value: totalTasks,
            color: "bg-[#292A27]",
            textColor: "text-[#292A27]",
          },
          {
            label: "Pending Action",
            value: pendingTasks,
            color: "bg-[#C48D3F]",
            textColor: "text-[#C48D3F]",
          },
          {
            label: "In Progress",
            value: inProgressTasks,
            color: "bg-[#526A55]",
            textColor: "text-[#526A55]",
          },
          {
            label: "Overdue",
            value: overdueTasks,
            color: "bg-[#8B3232]",
            textColor: "text-[#8B3232]",
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-[#ECEAE3]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A8983]">
                  {stat.label}
                </p>
                <p className={`text-2xl font-bold mt-1 ${stat.textColor}`}>
                  {stat.value}
                </p>
              </div>
              <div className={`w-3 h-3 rounded-full ${stat.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Status Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1">
        {TASK_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.value
                ? "bg-[#526A55] text-[#F5F3ED] shadow-sm"
                : "bg-[#ECEAE3] text-[#6B6A64] hover:bg-[#D8D7D1]/60 border border-[#D8D7D1]"
            }`}
          >
            {tab.label}
            {tab.value === "OVERDUE" && overdueTasks > 0 && (
              <span className="ml-1.5 text-[9px] font-bold bg-[#8B3232] text-white px-1.5 py-0.5 rounded-full">
                {overdueTasks}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" label="Loading your tasks..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load tasks"
          description={error}
          onRetry={fetchTasks}
        />
      ) : filteredLetters.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description={
            activeTab !== "ALL"
              ? "No tasks match the selected filter."
              : "You have no assigned tasks."
          }
          actionLabel="View All Letters"
          onAction={() => navigate("/letters")}
        />
      ) : (
        <div className="space-y-3">
          {filteredLetters.map((letter) => {
            const isOverdue =
              letter.dueDate && new Date(letter.dueDate) < new Date();
            const daysLeft = letter.dueDate
              ? Math.ceil(
                  (new Date(letter.dueDate).getTime() - new Date().getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null;

            return (
              <div
                key={letter.id}
                onClick={() => navigate(`/letters/${letter.id}`)}
                className={`p-4 rounded-2xl border bg-[#F5F3ED] hover:shadow-md transition-all cursor-pointer group ${
                  isOverdue
                    ? "border-[#8B3232]/30 bg-[#8B3232]/03"
                    : "border-[#D8D7D1]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3 min-w-0">
                    {/* Priority dot */}
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[letter.priority || "NORMAL"]}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h3 className="text-sm font-bold text-[#292A27] group-hover:text-[#526A55] transition-colors truncate">
                          {letter.subject}
                        </h3>
                        <Badge status={letter.status as LetterStatus} dot />
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-xs text-[#6B6A64]">
                        <span className="font-mono font-medium">
                          {letter.referenceNumber}
                        </span>
                        <span>·</span>
                        <span>{letter.department_name}</span>
                        {letter.sender && (
                          <>
                            <span>·</span>
                            <span>From: {letter.sender}</span>
                          </>
                        )}
                      </div>
                      {letter.assignments &&
                        letter.assignments[0]?.instructions && (
                          <p className="text-xs text-[#6B6A64] mt-1.5 italic line-clamp-1">
                            "{letter.assignments[0].instructions}"
                          </p>
                        )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {letter.dueDate && (
                      <p
                        className={`text-xs font-bold ${isOverdue ? "text-[#8B3232]" : "text-[#6B6A64]"}`}
                      >
                        {isOverdue ? (
                          <span className="flex items-center space-x-1">
                            <svg
                              className="w-3.5 h-3.5 animate-bounce"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>{Math.abs(daysLeft!)}d OVERDUE</span>
                          </span>
                        ) : (
                          `${daysLeft}d left`
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-[#8A8983] mt-0.5">
                      Due: {letter.dueDate || "No deadline"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyTasks;
