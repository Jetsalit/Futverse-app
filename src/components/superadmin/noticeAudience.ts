import type { User, UserRole } from "../../contexts/AuthContext";

export const NOTICE_TITLE_MAX_LENGTH = 120;
export const NOTICE_MESSAGE_MAX_LENGTH = 2_000;
export const NOTICE_BATCH_SIZE = 500;

export type NoticeAudienceKind =
  | "individual"
  | "role"
  | "academy"
  | "academy_role"
  | "all_active";

export interface NoticeAudienceSelection {
  kind: NoticeAudienceKind;
  userId?: string;
  role?: UserRole;
  academyId?: string;
}

export interface NoticeRecipient {
  uid: string;
  name: string;
  email?: string;
  role: UserRole;
  academyId?: string;
}

export interface NoticeSendRequest {
  title: string;
  message: string;
  recipientUids: readonly string[];
  academyId?: string;
}

export interface NoticeBatchResult {
  batchNumber: number;
  requested: number;
  created: number;
  failed: number;
}

export interface NoticeSendSummary {
  requested: number;
  created: number;
  failed: number;
  batches: readonly NoticeBatchResult[];
}

export type NoticeBatchWriter = (recipientUids: readonly string[]) => Promise<number>;

export function validFirebaseUid(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || trimmed.length > 128) return null;
  return trimmed;
}

export function firebaseUidForUser(user: User): string | null {
  return validFirebaseUid(user.id) || validFirebaseUid(user.uid);
}

export function isActiveNoticeUser(user: User): boolean {
  return user.status === "ACTIVE" || user.status === "Active";
}

function loadedAcademyId(
  user: User,
  uid: string,
  academyByUid: ReadonlyMap<string, string>,
): string | undefined {
  const resolved = academyByUid.get(uid) || user.activeAcademyId || user.academyId;
  return typeof resolved === "string" && resolved.trim() ? resolved : undefined;
}

export function listActiveNoticeRecipients(
  users: readonly User[],
  academyByUid: ReadonlyMap<string, string>,
): NoticeRecipient[] {
  const recipients = new Map<string, NoticeRecipient>();

  for (const user of users) {
    if (!isActiveNoticeUser(user)) continue;
    const uid = firebaseUidForUser(user);
    if (!uid || recipients.has(uid)) continue;

    recipients.set(uid, {
      uid,
      name: user.name || user.email || uid,
      email: user.email,
      role: user.role,
      academyId: loadedAcademyId(user, uid, academyByUid),
    });
  }

  return Array.from(recipients.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function resolveNoticeRecipients(
  users: readonly User[],
  selection: NoticeAudienceSelection,
  academyByUid: ReadonlyMap<string, string>,
): NoticeRecipient[] {
  const activeRecipients = listActiveNoticeRecipients(users, academyByUid);

  switch (selection.kind) {
    case "individual":
      return selection.userId
        ? activeRecipients.filter((recipient) => recipient.uid === selection.userId)
        : [];
    case "role":
      return selection.role
        ? activeRecipients.filter((recipient) => recipient.role === selection.role)
        : [];
    case "academy":
      return selection.academyId
        ? activeRecipients.filter((recipient) => recipient.academyId === selection.academyId)
        : [];
    case "academy_role":
      return selection.academyId && selection.role
        ? activeRecipients.filter((recipient) =>
            recipient.academyId === selection.academyId
            && recipient.role === selection.role,
          )
        : [];
    case "all_active":
      return activeRecipients;
  }
}

export function chunkRecipientUids(
  recipientUids: readonly string[],
  batchSize = NOTICE_BATCH_SIZE,
): string[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > NOTICE_BATCH_SIZE) {
    throw new Error(`Notice batch size must be between 1 and ${NOTICE_BATCH_SIZE}.`);
  }

  const uniqueUids = Array.from(new Set(
    recipientUids
      .map((uid) => validFirebaseUid(uid))
      .filter((uid): uid is string => uid !== null),
  ));
  const batches: string[][] = [];

  for (let index = 0; index < uniqueUids.length; index += batchSize) {
    batches.push(uniqueUids.slice(index, index + batchSize));
  }

  return batches;
}

export async function sendNoticeInBatches(
  recipientUids: readonly string[],
  writeBatch: NoticeBatchWriter,
  batchSize = NOTICE_BATCH_SIZE,
): Promise<NoticeSendSummary> {
  const batches = chunkRecipientUids(recipientUids, batchSize);
  const results: NoticeBatchResult[] = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    let created = 0;
    try {
      const reportedCreated = await writeBatch(batch);
      created = Math.max(0, Math.min(batch.length, reportedCreated));
    } catch {
      created = 0;
    }
    results.push({
      batchNumber: index + 1,
      requested: batch.length,
      created,
      failed: batch.length - created,
    });
  }

  return {
    requested: results.reduce((total, result) => total + result.requested, 0),
    created: results.reduce((total, result) => total + result.created, 0),
    failed: results.reduce((total, result) => total + result.failed, 0),
    batches: results,
  };
}
