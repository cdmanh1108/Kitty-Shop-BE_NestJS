import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import type { AuthCleanupRepository } from '../domain/auth-cleanup.repository';

type IdRow = { id: string };

/** Deletes only whole, fully-retained families so refresh lineage is never orphaned. */
@Injectable()
export class PrismaAuthCleanupRepository implements AuthCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  purgeAdminRefreshTokenFamilies(cutoff: Date, limit: number): Promise<number> {
    return this.purgeRefreshFamilies('refresh_token_families', 'refresh_tokens', cutoff, limit);
  }

  purgeWebRefreshTokenFamilies(cutoff: Date, limit: number): Promise<number> {
    return this.purgeRefreshFamilies(
      'web_refresh_token_families',
      'web_refresh_tokens',
      cutoff,
      limit,
    );
  }

  async purgeWebOtpChallenges(cutoff: Date, limit: number): Promise<number> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const candidates = await tx.$queryRaw<IdRow[]>`
        SELECT id
        FROM "web_otp_challenges"
        WHERE COALESCE("consumed_at", "expires_at") <= ${cutoff}
        ORDER BY COALESCE("consumed_at", "expires_at"), id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (candidates.length === 0) return 0;
      const deleted = await tx.webOtpChallenge.deleteMany({
        where: { id: { in: candidates.map((candidate) => candidate.id) } },
      });
      return deleted.count;
    });
  }

  private async purgeRefreshFamilies(
    familyTable: 'refresh_token_families' | 'web_refresh_token_families',
    tokenTable: 'refresh_tokens' | 'web_refresh_tokens',
    cutoff: Date,
    limit: number,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const candidates = await tx.$queryRaw<IdRow[]>`
        SELECT family.id
        FROM ${Prisma.raw(`"${familyTable}"`)} AS family
        WHERE COALESCE(family."reuse_detected_at", family."revoked_at", family."created_at") <= ${cutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM ${Prisma.raw(`"${tokenTable}"`)} AS token
            WHERE token."family_id" = family.id
              AND COALESCE(token."revoked_at", token."expires_at") > ${cutoff}
          )
        ORDER BY COALESCE(family."reuse_detected_at", family."revoked_at", family."created_at"), family.id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (candidates.length === 0) return 0;
      const ids = candidates.map((candidate) => candidate.id);
      return familyTable === 'refresh_token_families'
        ? (await tx.refreshTokenFamily.deleteMany({ where: { id: { in: ids } } })).count
        : (await tx.webRefreshTokenFamily.deleteMany({ where: { id: { in: ids } } })).count;
    });
  }
}
