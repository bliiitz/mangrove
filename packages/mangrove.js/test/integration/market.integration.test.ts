// Integration tests for Market.ts
import { describe, beforeEach, afterEach, it } from "mocha";
import { expect } from "chai";

import { toWei } from "../util/helpers";
import * as mgvTestUtil from "../util/mgvIntegrationTestUtil";
const waitForTransaction = mgvTestUtil.waitForTransaction;

import assert from "assert";
import { Mangrove, Market } from "../..";
import * as helpers from "../util/helpers";

import { Big } from "big.js";
import { Deferred } from "../../src/util";

//pretty-print when using console.log
Big.prototype[Symbol.for("nodejs.util.inspect.custom")] = function () {
  return `<Big>${this.toString()}`; // previously just Big.prototype.toString;
};

describe("Market integration tests suite", () => {
  let mgv: Mangrove;

  beforeEach(async function () {
    //set mgv object
    mgv = await Mangrove.connect({
      provider: "http://localhost:8546",
    });

    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv._provider.pollingInterval = 250;
    await mgv.contract["fund()"]({ value: toWei(10) });

    const tokenA = mgv.token("TokenA");
    const tokenB = mgv.token("TokenB");

    await tokenA.approveMangrove(1000);
    await tokenB.approveMangrove(1000);
  });

  afterEach(async () => {
    mgv.disconnect();
  });

  describe("Readonly mode", () => {
    let mgvro: Mangrove;

    beforeEach(async () => {
      mgvro = await Mangrove.connect({
        provider: "http://localhost:8546",
        forceReadOnly: true,
      });
      //shorten polling for faster tests
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mgvro._provider.pollingInterval = 250;
    });
    afterEach(async () => {
      mgvro.disconnect();
    });

    it("can read book updates in readonly mode", async function () {
      const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
      const marketro = await mgvro.market({ base: "TokenA", quote: "TokenB" });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const pro1 = marketro.once((evt) => {
        assert.strictEqual(
          marketro.getBook().asks.size(),
          1,
          "book should have size 1 by now"
        );
      });
      await helpers.newOffer(mgv, market.base, market.quote, {
        wants: "1",
        gives: "1.2",
      });
      await pro1;
    });
  });

  it("listens to blocks", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    const pro = market.afterBlock(1, (n) => {});
    const lastBlock = await mgv._provider.getBlockNumber();
    const pro2 = market.afterBlock(lastBlock + 1, (n) => {});
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
      gives: "1.2",
    });
    await pro;
    await pro2;
  });

  it("subscribes", async function () {
    const queue = helpers.asyncQueue<Market.BookSubscriptionCbArgument>();

    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    let latestAsks: Market.Offer[];
    let latestBids: Market.Offer[];

    const cb = (evt: Market.BookSubscriptionCbArgument) => {
      queue.put(evt);
      const { asks, bids } = market.getBook();
      latestAsks = [...asks];
      latestBids = [...bids];
    };
    market.subscribe(cb);

    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1", gives: "1.2" })
      .then((tx) => tx.wait());
    await helpers
      .newOffer(mgv, market.quote, market.base, { wants: "1.3", gives: "1.1" })
      .then((tx) => tx.wait());

    const offer1 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      offer_gasbase: (await market.config()).asks.offer_gasbase,
      wants: Big("1"),
      gives: Big("1.2"),
      volume: Big("1.2"),
      price: Big("1").div(Big("1.2")),
    };

    const offer2 = {
      id: 1,
      prev: undefined,
      next: undefined,
      gasprice: 1,
      gasreq: 10000,
      maker: await mgv._signer.getAddress(),
      offer_gasbase: (await market.config()).bids.offer_gasbase,
      wants: Big("1.3"),
      gives: Big("1.1"),
      volume: Big("1.3"),
      price: Big("1.1").div(Big("1.3")),
    };

    // Events may be received in different order
    const events = [await queue.get(), await queue.get()];
    expect(events).to.have.deep.members([
      {
        type: "OfferWrite",
        ba: "asks",
        offer: offer1,
      },
      {
        type: "OfferWrite",
        ba: "bids",
        offer: offer2,
      },
    ]);

    assert.deepStrictEqual(latestAsks, [offer1], "asks semibook not correct");
    assert.deepStrictEqual(latestBids, [offer2], "bids semibook not correct");

    market.sell({ wants: "1", gives: "1.3" });

    const offerFail = await queue.get();
    assert.strictEqual(offerFail.type, "OfferSuccess");
    assert.strictEqual(offerFail.ba, "bids");
    //TODO test offerRetract, offerfail, setGasbase
  });

  it("gets config", async function () {
    const mgvAsAdmin = await Mangrove.connect({
      provider: "http://localhost:8546",
      signerIndex: 1, // deployer index in hardhat.config
    });

    const fee = 13;
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });
    await mgvAsAdmin.contract.setFee(
      market.base.address,
      market.quote.address,
      fee
    );

    const config = await market.config();
    assert.strictEqual(config.asks.fee, fee, "wrong fee");
  });

  it("updates OB", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro1 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        1,
        "book should have size 1 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
      gives: "1.2",
    });
    await pro1;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro2 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        2,
        "book should have size 2 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
      gives: "1.2",
    });
    await pro2;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const pro3 = market.once((evt) => {
      assert.strictEqual(
        market.getBook().asks.size(),
        3,
        "book should have size 3 by now"
      );
    });
    await helpers.newOffer(mgv, market.base, market.quote, {
      wants: "1",
      gives: "1.2",
    });
    await pro3;
    //TODO add to after
  });

  it("crudely simulates market buy", async function () {
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    const done = new Deferred();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    market.subscribe(async (evt) => {
      if (market.getBook().asks.size() === 2) {
        const { estimatedVolume: estimated } = await market.estimateVolume({
          given: "2",
          what: "quote",
          to: "sell",
        });
        assert.strictEqual(estimated.toFixed(), "0.5");
        done.resolve();
      }
    });

    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1.2", gives: "0.3" })
      .then((tx) => tx.wait());
    await helpers
      .newOffer(mgv, market.base, market.quote, { wants: "1", gives: "0.25" })
      .then((tx) => tx.wait());
    await done.promise;
  });

  it("gets OB", async function () {
    // Initialize A/B market.
    const market = await mgv.market({ base: "TokenA", quote: "TokenB" });

    /* create bids and asks */
    let asks = [
      { id: 1, wants: "1", gives: "1", gasreq: 10_000, gasprice: 1 },
      { id: 2, wants: "1.2", gives: "1", gasreq: 10_002, gasprice: 3 },
      { id: 3, wants: "1", gives: "1.2", gasreq: 9999, gasprice: 21 },
    ];

    let bids = [
      { id: 1, wants: "0.99", gives: "1", gasreq: 10_006, gasprice: 11 },
      { id: 2, wants: "1", gives: "1.43", gasreq: 9998, gasprice: 7 },
      { id: 3, wants: "1.11", gives: "1", gasreq: 10_022, gasprice: 30 },
    ];

    /* fill orderbook with bids and asks */
    /* note that we are NOT testing mangrove.js's newOffer function
     * so we create offers through ethers.js generic API */
    for (const ask of asks) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenA", "TokenB", ask));
    }
    for (const bid of bids) {
      await waitForTransaction(helpers.newOffer(mgv, "TokenB", "TokenA", bid));
    }

    /* Now we create the orderbook we expect to get back so we can compare them */

    /* Reorder array a (array) such that an element with id i
     * goes to position o.indexOf(i). o is the order we want.
     */
    const reorder = (a, o) => o.map((i) => a[a.findIndex((e) => e.id == i)]);

    /* Put bids and asks in expected order (from best price to worse) */
    asks = reorder(asks, [3, 1, 2]);
    bids = reorder(bids, [2, 1, 3]);

    const selfAddress = await mgv._signer.getAddress();

    // Add price/volume, prev/next, +extra info to expected book.
    // Volume always in base, price always in quote/base.
    const config = await market.config();
    const complete = (isAsk, ary) => {
      return ary.map((ofr, i) => {
        const _config = config[isAsk ? "asks" : "bids"];
        const [baseVolume, quoteVolume] = isAsk
          ? ["gives", "wants"]
          : ["wants", "gives"];
        return {
          ...ofr,
          prev: ary[i - 1]?.id,
          next: ary[i + 1]?.id,
          volume: Big(ofr[baseVolume]),
          price: Big(ofr[quoteVolume]).div(Big(ofr[baseVolume])),
          maker: selfAddress,
          offer_gasbase: _config.offer_gasbase,
        };
      });
    };

    // Reorder elements, add prev/next pointers
    asks = complete(true, asks);
    bids = complete(false, bids);

    /* Start testing */

    const book = await market.requestBook({ maxOffers: 3 });
    market.consoleAsks(["id", "maker"]);
    market.consoleBids(["id", "maker"]);

    // Convert big.js numbers to string for easier debugging
    const stringify = ({ bids, asks }) => {
      const s = (obj) => {
        return {
          ...obj,
          wants: obj.wants.toString(),
          gives: obj.gives.toString(),
          volume: obj.volume.toString(),
          price: obj.price.toString(),
        };
      };
      return { bids: bids.map(s), asks: asks.map(s) };
    };

    assert.deepStrictEqual(
      stringify(book),
      stringify({ bids, asks }),
      "bad book"
    );
  });

  it("does market buy", async function () {
    // TODO
  });
});
