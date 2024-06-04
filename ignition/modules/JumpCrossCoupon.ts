import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const JCCModule = buildModule("JCCModule", (m) => {
  const jcc = m.contract("JumpCrossCoupon", []);

  return { jcc };
});

export default JCCModule;
