import type { Realm } from './cookies';
import type { ActorScope } from '../money/types';

/** Map a portal realm to the user scope it authenticates (SEC-A4). */
export function realmToScope(realm: Realm): ActorScope {
  return realm === 'admin' ? 'SYSTEM' : 'MERCHANT';
}
