import type { ReviewResponseEntity } from "../types/review.types";

export const buildEmptyReviewResponse = ({
  duration,
  error,
  withCriticalError = true,
}: {
  duration: number;
  error: string;
  withCriticalError?: boolean;
}): ReviewResponseEntity => {
  return {
    readableModelName: "",
    summary: {
      walkthrough: {},
      changes: [],
      otherSuggestions: {},
    },
    reviews: [],
    duration,
    errors: [error],
    withCriticalError,
  };
};
