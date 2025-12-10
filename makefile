# Makefile for Node.js Backend Project
# Supports GitHub Actions, Docker, and Automation

.PHONY: help install test test-unit test-integration test-stress build run clean docker-build docker-run docker-stop lint format ci deploy release security-scan maintenance

# Default target
help:
	@echo "Available targets:"
	@echo "  install       - Install dependencies"
	@echo "  test          - Run all tests"
	@echo "  test-unit     - Run unit tests"
	@echo "  test-integration - Run integration tests"
	@echo "  test-stress   - Run stress tests"
	@echo "  build         - Build the application"
	@echo "  run           - Run the application"
	@echo "  clean         - Clean build artifacts"
	@echo "  docker-build  - Build Docker image"
	@echo "  docker-run    - Run Docker container"
	@echo "  docker-stop   - Stop Docker container"
	@echo "  lint          - Run linting"
	@echo "  format        - Format code"
	@echo "  ci            - Run CI pipeline locally"
	@echo "  release       - Create a new release"
	@echo "  security-scan - Run security scanning"
	@echo "  maintenance   - Run maintenance tasks"
	@echo "  deploy        - Deploy application"

# Install dependencies
install:
	npm install

# Run all tests
test:
	npm test

# Run unit tests
test-unit:
	npm run test:unit

# Run integration tests
test-integration:
	npm run test:integration

# Run stress tests
test-stress:
	npm run test:auth:stress
	npm run test:doctor:stress

# Build the application
build:
	npm run build

# Run the application
run:
	npm start

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf .nyc_output/
	rm -rf coverage/

# Docker targets
docker-build:
	docker build -t backend-core .

docker-run:
	docker run -d --name backend-core-container -p 3000:3000 backend-core

docker-stop:
	docker stop backend-core-container || true
	docker rm backend-core-container || true

# Code quality
lint:
	npm run lint

format:
	npm run format

# CI pipeline (for local testing)
ci: install lint test docker-build

# Release management
release:
	@echo "To create a release:"
	@echo "1. Update version in package.json"
	@echo "2. Commit changes"
	@echo "3. Create git tag: git tag v1.2.3"
	@echo "4. Push tag: git push origin v1.2.3"
	@echo "5. GitHub Actions will create the release automatically"

# Security scanning
security-scan:
	npm audit
	@echo "For full security scan, run GitHub Actions workflow"

# Maintenance tasks
maintenance:
	@echo "Running maintenance tasks..."
	npm outdated
	@echo "For full maintenance, run GitHub Actions workflow"

# Deploy (placeholder - customize based on your deployment strategy)
deploy:
	@echo "Deploying application..."
	# Add your deployment commands here
	# Example: docker push, kubectl apply, etc.
