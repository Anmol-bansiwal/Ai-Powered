function collectMessages(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown database error';
  }

  const messages = [error.message];
  if (error.cause instanceof Error && error.cause.message) {
    messages.push(error.cause.message);
  }

  return messages.join(' ');
}

export function sanitizeDatabaseError(error: unknown): string {
  return collectMessages(error)
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[redacted]')
    .replace(/(password=)[^\s&'"]+/gi, '$1[redacted]');
}
