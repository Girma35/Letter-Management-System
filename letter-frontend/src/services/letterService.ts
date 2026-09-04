import api from "./api";
import approvalService from "./approvalService";
import {
  LetterFilterParams,
  LetterItem,
  PaginatedLetterResponse,
  AttachmentItem,
  LetterType,
  LetterDirection,
  ConfidentialityLevel,
  LetterPriority,
  LetterDispatch,
} from "@/types/letter";
import { AdminTask, AdminTaskResponse, AdminTaskSummary } from "@/types/adminTask";

/**
 * Mock Initial Letters Dataset for Dev Offline Mode with 3 Workflows
 */
const MOCK_LETTERS: LetterItem[] = [
  {
    id: "ltr-1",
    direction: "INCOMING",
    referenceNumber: "IN/2026/00452",
    registrationNumber: "IN/2026/00452",
    externalReferenceNumber: "MOF/DE/982/2026",
    subject:
      "Request for Digital Transformation Progress Report & Budget Alignment",
    description:
      "Official correspondence from the Ministry of Finance requesting SITA digital transformation milestones, Q4 expenditure, and budget realignment proposal.",
    letterType: "REQUEST",
    category: "Finance / Budget",
    department_name: "ICT Infrastructure Development Directorate",
    currentDepartment: "ICT Infrastructure Development Directorate",
    currentLocation: "ICT Infrastructure Development Directorate",
    currentResponsibleUser: "Endrias Eshetu (IT Officer)",
    currentTask: "Prepare Outgoing Response Letter",
    originatingDepartment: "Ministry of Finance",
    sender: "Ato Kebede Tadesse",
    senderOrganization:
      "Ministry of Finance, Federal Democratic Republic of Ethiopia",
    recipient: "Main Administrator / Director General",
    recipientOrganization: "Sidama Innovation and Technology Agency (SITA)",
    assignedEmployee: "Endrias Eshetu",
    created_by: "Registry Officer (Abebe Demissie)",
    status: "IN_PROGRESS",
    confidentialityLevel: "CONFIDENTIAL",
    priority: "HIGH",
    dateReceived: "Aug 20, 2026",
    dueDate: "Sep 05, 2026",
    responseRequired: true,
    responseDeadline: "Sep 02, 2026",
    file_name: "MOF_Digital_Transformation_Report_Request.pdf",
    file_size: 2516582,
    file_type: "application/pdf",
    created_at: "Aug 20, 2026 09:30 AM",
    updated_at: "Aug 22, 2026 02:15 PM",
    tags: ["budget", "digital-transformation", "mof", "quarterly-report"],
    is_new: false,
    assignment: {
      assignedDepartment: "ICT Infrastructure Development Directorate",
      assignedUser: "Endrias Eshetu",
      assignedUserId: "user-3",
      assignedBy: "Tigist Haile (Directorate Manager)",
      assignmentDate: "Aug 21, 2026",
      dueDate: "Sep 02, 2026",
      instructions:
        "Prepare detailed status report on SITA infrastructure migration and budget deployment for Q4.",
      priority: "HIGH",
      taskStatus: "IN_PROGRESS",
    },
    relatedLetters: [
      {
        id: "ltr-2",
        referenceNumber: "OUT/2026/00891",
        registrationNumber: "OUT/2026/00891",
        subject:
          "Digital Transformation Progress Report & Q4 Expenditure Breakdown",
        direction: "OUTGOING",
        relationshipType: "HAS_RESPONSE",
      },
    ],
    movements: [
      {
        id: "mov-1",
        actorName: "Abebe Demissie",
        actorRole: "REGISTRY_OFFICER",
        action: "Received & Registered Physical Letter",
        timestamp: "Aug 20, 2026 09:30 AM",
        newStatus: "REGISTERED",
        comment: "Verified seal and physical document integrity.",
      },
      {
        id: "mov-2",
        actorName: "Abebe Demissie",
        actorRole: "REGISTRY_OFFICER",
        action: "Routed to Main Administrator",
        timestamp: "Aug 20, 2026 10:15 AM",
        previousStatus: "REGISTERED",
        newStatus: "RECEIVED",
      },
      {
        id: "mov-3",
        actorName: "Main Administrator (Admin)",
        actorRole: "ADMIN",
        action: "Routed to ICT Infrastructure Development Directorate",
        timestamp: "Aug 20, 2026 02:00 PM",
        previousStatus: "RECEIVED",
        newStatus: "RECEIVED",
        department: "ICT Infrastructure Development Directorate",
        comment:
          "Assigned to Infrastructure Directorate for technical preparation.",
      },
      {
        id: "mov-4",
        actorName: "Tigist Haile",
        actorRole: "DEPARTMENT_MANAGER",
        action: "Assigned Task to Officer",
        timestamp: "Aug 21, 2026 09:00 AM",
        previousStatus: "RECEIVED",
        newStatus: "IN_PROGRESS",
        assignedUser: "Endrias Eshetu",
        comment: "Please draft the response by Sep 2.",
      },
    ],
    attachments: [
      {
        id: "att-1-1",
        versionNumber: "v1.0",
        uploadedBy: "Abebe Demissie (Registry)",
        date: "Aug 20, 2026 09:30 AM",
        fileSize: 2516582,
        fileName: "MOF_Digital_Transformation_Report_Request.pdf",
        isCurrent: true,
      },
    ],
  },
  {
    id: "ltr-2",
    direction: "OUTGOING",
    referenceNumber: "OUT/2026/00891",
    registrationNumber: "OUT/2026/00891",
    outgoingReferenceNumber: "OUT/2026/00891",
    subject:
      "Official Response – SITA Digital Transformation Progress & Q4 Allocation Proposal",
    description:
      "Formal response letter drafted for the Ministry of Finance detailing SITA digital infrastructure metrics and budget deployment.",
    letterType: "RESPONSE",
    category: "Finance / Budget",
    department_name: "App Development Directorate",
    currentDepartment: "Registry & Dispatch",
    currentLocation: "Central Registry",
    currentResponsibleUser: "Registry Dispatch Officer",
    currentTask: "Dispatch Official Letter to Ministry of Finance",
    sender: "Director General, SITA",
    senderOrganization: "Sidama Innovation and Technology Agency",
    recipient: "Ato Kebede Tadesse (State Minister)",
    recipientOrganization: "Ministry of Finance, Ethiopia",
    created_by: "Endrias Eshetu",
    status: "APPROVED",
    confidentialityLevel: "CONFIDENTIAL",
    priority: "HIGH",
    dateSent: "Aug 25, 2026",
    relatedLetterId: "ltr-1",
    relatedLetters: [
      {
        id: "ltr-1",
        referenceNumber: "IN/2026/00452",
        registrationNumber: "IN/2026/00452",
        subject:
          "Request for Digital Transformation Progress Report & Budget Alignment",
        direction: "INCOMING",
        relationshipType: "RESPONSE_TO",
      },
    ],
    dispatch: {
      dispatchNumber: "DSP-2026-0891",
      dispatchDate: "Aug 25, 2026",
      dispatchMethod: "OFFICIAL_EMAIL",
      recipientName: "Ato Kebede Tadesse",
      recipientOrganization: "Ministry of Finance",
      sentBy: "Tariku Bikila (Dispatch Officer)",
      courierReferenceNumber: "EMAIL-MSG-9921",
      deliveryConfirmation: true,
      deliveryDate: "Aug 25, 2026",
    },
    movements: [
      {
        id: "mov-2-1",
        actorName: "Endrias Eshetu",
        actorRole: "EMPLOYEE",
        action: "Created Draft Response",
        timestamp: "Aug 22, 2026 02:00 PM",
        newStatus: "DRAFT",
      },
      {
        id: "mov-2-2",
        actorName: "Endrias Eshetu",
        actorRole: "EMPLOYEE",
        action: "Submitted Response for Manager Approval",
        timestamp: "Aug 23, 2026 11:00 AM",
        previousStatus: "DRAFT",
        newStatus: "PENDING_REVIEW",
      },
      {
        id: "mov-2-3",
        actorName: "Tigist Haile",
        actorRole: "DEPARTMENT_MANAGER",
        action: "Approved Response Letter",
        timestamp: "Aug 24, 2026 03:45 PM",
        previousStatus: "PENDING_REVIEW",
        newStatus: "APPROVED",
        comment: "Verified annexes and strategic alignment.",
      },
      {
        id: "mov-2-4",
        actorName: "Main Administrator",
        actorRole: "ADMIN",
        action: "Verified & Assigned Official Registration OUT/2026/00891",
        timestamp: "Aug 25, 2026 09:15 AM",
        previousStatus: "APPROVED",
        newStatus: "READY_FOR_DISPATCH",
      },
    ],
    file_name: "SITA_Response_MOF_Q4_Report.pdf",
    file_size: 1290777,
    file_type: "application/pdf",
    created_at: "Aug 22, 2026 02:00 PM",
    updated_at: "Aug 25, 2026 09:15 AM",
    tags: ["response", "mof", "digital-transformation"],
    attachments: [
      {
        id: "att-2-1",
        versionNumber: "v1.0",
        uploadedBy: "Endrias Eshetu",
        date: "Aug 22, 2026",
        fileSize: 1290777,
        fileName: "SITA_Response_MOF_Q4_Report.pdf",
        isCurrent: true,
      },
    ],
  },
  {
    id: "ltr-3",
    direction: "INTERNAL",
    referenceNumber: "INT/2026/00317",
    registrationNumber: "INT/2026/00317",
    subject: "Internal Memorandum – Software Portal Engineering Request",
    description:
      "Internal communication from App Development Directorate to ICT Infrastructure Development Directorate for datacenter server deployment.",
    letterType: "MEMORANDUM",
    category: "Procurement / Supplies",
    department_name: "ICT Infrastructure Development Directorate",
    targetDepartment: "ICT Infrastructure Development Directorate",
    originatingDepartment: "App Development Directorate",
    currentDepartment: "ICT Infrastructure Development Directorate",
    currentLocation: "ICT Infrastructure Development Directorate",
    currentResponsibleUser: "Infrastructure Manager",
    fromDirectorate: "App Development Directorate",
    toDirectorate: "ICT Infrastructure Development Directorate",
    currentTask: "Assign Infrastructure Specialist",
    sender: "App Development Lead (Endrias Eshetu)",
    senderOrganization: "SITA - App Development Directorate",
    recipient: "ICT Infrastructure Directorate Head",
    recipientOrganization: "SITA Internal",
    created_by: "Sara Jenkins",
    status: "RECEIVED",
    confidentialityLevel: "INTERNAL",
    priority: "HIGH",
    dateSent: "Aug 24, 2026",
    dueDate: "Sep 10, 2026",
    assignment: {
      assignedDepartment: "ICT Infrastructure Development Directorate",
      taskStatus: "PENDING_ACTION",
      dueDate: "Sep 10, 2026",
      instructions:
        "Process deployment request for 4 cloud application servers.",
    },
    movements: [
      {
        id: "mov-3-1",
        actorName: "Sara Jenkins",
        actorRole: "EMPLOYEE",
        action: "Created Internal Memorandum",
        timestamp: "Aug 24, 2026 10:00 AM",
        newStatus: "DRAFT",
      },
      {
        id: "mov-3-2",
        actorName: "Tigist Haile",
        actorRole: "DEPARTMENT_MANAGER",
        action: "Approved Internal Transmission",
        timestamp: "Aug 24, 2026 01:30 PM",
        previousStatus: "DRAFT",
        newStatus: "APPROVED",
      },
      {
        id: "mov-3-3",
        actorName: "Main Administrator",
        actorRole: "ADMIN",
        action:
          "Registered & Routed to ICT Infrastructure Directorate (Ref: INT/2026/00317)",
        timestamp: "Aug 24, 2026 04:00 PM",
        previousStatus: "APPROVED",
        newStatus: "RECEIVED",
        department: "ICT Infrastructure Development Directorate",
      },
    ],
    file_name: "IT_Server_Procurement_Internal_Memo.docx",
    file_size: 598323,
    file_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    created_at: "Aug 24, 2026",
    updated_at: "Aug 24, 2026",
    tags: ["internal", "memo", "procurement", "servers"],
    is_new: true,
    attachments: [
      {
        id: "att-3-1",
        versionNumber: "v1.0",
        uploadedBy: "Sara Jenkins",
        date: "Aug 24, 2026",
        fileSize: 598323,
        fileName: "IT_Server_Procurement_Internal_Memo.docx",
        isCurrent: true,
      },
    ],
  },
  {
    id: "ltr-4",
    direction: "INCOMING",
    referenceNumber: "IN/2026/00188",
    registrationNumber: "IN/2026/00188",
    externalReferenceNumber: "AUC/IED/2026/112",
    subject: "Invitation – African Regional ICT Innovation & AI Summit 2026",
    description:
      "Official invitation from African Union Commission for SITA delegation to attend the Regional Innovation Summit.",
    letterType: "INVITATION",
    category: "Events / International",
    department_name: "Science and Technology Directorate",
    currentDepartment: "Archive",
    currentLocation: "Archive",
    currentResponsibleUser: "System Archive",
    currentTask: "Completed & Filed",
    sender: "Commissioner for Infrastructure & Energy",
    senderOrganization: "African Union Commission",
    recipient: "Director General",
    recipientOrganization: "SITA",
    created_by: "Registry Officer",
    status: "COMPLETED",
    confidentialityLevel: "PUBLIC",
    priority: "NORMAL",
    dateReceived: "Jul 15, 2026",
    file_name: "AU_ICT_Summit_Invitation_2026.pdf",
    file_size: 1153433,
    file_type: "application/pdf",
    created_at: "Jul 15, 2026",
    updated_at: "Jul 30, 2026",
    tags: ["event", "invitation", "au", "summit"],
    attachments: [
      {
        id: "att-4-1",
        versionNumber: "v1.0",
        uploadedBy: "Registry Officer",
        date: "Jul 15, 2026",
        fileSize: 1153433,
        fileName: "AU_ICT_Summit_Invitation_2026.pdf",
        isCurrent: true,
      },
    ],
  },
  {
    id: "ltr-5",
    direction: "INCOMING",
    referenceNumber: "IN/2026/00501",
    registrationNumber: "IN/2026/00501",
    externalReferenceNumber: "OAG/AUD/2026/88",
    subject: "Annual Compliance Audit Notification FY2026",
    description:
      "Formal notification from Office of Auditor General regarding upcoming audit schedule for ICT infrastructure and procurement.",
    letterType: "NOTIFICATION",
    category: "Legal / Audit",
    department_name: "Unassigned (Awaiting Main Admin Routing)",
    currentDepartment: "Main Administrator Office",
    currentLocation: "Main Administration",
    currentResponsibleUser: "Main Administrator",
    currentTask: "Determine Destination Department",
    sender: "Deputy Auditor General",
    senderOrganization: "Office of the Auditor General of Ethiopia",
    recipient: "SITA Administration",
    created_by: "Registry Officer (Abebe Demissie)",
    status: "REGISTERED",
    confidentialityLevel: "RESTRICTED",
    priority: "URGENT",
    dateReceived: "Aug 25, 2026",
    dueDate: "Sep 01, 2026",
    file_name: "Audit_Notification_FY2026.pdf",
    file_size: 3460300,
    file_type: "application/pdf",
    created_at: "Aug 25, 2026 08:45 AM",
    updated_at: "Aug 25, 2026 08:45 AM",
    tags: ["audit", "compliance", "legal"],
    is_new: true,
    attachments: [
      {
        id: "att-5-1",
        versionNumber: "v1.0",
        uploadedBy: "Registry Officer",
        date: "Aug 25, 2026",
        fileSize: 3460300,
        fileName: "Audit_Notification_FY2026.pdf",
        isCurrent: true,
      },
    ],
  },
];

let inMemoryLetters = [...MOCK_LETTERS];

export const letterService = {
  async getAdminTasks(): Promise<AdminTaskResponse> {
    try {
      const response = await api.get<AdminTaskResponse>("/tasks/my");
      return response.data;
    } catch (error: any) {
      // Fallback to legacy endpoint if new tasks endpoint fails
      if (error.response?.status === 404 || error.code === 'ERR_NETWORK') {
        const legacyResponse = await api.get<any>("/dashboard/admin/tasks");
        return {
          data: legacyResponse.data.data,
          pagination: {
            page: 1,
            limit: 50,
            total: legacyResponse.data.data.length,
            totalPages: 1,
          },
        };
      }
      throw error;
    }
  },

  async getAdminTaskSummary(): Promise<AdminTaskSummary> {
    const response = await api.get<AdminTaskSummary>("/tasks/my/summary");
    return response.data;
  },

  async getAdminTaskById(taskId: string): Promise<AdminTask> {
    const response = await api.get<AdminTask>(`/tasks/${taskId}`);
    return response.data;
  },

  async claimAdminTask(taskId: string): Promise<{ message: string; task: AdminTask }> {
    const response = await api.post<{ message: string; task: AdminTask }>(`/tasks/${taskId}/claim`);
    return response.data;
  },

  async startAdminTask(taskId: string): Promise<{ message: string; task: AdminTask }> {
    const response = await api.post<{ message: string; task: AdminTask }>(`/tasks/${taskId}/start`);
    return response.data;
  },

  async completeAdminTask(
    taskId: string,
    action: string,
    details?: Record<string, unknown>
  ): Promise<{ message: string; task: AdminTask }> {
    const response = await api.post<{ message: string; task: AdminTask }>(`/tasks/${taskId}/complete`, {
      action,
      details,
    });
    return response.data;
  },

  async cancelAdminTask(taskId: string, reason?: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/tasks/${taskId}/cancel`, { reason });
    return response.data;
  },
  /**
   * Get paginated & filtered list of letters with 3 workflow filters
   */
  async getLetters(
    params?: LetterFilterParams,
  ): Promise<PaginatedLetterResponse> {
    try {
      const response = await api.get<PaginatedLetterResponse>("/letters", {
        params,
      });
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        let filtered = [...inMemoryLetters];

        if (params?.my_letters) {
          filtered = filtered.filter(
            (l) =>
              l.assignedEmployee === "Current User" ||
              l.created_by === "Current User" ||
              l.assignment?.assignedUser === "Current User",
          );
        }

        if (params?.assignedToMe) {
          filtered = filtered.filter(
            (l) =>
              l.assignedEmployee === "Current User" ||
              l.assignment?.assignedUser === "Current User",
          );
        }

        if (params?.direction && params.direction !== "ALL") {
          filtered = filtered.filter((l) => l.direction === params.direction);
        }

        if (params?.search) {
          const query = params.search.toLowerCase();
          filtered = filtered.filter(
            (l) =>
              l.subject.toLowerCase().includes(query) ||
              l.referenceNumber.toLowerCase().includes(query) ||
              (l.registrationNumber || "").toLowerCase().includes(query) ||
              (l.externalReferenceNumber || "").toLowerCase().includes(query) ||
              (l.sender || "").toLowerCase().includes(query) ||
              (l.recipient || "").toLowerCase().includes(query) ||
              l.category.toLowerCase().includes(query),
          );
        }

        if (params?.letterType && params.letterType !== "ALL") {
          filtered = filtered.filter((l) => l.letterType === params.letterType);
        }

        if (params?.category && params.category !== "ALL") {
          filtered = filtered.filter((l) =>
            l.category.toLowerCase().includes(params.category!.toLowerCase()),
          );
        }

        if (params?.department_id && params.department_id !== "ALL") {
          filtered = filtered.filter((l) =>
            l.department_name
              .toLowerCase()
              .includes(params.department_id!.toLowerCase()),
          );
        }

        if (params?.status && params.status !== "ALL") {
          filtered = filtered.filter((l) => l.status === params.status);
        }

        if (params?.taskStatus && params.taskStatus !== "ALL") {
          filtered = filtered.filter(
            (l) => l.assignment?.taskStatus === params.taskStatus,
          );
        }

        if (
          params?.confidentialityLevel &&
          params.confidentialityLevel !== "ALL"
        ) {
          filtered = filtered.filter(
            (l) => l.confidentialityLevel === params.confidentialityLevel,
          );
        }

        if (params?.priority && params.priority !== "ALL") {
          filtered = filtered.filter((l) => l.priority === params.priority);
        }

        const page = params?.page || 1;
        const limit = params?.limit || 10;
        const total = filtered.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginatedData = filtered.slice(startIndex, startIndex + limit);

        return {
          data: paginatedData,
          total,
          page,
          limit,
          totalPages,
        };
      }
      throw error;
    }
  },

  /**
   * Search letters by query
   */
  async searchLetters(
    query: string,
    params?: LetterFilterParams,
  ): Promise<PaginatedLetterResponse> {
    return this.getLetters({ ...params, search: query });
  },

  /**
   * Get single letter by ID
   */
  async getLetterById(id: string): Promise<LetterItem> {
    try {
      const cleanId = id.startsWith("ltr-") ? id.replace(/^ltr-0*/, "") : id;
      const response = await api.get<LetterItem>(`/letters/${cleanId}`);
      return response.data;
    } catch (error: any) {
      const found = inMemoryLetters.find(
        (l) =>
          l.id === id ||
          l.id === `ltr-${id}` ||
          l.id.endsWith(id) ||
          l.referenceNumber === id ||
          l.registrationNumber === id,
      );
      if (found) return found;
      throw error;
    }
  },

  /**
   * Create & Register a new letter based on direction (Incoming, Outgoing, Internal)
   */
  async createLetter(
    formData: FormData,
    onProgress?: (progress: number) => void,
  ): Promise<LetterItem> {
    try {
      const response = await api.post<LetterItem>("/letters", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress?.(percentCompleted);
          }
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const direction =
          (formData.get("direction") as LetterDirection) || "INCOMING";
        const subject =
          (formData.get("subject") as string) || "Untitled Official Letter";
        const letterType =
          (formData.get("letterType") as LetterType) || direction;
        const category =
          (formData.get("category") as string) || "General / Correspondence";
        const department_name =
          (formData.get("department_name") as string) ||
          (formData.get("targetDepartment") as string) ||
          "General Administration";
        const confidentialityLevel =
          (formData.get("confidentialityLevel") as ConfidentialityLevel) ||
          "INTERNAL";
        const priority =
          (formData.get("priority") as LetterPriority) || "NORMAL";
        const description = (formData.get("description") as string) || "";
        const sender = (formData.get("sender") as string) || "";
        const senderOrganization =
          (formData.get("senderOrganization") as string) || "";
        const recipient = (formData.get("recipient") as string) || "";
        const recipientOrganization =
          (formData.get("recipientOrganization") as string) || "";
        const externalReferenceNumber =
          (formData.get("externalReferenceNumber") as string) || "";
        const file = formData.get("file") as File | null;

        const now = new Date();
        const year = now.getFullYear();
        const randNum = String(Math.floor(100 + Math.random() * 900)).padStart(
          5,
          "0",
        );

        let refNum = `LMS/${direction.slice(0, 3)}/${year}/${randNum}`;
        let regNum: string | undefined = undefined;
        let initialStatus: any = "REGISTERED";

        if (direction === "INCOMING") {
          regNum = `IN/${year}/${randNum}`;
          refNum = regNum;
          initialStatus = "REGISTERED";
        } else if (direction === "OUTGOING") {
          initialStatus = "DRAFT";
          refNum = `DRAFT/OUT/${year}/${randNum}`;
        } else if (direction === "INTERNAL") {
          initialStatus = "DRAFT";
          refNum = `DRAFT/INT/${year}/${randNum}`;
        }

        const newLetter: LetterItem = {
          id: `ltr-${Date.now()}`,
          direction,
          referenceNumber: refNum,
          registrationNumber: regNum,
          externalReferenceNumber: externalReferenceNumber || undefined,
          subject,
          description,
          letterType,
          category,
          department_name,
          currentDepartment:
            direction === "INCOMING"
              ? "Main Administrator Office"
              : department_name,
          currentResponsibleUser:
            direction === "INCOMING"
              ? "Main Administrator"
              : "Department Manager",
          sender: sender || undefined,
          senderOrganization: senderOrganization || undefined,
          recipient: recipient || undefined,
          recipientOrganization: recipientOrganization || undefined,
          created_by: "Current User",
          status: initialStatus,
          confidentialityLevel,
          priority,
          dateReceived:
            direction === "INCOMING" ? now.toLocaleDateString() : undefined,
          dateSent:
            direction === "OUTGOING" ? now.toLocaleDateString() : undefined,
          file_name: file ? file.name : `${subject.replace(/\s+/g, "_")}.pdf`,
          file_size: file ? file.size : 1024 * 500,
          file_type: file ? file.type : "application/pdf",
          created_at: now.toLocaleString(),
          updated_at: now.toLocaleString(),
          is_new: true,
          movements: [
            {
              id: `mov-${Date.now()}`,
              actorName: "Current User",
              action:
                direction === "INCOMING"
                  ? "Registered Incoming Letter"
                  : "Created Draft Letter",
              timestamp: now.toLocaleString(),
              newStatus: initialStatus,
            },
          ],
        };

        for (let i = 20; i <= 100; i += 20) {
          await new Promise((res) => setTimeout(res, 40));
          onProgress?.(i);
        }

        inMemoryLetters.unshift(newLetter);
        return newLetter;
      }
      throw error;
    }
  },

  /**
   * Main Administrator Routes Incoming/Internal Letter to Department
   */
  async routeToDepartment(
    id: string,
    departmentName: string,
    notes?: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/route`,
        {
          department: departmentName,
          notes,
        },
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.department_name = departmentName;
          target.currentDepartment = departmentName;
          target.currentResponsibleUser = `${departmentName} Department Manager`;
          target.status = "RECEIVED";

          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Main Administrator",
            actorRole: "ADMIN",
            action: `Routed to ${departmentName} Department`,
            timestamp: new Date().toLocaleString(),
            previousStatus: "REGISTERED",
            newStatus: "RECEIVED",
            department: departmentName,
            comment: notes,
          });

          return {
            message: `Letter routed to ${departmentName} successfully.`,
            letter: target,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Department Manager assigns letter to Officer
   */
  async assignToOfficer(
    id: string,
    payload: {
      officerName: string;
      dueDate?: string;
      instructions?: string;
      priority?: LetterPriority;
    },
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/assign`,
        payload,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.assignedEmployee = payload.officerName;
          target.currentResponsibleUser = payload.officerName;
          target.dueDate = payload.dueDate || target.dueDate;
          target.status = "IN_PROGRESS";

          target.assignment = {
            assignedDepartment: target.department_name,
            assignedUser: payload.officerName,
            assignedBy: "Department Manager",
            assignmentDate: new Date().toLocaleDateString(),
            dueDate: payload.dueDate,
            instructions: payload.instructions,
            priority: payload.priority || target.priority || "NORMAL",
            taskStatus: "IN_PROGRESS",
          };

          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Department Manager",
            actorRole: "DEPARTMENT_MANAGER",
            action: `Assigned letter to ${payload.officerName}`,
            timestamp: new Date().toLocaleString(),
            previousStatus: "RECEIVED",
            newStatus: "IN_PROGRESS",
            assignedUser: payload.officerName,
            comment: payload.instructions,
          });

          return {
            message: `Assigned to ${payload.officerName}.`,
            letter: target,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Register Outgoing Letter (Assign official reference number OUT/YYYY/NNNNN)
   */
  async registerOutgoingNumber(
    id: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/register-outgoing`,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          const year = new Date().getFullYear();
          const randNum = String(
            Math.floor(100 + Math.random() * 900),
          ).padStart(5, "0");
          const officialRef = `OUT/${year}/${randNum}`;

          target.registrationNumber = officialRef;
          target.outgoingReferenceNumber = officialRef;
          target.referenceNumber = officialRef;
          target.status = "READY_FOR_DISPATCH";
          target.currentDepartment = "Registry & Dispatch";
          target.currentResponsibleUser = "Dispatch Officer";

          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Main Administrator",
            actorRole: "ADMIN",
            action: `Registered & Assigned Official Outgoing Number ${officialRef}`,
            timestamp: new Date().toLocaleString(),
            previousStatus: "APPROVED",
            newStatus: "READY_FOR_DISPATCH",
          });

          return {
            message: `Registered with reference ${officialRef}.`,
            letter: target,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Registry/Dispatch Officer records letter dispatch
   */
  async recordDispatch(
    id: string,
    dispatchInfo: Omit<LetterDispatch, "sentBy">,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/dispatch`,
        dispatchInfo,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.status = "DISPATCHED";
          target.dispatch = {
            ...dispatchInfo,
            sentBy: "Dispatch Officer",
          };
          target.dateSent =
            dispatchInfo.dispatchDate || new Date().toLocaleDateString();

          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Dispatch Officer",
            actorRole: "REGISTRY_OFFICER",
            action: `Dispatched via ${dispatchInfo.dispatchMethod} to ${dispatchInfo.recipientName}`,
            timestamp: new Date().toLocaleString(),
            previousStatus: "READY_FOR_DISPATCH",
            newStatus: "DISPATCHED",
          });

          return { message: "Letter dispatched successfully.", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Mark letter completed
   */
  async completeLetter(
    id: string,
    comment?: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/complete`,
        { comment },
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.status = "COMPLETED";
          if (target.assignment) target.assignment.taskStatus = "COMPLETED";

          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Current User",
            action: "Marked Workflow Completed",
            timestamp: new Date().toLocaleString(),
            previousStatus: target.status,
            newStatus: "COMPLETED",
            comment,
          });

          return { message: "Letter workflow completed.", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Get officer's assigned tasks
   */
  async getMyTasks(): Promise<LetterItem[]> {
    const res = await this.getLetters();
    return res.data.filter(
      (l) =>
        l.assignedEmployee ||
        l.status === "IN_PROGRESS" ||
        l.status === "DRAFT" ||
        l.status === "CHANGES_REQUESTED",
    );
  },

  /**
   * Get letters awaiting Main Admin routing
   */
  async getPendingRouting(): Promise<LetterItem[]> {
    const res = await this.getLetters({ status: "REGISTERED" });
    return res.data;
  },

  /**
   * Upload an attachment to an existing letter
   */
  async uploadAttachment(
    id: string,
    formData: FormData,
  ): Promise<{ message: string; version: string }> {
    try {
      const response = await api.post<{ message: string; version: string }>(
        `/letters/${id}/attachments`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        return {
          message: "Attachment uploaded successfully (Dev Mode)",
          version: "v2.0",
        };
      }
      throw error;
    }
  },

  /**
   * Download letter attachment
   */
  async downloadAttachment(id: string, filename?: string): Promise<void> {
    try {
      const response = await api.get(`/letters/${id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename || `letter_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const blob = new Blob(
          [`SITA Letter Content placeholder for Ref: ${id}`],
          {
            type: "text/plain",
          },
        );
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename || `Letter_${id}.txt`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        return;
      }
      throw error;
    }
  },

  /**
   * Archive a letter
   */
  async archiveLetter(
    id: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/archive`,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.status = "ARCHIVED";
          return { message: "Letter moved to archive", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Get attachments for a letter
   */
  async getLetterAttachments(id: string): Promise<AttachmentItem[]> {
    try {
      const response = await api.get<AttachmentItem[]>(
        `/letters/${id}/attachments`,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const letter = inMemoryLetters.find((l) => l.id === id);
        return letter?.attachments || [];
      }
      throw error;
    }
  },

  /**
   * Submit letter for approval
   */
  async submitForApproval(
    id: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/submit`,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.status = "PENDING_REVIEW";
          return { message: "Letter submitted for approval", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Get archived letters
   */
  async getArchivedLetters(
    params?: LetterFilterParams,
  ): Promise<PaginatedLetterResponse> {
    return this.getLetters({ ...params, status: "ARCHIVED" });
  },

  /**
   * Restore an archived letter (Admin only)
   */
  async restoreLetter(
    id: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await api.post<{ message: string; letter: LetterItem }>(
        `/letters/${id}/restore`,
      );
      return response.data;
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          target.status = "APPROVED";
          return { message: "Letter restored from archive", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Approve a letter (Directorate Manager / Administrator)
   */
  async approveLetter(
    id: string,
    comment?: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await approvalService.approveRequest(id, { comment });
      return { ...response, letter: await this.getLetterById(id) };
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          const prevStatus = target.status;
          target.status = "APPROVED";
          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Directorate Manager",
            actorRole: "DEPARTMENT_MANAGER",
            action: "Approved Letter",
            timestamp: new Date().toLocaleString(),
            previousStatus: prevStatus,
            newStatus: "APPROVED",
            comment,
          });
          return { message: "Letter approved successfully.", letter: target };
        }
      }
      throw error;
    }
  },

  /**
   * Reject a letter (Directorate Manager / Administrator)
   */
  async rejectLetter(
    id: string,
    reason: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await approvalService.rejectRequest(id, { reason });
      return { ...response, letter: await this.getLetterById(id) };
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          const prevStatus = target.status;
          target.status = "CHANGES_REQUESTED";
          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Directorate Manager",
            actorRole: "DEPARTMENT_MANAGER",
            action: "Rejected / Returned for Changes",
            timestamp: new Date().toLocaleString(),
            previousStatus: prevStatus,
            newStatus: "CHANGES_REQUESTED",
            comment: reason,
          });
          return {
            message: "Letter rejected and returned for changes.",
            letter: target,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Request changes on a pending letter (Manager / Admin)
   */
  async requestChanges(
    id: string,
    instructions: string,
  ): Promise<{ message: string; letter: LetterItem }> {
    try {
      const response = await approvalService.requestChanges(id, {
        reason: instructions,
      });
      return { ...response, letter: await this.getLetterById(id) };
    } catch (error: any) {
      if (error.code === "ERR_NETWORK" || !error.response) {
        const target = inMemoryLetters.find((l) => l.id === id);
        if (target) {
          const prevStatus = target.status;
          target.status = "CHANGES_REQUESTED";
          if (!target.movements) target.movements = [];
          target.movements.unshift({
            id: `mov-${Date.now()}`,
            actorName: "Reviewer",
            actorRole: "DEPARTMENT_MANAGER",
            action: "Requested Changes",
            timestamp: new Date().toLocaleString(),
            previousStatus: prevStatus,
            newStatus: "CHANGES_REQUESTED",
            comment: instructions,
          });
          return { message: "Changes requested.", letter: target };
        }
      }
      throw error;
    }
  },
};

export default letterService;
