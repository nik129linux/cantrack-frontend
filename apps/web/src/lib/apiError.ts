/** An API failure with what the screens need: status, Retry-After and errorId. */
export class ApiError extends Error {
  status: number;
  retryAfter: number | null = null;
  errorId: string | null = null;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
