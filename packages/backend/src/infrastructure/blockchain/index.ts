/**
 * Infrastructure Blockchain Index
 * Exporta todos os serviços blockchain
 */

export { BlockchainService, getBlockchainService } from './BlockchainService.js';
export type {
  SmartContract,
  NFT,
  NFTAttribute,
  DeFiProtocol,
  Web3Wallet,
  TokenBalance,
  Transaction,
  IPFSContent,
  BlockchainMetrics,
} from './BlockchainService.js';
