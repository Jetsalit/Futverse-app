import { collection, addDoc, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { NotificationType, NotificationEntityType, AppNotification } from "../lib/notifications";

export interface CreateNotificationPayload {
  title: string;
  message: string;
  type: NotificationType;
  entityType?: NotificationEntityType;
  entityId?: string;
  actionUrl?: string;
  academyId?: string;
}

/**
 * Clean and deduplicate recipient UIDs.
 * Ensures only non-empty, truthy Firebase Auth UIDs are processed, stripping duplicates.
 */
export const deduplicateRecipients = (uids: (string | undefined | null)[]): string[] => {
  return Array.from(new Set(uids.filter(Boolean) as string[]));
};

/**
 * Send notification to multiple recipients using writeBatch with de-duplication.
 * Prevents multiple messages to the same parent/user in a single event.
 */
export const emitToRecipients = async (
  recipientUids: (string | undefined | null)[],
  payload: CreateNotificationPayload
): Promise<number> => {
  const cleanUids = deduplicateRecipients(recipientUids);
  if (cleanUids.length === 0) {
    console.warn("notificationService.emitToRecipients: No valid Auth UIDs found after deduplication.");
    return 0;
  }

  try {
    const batch = writeBatch(db);
    let count = 0;
    
    cleanUids.forEach((uid) => {
      if (count >= 500) return; // Firestore batch limit protection
      const newRef = doc(collection(db, "notifications"));
      batch.set(newRef, {
        userId: uid,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        isRead: false,
        createdAt: serverTimestamp(),
        ...(payload.entityType && { entityType: payload.entityType }),
        ...(payload.entityId && { entityId: payload.entityId }),
        ...(payload.actionUrl && { actionUrl: payload.actionUrl }),
        ...(payload.academyId && { academyId: payload.academyId }),
      });
      count++;
    });

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (error) {
    console.error("Error committing batch notifications in notificationService:", error);
    return 0;
  }
};

/**
 * Single notification creation wrapper using the deduplication & validation pipeline.
 */
export const createSingleNotification = async (
  userId: string | undefined | null,
  payload: CreateNotificationPayload
): Promise<boolean> => {
  const count = await emitToRecipients([userId], payload);
  return count > 0;
};

// ============================================================================
// EVENT DOMAIN HELPERS (Ready for Phase 3.6.3B and 3.6.3C)
// ============================================================================

export const notificationService = {
  deduplicateRecipients,
  emitToRecipients,
  createSingleNotification,

  // Event 1: Goal Needs Revision
  notifyGoalNeedsRevision: (recipientUids: (string | undefined | null)[], reason: string, goalId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "เป้าหมายต้องปรับแก้ไข (Goal Revision Needed)",
      message: `โค้ชส่งเป้าหมายกลับให้ปรับแก้: ${reason}`,
      type: "Coach",
      entityType: "GOAL",
      entityId: goalId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 2: Goal Approved -> IDP
  notifyGoalApproved: (recipientUids: (string | undefined | null)[], goalId?: string, idpId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "เป้าหมายได้รับการอนุมัติ (Goal Approved)",
      message: "เป้าหมายของคุณได้รับเลือกและสร้างเป็นแผน IDP แล้ว",
      type: "Performance",
      entityType: idpId ? "IDP" : "GOAL",
      entityId: idpId || goalId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 3: Goal Proposed (Player -> Coach)
  notifyGoalProposed: (coachUids: (string | undefined | null)[], playerName: string, goalId?: string, academyId?: string) =>
    emitToRecipients(coachUids, {
      title: "เป้าหมายใหม่รอการพิจารณา (Goal Proposed)",
      message: `นักกีฬา ${playerName} ได้เสนอหรือส่งกลับแก้ไขเป้าหมายเพื่อรอการทบทวน`,
      type: "Coach",
      entityType: "GOAL",
      entityId: goalId,
      actionUrl: "idp_manager",
      academyId
    }),

  // Event 4: Goal Rejected
  notifyGoalRejected: (recipientUids: (string | undefined | null)[], reason?: string, goalId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "เป้าหมายไม่ผ่านการคัดเลือก (Goal Rejected)",
      message: reason ? `เหตุผลจากโค้ช: ${reason}` : "เป้าหมายของคุณยังไม่สอดคล้องกับการฝึกซ้อมในปัจจุบัน กรุณาตั้งเป้าหมายใหม่",
      type: "Coach",
      entityType: "GOAL",
      entityId: goalId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 5: Evaluation Created
  notifyEvaluationCreated: (recipientUids: (string | undefined | null)[], evalId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "ผลการประเมินใหม่ (New Evaluation Available)",
      message: "โค้ชได้ประเมินทักษะของนักกีฬารอบล่าสุดเรียบร้อยแล้ว",
      type: "Performance",
      entityType: "EVALUATION",
      entityId: evalId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 6: IDP Created / Activated
  notifyIDPCreated: (recipientUids: (string | undefined | null)[], title: string, idpId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "แผนพัฒนารายคนเริ่มใช้งาน (New IDP Active)",
      message: `แผนการฝึกซ้อม: ${title} ได้รับการประกาศใช้แล้ว`,
      type: "Performance",
      entityType: "IDP",
      entityId: idpId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 7: Training Verified
  notifyTrainingVerified: (recipientUids: (string | undefined | null)[], hours?: number, title?: string, logId?: string, academyId?: string) =>
    emitToRecipients(recipientUids, {
      title: "ยืนยันชั่วโมงซ้อมเรียบร้อย (Training Verified ✓)",
      message: `โค้ชได้รับรองการฝึกซ้อม${title ? `: ${title}` : ""}${hours ? ` (${hours} ชั่วโมง)` : ""} เรียบร้อยแล้ว`,
      type: "Operations",
      entityType: "TRAINING",
      entityId: logId,
      actionUrl: "dashboard",
      academyId
    }),

  // Event 8: Report Ready
  notifyReportReady: (parentUids: (string | undefined | null)[], title: string, reportId?: string, academyId?: string) =>
    emitToRecipients(parentUids, {
      title: "รายงานวิวัฒนาการใหม่ (Development Report Ready)",
      message: `รายงาน ${title} พร้อมให้ผู้ปกครองเข้าอ่านแล้ว`,
      type: "System",
      entityType: "REPORT",
      entityId: reportId,
      actionUrl: "/report",
      academyId
    }),

  // Event 9: Claim Approved/Rejected & Broadcasts
  notifyClaimApproved: (userId: string, role: string) =>
    emitToRecipients([userId], {
      title: "Profile Claim Approved",
      message: "Your player profile has been successfully linked.",
      type: "System",
      entityType: "CLAIM",
      actionUrl: role === "PARENT" ? "dashboard" : "dashboard"
    }),

  notifyClaimRejected: (userId: string) =>
    emitToRecipients([userId], {
      title: "Profile Claim Rejected",
      message: "Your player profile claim was rejected. Please contact the coach.",
      type: "System",
      entityType: "CLAIM"
    }),

  notifyBroadcast: (recipientUids: (string | undefined | null)[], title: string, message: string, type: NotificationType = "System", actionUrl?: string) =>
    emitToRecipients(recipientUids, {
      title,
      message,
      type,
      entityType: "BROADCAST",
      actionUrl: actionUrl || "dashboard"
    }),
};
export default notificationService;
