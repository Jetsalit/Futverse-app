import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type NotificationType = "Medical" | "Operations" | "Performance" | "System" | "Coach";
export type NotificationEntityType = "GOAL" | "IDP" | "EVALUATION" | "TRAINING" | "REPORT" | "CLAIM" | "BROADCAST" | "NONE";

export interface AppNotification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt?: any;
  entityType?: NotificationEntityType;
  entityId?: string;
  actionUrl?: string;
  academyId?: string;
}

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = "System",
  entityType?: NotificationEntityType,
  entityId?: string,
  actionUrl?: string,
  academyId?: string
) => {
  if (!userId || typeof userId !== "string") {
    console.warn("createNotification called without valid userId:", userId);
    return;
  }
  try {
    const notificationsRef = collection(db, "notifications");
    await addDoc(notificationsRef, {
      userId,
      title,
      message,
      type,
      isRead: false,
      createdAt: serverTimestamp(),
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(actionUrl && { actionUrl }),
      ...(academyId && { academyId }),
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};
