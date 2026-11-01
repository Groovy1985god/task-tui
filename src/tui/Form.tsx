import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from './theme.ts';

export interface Field {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  maxLength?: number;
  password?: boolean;
  options?: { value: string; label: string }[];
  validate?: (value: string) => string | undefined;
}

export function Form({
  title,
  fields,
  busy,
  rows,
  onSave,
  onCancel,
}: {
  title: string;
  fields: Field[];
  busy: boolean;
  rows: number;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  );
  const [focus, setFocus] = useState(0);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const active = fields[focus];
  const dirty = fields.some((field) => values[field.key] !== field.value);

  function save() {
    if (busy) return;
    for (const [index, field] of fields.entries()) {
      const value = values[field.key] ?? '';
      const problem =
        field.required && !value.trim()
          ? `${field.label} is required.`
          : field.validate?.(value);
      if (problem) {
        setFocus(index);
        setError(problem);
        return;
      }
    }
    setError('');
    onSave(values);
  }

  function advance() {
    if (focus === fields.length - 1) save();
    else setFocus((current) => current + 1);
  }

  useInput((input, key) => {
    if (busy) return;
    if (discard) {
      if (input.toLowerCase() === 'y') onCancel();
      else if (input.toLowerCase() === 'n' || key.escape || key.return)
        setDiscard(false);
      return;
    }
    if (key.escape) {
      if (dirty) setDiscard(true);
      else onCancel();
      return;
    }
    if (key.ctrl && input === 's') {
      save();
      return;
    }
    if (key.ctrl && input === 'u' && active && !active.options) {
      setValues((current) => ({ ...current, [active.key]: '' }));
      return;
    }
    if (key.tab || key.upArrow || key.downArrow) {
      const direction = key.upArrow || (key.tab && key.shift) ? -1 : 1;
      setFocus(
        (current) => (current + direction + fields.length) % fields.length,
      );
    } else if (active?.options) {
      if (key.leftArrow || key.rightArrow || input === '') {
        const selected = active.options.findIndex(
          (option) => option.value === values[active.key],
        );
        const next =
          (selected + (key.leftArrow ? -1 : 1) + active.options.length) %
          active.options.length;
        const option = active.options[next];
        if (option)
          setValues((current) => ({ ...current, [active.key]: option.value }));
      } else if (key.return) advance();
    }
  });

  const capacity = Math.max(1, Math.floor((rows - 10) / 3));
  const start = Math.min(
    Math.max(0, focus - capacity + 1),
    Math.max(0, fields.length - capacity),
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>{title}</Text>
      <Text dimColor>
        Field {focus + 1}/{fields.length}
        {start > 0 || fields.length > capacity
          ? ' · Tab to reach every field'
          : ''}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {fields.slice(start, start + capacity).map((field, offset) => {
          const selected = start + offset === focus;
          const value = values[field.key] ?? '';
          return (
            <Box key={field.key} flexDirection="column" marginBottom={1}>
              <Text color={selected ? theme.accent : undefined} bold={selected}>
                {selected ? '> ' : '  '}
                {field.label}
                {field.required ? ' *' : ''}
              </Text>
              <Box paddingLeft={2}>
                {field.options ? (
                  <Text
                    color={selected ? theme.accent : undefined}
                    wrap="truncate-end"
                  >
                    {selected ? '← ' : ''}
                    {field.options.find((option) => option.value === value)
                      ?.label ?? 'Unassigned'}
                    {selected ? ' →' : ''}
                  </Text>
                ) : selected && !discard ? (
                  <TextInput
                    value={value}
                    focus={!busy}
                    mask={field.password ? '*' : undefined}
                    placeholder={field.required ? 'Required' : 'Optional'}
                    onChange={(next) => {
                      if (!field.maxLength || next.length <= field.maxLength) {
                        setValues((current) => ({
                          ...current,
                          [field.key]: next,
                        }));
                        setError('');
                      }
                    }}
                    onSubmit={advance}
                  />
                ) : (
                  <Text dimColor={!value} wrap="truncate-end">
                    {field.password
                      ? '*'.repeat(value.length)
                      : value || 'Optional'}
                  </Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      {error ? <Text color={theme.danger}>{error}</Text> : null}
      {discard ? (
        <Text color={theme.warning}>
          Discard unsaved changes? Y discard · N/Enter keep editing
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>Tab/↑↓ fields · ←→ choices · Enter next/save</Text>
          <Text dimColor>Ctrl+S save · Esc cancel · Ctrl+U clear text</Text>
        </Box>
      )}
    </Box>
  );
}
