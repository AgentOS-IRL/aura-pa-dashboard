export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ...(error as unknown as Record<string, unknown>)
    };
  }
  return error;
}
