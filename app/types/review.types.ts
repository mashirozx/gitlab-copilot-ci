export type ReviewRankEntity = "HIGH" | "MEDIUM" | "LOW";

export type ReviewSummaryEntity = {
  content: string;
  translations?: Record<string, string>;
};

export type ReviewItemEntity = {
  file_path: string;
  new_line?: number;
  old_line?: number;
  diff_file?: string;
  diff_line_code?: string;
  rank?: ReviewRankEntity;
  suggestion: string;
  translations?: Record<string, string>;
};

export type ReviewUsageEntity = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};

export type RuntimeStatsAvailabilityEntity =
  | "best-effort"
  | "supported"
  | "unsupported";

export type ReviewRuntimeStatsEntity = {
  platform: NodeJS.Platform;
  sampleCount: number;
  sampleIntervalMs: number;
  parent: {
    peakRssBytes?: number;
    peakHeapUsedBytes?: number;
    peakExternalBytes?: number;
    cpuUserMicros?: number;
    cpuSystemMicros?: number;
  };
  agent: {
    peakTreeRssBytes?: number;
    peakTreeCpuPercent?: number;
    peakProcessCount?: number;
    totalReadBytes?: number;
    totalWriteBytes?: number;
  };
  capabilities: {
    childMemory: RuntimeStatsAvailabilityEntity;
    childCpu: RuntimeStatsAvailabilityEntity;
    childDiskIo: RuntimeStatsAvailabilityEntity;
    notes?: string[];
  };
};

export type ReviewResponseEntity = {
  summary: ReviewSummaryEntity;
  reviews: ReviewItemEntity[];
  errors?: string[];
  context?: {
    total_length?: number;
    used_length?: number;
    usage_percentage?: number;
  };
  usage?: ReviewUsageEntity;
  duration?: number;
  runtimeStats?: ReviewRuntimeStatsEntity;
};
