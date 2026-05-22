const HTML_MARKER_PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizeHtmlMarkerPrefix = ({
  prefix,
}: {
  prefix?: string;
}): string => {
  const resolvedPrefix = prefix ?? "copilot";

  if (!HTML_MARKER_PREFIX_PATTERN.test(resolvedPrefix)) {
    throw new Error(
      "--html-marker-prefix must use lowercase letters, numbers, and hyphens only in kebab-case format",
    );
  }

  return resolvedPrefix;
};
