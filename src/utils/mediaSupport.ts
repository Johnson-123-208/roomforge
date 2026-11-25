export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function canShareScreen(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function',
  );
}
