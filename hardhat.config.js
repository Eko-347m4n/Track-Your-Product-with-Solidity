require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.28"
      },
    ]
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: "https://worldchain-mainnet.g.alchemy.com/v2/St2ATFVcc8vVTVJ5VVG9MGEh1mZyLRbX", // bisa diganti RPC lain seperti Alchemy atau Infura
      accounts: [process.env.PRIVATE_KEY_PRODUSEN]
    }
  }
};
