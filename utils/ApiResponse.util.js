/**
 * Utility class for standardized API responses
 */
class ApiResponse {
  /**
   * Creates an instance of ApiResponse
   * @param {number} statusCode - HTTP status code
   * @param {any} data - Response data
   * @param {string} message - Response message (default: 'Success')
   * @param {boolean} success - Success flag (default: true for 2xx codes)
   */
  constructor(statusCode, data, message = 'Success', success) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = success !== undefined ? success : statusCode < 400;
  }

  /**
   * Sends the response using Express response object
   * @param {Object} res - Express response object
   */
  send(res) {
    res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data
    });
  }

  /**
   * Creates a success response (200)
   * @param {any} data - Response data
   * @param {string} message - Response message
   * @returns {ApiResponse} - ApiResponse instance
   */
  static success(data, message = 'Success') {
    return new ApiResponse(200, data, message);
  }

  /**
   * Creates a created response (201)
   * @param {any} data - Response data
   * @param {string} message - Response message
   * @returns {ApiResponse} - ApiResponse instance
   */
  static created(data, message = 'Created successfully') {
    return new ApiResponse(201, data, message);
  }

  /**
   * Creates an accepted response (202)
   * @param {any} data - Response data
   * @param {string} message - Response message
   * @returns {ApiResponse} - ApiResponse instance
   */
  static accepted(data, message = 'Accepted') {
    return new ApiResponse(202, data, message);
  }

  /**
   * Creates a no content response (204)
   * @param {string} message - Response message
   * @returns {ApiResponse} - ApiResponse instance
   */
  static noContent(message = 'No Content') {
    return new ApiResponse(204, null, message);
  }

  /**
   * Creates an OK response (200) with pagination info
   * @param {any[]} data - Response data array
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items
   * @param {string} message - Response message
   * @returns {ApiResponse} - ApiResponse instance
   */
  static paginated(data, page, limit, total, message = 'Success') {
    const totalPages = Math.ceil(total / limit);
    const pagination = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return new ApiResponse(200, { data, pagination }, message);
  }
}

export default ApiResponse;