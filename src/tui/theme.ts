export const theme = {
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
} as const;

export const statusLabel = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
} as const;
export const statusMark = {
  todo: '[ ]',
  in_progress: '[>]',
  done: '[x]',
} as const;
