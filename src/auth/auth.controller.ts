import { Controller, Post, Body } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';

class ChallengeDto {
  @IsString() address: string;
}

class VerifyDto {
  @IsString() address: string;
  @IsString() signature: string;
  @IsString() nonce: string;
}

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
}
