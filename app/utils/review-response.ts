import type {
  ReviewChangeEntity,
  ReviewItemEntity,
  ReviewRankEntity,
  ReviewResponseEntity,
  ReviewRuntimeStatsEntity,
  ReviewSuggestionEntity,
  ReviewUsageEntity,
  RuntimeStatsAvailabilityEntity,
} from "../types/review.types";

const VALID_REVIEW_RANKS = new Set<ReviewRankEntity>(["HIGH", "MEDIUM", "LOW"]);
const VALID_RUNTIME_STATS_AVAILABILITY =
  new Set<RuntimeStatsAvailabilityEntity>([
    "best-effort",
    "supported",
    "unsupported",
  ]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const pushValidationError = ({
  errors,
  path,
  issue,
}: {
  errors: string[];
  path: string;
  issue: string;
}): void => {
  errors.push(`[Validation] ${path}: ${issue}`);
};

const isReviewRank = (value: unknown): value is ReviewRankEntity => {
  return (
    typeof value === "string" &&
    VALID_REVIEW_RANKS.has(value as ReviewRankEntity)
  );
};

const isRuntimeStatsAvailability = (
  value: unknown,
): value is RuntimeStatsAvailabilityEntity => {
  return (
    typeof value === "string" &&
    VALID_RUNTIME_STATS_AVAILABILITY.has(
      value as RuntimeStatsAvailabilityEntity,
    )
  );
};

const normalizeRuntimeStatsAvailability = ({
  value,
}: {
  value: unknown;
}): RuntimeStatsAvailabilityEntity => {
  return isRuntimeStatsAvailability(value) ? value : "unsupported";
};

const getOptionalFiniteNumber = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  pushValidationError({
    errors,
    path,
    issue: "expected a finite number",
  });
  return undefined;
};

const getOptionalString = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  pushValidationError({
    errors,
    path,
    issue: "expected a string",
  });
  return undefined;
};

const normalizeLocalizedStringRecord = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): Record<string, string> => {
  if (value === undefined) {
    return {};
  }

  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object keyed by language",
    });
    return {};
  }

  const normalizedEntries = Object.entries(value).flatMap(
    ([language, entry]) => {
      if (typeof entry !== "string") {
        pushValidationError({
          errors,
          path: `${path}.${language}`,
          issue: "expected a string",
        });
        return [];
      }

      return [[language, entry] as const];
    },
  );

  return Object.fromEntries(normalizedEntries);
};

const normalizeChangeEntity = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): ReviewChangeEntity | null => {
  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object",
    });
    return null;
  }

  if (typeof value.step !== "string") {
    pushValidationError({
      errors,
      path: `${path}.step`,
      issue: "expected a string",
    });
    return null;
  }

  if (!Array.isArray(value.layers)) {
    pushValidationError({
      errors,
      path: `${path}.layers`,
      issue: "expected an array",
    });
    return null;
  }

  const layers = value.layers.flatMap((layer, index) => {
    const layerPath = `${path}.layers[${index}]`;

    if (!isPlainRecord(layer)) {
      pushValidationError({
        errors,
        path: layerPath,
        issue: "expected an object",
      });
      return [];
    }

    if (typeof layer.title !== "string") {
      pushValidationError({
        errors,
        path: `${layerPath}.title`,
        issue: "expected a string",
      });
      return [];
    }

    if (!Array.isArray(layer.files)) {
      pushValidationError({
        errors,
        path: `${layerPath}.files`,
        issue: "expected an array of strings",
      });
      return [];
    }

    if (typeof layer.summary !== "string") {
      pushValidationError({
        errors,
        path: `${layerPath}.summary`,
        issue: "expected a string",
      });
      return [];
    }

    const files = layer.files.flatMap((file, fileIndex) => {
      if (typeof file !== "string") {
        pushValidationError({
          errors,
          path: `${layerPath}.files[${fileIndex}]`,
          issue: "expected a string",
        });
        return [];
      }

      return [file];
    });

    return [
      {
        title: layer.title,
        files,
        summary: layer.summary,
      },
    ];
  });

  return {
    step: value.step,
    layers,
  };
};

const normalizeChanges = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): Array<Record<string, ReviewChangeEntity>> => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an array",
    });
    return [];
  }

  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (!isPlainRecord(entry)) {
      pushValidationError({
        errors,
        path: entryPath,
        issue: "expected an object keyed by language",
      });
      return [];
    }

    const normalizedEntry = Object.entries(entry).flatMap(
      ([language, change]) => {
        const normalizedChange = normalizeChangeEntity({
          value: change,
          path: `${entryPath}.${language}`,
          errors,
        });

        return normalizedChange ? [[language, normalizedChange] as const] : [];
      },
    );

    return normalizedEntry.length > 0
      ? [Object.fromEntries(normalizedEntry)]
      : [];
  });
};

const normalizeSuggestionRecord = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): Record<string, ReviewSuggestionEntity> => {
  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object keyed by language",
    });
    return {};
  }

  const normalizedEntries = Object.entries(value).flatMap(
    ([language, suggestion]) => {
      const suggestionPath = `${path}.${language}`;

      if (!isPlainRecord(suggestion)) {
        pushValidationError({
          errors,
          path: suggestionPath,
          issue: "expected an object",
        });
        return [];
      }

      if (typeof suggestion.detail !== "string") {
        pushValidationError({
          errors,
          path: `${suggestionPath}.detail`,
          issue: "expected a string",
        });
        return [];
      }

      if (typeof suggestion.abstract !== "string") {
        pushValidationError({
          errors,
          path: `${suggestionPath}.abstract`,
          issue: "expected a string",
        });
        return [];
      }

      return [
        [
          language,
          {
            detail: suggestion.detail,
            abstract: suggestion.abstract,
          },
        ] as const,
      ];
    },
  );

  return Object.fromEntries(normalizedEntries);
};

const normalizeReviewItem = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): ReviewItemEntity | null => {
  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object",
    });
    return null;
  }

  if (typeof value.file_path !== "string") {
    pushValidationError({
      errors,
      path: `${path}.file_path`,
      issue: "expected a string",
    });
    return null;
  }

  const suggestions = normalizeSuggestionRecord({
    value: value.suggestions,
    path: `${path}.suggestions`,
    errors,
  });

  const normalizedRank: ReviewRankEntity | undefined =
    value.rank === undefined
      ? undefined
      : isReviewRank(value.rank)
        ? value.rank
        : (() => {
            pushValidationError({
              errors,
              path: `${path}.rank`,
              issue: "expected one of HIGH, MEDIUM, LOW",
            });
            return undefined;
          })();

  return {
    file_path: value.file_path,
    new_line: getOptionalFiniteNumber({
      value: value.new_line,
      path: `${path}.new_line`,
      errors,
    }),
    old_line: getOptionalFiniteNumber({
      value: value.old_line,
      path: `${path}.old_line`,
      errors,
    }),
    diff_file: getOptionalString({
      value: value.diff_file,
      path: `${path}.diff_file`,
      errors,
    }),
    diff_line_code: getOptionalString({
      value: value.diff_line_code,
      path: `${path}.diff_line_code`,
      errors,
    }),
    rank: normalizedRank,
    suggestions,
  };
};

const normalizeReviews = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): ReviewItemEntity[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an array",
    });
    return [];
  }

  return value.flatMap((entry, index) => {
    const normalizedReview = normalizeReviewItem({
      value: entry,
      path: `${path}[${index}]`,
      errors,
    });

    return normalizedReview ? [normalizedReview] : [];
  });
};

const normalizeErrors = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an array of strings",
    });
    return [];
  }

  return value.flatMap((entry, index) => {
    if (typeof entry !== "string") {
      pushValidationError({
        errors,
        path: `${path}[${index}]`,
        issue: "expected a string",
      });
      return [];
    }

    return [entry];
  });
};

const normalizeUsage = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): ReviewUsageEntity | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object",
    });
    return undefined;
  }

  const cost = isPlainRecord(value.cost)
    ? {
        input: getOptionalFiniteNumber({
          value: value.cost.input,
          path: `${path}.cost.input`,
          errors,
        }),
        output: getOptionalFiniteNumber({
          value: value.cost.output,
          path: `${path}.cost.output`,
          errors,
        }),
        cacheRead: getOptionalFiniteNumber({
          value: value.cost.cacheRead,
          path: `${path}.cost.cacheRead`,
          errors,
        }),
        cacheWrite: getOptionalFiniteNumber({
          value: value.cost.cacheWrite,
          path: `${path}.cost.cacheWrite`,
          errors,
        }),
        total: getOptionalFiniteNumber({
          value: value.cost.total,
          path: `${path}.cost.total`,
          errors,
        }),
      }
    : value.cost === undefined
      ? undefined
      : (() => {
          pushValidationError({
            errors,
            path: `${path}.cost`,
            issue: "expected an object",
          });
          return undefined;
        })();

  return {
    input: getOptionalFiniteNumber({
      value: value.input,
      path: `${path}.input`,
      errors,
    }),
    output: getOptionalFiniteNumber({
      value: value.output,
      path: `${path}.output`,
      errors,
    }),
    cacheRead: getOptionalFiniteNumber({
      value: value.cacheRead,
      path: `${path}.cacheRead`,
      errors,
    }),
    cacheWrite: getOptionalFiniteNumber({
      value: value.cacheWrite,
      path: `${path}.cacheWrite`,
      errors,
    }),
    totalTokens: getOptionalFiniteNumber({
      value: value.totalTokens,
      path: `${path}.totalTokens`,
      errors,
    }),
    aiCredits: getOptionalFiniteNumber({
      value: value.aiCredits,
      path: `${path}.aiCredits`,
      errors,
    }),
    reasoningTokens: getOptionalFiniteNumber({
      value: value.reasoningTokens,
      path: `${path}.reasoningTokens`,
      errors,
    }),
    cost,
  };
};

const normalizeRuntimeStats = ({
  value,
  path,
  errors,
}: {
  value: unknown;
  path: string;
  errors: string[];
}): ReviewRuntimeStatsEntity | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    pushValidationError({
      errors,
      path,
      issue: "expected an object",
    });
    return undefined;
  }

  if (!isPlainRecord(value.parent)) {
    pushValidationError({
      errors,
      path: `${path}.parent`,
      issue: "expected an object",
    });
    return undefined;
  }

  if (!isPlainRecord(value.agent)) {
    pushValidationError({
      errors,
      path: `${path}.agent`,
      issue: "expected an object",
    });
    return undefined;
  }

  if (!isPlainRecord(value.capabilities)) {
    pushValidationError({
      errors,
      path: `${path}.capabilities`,
      issue: "expected an object",
    });
    return undefined;
  }

  const notes = Array.isArray(value.capabilities.notes)
    ? value.capabilities.notes.flatMap((entry, index) => {
        if (typeof entry !== "string") {
          pushValidationError({
            errors,
            path: `${path}.capabilities.notes[${index}]`,
            issue: "expected a string",
          });
          return [];
        }

        return [entry];
      })
    : value.capabilities.notes === undefined
      ? undefined
      : (() => {
          pushValidationError({
            errors,
            path: `${path}.capabilities.notes`,
            issue: "expected an array of strings",
          });
          return undefined;
        })();

  return {
    platform:
      typeof value.platform === "string"
        ? (value.platform as NodeJS.Platform)
        : process.platform,
    sampleCount:
      getOptionalFiniteNumber({
        value: value.sampleCount,
        path: `${path}.sampleCount`,
        errors,
      }) ?? 0,
    sampleIntervalMs:
      getOptionalFiniteNumber({
        value: value.sampleIntervalMs,
        path: `${path}.sampleIntervalMs`,
        errors,
      }) ?? 0,
    parent: {
      peakRssBytes: getOptionalFiniteNumber({
        value: value.parent.peakRssBytes,
        path: `${path}.parent.peakRssBytes`,
        errors,
      }),
      peakHeapUsedBytes: getOptionalFiniteNumber({
        value: value.parent.peakHeapUsedBytes,
        path: `${path}.parent.peakHeapUsedBytes`,
        errors,
      }),
      peakExternalBytes: getOptionalFiniteNumber({
        value: value.parent.peakExternalBytes,
        path: `${path}.parent.peakExternalBytes`,
        errors,
      }),
      cpuUserMicros: getOptionalFiniteNumber({
        value: value.parent.cpuUserMicros,
        path: `${path}.parent.cpuUserMicros`,
        errors,
      }),
      cpuSystemMicros: getOptionalFiniteNumber({
        value: value.parent.cpuSystemMicros,
        path: `${path}.parent.cpuSystemMicros`,
        errors,
      }),
    },
    agent: {
      peakTreeRssBytes: getOptionalFiniteNumber({
        value: value.agent.peakTreeRssBytes,
        path: `${path}.agent.peakTreeRssBytes`,
        errors,
      }),
      peakTreeCpuPercent: getOptionalFiniteNumber({
        value: value.agent.peakTreeCpuPercent,
        path: `${path}.agent.peakTreeCpuPercent`,
        errors,
      }),
      peakProcessCount: getOptionalFiniteNumber({
        value: value.agent.peakProcessCount,
        path: `${path}.agent.peakProcessCount`,
        errors,
      }),
      totalReadBytes: getOptionalFiniteNumber({
        value: value.agent.totalReadBytes,
        path: `${path}.agent.totalReadBytes`,
        errors,
      }),
      totalWriteBytes: getOptionalFiniteNumber({
        value: value.agent.totalWriteBytes,
        path: `${path}.agent.totalWriteBytes`,
        errors,
      }),
    },
    capabilities: {
      childMemory: normalizeRuntimeStatsAvailability({
        value: value.capabilities.childMemory,
      }),
      childCpu: normalizeRuntimeStatsAvailability({
        value: value.capabilities.childCpu,
      }),
      childDiskIo: normalizeRuntimeStatsAvailability({
        value: value.capabilities.childDiskIo,
      }),
      notes,
    },
  };
};

export const normalizeReviewResponse = ({
  response,
}: {
  response: unknown;
}): ReviewResponseEntity => {
  const validationErrors: string[] = [];
  const root = isPlainRecord(response) ? response : {};

  if (!isPlainRecord(response)) {
    pushValidationError({
      errors: validationErrors,
      path: "response",
      issue: "expected a JSON object",
    });
  }

  const normalizedErrors = normalizeErrors({
    value: root.errors,
    path: "errors",
    errors: validationErrors,
  });

  const normalizedResponse: ReviewResponseEntity = {
    readableModelName:
      typeof root.readableModelName === "string" ? root.readableModelName : "",
    summary: {
      walkthrough: normalizeLocalizedStringRecord({
        value: isPlainRecord(root.summary)
          ? root.summary.walkthrough
          : undefined,
        path: "summary.walkthrough",
        errors: validationErrors,
      }),
      changes: normalizeChanges({
        value: isPlainRecord(root.summary) ? root.summary.changes : undefined,
        path: "summary.changes",
        errors: validationErrors,
      }),
      otherSuggestions: normalizeLocalizedStringRecord({
        value: isPlainRecord(root.summary)
          ? root.summary.otherSuggestions
          : undefined,
        path: "summary.otherSuggestions",
        errors: validationErrors,
      }),
    },
    reviews: normalizeReviews({
      value: root.reviews,
      path: "reviews",
      errors: validationErrors,
    }),
  };

  if (
    root.readableModelName !== undefined &&
    typeof root.readableModelName !== "string"
  ) {
    pushValidationError({
      errors: validationErrors,
      path: "readableModelName",
      issue: "expected a string",
    });
  }

  if (root.summary !== undefined && !isPlainRecord(root.summary)) {
    pushValidationError({
      errors: validationErrors,
      path: "summary",
      issue: "expected an object",
    });
  }

  if (typeof root.withCriticalError === "boolean") {
    normalizedResponse.withCriticalError = root.withCriticalError;
  } else if (root.withCriticalError !== undefined) {
    pushValidationError({
      errors: validationErrors,
      path: "withCriticalError",
      issue: "expected a boolean",
    });
  }

  normalizedResponse.duration = getOptionalFiniteNumber({
    value: root.duration,
    path: "duration",
    errors: validationErrors,
  });

  if (isPlainRecord(root.context)) {
    normalizedResponse.context = {
      total_length: getOptionalFiniteNumber({
        value: root.context.total_length,
        path: "context.total_length",
        errors: validationErrors,
      }),
      used_length: getOptionalFiniteNumber({
        value: root.context.used_length,
        path: "context.used_length",
        errors: validationErrors,
      }),
      usage_percentage: getOptionalFiniteNumber({
        value: root.context.usage_percentage,
        path: "context.usage_percentage",
        errors: validationErrors,
      }),
    };
  } else if (root.context !== undefined) {
    pushValidationError({
      errors: validationErrors,
      path: "context",
      issue: "expected an object",
    });
  }

  normalizedResponse.usage = normalizeUsage({
    value: root.usage,
    path: "usage",
    errors: validationErrors,
  });
  normalizedResponse.runtimeStats = normalizeRuntimeStats({
    value: root.runtimeStats,
    path: "runtimeStats",
    errors: validationErrors,
  });

  const combinedErrors = [...normalizedErrors, ...validationErrors];

  if (combinedErrors.length > 0) {
    normalizedResponse.errors = combinedErrors;
  }

  return normalizedResponse;
};
