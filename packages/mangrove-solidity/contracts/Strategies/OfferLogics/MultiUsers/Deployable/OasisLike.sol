// SPDX-License-Identifier:	BSD-2-Clause

// AdvancedCompoundRetail.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity ^0.8.10;
pragma abicoder v2;
import "../AaveLender.sol";
import "../Persistent.sol";

contract OasisLike is MultiUserPersistent {
  constructor(address payable _MGV) MangroveOffer(_MGV) {}

  // overrides MultiUser.__put__ in order to transfer all inbound tokens to owner
  function __put__(uint amount, MgvLib.SingleOrder calldata order)
    internal
    override
    returns (uint missing)
  {
    // transfers the deposited tokens to owner
    address owner = ownerOf(
      order.outbound_tkn,
      order.inbound_tkn,
      order.offerId
    );
    if (IERC20(order.inbound_tkn).transfer(owner, amount)) {
      return 0;
    } else {
      return amount;
    }
  }

  function __get__(uint amount, MgvLib.SingleOrder calldata order)
    internal
    override
    returns (uint)
  {
    // tries to get funds from `this` balance if any
    amount = super.__get__(amount, order);
    // if not enough, tries to fetch missing amount into owner's wallet
    address owner = ownerOf(
      order.outbound_tkn,
      order.inbound_tkn,
      order.offerId
    );
    try
      IERC20(order.outbound_tkn).transferFrom(owner, address(this), amount)
    returns (bool success) {
      if (success) {
        return 0;
      } else {
        return amount;
      }
    } catch {
      return amount;
    }
  }

  function __posthookSuccess__(MgvLib.SingleOrder calldata order)
    internal
    override
  {
    super.__posthookSuccess__(order);
  }
}
