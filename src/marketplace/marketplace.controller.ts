import { Controller, Get, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, IsNotEmpty, Min, Max } from 'class-validator';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  minScore: number;

  @IsArray()
  requiredCredentials: string[];

  @IsNumber()
  @Min(1)
  deliveryDays: number;
}

class PurchaseDto {
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsString()
  @IsNotEmpty()
  zkProofHash: string;
}

class FeedbackDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsString()
  @IsOptional()
  completionProof?: string;
}

@ApiTags('marketplace')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('listings')
  getListings(@Query('category') category?: string, @Query('minScore') minScore?: string) {
    return this.marketplaceService.getListings(category, minScore ? parseInt(minScore, 10) : undefined);
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string) {
    return this.marketplaceService.getListing(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('create-listing')
  createListing(@Request() req, @Body() dto: CreateListingDto) {
    return this.marketplaceService.createListing(
      req.user.address,
      dto.title, dto.description, dto.category,
      BigInt(dto.price), dto.tokenAddress,
      dto.minScore, dto.requiredCredentials, dto.deliveryDays,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  purchase(@Request() req, @Body() dto: PurchaseDto) {
    return this.marketplaceService.purchaseService(req.user.address, BigInt(dto.listingId), dto.zkProofHash);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/buyer')
  buyerOrders(@Request() req) {
    return this.marketplaceService.getBuyerOrders(req.user.address);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/seller')
  sellerOrders(@Request() req) {
    return this.marketplaceService.getSellerOrders(req.user.address);
  }

  @UseGuards(JwtAuthGuard)
  @Post('feedback')
  feedback(@Request() req, @Body() dto: FeedbackDto) {
    return this.marketplaceService.leaveFeedback(
      req.user.address, BigInt(dto.orderId), dto.rating, dto.comment, dto.completionProof,
    );
  }
}
