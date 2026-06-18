import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';
import { ProofService } from './proof.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class GenerateProofDto {
  @IsString() credentialId: string;
  @IsString() circuitName: string;
  @IsObject() privateInputs: object;
}

class RegisterProofDto {
  @IsString() proofHash: string;
  @IsString() credentialHash: string;
  @IsString() credentialType: string;
  @IsNumber() @IsOptional() expiresAt?: number;
  @IsString() @IsOptional() metadataUri?: string;
}

class RevokeProofDto {
  @IsString() proofHash: string;
}

@Controller('proof')
export class ProofController {
  constructor(private readonly proofService: ProofService) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  generate(@Body() dto: GenerateProofDto) {
    return this.proofService.generateProof(dto.credentialId, dto.circuitName, dto.privateInputs);
  }

  @Get('status/:jobId')
  getStatus(@Param('jobId') jobId: string) {
    return this.proofService.getStatus(jobId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register')
  register(@Request() req, @Body() dto: RegisterProofDto) {
    // Manual on-chain registration (frontend-initiated after proof is ready)
    return { message: 'Use /proof/generate which auto-submits on-chain via queue', dto };
  }

  @Get('user/:address')
  findByUser(@Param('address') address: string) {
    return this.proofService.findByUser(address);
  }

  @UseGuards(JwtAuthGuard)
  @Post('revoke')
  revoke(@Body() dto: RevokeProofDto) {
    return this.proofService.revokeProof(dto.proofHash);
  }
}
