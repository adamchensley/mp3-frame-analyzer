import { Mp3ParseError } from './parser/types.js';

/** Domain error with a stable machine-readable code and an HTTP status. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NoFileError extends AppError {
  constructor() {
    super(400, 'NO_FILE', 'Request must be multipart/form-data containing exactly one file part.');
  }
}

export class MultipleFilesError extends AppError {
  constructor() {
    super(
      400,
      'MULTIPLE_FILES',
      'Upload exactly one file per request; multiple file parts were received.',
    );
  }
}

export class UploadTooLargeError extends AppError {
  constructor(maxBytes?: number) {
    super(
      413,
      'FILE_TOO_LARGE',
      maxBytes !== undefined
        ? `The uploaded file exceeds the maximum allowed size of ${maxBytes} bytes.`
        : 'The uploaded file exceeds the maximum allowed size.',
    );
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(message: string) {
    super(422, 'UNSUPPORTED_FORMAT', message);
  }
}

/** Codes thrown by @fastify/multipart that we translate into our envelope. */
const MULTIPART_ERROR_MAP: Record<string, () => AppError> = {
  FST_INVALID_MULTIPART_CONTENT_TYPE: () => new NoFileError(),
  FST_REQ_FILE_TOO_LARGE: () => new UploadTooLargeError(),
  FST_FILES_LIMIT: () => new MultipleFilesError(),
  FST_PARTS_LIMIT: () => new MultipleFilesError(),
};

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Mp3ParseError) return new UnsupportedFormatError(error.message);
  if (error instanceof Error && 'code' in error) {
    const translate = MULTIPART_ERROR_MAP[String(error.code)];
    if (translate) return translate();
  }
  return new AppError(500, 'INTERNAL', 'An unexpected error occurred while processing the request.');
}
