/**
 * Seed script — provisions official SITA directorates, demo users, workflow letters,
 * attachments, approvals, notifications, comments, and audit logs.
 *
 * Demo accounts (password: Sita@2026):
 *  - admin@sita.gov.et    (ADMIN)
 *  - manager@sita.gov.et  (DEPARTMENT_MANAGER)
 *  - employee@sita.gov.et (EMPLOYEE)
 *  - registry@sita.gov.et (REGISTRY_OFFICER)
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage: npm run seed
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { DATABASE_URL, DB_SSL, UPLOADS_DIR } = process.env;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const dbSsl = DB_SSL === 'true';
const uploadsDir = UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
const DEMO_PASSWORD = 'Sita@2026';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: dbSsl ? { rejectUnauthorized: false } : false,
});

/* ─── Minimal valid PDF placeholder ─────────────────────── */

function buildPlaceholderPdf(title: string): Buffer {
  const stream = `BT /F1 16 Tf 72 720 Td (${title.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let body = '';
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body);
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(`%PDF-1.4\n${body}${xref}`);
}

/* ─── Helpers ───────────────────────────────────────────── */

async function upsertDepartment(name: string, code: string, description: string): Promise<number> {
  const { rows } = await pool.query('SELECT id FROM departments WHERE code = $1', [code]);
  if (rows.length > 0) return rows[0].id as number;
  const inserted = await pool.query(
    'INSERT INTO departments (name, code, description) VALUES ($1,$2,$3) RETURNING id',
    [name, code, description]
  );
  return (inserted.rows[0] as { id: number }).id;
}

async function upsertUser(profile: {
  full_name: string;
  email: string;
  role: string;
  departmentId: number;
  jobTitle: string;
}): Promise<number> {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [profile.email]);
  if (rows.length > 0) {
    console.log(`[seed] user ${profile.email} already exists, skipping`);
    return rows[0].id as number;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const inserted = await pool.query(
    `INSERT INTO users (full_name, email, role, department_id, job_title, password_hash, status, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',true) RETURNING id`,
    [profile.full_name, profile.email, profile.role, profile.departmentId, profile.jobTitle, passwordHash]
  );
  console.log(`[seed] created user ${profile.email}`);
  return (inserted.rows[0] as { id: number }).id;
}

async function savePlaceholderPdf(docKey: string, title: string): Promise<{ path: string; size: number }> {
  const pdf = buildPlaceholderPdf(title);
  const fullPath = path.join(uploadsDir, docKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, pdf);
  console.log(`[seed] wrote placeholder PDF to ${fullPath}`);
  return { path: docKey, size: pdf.byteLength };
}

async function seedDocument(args: {
  documentNumber: string;
  title: string;
  description: string;
  category: string;
  departmentId: number;
  departmentName: string;
  createdBy: string;
  authorId: number;
  status: string;
  storageKey: string;

  // Letter fields
  letterType?: string;
  sender?: string;
  senderOrganization?: string;
  recipient?: string;
  recipientOrganization?: string;
  priority?: string;
  dateReceived?: Date | string;
  dateSent?: Date | string;
  dueDate?: Date | string;
  originatingDepartment?: string;
  assignedEmployee?: string;
  assignedEmployeeId?: number;
  responseRequired?: boolean;
}) {
  const { rows } = await pool.query('SELECT id FROM documents WHERE document_number = $1', [
    args.documentNumber,
  ]);
  if (rows.length > 0) return rows[0].id as number;

  const file = await savePlaceholderPdf(args.storageKey, args.title);
  const inserted = await pool.query(
    `INSERT INTO documents
       (document_number, title, description, category, department_id, department_name,
        created_by, author_id, status, security_level, file_name, file_size, file_type,
        storage_path, tags, version, is_new,
        letter_type, sender, sender_organization, recipient, recipient_organization,
        priority, date_received, date_sent, due_date, originating_department,
        assigned_employee, assigned_employee_id, response_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'INTERNAL',$10,$11,'application/pdf',$12,
             ARRAY['demo'],'v1.0',true,
             $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING id`,
    [
      args.documentNumber, args.title, args.description, args.category,
      args.departmentId, args.departmentName, args.createdBy, args.authorId,
      args.status, args.title + '.pdf', file.size, file.path,
      args.letterType || 'INCOMING',
      args.sender || null,
      args.senderOrganization || null,
      args.recipient || null,
      args.recipientOrganization || null,
      args.priority || 'NORMAL',
      args.dateReceived || null,
      args.dateSent || null,
      args.dueDate || null,
      args.originatingDepartment || null,
      args.assignedEmployee || null,
      args.assignedEmployeeId || null,
      args.responseRequired || false,
    ]
  );
  const docId = (inserted.rows[0] as { id: number }).id;

  await pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, uploaded_by, uploaded_by_id, file_size, file_name, storage_path, is_current)
     VALUES ($1,'v1.0',$2,$3,$4,$5,$6,true)`,
    [docId, args.createdBy, args.authorId, file.size, args.title + '.pdf', file.path]
  );

  // Audit log entry
  await pool.query(
    `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, new_status, timestamp)
     VALUES ($1, $2, 'CREATE_LETTER', 'LETTER', $3, $4, NOW())`,
    [args.authorId, args.createdBy, docId, args.status]
  );

  console.log(`[seed] created document ${args.documentNumber}`);
  return docId;
}

/* ─── Main ──────────────────────────────────────────────── */

async function seed() {
  fs.mkdirSync(path.join(uploadsDir, 'documents'), { recursive: true });

  // 4 Official SITA Directorates
  const deptApp = await upsertDepartment('App Development Directorate', 'DIR-APP', 'Web & mobile application software engineering, portal development, and digital services.');
  const deptInf = await upsertDepartment('ICT Infrastructure Development Directorate', 'DIR-INF', 'Network infrastructure, data center operations, cybersecurity, and hardware systems.');
  const deptSct = await upsertDepartment('Science and Technology Directorate', 'DIR-SCT', 'Scientific research innovation, technology transfer, emerging tech policies, and standards.');
  const deptInc = await upsertDepartment('Incubation Development Directorate', 'DIR-INC', 'Tech startup incubation, innovation hub mentoring, entrepreneurship support, and grants.');

  // Demo users with hashed passwords
  const adminId = await upsertUser({
    full_name: 'Abebe Bikila (Admin)', email: 'admin@sita.gov.et', role: 'ADMIN',
    departmentId: deptInf, jobTitle: 'System Administrator & Main Admin',
  });
  const managerId = await upsertUser({
    full_name: 'Tariku Eshetu (Manager)', email: 'manager@sita.gov.et', role: 'DEPARTMENT_MANAGER',
    departmentId: deptApp, jobTitle: 'App Development Directorate Manager',
  });
  const employeeId = await upsertUser({
    full_name: 'Endrias Eshetu (Employee)', email: 'employee@sita.gov.et', role: 'EMPLOYEE',
    departmentId: deptApp, jobTitle: 'Software Systems Lead',
  });
  await upsertUser({
    full_name: 'Abebe Demissie', email: 'registry@sita.gov.et', role: 'REGISTRY_OFFICER',
    departmentId: deptInf, jobTitle: 'Senior Registry Officer',
  });

  // Sample Documents covering the 3 workflows
  const incomingDoc = await seedDocument({
    documentNumber: 'IN/2026/00452',
    title: 'MOF_Digital_Transformation_Report_Request.pdf',
    description: 'Official correspondence from the Ministry of Finance requesting SITA digital transformation milestones and budget realignment.',
    category: 'Finance / Budget',
    departmentId: deptInf,
    departmentName: 'ICT Infrastructure Development Directorate',
    createdBy: 'Registry Officer',
    authorId: adminId,
    status: 'IN_PROGRESS',
    storageKey: 'documents/seed-mof-report-request.pdf',

    letterType: 'INCOMING',
    sender: 'Ato Kebede Tadesse',
    senderOrganization: 'Ministry of Finance, Federal Democratic Republic of Ethiopia',
    recipient: 'Director General / Main Admin',
    recipientOrganization: 'SITA',
    priority: 'HIGH',
    dateReceived: new Date('2026-08-20T09:30:00'),
    dueDate: new Date('2026-09-05T00:00:00'),
    assignedEmployee: 'Endrias Eshetu (Employee)',
    assignedEmployeeId: employeeId,
    responseRequired: true,
  });

  const outgoingDoc = await seedDocument({
    documentNumber: 'OUT/2026/00891',
    title: 'SITA_Response_MOF_Q4_Report.pdf',
    description: 'Formal response letter drafted for the Ministry of Finance detailing SITA digital infrastructure metrics and budget deployment.',
    category: 'Finance / Budget',
    departmentId: deptApp,
    departmentName: 'App Development Directorate',
    createdBy: 'Endrias Eshetu (Employee)',
    authorId: employeeId,
    status: 'APPROVED',
    storageKey: 'documents/seed-sita-mof-response.pdf',

    letterType: 'OUTGOING',
    sender: 'Director General, SITA',
    senderOrganization: 'Sidama Innovation and Technology Agency',
    recipient: 'Ato Kebede Tadesse (State Minister)',
    recipientOrganization: 'Ministry of Finance, Ethiopia',
    priority: 'HIGH',
    dateSent: new Date('2026-08-25T09:15:00'),
  });

  await seedDocument({
    documentNumber: 'INT/2026/00317',
    title: 'IT_Server_Procurement_Internal_Memo.pdf',
    description: 'Internal communication from App Development Directorate to ICT Infrastructure Development Directorate for cloud server deployment.',
    category: 'Procurement / Supplies',
    departmentId: deptInf,
    departmentName: 'ICT Infrastructure Development Directorate',
    createdBy: 'Endrias Eshetu (Employee)',
    authorId: employeeId,
    status: 'RECEIVED',
    storageKey: 'documents/seed-internal-server-memo.pdf',

    letterType: 'INTERNAL',
    sender: 'App Development Lead',
    senderOrganization: 'SITA – App Development Directorate',
    recipient: 'ICT Infrastructure Directorate Head',
    recipientOrganization: 'SITA Internal',
    priority: 'HIGH',
    dateSent: new Date('2026-08-24T10:00:00'),
    dueDate: new Date('2026-09-10T00:00:00'),
  });

  // Approvals & activities
  const approvalExists = await pool.query('SELECT id FROM approvals WHERE document_id = $1', [outgoingDoc]);
  if (approvalExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO approvals (document_id, submitter_id, submitter_name, submitter_role, submitter_department, priority, status, reviewed_at, reviewer_name, comment)
       VALUES ($1, $2, 'Endrias Eshetu (Employee)', 'Software Systems Lead', 'App Development Directorate', 'HIGH', 'APPROVED', NOW(), 'Tariku Eshetu (Manager)', 'Approved for official dispatch to Ministry of Finance.')`,
      [outgoingDoc, employeeId]
    );

    await pool.query(
      `INSERT INTO approval_activities (action, document_id, document_title, user_name)
       VALUES ('APPROVED', $1, 'SITA_Response_MOF_Q4_Report.pdf', 'Tariku Eshetu (Manager)')`,
      [outgoingDoc]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, document_id, document_title)
       VALUES ($1, 'DOCUMENT_APPROVED', 'Your response letter OUT/2026/00891 was approved.', $2, 'SITA_Response_MOF_Q4_Report.pdf')`,
      [employeeId, outgoingDoc]
    );

    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, previous_status, new_status, details)
       VALUES ($1, 'Tariku Eshetu (Manager)', 'APPROVAL_APPROVED', 'LETTER', $2, 'PENDING_APPROVAL', 'APPROVED', '{"comment":"Approved for official dispatch"}')`,
      [managerId, outgoingDoc]
    );

    console.log('[seed] created approval + activity + notification + audit log');
  }

  // Comments
  const commentExists = await pool.query('SELECT id FROM comments WHERE document_id = $1', [incomingDoc]);
  if (commentExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO comments (document_id, author_id, author_name, author_role, author_department, message)
       VALUES ($1, $2, 'Tariku Eshetu (Manager)', 'Department Manager', 'App Development Directorate', 'Please detail Q4 server capacity and cloud migration timeline in section 2.')`,
      [incomingDoc, managerId]
    );
    console.log('[seed] created comment');
  }

  // Assign department managers
  await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [managerId, deptApp]);
  await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [adminId, deptInf]);
  await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [managerId, deptSct]);
  await pool.query('UPDATE departments SET manager_id = $1 WHERE id = $2', [adminId, deptInc]);

  console.log('\n[seed] Done! Demo logins (password: Sita@2026):');
  console.log('  admin@sita.gov.et    (ADMIN)');
  console.log('  manager@sita.gov.et  (DEPARTMENT_MANAGER)');
  console.log('  employee@sita.gov.et (EMPLOYEE)');
  console.log('  registry@sita.gov.et (REGISTRY_OFFICER)');
  console.log(`\nSeeded SITA directorates, users, workflow letters, and audit logs.`);

  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
