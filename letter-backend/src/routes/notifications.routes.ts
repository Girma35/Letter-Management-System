import { Router } from 'express';
import { query } from '../lib/db';
import { ApiError } from '../lib/errors';
import { asyncHandler } from '../lib/errors';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { formatDisplayDate } from '../lib/utils';

const router = Router();

/* ─── Notification Serializer (Section 24) ────────────────── */

function serializeNotification(row: any) {
  return {
    id: String(row.id),
    type: row.type,
    title: row.title || undefined,
    message: row.message,
    isRead: row.is_read,
    readAt: row.read_at ? formatDisplayDate(row.read_at) : undefined,

    letter: row.document_id
      ? {
          id: String(row.document_id),
          referenceNumber: row.reference_number || undefined,
          subject: row.document_title || undefined,
        }
      : undefined,

    task: row.task_id
      ? {
          id: String(row.task_id),
          type: row.task_type || undefined,
        }
      : undefined,

    actor: row.actor_user_id
      ? {
          id: String(row.actor_user_id),
          name: row.actor_user_name || undefined,
        }
      : undefined,

    priority: row.priority || 'NORMAL',
    metadata: row.metadata || undefined,

    // Legacy fields for backward compatibility
    documentId: row.document_id != null ? String(row.document_id) : undefined,
    documentTitle: row.document_title ?? undefined,
    letterId: row.document_id != null ? String(row.document_id) : undefined,
    letterTitle: row.document_title ?? undefined,
    referenceNumber: row.reference_number ?? undefined,
    entityType: row.entity_type || undefined,
    entityId: row.entity_id != null ? String(row.entity_id) : (row.document_id != null ? String(row.document_id) : undefined),
    taskId: row.task_id != null ? String(row.task_id) : undefined,

    createdAt: formatDisplayDate(row.created_at),
    updatedAt: formatDisplayDate(row.updated_at),
  };
}

/* ─── GET /notifications — Get notifications (Section 23) ─── */

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const {
      unread,
      read,
      type,
      letterId,
      taskId,
      search,
      startDate,
      endDate,
    } = req.query as Record<string, string | undefined>;

    const where: string[] = [`n.user_id = $1`];
    const params: unknown[] = [user.id];

    // Read/unread filter (Section 27)
    if (unread === 'true' || read === 'unread') {
      where.push(`n.is_read = false`);
    } else if (unread === 'false' || read === 'read') {
      where.push(`n.is_read = true`);
    }

    // Type filter (Section 27)
    if (type && type !== 'ALL') {
      where.push(`n.type = $${params.length + 1}`);
      params.push(type);
    }

    // Letter filter (Section 27)
    if (letterId) {
      where.push(`n.document_id = $${params.length + 1}`);
      params.push(Number(letterId));
    }

    // Task filter (Section 27)
    if (taskId) {
      where.push(`n.task_id = $${params.length + 1}`);
      params.push(Number(taskId));
    }

    // Search filter (Section 28)
    if (search) {
      const searchTerm = `%${search.toLowerCase()}%`;
      where.push(`(
        LOWER(n.message) LIKE $${params.length + 1} OR
        LOWER(COALESCE(n.title, '')) LIKE $${params.length + 2} OR
        LOWER(COALESCE(d.document_number, '')) LIKE $${params.length + 3} OR
        LOWER(COALESCE(d.title, '')) LIKE $${params.length + 4}
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Date range filter (Section 27)
    if (startDate) {
      where.push(`n.created_at >= $${params.length + 1}`);
      params.push(startDate);
    }
    if (endDate) {
      where.push(`n.created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Count query
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM notifications n
      LEFT JOIN documents d ON d.id = n.document_id
      ${whereSql}
    `;

    // Data query with JOINs (Section 58: N+1 prevention)
    const dataQuery = `
      SELECT n.*,
             d.document_number AS reference_number,
             au.full_name AS actor_user_name,
             t.task_type
      FROM notifications n
      LEFT JOIN documents d ON d.id = n.document_id
      LEFT JOIN users au ON au.id = n.actor_user_id
      LEFT JOIN admin_tasks t ON t.id = n.task_id
      ${whereSql}
      ORDER BY n.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countParams = [...params];
    const dataParams = [...params, limit, offset];

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      query(countQuery, countParams),
      query(dataQuery, dataParams),
    ]);

    const total = (countRows[0] as any).total;

    res.json({
      data: dataRows.map(serializeNotification),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }),
);

/* ─── GET /notifications/unread-count (Section 25) ────────── */

router.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;

    // Efficient COUNT query (Section 25: do not load all notifications)
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [user.id],
    );

    res.json({ count: (rows[0] as any).count });
  }),
);

/* ─── GET /notifications/types — Get available types ──────── */

router.get(
  '/types',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const types = [
      'LETTER_RECEIVED',
      'LETTER_REGISTERED',
      'LETTER_ROUTED',
      'LETTER_ASSIGNED',
      'LETTER_APPROVED',
      'LETTER_REJECTED',
      'CHANGES_REQUESTED',
      'RESPONSE_REQUIRED',
      'TASK_ASSIGNED',
      'TASK_COMPLETED',
      'TASK_OVERDUE',
      'DISPATCH_READY',
      'LETTER_DISPATCHED',
      'LETTER_COMPLETED',
      'LETTER_ARCHIVED',
      'DOCUMENT_SUBMITTED',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      'COMMENT_ADDED',
    ];
    res.json({ types });
  }),
);

/* ─── POST /notifications/:id/read (Section 21) ──────────── */

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      throw ApiError.badRequest('Invalid notification id.');
    }

    // Security (Section 37): verify ownership before marking as read
    const { rows } = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, user.id],
    );

    if (rows.length === 0) {
      throw ApiError.notFound('Notification not found or access denied.');
    }

    res.json({ message: 'Notification marked as read.' });
  }),
);

/* ─── POST /notifications/read-all (Section 22) ──────────── */

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;

    // Security (Section 22): use authenticated user, never trust frontend
    const { rowCount } = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [user.id],
    );

    res.json({
      message: 'All notifications marked as read.',
      updatedCount: rowCount || 0,
    });
  }),
);

/* ─── DELETE /notifications/:id (Section 38) ──────────────── */

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      throw ApiError.badRequest('Invalid notification id.');
    }

    // Security (Section 38): verify ownership before deletion
    const { rows } = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id],
    );

    if (rows.length === 0) {
      throw ApiError.notFound('Notification not found or access denied.');
    }

    res.json({ message: 'Notification deleted.' });
  }),
);

export default router;
