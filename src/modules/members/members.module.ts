import { Module } from '@nestjs/common';
import { MemberController } from './api/member.controller';
import { MemberService } from './application/member.service';
import { MEMBER_REPOSITORY } from './domain/member.repository';
import { PrismaMemberRepository } from './infrastructure/prisma-member.repository';

@Module({
  controllers: [MemberController],
  providers: [MemberService, PrismaMemberRepository, { provide: MEMBER_REPOSITORY, useExisting: PrismaMemberRepository }],
})
export class MembersModule {}
