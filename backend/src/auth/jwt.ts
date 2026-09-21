import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface AuthTokenPayload extends JWTPayload {
  sub: string;
  plan: string;
}

export async function issueToken(userId: string, plan: string, expiresIn?: string): Promise<string> {
  return new SignJWT({ plan })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? process.env.JWT_EXPIRES_IN ?? "7d")
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (typeof payload.sub !== "string" || typeof payload.plan !== "string") {
    throw new Error("malformed token payload");
  }
  return payload as AuthTokenPayload;
}
