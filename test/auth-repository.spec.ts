import { PrismaService } from '../src/database/prisma/prisma.service';
import { PrismaAuthRepository } from '../src/modules/auth/infrastructure/prisma-auth.repository';

const now = new Date();
function tokenFixture() {
  const user = {
    id: 'user',
    email: 'admin@example.com',
    phone: null,
    passwordHash: 'internal-hash',
    fullName: 'Admin',
    avatarUrl: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const member = {
    id: 'member',
    userId: user.id,
    shopId: 'shop',
    employeeCode: null,
    displayName: 'Admin',
    status: 'ACTIVE',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    memberRoles: [],
  };
  return {
    id: 'token',
    userId: user.id,
    memberId: member.id,
    familyId: 'family',
    parentTokenId: null as string | null,
    tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
    consumedAt: null as Date | null,
    revocationReason: null as string | null,
    userAgent: null,
    ipAddress: null,
    createdAt: now,
    user,
    member,
    family: {
      id: 'family',
      userId: user.id,
      memberId: member.id,
      revokedAt: null as Date | null,
      revocationReason: null as string | null,
      reuseDetectedAt: null as Date | null,
      createdAt: now,
    },
  };
}
const replacement = { tokenHash: 'replacement-hash', expiresAt: new Date(Date.now() + 3600_000) };
const rotationNow = new Date();

describe('Prisma auth transaction contract (delegate mocks, no database connection)', () => {
  const prisma = new PrismaService();
  const tx = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  afterEach(() => jest.restoreAllMocks());

  function setup() {
    const token = tokenFixture();
    const transaction = jest
      .spyOn(prisma, '$transaction')
      .mockImplementation((operation) => operation(tx));
    jest.spyOn(tx, '$queryRaw').mockResolvedValue([{ id: token.id }]);
    const find = jest.spyOn(tx.refreshToken, 'findUnique').mockResolvedValue(token);
    const consume = jest.spyOn(tx.refreshToken, 'updateMany').mockResolvedValue({ count: 1 });
    const create = jest.spyOn(tx.refreshToken, 'create').mockResolvedValue(token);
    const revokeFamily = jest
      .spyOn(tx.refreshTokenFamily, 'updateMany')
      .mockResolvedValue({ count: 1 });
    return { token, transaction, find, consume, create, revokeFamily };
  }

  it('keeps hash lookup, conditional consume and replacement insert inside one transaction', async () => {
    const { transaction, find, consume, create } = setup();
    await expect(
      repository.rotateRefreshToken('old-hash', replacement, 'shop', rotationNow),
    ).resolves.toMatchObject({
      outcome: 'ROTATED',
      identity: { userId: 'user', memberId: 'member' },
    });
    expect(transaction.mock.calls).toHaveLength(1);
    expect(find.mock.calls[0]?.[0]?.where).toEqual({ id: 'token' });
    expect(consume.mock.calls[0]?.[0]?.where).toEqual({
      id: 'token',
      revokedAt: null,
      expiresAt: { gt: rotationNow },
    });
    expect(create.mock.calls[0]?.[0]?.data).toEqual({
      ...replacement,
      userId: 'user',
      memberId: 'member',
      familyId: 'family',
      parentTokenId: 'token',
    });
    expect(consume.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('only issues one replacement when two readers observe the same old row and one loses conditional consume', async () => {
    const { consume, create } = setup();
    consume.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([
      repository.rotateRefreshToken('old-hash', replacement, 'shop', rotationNow),
      repository.rotateRefreshToken(
        'old-hash',
        { ...replacement, tokenHash: 'second-hash' },
        'shop',
        rotationNow,
      ),
    ]);
    expect(results.filter((result) => result.outcome === 'ROTATED')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'CONCURRENT')).toHaveLength(1);
    expect(create.mock.calls).toHaveLength(1);
  });

  it('propagates insertion failure out of the transaction so Prisma rolls back consumption', async () => {
    const { create } = setup();
    const failure = new Error('Persistence unavailable');
    create.mockRejectedValue(failure);
    await expect(
      repository.rotateRefreshToken('old-hash', replacement, 'shop', rotationNow),
    ).rejects.toBe(failure);
  });

  it.each([
    'missing',
    'expired',
    'revoked',
    'inactive-user',
    'inactive-member',
    'mismatched-user',
    'wrong-shop',
  ] as const)('does not write for %s tokens', async (state) => {
    const { token, find, consume, create } = setup();
    if (state === 'missing') find.mockResolvedValue(null);
    if (state === 'expired') token.expiresAt = new Date(0);
    if (state === 'revoked') token.revokedAt = now;
    if (state === 'inactive-user') token.user.status = 'INACTIVE';
    if (state === 'inactive-member') token.member.status = 'INACTIVE';
    if (state === 'mismatched-user') token.member.userId = 'another-user';
    await expect(
      repository.rotateRefreshToken(
        'old-hash',
        replacement,
        state === 'wrong-shop' ? 'other-shop' : 'shop',
        rotationNow,
      ),
    ).resolves.toEqual({ outcome: 'REJECTED' });
    expect(consume.mock.calls).toHaveLength(0);
    expect(create.mock.calls).toHaveLength(0);
  });

  it('scopes logout to both the authenticated user and membership', async () => {
    const revoke = jest.spyOn(prisma.refreshToken, 'updateMany').mockResolvedValue({ count: 0 });
    await repository.revokeRefreshToken('hash', 'user', 'member');
    expect(revoke.mock.calls[0]?.[0]?.where).toEqual({
      tokenHash: 'hash',
      userId: 'user',
      memberId: 'member',
      revokedAt: null,
    });
  });

  it('marks the family compromised and revokes its active replacement after token reuse', async () => {
    const { token, consume, revokeFamily } = setup();
    token.revokedAt = rotationNow;
    token.consumedAt = rotationNow;
    token.revocationReason = 'ROTATED';
    await expect(
      repository.rotateRefreshToken('old-hash', replacement, 'shop', rotationNow),
    ).resolves.toEqual({ outcome: 'REUSED' });
    expect(revokeFamily).toHaveBeenCalledWith({
      where: { id: 'family', revokedAt: null },
      data: {
        revokedAt: rotationNow,
        revocationReason: 'REUSE_DETECTED',
        reuseDetectedAt: rotationNow,
      },
    });
    expect(consume).toHaveBeenCalledWith({
      where: { familyId: 'family', revokedAt: null },
      data: { revokedAt: rotationNow, revocationReason: 'FAMILY_COMPROMISED' },
    });
  });
});
