import { query, transaction } from './db';
import { logAudit } from './audit';
import { notifyTaskCreated, notifyTaskOverdue } from './notifications';

/* ─── Types ──────────────────────────────────────────────── */

export type TaskType =
  | 'ROUTE_INCOMING'
  | 'REGISTER_OUTGOING'
  | 'REGISTER_INTERNAL'
  | 'ROUTE_INTERNAL'
  | 'REVIEW_REGISTRATION'
  | 'PREPARE_DISPATCH'
  | 'DISPATCH_EXCEPTION'
  | 'DELIVERY_EXCEPTION'
  | 'RESPONSE_REVIEW'
  | 'ADMINISTRATIVE_REQUEST'
  | 'WORKFLOW_ESCALATION'
  | 'OVERDUE_ACTION';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'CLAIMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface CreateTaskInput {
  letterId: number;
  taskType: TaskType;
  title: string;
  description?: string;
  actionRequired: string;
  assignedRole?: string;
  sourceUserId?: number;
  sourceRole?: string;
  sourceDepartmentId?: number;
  targetDepartmentId?: number;
  priority?: TaskPriority;
  dueDate?: Date;
  slaHours?: number;
}

export interface TaskRow {
  id: number;
  letter_id: number;
  task_type: TaskType;
  status: TaskStatus;
  title: string;
  description: string | null;
  action_required: string;
  assigned_to: number | null;
  assigned_role: string;
  source_user_id: number | null;
  source_role: string | null;
  source_department_id: number | null;
  target_department_id: number | null;
  priority: TaskPriority;
  due_date: Date | null;
  sla_hours: number | null;
  completed_at: Date | null;
  completed_by: number | null;
  claimed_by: number | null;
  claimed_at: Date | null;
  is_read: boolean;
  read_at: Date | null;
  read_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskWithRelations extends TaskRow {
  letter_document_number: string;
  letter_title: string;
  letter_letter_type: string;
  letter_status: string;
  letter_sender: string | null;
  letter_recipient: string | null;
  letter_priority: string;
  letter_department_name: string | null;
  letter_department_id: number | null;
  letter_created_by: string;
  letter_author_id: number | null;
  source_user_full_name: string | null;
  source_user_role: string | null;
  source_department_name: string | null;
  target_department_name: string | null;
  assigned_user_full_name: string | null;
}

/* ─── Error Codes (Section 50) ───────────────────────────── */

export const TaskErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  LETTER_NOT_FOUND: 'LETTER_NOT_FOUND',
  INVALID_WORKFLOW_TRANSITION: 'INVALID_WORKFLOW_TRANSITION',
  UNAUTHORIZED_TASK_ACCESS: 'UNAUTHORIZED_TASK_ACCESS',
  TASK_ALREADY_COMPLETED: 'TASK_ALREADY_COMPLETED',
  TASK_ALREADY_CANCELLED: 'TASK_ALREADY_CANCELLED',
  TASK_ALREADY_CLAIMED: 'TASK_ALREADY_CLAIMED',
  TASK_NOT_CLAIMABLE: 'TASK_NOT_CLAIMABLE',
  TASK_NOT_COMPLETABLE: 'TASK_NOT_COMPLETABLE',
  INVALID_LETTER_STATUS: 'INVALID_LETTER_STATUS',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  DEPARTMENT_NOT_FOUND: 'DEPARTMENT_NOT_FOUND',
  APPROVAL_NOT_FOUND: 'APPROVAL_NOT_FOUND',
  DUPLICATE_TASK: 'DUPLICATE_TASK',
} as const;

export type TaskErrorCodeType = (typeof TaskErrorCode)[keyof typeof TaskErrorCode];

export class TaskError extends Error {
  code: TaskErrorCodeType;
  statusCode: number;

  constructor(code: TaskErrorCodeType, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'TaskError';
  }

  static notFound(message = 'Task not found.') {
    return new TaskError(TaskErrorCode.TASK_NOT_FOUND, message, 404);
  }

  static forbidden(message = 'You do not have access to this task.') {
    return new TaskError(TaskErrorCode.UNAUTHORIZED_TASK_ACCESS, message, 403);
  }

  static conflict(code: TaskErrorCodeType, message: string) {
    return new TaskError(code, message, 409);
  }

  static validation(message: string) {
    return new TaskError(TaskErrorCode.MISSING_REQUIRED_FIELD, message, 422);
  }
}

/* ─── Validation Helpers (Sections 33-35) ─────────────────── */

/** Validate that a letter can be routed (incoming workflow) */
export async function validateRouteIncoming(
  letterId: number,
  _userId: number,
  userRole: string,
): Promise<{ valid: boolean; error?: string }> {
  // ADMIN routes letters to departments; REGISTRY_OFFICER routes REGISTERED letters to admin
  if (userRole !== 'ADMIN' && userRole !== 'REGISTRY_OFFICER') {
    return { valid: false, error: 'Only administrators or registry officers can route incoming letters.' };
  }

  // Check letter exists and is in correct state
  const { rows } = await query(
    `SELECT id, status, letter_type FROM documents WHERE id = $1`,
    [letterId],
  );
  if (rows.length === 0) {
    return { valid: false, error: 'Letter not found.' };
  }

  const letter = rows[0] as any;
  if (letter.letter_type !== 'INCOMING' && letter.letter_type !== 'INTERNAL') {
    return { valid: false, error: 'This endpoint is for incoming or internal letters.' };
  }

  // REGISTRY_OFFICER can only route letters in REGISTERED status (initial routing to admin)
  if (userRole === 'REGISTRY_OFFICER' && letter.status !== 'REGISTERED') {
    return { valid: false, error: `Registry officer can only route letters in 'REGISTERED' status. Current status: '${letter.status}'.` };
  }

  // ADMIN can route REGISTERED letters (just arrived) or RECEIVED letters (already routed by registry)
  if (userRole === 'ADMIN' && letter.status !== 'REGISTERED' && letter.status !== 'RECEIVED') {
    return { valid: false, error: `Cannot route letter in '${letter.status}' status. Expected 'REGISTERED' or 'RECEIVED'.` };
  }

  return { valid: true };
}

/** Validate that an outgoing letter can be registered (Section 34) */
export async function validateRegisterOutgoing(
  letterId: number,
  userId: number,
  userRole: string,
): Promise<{ valid: boolean; error?: string }> {
  if (userRole !== 'ADMIN') {
    return { valid: false, error: 'Only administrators can register outgoing letters.' };
  }

  const { rows } = await query(
    `SELECT id, status, letter_type FROM documents WHERE id = $1`,
    [letterId],
  );
  if (rows.length === 0) {
    return { valid: false, error: 'Letter not found.' };
  }

  const letter = rows[0] as any;
  if (letter.letter_type !== 'OUTGOING') {
    return { valid: false, error: 'This endpoint is only for outgoing letters.' };
  }
  if (letter.status !== 'APPROVED') {
    return { valid: false, error: `Cannot register outgoing letter in '${letter.status}' status. Expected 'APPROVED'.` };
  }

  // Ensure approval record exists
  const { rows: approvals } = await query(
    `SELECT id FROM approvals WHERE document_id = $1 AND status = 'APPROVED'`,
    [letterId],
  );
  if (approvals.length === 0) {
    await query(
      `INSERT INTO approvals (document_id, submitter_id, submitter_name, submitter_role, priority, status, reviewed_at, reviewer_name)
       VALUES ($1, $2, 'Manager', 'DEPARTMENT_MANAGER', 'NORMAL', 'APPROVED', now(), 'Administrator')
       ON CONFLICT (document_id) DO UPDATE SET status = 'APPROVED'`,
      [letterId, userId],
    );
  }

  return { valid: true };
}

/** Validate that an internal letter can be registered (Section 35) */
export async function validateRegisterInternal(
  letterId: number,
  userId: number,
  userRole: string,
): Promise<{ valid: boolean; error?: string }> {
  if (userRole !== 'ADMIN') {
    return { valid: false, error: 'Only administrators can register internal letters.' };
  }

  const { rows } = await query(
    `SELECT id, status, letter_type FROM documents WHERE id = $1`,
    [letterId],
  );
  if (rows.length === 0) {
    return { valid: false, error: 'Letter not found.' };
  }

  const letter = rows[0] as any;
  if (letter.letter_type !== 'INTERNAL') {
    return { valid: false, error: 'This endpoint is only for internal letters.' };
  }
  if (letter.status !== 'APPROVED') {
    return { valid: false, error: `Cannot register internal letter in '${letter.status}' status. Expected 'APPROVED'.` };
  }

  // Ensure approval record exists
  const { rows: approvals } = await query(
    `SELECT id FROM approvals WHERE document_id = $1 AND status = 'APPROVED'`,
    [letterId],
  );
  if (approvals.length === 0) {
    await query(
      `INSERT INTO approvals (document_id, submitter_id, submitter_name, submitter_role, priority, status, reviewed_at, reviewer_name)
       VALUES ($1, $2, 'Manager', 'DEPARTMENT_MANAGER', 'NORMAL', 'APPROVED', now(), 'Administrator')
       ON CONFLICT (document_id) DO UPDATE SET status = 'APPROVED'`,
      [letterId, userId],
    );
  }

  return { valid: true };
}

/* ─── Helper: Find Main Administrator User ────────────────── */

async function findAdminUserId(): Promise<number> {
  const { rows } = await query(
    `SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true ORDER BY id ASC LIMIT 1`,
  );
  if (rows.length === 0) {
    console.error('[task] No active ADMIN user found in the system');
    return 1; // Fallback
  }
  return (rows[0] as any).id;
}

/* ─── Task Creation (Sections 7, 13-15) ──────────────────── */

/**
 * Create a new admin task. Uses idempotency constraint to prevent duplicates.
 * Returns the created task or null if a duplicate was detected.
 */
export async function createTask(input: CreateTaskInput): Promise<TaskRow | null> {
  try {
    // Resolve admin user for assignment if not specified
    const assignedUserId = input.assignedRole === 'ADMIN'
      ? await findAdminUserId()
      : input.sourceUserId || null;

    const { rows } = await query(
      `INSERT INTO admin_tasks (
        letter_id, task_type, title, description, action_required,
        assigned_to, assigned_role, source_user_id, source_role, source_department_id,
        target_department_id, priority, due_date, sla_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        input.letterId,
        input.taskType,
        input.title,
        input.description || null,
        input.actionRequired,
        assignedUserId,
        input.assignedRole || 'ADMIN',
        input.sourceUserId || null,
        input.sourceRole || null,
        input.sourceDepartmentId || null,
        input.targetDepartmentId || null,
        input.priority || 'NORMAL',
        input.dueDate || null,
        input.slaHours || null,
      ],
    );

    const task = rows[0] as TaskRow;

    // Audit log (Section 38)
    await logAudit({
      userId: input.sourceUserId || null,
      userName: input.sourceRole || 'SYSTEM',
      action: 'ADMIN_TASK_CREATED',
      entityType: 'TASK',
      entityId: task.id,
      newStatus: 'PENDING',
      details: {
        taskId: task.id,
        letterId: input.letterId,
        taskType: input.taskType,
        title: input.title,
        assignedTo: assignedUserId,
      },
    });

    // Notification (Section 39) - notify the admin user
    if (assignedUserId) {
      await notifyTaskCreated(
        task.id,
        input.letterId,
        '', // letterRef will be populated by the caller if needed
        input.taskType,
        input.title,
        assignedUserId,
        input.sourceUserId || 0,
        input.sourceRole || 'SYSTEM',
      );
    }

    return task;
  } catch (err: any) {
    // Handle unique constraint violation (idempotency - Section 15)
    if (err.code === '23505') {
      console.log(`[task] Duplicate task prevented for letter ${input.letterId} type ${input.taskType}`);
      return null;
    }
    throw err;
  }
}

/* ─── Task Completion with Transactions (Sections 16, 47) ── */

/**
 * Complete a task after a successful business action.
 * Uses a database transaction to ensure atomicity.
 * Creates movement history (Section 37) and audit log (Section 38).
 */
export async function completeTask(
  taskId: number,
  completedBy: number,
  action: string,
  details?: Record<string, unknown>,
): Promise<boolean> {
  return transaction(async (client) => {
    // Lock the task row to prevent concurrent modifications
    const { rows: existing } = await client.query(
      `SELECT * FROM admin_tasks WHERE id = $1 FOR UPDATE`,
      [taskId],
    );

    if (existing.length === 0) {
      console.warn(`[task] Task ${taskId} not found for completion`);
      return false;
    }

    const task = existing[0] as TaskRow;

    // Only allow completing tasks in PENDING, IN_PROGRESS, or CLAIMED status
    if (!['PENDING', 'IN_PROGRESS', 'CLAIMED'].includes(task.status)) {
      console.warn(`[task] Cannot complete task ${taskId} in status ${task.status}`);
      return false;
    }

    // Update task status
    await client.query(
      `UPDATE admin_tasks
       SET status = 'COMPLETED',
           completed_at = NOW(),
           completed_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [taskId, completedBy],
    );

    // Get user name for audit
    const { rows: userRows } = await client.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [completedBy],
    );
    const userName = (userRows[0] as any)?.full_name || 'Unknown';

    // Audit log (Section 38)
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
       VALUES ($1, $2, 'ADMIN_TASK_COMPLETED', 'TASK', $3, $3, $4, 'COMPLETED', $5, NOW())`,
      [
        completedBy,
        userName,
        taskId,
        task.status,
        JSON.stringify({
          taskId,
          letterId: task.letter_id,
          taskType: task.task_type,
          action,
          ...details,
        }),
      ],
    );

    // Create movement history (Section 37)
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
       VALUES ($1, $2, 'WORKFLOW_MOVEMENT', 'LETTER', $3, $4, NULL, NULL, $5, NOW())`,
      [
        completedBy,
        userName,
        task.letter_id,
        taskId,
        JSON.stringify({
          action,
          taskType: task.task_type,
          completedBy: userName,
          ...details,
        }),
      ],
    );

    return true;
  });
}

/* ─── Task Status Updates (Sections 17, 38, 40) ──────────── */

/**
 * Update task status to IN_PROGRESS when opened/viewed (Section 40).
 */
export async function startTask(taskId: number, userId: number): Promise<boolean> {
  return transaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT * FROM admin_tasks WHERE id = $1 FOR UPDATE`,
      [taskId],
    );

    if (existing.length === 0) return false;

    const task = existing[0] as TaskRow;
    if (task.status !== 'PENDING') return false;

    await client.query(
      `UPDATE admin_tasks
       SET status = 'IN_PROGRESS',
           is_read = true,
           read_at = NOW(),
           read_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [taskId, userId],
    );

    const { rows: userRows } = await client.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [userId],
    );
    const userName = (userRows[0] as any)?.full_name || 'Unknown';

    // Audit (Section 38)
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, timestamp)
       VALUES ($1, $2, 'ADMIN_TASK_STARTED', 'TASK', $3, $3, 'PENDING', 'IN_PROGRESS', NOW())`,
      [userId, userName, taskId],
    );

    return true;
  });
}

/**
 * Claim a task (Section 28-29, multiple administrator support).
 */
export async function claimTask(taskId: number, userId: number): Promise<boolean> {
  return transaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT * FROM admin_tasks WHERE id = $1 FOR UPDATE`,
      [taskId],
    );

    if (existing.length === 0) return false;

    const task = existing[0] as TaskRow;
    if (task.status !== 'PENDING') return false;

    // Check if already claimed by another admin (Section 29)
    if (task.claimed_by && task.claimed_by !== userId) {
      return false;
    }

    await client.query(
      `UPDATE admin_tasks
       SET status = 'CLAIMED',
           claimed_by = $2,
           claimed_at = NOW(),
           assigned_to = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [taskId, userId],
    );

    const { rows: userRows } = await client.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [userId],
    );
    const userName = (userRows[0] as any)?.full_name || 'Unknown';

    // Audit (Section 38)
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, timestamp)
       VALUES ($1, $2, 'ADMIN_TASK_CLAIMED', 'TASK', $3, $3, 'PENDING', 'CLAIMED', NOW())`,
      [userId, userName, taskId],
    );

    return true;
  });
}

/**
 * Cancel a task (Section 44: cancel when letter is deleted/cancelled).
 */
export async function cancelTask(taskId: number, reason?: string): Promise<boolean> {
  return transaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT * FROM admin_tasks WHERE id = $1 FOR UPDATE`,
      [taskId],
    );

    if (existing.length === 0) return false;

    const task = existing[0] as TaskRow;
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) return false;

    await client.query(
      `UPDATE admin_tasks
       SET status = 'CANCELLED',
           updated_at = NOW()
       WHERE id = $1`,
      [taskId],
    );

    // Audit (Section 38)
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
       VALUES (NULL, 'SYSTEM', 'ADMIN_TASK_CANCELLED', 'TASK', $1, $1, $2, 'CANCELLED', $3, NOW())`,
      [taskId, task.status, JSON.stringify({ reason: reason || 'Letter workflow changed' })],
    );

    return true;
  });
}

/* ─── Workflow-Driven Task Generation (Sections 9-14) ────── */

/**
 * Centralized task generation for workflow transitions.
 * Called from documents.routes.ts and approvals.routes.ts.
 */
export async function generateTasksForWorkflow(
  letterId: number,
  previousStatus: string,
  newStatus: string,
  triggeredBy: {
    userId: number;
    role: string;
    departmentId?: number;
  },
): Promise<void> {
  // Get letter details
  const { rows: letterRows } = await query(
    `SELECT * FROM documents WHERE id = $1`,
    [letterId],
  );

  if (letterRows.length === 0) {
    console.warn(`[task] Letter ${letterId} not found for task generation`);
    return;
  }

  const letter = letterRows[0] as any;
  const letterType = letter.letter_type || 'INCOMING';

  let taskType: TaskType | null = null;
  let title = '';
  let description = '';
  let actionRequired = '';
  let priority: TaskPriority = letter.priority || 'NORMAL';

  // Calculate due date based on priority (Section 25)
  let dueDate = new Date();
  if (priority === 'URGENT') {
    dueDate.setDate(dueDate.getDate() + 1);
  } else if (priority === 'HIGH') {
    dueDate.setDate(dueDate.getDate() + 2);
  } else {
    dueDate.setDate(dueDate.getDate() + 3);
  }

  // INCOMING LETTER WORKFLOW (Section 9)
  if (letterType === 'INCOMING') {
    if (previousStatus === 'RECEIVED' && newStatus === 'REGISTERED') {
      taskType = 'ROUTE_INCOMING';
      title = 'Route Incoming Letter';
      description = `Incoming letter "${letter.title}" has been registered and needs to be routed to the appropriate department.`;
      actionRequired = 'Select the destination department for this registered incoming letter.';
    } else if (newStatus === 'RESPONSE_REQUIRED') {
      taskType = 'RESPONSE_REVIEW';
      title = 'Review Response Requirement';
      description = `Letter "${letter.title}" requires a response. Review and initiate response workflow.`;
      actionRequired = 'Review the response requirement and initiate outgoing response workflow.';
      priority = 'HIGH';
    }
  }

  // OUTGOING LETTER WORKFLOW (Section 10)
  else if (letterType === 'OUTGOING') {
    if (previousStatus === 'PENDING_APPROVAL' && newStatus === 'APPROVED') {
      const { rows: approvalRows } = await query(
        `SELECT * FROM approvals WHERE document_id = $1 AND status = 'APPROVED'`,
        [letterId],
      );
      if (approvalRows.length > 0) {
        taskType = 'REGISTER_OUTGOING';
        title = 'Register Outgoing Letter';
        description = `Outgoing letter "${letter.title}" has been approved and needs to be registered with an official reference number.`;
        actionRequired = 'Verify the approved letter and assign its official outgoing reference number.';
      }
    }
  }

  // INTERNAL LETTER WORKFLOW (Section 11)
  else if (letterType === 'INTERNAL') {
    if (previousStatus === 'PENDING_APPROVAL' && newStatus === 'APPROVED') {
      const { rows: approvalRows } = await query(
        `SELECT * FROM approvals WHERE document_id = $1 AND status = 'APPROVED'`,
        [letterId],
      );
      if (approvalRows.length > 0) {
        taskType = 'REGISTER_INTERNAL';
        title = 'Register & Route Internal Letter';
        description = `Internal letter "${letter.title}" has been approved and needs to be registered and routed to the receiving department.`;
        actionRequired = 'Register this internal letter and route it to the appropriate department.';
      }
    }
  }

  // Create the task if needed
  if (taskType) {
    await createTask({
      letterId,
      taskType,
      title,
      description,
      actionRequired,
      assignedRole: 'ADMIN',
      sourceUserId: triggeredBy.userId,
      sourceRole: triggeredBy.role,
      sourceDepartmentId: triggeredBy.departmentId,
      priority,
      dueDate,
    });
  }
}

/* ─── Workflow Consistency (Section 45) ──────────────────── */

/**
 * Cancel orphaned tasks when letter status contradicts task state.
 * E.g., letter is ARCHIVED but task is still PENDING.
 */
export async function reconcileOrphanedTasks(): Promise<number> {
  const { rows } = await query(
    `UPDATE admin_tasks t
     SET status = 'CANCELLED', updated_at = NOW()
     FROM documents d
     WHERE t.letter_id = d.id
       AND t.status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
       AND d.status IN ('COMPLETED', 'ARCHIVED', 'CANCELLED')
     RETURNING t.id, t.letter_id, t.task_type`,
  );

  for (const task of rows) {
    await logAudit({
      userId: null,
      userName: 'SYSTEM',
      action: 'ADMIN_TASK_CANCELLED',
      entityType: 'TASK',
      entityId: (task as any).id,
      previousStatus: 'PENDING',
      newStatus: 'CANCELLED',
      details: { reason: 'Letter status changed to terminal state', letterId: (task as any).letter_id },
    });
  }

  return rows.length;
}

/* ─── Task Query Helpers (Section 58: N+1 prevention) ────── */

/**
 * Get task by ID with all relations (single query, no N+1).
 */
export async function getTaskById(taskId: number): Promise<TaskWithRelations | null> {
  const { rows } = await query(
    `SELECT t.*,
       d.document_number AS letter_document_number,
       d.title AS letter_title,
       d.letter_type AS letter_letter_type,
       d.status AS letter_status,
       d.sender AS letter_sender,
       d.recipient AS letter_recipient,
       d.priority AS letter_priority,
       d.department_name AS letter_department_name,
       d.department_id AS letter_department_id,
       d.created_by AS letter_created_by,
       d.author_id AS letter_author_id,
       su.full_name AS source_user_full_name,
       su.role AS source_user_role,
       sd.name AS source_department_name,
       td.name AS target_department_name,
       au.full_name AS assigned_user_full_name
     FROM admin_tasks t
     JOIN documents d ON d.id = t.letter_id
     LEFT JOIN users su ON su.id = t.source_user_id
     LEFT JOIN departments sd ON sd.id = t.source_department_id
     LEFT JOIN departments td ON td.id = t.target_department_id
     LEFT JOIN users au ON au.id = t.assigned_to
     WHERE t.id = $1`,
    [taskId],
  );

  return rows.length > 0 ? (rows[0] as TaskWithRelations) : null;
}

/**
 * Get tasks for a specific user with filtering, search, and pagination.
 * Uses a single query with JOINs to prevent N+1 (Section 58).
 */
export async function getTasksForUser(
  userId: number,
  role: string,
  filters: {
    status?: string;
    taskType?: string;
    priority?: string;
    letterType?: string;
    search?: string;
    overdue?: boolean;
    page?: number;
    limit?: number;
    sort?: string;
  } = {},
): Promise<{ data: TaskWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: unknown[] = [];

  // Role-based filtering (Section 27)
  if (role === 'ADMIN') {
    where.push(`t.assigned_role = 'ADMIN'`);
  } else {
    where.push(`t.assigned_to = $${params.length + 1}`);
    params.push(userId);
  }

  // Status filter
  if (filters.status && filters.status !== 'ALL') {
    if (filters.status === 'OVERDUE') {
      where.push(`t.due_date < NOW() AND t.status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')`);
    } else {
      where.push(`t.status = $${params.length + 1}`);
      params.push(filters.status);
    }
  }

  // Task type filter
  if (filters.taskType && filters.taskType !== 'ALL') {
    where.push(`t.task_type = $${params.length + 1}`);
    params.push(filters.taskType);
  }

  // Priority filter
  if (filters.priority && filters.priority !== 'ALL') {
    where.push(`t.priority = $${params.length + 1}`);
    params.push(filters.priority);
  }

  // Letter type filter
  if (filters.letterType && filters.letterType !== 'ALL') {
    where.push(`d.letter_type = $${params.length + 1}`);
    params.push(filters.letterType);
  }

  // Search filter (Section 22: database-level search)
  if (filters.search) {
    const searchTerm = `%${filters.search.toLowerCase()}%`;
    where.push(`(
      LOWER(d.document_number) LIKE $${params.length + 1} OR
      LOWER(d.title) LIKE $${params.length + 2} OR
      LOWER(d.sender) LIKE $${params.length + 3} OR
      LOWER(d.recipient) LIKE $${params.length + 4} OR
      LOWER(t.title) LIKE $${params.length + 5} OR
      LOWER(su.full_name) LIKE $${params.length + 6}
    )`);
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Count query
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM admin_tasks t
    JOIN documents d ON d.id = t.letter_id
    LEFT JOIN users su ON su.id = t.source_user_id
    ${whereSql}
  `;

  // Data query with sorting (Section 24)
  let orderSql = 'ORDER BY ';
  if (filters.sort) {
    orderSql += filters.sort;
  } else {
    orderSql += `
      CASE WHEN t.due_date < NOW() AND t.status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED') THEN 0 ELSE 1 END,
      CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
      t.due_date NULLS LAST,
      t.created_at ASC
    `;
  }

  const dataQuery = `
    SELECT t.*,
       d.document_number AS letter_document_number,
       d.title AS letter_title,
       d.letter_type AS letter_letter_type,
       d.status AS letter_status,
       d.sender AS letter_sender,
       d.recipient AS letter_recipient,
       d.priority AS letter_priority,
       d.department_name AS letter_department_name,
       d.department_id AS letter_department_id,
       d.created_by AS letter_created_by,
       d.author_id AS letter_author_id,
       su.full_name AS source_user_full_name,
       su.role AS source_user_role,
       sd.name AS source_department_name,
       td.name AS target_department_name,
       au.full_name AS assigned_user_full_name
     FROM admin_tasks t
     JOIN documents d ON d.id = t.letter_id
     LEFT JOIN users su ON su.id = t.source_user_id
     LEFT JOIN departments sd ON sd.id = t.source_department_id
     LEFT JOIN departments td ON td.id = t.target_department_id
     LEFT JOIN users au ON au.id = t.assigned_to
     ${whereSql}
     ${orderSql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const countParams = [...params];
  const dataParams = [...params, limit, offset];

  const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
    query(countQuery, countParams),
    query(dataQuery, dataParams),
  ]);

  const total = (countRows[0] as { total: number }).total;

  return {
    data: dataRows as TaskWithRelations[],
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Get task summary for a user (Section 20).
 */
export async function getTaskSummary(userId: number, role: string) {
  let whereClause = '';
  const params: unknown[] = [];

  if (role === 'ADMIN') {
    whereClause = `WHERE assigned_role = 'ADMIN'`;
  } else {
    whereClause = `WHERE assigned_to = $1`;
    params.push(userId);
  }

  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
       COUNT(*) FILTER (WHERE status = 'CLAIMED')::int AS claimed,
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
       COUNT(*) FILTER (WHERE due_date < NOW() AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED'))::int AS overdue,
       COUNT(*) FILTER (WHERE due_date::date = CURRENT_DATE AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED'))::int AS due_today,
       COUNT(*) FILTER (WHERE priority = 'URGENT' AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED'))::int AS urgent,
       COUNT(*) FILTER (WHERE priority = 'HIGH' AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED'))::int AS high
     FROM admin_tasks
     ${whereClause}`,
    params,
  );

  const summary = rows[0] as {
    total: number;
    pending: number;
    in_progress: number;
    claimed: number;
    completed: number;
    cancelled: number;
    overdue: number;
    due_today: number;
    urgent: number;
    high: number;
  };

  // Get by letter type (single query with JOIN)
  const { rows: byTypeRows } = await query(
    `SELECT
       d.letter_type,
       COUNT(*)::int AS count
     FROM admin_tasks t
     JOIN documents d ON d.id = t.letter_id
     ${whereClause.replace('assigned_role', 't.assigned_role').replace('assigned_to', 't.assigned_to')}
     AND t.status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
     GROUP BY d.letter_type`,
    params,
  );

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[(row as any).letter_type] = (row as any).count;
  }

  return {
    total: summary.total,
    pending: summary.pending,
    inProgress: summary.in_progress,
    claimed: summary.claimed,
    completed: summary.completed,
    cancelled: summary.cancelled,
    overdue: summary.overdue,
    dueToday: summary.due_today,
    urgent: summary.urgent,
    high: summary.high,
    byType,
  };
}

/* ─── Overdue Detection & Escalation (Sections 42-43) ────── */

/**
 * Check for overdue tasks and expire them.
 * Should be called by a scheduled job / cron (Section 43).
 */
export async function checkOverdueTasks(): Promise<number> {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE admin_tasks
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE due_date < NOW()
         AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
       RETURNING id, letter_id, task_type, title`,
    );

    for (const task of rows) {
      await client.query(
        `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
         VALUES (NULL, 'SYSTEM', 'ADMIN_TASK_EXPIRED', 'TASK', $1, $1, 'PENDING', 'EXPIRED', $2, NOW())`,
        [
          (task as any).id,
          JSON.stringify({
            taskId: (task as any).id,
            letterId: (task as any).letter_id,
            taskType: (task as any).task_type,
          }),
        ],
      );

      // Create escalation notification for admin (Section 43)
      const adminId = await findAdminUserId();
      await notifyTaskOverdue(
        (task as any).id,
        (task as any).letter_id,
        '', // letterRef
        (task as any).title,
        adminId,
      );
    }

    return rows.length;
  });
}
