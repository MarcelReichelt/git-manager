export const PICKER_MAX_VISIBLE = 10;

export function pickerDialogWidth(columns: number): number {
  return Math.min(Math.max(32, columns - 8), 52);
}

export function pickerInnerHeight(choiceCount: number): number {
  return Math.min(choiceCount, PICKER_MAX_VISIBLE);
}

export function truncatePickerHint(
  width: number,
  hint = '↑/↓ select · Enter confirm · Esc cancel',
): string {
  if (hint.length <= width) {
    return hint;
  }
  return hint.slice(0, width);
}
