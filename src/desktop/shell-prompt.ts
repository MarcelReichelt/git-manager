export function shellCanTakeInput(buffer: string): boolean {
  const visible = buffer
    .replace(/\u001b(?:\[[0-9;?]*[A-Za-z]|\][^\u0007]*(?:\u0007|\u001b\\))/g, '')
    .replace(/\r/g, '');
  return /(?:[$#%>]|❯|➜|λ|›|»)\s*$/.test(visible);
}
