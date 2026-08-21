const packageJson = require('../../package.json');
import iconTool1 from '@/assets/img/iconTool1.svg';
import iconPolygonID from '@/assets/img/iconPolygonID.svg';
import iconPolygon from '@/assets/img/iconPolygon.png';
import iconArbitrum from '@/assets/img/iconArbitrum.svg';
import iconOptimism from '@/assets/img/iconOptimism.svg';
import iconWalletCoinbaseWallet from '@/assets/img/iconWalletCoinbaseWallet.svg';
import iconWalletTrustWallet from '@/assets/img/iconWalletTrustWallet.svg';
import iconWalletMetamask from '@/assets/img/iconWalletMetamask.svg';
import iconWalletWalletConnect from '@/assets/img/iconWalletWalletConnect.svg';
import iconWalletTokenPocket from '@/assets/img/iconWalletTokenPocket.svg';
import iconMina from '@/assets/img/iconMina.png';
import iconDataSourceTwitter from '@/assets/img/iconDataSourceX.svg';
import iconDataSourceKucoin from '@/assets/img/iconDataSourceKucoin.svg';
import iconDataSourceCoinbase from '@/assets/img/iconDataSourceCoinbase.png';
import iconDataSourceHuobi from '@/assets/img/iconDataSourceHuobi.svg';
import iconDataSourceHuobiWithCircle from '@/assets/img/iconDataSourceHuobiWithCircle.svg';
import iconDataSourceGate from '@/assets/img/iconDataSourceGate.svg';
import iconDataSourceBitget from '@/assets/img/iconDataSourceBitget.svg';
import iconDataSourceMEXC from '@/assets/img/iconDataSourceMEXC.png';
import iconDataSourceGithub from '@/assets/img/iconDataSourceGithub.png';
import iconDataSourceDiscord from '@/assets/img/iconDataSourceDiscord.png';
import iconDataSourceYoutube from '@/assets/img/iconDataSourceYoutube.svg';
import iconDataSourceZan from '@/assets/img/iconDataSourceZan.svg';
import iconDataSourceOnChainAssets from '@/assets/img/iconDataSourceOnChainAssets.svg';
import BigNumber from 'bignumber.js';
import iconETH from '@/assets/img/iconETH.svg';
import iconNetwork3 from '@/assets/img/iconNetwork3.png';
import iconNetwork4 from '@/assets/img/iconNetwork4.svg';
import iconNetwork5 from '@/assets/img/iconNetwork5.png';
import iconNetwork6 from '@/assets/img/iconNetwork6.png';
import iconChainEthereum from '@/assets/img/iconUpChainEthereum.png';

import type { ExchangeMeta } from '@/types/dataSource';

export type DataSourceMapType = {
  [propName: string]: ExchangeMeta;
};
export type WALLETITEMTYPE = {
  icon: any;
  name: string;
  disabled?: boolean;
};

export const ExchangeStoreVersion = '1.0.1';
export const SocailStoreVersion = '1.0.1';
export const KYCStoreVersion = '1.0.0';
export const padoExtensionVersion = packageJson.version;
export const CredVersion = '1.0.5';

export const USDT = 'USDT';
export const USD = 'USD';
export const USDC = 'USDC';
export const DAI = 'DAI';
export const BUSD = 'BUSD';
export const TUSD = 'TUSD';
export const BTC = 'BTC';
export const LDO = 'LDO';
export const BETH = 'BETH';
export const STABLETOKENLIST = [USDT, USD, USDC, DAI, BUSD, TUSD];
export const ONESECOND = 1000;
export const ONEMINUTE = 60 * ONESECOND;
export const ATTESTATIONPOLLINGTIME = 1 * ONESECOND;
export const ATTESTATIONPOLLINGTIMEOUT = 2 * ONEMINUTE;
export const STARTOFFLINETIMEOUT = 3 * ONEMINUTE + '';
export const DEFAULTDATASOURCEPOLLINGTIMENUM = '10';
// export const DEFAULTFETCHTIMEOUT = 10 * ONESECOND;
export const DEFAULTFETCHTIMEOUT = 1 * ONEMINUTE;
// export const WALLETASSETSPOLLINGTIME = 5 * ONEMINUTE;
export const WALLETASSETSPOLLINGTIME = 10 * ONESECOND;
export const MSGSHOWTIME1 = 6 * ONESECOND;
export const MSGSHOWTIME2 = 3 * ONESECOND;
export const BIGZERO = new BigNumber(0);

export const DATASOURCEMAP: DataSourceMapType = {
  onChain: {
    name: 'On-chain',
    type: 'Assets',
    icon: iconDataSourceOnChainAssets,
  },
  coinbase: {
    name: 'Coinbase',
    type: 'Assets',
    icon: iconDataSourceCoinbase,
    requirePassphase: false,
    baseName: 'api.coinbase.com',
  },
  kucoin: {
    name: 'KuCoin',
    type: 'Assets',
    icon: iconDataSourceKucoin,
    requirePassphase: true,
    baseName: 'api.kucoin.com',
  },
  gate: {
    name: 'Gate',
    type: 'Assets',
    icon: iconDataSourceGate,
    requirePassphase: false,
    baseName: 'www.gate.io',
    accountBalanceUrl: 'https://www.gate.io/zh/myaccount/myfunds/spot',
  },
  huobi: {
    name: 'Huobi',
    type: 'Assets',
    icon: iconDataSourceHuobi,
    iconWithCircle: iconDataSourceHuobiWithCircle,
    requirePassphase: false,
    baseName: 'api.huobi.pro',
  },
  bitget: {
    name: 'Bitget',
    type: 'Assets',
    icon: iconDataSourceBitget,
    requirePassphase: true,
    baseName: 'www.bitget.com',
    accountBalanceUrl: 'https://www.bitget.com/v1/mix/assetsV2',
  },
  mexc: {
    name: 'MEXC',
    type: 'Assets',
    icon: iconDataSourceMEXC,
    requirePassphase: false,
    baseName: 'api.mexc.com',
  },
  x: {
    name: 'X',
    type: 'Social',
    icon: iconDataSourceTwitter,
  },
  github: {
    name: 'Github',
    type: 'Social',
    icon: iconDataSourceGithub,
  },
  discord: {
    name: 'Discord',
    type: 'Social',
    icon: iconDataSourceDiscord,
  },
  /*youtube: {
    name: 'Youtube',
    type: 'Social',
    icon: iconDataSourceYoutube,
  },*/
  zan: {
    name: 'ZAN',
    type: 'Identity',
    icon: iconDataSourceZan,
    // desc: 'by Antchain',
    disabled: true,
  },
};
export const WALLETLIST: WALLETITEMTYPE[] = [
  {
    icon: iconWalletMetamask,
    name: 'MetaMask',
  },
  {
    icon: iconWalletWalletConnect,
    name: 'WalletConnect',
    disabled: true,
  },
  {
    icon: iconWalletCoinbaseWallet,
    name: 'CoinbaseWallet',
    disabled: true,
  },
  {
    icon: iconWalletTokenPocket,
    name: 'TokenPocket',
    disabled: true,
  },

  // {
  //   icon: iconWalletTrustWallet,
  //   name: 'TrustWallet',
  //   disabled: true,
  // },
];

export const CHAINNETWORKLIST = [
  {
    icon: iconETH,
    title: 'ETH',
  },
  {
    icon: iconNetwork3,
    title: '3',
  },
  {
    icon: iconNetwork4,
    title: '4',
  },
  {
    icon: iconNetwork5,
    title: '5',
  },
  {
    icon: iconNetwork6,
    title: '6',
  },
];

export const SUPPORRTEDQUERYCHAINMAP = {
  'Arbitrum One': {
    name: 'Arbitrum One',
    chainId: 42161,
    icon: iconArbitrum,
  },
  BSC: {
    name: 'BSC',
    chainId: 56,
    icon: iconNetwork3,
  },
  Ethereum: {
    name: 'Ethereum',
    chainId: 1,
    icon: iconChainEthereum,
  },
  Polygon: {
    name: 'Polygon',
    chainId: 137,
    icon: iconPolygon,
  },
  Avalanche: {
    name: 'Avalanche',
    chainId: 43114,
    icon: iconNetwork6,
  },
  Optimism: {
    name: 'Optimism',
    chainId: 10,
    icon: iconOptimism,
  },
};
export const schemaTypeMap = {
  ASSETS_PROOF: 'Assets Proof',
  TOKEN_HOLDINGS: 'Token Holdings',
  IDENTIFICATION_PROOF: 'IDENTIFICATION_PROOF',
};

export const supportAttestDataSourceNameList = ['Coinbase', 'ZAN'];
export const BADGELOTTRYTIMESTR = '2023-10-29 12:00:00';
export const SCROLLEVENTNAME = 'SCROLL_LAUNCH_CAMPAIGN';
export const BASEVENTNAME = 'BAS_EVENT_PROOF_OF_HUMANITY';
export const ETHSIGNEVENTNAME = 'SIGNX_X_PROGRAM';
export const LINEAEVENTNAME = 'LINEA_DEFI_VOYAGE';
// schemauid: 0x07656ef97ae97711b79c9e79b3e0409712a8bb9bf26f3495ad15f48cdd49cfac
// schemaType: BAS_EVENT_PROOF_OF_HUMANITY
export const GOOGLEWEBPROOFID = '100';
export const FUNDLINK = 'https://pay.primuslabs.xyz/';
