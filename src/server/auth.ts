import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64)) as Buffer;
    return `${salt}:${hash.toString('hex')}`; 
}

export async function verifyPassword(
    password: string,
    stored: string,
): Promise<boolean> {
const [salt, expected] = stored.split(':');
if (!salt || !expected) return false;
const actual = (await derive(password, salt, 64)) as Buffer;
const expectedBytes = Buffer.from(expected, 'hex');
return (
    expectedBytes.length === actual.length &&
    timingSafeEqual(actual, expectedBytes)
  );
}

export const newToken = () => randomBytes(32).toString('hex');
export const tokenHash = (token: string) =>
    createHash('sha256').update(token).digest('hex');
 
    

