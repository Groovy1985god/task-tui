 import { AppError } from '../shared/errors.ts';
 import type {
    AuthResult,
    Project,
    ProjectData,
    Task,
    TaskInput,
    User,
 } from '../shared/types.ts';

 export interface ApiClient {
    authenticate(
        mode: 'login' | 'register',
        username: string,
        password: string,
    ): Promise<AuthResult>;
    logout(): Promise<void>;
    projects(): Promise<Project[]>;
    createProject(name: string): Promise<Project>;
    joinProject(inviteCode: string): Promise<Project>;
    projectData(projectId: string): Promise<ProjectData>;
    createTask(projectId: string, input: TaskInput): Promise<Task>;
    updateTask(task: Task, input: TaskInput): Promise<Task>;
    deleteTask(task: Task): Promise<void>;
 }

 export function createClient(baseUrl: string): ApiClient {
    let token: string | undefined;
    const url = baseUrl.replace(/\/+$/u, '');
    const parsed = new URL(url);
    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
    ) {
        throw new Error(
            'TASK-TUI_API_URL must be an HTTP(S) URL without credentials.',
        );
    }
    async function request<T>(
        path: string,
        method = 'GET',
        body?: unknown,
    ): Promise<T> {
        let response: Response;
        try {
            response = await fetch(`${url}${path}`, {
                method,
                headers: {
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(token ? { authorization: 'Bearer ${token}' } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new AppError(
                0,
                'Cannot reach the API. Start npm run server or check TASK-TUI_API_URL. If a save timed out, refresh before retrying.',
            );
        }
        if (!response.ok) {
            let message = `Request failed (${response.status}). Please retry.`;
            try {
               const payload = (await response.json()) as { error?: unknown };
        if (typeof payload.error === 'string') message = payload.error;      
            } catch {
                /*  Keep the useful HTTP status if a proxy returns non-JSON. */
            }
            throw new AppError(response.status, message);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    }
    return {
        async authenticate(mode, username, password) {
            const result = await request<AuthResult>(`/auth/${mode}`, 'POST', {
                username,
                password,
            });
            token = result.token;
            return result
        },
        async logout() {
            await request('/auth/logout', 'POST');
            token = undefined;
        },
        projects: () => request<Project[]>('/projects'),
        createProject: (name) => request<Project>('/projects', 'POST', { name }),
        joinProject: (inviteCode) =>
          request<Project>('/projects/join', 'POST', { inviteCode }),  
        async projectData(projectId) {
            const [members, tasks] = await Promise.all([
              request<User[]>(`/projects/${projectId}/members`),
              request<Task[]>(`/projects/${projectId}/tasks`),
            ]);
            return { members, tasks };
        },
        createTask: (projectId, input) =>
          request<Task>(`/projects/${projectId}/tasks`, 'POST', input),
        updateTask: (task, input) =>
            request<Task>(`/projects/${task.projectId}/tasks/${task.id}`, 'PATCH', {
                ...input,
                version: task.version,   
    }),
    deleteTask: (task) =>
        request<void>(`/projects/${task.projectId}/tasks/${task.id}`, 'DELETE', {
            version: task.version,
        }),
    };
}



