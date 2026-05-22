export type ReviewItemEntity = {
  file_path: string;
  new_line?: number;
  old_line?: number;
  diff_file?: string;
  diff_line_code?: string;
  suggestion: string;
  translations?: Record<string, string>;
};

export type ReviewResponseEntity = {
  comment: string;
  reviews: ReviewItemEntity[];
  errors?: string[];
  context?: {
    total_length?: number;
    used_length?: number;
    usage_percentage?: number;
  };
  duration?: number;
  model?: string;
};
