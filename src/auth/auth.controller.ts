import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';

class ChallengeDto {
  @IsString()
  @IsNotEmpty()
  address: string;
}

class VerifyDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

/**
 * Auth controller — all endpoints are rate-limited via ThrottlerGuard.
 * The per-IP limit (default 10 req / 60 s) is configurable through the
 * THROTTLE_LIMIT and THROTTLE_TTL environment variables defined in AppModule.
 * The stricter 'strict' throttler (reserved for expensive/chain-writing
 * endpoints elsewhere) is skipped here so auth behaviour is unchanged.
 */
@UseGuards(ThrottlerGuard)
@SkipThrottle({ strict: true })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  challenge(@Body() dto: ChallengeDto) {
    return this.authService.generateChallenge(dto.address);
  }

  @Post('verify')
  verify(@Body() dto: VerifyDto) {
    return this.authService.verifySignature(dto.address, dto.signature, dto.nonce);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }
}
