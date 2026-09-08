export const FORBIDDEN_LOCAL_OPERATOR_ARGUMENT_REGEX =
  /^--(?:requester|operator|superadmin|admin|caller)(?:[-_]?(?:uid))?$/i;

export function assertNoLocalOperatorCliOverride(argv: string[]): void {
  for (const arg of argv) {
    const flag = arg.split("=")[0];
    if (FORBIDDEN_LOCAL_OPERATOR_ARGUMENT_REGEX.test(flag)) {
      throw new Error(
        `Security Violation: '${flag}' is forbidden. Trusted local operator identity must come exclusively from FUTVERSE_LOCAL_OPERATOR_UID.`,
      );
    }
  }
}

export function readRequiredFlag(
  argv: string[],
  acceptedFlags: readonly string[],
): string {
  let found: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const equalsIndex = raw.indexOf("=");
    const flag = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    if (!acceptedFlags.includes(flag)) continue;

    const value = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : argv[index + 1];
    if (!value || value.startsWith("--") || value.trim().length === 0) {
      throw new Error(`Missing required value for '${flag}'`);
    }
    if (found !== undefined) {
      throw new Error(`Duplicate option for '${acceptedFlags[0]}'`);
    }
    found = value;
  }

  if (found === undefined) {
    throw new Error(`Missing required option: ${acceptedFlags[0]}`);
  }
  return found;
}

export function hasFlag(argv: string[], acceptedFlags: readonly string[]): boolean {
  return argv.some((arg) => acceptedFlags.includes(arg.split("=")[0]));
}

export function assertOnlyKnownFlags(
  argv: string[],
  flagsWithValue: readonly string[],
  booleanFlags: readonly string[],
): void {
  const allowed = new Set([...flagsWithValue, ...booleanFlags]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected positional argument '${raw}'`);
    }
    const equalsIndex = raw.indexOf("=");
    const flag = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    if (!allowed.has(flag)) {
      throw new Error(`Unknown or unrecognized flag '${flag}'`);
    }
    if (equalsIndex < 0 && flagsWithValue.includes(flag)) {
      index += 1;
      if (index >= argv.length || argv[index].startsWith("--")) {
        throw new Error(`Missing required value for '${flag}'`);
      }
    }
  }
}
