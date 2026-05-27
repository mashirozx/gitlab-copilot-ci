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

const extractWrappedMarkedJsonText = ({
  text,
  startMarker,
  endMarker,
}: {
  text: string;
  startMarker: string;
  endMarker: string;
}): string | null => {
  const startIndex = text.indexOf(startMarker);

  if (startIndex !== -1) {
    const contentStartIndex = startIndex + startMarker.length;
    const endIndex = text.indexOf(endMarker, contentStartIndex);

    if (endIndex !== -1) {
      return text.substring(contentStartIndex, endIndex).trim();
    }
  }

  const lines = text.split(/\r?\n/);
  let collectedLines: string[] | null = null;

  for (const line of lines) {
    if (collectedLines === null) {
      const lineStartIndex = line.indexOf(startMarker);

      if (lineStartIndex === -1) {
        continue;
      }

      collectedLines = [line.substring(lineStartIndex + startMarker.length)];
      continue;
    }

    const lineEndIndex = line.indexOf(endMarker);

    if (lineEndIndex !== -1) {
      collectedLines.push(line.substring(0, lineEndIndex));
      return collectedLines.join("\n").trim();
    }

    collectedLines.push(line);
  }

  return null;
};

export const extractMarkedJsonText = ({
  text,
  marker,
  endMarker,
}: {
  text: string;
  marker: string;
  endMarker?: string;
}): string | null => {
  if (endMarker) {
    return extractWrappedMarkedJsonText({
      text,
      startMarker: marker,
      endMarker,
    });
  }

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
