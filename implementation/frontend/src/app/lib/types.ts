export type Region = "us-east" | "eu-west" | "ap-southeast";

export type Role = "coordinator" | "reviewer" | "admin";

export interface Persona {
  id: string;
  name: string;
  email: string;
  team: string;
  teamId: string;
  region: Region;
  role: Role;
}

export interface RegionMeta {
  id: Region;
  label: string; // short label e.g. "US-East"
  fullName: string; // "United States (East)"
  storage: string; // "regions/us-east-1/"
  dot: string; // tailwind bg class for dot
  emoji: string;
}

export type DestinationType = "region" | "team" | "binder" | "folder";

export interface DestinationNode {
  id: string;
  name: string;
  type: DestinationType;
  region: Region;
  children?: DestinationNode[];
}

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed";

export interface Job {
  id: string;
  ownerId: string;
  region: Region;
  destinationId: string;
  destinationPath: string;
  status: JobStatus;
  tasks: UploadTask[];
  createdAt: number;
  updatedAt: number;
}

export interface StagedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  error?: string;
  /** Reference to the actual File object for upload */
  file?: File;
}
