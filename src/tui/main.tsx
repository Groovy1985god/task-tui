import { render } from 'ink';
import '../config';
import { createClient } from '../client/api';
import { App } from './App';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Task-TUI needs an interactive terminal. ');
} else {
  try {
    const api = createClient(process.env.API_URL ?? 'http://127.0.0.1:3000');
    const instance = render(<App api={api} />);
    await instance.waitUntilExit();
    instance.cleanup();
  } catch (e) {
    console.log('Could not open Task-TUI', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
