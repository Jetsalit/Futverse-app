export interface ReadOnlySourceViolation {
  filename: string;
  token: string;
  message: string;
}

export class ReadOnlySourceSafetyError extends Error {
  readonly filename: string;
  readonly token: string;

  constructor(violation: ReadOnlySourceViolation) {
    super(violation.message);
    this.name = "ReadOnlySourceSafetyError";
    this.filename = violation.filename;
    this.token = violation.token;
  }
}

interface ProhibitedPattern {
  token: string;
  pattern: RegExp;
  inspectRawSource?: boolean;
}

const PROHIBITED_IDENTIFIERS: ProhibitedPattern[] = [
  { token: "WriteBatch", pattern: /\bWriteBatch\b/ },
  { token: "BulkWriter", pattern: /\bBulkWriter\b/ },
  { token: "Transaction", pattern: /\bTransaction\b/ },
  { token: "FieldValue", pattern: /\bFieldValue\b/ },
  { token: "setDoc", pattern: /\bsetDoc\b/ },
  { token: "addDoc", pattern: /\baddDoc\b/ },
  { token: "updateDoc", pattern: /\bupdateDoc\b/ },
  { token: "deleteDoc", pattern: /\bdeleteDoc\b/ },
  { token: "writeBatch", pattern: /\bwriteBatch\b/ },
  { token: "runTransaction", pattern: /\brunTransaction\b/ },
  { token: "recursiveDelete", pattern: /\brecursiveDelete\b/ },
  { token: "collectionGroup", pattern: /\bcollectionGroup\b/ },
  { token: "importDocuments", pattern: /\bimportDocuments\b/ },
  { token: "exportDocuments", pattern: /\bexportDocuments\b/ },
  {
    token: ["firebase-admin", "auth"].join("/"),
    pattern: /["']firebase-admin\/auth["']/,
    inspectRawSource: true,
  },
  { token: "getAuth", pattern: /\bgetAuth\b/ },
  { token: "createUser", pattern: /\bcreateUser\b/ },
  { token: "updateUser", pattern: /\bupdateUser\b/ },
  { token: "deleteUser", pattern: /\bdeleteUser\b/ },
  { token: "deleteUsers", pattern: /\bdeleteUsers\b/ },
  { token: "importUsers", pattern: /\bimportUsers\b/ },
  { token: "setCustomUserClaims", pattern: /\bsetCustomUserClaims\b/ },
  { token: "revokeRefreshTokens", pattern: /\brevokeRefreshTokens\b/ },
  { token: "createUserWithEmailAndPassword", pattern: /\bcreateUserWithEmailAndPassword\b/ },
  { token: "updateProfile", pattern: /\bupdateProfile\b/ },
  { token: "updateEmail", pattern: /\bupdateEmail\b/ },
  { token: "updatePassword", pattern: /\bupdatePassword\b/ },
  {
    token: ["firebase", "auth"].join("/"),
    pattern: /["']firebase\/auth["']/,
    inspectRawSource: true,
  },
  {
    token: ["firebase-admin", "storage"].join("/"),
    pattern: /["']firebase-admin\/storage["']/,
    inspectRawSource: true,
  },
  { token: "getStorage", pattern: /\bgetStorage\b/ },
  { token: "upload", pattern: /\bupload\b/ },
  { token: "uploadBytes", pattern: /\buploadBytes\b/ },
  { token: "uploadString", pattern: /\buploadString\b/ },
  { token: "createWriteStream", pattern: /\bcreateWriteStream\b/ },
  { token: "setMetadata", pattern: /\bsetMetadata\b/ },
  { token: "deleteFiles", pattern: /\bdeleteFiles\b/ },
  { token: "uploadBytesResumable", pattern: /\buploadBytesResumable\b/ },
  { token: "deleteObject", pattern: /\bdeleteObject\b/ },
  { token: "updateMetadata", pattern: /\bupdateMetadata\b/ },
  {
    token: ["firebase", "storage"].join("/"),
    pattern: /["']firebase\/storage["']/,
    inspectRawSource: true,
  },
  {
    token: ["@google-cloud", "storage"].join("/"),
    pattern: /["']@google-cloud\/storage["']/,
    inspectRawSource: true,
  },
];

const PROHIBITED_MEMBER_METHODS = [
  "set",
  "create",
  "update",
  "delete",
  "add",
  "batch",
  "commit",
  "transaction",
  "save",
  "copy",
  "move",
  "compose",
  "makePublic",
  "makePrivate",
  "setStorageClass",
] as const;

function stripCommentsAndLiterals(source: string): string {
  let result = "";
  let index = 0;
  let templateExpressionDepth = 0;
  let state: "CODE" | "SINGLE" | "DOUBLE" | "TEMPLATE" | "REGEX" | "LINE_COMMENT" | "BLOCK_COMMENT" = "CODE";
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "CODE") {
      if (character === "/" && next === "/") {
        result += "  ";
        index += 2;
        state = "LINE_COMMENT";
        continue;
      }
      if (character === "/" && next === "*") {
        result += "  ";
        index += 2;
        state = "BLOCK_COMMENT";
        continue;
      }
      if (character === "/" && slashStartsRegularExpression(result)) state = "REGEX";
      if (character === "'") state = "SINGLE";
      else if (character === '"') state = "DOUBLE";
      else if (character === "`") state = "TEMPLATE";
      result += state === "CODE" ? character : " ";
      index += 1;
      if (state === "CODE" && templateExpressionDepth > 0) {
        if (character === "{") templateExpressionDepth += 1;
        else if (character === "}") {
          templateExpressionDepth -= 1;
          if (templateExpressionDepth === 0) state = "TEMPLATE";
        }
      }
      continue;
    }
    if (state === "LINE_COMMENT") {
      if (character === "\n") {
        result += "\n";
        state = "CODE";
      } else result += " ";
      index += 1;
      continue;
    }
    if (state === "BLOCK_COMMENT") {
      if (character === "*" && next === "/") {
        result += "  ";
        index += 2;
        state = "CODE";
      } else {
        result += character === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (character === "\\") {
      result += next === "\n" ? " \n" : "  ";
      index += Math.min(2, source.length - index);
      continue;
    }
    if (state === "TEMPLATE" && character === "$" && next === "{") {
      result += " ${";
      index += 2;
      templateExpressionDepth = 1;
      state = "CODE";
      continue;
    }
    const closesLiteral = (state === "SINGLE" && character === "'")
      || (state === "DOUBLE" && character === '"')
      || (state === "TEMPLATE" && character === "`")
      || (state === "REGEX" && character === "/");
    result += character === "\n" ? "\n" : " ";
    index += 1;
    if (closesLiteral) state = "CODE";
  }
  return result;
}

function slashStartsRegularExpression(sourceBeforeSlash: string): boolean {
  const trimmed = sourceBeforeSlash.trimEnd();
  if (trimmed.length === 0) return true;
  const previousCharacter = trimmed[trimmed.length - 1];
  if ("=(:,[!&|?{};".includes(previousCharacter)) return true;
  return /\b(?:return|case|throw|else|do|typeof|instanceof|in|of|yield|await)$/.test(trimmed);
}

function nativeCollectionDeclaration(
  sourceWithoutLiterals: string,
  receiver: string,
  expectedConstructor: "Map" | "Set",
): boolean {
  const escapedReceiver = receiver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\bconst\\s+${escapedReceiver}(?:\\s*:[^=;]+)?\\s*=\\s*new\\s+${expectedConstructor}(?:\\s*<[^;]+?>)?\\s*\\(`,
  ).test(sourceWithoutLiterals);
}

function isNarrowNativeCollectionOperation(
  sourceWithoutLiterals: string,
  memberCallIndex: number,
  method: string,
): boolean {
  if (method !== "set" && method !== "add") return false;
  const prefix = sourceWithoutLiterals.slice(0, memberCallIndex);
  const receiverMatch = prefix.match(/([A-Za-z_$][\w$]*)\s*$/);
  if (!receiverMatch) return false;
  return nativeCollectionDeclaration(
    sourceWithoutLiterals,
    receiverMatch[1],
    method === "set" ? "Map" : "Set",
  );
}

function violation(filename: string, token: string): ReadOnlySourceViolation {
  return {
    filename,
    token,
    message: `Read-only safety error in ${filename}: prohibited token or method ${token}.`,
  };
}

export function findReadOnlySourceViolations(
  filename: string,
  source: string,
): ReadOnlySourceViolation[] {
  const sourceWithoutLiterals = stripCommentsAndLiterals(source);
  const violations: ReadOnlySourceViolation[] = [];
  for (const prohibited of PROHIBITED_IDENTIFIERS) {
    const inspectedSource = prohibited.inspectRawSource ? source : sourceWithoutLiterals;
    if (prohibited.pattern.test(inspectedSource)) {
      violations.push(violation(filename, prohibited.token));
    }
  }

  const memberPattern = /\.\s*(set|create|update|delete|add|batch|commit|transaction|save|copy|move|compose|makePublic|makePrivate|setStorageClass)\s*\(/g;
  for (const match of sourceWithoutLiterals.matchAll(memberPattern)) {
    const method = match[1] as typeof PROHIBITED_MEMBER_METHODS[number];
    if (isNarrowNativeCollectionOperation(sourceWithoutLiterals, match.index ?? 0, method)) continue;
    violations.push(violation(filename, `.${method}()`));
  }
  return violations;
}

export function assertReadOnlyExecutableSource(filename: string, source: string): void {
  const violations = findReadOnlySourceViolations(filename, source);
  if (violations.length > 0) throw new ReadOnlySourceSafetyError(violations[0]);
}
