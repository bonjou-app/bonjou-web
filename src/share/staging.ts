import { entriesFor, folderNameFor, zipSize } from "./zip";

export interface StagedBatch {
  id: string;
  files: File[];
  folder: boolean;
  name: string;
  size: number;
}

export function stageBatches(
  files: File[],
  folder: boolean,
  nextId: () => string,
): StagedBatch[] {
  if (!files.length) return [];
  if (folder)
    return [
      {
        id: nextId(),
        files: [...files],
        folder: true,
        name: folderNameFor(files),
        size: zipSize(entriesFor(files)),
      },
    ];
  return files.map((file) => ({
    id: nextId(),
    files: [file],
    folder: false,
    name: file.name,
    size: file.size,
  }));
}

/** Submitting metadata is separate from the recipient approving a download. */
export async function submitStage(
  batches: StagedBatch[],
  targets: string[],
  submit: (targets: string[], files: File[], folder?: boolean) => Promise<void>,
): Promise<{ submitted: string[]; error?: string }> {
  const audience = [...targets];
  const submitted: string[] = [];
  if (!audience.length) return { submitted };
  for (const batch of batches) {
    try {
      await submit([...audience], [...batch.files], batch.folder);
      submitted.push(batch.id);
    } catch (error: unknown) {
      return {
        submitted,
        error:
          error instanceof Error
            ? error.message
            : "Could not offer those files. Try again.",
      };
    }
  }
  return { submitted };
}
