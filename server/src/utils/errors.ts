export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
