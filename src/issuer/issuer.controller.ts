import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { IsString, IsBoolean, IsOptional, IsObject } from 'class-validator';
import { IssuerService } from './issuer.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class RegisterIssuerDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
}

class CredentialTypeDto {
  @IsString() typeId: string;
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsObject() @IsOptional() schema?: object;
  @IsBoolean() @IsOptional() requiresZk?: boolean;
}

class IssueCredentialDto {
  @IsString() userAddress: string;
  @IsString() credentialType: string;
  @IsObject() payload: object;
}

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
  findAll() {
    return this.issuerService.findAll();
  }

  @Get(':address')
  findOne(@Param('address') address: string) {
    return this.issuerService.findByAddress(address);
  }
}
