import { Prisma, PrismaClient } from '@prisma/client';
import { serializableTransaction } from '../../src/database/prisma/transaction';

const engineMessage =
  'Transaction failed due to a write conflict or a deadlock. Please retry your transaction';
const unknownConflict = () =>
  new Prisma.PrismaClientUnknownRequestError(`Invalid invocation:\n\n${engineMessage}`, {
    clientVersion: '6.19.3',
  });

describe('Serializable transaction conflict recovery', () => {
  const prisma = new PrismaClient();
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => prisma.$disconnect());

  it.each([
    new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '6.19.3',
    }),
    new Prisma.PrismaClientKnownRequestError('raw serialization failure', {
      code: 'P2010',
      clientVersion: '6.19.3',
      meta: { code: '40001' },
    }),
    unknownConflict(),
  ])('retries an aborted Prisma conflict with a fresh serializable transaction', async (error) => {
    const transaction = jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('created');
    await expect(serializableTransaction(prisma, () => Promise.resolve('created'))).resolves.toBe(
      'created',
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls.every((call) => call[1]?.isolationLevel === 'Serializable')).toBe(
      true,
    );
  });

  it('bounds retries and translates an exhausted unknown conflict into the existing P2034 contract', async () => {
    const transaction = jest.spyOn(prisma, '$transaction').mockRejectedValue(unknownConflict());
    await expect(
      serializableTransaction(prisma, () => Promise.resolve('unused')),
    ).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    new Error(engineMessage),
    new Prisma.PrismaClientUnknownRequestError(`${engineMessage}\nUnrelated connector failure`, {
      clientVersion: '6.19.3',
    }),
  ])('propagates unrelated errors without retrying or reclassifying them', async (error) => {
    const transaction = jest.spyOn(prisma, '$transaction').mockRejectedValue(error);
    await expect(serializableTransaction(prisma, () => Promise.resolve('unused'))).rejects.toBe(
      error,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
