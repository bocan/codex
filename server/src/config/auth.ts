import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export class AuthConfig {
  private passwordHash: string | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    const password = process.env.AUTH_PASSWORD;

    if (!password) {
      console.warn('⚠️  AUTH_PASSWORD not set - authentication disabled');
      console.warn('   Set AUTH_PASSWORD in .env file to enable authentication');
      return;
    }

    // Hash password synchronously on startup
    this.passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    console.log('✓ Authentication enabled');
  }

  isAuthEnabled(): boolean {
    return this.passwordHash !== null;
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.passwordHash) {
      return false;
    }
    return bcrypt.compare(password, this.passwordHash);
  }
}

export const authConfig = new AuthConfig();
