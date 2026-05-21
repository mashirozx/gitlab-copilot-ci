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
import { argv } from "../utils/argv";
import { formatLocalTimestamp } from "../utils/time";

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
      const timestamp = formatLocalTimestamp({
        includeMilliseconds: true,
        dateTimeSeparator: "T",
        timeSeparator: ":",
      });
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
  const timestamp = formatLocalTimestamp({
    dateTimeSeparator: ".",
    timeSeparator: "-",
  });
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

  logStream = createWriteStream(logFilePath, {
    flags: "a",
  });
  logger.info(`Logging enabled: ${logFilePath}`);
};

if (argv["log"]) {
  initializeLogFile(argv["log"] === true ? undefined : argv["log"]);
}

export { logger };
