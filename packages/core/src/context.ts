/** The security context every core operation runs under. Scopes all data to one org. */
export interface Ctx {
  orgId: string;
  userId: string;
}
