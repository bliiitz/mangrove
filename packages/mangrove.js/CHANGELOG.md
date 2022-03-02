# Next version

# 0.2.0 (February 2022)

- New `Market` options:
  - `desiredPrice`: allows one to specify a price point of interest. This will cause the cache to initially load all offers with this price or better.
  - `desiredVolume`: allows one to specify a volume of interest. This will cause the cache to initially load at least this volume (if available). The option uses the same specification as for `estimateVolume`: `desiredVolume: { given: 1, what: "base", to: "buy" }` will cause the asks semibook to be initialized with a volume of at least 1 base token.
- New `Market` subscription: `market.afterBlock(n,callback)` will trigger `callback` after the market events for block `n` have been processed. If the block has already been processed, `callback` will be triggered at the next event loop.
- add support for keystore file (json wallet) (`Mangrove.connect(jsonWallet:{path 'path/to/file.json', password: <wallet password>})`)
- New `partialFill` flag in `OrderResult`: This flag will be true if the order was only partially filled.
- New `Market` convenience estimator methods `estimateVolumeTo{Spend,Receive}`.

# 0.1.0 (January 2022)

- `{Market|Semibook}.getPivotId` now fetches offers until a pivot can be determined
- `MarketCallback`s now receive an `ethers.providers.Log` instead of an `ethers.Event`
- 2 new classes `OfferLogic` and `LiquidityProvider`. `OfferLogic` allows one to connect to an onchain offer logic and calls functions of the `IOfferLogic.sol` interface. A `LiquidityProvider` instance is obtained either direclty from a `Mangrove` instance, in which case the liquidity provider is the signer, or from an `OfferLogic` instance, in which case all calls to Mangrove are done via the onchain contract.
- the above classes subsume and replace the old `Maker` class.
- `MgvToken` implements `balanceOf`
- Add experimental CLI: `mgv`. See README.md for instructions
- You can do `market.buy({total: 100, price:null})` on a BAT/DAI market to buy BAT by spending 100 DAI, no (real) price limit. You can also specify a limit average price, and also specify a `total` in quote token on `Market#sell`.

# 0.0.9 (January 2022)

- New Mangrove deployment
- All types now start with upper case
- All functions now start with lower case
- Removed `fromId` and `blockNumber` from `Market.BookOptions`
- `Market.{subscribe|consoleAsks|consoleBids|prettyPrint}` are no longer `async`
- `Market.{getBaseQuoteVolumes|getPrice|getWantsForPrice|getGivesForPrice}` are now `static`
- `Market.Offer.{prev|next}` are now `undefined` (instead of `0`) if there is no previous/next offer
- `Market.getPivot` renamed to `Market.getPivotId`
- `Market.getPivotId` now returns `undefined` (instead of `0`) if no offer with better price exists
- `Market.getPivotId` now throws `Error` if the order book cache is insufficient to determine a pivot

# 0.0.8

- SimpleMaker constructor is called Maker
- `market.consoleAsk` and `market.consoleBids` now allows for pretty printing semi OB
- `bids` and `asks` allows for optional parameters `gasreq` and `gasprice` if one wants to change their values

# 0.0.5 (December 2021)

- Add `bookOptions` to SimpleMaker constructor.
- Allow initializing markets&makers after construction.
- Uncertain pivot ids when pushing an offer will throw.
  - TODO: allow giving bookOptions later
- Calling `maker.approveMangrove(token)` with no specified amount will approve the max amount.
- Add override sto most functions
- User can add slippage limit to market orders

# 0.0.4 (December 2021)

# 0.0.3 (December 2021)

TODO fill in

# 0.0.2 (November 2021)

Initial release
