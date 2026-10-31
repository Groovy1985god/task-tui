 import {
    foreignKey,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
    varchar,
 } from 'drizzle-orm/pg-core';
import { inviteCode } from '../shared/validation';

 export const taskStatus = pgEnum('task_status', [
    'todo',
    'in_progress',
    'done',
 ]);
 export const taskPriority = pgEnum('task_priority', ['low', 'medium', 'high']);
 const createdAt = () =>
    timestamp('created_at', { withTimezone: true, mode: 'string' })
 .defaultNow()
 .notNull();

 export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 32 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
 });

 export const sessions = pgTable(
    'sessions',
    {
        tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
        userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade'}),
        expiresAt: timestamp('expires_at', {
            withTimezone: true,
            mode: 'string',
        }).notNull(),
    },
    (table) => [index('sessions_expires_at_idx').on(table.expiresAt)], 
);

export const projects = pgTable('projects', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', {length: 80}).notNull(),
    inviteCode: varchar('invite_code', { length: 24 }).notNull().unique(),
    ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
    'project_members',
    {
        projectId: uuid('project_id')
        .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
            userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
          joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string'})
          .defaultNow()
          .notNull(),  
    },
    (table) => [
        primaryKey({ columns: [table.projectId, table.userId] }),
        index('project_members_user_idx').on(table.userId),
    ],
);

export const tasks = pgTable(
    'tasks',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, { onDelete: 'cascade' }),
        title: varchar('title', { length: 160 }).notNull(),
        notes: text('notes').default('').notNull(),
        status: taskStatus('status').default('todo').notNull(),
        priority: taskPriority('priority').default('medium').notNull(),
        assigneeId: uuid('assignee_id'),
        createdBy: uuid('created_by')
        .notNull()
        .references(() => users.id),
       version: integer('version').default(1).notNull(),
       createdAt: createdAt(),
       updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
       .defaultNow()
       .notNull(), 
    },
    (table) => [
        index('tasks_project_updated_idx').on(table.projectId, table.updatedAt),
        foreignKey({
            name: 'tasks assignee membership_fk',
            columns: [table.projectId, table.assigneeId],
            foreignColumns: [projectMembers.projectId, projectMembers.userId],
        }),
    ],
);
    


 