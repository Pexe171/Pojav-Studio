import { createHmac } from 'node:crypto';
import { HttpException } from '@nestjs/common';

interface RateStore {
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}
// Increment and expiry happen together: concurrent requests cannot create an immortal counter.
const counter = `local count = redis.call('INCRBY', KEYS[1], ARGV[2])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}`;
export async function consumeLimit(
  store: RateStore,
  key: string,
  maximum: number,
  seconds: number,
  amount = 1,
) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid rate increment');
  const [count, ttl] = (await store.eval(counter, 1, key, String(seconds), String(amount))) as [
    number,
    number,
  ];
  if (count > maximum)
    throw new HttpException(
      { message: 'Muitas tentativas. Aguarde e tente novamente.', retryAfter: Math.max(1, ttl) },
      429,
    );
}
export function accountLimitKey(email: string, secret: string) {
  return (
    'login-account:' + createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex')
  );
}
let passwordChecks = 0;
export async function passwordCheck<T>(work: () => Promise<T>): Promise<T> {
  if (passwordChecks >= 4)
    throw new HttpException(
      { message: 'Muitas tentativas simultâneas. Tente novamente em instantes.', retryAfter: 1 },
      429,
    );
  passwordChecks++;
  try {
    return await work();
  } finally {
    passwordChecks--;
  }
}
