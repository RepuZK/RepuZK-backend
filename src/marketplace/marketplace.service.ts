import { Injectable } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class MarketplaceService {
  constructor(private readonly stellar: StellarService) {}

  async createListing(
    provider: string,
    title: string,
    description: string,
    category: string,
    price: bigint,
    tokenAddress: string,
    minScore: number,
    requiredCredentials: string[],
    deliveryDays: number,
  ) {
    const txHash = await this.stellar.createListing(
      provider, title, description, category, price,
      tokenAddress, minScore, requiredCredentials, deliveryDays,
    );
    return { txHash };
  }

  async purchaseService(buyer: string, listingId: bigint, zkProofHash: string) {
    const txHash = await this.stellar.purchaseService(
      buyer,
      listingId,
      Buffer.from(zkProofHash.replace(/^0x/, ''), 'hex'),
    );
    return { txHash };
  }

  async getListings(category?: string, minScore?: number) {
    // Read active listings; filter applied client-side since contract returns all
    return this.stellar.getActiveListings(category, minScore);
  }

  async getListing(id: string) {
    return this.stellar.getListing(BigInt(id));
  }

  async getBuyerOrders(address: string) {
    return this.stellar.getBuyerOrders(address);
  }

  async getSellerOrders(address: string) {
    return this.stellar.getSellerOrders(address);
  }

  async leaveFeedback(
    reviewer: string,
    orderId: bigint,
    rating: number,
    comment: string,
    completionProof?: string,
  ) {
    const txHash = await this.stellar.leaveFeedback(reviewer, orderId, rating, comment, completionProof ?? '');
    return { txHash };
  }
}
