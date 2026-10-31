import express, {
    Router,
    type ErrorRequestHandler,
    type RequestHandler,
    type Response,
} from 'express';
import { AppError } from '../shared/errors.ts';
import type { User } from '../shared/types.ts';
import * as validate from '../shared/validation.ts';
import  { hashPassword, newToken, tokenHash, verifyPassword } from './auth.ts';
import type { Store } from './store.ts';

type AuthResponse = Response<
  unknown,
  {
    user: User;
    sessionHash: string;
    projectId: string;
  }
  >;

  export function createApi(
    store: Store,
    reportError: (error:unknown) => void = console.error,
  ) {
    const app = express();
    app.disable('x-powered-by');
    app.disable('etag');
    app.enable('case sensitive routing');
    app.use((_request, response, next) => {
        response.set({
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        next();
    });

    const requireJson: RequestHandler = (request, _response, next) => {
        const contentType = request
        .get('content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase();
        if (contentType !== 'application/json') {
            throw new AppError(415, 'Send the request as application/json.');
        }
        next();
    };
    const jsonBody = [
        requireJson,
        express.json({ limit: 32_768, strict: false, inflate: false}),
    ];

    const authAttempts = new Map<string, { count: number; resetAt: number }>();
    const limitAuth: RequestHandler = (request, _response, next) => {
        const now = Date.now();
        for (const [ip, bucket] of authAttempts) {
            if (bucket.resetAt < now) authAttempts.delete(ip);
        }
        const ip = request.socket.remoteAddress ?? 'unknown';
        const bucket = authAttempts.get(ip) ?? { count: 0, resetAt: now + 900_000 };
        authAttempts.set(ip, bucket);
        if (++bucket.count > 30) {
            throw new AppError(
                429,
                'Too many sign-in attempts. Try again in 15 minutes.',
            );
        }
        next();
    };

    async function issueSession(user:User) {
        const token = newToken();
        await store.createSession(
            user.id,
            tokenHash(token),
            new Date(Date.now() + 7 * 86_400_000),
        );
        return { user, token };
    }

    app.get('/health', async (_request, response) => {
        await store.health();
        response.json({ status: 'ok'});
    });
    app.post(
        '/auth/register',
        limitAuth,
        ...jsonBody,
        async (request, response) => {
            const { username, password } = validate.credentials(request.body);
            const user = await store.createUser(
                username,
                await hashPassword(password),
            );
            response.status(201).json(await issueSession(user));
        },
    );
    app.post('/auth/login', limitAuth, ...jsonBody, async (request, response) => {
        const { username, password } = validate.credentials(request.body);
        const found = await store.findUser(username);
        // Perform scrypt for unknown usernames as well to reduce timing differences.
        const correct = await verifyPassword(
            password,
            found?.passwordHash ?? '0'.repeat(32) + ':' + '0'.repeat(128),
        );
        if (!found || !correct)
            throw new AppError(401, 'Incorrect username or password.');
        response.json(
            await issueSession({ id: found.id, username: found.username }),
        );
    });

    const authenticated = Router();
    authenticated.use(async (request, response: AuthResponse, next) => {
        const authorization = request.get('authorization');
        const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
        const hash = tokenHash(token);
        const user = /^[a-f0-9]{64}$/u.test(token)
        ? await store.sessionUser(hash)
        : undefined;
        if (!user)
          throw new AppError(
        401,
        'Sign in to continue. Your session may have expired.',
      );
    response.locals.user = user;
    response.locals.sessionHash = hash;
    next();    
    });
    authenticated.get('/auth/me', (_request, response: AuthResponse) => {
        response.json(response.locals.user);
    });
    authenticated.post(
        '/auth/logout',
        async (_request, response: AuthResponse) => {
            await store.deleteSession(response.locals.sessionHash);
            response.status(204).end();
        }
    );
    authenticated.get('/projects', async (_request, response: AuthResponse) => {
        response.json(await store.listProjects(response.locals.user.id));
    });
    authenticated.post(
        '/projects',
        ...jsonBody,
        async (request, response: AuthResponse) => {
            const name = validate.projectName(request.body);
            response
            .status(201)
            .json(await store.createProject(response.locals.user.id, name));
        },
    );
    authenticated.post(
        '/projects/join',
        ...jsonBody,
        async (request, response: AuthResponse) => {
            const project = await store.joinProject(
                response.locals.user.id,
                validate.inviteCode(request.body),
            );
            if (!project)
                throw new AppError(
            404,
        'No project has that invite code. Check it with a member.',
    );
    response.json(project);
        }
    );

    const projectRoutes = Router ({ mergeParams: true });
    projectRoutes.use(async (request, response: AuthResponse, next) => {
    const projectId = validate.uuid(request.params.projectId, 'Project ID');
    // Authorize all project resources before looking up members or tasks.
    if (!(await store.isMember(projectId, response.locals.user.id))) {
      throw new AppError(403, 'Join this project before accessing it.');
     }
    response.locals.projectId = projectId;
    next();
  });
  projectRoutes.get('/members', async (_request, response: AuthResponse) => {
    response.json(await store.listMembers(response.locals.projectId));
  });
  projectRoutes.get('/tasks', async (_request, response: AuthResponse) => {
    response.json(await store.listTasks(response.locals.projectId));
  });
  projectRoutes.post(
    '/tasks',
    ...jsonBody,
    async (request, response: AuthResponse) => {
        const { projectId, user } = response.locals;
        const input = validate.taskInput(request.body);
        if(
            input.assigneeId &&
            !(await store.isMember(projectId, input.assigneeId))
        ) {
            throw new AppError(400, 'Assign tasks to a member of this project.');
        }
        response
        .status(201)
        .json(await store.createTask(projectId, user.id, input));
    },
  );
  projectRoutes.patch(
    '/tasks/:taskId',
    ...jsonBody,
    async (request, response: AuthResponse) => {
        const projectId = response.locals.projectId;
        const taskId = validate.uuid(request.params.taskId, 'Task ID');
        const body = validate.object(request.body);
        const input = validate.taskInput(body);
        const version = validate.version(body.version);
        if(
            input.assigneeId &&
            !(await store.isMember(projectId, input.assigneeId))
        ) {
            throw new AppError(400, 'Assign tasks to a member of this project.');
        }
        response.json(await store.updateTask(projectId, taskId, version, input));
    },
  );
  projectRoutes.delete(
    '/tasks/:taskId',
    ...jsonBody,
    async (request, response: AuthResponse) => {
        const taskId = validate.uuid(request.params.taskId, 'Task ID');
        const body = validate.object(request.body);
        await store.deletetask(
            response.locals.projectId,
            taskId,
            validate.version(body.version),
        );
        response.status(204).end();
    },
  );
  authenticated.use('/projects/:projectId', projectRoutes);
  app.use(authenticated);

  app.use((_request, _response, next) =>
   next(new AppError(404, 'Endpoint not found.')),
);
const handleError: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
) => {
    if (response.headersSent) {
        next(error);
        return;
    }
     if (error instanceof AppError) {
      response.status(error.status).json({ error: error.message });
      return;
     }
     const type =
     error && typeof error === 'object' && 'type' in error
     ? error.type
     :undefined;
     if (error instanceof URIError) {
        response
        .status(400)
        .json({ error: 'Request path contains invalid encoding.'});
     } else if (type === 'entity.parse.failed') {
        response.status(400).json({ error: 'Request body must be valid JSON.' });
     } else if (type === 'entity.too.large') {
        response.status(413).json({ error: 'Request is too large.'});
     } else if (
        type === 'charset.unsupported' ||
        type === 'encoding.unsupported'
     ) {
        response
        .status(415)
        .json({ error: 'Send uncompressed UTF-8 application/json.'});
     } else {
        reportError(error);
        response.status(500).json({
            error: 'The server could not complete the request. Please retry.',
        });
     }
    };
    app.use(handleError);
    return app;
}

