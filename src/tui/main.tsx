import { render } from 'ink';
import '../config.ts';
import { createClient } from '../client/api.ts';
import { App } from './App.tsx';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Task-TUI needs an interactive terminal. ');
} else {
  try {
    const api = createClient(process.env.API_URL ?? 'http://127.0.0.1:3000');
    const instance = render(<App api={api} />);
    instance.waitUntilExit();
    instance.cleanup();
  } catch (e) {
    console.log('Could not open Task-TUI', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
