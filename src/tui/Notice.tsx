 import { Box, Text } from 'ink';
 import { theme } from './theme.ts';

 export interface Message {
    kind: 'success' | 'error';
    text: string;
 }

 export function Notice({
    message,
    busy,
 }: {
    message?: Message;
    busy: boolean;
 }) {
    return (
        <Box minHeight={2} marginTop={1}>
            {busy ? (
                <Text color={theme.warning}>Working...</Text>
            ) : message ? (
                <Text color={message.kind === 'error' ? theme.danger : theme.success}>
                    {message.kind === 'error' ? 'Error: ' : ''}
                    {message.text}
                    </Text>
                  ) : (
                    <Text dimColor> Changes are saved to the shared project.</Text>
                  )}
                  </Box>
    );
}
              
    
 