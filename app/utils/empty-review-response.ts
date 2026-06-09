import type { ReviewResponseEntity } from "../types/review.types";

export const buildEmptyReviewResponse = ({
  duration,
  error,
}: {
  duration: number;
  error: string;
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
    withCriticalError: true,
  };
};
