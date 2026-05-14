import { registerAs } from '@nestjs/config';

export interface JwtConfig {
  secret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
  bcryptRounds: number;
}

const MIN_SECRET_LENGTH = 32;

const requireSecret = (value: string | undefined, name: string): string => {
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is required and must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return value;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const jwtConfig = registerAs<JwtConfig>('jwt', () => {
  const rounds = parseInteger(process.env.BCRYPT_ROUNDS, 12);
  if (rounds < 12) {
    throw new Error('BCRYPT_ROUNDS must be at least 12');
  }
  return {
    secret: requireSecret(process.env.JWT_SECRET, 'JWT_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '7d',
    refreshSecret: requireSecret(
      process.env.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
    ),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    bcryptRounds: rounds,
  };
});
