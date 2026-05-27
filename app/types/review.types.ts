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
  model?: string;
};
