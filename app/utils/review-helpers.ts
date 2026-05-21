export const findDiffItemByFilePath = ({
  changes,
  filePath,
}: {
  changes: { new_path: string; diff?: string }[];
  filePath: string;
}): { new_path: string; diff?: string } | undefined => {
  return changes.find((change) => change.new_path === filePath);
};

export const getReviewPreferredLine = ({
  review,
}: {
  review: {
    new_line?: number;
    old_line?: number;
  };
}): number | null => {
  return review.new_line ?? review.old_line ?? null;
};

export const formatReviewLocation = ({
  review,
}: {
  review: {
    file_path: string;
    new_line?: number;
    old_line?: number;
  };
}): string => {
  if (review.new_line !== undefined && review.old_line !== undefined) {
    return `${review.file_path}:new ${review.new_line}, old ${review.old_line}`;
  }

  if (review.new_line !== undefined) {
    return `${review.file_path}:${review.new_line}`;
  }

  if (review.old_line !== undefined) {
    return `${review.file_path}:old ${review.old_line}`;
  }

  return `${review.file_path}:(no line)`;
};
