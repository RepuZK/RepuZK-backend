/**
 * Unit tests for StellarService — the client that signs and submits real
 * Soroban contract transactions.
 *
 * Only the network boundary (`rpc.Server`) is mocked; everything
 * else (Keypair, Contract, TransactionBuilder, Address, nativeToScVal,
 * scValToNative) is the real `@stellar/stellar-sdk`. This means the
 * transactions StellarService builds are decoded with the SDK's own XDR
 * codec in assertions below, so a test failure reflects a real encoding
 * bug rather than a mismatch against a hand-rolled mock shape.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Address, Account, Keypair, StrKey, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

const mockServer = {
  getAccount: jest.fn(),
  prepareTransaction: jest.fn(),
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
  simulateTransaction: jest.fn(),
  getLatestLedger: jest.fn(),
  getEvents: jest.fn(),
};

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => mockServer),
    },
  };
});

/** Decode the single invoke-contract operation of a built transaction back to (contractId, method, args). */
function decodeInvocation(tx: any) {
  const op = tx.operations[0];
  const invocation = op.func.invokeContract();
  return {
    contractId: Address.fromScAddress(invocation.contractAddress()).toString(),
    method: invocation.functionName().toString(),
    args: invocation.args().map((arg: any) => scValToNative(arg)),
  };
}

describe('StellarService', () => {
  let service: StellarService;
  let adminKeypair: Keypair;
  let issuerRegistryId: string;
  let reputationRegistryId: string;
  let marketplaceId: string;

  beforeEach(async () => {
    jest.clearAllMocks();

    adminKeypair = Keypair.random();
    issuerRegistryId = StrKey.encodeContract(Buffer.alloc(32, 1));
    reputationRegistryId = StrKey.encodeContract(Buffer.alloc(32, 2));
    marketplaceId = StrKey.encodeContract(Buffer.alloc(32, 3));

    const values: Record<string, string> = {
      STELLAR_NETWORK: 'testnet',
      STELLAR_ADMIN_SECRET: adminKeypair.secret(),
      ISSUER_REGISTRY_CONTRACT: issuerRegistryId,
      REPUTATION_REGISTRY_CONTRACT: reputationRegistryId,
      MARKETPLACE_CONTRACT: marketplaceId,
    };
    const configService = { get: jest.fn((key: string, def?: any) => values[key] ?? def) };

    mockServer.getAccount.mockResolvedValue(new Account(adminKeypair.publicKey(), '100'));
    // No-op "preparation" — hand the built transaction straight through so the
    // real `.sign()` on it (called by StellarService) executes normally.
    mockServer.prepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));

    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get(StellarService);
  });

  describe('registerProof', () => {
    const owner = Keypair.random().publicKey();
    const issuer = Keypair.random().publicKey();
    const proofHash = Buffer.from('ab'.repeat(32), 'hex');
    const credentialHash = Buffer.from('cd'.repeat(32), 'hex');

    it('submits register_proof to the ReputationRegistry with the correct args and returns the confirmed tx hash', async () => {
      mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'TXHASH123' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' });

      const result = await service.registerProof(
        owner,
        issuer,
        proofHash,
        credentialHash,
        'success_rate_gt_95',
        1234567890,
        'ipfs://cid',
      );

      expect(result).toBe('TXHASH123');
      expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);

      const submittedTx = mockServer.sendTransaction.mock.calls[0][0];
      const decoded = decodeInvocation(submittedTx);
      expect(decoded.contractId).toBe(reputationRegistryId);
      expect(decoded.method).toBe('register_proof');
      expect(decoded.args[0]).toBe(owner);
      expect(decoded.args[1]).toBe(issuer);
      expect(Buffer.from(decoded.args[2]).equals(proofHash)).toBe(true);
      expect(Buffer.from(decoded.args[3]).equals(credentialHash)).toBe(true);
      expect(decoded.args[4]).toBe('success_rate_gt_95');
      expect(decoded.args[5]).toBe(1234567890n);
      expect(decoded.args[6]).toBe('ipfs://cid');
    });

    it('throws and never polls for confirmation when the network rejects the submitted transaction', async () => {
      mockServer.sendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: 'boom' });

      await expect(
        service.registerProof(owner, issuer, proofHash, credentialHash, 'success_rate_gt_95', 0, ''),
      ).rejects.toThrow('Stellar tx error');
      expect(mockServer.getTransaction).not.toHaveBeenCalled();
    });
  });

  describe('revokeProof', () => {
    const revoker = Keypair.random().publicKey();
    const proofHash = Buffer.from('ef'.repeat(32), 'hex');

    it('submits revoke_proof to the ReputationRegistry with the correct args and returns the confirmed tx hash', async () => {
      mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'REVOKETXHASH' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' });

      const result = await service.revokeProof(proofHash, revoker);

      expect(result).toBe('REVOKETXHASH');
      const submittedTx = mockServer.sendTransaction.mock.calls[0][0];
      const decoded = decodeInvocation(submittedTx);
      expect(decoded.contractId).toBe(reputationRegistryId);
      expect(decoded.method).toBe('revoke_proof');
      expect(Buffer.from(decoded.args[0]).equals(proofHash)).toBe(true);
      expect(decoded.args[1]).toBe(revoker);
    });

    it('throws when the transaction never reaches SUCCESS status', async () => {
      mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'STUCKTX' });
      mockServer.getTransaction.mockResolvedValue({ status: 'FAILED' });

      await expect(service.revokeProof(proofHash, revoker)).rejects.toThrow('Transaction failed: FAILED');
    });
  });

  describe('getScoreValue', () => {
    const user = Keypair.random().publicKey();

    it('simulates get_score_value against the ReputationRegistry and returns the decoded score', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        transactionData: {},
        result: { retval: nativeToScVal(742, { type: 'u32' }) },
      });

      const score = await service.getScoreValue(user);

      expect(score).toBe(742);
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
      const submittedTx = mockServer.simulateTransaction.mock.calls[0][0];
      const decoded = decodeInvocation(submittedTx);
      expect(decoded.contractId).toBe(reputationRegistryId);
      expect(decoded.method).toBe('get_score_value');
      expect(decoded.args[0]).toBe(user);
    });

    it('throws when the simulation fails', async () => {
      mockServer.simulateTransaction.mockResolvedValue({ error: 'contract trapped' });

      await expect(service.getScoreValue(user)).rejects.toThrow('Simulation failed');
      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
    });
  });
});
