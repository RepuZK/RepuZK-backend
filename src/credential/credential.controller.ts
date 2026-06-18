import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CredentialService } from './credential.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class UploadIpfsDto {
  @IsString() credentialId: string;
}

@Controller('credential')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get('user/:address')
  findByUser(@Param('address') address: string) {
    return this.credentialService.findByUser(address);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.credentialService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-ipfs')
  uploadIpfs(@Body() dto: UploadIpfsDto) {
    return this.credentialService.uploadToIpfs(dto.credentialId);
  }
}
