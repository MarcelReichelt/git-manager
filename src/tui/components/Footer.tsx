import React from 'react';
import { Box, Text } from 'ink';
import { truncateEnd, footerActionsForStage } from '../layout.js';
import { STAGE_REPOS, type Stage } from '../carousel.js';

interface FooterProps {
  message: string;
  width: number;
  stage?: Stage;
}

export function Footer({ message, width, stage = STAGE_REPOS }: FooterProps) {
  const status = message || 'Ready';

  return (
    <Box flexDirection="column" height={2} overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text color="gray">{truncateEnd(footerActionsForStage(stage), width)}</Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text color={message ? 'yellow' : 'gray'} dimColor={!message}>
          {truncateEnd(status, width)}
        </Text>
      </Box>
    </Box>
  );
}
