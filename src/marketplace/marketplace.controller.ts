import { Controller, Get, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsArray, IsOptional, IsNotEmpty, IsInt, Min, Max } from 'class-validator';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

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

class CompleteOrderDto {
  @IsString()
  @IsOptional()
  completionProof?: string;
}

class DisputeOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

class ListingsQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  category?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  minScore?: number;
}

@ApiTags('marketplace')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('listings')
  getListings(@Query() { category, minScore, page, limit }: ListingsQueryDto) {
    return this.marketplaceService.getListings(category, minScore, page, limit);
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string) {
    return this.marketplaceService.getListing(id);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('create-listing')
  createListing(@Request() req, @Body() dto: CreateListingDto) {
    return this.marketplaceService.createListing(
      req.user.address,
      dto.title, dto.description, dto.category,
      BigInt(dto.price), dto.tokenAddress,
      dto.minScore, dto.requiredCredentials, dto.deliveryDays,
    );
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('purchase')
  purchase(@Request() req, @Body() dto: PurchaseDto) {
    return this.marketplaceService.purchaseService(req.user.address, BigInt(dto.listingId), dto.zkProofHash);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/buyer')
  buyerOrders(@Request() req, @Query() { page, limit }: PaginationQueryDto) {
    return this.marketplaceService.getBuyerOrders(req.user.address, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/seller')
  sellerOrders(@Request() req, @Query() { page, limit }: PaginationQueryDto) {
    return this.marketplaceService.getSellerOrders(req.user.address, page, limit);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('feedback')
  feedback(@Request() req, @Body() dto: FeedbackDto) {
    return this.marketplaceService.leaveFeedback(
      req.user.address, BigInt(dto.orderId), dto.rating, dto.comment, dto.completionProof,
    );
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('orders/:id/start')
  startOrder(@Request() req, @Param('id') id: string) {
    return this.marketplaceService.startOrder(req.user.address, BigInt(id));
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('orders/:id/complete')
  completeOrder(@Request() req, @Param('id') id: string, @Body() dto: CompleteOrderDto) {
    return this.marketplaceService.completeOrder(req.user.address, BigInt(id), dto.completionProof);
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post('orders/:id/dispute')
  disputeOrder(@Request() req, @Param('id') id: string, @Body() dto: DisputeOrderDto) {
    return this.marketplaceService.raiseDispute(req.user.address, BigInt(id), dto.reason);
  }
}
