// SPDX-License-Identifier:	BSD-2-Clause

// MangroveOffer.sol

// Copyright (c) 2021 Giry SAS. All rights reserved.

// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity ^0.8.10;
pragma abicoder v2;
import "../MangroveOffer.sol";
import "../../../periphery/MgvReader.sol";

abstract contract MultiUser is MangroveOffer {
  mapping(address => mapping(address => mapping(uint => address)))
    internal _offerOwners; // outbound_tkn => inbound_tkn => offerId => ownerAddress

  mapping(address => uint) public mgvBalance; // owner => WEI balance on mangrove
  mapping(address => mapping(address => uint)) public tokenBalanceOf; // erc20 => owner => balance on `this`

  // Offer management
  event NewOffer(
    address indexed outbound_tkn,
    address indexed inbound_tkn,
    uint indexed offerId,
    address owner
  );

  function tokenBalance(address token) external view returns (uint) {
    return tokenBalanceOf[token][msg.sender];
  }

  function balanceOnMangrove() external view returns (uint) {
    return mgvBalance[msg.sender];
  }

  function offerOwners(
    address reader,
    address outbound_tkn,
    address inbound_tkn,
    uint fromId,
    uint maxOffers
  )
    public
    view
    returns (
      uint nextId,
      uint[] memory offerIds,
      address[] memory __offerOwners
    )
  {
    (
      nextId,
      offerIds, /*offers*/ /*offerDetails*/
      ,

    ) = MgvReader(reader).offerList(
      outbound_tkn,
      inbound_tkn,
      fromId,
      maxOffers
    );
    __offerOwners = new address[](offerIds.length);
    for (uint i = 0; i < offerIds.length; i++) {
      __offerOwners[i] = ownerOf(outbound_tkn, inbound_tkn, offerIds[i]);
    }
  }

  function creditOnMgv(address owner, uint balance) internal {
    mgvBalance[owner] += balance;
  }

  function debitOnMgv(address owner, uint amount) internal {
    require(mgvBalance[owner] >= amount, "MultiOwner/debitOnMgv/insufficient");
    mgvBalance[owner] -= amount;
  }

  function creditToken(
    address token,
    address owner,
    uint balance
  ) internal {
    tokenBalanceOf[token][owner] += balance;
  }

  function debitToken(
    address token,
    address owner,
    uint amount
  ) internal {
    if (amount == 0) {
      return;
    }
    require(
      tokenBalanceOf[token][owner] >= amount,
      "MultiOwner/debitToken/insufficient"
    );
    tokenBalanceOf[token][owner] -= amount;
  }

  function redeemToken(address token, uint amount)
    external
    override
    returns (bool success)
  {
    require(msg.sender != address(this), "MutliUser/noReentrancy");
    debitToken(token, msg.sender, amount);
    success = _transferToken(token, msg.sender, amount);
  }

  function depositToken(address token, uint amount)
    external
    override
    returns (bool success)
  {
    uint balBefore = IERC20(token).balanceOf(address(this));
    success = _transferTokenFrom(token, msg.sender, amount);
    require(
      IERC20(token).balanceOf(address(this)) - balBefore == amount,
      "MultiUser/transferFail"
    );
    creditToken(token, msg.sender, amount);
  }

  function addOwner(
    address outbound_tkn,
    address inbound_tkn,
    uint offerId,
    address owner
  ) internal {
    _offerOwners[outbound_tkn][inbound_tkn][offerId] = owner;
    emit NewOffer(outbound_tkn, inbound_tkn, offerId, owner);
  }

  function ownerOf(
    address outbound_tkn,
    address inbound_tkn,
    uint offerId
  ) public view returns (address owner) {
    owner = _offerOwners[outbound_tkn][inbound_tkn][offerId];
    require(owner != address(0), "multiUser/unkownOffer");
  }

  /// trader needs to approve Mangrove to let it perform outbound token transfer at the end of the `makerExecute` function
  /// Warning: anyone can approve here.
  function approveMangrove(address outbound_tkn, uint amount)
    external
    override
  {
    _approveMangrove(outbound_tkn, amount);
  }

  /// withdraws ETH from the bounty vault of the Mangrove.
  /// NB: `Mangrove.fund` function need not be called by `this` so is not included here.
  /// Warning: this function should not be called internally for msg.sender provision is being checked
  function withdrawFromMangrove(address receiver, uint amount)
    external
    override
    returns (bool noRevert)
  {
    require(msg.sender != address(this), "MutliUser/noReentrancy");
    debitOnMgv(msg.sender, amount);
    return _withdrawFromMangrove(receiver, amount);
  }

  function fundMangrove() external payable override {
    require(msg.sender != address(this), "MutliUser/noReentrancy");
    fundMangroveInternal(msg.sender, msg.value);
  }

  function fundMangroveInternal(address caller, uint provision) internal {
    // increasing the provision of `this` contract
    MGV.fund{value: provision}();
    // increasing the virtual provision of owner
    creditOnMgv(caller, provision);
  }

  function updateUserBalanceOnMgv(address user, uint mgvBalanceBefore)
    internal
  {
    uint mgvBalanceAfter = MGV.balanceOf(address(this));
    if (mgvBalanceAfter == mgvBalanceBefore) {
      return;
    }
    if (mgvBalanceAfter > mgvBalanceBefore) {
      creditOnMgv(user, mgvBalanceAfter - mgvBalanceBefore);
    } else {
      debitOnMgv(user, mgvBalanceBefore - mgvBalanceAfter);
    }
  }

  function newOffer(
    address outbound_tkn, // address of the ERC20 contract managing outbound tokens
    address inbound_tkn, // address of the ERC20 contract managing outbound tokens
    uint wants, // amount of `inbound_tkn` required for full delivery
    uint gives, // max amount of `outbound_tkn` promised by the offer
    uint gasreq, // max gas required by the offer when called. If maxUint256 is used here, default `OFR_GASREQ` will be considered instead
    uint gasprice, // gasprice that should be consider to compute the bounty (Mangrove's gasprice will be used if this value is lower)
    uint pivotId // identifier of an offer in the (`outbound_tkn,inbound_tkn`) Offer List after which the new offer should be inserted (gas cost of insertion will increase if the `pivotId` is far from the actual position of the new offer)
  ) external payable override returns (uint offerId) {
    require(msg.sender != address(this), "MutliUser/noReentrancy");
    offerId = newOfferInternal(
      outbound_tkn,
      inbound_tkn,
      wants,
      gives,
      gasreq,
      gasprice,
      pivotId,
      msg.sender,
      msg.value
    );
  }

  function newOfferInternal(
    address outbound_tkn, // address of the ERC20 contract managing outbound tokens
    address inbound_tkn, // address of the ERC20 contract managing outbound tokens
    uint wants, // amount of `inbound_tkn` required for full delivery
    uint gives, // max amount of `outbound_tkn` promised by the offer
    uint gasreq, // max gas required by the offer when called. If maxUint256 is used here, default `OFR_GASREQ` will be considered instead
    uint gasprice, // gasprice that should be consider to compute the bounty (Mangrove's gasprice will be used if this value is lower)
    uint pivotId,
    address caller,
    uint provision
  ) internal returns (uint offerId) {
    uint weiBalanceBefore = MGV.balanceOf(address(this));
    if (provision > 0) {
      MGV.fund{value: provision}();
    }
    if (gasreq > type(uint24).max) {
      gasreq = OFR_GASREQ;
    }
    // this call could revert if this contract does not have the provision to cover the bounty
    offerId = MGV.newOffer(
      outbound_tkn,
      inbound_tkn,
      wants,
      gives,
      gasreq,
      gasprice,
      pivotId
    );
    //setting owner of offerId
    addOwner(outbound_tkn, inbound_tkn, offerId, caller);
    //updating wei balance of owner will revert if msg.sender does not have the funds
    updateUserBalanceOnMgv(caller, weiBalanceBefore);
  }

  function updateOffer(
    address outbound_tkn,
    address inbound_tkn,
    uint wants,
    uint gives,
    uint gasreq,
    uint gasprice,
    uint pivotId,
    uint offerId
  ) external payable override {
    updateOfferInternal(
      outbound_tkn,
      inbound_tkn,
      wants,
      gives,
      gasreq,
      gasprice,
      pivotId,
      offerId,
      msg.sender,
      msg.value
    );
  }

  function updateOfferInternal(
    address outbound_tkn,
    address inbound_tkn,
    uint wants,
    uint gives,
    uint gasreq,
    uint gasprice,
    uint pivotId,
    uint offerId,
    address caller,
    uint provision // dangerous to use msg.value in a internal call
  ) internal {
    require(
      caller == ownerOf(outbound_tkn, inbound_tkn, offerId),
      "mgvOffer/MultiOwner/unauthorized"
    );
    uint weiBalanceBefore = MGV.balanceOf(address(this));
    if (provision > 0) {
      MGV.fund{value: provision}();
    }
    if (gasreq > type(uint24).max) {
      gasreq = OFR_GASREQ;
    }
    MGV.updateOffer(
      outbound_tkn,
      inbound_tkn,
      wants,
      gives,
      gasreq,
      gasprice,
      pivotId,
      offerId
    );
    updateUserBalanceOnMgv(caller, weiBalanceBefore);
  }

  // Retracts `offerId` from the (`outbound_tkn`,`inbound_tkn`) Offer list of Mangrove. Function call will throw if `this` contract is not the owner of `offerId`.
  function retractOffer(
    address outbound_tkn,
    address inbound_tkn,
    uint offerId,
    bool deprovision // if set to `true`, `this` contract will receive the remaining provision (in WEI) associated to `offerId`.
  ) external override returns (uint received) {
    received = retractOfferInternal(
      outbound_tkn,
      inbound_tkn,
      offerId,
      deprovision,
      msg.sender
    );
  }

  function retractOfferInternal(
    address outbound_tkn,
    address inbound_tkn,
    uint offerId,
    bool deprovision,
    address caller
  ) internal returns (uint received) {
    require(
      _offerOwners[outbound_tkn][inbound_tkn][offerId] == caller,
      "mgvOffer/MultiOwner/unauthorized"
    );
    received = MGV.retractOffer(
      outbound_tkn,
      inbound_tkn,
      offerId,
      deprovision
    );
    if (received > 0) {
      creditOnMgv(caller, received);
    }
  }

  function getMissingProvision(
    address outbound_tkn,
    address inbound_tkn,
    uint gasreq,
    uint gasprice,
    uint offerId
  ) public view override returns (uint) {
    uint balance;
    if (offerId != 0) {
      address owner = ownerOf(outbound_tkn, inbound_tkn, offerId);
      balance = mgvBalance[owner];
    }
    return
      _getMissingProvision(
        balance,
        outbound_tkn,
        inbound_tkn,
        gasreq,
        gasprice,
        offerId
      );
  }

  // put received inbound tokens on offer owner account
  function __put__(uint amount, MgvLib.SingleOrder calldata order)
    internal
    virtual
    override
    returns (uint)
  {
    address owner = ownerOf(
      order.outbound_tkn,
      order.inbound_tkn,
      order.offerId
    );
    creditToken(order.inbound_tkn, owner, amount);
    return 0;
  }

  // get outbound tokens from offer owner account
  function __get__(uint amount, MgvLib.SingleOrder calldata order)
    internal
    virtual
    override
    returns (uint)
  {
    address owner = ownerOf(
      order.outbound_tkn,
      order.inbound_tkn,
      order.offerId
    );
    uint ownerBalance = tokenBalanceOf[order.outbound_tkn][owner];
    if (ownerBalance < amount) {
      debitToken(order.outbound_tkn, owner, ownerBalance);
      return (amount - ownerBalance);
    } else {
      debitToken(order.outbound_tkn, owner, amount);
      return 0;
    }
  }
}
