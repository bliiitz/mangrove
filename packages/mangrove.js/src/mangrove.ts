import { logger, logdataLimiter } from "./util/logger";
import pick from "object.pick";
import {
  addresses,
  decimals as loadedDecimals,
  displayedDecimals as loadedDisplayedDecimals,
  defaultDisplayedDecimals,
} from "./constants";
import * as eth from "./eth";
import { typechain, Provider, Signer } from "./types";
import { Bigish } from "./types";
import { LiquidityProvider, OfferLogic, MgvToken, Market } from ".";

import Big from "big.js";
import * as ethers from "ethers";
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] =
  Big.prototype.toString;

/* Prevent directly calling Mangrove constructor
   use Mangrove.connect to make sure the network is reached during construction */
let canConstructMangrove = false;

import type { Awaited } from "ts-essentials";
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Mangrove {
  export type RawConfig = Awaited<
    ReturnType<typechain.Mangrove["functions"]["configInfo"]>
  >;

  export type LocalConfig = {
    active: boolean;
    fee: number;
    density: Big;
    offer_gasbase: number;
    lock: boolean;
    best: number | undefined;
    last: number | undefined;
  };

  export type GlobalConfig = {
    monitor: string;
    useOracle: boolean;
    notify: boolean;
    gasprice: number;
    gasmax: number;
    dead: boolean;
  };
}

class Mangrove {
  _provider: Provider;
  _signer: Signer;
  _network: eth.ProviderNetwork;
  _readOnly: boolean;
  _address: string;
  contract: typechain.Mangrove;
  readerContract: typechain.MgvReader;
  cleanerContract: typechain.MgvCleaner;
  oracleContract: typechain.MgvOracle;
  static typechain = typechain;

  /**
   * Creates an instance of the Mangrove Typescript object
   *
   * @param {object} [options] Optional provider options.
   *
   * @example
   * ```
   * const mgv = await require('mangrove.js').connect(options); // web browser
   * ```
   *
   * if options is a string `s`, it is considered to be {provider:s}
   * const mgv = await require('mangrove.js').connect('http://127.0.0.1:8545'); // HTTP provider
   *
   * Options:
   * * privateKey: `0x...`
   * * mnemonic: `horse battery ...`
   * * path: `m/44'/60'/0'/...`
   * * provider: url, provider object, or chain string
   *
   * @returns {Mangrove} Returns an instance mangrove.js
   */

  static async connect(
    options: eth.CreateSignerOptions | string = {}
  ): Promise<Mangrove> {
    if (typeof options === "string") {
      options = { provider: options };
    }

    const { readOnly, signer } = await eth._createSigner(options); // returns a provider equipped signer
    const network = await eth.getProviderNetwork(signer.provider);
    canConstructMangrove = true;
    const mgv = new Mangrove({
      signer: signer,
      network: network,
      readOnly,
    });
    canConstructMangrove = false;

    logger.debug("Initialize Mangrove", {
      contextInfo: "mangrove.base",
      data: logdataLimiter({
        signer: signer,
        network: network,
        readOnly: readOnly,
      }),
    });

    return mgv;
  }

  disconnect(): void {
    this._provider.removeAllListeners();

    logger.debug("Disconnect from Mangrove", {
      contextInfo: "mangrove.base",
    });
  }
  //TODO types in module namespace with same name as class
  //TODO remove _prefix on public properties

  constructor(params: {
    signer: Signer;
    network: eth.ProviderNetwork;
    readOnly: boolean;
  }) {
    if (!canConstructMangrove) {
      throw Error(
        "Mangrove.js must be initialized async with Mangrove.connect (constructors cannot be async)"
      );
    }
    // must always pass a provider-equipped signer
    this._provider = params.signer.provider;
    this._signer = params.signer;
    this._network = params.network;
    this._readOnly = params.readOnly;
    this._address = Mangrove.getAddress("Mangrove", this._network.name);
    this.contract = typechain.Mangrove__factory.connect(
      this._address,
      this._signer
    );
    const readerAddress = Mangrove.getAddress("MgvReader", this._network.name);
    this.readerContract = typechain.MgvReader__factory.connect(
      readerAddress,
      this._signer
    );
    const cleanerAddress = Mangrove.getAddress(
      "MgvCleaner",
      this._network.name
    );
    this.cleanerContract = typechain.MgvCleaner__factory.connect(
      cleanerAddress,
      this._signer
    );
    const oracleAddress = Mangrove.getAddress("MgvOracle", this._network.name);
    this.oracleContract = typechain.MgvOracle__factory.connect(
      oracleAddress,
      this._signer
    );
  }
  /* Instance */
  /************** */

  /* Get Market object.
     Argument of the form `{base,quote}` where each is a string.
     To set your own token, use `setDecimals` and `setAddress`.
  */
  async market(params: {
    base: string;
    quote: string;
    bookOptions?: Market.BookOptions;
  }): Promise<Market> {
    logger.debug("Initialize Market", {
      contextInfo: "mangrove.base",
      data: pick(params, ["base", "quote", "bookOptions"]),
    });
    return await Market.connect({ ...params, mgv: this });
  }

  /** Get an OfferLogic object allowing one to monitor and set up an onchain offer logic*/
  offerLogic(logic: string): OfferLogic {
    return new OfferLogic(this, logic);
  }

  /** Get a LiquidityProvider object to enable Mangrove's signer to pass buy and sell orders*/
  async liquidityProvider(
    p:
      | Market
      | {
          base: string;
          quote: string;
          bookOptions?: Market.BookOptions;
        }
  ): Promise<LiquidityProvider> {
    const EOA = await this._signer.getAddress();
    if (p instanceof Market) {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: p,
      });
    } else {
      return new LiquidityProvider({
        mgv: this,
        eoa: EOA,
        market: await this.market(p),
      });
    }
  }

  /* Return MgvToken instance tied. */
  token(name: string): MgvToken {
    return new MgvToken(name, this);
  }

  /**
   * Read a contract address on the current network.
   */
  getAddress(name: string): string {
    return Mangrove.getAddress(name, this._network.name || "mainnet");
  }

  /**
   * Set a contract address on the current network.
   */
  setAddress(name: string, address: string): void {
    Mangrove.setAddress(name, address, this._network.name || "mainnet");
  }

  /**
   * Read decimals for `tokenName`.
   * Decimals are a property of each token, written onchain.
   * To read decimals off the chain, use `fetchDecimals`.
   */
  getDecimals(tokenName: string): number {
    return Mangrove.getDecimals(tokenName);
  }

  /**
   * Read displayed decimals for `tokenName`. Displayed decimals are a hint by
   * mangrove.js to be used by consumers of the lib. To configure the default
   * displayed decimals, modify constants.ts.
   *
   */
  getDisplayedDecimals(tokenName: string): number {
    return Mangrove.getDisplayedDecimals(tokenName);
  }

  /**
   * Set decimals for `tokenName`.
   */
  setDecimals(tokenName: string, decimals: number): void {
    Mangrove.setDecimals(tokenName, decimals);
  }

  /**
   * Set displayed decimals for `tokenName`.
   */
  setDisplayedDecimals(tokenName: string, decimals: number): void {
    Mangrove.setDisplayedDecimals(tokenName, decimals);
  }

  /**
   * Read chain for decimals of `tokenName` on current network and save them.
   */
  async fetchDecimals(tokenName: string): Promise<number> {
    return Mangrove.fetchDecimals(tokenName, this._provider);
  }

  /** Convert public token amount to internal token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.toUnits(10,"USDC") // 10e6 as ethers.BigNumber
   *  mgv.toUnits(10,6) // 10e6 as ethers.BigNumber
   *  ```
   */
  toUnits(amount: Bigish, nameOrDecimals: string | number): ethers.BigNumber {
    let decimals;
    if (typeof nameOrDecimals === "number") {
      decimals = nameOrDecimals;
    } else {
      decimals = this.getDecimals(nameOrDecimals);
    }
    return ethers.BigNumber.from(Big(10).pow(decimals).mul(amount).toFixed(0));
  }

  /** Convert internal token amount to public token representation.
   *
   * if `nameOrDecimals` is a string, it is interpreted as a token name. Otherwise
   * it is the number of decimals.
   *
   *  @example
   *  ```
   *  mgv.fromUnits("1e19","DAI") // 10
   *  mgv.fromUnits("1e19",18) // 10
   *  ```
   */
  fromUnits(
    amount: number | string | ethers.BigNumber,
    nameOrDecimals: string | number
  ): Big {
    let decimals;
    if (typeof nameOrDecimals === "number") {
      decimals = nameOrDecimals;
    } else {
      decimals = this.getDecimals(nameOrDecimals);
    }
    if (amount instanceof ethers.BigNumber) {
      amount = amount.toString();
    }
    return Big(amount).div(Big(10).pow(decimals));
  }

  /** Provision available at mangrove for address given in argument, in ethers */
  async balanceOf(
    address: string,
    overrides: ethers.Overrides = {}
  ): Promise<Big> {
    const bal = await this.contract.balanceOf(address, overrides);
    return this.fromUnits(bal, 18);
  }

  fundMangrove(
    amount: Bigish,
    overrides: ethers.Overrides = {},
    maker?: string
  ): Promise<ethers.ContractTransaction> {
    const _overrides = { value: this.toUnits(amount, 18), ...overrides };
    if (maker) {
      //fund maker account
      return this.contract["fund(address)"](maker, _overrides);
    } else {
      // fund signer's account
      return this.contract["fund()"](_overrides);
    }
  }

  withdraw(
    amount: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.contract.withdraw(this.toUnits(amount, 18), overrides);
  }

  approveMangrove(
    tokenName: string,
    amount?: Bigish,
    overrides: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> {
    return this.token(tokenName).approveMangrove(amount, overrides);
  }

  /**
   * Return global Mangrove config
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async config(): Promise<Mangrove.GlobalConfig> {
    const config = await this.contract.configInfo(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero
    );
    return {
      monitor: config.global.monitor,
      useOracle: config.global.useOracle,
      notify: config.global.notify,
      gasprice: config.global.gasprice.toNumber(),
      gasmax: config.global.gasmax.toNumber(),
      dead: config.global.dead,
    };
  }

  /* Static */
  /********** */

  /**
   * Read all contract addresses on the given network.
   */
  static getAllAddresses(network: string): [string, string][] {
    if (!addresses[network]) {
      throw Error(`No addresses for network ${network}.`);
    }

    return Object.entries(addresses[network]);
  }

  /**
   * Read a contract address on a given network.
   */
  static getAddress(name: string, network: string): string {
    if (!addresses[network]) {
      throw Error(`No addresses for network ${network}.`);
    }

    if (!addresses[network][name]) {
      throw Error(`No address for ${name} on network ${network}.`);
    }

    return addresses[network]?.[name] as string;
  }

  /**
   * Set a contract address on the given network.
   */
  static setAddress(name: string, address: string, network: string): void {
    if (!addresses[network]) {
      addresses[network] = {};
    }
    addresses[network][name] = address;
  }

  /**
   * Read decimals for `tokenName` on given network.
   * To read decimals directly onchain, use `fetchDecimals`.
   */
  static getDecimals(tokenName: string): number {
    if (typeof loadedDecimals[tokenName] !== "number") {
      throw Error(`No decimals on record for token ${tokenName}`);
    }

    return loadedDecimals[tokenName] as number;
  }

  /**
   * Read displayed decimals for `tokenName`.
   */
  static getDisplayedDecimals(tokenName: string): number {
    return loadedDisplayedDecimals[tokenName] || defaultDisplayedDecimals;
  }

  /**
   * Set decimals for `tokenName` on current network.
   */
  static setDecimals(tokenName: string, dec: number): void {
    loadedDecimals[tokenName] = dec;
  }

  /**
   * Set displayed decimals for `tokenName`.
   */
  static setDisplayedDecimals(tokenName: string, dec: number): void {
    loadedDisplayedDecimals[tokenName] = dec;
  }

  /**
   * Read chain for decimals of `tokenName` on current network and save them
   */
  static async fetchDecimals(
    tokenName: string,
    provider: Provider
  ): Promise<number> {
    const network = await eth.getProviderNetwork(provider);
    const token = typechain.IERC20__factory.connect(
      Mangrove.getAddress(tokenName, network.name),
      provider
    );
    const decimals = await token.decimals();
    this.setDecimals(tokenName, decimals);
    return decimals;
  }
}

export default Mangrove;
