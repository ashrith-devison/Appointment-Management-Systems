import express from 'express';
const router = express.Router();

router.get('/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

router.get('/hello/:name', (req, res) => {
  const { name } = req.params;
  res.json({ message: `Hello, ${name}!` });
});

router.post('/hello', (req, res) => {
  const { message } = req.body;
  // In a real app, you'd save this to a database
  res.status(201).json({ id: 1, message });
});

// Swagger configuration for this route
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/hello': {
      get: {
        summary: 'Get a hello message',
        description: 'Returns a simple hello world message',
        tags: ['Hello'],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Hello, World!'
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create a hello message',
        description: 'Creates a new hello message',
        tags: ['Hello'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: 'The message to create',
                    example: 'Custom hello message'
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Message created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'integer',
                      example: 1
                    },
                    message: {
                      type: 'string',
                      example: 'Custom hello message'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/hello/{name}': {
      get: {
        summary: 'Get a personalized hello message',
        description: 'Returns a hello message with the provided name',
        tags: ['Hello'],
        parameters: [
          {
            in: 'path',
            name: 'name',
            required: true,
            description: 'The name to greet',
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Hello, John!'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Returns the health status of the application',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Application is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'healthy'
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      example: '2023-12-10T10:00:00.000Z'
                    },
                    uptime: {
                      type: 'number',
                      example: 123.456
                    },
                    version: {
                      type: 'string',
                      example: '1.0.0'
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      Authorization: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      HelloMessage: {
        type: 'object',
        properties: {
          message: {
            type: 'string'
          }
        }
      }
    }
  }
};

export default router;
export { swaggerConfig };
