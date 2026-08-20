import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const current = readFileSync(rulesPath, "utf8");

const before = `    match /{associationPath=**}/playerAssociations/{playerId} {
      allow list: if isSignedIn()
        && resource.data.userId == request.auth.uid;
    }`;

const after = `    match /{associationPath=**}/playerAssociations/{playerId} {
      allow list: if isSuperAdmin()
        || (
          isSignedIn()
          && resource.data.userId == request.auth.uid
        );
    }`;

const occurrences = current.split(before).length - 1;
if (occurrences !== 1) {
  throw new Error(
    `Guarded patch aborted: expected exactly 1 recursive playerAssociations rule, found ${occurrences}.`,
  );
}

const next = current.replace(before, after);
if (next === current) {
  throw new Error("Guarded patch aborted: firestore.rules was not changed.");
}

writeFileSync(rulesPath, next, "utf8");
console.log("Applied guarded ACTIVE SUPERADMIN collection-group read rule.");
console.log("No create/update/delete rule was changed.");
