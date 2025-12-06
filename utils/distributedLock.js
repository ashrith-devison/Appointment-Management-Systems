import redisCache from './redis.js';

/**
 * Distributed lock utility for preventing race conditions
 */
class DistributedLock {
  constructor() {
    this.lockPrefix = 'lock:';
    this.defaultTTL = 30; // 30 seconds
  }

  /**
   * Acquire a distributed lock
   * @param {string} key - Lock key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - True if lock acquired, false otherwise
   */
  async acquire(key, ttl = this.defaultTTL) {
    if (!redisCache.isConnected) {
      // Fallback to in-memory lock if Redis is not available
      return this.acquireMemoryLock(key, ttl);
    }

    const lockKey = `${this.lockPrefix}${key}`;
    const lockValue = `${Date.now()}-${Math.random()}`;

    try {
      // Use SET with NX (only if not exists) and PX (expire in milliseconds)
      const result = await redisCache.set(lockKey, lockValue, ttl);
      return result === 'OK';
    } catch (error) {
      console.error('Error acquiring distributed lock:', error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   * @param {string} key - Lock key
   * @returns {Promise<boolean>} - True if lock released, false otherwise
   */
  async release(key) {
    if (!redisCache.isConnected) {
      return this.releaseMemoryLock(key);
    }

    const lockKey = `${this.lockPrefix}${key}`;

    try {
      await redisCache.del(lockKey);
      return true;
    } catch (error) {
      console.error('Error releasing distributed lock:', error);
      return false;
    }
  }

  /**
   * Execute a function with a lock
   * @param {string} key - Lock key
   * @param {Function} fn - Function to execute
   * @param {number} ttl - Lock TTL in seconds
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<any>} - Function result
   */
  async withLock(key, fn, ttl = this.defaultTTL, maxRetries = 3) {
    let attempts = 0;

    while (attempts < maxRetries) {
      const lockAcquired = await this.acquire(key, ttl);

      if (lockAcquired) {
        try {
          const result = await fn();
          return result;
        } finally {
          await this.release(key);
        }
      }

      attempts++;
      if (attempts < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to acquire lock for key: ${key} after ${maxRetries} attempts`);
  }

  // In-memory fallback for when Redis is not available
  acquireMemoryLock(key, ttl) {
    if (!this.memoryLocks) {
      this.memoryLocks = new Map();
    }

    const now = Date.now();
    const existingLock = this.memoryLocks.get(key);

    if (existingLock && existingLock.expires > now) {
      return false; // Lock is still held
    }

    this.memoryLocks.set(key, {
      expires: now + (ttl * 1000),
      value: `${now}-${Math.random()}`
    });

    return true;
  }

  releaseMemoryLock(key) {
    if (this.memoryLocks) {
      this.memoryLocks.delete(key);
    }
    return true;
  }
}

const distributedLock = new DistributedLock();

export default distributedLock;