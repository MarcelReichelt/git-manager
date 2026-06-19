import React, { type ReactNode } from 'react';
import { Box } from 'ink';

interface DialogOverlayProps {
  width: number;
  height: number;
  children: ReactNode;
}

export function DialogOverlay({ width, height, children }: DialogOverlayProps) {
  return (
    <Box
      position="absolute"
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
    >
      {children}
    </Box>
  );
}
