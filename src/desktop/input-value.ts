export function inputValue(event: Event): string {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    return target.value;
  }
  return '';
}
