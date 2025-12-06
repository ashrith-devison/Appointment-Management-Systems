/**
 * Utility functions for compiling Swagger/OpenAPI specifications
 */

import swaggerUi from 'swagger-ui-express';

/**
 * Deep merges multiple objects into one
 * @param {Object[]} objects - Array of objects to merge
 * @returns {Object} - Merged object
 */
function deepMerge(...objects) {
  const result = {};

  objects.forEach(obj => {
    Object.keys(obj).forEach(key => {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        result[key] = deepMerge(result[key] || {}, obj[key]);
      } else {
        result[key] = obj[key];
      }
    });
  });

  return result;
}

/**
 * Compiles an array of Swagger/OpenAPI configuration objects into a single specification
 * @param {Object[]} configs - Array of Swagger config objects
 * @returns {Object} - Compiled Swagger/OpenAPI specification
 */
function compileSwagger(configs) {
  if (!Array.isArray(configs)) {
    throw new Error('Input must be an array of Swagger config objects');
  }

  // Start with a base OpenAPI structure
  const baseSpec = {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0'
    },
    paths: {},
    components: {
      schemas: {},
      responses: {},
      parameters: {},
      examples: {},
      requestBodies: {},
      headers: {},
      securitySchemes: {},
      links: {},
      callbacks: {}
    },
    tags: [],
    servers: []
  };

  // Merge all configs with the base spec
  const mergedSpec = deepMerge(baseSpec, ...configs);

  return mergedSpec;
}

/**
 * Sets up Swagger UI for the given Express app with the provided specification
 * @param {Object} app - Express app instance
 * @param {Object|Object[]} specOrSpecs - Swagger spec object or array of spec objects
 */
function setupSwagger(app, specOrSpecs) {
  // Base OpenAPI structure
  const baseSpec = {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0'
    },
    paths: {},
    components: {
      schemas: {},
      responses: {},
      parameters: {},
      examples: {},
      requestBodies: {},
      headers: {},
      securitySchemes: {},
      links: {},
      callbacks: {}
    },
    tags: [],
    servers: []
  };

  let spec;

  if (Array.isArray(specOrSpecs)) {
    spec = compileSwagger(specOrSpecs);
  } else {
    spec = deepMerge(baseSpec, specOrSpecs);
  }

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
}

export default setupSwagger;
export { compileSwagger, deepMerge };
