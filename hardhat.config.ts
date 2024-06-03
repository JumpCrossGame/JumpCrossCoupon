import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import fs from "fs";

const rawdata = fs.readFileSync('env.json');
const env = JSON.parse(rawdata.toString());

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: [
        {
          privateKey: env.privateKey, 
          balance: "10000000000000000000", // 10 ether
        },
      ],
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${env.alchemyApiKey}`,
      accounts: [env.privateKey]
    }
  },
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "cancun"
    }
  },
  etherscan: {
    apiKey: env.etherscanApiKey
  }
};

export default config;
