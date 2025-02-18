/**
 * @file Ethereum
 * @desc These methods facilitate interactions with the Ethereum blockchain.
 */

import { ethers } from "ethers";
import { Provider, Signer } from "./types";
import { logger, logdataLimiter } from "./util/logger";
import fs from "fs";

interface JsonWalletOptions {
  path: string;
  password: string;
}

export interface CreateSignerOptions {
  provider?: Provider | string;
  privateKey?: string;
  mnemonic?: string;
  path?: string;
  signer?: any;
  signerIndex?: number;
  jsonWallet?: JsonWalletOptions;
  forceReadOnly?: boolean;
}

export interface ProviderNetwork {
  id?: number;
  name: string;
}

/**
 * This helps the mangrove.js constructor discover which Ethereum network the
 *     developer wants to use.
 *
 * @param {Provider | string} [provider] Optional Ethereum network provider.
 *     Defaults to Ethers.js fallback mainnet provider.
 *
 * @hidden
 *
 * @returns {object} Returns a metadata object containing the Ethereum network
 *     name and ID.
 */
export async function getProviderNetwork(
  _provider: Provider
): Promise<ProviderNetwork> {
  let networkId;
  if (_provider["send"]) {
    networkId = await (_provider as any).send("net_version");
  } else if (_provider["_network"]) {
    networkId = (_provider as any)._network.chainId;
  } else {
    throw Error(
      "Provider can neither make RPC requests nor has a known network."
    );
  }

  networkId = isNaN(networkId) ? 0 : +networkId;

  let networkName;

  if (networkId === 31337) {
    networkName = "hardhat";
  } else {
    networkName = ethers.providers.getNetwork(networkId).name;
  }

  return {
    id: networkId,
    name: networkName === "homestead" ? "mainnet" : networkName,
  };
}

/**
 * Creates an Ethereum network provider object.
 *
 * @param {CreateSignerOptions} options
 *
 * options.provider can be:
 * - a string (url or ethers.js network name)
 * - an EIP-1193 provider object (eg window.ethereum)
 * - empty, if `options.signer` is a signer and `options.signer.provider` is a provider.
 *
 * Signing info can be provided by
 * - `options.signer`, if you want to contruct the Signer yourself
 * - `options.provider`, then you can specify `options.signerIndex` to get the nth account, or
 * - `options.privateKey`, or
 * - `options.mnemonic`, then you can specify the derivation with `options.path`.
 * In addition, you can specify
 * - `options.forceReadOnly:boolean` to connect readonly to mangrove. If you don't specify a signer and the provider does not include a signer, you will connect in readonly mode.
 *
 * IMPORTANT if both provider&signer are ethers objects,
 * - if the signer has its own provider, the provider argument will be ignored
 * - otherwise, the signer will attempt to connect to the provider (so any signer info on the provider will be ignored).
 *
 * Note on intended meaning of signer/provider by ricmoo (ethers.js author
 * Provider - read-only access
 * Signer (without a provider) - write-only access
 * Signer (with a provider) - read/write access
 *
 * When in readonly mode, all write operations will fail and msg.sender will be
 * 0x0000000000000000000000000000000000000001
 *
 * @hidden
 *
 * @returns {object} Returns a valid Ethereum network signer object with an attached provider.
 */
export async function _createSigner(
  options: CreateSignerOptions = {}
): Promise<{
  readOnly: boolean;
  signer: Signer;
}> {
  let readOnly = false;

  if (options.signer && options.signer.provider) {
    logger.debug("Uses provider from given signer", {
      contextInfo: "eth.signer",
      data: logdataLimiter({ signer: options.signer }),
    });
    return { readOnly, signer: options.signer };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any = options.provider;
  const isADefaultProvider = !!ethers.providers.getNetwork(provider.toString());

  let signer: Signer;

  // Create an ethers provider, web3s can sign
  if (typeof provider === "string") {
    logger.debug("Uses given provider", {
      contextInfo: "eth.signer",
      data: { signer: options.signer },
    });
    if (isADefaultProvider) {
      provider = ethers.getDefaultProvider(provider);
    } else {
      provider = new ethers.providers.JsonRpcProvider(provider);
    }
  } else {
    logger.debug("Uses ethers' Web3Provider created from given provider", {
      contextInfo: "eth.signer",
      data: { signer: options.signer },
    });
    provider = new ethers.providers.Web3Provider(provider);
  }

  if (
    provider.getSigner &&
    !("forceReadOnly" in options && options.forceReadOnly)
  ) {
    signer = provider.getSigner(options.signerIndex || 0);
    await signer.getAddress().catch(() => {
      logger.warn("Cannot use signer retrieved from provider.getSigner", {
        contextInfo: "eth.signer",
        data: { signer: signer },
      });
      signer = undefined;
    });
  }

  if (
    signer &&
    (!!options.privateKey ||
      !!options.mnemonic ||
      !!options.signer ||
      !!options.jsonWallet)
  ) {
    logger.warn("Signer info provided will override default signer", {
      contextInfo: "eth.signer",
      data: { signer: signer },
    });
  }

  // Add an explicit signer
  if (options.signer) {
    try {
      signer = options.signer.connect(provider);
    } catch (e) {
      console.warn(
        "provided signer object is not able to reinstantiate on new provider info."
      );
      throw e;
    }
    if (options.mnemonic || options.privateKey) {
      logger.warn("options.signer overrides mnemonic and privateKey", {
        contextInfo: "eth.signer",
        data: { signer: options.signer },
      });
    }
  } else if (options.privateKey) {
    signer = new ethers.Wallet(options.privateKey, provider);
    if (options.signerIndex) {
      logger.warn("options.signerIndex not applicable to private keys", {
        contextInfo: "eth.signer",
      });
    }
    if (options.mnemonic) {
      logger.warn("options.signerIndex not applicable to private keys", {
        contextInfo: "eth.signer",
      });
    }
  } else if (options.mnemonic) {
    signer = new ethers.Wallet(
      ethers.Wallet.fromMnemonic(options.mnemonic, options.path),
      provider
    );
    if (options.signerIndex) {
      logger.warn(
        "options.signerIndex not applicable to mnemonic, use options.path instead.",
        {
          contextInfo: "eth.signer",
        }
      );
    }
  } else if (options.jsonWallet) {
    const jsonWalletFile = fs.readFileSync(options.jsonWallet.path, "utf8");
    signer = new ethers.Wallet(
      await ethers.Wallet.fromEncryptedJson(
        jsonWalletFile,
        options.jsonWallet.password
      ),
      provider
    );
  } else if (!signer) {
    logger.warn(
      "No signing info provided or forceReadOnly is true: only read methods will work.",
      {
        contextInfo: "eth.signer",
      }
    );
    readOnly = true;
    signer = new ethers.VoidSigner(
      "0x0000000000000000000000000000000000000001",
      provider
    );
  }

  return { readOnly, signer };
}
