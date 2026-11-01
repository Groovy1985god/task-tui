import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { AppError } from '../shared/errors.ts';
import type { TaskInput } from '../shared/types';
import type { Store } from '../server/store';
import type { Database } from './client.ts';
import { projectMembers, projects, sessions, tasks, users } from './schema.ts';

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error('The database did not return the inserted row.');
  return row;
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}

export function createStore(db: Database): Store {
  async function staleOrMissing(
    projectId: string,
    taskId: string,
  ): Promise<never> {
    const [found] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.id, taskId)));
    throw new AppError(
      found ? 409 : 404,
      found
        ? 'A teammate changed this task> Cancel, refresh, and apply your changes to the latest version.'
        : 'Task no longer exists. Refresh the project.',
    );
  }

  return {
    async health() {
      await db.execute(sql`select`);
    },
    async createUser(username, passwordHash) {
      try {
        return first(
          await db
            .insert(users)
            .values({ username, passwordHash })
            .returning({ id: users.id, username: users.username }),
        );
      } catch (error) {
        if (pgCode(error) === '23505')
          throw new AppError(
            409,
            'That username is taken. Choose another or sign in.',
          );
        throw error;
      }
    },
    async findUser(username) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      return user;
    },
    async createSession(userId, tokenHash, expiresAt) {
      await db
        .insert(sessions)
        .values({ userId, tokenHash, expiresAt: expiresAt.toISOString() });
      // Opportunistically remove old sessions, without ever exposing raw tokens.
      await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`);
    },
    async sessionUser(tokenHash) {
      const [user] = await db
        .select({ id: users.id, username: users.username })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            gt(sessions.expiresAt, new Date().toISOString()),
          ),
        );
      return user;
    },
    async deleteSession(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async listProjects(userId) {
      const rows = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
        .where(eq(projectMembers.userId, userId))
        .orderBy(desc(projects.createdAt), asc(projects.id));
      return rows.map((row) => row.project);
    },
    async createProject(userId, name) {
      return db.transaction(async (tx) => {
        const project = first(
          await tx
            .insert(projects)
            .values({
              name,
              ownerId: userId,
              inviteCode: randomBytes(12).toString('hex'),
            })
            .returning(),
        );
        await tx
          .insert(projectMembers)
          .values({ projectId: project.id, userId });
        return project;
      });
    },
    async joinProject(userId, inviteCode) {
      return db.transaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(projects)
          .where(eq(projects.inviteCode, inviteCode));

        if (!project) return undefined;

        await tx
          .insert(projectMembers)
          .values({ projectId: project.id, userId })
          .onConflictDoNothing();
        return project;
      });
    },
    async isMember(projectId, userId) {
      const [member] = await db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId),
          ),
        );
      return Boolean(member);
    },
    async listMembers(projectId) {
      return db
        .select({ id: users.id, username: users.username })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(asc(users.username));
    },
    async listTasks(projectId) {
      return db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(desc(tasks.updatedAt), asc(tasks.id));
    },
    async createTask(projectId, userId, input) {
      return first(
        await db
          .insert(tasks)
          .values({ ...input, projectId, createdBy: userId })
          .returning(),
      );
    },
    async updateTask(projectId, taskId, version, input) {
      const [task] = await db
        .update(tasks)
        .set({
          ...input,
          version: sql`${tasks.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(tasks.projectId, projectId),
            eq(tasks.id, taskId),
            eq(tasks.version, version),
          ),
        )
        .returning();

      return task ?? staleOrMissing(projectId, taskId);
    },
    async deletetask(projectId, taskId, version) {
      const [task] = await db
        .delete(tasks)
        .where(
          and(
            eq(tasks.projectId, projectId),
            eq(tasks.id, taskId),
            eq(tasks.version, version),
          ),
        )
        .returning();

      if (!task) {
        await staleOrMissing(projectId, taskId);
      }
    },
  };
}
