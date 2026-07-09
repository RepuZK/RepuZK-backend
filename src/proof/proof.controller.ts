import { Controller, Post, Get, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsObject, IsNotEmpty } from 'class-validator';
import { ProofService } from './proof.service';
import { StellarService } from '../stellar/stellar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class GenerateProofDto {
  @IsString()
  @IsNotEmpty()
  credentialId: string;

  @IsString()
  @IsNotEmpty()
  circuitName: string;

  @IsObject()
  privateInputs: object;
}

class RegisterProofDto {
  @IsString()
  @IsNotEmpty()
  proofHash: string;

  @IsString()
  @IsNotEmpty()
  credentialHash: string;

  @IsString()
  @IsNotEmpty()
  credentialType: string;

  @IsNumber()
  @IsOptional()
  expiresAt?: number;

  @IsString()
  @IsOptional()
  metadataUri?: string;
}

class RevokeProofDto {
  @IsString()
  @IsNotEmpty()
  proofHash: string;
}

@Controller('proof')
export class ProofController {
  constructor(
    private readonly proofService: ProofService,
    private readonly stellarService: StellarService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  generate(@Body() dto: GenerateProofDto) {
    return this.proofService.generateProof(dto.credentialId, dto.circuitName, dto.privateInputs);
  }

  @Get('status/:jobId')
  getStatus(@Param('jobId') jobId: string) {
    return this.proofService.getStatus(jobId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register')
  async register(@Request() req, @Body() dto: RegisterProofDto) {
    const proofHashBuf = Buffer.from(dto.proofHash.replace(/^0x/, ''), 'hex');
    const credHashBuf = Buffer.from(dto.credentialHash.replace(/^0x/, ''), 'hex');

    const txHash = await this.stellarService.registerProof(
      req.user.address,
      req.user.address, // issuer falls back to user; override via queue for full flow
      proofHashBuf,
      credHashBuf,
      dto.credentialType,
      dto.expiresAt ?? 0,
      dto.metadataUri ?? '',
    );

    await this.proofService.updateStellarTxHash(dto.proofHash, txHash);
    return { txHash };
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
