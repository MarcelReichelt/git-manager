import React from 'react';
import { Box, Text } from 'ink';
import { truncateEnd, FOOTER_ACTIONS } from '../layout.js';

interface FooterProps {
  message: string;
  width: number;
}

export function Footer({ message, width }: FooterProps) {
  const status = message || 'Ready';

  return (
    <Box flexDirection="column" height={2} overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text color="gray">{truncateEnd(FOOTER_ACTIONS, width)}</Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text color={message ? 'yellow' : 'gray'} dimColor={!message}>
          {truncateEnd(status, width)}
        </Text>
      </Box>
    </Box>
  );
}
