import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ApiClient } from '../client/api.ts';
import { AppError } from '../shared/errors.ts'; 
import {
    priorities,
    statuses,
    type Project,
    type Task,
    type TaskInput,
    type TaskStatus,
    type User,
} from '../shared/types.ts';
import { Form, type Field } from './Form.tsx';
import { Notice, type Message } from './Notice.tsx';
import { statusLabel, statusMark, theme } from './theme.ts';

type Screen = 
| { type: 'welcome' }
| { type: 'auth'; mode: 'login' | 'register' }
  | { type: 'projects' }
  | { type: 'project-form'; mode: 'create' | 'join' }
  | { type: 'tasks' }
  | { type: 'task-form'; task?: Task }
  | { type: 'delete'; task: Task }
  | { type: 'detail' }
  | { type: 'members' }
  | { type: 'invite' }
  | { type: 'search' };

  const inputOf = (task: Task): TaskInput => ({
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
  });

  function useTerminal() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24,
    });
    useEffect(() => {
        const resize = () =>
            setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
        stdout.on('resize', resize);
        return () => {
            stdout.off('resize', resize);
        };
    }, [stdout]);
    return size;
  }

  function Details({
    task,
    members,
    maxLines,
    offset = 0,
  }: {
    task: Task;
    members: User[];
    maxLines: number;
    offset?: number;
  }) {
    const assignee =
    members.find((member) => member.id === task.assigneeId)?.username ??
    'Unassigned';
    return (
         <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Text bold wrap="truncate-end">
        {task.title}
      </Text>
      <Text>
        {statusMark[task.status]} {statusLabel[task.status]} · {task.priority}{' '}
        priority
      </Text>
      <Text>Assigned to: {assignee}</Text>
      <Text dimColor>Updated {new Date(task.updatedAt).toLocaleString()}</Text>
      <Box marginTop={1} height={Math.max(1, maxLines - 6)} overflow="hidden">
        <Text>{(task.notes || 'No notes yet.').slice(offset)}</Text>
      </Box>
    </Box>
  );
  }

  export function App({ api }: { api: ApiClient }) {
    const { exit } = useApp();
    const { columns, rows } = useTerminal();
    const [screen, setScreen] = useState<Screen>({ type: 'welcome' });
    const [user, setUser] = useState<User>();
    const [projects, setProjects] = useState<Project[]> ([]);
     const [project, setProject] = useState<Project>();
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [projectIndex, setProjectIndex] = useState(0);
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [detailOffset, setDetailOffset] = useState(0);
  const [memberOffset, setMemberOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>();
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
        mounted.current = false;
  },
  [],
);

const perform = useCallback(
    async (operation: () => Promise<void>, success?: string) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage(undefined);
        try {
            await operation();
            if (mounted.current && success)
                setMessage({ kind: 'success', text: success });
        } catch (error) {
            if (!mounted.current) return;
            setMessage({
                kind: 'error',
                text:
                error instanceof Error
                ? error.message
                : 'Something went wrong> Please retry.',
            });
            if (error instanceof AppError && error.status == 401) {
              setUser(undefined);
              setProject(undefined);
              setProjects([]);
              setTasks([]);
              setMembers([]);
              setScreen({ type: 'auth', mode: 'login' });   
            }
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy(false);
        }
    },
    [],
);

const filtered = tasks.filter((task) => {
    if (filter !== 'all' && task.status !== filter) return false;
    const assignee =
    members.find((member) => member.id === task.assigneeId)?.username ?? '';
    return `${task.title} ${task.notes} ${assignee}`
    .toLowerCase()
    .includes(query.toLowerCase());
});
const selectedIndex = Math.max(
    0,
    filtered.findIndex((task) => task.id === selectedId),
);
const selected = filtered[selectedIndex];
const capacity = Math.max(1, rows - 14);
const listStart = Math.max(
    0,
    Math.min(selectedIndex - capacity + 1, filtered.length - capacity),
);
const formActive = ['auth', 'project-form', 'task-form'].includes(
    screen.type,
);
const canUse = columns >= 42 && rows >= 18;
const wide = columns >= 90;

async function  loadProjects() {
    setProjects(await api.projects());
    setScreen({ type: 'projects' });
}

async function loadProject(next: Project) {
  const data = await api.projectData(next.id);
  setProject(next);
  setTasks(data.tasks);
  setMembers(data.members);
  setFilter('all');
  setQuery('');
  setSelectedId(data.tasks[0]?.id);
  setScreen({ type: 'tasks' });
}

function refresh() {
  if (project)
    void perform(async () =>{
      const data = await api.projectData(project.id);
    setTasks(data.tasks);
    setMembers(data.members);
  }, 'Project refreshed.');
}

function replaceTask(task: Task) {
  setTasks((current) => [
    task,
    ...current.filter((item) => item.id !== task.id),
    ]);
    setSelectedId(task.id);
}

useInput(
  (input, key) => {
    if (
      input === 'q' &&
      !formActive &&
      screen.type !== 'search' &&
      !busyRef.current
    ) {
      exit();
      return;
    }
    if (busyRef.current || !canUse || formActive || screen.type === 'search')
      return;
    if (screen.type === 'welcome') {
      if (key.upArrow || key.downArrow || key.tab)
        setWelcomeIndex((index) => 1 - index);
      else if (key.return)
        setScreen({
          type: 'auth',
          mode: welcomeIndex === 0 ? 'login' : 'register',
    });
    return;
  }
  if (screen.type === 'projects') {
    if (key.upArrow || input === 'k')
      setProjectIndex((index) => Math.max(0, index - 1));
    else if (key.downArrow || input === 'j')
      setProjectIndex((index) =>
    Math.min(Math.max(0, projects.length - 1), index + 1),
    );
    else if (key.return) {
      const next = projects[Math.min(projectIndex, projects.length - 1)];
      if (next) void perform(() => loadProject(next));
    } else if (input === 'n')
      setScreen({ type: 'project-form', mode: 'create' });
      else if (input === 'a')
        setScreen({ type: 'project-form', mode: 'join'});
      else if (input === 'r')
        void perform(loadProjects, 'Projects refreshed.');
      else if (input === 'l')
        void perform(async () => {
      await api.logout();
    setUser(undefined);
  setProject(undefined);
setProjects([]);
setTasks([]);
setMembers([]);
setScreen({ type: 'welcome' });
}, 'Signed out');
return;
  }
  if (screen.type === 'delete') {
    if (input.toLowerCase() === 'y')
      void perform(async () => {
    await api.deleteTask(screen.task);
  setTasks((current) =>
  current.filter((task) => task.id !== screen.task.id),
);
setScreen({ type: 'tasks' });
}, 'Task deleted.');
else if (input.toLowerCase() === 'n' || key.escape || key.return)
  setScreen({ type: 'tasks' });
return;
  }
  if (screen.type === 'detail') {
    const step = Math.max(1, Math.floor((columns - 8) / 2));
    if (key.downArrow || input === 'j')
      setDetailOffset((offset) =>
    Math.min(
      Math.max(0, (selected?.notes.length ?? 0) - step),
      offset + step,
    ),
  );
  else if (key.upArrow || input === 'k')
          setDetailOffset((offset) => Math.max(0, offset - step));
        else if (key.escape || input === 'b' || key.return)
          setScreen({ type: 'tasks' });
        return;
  }
  if (screen.type === 'members') {
    if (key.downArrow || input === 'j')
      setMemberOffset((offset) =>
    Math.min(Math.max(0, members.length - capacity), offset + 1),
  );
  else if (key.upArrow || input === 'k')
    setMemberOffset((offset) => Math.max(0, offset - 1));
  else if (key.escape || input === 'b') setScreen({ type: 'tasks' });
  return;
  }
  if (screen.type === 'invite') {
        if (key.escape || input === 'b') setScreen({ type: 'tasks' });
        return;
  }
  if (screen.type !== 'tasks') return;
  if (key.upArrow || input === 'k')
    setSelectedId(filtered[Math.max(0, selectedIndex - 1)]?.id);
  else if (key.downArrow || input === 'j')
    setSelectedId(
  filtered[Math.min(filtered.length - 1, selectedIndex + 1)]?.id,
);
else if (key.tab) {
  const options = ['all', ...statuses] as const;
  setFilter(
    options[
      (options.indexOf(filter) + (key.shift ? options.length - 1 : 1)) %
      options.length
    ] ?? 'all',
  );
} else if (input === 'n') setScreen({ type: 'task-form' });
      else if (input === 'e' && selected)
        setScreen({ type: 'task-form', task: selected });
      else if (input === 'd' && selected)
        setScreen({ type: 'delete', task: selected });
      else if (input === ' ' && selected)
        void perform(async () => {
      const status =
    statuses[
      (statuses.indexOf(selected.status) + 1) % statuses.length
    ] ?? 'todo';
  replaceTask(
    await api.updateTask(selected, { ...inputOf(selected), status}),
  );
}, 'Status updated.');
else if (key.return && selected) {
  setDetailOffset(0);
  setScreen({ type: 'detail' });
} else if (input === '/') {
  setDraftQuery(query);
  setScreen({ type: 'search' });
} else if (input === 'x') {
  setQuery('');
  setFilter('all');
} else if (input === 'r') refresh();
else if (input === 'm') {
  setMemberOffset(0);
  setScreen({ type: 'members' });
} else if (input === 'i') setScreen({ type: 'invite' });
else if (key.escape || input === 'b') void perform(loadProjects);
  },
 { isActive: true },
);

useInput(
  (_input, key) => {
    if (key.escape) setScreen({ type: 'tasks' });
  },
  { isActive: screen.type === 'search' && !busy && canUse },
);

function authFields(): Field[] {
  return [
    {
      key: 'username',
      label: 'Username',
      value: '',
      required: true,
      maxLength: 32,
      validate: (value) =>
        /^[a-z0-9_-]{3,32}$/iu.test(value.trim())
      ? undefined
      : 'Use 3-32 letters, numbers, _ or -.',
    },
    {
      key: 'password',
      label: 'Password (8-128 characters)',
      value: '',
      password: true,
      required: true,
      maxLength: 128,
      validate: (value) =>
        value.length >= 8 ? undefined : 'Use at least 8 characters.',
    },
  ];
}

function taskFields(task?: Task): Field[] {
  return [
    {
      key: 'title',
      label: 'Title',
      value: task?.title ?? '',
      required: true,
      maxLength: 160,
    },
    {
      key: 'notes',
      label: 'Notes',
      value: task?.notes ?? '',
      maxLength: 4000,
    },
    {
      key: 'status',
      label: 'Status',
      value: task?.status ?? 'todo',
      options: statuses.map((value) => ({
        value,
        label: statusLabel[value],
      })),
    },
    {
      key: 'priority',
      label: 'Priority',
      value: task?.priority ?? 'medium',
      options: priorities.map((value) => ({ value, label: value })),
    },
    {
      key: 'assigneeId',
      label: 'Assigned to',
      value: task?.assigneeId ?? '',
      options: [
        { value: '', label: 'Unassigned' },
        ...members.map((member) => ({
          value: member.id,
          label: member.username,
        })),
      ],
    },
  ];
}

function body() {
  if (screen.type === 'welcome')
    return (
  <Box flexDirection="column" gap={1}>
    <Text>Shared projects. Tasks with clear owners.</Text>
    <Text color={welcomeIndex === 0 ? theme.accent : undefined}>
      {welcomeIndex === 0 ? '> ' : ' '}Sign in
      </Text>
      <Text color={welcomeIndex === 1 ? theme.accent : undefined}>
        {welcomeIndex === 1 ? '> ' : ' '}Create account
        </Text>
        <Text dimColor>↑↓ choose . Enter continue . q quit</Text>
        </Box>
        );
        if (screen.type === 'auth')
          return (
        <Form
      key={`auth-${screen.mode}`}
      title={screen.mode === 'login' ? 'Sign in' : 'Create account'}
          fields={authFields()}
          busy={busy || !canUse}
          rows={rows}
          onCancel={() => setScreen({ type: 'welcome' })}
          onSave={(values) => {
            void perform(async () => {
              const result = await api.authenticate(
                screen.mode,
                values.username ?? '',
                values.password ?? '',
              );
              setUser(result.user);
              setScreen({ type: 'projects' });
              await loadProjects();
        });
    }}
    />
  );
  if (screen.type === 'project-form')
    return (
      <Form
        key={`project-${screen.mode}`}
          title={screen.mode === 'create' ? 'Create project' : 'Join project'}
          fields={
            screen.mode === 'create'
              ? [
                  {
                    key: 'name',
                  label: 'Project name',
                value: '',
              required: true,
            maxLength: 80,
         },
        ]
      : [
        {
          key: 'inviteCode',
          label: 'Invite code (ask a project member)',
          value: '',
          required: true,
          maxLength: 24,
        },
      ]
  }
  busy={busy || !canUse}
rows={rows}
onCancel={() => setScreen({ type: 'projects' })}
onSave={(values) => {
  void perform(
    async () => {
      const next =
      screen.mode === 'create'
      ? await api.createProject(values.name ?? '')
      : await api.joinProject((values.inviteCode ?? '').trim());
      setProjects((current) => [
        next,
        ...current.filter((item) => item.id !== next.id),
      ]);
      setScreen({ type: 'projects' });
      await loadProject(next);
    },
    screen.mode === 'create'
    ? 'Project created. Press i to invite your team.'
    : 'You joined the project.',
  );
}}
/>
 );
 if (screen.type === 'projects') {
  const index = Math.min(projectIndex, Math.max(0, projects.length - 1));
  const start = Math.max(0, index - capacity + 1);
  return (
    <Box flexDirection="column" flexGrow={1}>
          <Text bold>Your projects ({projects.length})</Text>
          <Box flexDirection="column" flexGrow={1} marginTop={1}>
            {projects.length ? (
              projects.slice(start, start + capacity).map((item, offset) => (
                <Text
                  key={item.id}
                  wrap="truncate-end"
                  color={start + offset === index ? theme.accent : undefined}
                >
                  {start + offset === index ? theme.accent : undefined}
                  {item.name}
                  </Text>
             ))
            ) : (
              <Text>
                No projects yet. Press n to create one or a to join with an
                invite code.
                </Text>
            )}
            </Box>
             <Text dimColor>↑↓ select · Enter open · n create · a join</Text>
          <Text dimColor>r refresh · l sign out · q quit</Text>
          </Box>     
  ); 
}
if (screen.type === 'task-form')
  return (
<Form
key={screen.task?.id ?? 'new-task'}
title={screen.task ? 'Edit task' : 'New task'}
fields={taskFields(screen.task)}
busy={busy || !canUse}
rows={rows}
onCancel={ () => setScreen({ type: 'tasks' })}
onSave={(values) => {
  if (!project) return;
  const input: TaskInput = {
    title: values.title ?? '',
    notes: values.notes ?? '',
    status: (values.status ?? 'todo') as TaskStatus,
    priority: (values.priority ?? 'medium') as TaskInput['priority'],
    assigneeId: values.assigneeId || null,
  };
  void perform(
    async () => {
      const task = screen.task
      ? await api.updateTask(screen.task, input)
      : await api.createTask(project.id, input);
      replaceTask(task);
      setFilter('all');
      setQuery('');
      setScreen({ type: 'tasks' });
    },
    screen.task ? 'Task saved.' : 'Task created.',
  );
}}
/>
);
if (screen.type === 'delete')
  return (
 <Box flexDirection="column" gap={1}>
          <Text color={theme.danger} bold>
            Delete task permanently?
            </Text>
            <Text wrap="truncate-end">{screen.task.title}</Text>
            <Text>
              This removes the task for everyone in the project. It cannot be 
              undone.
            </Text>
            <Text>Y delete . N/Enter/Esc cancel</Text>
            </Box>
  );
  if (screen.type === 'invite')
    return (
  <Box flexDirection="column" gap={1}>
    <Text bold>Invite people to {project?.name}</Text>
          <Text>Share this code privately with your team:</Text>
          <Text color={theme.accent} bold>
            {project?.inviteCode}
          </Text>
          <Text>
            They sign in on the same API server, press a in Projects, and enter 
            this code.
            </Text>
             <Text dimColor>Anyone with the code can join. Esc back . q quit</Text>
             </Box>
         );
         if(screen.type === 'members')
          return (
        <Box flexDirection="column" flexGrow={1}>
          <Text bold>Members ({members.length})</Text>
          <Box flexDirection="column" flexGrow={1} marginTop={1}>
            {members
            .slice(memberOffset, memberOffset + capacity)
            .map((member) => (
            <Text key={member.id}>
              {member.username}
              {member.id === user?.id ? ' (you)' : ''}
              {member.id === project?.ownerId ? ' . creator' : ''}
            </Text>  
            ))}
            </Box>
            <Text dimColor>↑↓ scroll · Esc back · q quit</Text>
            </Box>
          );
          if (screen.type === 'detail')
            return (
          <Box flexDirection="column" flexGrow={1}>
            {selected ? (
              <Details
            task={selected}
            members={members}
            maxLines={rows - 9}
            offset={detailOffset}
          />
        ) : (
          <Text>Task no longer exists. Return and refresh.</Text>
        )}
        <Text dimColor>↑↓ scroll notes · Esc/Enter back · q quit</Text>
          </Box>
          );
          if (screen.type === 'search')
            return (
          <Box flexDirection="column" gap={1}>
            <Text bold> Search title, notes, or assignee</Text>
            <TextInput
            value={draftQuery}
            focus={canUse && !busy}
            onChange={(value) => setDraftQuery(value.slice(0, 160))}
            onSubmit={() => {
              setQuery(draftQuery.trim());
              setScreen({ type: 'tasks' });
            }}
            />
            <Text dimColor>Enter search · Ctrl+U clear text · Esc cancel</Text>
          </Box>
            );
        return (
          <Box flexDirection="column" flexGrow={1}>
            <Text wrap="truncate-end">
              <Text bold>{project?.name}</Text> · {members.length} members ·{' '}
          {tasks.filter((task) => task.status === 'done').length}/{tasks.length}{' '}
          done
          </Text>
          <Text color={theme.accent} wrap="truncate-end">
            Filter: {filter === 'all' ? 'All tasks' : statusLabel[filter]}
            {query ? ` · Search: ${query}` : ''}
            </Text>
            <Box
            flexDirection="row"
            flexGrow={1}
            marginTop={1}
            height={capacity + 1}
            >
              <Box
              flexDirection="column"
              width={wide ? '55%' : '100%'}
              paddingRight={wide ? 2 : 0}
              >
                {!filtered.length ? (
                  <Text>
                    {tasks.length === 0
                    ? 'No tasks yet. Press n to add the first one.'
                  : 'No matching tasks. Press x to clear filters.'}
                  </Text>
                  ) : (
                    filtered.slice(listStart, listStart + capacity).map((task) => (
                      <Text
                      key={task.id}
                      wrap="truncate-end"
                      color={task.id === selected?.id ? theme.accent : undefined}
                      >
                        {task.id === selected?.id ? '> ' : '  '}
                  {statusMark[task.status]} {task.title}
                  {task.priority === 'high' ? ' !high' : ''}
                      </Text>
                    ))
                  )}
                  {filtered.length > capacity ? (
                    <Text dimColor>
                      {selectedIndex + 1}/{filtered.length} · ↑↓ scroll
                    </Text>
                   ) : null}
              </Box>
              {wide && selected ? (
                <Box
              width="45%"
            borderStyle={"single"}
            borderColor={theme.accent}
            paddingX={1}
          >
            <Details
            task={selected}
          members={members}
          maxLines={capacity - 1}
        />
      </Box>
        ) : null}
          </Box>
          <Text dimColor>n new · e edit · Space status · d delete</Text>
          <Text dimColor>
            ↑↓ select · Enter details · Tab filter · / search · x clear
          </Text>
        <Text dimColor>
          r refresh · m members · i invite · b projects · q quit
        </Text>
       </Box>
     );
    }
    
    return (
      <Box
      flexDirection="column"
      width={Math.max(1, columns)}
      paddingX={columns  >= 60 ? 2 : 1}
      paddingY={1}
      >
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color={theme.accent}>
            taskink
            <Text color={undefined}> / {user ? 'workspace' : 'welcome'}</Text>
          </Text>
          {user ? <Text dimColor>@{user.username}</Text> : null}
        </Box>
        {!canUse ? (
          <Text>Resize to at least 42 columns × 18 rows. Ctrl+C quits.</Text>
        ) : null}
        <Box flexDirection="column" display={canUse ? 'flex' : 'none'}>
          {body()}
        </Box>
        <Notice busy={busy} message={message} />
      </Box>
    );
  }

  