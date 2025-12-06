import { createClient } from 'redis';

class RedisCache {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      console.log('Continuing without Redis caching...');
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  // Set a key-value pair with optional expiration
  async set(key, value, expireInSeconds = null) {
    if (!this.isConnected) return false;
    try {
      const serializedValue = JSON.stringify(value);
      if (expireInSeconds) {
        await this.client.setEx(key, expireInSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  // Get a value by key
  async get(key) {
    if (!this.isConnected) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  // Delete a key
  async del(key) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error('Redis del error:', error);
      return 0;
    }
  }

  // Set multiple key-value pairs
  async mset(keyValuePairs) {
    if (!this.isConnected) return null;
    try {
      const serializedPairs = {};
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs[key] = JSON.stringify(value);
      }

      return await this.client.mSet(serializedPairs);
    } catch (error) {
      console.error('Redis mset error:', error);
      return null;
    }
  }

  // Get multiple values by keys
  async mget(keys) {
    if (!this.isConnected) return [];
    try {
      const values = await this.client.mGet(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('Redis mget error:', error);
      return [];
    }
  }

  // Check if key exists
  async exists(key) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.exists(key);
    } catch (error) {
      console.error('Redis exists error:', error);
      return 0;
    }
  }

  // Set expiration on a key
  async expire(key, seconds) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
      return 0;
    }
  }

  // Get time to live for a key
  async ttl(key) {
    if (!this.isConnected) return -2;
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Redis ttl error:', error);
      return -2;
    }
  }

  // Increment a numeric value
  async incr(key) {
    if (!this.isConnected) return null;
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      return null;
    }
  }

  // Decrement a numeric value
  async decr(key) {
    if (!this.isConnected) return null;
    try {
      return await this.client.decr(key);
    } catch (error) {
      console.error('Redis decr error:', error);
      return null;
    }
  }

  // Add to a set
  async sadd(key, ...members) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      console.error('Redis sadd error:', error);
      return 0;
    }
  }

  // Get all members of a set
  async smembers(key) {
    if (!this.isConnected) return [];
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      console.error('Redis smembers error:', error);
      return [];
    }
  }

  // Remove from a set
  async srem(key, ...members) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      console.error('Redis srem error:', error);
      return 0;
    }
  }

  // Check if member exists in set
  async sismember(key, member) {
    if (!this.isConnected) return false;
    try {
      return await this.client.sIsMember(key, member);
    } catch (error) {
      console.error('Redis sismember error:', error);
      return false;
    }
  }

  // Publish to a channel
  async publish(channel, message) {
    if (!this.isConnected) return 0;
    try {
      return await this.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      console.error('Redis publish error:', error);
      return 0;
    }
  }

  // Subscribe to a channel
  async subscribe(channel, callback) {
    if (!this.isConnected) return;
    try {
      await this.client.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          console.error('Error parsing Redis message:', error);
        }
      });
    } catch (error) {
      console.error('Redis subscribe error:', error);
    }
  }
}

// Create singleton instance
const redisCache = new RedisCache();

export default redisCache;