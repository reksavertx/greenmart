// UUID v4 tanpa dependensi eksternal (crypto bawaan — setara uuid v4, lihat ADR).
import { randomUUID } from 'node:crypto';

export function uuid(): string {
  return randomUUID();
}
