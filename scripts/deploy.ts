import { ethers } from "hardhat";

interface DeploymentInfo {
  oceanTokenAddress: string;
  vaultAddress: string;
  simpleStrategyAddress: string;
  basketStrategyAddress: string;
  deployer: string;
  network: string;
}

async function main() {
  console.log("🚀 Starting deployment to localhost network...\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n"
  );

  // Step 1: Deploy OceanToken (ERC20 asset)
  console.log("🌊 Deploying OceanToken...");
  const OceanToken = await ethers.getContractFactory("OceanToken");
  const oceanToken = await OceanToken.deploy();
  await oceanToken.waitForDeployment();
  const oceanTokenAddress = await oceanToken.getAddress();
  console.log("✅ OceanToken deployed to:", oceanTokenAddress);
  console.log(
    "🪙 Initial supply:",
    ethers.formatEther(await oceanToken.totalSupply()),
    "OCT\n"
  );

  // Step 2: Deploy Vault (ERC4626)
  console.log("🏦 Deploying Vault...");
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(oceanTokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ Vault deployed to:", vaultAddress);
  console.log("📊 Vault name:", await vault.name());
  console.log("🎫 Vault symbol:", await vault.symbol(), "\n");

  // Step 3: Deploy SimpleStrategy
  console.log("📈 Deploying SimpleStrategy...");
  const SimpleStrategy = await ethers.getContractFactory("SimpleStrategy");
  const simpleStrategy = await SimpleStrategy.deploy(
    oceanTokenAddress,
    vaultAddress,
    deployer.address
  );
  await simpleStrategy.waitForDeployment();
  const simpleStrategyAddress = await simpleStrategy.getAddress();
  console.log("✅ SimpleStrategy deployed to:", simpleStrategyAddress, "\n");

  // Step 4: Deploy AIBasketStrategy
  // Note: For localhost, we'll use mock addresses for router and WETH
  // In a real deployment, these would be actual DEX router and WETH addresses
  const mockRouter = "0x0000000000000000000000000000000000000001"; // Mock router for localhost
  const mockWETH = "0x0000000000000000000000000000000000000002"; // Mock WETH for localhost

  console.log("🧺 Deploying AIBasketStrategy...");
  console.log("⚠️  Using mock addresses for router and WETH (localhost only)");
  const BasketStrategy = await ethers.getContractFactory("AIBasketStrategy");
  const basketStrategy = await BasketStrategy.deploy(
    oceanTokenAddress,
    vaultAddress,
    mockRouter,
    mockWETH,
    deployer.address
  );
  await basketStrategy.waitForDeployment();
  const basketStrategyAddress = await basketStrategy.getAddress();
  console.log("✅ AIBasketStrategy deployed to:", basketStrategyAddress, "\n");

  // Step 5: Set up vault manager (deployer as manager for localhost)
  console.log("👤 Setting up Vault manager...");
  const setManagerTx = await vault.setManager(deployer.address);
  await setManagerTx.wait();
  console.log("✅ Vault manager set to:", deployer.address, "\n");

  // Step 6: Set SimpleStrategy as default strategy (vault needs to be paused first)
  console.log("⏸️  Pausing vault to set strategy...");
  const pauseTx = await vault.pause();
  await pauseTx.wait();
  console.log("✅ Vault paused");

  console.log("🔗 Setting SimpleStrategy as vault strategy...");
  const setStrategyTx = await vault.setStrategy(simpleStrategyAddress);
  await setStrategyTx.wait();
  console.log("✅ SimpleStrategy set as vault strategy");

  console.log("▶️  Unpausing vault...");
  const unpauseTx = await vault.unpause();
  await unpauseTx.wait();
  console.log("✅ Vault unpaused\n");

  // Step 7: Transfer some tokens to the vault for testing
  console.log("💸 Transferring test tokens to deployer for testing...");
  const testAmount = ethers.parseEther("100000"); // 100,000 OCT
  console.log("🎁 Deployer already has initial OCT supply from deployment\n");

  // Step 8: Approve vault to spend tokens (for testing deposits)
  console.log("✅ Approving vault to spend OCT tokens...");
  const approveTx = await oceanToken.approve(
    vaultAddress,
    ethers.parseEther("50000")
  );
  await approveTx.wait();
  console.log("✅ Approved 50,000 OCT for vault spending\n");

  // Step 9: Display deployment summary
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(50));
  console.log("🌊 OceanToken (OCT):", oceanTokenAddress);
  console.log("🏦 Vault (vOCT):", vaultAddress);
  console.log("📈 SimpleStrategy:", simpleStrategyAddress);
  console.log("🧺 AIBasketStrategy:", basketStrategyAddress);
  console.log("👤 Deployer/Owner/Manager:", deployer.address);
  console.log("🌐 Network: localhost");
  console.log("═".repeat(50), "\n");

  // Step 10: Display testing instructions
  console.log("🧪 TESTING INSTRUCTIONS");
  console.log("═".repeat(50));
  console.log("1. Deposit OCT tokens to vault:");
  console.log("   vault.deposit(amount, receiverAddress)");
  console.log("");
  console.log("2. Invest vault funds into strategy:");
  console.log("   vault.manualInvest(amount)");
  console.log("");
  console.log("3. Withdraw funds from vault:");
  console.log("   vault.withdraw(amount, receiver, owner)");
  console.log("");
  console.log("4. Switch to AIBasketStrategy:");
  console.log("   - vault.pause()");
  console.log(`   - vault.setStrategy("${basketStrategyAddress}")`);
  console.log("   - vault.unpause()");
  console.log("═".repeat(50), "\n");

  // Step 11: Save deployment info for client/scripts
  const deploymentInfo: DeploymentInfo = {
    oceanTokenAddress,
    vaultAddress,
    simpleStrategyAddress,
    basketStrategyAddress,
    deployer: deployer.address,
    network: "localhost",
  };

  console.log("✨ Deployment completed successfully!");
  console.log(
    "🎯 All contracts are ready for interaction on localhost network"
  );

  return deploymentInfo;
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
