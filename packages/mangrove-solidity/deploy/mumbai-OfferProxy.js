const { Mangrove } = require("../../mangrove.js");

module.exports = async (hre) => {
  const deployer = (await hre.getUnnamedAccounts())[0];
  if (!deployer) {
    throw Error("No deployer account found in the hardhat environment.");
  }
  const signer = await hre.ethers.getSigner(deployer);
  const MgvAPI = await Mangrove.connect({
    signer: signer,
  });

  const offerProxy = await hre.deployments.deploy("OfferProxy", {
    from: deployer,
    args: [MgvAPI.getAddress("addressProvider"), MgvAPI.contract.address],
    skipIfAlreadyDeployed: true,
  });
  console.log(`OfferProxy deployed on mumbai (${offerProxy.address})`);
};

module.exports.tags = ["mumbai-OfferProxy"];
