import { AppError } from './errors.ts';
import { priorities, statuses, type TaskInput } from './types.ts';

export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AppError(400, 'Expected a JSON object.');
    }
    return value as Record<string, unknown>;
}

function text(
    value: unknown,
    label: string,
    min: number,
    max: number,
    multiline = false,
): string {
    if (
        typeof value !== 'string' ||
        value.trim().length < min ||
        value.length > max
    ) {
        throw new AppError(400, '${label} must be ${min}-${max} characters ');
    }
    // Block terminal control sequences in user-provided content.
      const forbidden = multiline
    ? /[\x00-\x08\x0b-\x1f\x7f-\x9f]/u
    : /[\x00-\x1f\x7f-\x9f]/u;
   if (forbidden.test(value)) {
    throw new AppError(
        400,
        '${label} contains unsupported control characters.',
    );
   }
   return value.trim();
}

export function credentials(value: unknown) {
    const body = object(value)
 const username = text(body.username, 'Username', 3, 32).toLowerCase();
if (!/^[a-z0-9_-]+$/u.test(username)) {
    throw new AppError(400, 'Username may contain letters, numbers, _ and -.');
}
if (
    typeof body.password !== 'string' ||
    body.password.length < 8 ||
    body.password.length > 128
) {
    throw new AppError(400, 'Password must be 8-128 characters.');
}
return { username, password: body.password };
}

export function projectName(value: unknown): string {
    return text(object(value).name,'Project name', 1, 80);
}

export function inviteCode(value: unknown): string {
  const code = text(
    object(value).inviteCode,
    'Invite code',
    24,
    24,
  ).toLowerCase();
  if (!/^[a-f0-9]{24}$/u.test(code))
    throw new AppError(400, 'Enter a valid 24-character invite code.');
return code;
}

export function uuid(value: unknown, label = 'ID'): string {
  if (
    typeof value !== 'string' ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  )
  )  {
    throw new AppError(400, '${label} must be a valid UUID.');
  }
  return value;
}

export function version(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) <1) {
        throw new AppError(
            400,
            'A positive task version is required. Refresh the task and retry.',
        );
    }
    return value as number;
}

export function taskInput(value: unknown): TaskInput {
    const body = object(value);
    if (!statuses.includes(body.status as TaskInput['status']))
    throw new AppError(400, 'Choose todo, in_progress, or done.');
  if (!priorities.includes(body.priority as TaskInput['priority']))
    throw new AppError(400, 'Choose low, medium, or high priority.');
  return {
    title: text(body.title, 'Title', 1, 160),
    notes: text(body.notes ?? '', 'Notes', 0, 4000, true),
    status: body.status as TaskInput['status'],
    priority: body.priority as TaskInput['priority'],
    assigneeId:
    body.assigneeId === null || body.assigneeId === undefined
    ? null
    : uuid(body.assigneeId, 'Assignee'),
  };
}  




