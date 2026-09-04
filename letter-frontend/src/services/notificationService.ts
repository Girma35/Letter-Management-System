import api from "./api";
import { NotificationItem, PaginatedNotificationsResponse } from "@/types/notification";

let mockNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    message: "Internal memo DOC-2026-012 has been approved by Directorate Manager.",
    type: "LETTER_APPROVED",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    letterId: "ltr-012",
    referenceNumber: "DOC-2026-012",
    letterTitle: "Request for materials checkup",
    entityType: "LETTER",
    entityId: "ltr-012",
  },
  {
    id: "notif-2",
    message: "New incoming letter registered: LMS/INC/2026/00124",
    type: "LETTER_REGISTERED",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    letterId: "ltr-001",
    referenceNumber: "LMS/INC/2026/00124",
    letterTitle: "Infrastructure Expansion Proposal",
    entityType: "LETTER",
    entityId: "ltr-001",
  },
  {
    id: "notif-3",
    message: "Administrative Action: Route incoming letter to destination directorate.",
    type: "LETTER_AWAITING_ROUTING",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    letterId: "ltr-002",
    referenceNumber: "IN/2026/00452",
    letterTitle: "Budget Allocation Request",
    entityType: "LETTER",
    entityId: "ltr-002",
  },
  {
    id: "notif-4",
    message: "Response draft submitted for review: OUT/2026/0089",
    type: "DOCUMENT_SUBMITTED",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    letterId: "ltr-003",
    referenceNumber: "OUT/2026/0089",
    letterTitle: "Quarterly Performance Report",
    entityType: "APPROVAL",
    entityId: "ltr-003",
  },
];

export const notificationService = {
  /**
   * Get notifications for the authenticated user via backend API with offline fallback
   */
  async getNotifications(params?: {
    page?: number;
    limit?: number;
    read?: "all" | "read" | "unread";
  }): Promise<PaginatedNotificationsResponse> {
    try {
      const response = await api.get<PaginatedNotificationsResponse>(
        "/notifications",
        { params },
      );
      return response.data;
    } catch (error: any) {
      console.warn("[notificationService] API request failed, using fallback:", error?.message);
      
      let filtered = [...mockNotifications];
      if (params?.read === "unread") {
        filtered = filtered.filter((n) => !n.isRead);
      } else if (params?.read === "read") {
        filtered = filtered.filter((n) => n.isRead);
      }

      const page = params?.page || 1;
      const limit = params?.limit || 20;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);

      return {
        data: paginated,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      };
    }
  },

  /**
   * Mark an individual notification as read via backend API with fallback
   */
  async markAsRead(id: string): Promise<{ message: string }> {
    try {
      const response = await api.post<{ message: string }>(
        `/notifications/${id}/read`,
      );
      return response.data;
    } catch {
      mockNotifications = mockNotifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      return { message: "Notification marked as read." };
    }
  },

  /**
   * Mark all notifications as read via backend API with fallback
   */
  async markAllAsRead(): Promise<{ message: string }> {
    try {
      const response = await api.post<{ message: string }>(
        "/notifications/read-all",
      );
      return response.data;
    } catch {
      mockNotifications = mockNotifications.map((n) => ({ ...n, isRead: true }));
      return { message: "All notifications marked as read." };
    }
  },

  /**
   * Get unread count with fallback
   */
  async getUnreadCount(): Promise<number> {
    try {
      const response = await api.get<{ count: number }>(
        "/notifications/unread-count",
      );
      return response.data.count;
    } catch {
      return mockNotifications.filter((n) => !n.isRead).length;
    }
  },
};

export default notificationService;
