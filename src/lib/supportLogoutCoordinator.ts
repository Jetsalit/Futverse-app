type AsyncSupportExit = () => Promise<void>;

let nonStaffSupportExit: AsyncSupportExit | null = null;

export function registerNonStaffSupportLogoutExit(exit: AsyncSupportExit): () => void {
  nonStaffSupportExit = exit;
  return () => {
    if (nonStaffSupportExit === exit) {
      nonStaffSupportExit = null;
    }
  };
}

export async function closeSupportSessionsBeforeAuthLogout(): Promise<void> {
  if (nonStaffSupportExit) {
    await nonStaffSupportExit();
  }
}
