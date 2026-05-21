export const findDiffItemByFilePath = ({
  changes,
  filePath,
}: {
  changes: { new_path: string; diff?: string }[];
  filePath: string;
}): { new_path: string; diff?: string } | undefined => {
  return changes.find((change) => change.new_path === filePath);
};
