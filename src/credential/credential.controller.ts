import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { CredentialService } from './credential.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

class CredentialListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

class UploadIpfsDto {
  @IsString()
  @IsNotEmpty()
  credentialId: string;
}

@ApiTags('credential')
@ApiBearerAuth()
@Controller('credential')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get('user/:address')
  findByUser(@Param('address') address: string, @Query() { active, page, limit }: CredentialListQueryDto) {
    return this.credentialService.findByUser(address, active ?? false, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.credentialService.findById(id);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('upload-ipfs')
  uploadIpfs(@Body() dto: UploadIpfsDto) {
    return this.credentialService.uploadToIpfs(dto.credentialId);
  }
}
