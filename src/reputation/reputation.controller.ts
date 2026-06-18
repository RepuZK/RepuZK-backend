import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNumber, IsArray, IsOptional } from 'class-validator';
import { ReputationService } from './reputation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class VerifyOnChainDto {
  @IsString() userAddress: string;
  @IsNumber() requiredScore: number;
  @IsArray() requiredCredentials: string[];
  @IsString() @IsOptional() zkProofHash?: string;
}

@Controller('reputation')
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get('score/:address')
  getScore(@Param('address') address: string) {
    return this.reputationService.getScore(address);
  }

  @Get('verify/:address')
  verify(@Param('address') address: string, @Query('threshold') threshold: string) {
    return this.reputationService.verifyThreshold(address, parseInt(threshold, 10));
  }

  @Get('badges/:address')
  getBadges(@Param('address') address: string) {
    return this.reputationService.getBadges(address);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-on-chain')
  verifyOnChain(@Body() dto: VerifyOnChainDto) {
    return this.reputationService.verifyOnChain({
      ...dto,
      zkProofHash: dto.zkProofHash ?? '',
    });
  }
}
