import {
  accessSync,
  constants,
  createWriteStream,
  type WriteStream,
} from "node:fs";
import { join } from "node:path";
import type { LogLevel, LogType } from "consola";
import { consola, LogLevels } from "consola";
import { stripAnsi } from "consola/utils";
import { Temporal } from "temporal-polyfill";
import { argv } from "../utils/argv";

let logStream: WriteStream | null = null;

export const writeLogStream = (message: unknown): void => {
  if (!logStream) return;
  logStream.write(`${stripAnsi(String(message))}\n`);
};

const getLogLevel = (value: string | undefined): LogLevel => {
  if (!value || value === "5") return LogLevels.trace;
  const num = parseInt(value, 10);
  if (!Number.isNaN(num)) return num as LogLevel;
  const logType = value.toLowerCase() as LogType;
  return logType in LogLevels ? LogLevels[logType] : LogLevels.trace;
};

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

const formatLogTimestamp = (): string => {
  const dt = Temporal.Now.plainDateTimeISO();
  const y = dt.year;
  const mo = String(dt.month).padStart(2, "0");
  const d = String(dt.day).padStart(2, "0");
  const h = String(dt.hour).padStart(2, "0");
  const mi = String(dt.minute).padStart(2, "0");
  const s = String(dt.second).padStart(2, "0");
  const ms = String(dt.millisecond).padStart(3, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}`;
};

const logger = consola
  .create({
    // throttle: 100,
    formatOptions: {
      date: true,
    },
    level: getLogLevel(argv["log-level"]),
  })
  .addReporter({
    log(logObj) {
      if (!logStream) return;
      const timestamp = formatLogTimestamp();
      const tag = logObj.type.toUpperCase();

      if (logObj.args[0] instanceof Error) {
        writeLogStream(`[\${timestamp}] [${tag}]`);
        writeLogStream(logObj.args[0]);
        writeLogStream(logObj.args[0].stack);
      } else {
        const args = logObj.args
          .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
          .join(" ");
        writeLogStream(`[${timestamp}] [${tag}] ${args}\n`);
      }
    },
  });

const initializeLogFile = (logDir?: string): void => {
  const targetDir = logDir ?? process.cwd();
  const timestamp = formatTimestamp();
  const logFilePath = join(targetDir, `.gitlab-copilot-ci.${timestamp}.log`);

  try {
    accessSync(targetDir, constants.W_OK);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      logger.warn(
        `[Logger] Warning: Log directory does not exist: ${targetDir}, skipping log file creation`,
      );
    } else {
      logger.warn(
        `[Logger] Warning: No write permission in ${targetDir}, skipping log file creation`,
      );
    }
    return;
  }

  logStream = createWriteStream(logFilePath, { flags: "a" });
  logger.info(`Logging enabled: ${logFilePath}`);
};

if (argv["log"]) {
  initializeLogFile(argv["log"] === true ? undefined : argv["log"]);
}

export { logger };
