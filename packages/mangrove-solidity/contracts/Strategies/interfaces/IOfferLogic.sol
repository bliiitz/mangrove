// SPDX-License-Identifier:	BSD-2-Clause

// SwingingMarketMaker.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

pragma solidity >=0.7.0;
pragma abicoder v2;

import "../../MgvLib.sol";

interface IOfferLogic is IMaker {
  ///////////////////
  // MangroveOffer //
  ///////////////////

  /** @notice Events */

  // Logged whenever something went wrong during `makerPosthook` execution
  event PosthookFail(
    address indexed outbound_tkn,
    address indexed inbound_tkn,
    uint offerId,
    string message
  );

  // Logged whenever `__get__` hook failed to fetch the totality of the requested amount
  event GetFail(
    address indexed outbound_tkn,
    address indexed inbound_tkn,
    uint offerId,
    uint missingAmount
  );

  // Logged whenever `__put__` hook failed to deposit the totality of the requested amount
  event PutFail(
    address indexed outbound_tkn,
    address indexed inbound_tkn,
    uint offerId,
    uint missingAmount
  );

  // Logged whenever `__lastLook__` hook returned `false`
  event Reneged(
    address indexed outbound_tkn,
    address indexed inbound_tkn,
    uint offerId
  );

  // Offer logic default gas required --value is used in update and new offer if maxUint is given
  function OFR_GASREQ() external returns (uint);

  // returns missing provision on Mangrove, should `offerId` be reposted using `gasreq` and `gasprice` parameters
  // if `offerId` is not in the `outbound_tkn,inbound_tkn` offer list, the totality of the necessary provision is returned
  function getMissingProvision(
    address outbound_tkn,
    address inbound_tkn,
    uint gasreq,
    uint gasprice,
    uint offerId
  ) external view returns (uint);

  // Changing OFR_GASREQ of the logic
  function setGasreq(uint gasreq) external;

  function balanceOnMangrove() external view returns (uint balance);

  function tokenBalance(address token)
    external
    view
    returns (uint token_balance);

  function redeemToken(address token, uint amount)
    external
    returns (bool success);

  function depositToken(address token, uint amount)
    external
    returns (bool success);

  function approveMangrove(address outbound_tkn, uint amount) external;

  function withdrawFromMangrove(address receiver, uint amount)
    external
    returns (bool noRevert);

  function fundMangrove() external payable;

  function newOffer(
    address outbound_tkn, // address of the ERC20 contract managing outbound tokens
    address inbound_tkn, // address of the ERC20 contract managing outbound tokens
    uint wants, // amount of `inbound_tkn` required for full delivery
    uint gives, // max amount of `outbound_tkn` promised by the offer
    uint gasreq, // max gas required by the offer when called. If maxUint256 is used here, default `OFR_GASREQ` will be considered instead
    uint gasprice, // gasprice that should be consider to compute the bounty (Mangrove's gasprice will be used if this value is lower)
    uint pivotId // identifier of an offer in the (`outbound_tkn,inbound_tkn`) Offer List after which the new offer should be inserted (gas cost of insertion will increase if the `pivotId` is far from the actual position of the new offer)
  ) external payable returns (uint offerId);

  function updateOffer(
    address outbound_tkn,
    address inbound_tkn,
    uint wants,
    uint gives,
    uint gasreq,
    uint gasprice,
    uint pivotId,
    uint offerId
  ) external payable;

  function retractOffer(
    address outbound_tkn,
    address inbound_tkn,
    uint offerId,
    bool deprovision // if set to `true`, `this` contract will receive the remaining provision (in WEI) associated to `offerId`.
  ) external returns (uint received);
}
