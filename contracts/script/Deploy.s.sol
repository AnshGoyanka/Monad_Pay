// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PaymentPool.sol";

contract DeployPaymentPool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address relayerAddress = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        PaymentPool pool = new PaymentPool(relayerAddress);

        console.log("PaymentPool deployed at:", address(pool));
        console.log("Relayer address:", relayerAddress);

        vm.stopBroadcast();
    }
}
