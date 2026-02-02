/**
 * MCP Server Entry Point
 *
 * Can be run standalone or imported for integration with Express.
 */

export { startMcpServer } from './server';
export { config } from './config';
export { sessionStore } from './sessions';
export { tools, registerTools } from './tools/registry';
export { registerResources } from './resources';
