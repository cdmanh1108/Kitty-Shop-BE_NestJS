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
    tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
    userAgent: null,
    ipAddress: null,
    createdAt: now,
    user,
    member,
  };
}
const replacement = { tokenHash: 'replacement-hash', expiresAt: new Date(Date.now() + 3600_000) };

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
    const find = jest.spyOn(tx.refreshToken, 'findUnique').mockResolvedValue(token);
    const consume = jest.spyOn(tx.refreshToken, 'updateMany').mockResolvedValue({ count: 1 });
    const create = jest.spyOn(tx.refreshToken, 'create').mockResolvedValue(token);
    return { token, transaction, find, consume, create };
  }

  it('keeps hash lookup, conditional consume and replacement insert inside one transaction', async () => {
    const { transaction, find, consume, create } = setup();
    await expect(repository.rotateRefreshToken('old-hash', replacement)).resolves.toMatchObject({
      userId: 'user',
      memberId: 'member',
    });
    expect(transaction.mock.calls).toHaveLength(1);
    expect(find.mock.calls[0]?.[0]?.where).toEqual({ tokenHash: 'old-hash' });
    expect(consume.mock.calls[0]?.[0]?.where).toEqual({
      id: 'token',
      revokedAt: null,
      expiresAt: { gt: expect.any(Date) as Date },
    });
    expect(create.mock.calls[0]?.[0]?.data).toEqual({
      ...replacement,
      userId: 'user',
      memberId: 'member',
    });
    expect(consume.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('only issues one replacement when two readers observe the same old row and one loses conditional consume', async () => {
    const { consume, create } = setup();
    consume.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([
      repository.rotateRefreshToken('old-hash', replacement),
      repository.rotateRefreshToken('old-hash', { ...replacement, tokenHash: 'second-hash' }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(create.mock.calls).toHaveLength(1);
  });

  it('propagates insertion failure out of the transaction so Prisma rolls back consumption', async () => {
    const { create } = setup();
    const failure = new Error('Persistence unavailable');
    create.mockRejectedValue(failure);
    await expect(repository.rotateRefreshToken('old-hash', replacement)).rejects.toBe(failure);
  });

  it.each([
    'missing',
    'expired',
    'revoked',
    'inactive-user',
    'inactive-member',
    'mismatched-user',
  ] as const)('does not write for %s tokens', async (state) => {
    const { token, find, consume, create } = setup();
    if (state === 'missing') find.mockResolvedValue(null);
    if (state === 'expired') token.expiresAt = new Date(0);
    if (state === 'revoked') token.revokedAt = now;
    if (state === 'inactive-user') token.user.status = 'INACTIVE';
    if (state === 'inactive-member') token.member.status = 'INACTIVE';
    if (state === 'mismatched-user') token.member.userId = 'another-user';
    await expect(repository.rotateRefreshToken('old-hash', replacement)).resolves.toBeNull();
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
});
