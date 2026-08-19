export interface UploadTask {
  id: string;
  file: File;
  folderId: string;
  folderName: string;
  progress: number;
  done: boolean;
  checksum: string | null;
  checksumAlgo: "SHA-256";
  checksumStatus: "pending" | "computing" | "verified" | null;
  uploadedAt: Date | null;
  byteCount: number;
}

export type JobStatus = "staging" | "uploading" | "complete";

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  tasks: UploadTask[];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  transactionId: string | null;
}
