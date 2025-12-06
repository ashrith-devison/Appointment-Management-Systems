/**
 * Custom API Error class for handling HTTP errors
 */
class ApiError extends Error {
  /**
   * Creates an instance of ApiError
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {boolean} isOperational - Whether the error is operational (default: true)
   * @param {string} stack - Error stack trace
   */
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Creates a bad request error (400)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static badRequest(message) {
    return new ApiError(400, message);
  }

  /**
   * Creates an unauthorized error (401)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  /**
   * Creates a forbidden error (403)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  /**
   * Creates a not found error (404)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static notFound(message = 'Not Found') {
    return new ApiError(404, message);
  }

  /**
   * Creates an internal server error (500)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message);
  }

  /**
   * Creates a conflict error (409)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  /**
   * Creates an unprocessable entity error (422)
   * @param {string} message - Error message
   * @returns {ApiError} - ApiError instance
   */
  static unprocessableEntity(message = 'Unprocessable Entity') {
    return new ApiError(422, message);
  }
}

export default ApiError;
