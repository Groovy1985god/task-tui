import type { Project, Task, TaskInput, User } from '../shared/types.ts';

export interface StoredUser extends User {
  passwordHash: string;
}

export interface Store {
  health(): Promise<void>;
  createUser(username: string, passwordHash: string): Promise<User>;
  findUser(username: string): Promise<StoredUser | undefined>;
  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  sessionUser(tokenHash: string): Promise<User | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  listProjects(userId: string): Promise<Project[]>;
  createProject(userId: string, name: string): Promise<Project>;
  joinProject(userId: string, inviteCode: string): Promise<Project | undefined>;
  isMember(projectId: string, userId: string): Promise<boolean>;
  listMembers(projectId: string): Promise<User[]>;
  listTasks(projectId: string): Promise<Task[]>;
  createTask(
    projectId: string,
    userId: string,
    input: TaskInput,
  ): Promise<Task>;
  updateTask(
    projectId: string,
    taskId: string,
    version: number,
    input: TaskInput,
  ): Promise<Task>;
  deletetask(projectId: string, taskId: string, version: number): Promise<void>;
}
