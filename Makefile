# Disnotion Makefile
# Convenient commands for building, testing, and running the application

.PHONY: help install dev dev-server dev-client build build-server build-client test test-server test-client clean clean-server clean-client

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@echo "$(BLUE)Disnotion - Makefile Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(YELLOW)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(BLUE)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(GREEN)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Installation

install: ## Install all dependencies (root, server, and client)
	@echo "$(GREEN)Installing all dependencies...$(NC)"
	@npm install
	@cd server && npm install
	@cd client && npm install
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

##@ Development

dev: ## Run both server and client in development mode
	@echo "$(GREEN)Starting development servers...$(NC)"
	@echo "$(YELLOW)Server: http://localhost:3001$(NC)"
	@echo "$(YELLOW)Client: http://localhost:3000$(NC)"
	@npm run dev

dev-server: ## Run only the server in development mode
	@echo "$(GREEN)Starting server on http://localhost:3001...$(NC)"
	@cd server && npm run dev

dev-client: ## Run only the client in development mode
	@echo "$(GREEN)Starting client on http://localhost:3000...$(NC)"
	@cd client && npm run dev

##@ Building

build: build-server build-client ## Build both server and client for production

build-server: ## Build server for production
	@echo "$(GREEN)Building server...$(NC)"
	@cd server && npm run build
	@echo "$(GREEN)✓ Server built successfully$(NC)"

build-client: ## Build client for production
	@echo "$(GREEN)Building client...$(NC)"
	@cd client && npm run build
	@echo "$(GREEN)✓ Client built successfully$(NC)"

##@ Testing

test: ## Run all tests (server and client)
	@echo "$(GREEN)Running all tests...$(NC)"
	@npm test

test-server: ## Run server tests only
	@echo "$(GREEN)Running server tests...$(NC)"
	@cd server && npm test

test-client: ## Run client tests only
	@echo "$(GREEN)Running client tests...$(NC)"
	@cd client && npm test

test-server-watch: ## Run server tests in watch mode
	@echo "$(GREEN)Running server tests in watch mode...$(NC)"
	@cd server && npm run test:watch

test-client-watch: ## Run client tests in watch mode
	@echo "$(GREEN)Running client tests in watch mode...$(NC)"
	@cd client && npm run test:watch

test-client-ui: ## Run client tests with UI
	@echo "$(GREEN)Running client tests with UI...$(NC)"
	@cd client && npm run test:ui

##@ Cleaning

clean: clean-server clean-client clean-root ## Remove all node_modules and build artifacts

clean-server: ## Clean server build artifacts and dependencies
	@echo "$(YELLOW)Cleaning server...$(NC)"
	@rm -rf server/node_modules
	@rm -rf server/dist
	@rm -rf server/test-data
	@echo "$(GREEN)✓ Server cleaned$(NC)"

clean-client: ## Clean client build artifacts and dependencies
	@echo "$(YELLOW)Cleaning client...$(NC)"
	@rm -rf client/node_modules
	@rm -rf client/dist
	@echo "$(GREEN)✓ Client cleaned$(NC)"

clean-root: ## Clean root dependencies
	@echo "$(YELLOW)Cleaning root...$(NC)"
	@rm -rf node_modules
	@echo "$(GREEN)✓ Root cleaned$(NC)"

##@ Utilities

format: ## Format code (if prettier is configured)
	@echo "$(GREEN)Formatting code...$(NC)"
	@cd server && npx prettier --write "src/**/*.ts"
	@cd client && npx prettier --write "src/**/*.{ts,tsx}"
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint: ## Lint code (if eslint is configured)
	@echo "$(GREEN)Linting code...$(NC)"
	@npm run lint || true

check: test lint ## Run tests and linting

start-prod: build ## Build and start in production mode
	@echo "$(GREEN)Starting production server...$(NC)"
	@cd server && npm start

##@ Quick Actions

fresh: clean install test ## Clean install and test everything
	@echo "$(GREEN)✓ Fresh installation complete!$(NC)"

reset: clean install ## Clean and reinstall dependencies
	@echo "$(GREEN)✓ Reset complete!$(NC)"

quick: install dev ## Quick start: install and run
	@echo "$(GREEN)✓ Quick start initiated!$(NC)"

##@ Information

status: ## Show project status
	@echo "$(BLUE)Project Status$(NC)"
	@echo ""
	@echo "$(YELLOW)Node version:$(NC)"
	@node --version
	@echo ""
	@echo "$(YELLOW)NPM version:$(NC)"
	@npm --version
	@echo ""
	@echo "$(YELLOW)Installed packages:$(NC)"
	@echo "Root: $$(if [ -d node_modules ]; then echo '✓'; else echo '✗'; fi)"
	@echo "Server: $$(if [ -d server/node_modules ]; then echo '✓'; else echo '✗'; fi)"
	@echo "Client: $$(if [ -d client/node_modules ]; then echo '✓'; else echo '✗'; fi)"
	@echo ""
	@echo "$(YELLOW)Build artifacts:$(NC)"
	@echo "Server dist: $$(if [ -d server/dist ]; then echo '✓'; else echo '✗'; fi)"
	@echo "Client dist: $$(if [ -d client/dist ]; then echo '✓'; else echo '✗'; fi)"

ports: ## Check if ports 3000 and 3001 are in use
	@echo "$(YELLOW)Checking ports...$(NC)"
	@echo "Port 3000: $$(lsof -ti:3000 > /dev/null 2>&1 && echo '$(RED)IN USE$(NC)' || echo '$(GREEN)AVAILABLE$(NC)')"
	@echo "Port 3001: $$(lsof -ti:3001 > /dev/null 2>&1 && echo '$(RED)IN USE$(NC)' || echo '$(GREEN)AVAILABLE$(NC)')"

kill-ports: ## Kill processes on ports 3000 and 3001
	@echo "$(YELLOW)Killing processes on ports 3000 and 3001...$(NC)"
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)✓ Ports cleared$(NC)"

##@ Default

.DEFAULT_GOAL := help
