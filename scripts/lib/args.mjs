/**
 * Table-driven CLI option parser shared by both entry points. Each flag
 * declares the option key it fills and, for value flags, the phrase used in
 * its "requires ..." error; optional `validate` hooks add per-flag checks.
 */
export function parseCliArgs(argv, flags) {
  const args = [...argv];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const spec = flags[arg];

    if (!spec) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!spec.takesValue) {
      options[spec.key] = true;
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      throw new Error(`${arg} requires ${spec.valueDescription}`);
    }
    if (spec.validate) {
      spec.validate(value);
    }
    options[spec.key] = value;
    index += 1;
  }

  return options;
}

export function isoTimestampFlag(flag) {
  return {
    key: "publishedAt",
    takesValue: true,
    valueDescription: "an ISO-8601 timestamp",
    validate: (value) => {
      if (Number.isNaN(Date.parse(value))) {
        throw new Error(`${flag} must be an ISO-8601 timestamp`);
      }
    },
  };
}
