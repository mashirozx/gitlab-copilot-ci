import { consola } from "consola";

const logger = consola.create({ level: 5 }).addReporter({
  log(logObj) {
    const tag = logObj.type.toUpperCase();
    if (logObj.args[0] instanceof Error) {
      console.log(`[\${timestamp}] [${tag}]`);
      console.log(logObj.args[0]);
      console.log(logObj.args[0].stack);
    } else {
      const tag = logObj.type.toUpperCase();
      const args = logObj.args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      console.log(`[\${timestamp}] [${tag}] ${args}\n`);
    }
  },
});

logger.error("message");
logger.error(new Error("error message"));
