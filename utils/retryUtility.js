/**
 * Retry utility with exponential backoff for handling failed operations
 */
class RetryUtility {
  constructor() {
    this.defaultMaxRetries = 3;
    this.defaultBaseDelay = 1000; // 1 second
    this.defaultMaxDelay = 30000; // 30 seconds
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @param {number} options.maxRetries - Maximum retry attempts
   * @param {number} options.baseDelay - Base delay in milliseconds
   * @param {number} options.maxDelay - Maximum delay in milliseconds
   * @param {Function} options.shouldRetry - Function to determine if error should be retried
   * @returns {Promise<any>} - Function result
   */
  async withRetry(fn, options = {}) {
    const {
      maxRetries = this.defaultMaxRetries,
      baseDelay = this.defaultBaseDelay,
      maxDelay = this.defaultMaxDelay,
      shouldRetry = this.defaultShouldRetry
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Default function to determine if an error should be retried
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether to retry
   */
  defaultShouldRetry(error) {
    // Retry on network errors, timeouts, and temporary server errors
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      '500', // Internal Server Error
      '502', // Bad Gateway
      '503', // Service Unavailable
      '504' // Gateway Timeout
    ];

    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    return retryableErrors.some(retryableError =>
      errorMessage.includes(retryableError) ||
      errorCode.includes(retryableError) ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network')
    );
  }

  /**
   * Sleep for a specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute database operation with retry
   * @param {Function} dbOperation - Database operation function
   * @param {Object} options - Retry options
   * @returns {Promise<any>} - Operation result
   */
  async withDbRetry(dbOperation, options = {}) {
    return this.withRetry(dbOperation, {
      ...options,
      shouldRetry: (error) => {
        // Retry on connection errors and some MongoDB errors
        return error.name === 'MongoNetworkError' ||
               error.name === 'MongoTimeoutError' ||
               error.code === 11000 || // Duplicate key error (might be temporary)
               this.defaultShouldRetry(error);
      }
    });
  }

  /**
   * Execute payment operation with retry
   * @param {Function} paymentOperation - Payment operation function
   * @param {Object} options - Retry options
   * @returns {Promise<any>} - Operation result
   */
  async withPaymentRetry(paymentOperation, options = {}) {
    return this.withRetry(paymentOperation, {
      maxRetries: 2, // Fewer retries for payment operations
      ...options,
      shouldRetry: (error) => {
        // Only retry on network errors, not on payment validation errors
        return error.message.includes('network') ||
               error.message.includes('timeout') ||
               error.code === 'ECONNRESET' ||
               error.code === 'ETIMEDOUT';
      }
    });
  }

  /**
   * Execute notification operation with retry
   * @param {Function} notificationOperation - Notification operation function
   * @param {Object} options - Retry options
   * @returns {Promise<any>} - Operation result
   */
  async withNotificationRetry(notificationOperation, options = {}) {
    return this.withRetry(notificationOperation, {
      maxRetries: 2, // Fewer retries for notifications
      baseDelay: 2000, // Longer delay for notifications
      ...options
    });
  }
}

const retryUtility = new RetryUtility();

export default retryUtility;