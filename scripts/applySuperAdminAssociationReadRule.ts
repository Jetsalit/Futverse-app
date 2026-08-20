import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const current = readFileSync(rulesPath, "utf8");

// Windows checkouts may use CRLF even when the repository blob uses LF.
// Build the guarded match using the file's actual newline convention so the
// patch remains exact without normalizing or rewriting unrelated Rules lines.
const newline = current.includes("\r\n") ? "\r\n" : "\n";

const before = [
  "    match /{associationPath=**}/playerAssociations/{playerId} {",
  "      allow list: if isSignedIn()",
  "        && resource.data.userId == request.auth.uid;",
  "    }",
].join(newline);

const after = [
  "    match /{associationPath=**}/playerAssociations/{playerId} {",
  "      allow list: if isSuperAdmin()",
  "        || (",
  "          isSignedIn()",
  "          && resource.data.userId == request.auth.uid",
  "        );",
  "    }",
].join(newline);

const beforeOccurrences = current.split(before).length - 1;
const afterOccurrences = current.split(after).length - 1;

if (beforeOccurrences === 0 && afterOccurrences === 1) {
  console.log("ACTIVE SUPERADMIN collection-group read rule is already applied.");
  console.log(`Preserved ${newline === "\r\n" ? "CRLF" : "LF"} line endings.`);
  console.log("No file changes were needed.");
  process.exit(0);
}

if (beforeOccurrences !== 1 || afterOccurrences !== 0) {
  throw new Error(
    `Guarded patch aborted: expected exactly 1 unapplied rule and 0 applied rules, found ${beforeOccurrences} unapplied and ${afterOccurrences} applied.`,
  );
}

const next = current.replace(before, after);
if (next === current) {
  throw new Error("Guarded patch aborted: firestore.rules was not changed.");
}

writeFileSync(rulesPath, next, "utf8");
console.log("Applied guarded ACTIVE SUPERADMIN collection-group read rule.");
console.log(`Preserved ${newline === "\r\n" ? "CRLF" : "LF"} line endings.`);
console.log("No create/update/delete rule was changed.");
