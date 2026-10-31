export const statuses = ['todo', 'in_progress', 'done'] as const;
export const priorities = ['low', 'medium', 'high'] as const;
export type TaskStatus = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];

export interface User {
    id: string;
    username: string;
}

export interface Project {
    id: string;
    name: string;
    inviteCode: string;
    ownerId: string;
    createdAt: string;
}

export interface TaskInput {
    title: string;
    notes: string;
    status: TaskStatus;
    priority: Priority;
    assigneeId: string | null;
}

export interface Task extends TaskInput {
    id: string;
    projectId: string;
    createdBy: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface AuthResult {
    user: User;
    token: string;
}

export interface ProjectData {
    members: User[];
    tasks: Task[];
}