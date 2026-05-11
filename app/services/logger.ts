import {
  accessSync,
  constants,
  createWriteStream,
  type WriteStream,
} from "node:fs";
import { join } from "node:path";
import { Temporal } from "temporal-polyfill";

let logStream: WriteStream | null = null;

const formatTimestamp = (): string => {
  const dt = Temporal.Now.plainDateTimeISO();
  const y = dt.year;
  const mo = String(dt.month).padStart(2, "0");
  const d = String(dt.day).padStart(2, "0");
  const h = String(dt.hour).padStart(2, "0");
  const mi = String(dt.minute).padStart(2, "0");
  const s = String(dt.second).padStart(2, "0");
  return `${y}-${mo}-${d}.${h}-${mi}-${s}`;
};

const formatMessageArgs = (args: unknown[]): string => {
  return args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }
      return JSON.stringify(arg);
    })
    .join(" ");
};

export const logInfo = (...args: unknown[]): void => {
  const message = formatMessageArgs(args);
  console.log(message);
  if (logStream) {
    logStream.write(`[INFO] ${message}\n`);
  }
};

export const logError = (...args: unknown[]): void => {
  const message = formatMessageArgs(args);
  console.error(message);
  const stacks = args
    .filter((arg): arg is Error => arg instanceof Error && !!arg.stack)
    .map((err) => err.stack as string);
  for (const stack of stacks) {
    console.error(stack);
  }
  if (logStream) {
    logStream.write(`[ERROR] ${message}\n`);
    for (const stack of stacks) {
      logStream.write(`[ERROR STACK] ${stack}\n`);
    }
  }
};

export const logWarn = (...args: unknown[]): void => {
  const message = formatMessageArgs(args);
  console.warn(message);
  if (logStream) {
    logStream.write(`[WARN] ${message}\n`);
  }
};

export const initializeLogger = (logDir?: string): void => {
  const targetDir = logDir ?? process.cwd();
  const timestamp = formatTimestamp();
  const logFilePath = join(targetDir, `.gitlab-copilot-ci.${timestamp}.log`);

  try {
    accessSync(targetDir, constants.W_OK);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      console.log(
        `[Logger] Warning: Log directory does not exist: ${targetDir}, skipping log file creation`,
      );
    } else {
      console.log(
        `[Logger] Warning: No write permission in ${targetDir}, skipping log file creation`,
      );
    }
    return;
  }

  logStream = createWriteStream(logFilePath, { flags: "a" });
  logInfo(`Logging enabled: ${logFilePath}`);
};
