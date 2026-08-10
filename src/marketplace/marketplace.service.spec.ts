import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { StellarService } from '../stellar/stellar.service';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let stellar: {
    getActiveListings: jest.Mock;
    getBuyerOrders: jest.Mock;
    getSellerOrders: jest.Mock;
    startOrder: jest.Mock;
    completeOrder: jest.Mock;
    raiseDispute: jest.Mock;
  };

  beforeEach(async () => {
    stellar = {
      getActiveListings: jest.fn(),
      getBuyerOrders: jest.fn(),
      getSellerOrders: jest.fn(),
      startOrder: jest.fn(),
      completeOrder: jest.fn(),
      raiseDispute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceService, { provide: StellarService, useValue: stellar }],
    }).compile();

    service = module.get(MarketplaceService);
  });

  describe('getListings', () => {
    it('paginates the full on-chain listing set (contract has no pagination of its own)', async () => {
      const listings = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      stellar.getActiveListings.mockResolvedValue(listings);

      const page1 = await service.getListings(undefined, undefined, 1, 20);
      expect(page1).toEqual({ data: listings.slice(0, 20), total: 25, page: 1, limit: 20 });

      const page2 = await service.getListings(undefined, undefined, 2, 20);
      expect(page2).toEqual({ data: listings.slice(20, 25), total: 25, page: 2, limit: 20 });
    });
  });

  describe('startOrder', () => {
    it('submits start_order via StellarService and returns the tx hash', async () => {
      stellar.startOrder.mockResolvedValue('TX_START');

      const result = await service.startOrder('GSELLER', 7n);

      expect(stellar.startOrder).toHaveBeenCalledWith('GSELLER', 7n);
      expect(result).toEqual({ txHash: 'TX_START' });
    });
  });

  describe('completeOrder', () => {
    it('decodes a hex completionProof to exactly 32 bytes before submitting', async () => {
      stellar.completeOrder.mockResolvedValue('TX_COMPLETE');
      const proof = 'ab'.repeat(32);

      const result = await service.completeOrder('GSELLER', 7n, `0x${proof}`);

      expect(stellar.completeOrder).toHaveBeenCalledWith('GSELLER', 7n, Buffer.from(proof, 'hex'));
      expect(result).toEqual({ txHash: 'TX_COMPLETE' });
    });

    it('defaults to a zero-filled 32-byte proof when none is supplied', async () => {
      stellar.completeOrder.mockResolvedValue('TX_COMPLETE');

      await service.completeOrder('GSELLER', 7n, undefined);

      expect(stellar.completeOrder).toHaveBeenCalledWith('GSELLER', 7n, Buffer.alloc(32));
    });

    it('rejects a completionProof that does not decode to 32 bytes', async () => {
      await expect(service.completeOrder('GSELLER', 7n, '0xabcd')).rejects.toThrow(BadRequestException);
      expect(stellar.completeOrder).not.toHaveBeenCalled();
    });
  });

  describe('raiseDispute', () => {
    it('submits raise_dispute via StellarService and returns the tx hash', async () => {
      stellar.raiseDispute.mockResolvedValue('TX_DISPUTE');

      const result = await service.raiseDispute('GBUYER', 7n, 'never delivered');

      expect(stellar.raiseDispute).toHaveBeenCalledWith('GBUYER', 7n, 'never delivered');
      expect(result).toEqual({ txHash: 'TX_DISPUTE' });
    });
  });
});
