import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject, IsNotEmpty } from 'class-validator';
import { IssuerService } from './issuer.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

class RegisterIssuerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

class CredentialTypeDto {
  @IsString()
  @IsNotEmpty()
  typeId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  schema?: object;

  @IsBoolean()
  @IsOptional()
  requiresZk?: boolean;
}

class IssueCredentialDto {
  @IsString()
  @IsNotEmpty()
  userAddress: string;

  @IsString()
  @IsNotEmpty()
  credentialType: string;

  @IsObject()
  payload: object;
}

@ApiTags('issuer')
@ApiBearerAuth()
@Controller('issuer')
export class IssuerController {
  constructor(private readonly issuerService: IssuerService) {}

  @UseGuards(JwtAuthGuard)
  @Post('register')
  register(@Request() req, @Body() dto: RegisterIssuerDto) {
    return this.issuerService.register(req.user.address, dto.name, dto.description);
  }

  @UseGuards(JwtAuthGuard)
  @Post('credential-type')
  addCredentialType(@Request() req, @Body() dto: CredentialTypeDto) {
    return this.issuerService.addCredentialType(
      req.user.address,
      dto.typeId,
      dto.name,
      dto.description,
      dto.schema ?? {},
      dto.requiresZk ?? false,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('issue')
  issue(@Request() req, @Body() dto: IssueCredentialDto) {
    return this.issuerService.issueCredential(
      req.user.address,
      dto.userAddress,
      dto.credentialType,
      dto.payload,
    );
  }

  @Get('all')
  findAll(@Query() { page, limit }: PaginationQueryDto) {
    return this.issuerService.findAll(page, limit);
  }

  @Get(':address')
  findOne(@Param('address') address: string) {
    return this.issuerService.findByAddress(address);
  }
}
