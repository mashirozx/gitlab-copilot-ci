export const tryParseJson = <T>({ text }: { text: string }): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export const parseJson = <T>({ text }: { text: string }): T => {
  return JSON.parse(text) as T;
};

export const extractMarkedJsonText = ({
  text,
  marker,
}: {
  text: string;
  marker: string;
}): string | null => {
  const markerIndex = text.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const startIndex = markerIndex + marker.length;
  const endIndex = text.indexOf("\n", startIndex);

  return text
    .substring(startIndex, endIndex === -1 ? text.length : endIndex)
    .trim();
};
