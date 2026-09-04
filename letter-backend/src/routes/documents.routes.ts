import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { query } from "../lib/db";
import { ApiError } from "../lib/errors";
import { asyncHandler } from "../lib/errors";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import {
  serializeDocument,
  serializeVersion,
  toNumber,
  normalizeDepartmentParam,
  splitTags,
  DocumentRow,
  VersionRow,
} from "../lib/utils";
import {
  createNotificationLegacy,
  notifyDepartmentManagers,
  notifyLetterCompleted,
  notifyLetterArchived,
} from "../lib/notifications";
import { logAudit, serializeAuditLog, AuditLogRow } from "../lib/audit";
import { cancelTask, validateRouteIncoming, validateRegisterOutgoing } from "../lib/tasks";
import { transaction } from "../lib/db";

const router = Router();

// Ensure uploads directory exists at startup.
fs.mkdirSync(config.uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const DOC_SELECT = `
  SELECT d.*, COALESCE(dep.name, d.department_name) AS department_name
    FROM documents d
    LEFT JOIN departments dep ON dep.id = d.department_id
`;

/** Employee access is limited to authored documents or the current assignee. */
function addEmployeeScope(
  where: string[],
  params: unknown[],
  user: AuthenticatedRequest["user"],
  alias = "d",
) {
  if (user?.role !== "EMPLOYEE") return;
  where.push(
    `(${alias}.author_id = $${params.length + 1} OR ${alias}.assigned_employee_id = $${params.length + 1} OR LOWER(TRIM(${alias}.assigned_employee)) = LOWER(TRIM($${params.length + 1}::text)))`,
  );
  params.push(user.id);
}

async function assertEmployeeDocumentAccess(
  id: number,
  user: AuthenticatedRequest["user"],
) {
  if (user?.role !== "EMPLOYEE") return;
  const { rows } = await query(
    `SELECT id FROM documents
      WHERE id = $1
        AND (author_id = $2 OR assigned_employee_id = $2 OR LOWER(TRIM(assigned_employee)) = LOWER(TRIM($3::text)))`,
    [id, user.id, user.full_name],
  );
  if (rows.length === 0) throw ApiError.notFound("Document not found.");
}

/** Generate the next document number, e.g. DOC-2026-042. */
async function nextDocumentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM documents WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year],
  );
  const n = (rows[0] as { n: number }).n + 1;
  return `DOC-${year}-${String(n).padStart(3, "0")}`;
}

/** Save a buffer to the local uploads directory and return the relative storage path. */
async function saveToLocalDisk(
  buffer: Buffer,
  relativePath: string,
): Promise<string> {
  const fullPath = path.join(config.uploadsDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return relativePath;
}

/** Delete a file from local disk. */
async function deleteFromLocalDisk(relativePath: string): Promise<void> {
  const fullPath = path.join(config.uploadsDir, relativePath);
  await fs.promises.unlink(fullPath).catch(() => undefined);
}

/** Load versions for a document, newest first. */
async function loadVersions(documentId: number): Promise<VersionRow[]> {
  const { rows } = await query(
    `SELECT * FROM document_versions WHERE document_id = $1 ORDER BY date DESC, id DESC`,
    [documentId],
  );
  return rows as VersionRow[];
}

/* ─── GET /documents/audit-logs — System Audit Logs ────── */

router.get(
  "/audit-logs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search, action, user_id, entity_type, start_date, end_date } =
      req.query as Record<string, string | undefined>;
    const page = toNumber(req.query.page, 1);
    const limit = Math.min(toNumber(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;

    const where: string[] = [];
    const params: unknown[] = [];

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      where.push(
        `(LOWER(user_name) LIKE $${params.length + 1} OR LOWER(action) LIKE $${params.length + 2} OR LOWER(COALESCE(details::text, '')) LIKE $${params.length + 3})`,
      );
      params.push(q, q, q);
    }
    if (action && action !== "ALL") {
      where.push(`action = $${params.length + 1}`);
      params.push(action);
    }
    if (user_id && user_id !== "ALL") {
      where.push(`user_id = $${params.length + 1}`);
      params.push(Number(user_id));
    }
    if (entity_type && entity_type !== "ALL") {
      where.push(`entity_type = $${params.length + 1}`);
      params.push(entity_type);
    }
    if (start_date) {
      where.push(`timestamp >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      where.push(`timestamp <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countParams = [...params];
    const pageParams = [...params, limit, offset];

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`,
        countParams,
      ),
      query(
        `SELECT * FROM audit_logs ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pageParams,
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;
    res.json({
      data: rows.map((r) => serializeAuditLog(r as AuditLogRow)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── GET /documents — paginated, filtered ─────────────── */

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      search,
      category,
      status,
      securityLevel,
      start_date,
      end_date,
      direction,
    } = req.query as Record<string, string | undefined>;
    const dept = normalizeDepartmentParam(req.query.department_id);
    const page = toNumber(req.query.page, 1);
    const limit = Math.min(toNumber(req.query.limit, 10), 100);
    const offset = (page - 1) * limit;

    const where: string[] = [];
    const params: unknown[] = [];
    addEmployeeScope(where, params, authReq.user);

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      where.push(
        `(LOWER(d.title) LIKE $${params.length + 1} OR LOWER(d.document_number) LIKE $${params.length + 2} OR LOWER(d.category) LIKE $${params.length + 3})`,
      );
      params.push(q, q, q);
    }
    if (category && category !== "ALL") {
      where.push(`d.category = $${params.length + 1}`);
      params.push(category);
    }
    if (dept.id !== undefined) {
      where.push(`d.department_id = $${params.length + 1}`);
      params.push(dept.id);
    } else if (dept.name) {
      where.push(`LOWER(d.department_name) LIKE $${params.length + 1}`);
      params.push(`%${dept.name}%`);
    }
    if (status && status !== "ALL") {
      where.push(`d.status = $${params.length + 1}`);
      params.push(status);
    }
    if (securityLevel && securityLevel !== "ALL") {
      where.push(`d.security_level = $${params.length + 1}`);
      params.push(securityLevel);
    }
    // direction maps to the letter_type column in the database
    if (direction && direction !== "ALL") {
      where.push(`d.letter_type = $${params.length + 1}`);
      params.push(direction.toUpperCase());
    }
    if (start_date) {
      where.push(`d.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      where.push(`d.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const countParams = [...params];
    const pageParams = [...params, limit, offset];

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total FROM documents d ${whereSql}`,
        countParams,
      ),
      query(
        `${DOC_SELECT} ${whereSql} ORDER BY d.created_at DESC, d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pageParams,
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;
    res.json({
      data: rows.map((r) => serializeDocument(r as DocumentRow)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── POST /documents — multipart upload ───────────────── */

router.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (!req.file) throw ApiError.badRequest("No file provided.");

    const body = req.body as Record<string, string | undefined>;

    const title =
      body.subject?.trim() || body.title?.trim() || req.file.originalname;
    const category = body.category || "General / Correspondence";
    const securityLevel =
      body.confidentialityLevel || body.securityLevel || "INTERNAL";
    const description = body.description || "";

    const letterType = body.letterType || "INCOMING";
    const sender = body.sender || null;
    const senderOrganization = body.senderOrganization || null;
    const recipient = body.recipient || null;
    const recipientOrganization = body.recipientOrganization || null;
    const priority = body.priority || "NORMAL";
    const originatingDepartment = body.originatingDepartment || null;
    const assignedEmployee = body.assignedEmployee || null;
    const responseRequired =
      body.responseRequired === "true" ||
      body.responseRequired === "1" ||
      false;
    const responseToId = body.responseToId ? Number(body.responseToId) : null;

    const dateReceived = body.dateReceived ? new Date(body.dateReceived) : null;
    const dateSent = body.dateSent ? new Date(body.dateSent) : null;
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    // Initial status depending on letter type
    let initialStatus = "DRAFT";
    if (letterType === "INCOMING") {
      // Incoming letters start as REGISTERED — the registry officer registers them
      // then routes to admin (RECEIVED), then admin routes to department (RECEIVED stays
      // until manager assigns to officer who moves it to IN_PROGRESS).
      initialStatus = "REGISTERED";
    }

    let departmentId: number | null = null;
    let departmentName = body.department_name || "";
    if (departmentName) {
      const dept = await query(
        `SELECT id, name FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [departmentName],
      );
      if (dept.rows.length > 0) {
        departmentId = (dept.rows[0] as { id: number }).id;
        departmentName = (dept.rows[0] as { name: string }).name;
      }
    }

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relativePath = `documents/${randomUUID()}-${safeName}`;
    await saveToLocalDisk(req.file.buffer, relativePath);

    const documentNumber = await nextDocumentNumber();
    let doc: DocumentRow;
    try {
      const inserted = await query(
        `INSERT INTO documents
           (document_number, title, description, category, department_id, department_name,
            created_by, author_id, status, security_level, file_name, file_size, file_type,
            storage_path, tags, version, is_new,
            letter_type, sender, sender_organization, recipient, recipient_organization,
            priority, date_received, date_sent, due_date, originating_department,
            assigned_employee, response_required, response_to_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'v1.0',true,
                 $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING *`,
        [
          documentNumber,
          title,
          description || null,
          category,
          departmentId,
          departmentName || null,
          user.full_name,
          user.id,
          initialStatus,
          securityLevel,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          relativePath,
          splitTags(body.tags),
          letterType,
          sender,
          senderOrganization,
          recipient,
          recipientOrganization,
          priority,
          dateReceived,
          dateSent,
          dueDate,
          originatingDepartment,
          assignedEmployee,
          responseRequired,
          responseToId,
        ],
      );
      doc = inserted.rows[0] as DocumentRow;
    } catch (err) {
      await deleteFromLocalDisk(relativePath);
      throw err;
    }

    // Initial v1.0 version row.
    await query(
      `INSERT INTO document_versions
         (document_id, version_number, uploaded_by, uploaded_by_id, date, file_size, file_name, storage_path, is_current)
       VALUES ($1,'v1.0',$2,$3,now(),$4,$5,$6,true)`,
      [
        doc.id,
        user.full_name,
        user.id,
        req.file.size,
        req.file.originalname,
        relativePath,
      ],
    );

    // Audit log
    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "CREATE_LETTER",
      entityId: doc.id,
      newStatus: initialStatus,
      details: { letterType, documentNumber, title },
    });

    const { rows } = await query(`${DOC_SELECT} WHERE d.id = $1`, [doc.id]);
    res
      .status(201)
      .json(
        serializeDocument(rows[0] as DocumentRow, await loadVersions(doc.id)),
      );
  }),
);

/* ─── GET /documents/:id — detail with versions ────────── */

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { rows } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    if (rows.length === 0) throw ApiError.notFound("Document not found.");
    const doc = rows[0] as DocumentRow;

    res.json(serializeDocument(doc, await loadVersions(doc.id)));
  }),
);

/* ─── GET /documents/:id/audit-trail — Letter Audit Trail ─ */

router.get(
  "/:id/audit-trail",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { rows } = await query(
      `SELECT * FROM audit_logs WHERE entity_type = 'LETTER' AND entity_id = $1 ORDER BY timestamp DESC`,
      [id],
    );
    res.json(rows.map((r) => serializeAuditLog(r as AuditLogRow)));
  }),
);

/* ─── PATCH /documents/:id/status — Workflow status transition ─ */

router.patch(
  "/:id/status",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { status, comments } = req.body || {};
    if (!status || typeof status !== "string") {
      throw ApiError.badRequest("Status string is required.");
    }

    const { rows: existing } = await query(
      `SELECT * FROM documents WHERE id = $1`,
      [id],
    );
    if (existing.length === 0) throw ApiError.notFound("Document not found.");
    const oldDoc = existing[0] as DocumentRow;

    const { rows: updated } = await query(
      `UPDATE documents SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status.toUpperCase()],
    );
    const newDoc = updated[0] as DocumentRow;

    const user = req.user!;

    // Log Audit
    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: `STATUS_CHANGE_TO_${status.toUpperCase()}`,
      entityId: id,
      previousStatus: oldDoc.status,
      newStatus: newDoc.status,
      details: { comments: comments || null },
    });

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: `Status updated to ${newDoc.status}`,
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/route — Route letter to department (Admin) ── */

router.post(
  "/:id/route",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");

    const { department, notes, taskId } = req.body || {};
    if (!department || typeof department !== "string") {
      throw ApiError.badRequest("A destination department is required.");
    }

    const user = req.user!;

    // Validate routing (Section 33)
    const validation = await validateRouteIncoming(id, user.id, user.role);
    if (!validation.valid) {
      return res.status(409).json({
        success: false,
        message: validation.error,
        code: 'INVALID_WORKFLOW_TRANSITION',
      });
    }

    // Use transaction for atomicity (Section 47)
    const result = await transaction(async (client) => {
      // Lock the letter row
      const { rows: existing } = await client.query(
        `SELECT * FROM documents WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (existing.length === 0) throw ApiError.notFound("Document not found.");
      const oldDoc = existing[0] as DocumentRow;

      // Resolve department by name
      let deptId: number | null = oldDoc.department_id;
      let deptName = department.trim();
      const deptRes = await client.query(
        `SELECT id, name FROM departments WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
        [`%${deptName}%`],
      );
      if (deptRes.rows.length > 0) {
        deptId = (deptRes.rows[0] as { id: number }).id;
        deptName = (deptRes.rows[0] as { name: string }).name;
      }

      // After admin routes, status becomes RECEIVED so the department manager
      // can see it as a new letter awaiting officer assignment.
      const newStatus = "RECEIVED";
      await client.query(
        `UPDATE documents
            SET department_id = COALESCE($2, department_id),
                department_name = $3,
                assignment_instructions = COALESCE($4, assignment_instructions),
                status = $5,
                updated_at = NOW()
          WHERE id = $1`,
        [id, deptId, deptName, notes || null, newStatus],
      );

      // Audit (Section 38)
      await client.query(
        `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, previous_status, new_status, details, timestamp)
         VALUES ($1, $2, 'ROUTE_LETTER', 'LETTER', $3, $4, $5, $6, NOW())`,
        [user.id, user.full_name, id, oldDoc.status, newStatus, JSON.stringify({ department: deptName, notes: notes || null })],
      );

      // Complete associated admin task(s) in the same transaction
      const taskIds = taskId ? [Number(taskId)] : [];
      if (!taskId) {
        const { rows: activeTasks } = await client.query(
          `SELECT id FROM admin_tasks 
           WHERE letter_id = $1 
             AND task_type IN ('ROUTE_INCOMING', 'ROUTE_INTERNAL') 
             AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
           FOR UPDATE`,
          [id],
        );
        for (const t of activeTasks) taskIds.push((t as any).id);
      }
      for (const tid of taskIds) {
        await client.query(
          `UPDATE admin_tasks SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2, updated_at = NOW()
           WHERE id = $1 AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')`,
          [tid, user.id],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
           VALUES ($1, $2, 'ADMIN_TASK_COMPLETED', 'TASK', $3, $3, 'PENDING', 'COMPLETED', $4, NOW())`,
          [user.id, user.full_name, tid, JSON.stringify({ department: deptName, action: 'ROUTE_LETTER' })],
        );
      }

      return { deptName };
    });

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: `Letter routed to ${result.deptName} successfully.`,
      letter: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/assign — Assign letter to officer/dept ── */

router.post(
  "/:id/assign",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const {
      assignedEmployee,
      officerName,
      departmentId,
      instructions,
      dueDate,
    } = req.body || {};
    const user = req.user!;
    // Accept `officerName` (sent by LetterAssignmentDialog) as alias for `assignedEmployee`
    const employeeName = assignedEmployee || officerName || null;

    const { rows: existing } = await query(
      `SELECT * FROM documents WHERE id = $1`,
      [id],
    );
    if (existing.length === 0) throw ApiError.notFound("Document not found.");
    const oldDoc = existing[0] as DocumentRow;

    let deptName = oldDoc.department_name;
    let deptId = oldDoc.department_id;
    if (departmentId) {
      const deptRes = await query(
        `SELECT id, name FROM departments WHERE id = $1`,
        [departmentId],
      );
      if (deptRes.rows.length > 0) {
        deptId = deptRes.rows[0].id;
        deptName = deptRes.rows[0].name;
      }
    }

    // After manager assigns to officer, move to IN_PROGRESS so the employee
    // sees their work actions (Submit for Review, Respond, Mark Complete).
    const newStatus = "IN_PROGRESS";
    await query(
      `UPDATE documents
            SET assigned_employee = COALESCE($2, assigned_employee),
              assigned_employee_id = COALESCE((SELECT id FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($2)) LIMIT 1), assigned_employee_id),
              department_id = COALESCE($3, department_id),
              department_name = COALESCE($4, department_name),
              assignment_instructions = COALESCE($5, assignment_instructions),
              due_date = COALESCE($6, due_date),
              status = $7,
              updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [
        id,
        employeeName,
        deptId,
        deptName,
        instructions || null,
        dueDate ? new Date(dueDate) : null,
        newStatus,
      ],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "ASSIGN_LETTER",
      entityId: id,
      previousStatus: oldDoc.status,
      newStatus,
      details: {
        assignedEmployee: employeeName,
        departmentId: deptId,
        instructions,
        dueDate,
      },
    });

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Letter assigned successfully.",
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/dispatch — Dispatch outgoing letter ── */

router.post(
  "/:id/dispatch",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { dispatchMethod, trackingNumber, dispatchDate } = req.body || {};
    const user = req.user!;

    const { rows: existing } = await query(
      `SELECT * FROM documents WHERE id = $1`,
      [id],
    );
    if (existing.length === 0) throw ApiError.notFound("Document not found.");
    const oldDoc = existing[0] as DocumentRow;

    const newStatus = "DISPATCHED";
    await query(
      `UPDATE documents
          SET dispatch_method = $2,
              tracking_number = $3,
              dispatch_date = COALESCE($4, NOW()),
              status = $5,
              updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [
        id,
        dispatchMethod || "HAND_DELIVERY",
        trackingNumber || null,
        dispatchDate ? new Date(dispatchDate) : null,
        newStatus,
      ],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "DISPATCH_LETTER",
      entityId: id,
      previousStatus: oldDoc.status,
      newStatus,
      details: { dispatchMethod, trackingNumber },
    });

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Letter dispatched successfully.",
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/register-outgoing — Assign outgoing ref # ── */

router.post(
  "/:id/register-outgoing",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");

    const user = req.user!;
    const { taskId } = req.body || {};

    // Validate (Section 34)
    const validation = await validateRegisterOutgoing(id, user.id, user.role);
    if (!validation.valid) {
      return res.status(409).json({
        success: false,
        message: validation.error,
        code: 'INVALID_WORKFLOW_TRANSITION',
      });
    }

    // Use transaction for atomicity (Section 47)
    const result = await transaction(async (client) => {
      // Lock the letter row
      const { rows: existing } = await client.query(
        `SELECT * FROM documents WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (existing.length === 0) throw ApiError.notFound("Document not found.");
      const oldDoc = existing[0] as DocumentRow;

      // Generate registration number server-side (Section 49: never trust frontend)
      const year = new Date().getFullYear();
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM documents WHERE letter_type = 'OUTGOING' AND EXTRACT(YEAR FROM created_at) = $1`,
        [year],
      );
      const n = (countRows[0] as { n: number }).n;
      const registrationNumber = `OUT-${year}-${String(n).padStart(3, "0")}`;

      await client.query(
        `UPDATE documents
            SET registration_number = $2,
                status = 'REGISTERED',
                updated_at = NOW()
          WHERE id = $1`,
        [id, registrationNumber],
      );

      // Audit (Section 38)
      await client.query(
        `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, previous_status, new_status, details, timestamp)
         VALUES ($1, $2, 'REGISTER_OUTGOING', 'LETTER', $3, $4, 'REGISTERED', $5, NOW())`,
        [user.id, user.full_name, id, oldDoc.status, JSON.stringify({ registrationNumber })],
      );

      // Complete associated admin task(s) in the same transaction
      const taskIds = taskId ? [Number(taskId)] : [];
      if (!taskId) {
        const { rows: activeTasks } = await client.query(
          `SELECT id FROM admin_tasks 
           WHERE letter_id = $1 
             AND task_type = 'REGISTER_OUTGOING' 
             AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
           FOR UPDATE`,
          [id],
        );
        for (const t of activeTasks) taskIds.push((t as any).id);
      }
      for (const tid of taskIds) {
        await client.query(
          `UPDATE admin_tasks SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2, updated_at = NOW()
           WHERE id = $1 AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')`,
          [tid, user.id],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, task_id, previous_status, new_status, details, timestamp)
           VALUES ($1, $2, 'ADMIN_TASK_COMPLETED', 'TASK', $3, $3, 'PENDING', 'COMPLETED', $4, NOW())`,
          [user.id, user.full_name, tid, JSON.stringify({ registrationNumber, action: 'REGISTER_OUTGOING' })],
        );
      }

      return { registrationNumber };
    });

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: `Outgoing letter registered with number ${result.registrationNumber}.`,
      letter: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/complete — Mark letter as completed ── */

router.post(
  "/:id/complete",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { comment } = req.body || {};
    const user = req.user!;

    const { rows: existing } = await query(
      `SELECT * FROM documents WHERE id = $1`,
      [id],
    );
    if (existing.length === 0) throw ApiError.notFound("Document not found.");
    const oldDoc = existing[0] as DocumentRow;

    await query(
      `UPDATE documents SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "COMPLETE_LETTER",
      entityId: id,
      previousStatus: oldDoc.status,
      newStatus: "COMPLETED",
      details: { comment: comment || null },
    });

    // Cancel any remaining open tasks for this letter
    const { rows: remainingTasks } = await query(
      `SELECT id FROM admin_tasks 
       WHERE letter_id = $1 
         AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')`,
      [id]
    );
    for (const task of remainingTasks) {
      await cancelTask((task as any).id, 'Letter workflow completed');
    }

    // Notify author of completion (Section 9)
    await notifyLetterCompleted(id, oldDoc.document_number, oldDoc.title, oldDoc.author_id, user.id);

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Letter marked as completed.",
      letter: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── GET /documents/:id/versions ──────────────────────── */

router.get(
  "/:id/versions",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);
    res.json((await loadVersions(id)).map(serializeVersion));
  }),
);

/* ─── POST /documents/:id/versions — new version upload ── */

router.post(
  "/:id/versions",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);
    if (!req.file) throw ApiError.badRequest("No file provided.");

    const user = req.user!;
    const { rows } = await query(`SELECT * FROM documents WHERE id = $1`, [id]);
    if (rows.length === 0) throw ApiError.notFound("Document not found.");

    const countRes = await query(
      `SELECT COUNT(*)::int AS n FROM document_versions WHERE document_id = $1`,
      [id],
    );
    const versionNumber = `v${(countRes.rows[0] as { n: number }).n + 1}.0`;

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relativePath = `documents/${id}/${versionNumber}-${safeName}`;
    await saveToLocalDisk(req.file.buffer, relativePath);

    await query(
      `UPDATE document_versions SET is_current = false WHERE document_id = $1`,
      [id],
    );
    await query(
      `INSERT INTO document_versions
         (document_id, version_number, uploaded_by, uploaded_by_id, date, file_size, file_name, storage_path, is_current)
       VALUES ($1,$2,$3,$4,now(),$5,$6,$7,true)`,
      [
        id,
        versionNumber,
        user.full_name,
        user.id,
        req.file.size,
        req.file.originalname,
        relativePath,
      ],
    );
    await query(
      `UPDATE documents SET version = $2, file_name = $3, file_size = $4, file_type = $5, storage_path = $6, updated_at = now()
        WHERE id = $1`,
      [
        id,
        versionNumber,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        relativePath,
      ],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "UPLOAD_NEW_VERSION",
      entityId: id,
      details: { versionNumber, fileName: req.file.originalname },
    });

    res.json({
      message: "Version uploaded successfully.",
      version: versionNumber,
    });
  }),
);

/* ─── Minimal valid PDF builder for missing files ── */
function buildPlaceholderPdf(title: string): Buffer {
  const stream = `BT /F1 16 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let body = "";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body);
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets)
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(`%PDF-1.4\n${body}${xref}`);
}

/* ─── GET /documents/:id/download — stream file from disk ── */

router.get(
  "/:id/download",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { rows } = await query(`SELECT * FROM documents WHERE id = $1`, [id]);
    if (rows.length === 0) throw ApiError.notFound("Document not found.");
    const doc = rows[0] as DocumentRow;

    const fullPath = path.join(
      config.uploadsDir,
      doc.storage_path || `documents/doc_${id}.pdf`,
    );
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(
        fullPath,
        buildPlaceholderPdf(doc.title || `Document #${id}`),
      );
    }

    const isDownload = req.query.download === "true";
    const dispositionType = isDownload ? "attachment" : "inline";
    const mimeType =
      doc.file_type ||
      (doc.file_name?.endsWith(".pdf") || doc.storage_path?.endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream");

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `${dispositionType}; filename="${(doc.file_name || `document_${id}.pdf`).replace(/["\\]/g, "_")}"`,
    );

    const stat = fs.statSync(fullPath);
    res.setHeader("Content-Length", stat.size);

    fs.createReadStream(fullPath).pipe(res);
  }),
);

/* ─── POST /documents/:id/archive ──────────────────────── */

router.post(
  "/:id/archive",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { rows } = await query(
      `UPDATE documents SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (rows.length === 0) throw ApiError.notFound("Document not found.");
    const doc = rows[0] as DocumentRow;

    const user = req.user!;
    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "ARCHIVE_LETTER",
      entityId: id,
      previousStatus: doc.status,
      newStatus: "ARCHIVED",
    });

    // Cancel any remaining open tasks for this letter
    const { rows: remainingTasks } = await query(
      `SELECT id FROM admin_tasks 
       WHERE letter_id = $1 
         AND status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')`,
      [id]
    );
    for (const task of remainingTasks) {
      await cancelTask((task as any).id, 'Letter archived');
    }

    // Notify author of archival (Section 17)
    await notifyLetterArchived(id, doc.document_number, doc.title, doc.author_id, user.id);

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Document moved to archive.",
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── POST /documents/:id/submit — submit for approval ─── */

router.post(
  "/:id/submit",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    // Employee submits draft for their department manager's review first (PENDING_REVIEW).
    // The manager then approves -> APPROVED, and finally admin registers the outgoing
    // letter number before registry dispatches it.
    const { rows } = await query(
      `UPDATE documents SET status = 'PENDING_REVIEW', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (rows.length === 0) throw ApiError.notFound("Document not found.");
    const doc = rows[0] as DocumentRow;

    const user = req.user!;

    await query(
      `INSERT INTO approvals
         (document_id, submitter_id, submitter_name, submitter_role, submitter_department,
          priority, status, submitted_at, page_count)
       VALUES ($1,$2,$3,$4,$5,'NORMAL','PENDING',now(),NULL)
       ON CONFLICT (document_id) DO UPDATE
         SET status = 'PENDING', submitted_at = now(), reviewed_at = NULL, comment = NULL, priority = 'NORMAL'
       RETURNING id`,
      [
        id,
        doc.author_id ?? user.id,
        user.full_name,
        user.job_title || null,
        doc.department_name || null,
      ],
    );

    await query(
      `INSERT INTO approval_activities (action, document_id, document_title, user_name, timestamp)
       VALUES ('SUBMITTED', $1, $2, $3, now())`,
      [id, doc.title, user.full_name],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "SUBMIT_FOR_REVIEW",
      entityId: id,
      previousStatus: doc.status,
      newStatus: "PENDING_REVIEW",
    });

    // Notify department manager of submission (Section 11)
    await notifyDepartmentManagers(
      doc.department_id,
      "DOCUMENT_SUBMITTED",
      `${user.full_name} submitted "${doc.title}" for approval.`,
      doc.id,
      doc.title,
    );

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Document submitted for approval.",
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

/* ─── GET /documents/:id/attachments — alias for versions ── */

router.get(
  "/:id/attachments",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const versions = await loadVersions(id);
    res.json(
      versions.map((v) => ({
        id: String(v.id),
        versionNumber: v.version_number,
        uploadedBy: v.uploaded_by,
        date:
          v.date instanceof Date
            ? v.date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : String(v.date),
        fileSize: v.file_size ?? undefined,
        fileName: v.file_name ?? undefined,
        isCurrent: v.is_current,
      })),
    );
  }),
);

/* ─── POST /documents/:id/attachments — alias for version upload ── */

router.post(
  "/:id/attachments",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);
    if (!req.file) throw ApiError.badRequest("No file provided.");

    const user = req.user!;
    const { rows } = await query(`SELECT * FROM documents WHERE id = $1`, [id]);
    if (rows.length === 0) throw ApiError.notFound("Document not found.");

    const countRes = await query(
      `SELECT COUNT(*)::int AS n FROM document_versions WHERE document_id = $1`,
      [id],
    );
    const versionNumber = `v${(countRes.rows[0] as { n: number }).n + 1}.0`;

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relativePath = `documents/${id}/${versionNumber}-${safeName}`;
    await saveToLocalDisk(req.file.buffer, relativePath);

    await query(
      `UPDATE document_versions SET is_current = false WHERE document_id = $1`,
      [id],
    );
    await query(
      `INSERT INTO document_versions
         (document_id, version_number, uploaded_by, uploaded_by_id, date, file_size, file_name, storage_path, is_current)
       VALUES ($1,$2,$3,$4,now(),$5,$6,$7,true)`,
      [
        id,
        versionNumber,
        user.full_name,
        user.id,
        req.file.size,
        req.file.originalname,
        relativePath,
      ],
    );
    await query(
      `UPDATE documents SET version = $2, file_name = $3, file_size = $4, file_type = $5, storage_path = $6, updated_at = now()
        WHERE id = $1`,
      [
        id,
        versionNumber,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        relativePath,
      ],
    );

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "UPLOAD_ATTACHMENT",
      entityId: id,
      details: { versionNumber, fileName: req.file.originalname },
    });

    res.json({
      message: "Attachment uploaded successfully.",
      version: versionNumber,
    });
  }),
);

/* ─── POST /documents/:id/restore — restore from archive ─── */

router.post(
  "/:id/restore",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw ApiError.badRequest("Invalid document id.");
    await assertEmployeeDocumentAccess(id, req.user);

    const { rows } = await query(
      `UPDATE documents SET status = 'APPROVED', updated_at = now() WHERE id = $1 AND status = 'ARCHIVED' RETURNING *`,
      [id],
    );
    if (rows.length === 0) {
      const { rows: existing } = await query(
        `SELECT id, status FROM documents WHERE id = $1`,
        [id],
      );
      if (existing.length === 0) throw ApiError.notFound("Document not found.");
      throw ApiError.badRequest("Only archived documents can be restored.");
    }
    const doc = rows[0] as DocumentRow;

    const user = req.user!;
    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: "RESTORE_LETTER",
      entityId: id,
      previousStatus: "ARCHIVED",
      newStatus: "APPROVED",
    });

    if (doc.author_id) {
      await createNotificationLegacy({
        userId: doc.author_id,
        type: "DOCUMENT_RESTORED",
        message: `Your document "${doc.title}" has been restored from archives.`,
        documentId: doc.id,
        documentTitle: doc.title,
      });
    }

    const { rows: full } = await query(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    res.json({
      message: "Document restored from archive.",
      document: serializeDocument(full[0] as DocumentRow),
    });
  }),
);

export default router;
